import { adm } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { adminActions, fail } from "@/lib/admin/guard";
import { emailEnabled, sendEmail } from "@/lib/email";
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
    reason: false,
    limit: 20,
    async handler({ staff, body }) {
      const ticketId = uuid(body, "ticket");
      const messageId = uuid(body, "message");
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!emailEnabled()) throw fail(424, "Email sending is switched off on this deployment. Replies are only sent from the live site.");
      const db = adm();
      const t = must(await db.from("support_tickets").select("id,subject,customer_id").eq("id", ticketId).maybeSingle());
      if (!t) throw fail(404, "Ticket not found.");
      if (!t.customer_id) throw fail(422, "Link this ticket to a customer before sending a reply.");
      const cust = await db.auth.admin.getUserById(t.customer_id);
      const email = cust.data?.user?.email?.toLowerCase();
      if (!email) throw fail(422, "This customer has no email address on record.");
      if (to !== email) throw fail(422, "The recipient on screen is out of date. Reload and review it before sending.", "to");
      const m = must(await db.from("ticket_messages").select("id,ticket_id,kind,body,delivery,attempts").eq("id", messageId).eq("ticket_id", ticketId).maybeSingle());
      if (!m || m.kind !== "reply_draft") throw fail(409, m?.kind === "reply_sent" ? "This reply was already sent." : "Only a reply draft can be sent.");
      // Claim: one sender wins (compare-and-set on the attempt counter). A crash after claiming is safe to retry: the provider de-duplicates on the same key.
      const claimed = must(await db.from("ticket_messages").update({ delivery: "queued", to_email: email, sent_by: staff.userId, attempts: (m.attempts ?? 0) + 1, delivery_error: null })
        .eq("id", messageId).eq("kind", "reply_draft").eq("attempts", m.attempts ?? 0).select("id"));
      if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) throw fail(409, "Someone else is sending this reply right now. Reload to see its status.");
      const r = await sendEmail({ to: email, subject: `Re: ${t.subject}`.slice(0, 160), text: `${m.body}\n\n--\nQrenuvi Support\nReply to this email to reach us.`, idempotencyKey: `qrenuvi-reply-${messageId}` });
      if (r.ok) {
        must(await db.from("ticket_messages").update({ kind: "reply_sent", delivery: "sent", provider_id: r.id, sent_at: new Date().toISOString() }).eq("id", messageId).select("id"));
        return { data: { delivery: "sent" }, audit: { action: "ticket.reply_sent", targetType: "ticket", targetId: ticketId, after: { message: messageId, to: email } } };
      }
      await db.from("ticket_messages").update({ delivery: "failed", delivery_error: r.code }).eq("id", messageId);
      await writeAudit(staff, { reason: null, action: "ticket.reply_failed", targetType: "ticket", targetId: ticketId, after: { message: messageId, code: r.code } });
      const msg = { sender_not_verified: "The sending address is not verified with the email service yet, so nothing was sent.", rate_limited: "The email service is busy. Nothing was sent; try again shortly.", unreachable: "The email service could not be reached. Nothing was confirmed; check the status before retrying.", rejected: "The email service refused this message. Nothing was sent.", invalid: "The recipient or subject is not valid.", disabled: "Email sending is off." }[r.code];
      throw fail(r.code === "invalid" ? 422 : 502, msg);
    },
  },
});
