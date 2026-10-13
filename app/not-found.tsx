import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[520px] px-5 py-16 text-center sm:py-24">
      <h1 className="mb-3 text-[28px] font-semibold sm:text-[32px]">We couldn’t find that page.</h1>
      <p className="mb-8 text-muted">The link may have changed. Your saved codes are still in My codes.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <LinkButton href="/create">Create a code</LinkButton>
        <LinkButton variant="secondary" href="/codes">My codes</LinkButton>
      </div>
    </div>
  );
}
