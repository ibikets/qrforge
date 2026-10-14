import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { must, oneOf } from "@/lib/admin/validate";
import { JOBS } from "@/lib/admin/consts";

export const POST = adminActions({
  preview: {
    cap: "releases.manage",
    reason: false,
    async handler({ body }) {
      oneOf(body, "job", JOBS, "Job");
      const { count, error } = await adm().from("redemptions").select("id", { count: "exact", head: true }).eq("state", "reserved").lt("expires_at", new Date().toISOString());
      if (error) throw error;
      return { data: { affected: count ?? 0 } };
    },
  },
  run: {
    cap: "releases.manage",
    limit: 10,
    async handler({ body }) {
      const job = oneOf(body, "job", JOBS, "Job");
      const released = must(await adm().rpc("release_expired_reservations"));
      return { data: { job, released, status: "completed" }, audit: { action: "maintenance.run", targetType: "job", targetId: job, after: { released } } };
    },
  },
  promote: {
    cap: "releases.manage",
    async handler() {
      throw fail(424, "Promotion is not available yet. It needs a Vercel access token granted to the portal and an approved build list.");
    },
  },
  rollback: {
    cap: "releases.manage",
    async handler() {
      throw fail(424, "Rollback is not available yet. It needs a Vercel access token granted to the portal and an approved build list.");
    },
  },
});
