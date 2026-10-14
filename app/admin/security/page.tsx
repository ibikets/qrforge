import Link from "next/link";
import {
  Badge,
  Denied,
  KV,
  PageHead,
  Panel,
  lagos,
  linkCls,
} from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import {
  CAP_LABEL,
  CAPS,
  ROLE_LABEL,
  STEP_UP,
  STEP_UP_MAX_AGE_MS,
} from "@/lib/admin/permissions";

const nowMs = () => Date.now(); // read per request (this page is dynamic)

export default async function Security() {
  const s = await currentStaff();
  if (s.status !== "ok") return <Denied />;
  const { staff } = s;
  const fresh = nowMs() - staff.signedInAt <= STEP_UP_MAX_AGE_MS;
  return (
    <>
      <PageHead
        title="Security"
        lead="Your management access and sign-in strength."
      />
      <Panel title="Your access">
        <KV
          items={[
            ["Email", staff.email],
            ["Role", ROLE_LABEL[staff.role]],
            [
              "Second step",
              <Badge key="m" tone="good">
                Confirmed for this session
              </Badge>,
            ],
            ["Last sign-in", lagos(new Date(staff.signedInAt).toISOString())],
            [
              "Recent sign-in",
              fresh ? (
                <Badge key="f" tone="good">
                  Fresh: sensitive actions allowed
                </Badge>
              ) : (
                <Badge key="f" tone="warn">
                  Older than 15 minutes
                </Badge>
              ),
            ],
          ]}
        />
        {!fresh ? (
          <p className="mt-4 text-sm">
            Sensitive actions (publishing, suspending, staff changes) ask you to
            sign in again.{" "}
            <Link href="/login?next=/admin/security" className={linkCls}>
              Sign in again
            </Link>
          </p>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          Management signs you out after 20 minutes without activity.
        </p>
      </Panel>
      <Panel title="What you can do">
        <ul className="m-0 grid list-none gap-2 p-0">
          {CAPS.filter((c) => staff.caps.has(c)).map((c) => (
            <li key={c}>
              {CAP_LABEL[c]}
              {STEP_UP.has(c) ? (
                <span className="text-[13px] text-muted">
                  {" "}
                  · needs a recent sign-in
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
