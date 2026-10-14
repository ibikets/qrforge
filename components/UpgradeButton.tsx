import { PLANS, type PlanId } from "@/lib/plans";
import { LinkButton } from "@/components/ui/Button";

/** Leads to checkout, which shows the exact total, any offer, and the renewal choice before anything is charged. */
export default function UpgradeButton({
  plan,
  signedIn,
  isCurrent,
  included,
}: {
  plan: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
  included: boolean;
}) {
  if (included)
    return <p className="text-sm text-muted">Included in your current plan.</p>;
  const target = `/checkout?plan=${plan}`;
  const href = signedIn ? target : `/login?next=${encodeURIComponent(target)}`;
  const label = isCurrent ? "Extend by 30 days" : `Choose ${PLANS[plan].name}`;
  return (
    <LinkButton href={href} className="w-full">
      {!signedIn ? `Sign in to choose ${PLANS[plan].name}` : label}
    </LinkButton>
  );
}
