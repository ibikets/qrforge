import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { int, must, oneOf, str, uuid } from "@/lib/admin/validate";

export const POST = adminActions({
  create_ticket: {
    cap: "support.manage",
    reason: false,
    async handler({ staff, body }) {
      const subject = str(body, "subject", { min: 3, max: 140, label: "Subject" });
      const first = str(body, "note", { max: 4000, optional: true, label: "Note" });
      const who = typeof body.customer_email === "string" ? body.customer_email.trim().toLowerCase() : "";
      const db = adm();
      let customer: string | null = null;
      if (who) {
        const rows = must(await db.rpc("list_customers", { p_q: who, p_status: null, p_limit: 5, p_offset: 0 })) as { user_id: string; email: string }[];
        const hit = rows.find((r) => r.email.toLowerCase() === who);
        if (!hit) throw fail(422, "No customer has that email address.", "customer_email");
        customer = hit.user_id;
      }
      const t = must(await db.from("support_tickets").insert({ subject, customer_id: customer, created_by: staff.userId }).select("id").single());
      if (first) must(await db.from("ticket_messages").insert({ ticket_id: t.id, kind: "internal_note", body: first, author_id: staff.userId }).select("id").single());
      return { status: 201, data: { id: t.id }, audit: { action: "ticket.created", targetType: "ticket", targetId: t.id } };
    },
  },
  add_message: {
    cap: "support.manage",
    reason: false,
    async handler({ staff, body }) {
      const ticket = uuid(body, "ticket");
      const kind = oneOf(body, "kind", ["internal_note", "reply_draft"] as const, "Type");
      const text = str(body, "message", { max: 4000, label: "Message" });
      must(await adm().from("ticket_messages").insert({ ticket_id: ticket, kind, body: text, author_id: staff.userId }).select("id").single());
      return { status: 201, audit: { action: kind === "internal_note" ? "ticket.note_added" : "ticket.reply_drafted", targetType: "ticket", targetId: ticket } };
    },
  },
  update: {
    cap: "support.manage",
    reason: false,
    async handler({ body }) {
      const ticket = uuid(body, "ticket");
      const state = oneOf(body, "state", ["open", "pending", "resolved"] as const, "Status");
      const priority = oneOf(body, "priority", ["low", "normal", "high"] as const, "Priority");
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      let assigned: string | null = null;
      if (typeof body.assigned_to === "string" && body.assigned_to) {
        assigned = uuid(body, "assigned_to");
        const m = must(await adm().from("staff_members").select("user_id").eq("user_id", assigned).eq("state", "active").maybeSingle());
        if (!m) throw fail(422, "Choose an active staff member.", "assigned_to");
      }
      const r = must(await adm().from("support_tickets").update({ state, priority, assigned_to: assigned, version: expected + 1, updated_at: new Date().toISOString() }).eq("id", ticket).eq("version", expected).select("id").maybeSingle());
      if (!r) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      return { audit: { action: "ticket.updated", targetType: "ticket", targetId: ticket, after: { state, priority, assigned_to: assigned } } };
    },
  },
  send_reply: {
    cap: "support.manage",
    async handler() {
      throw fail(424, "Sending replies is not available yet. It needs a verified sending address and delivery status from an email service.");
    },
  },
});
