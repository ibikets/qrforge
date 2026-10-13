"use client";
import { Button, LinkButton } from "@/components/ui/Button";

// In this Next version the boundary receives `retry` (not `reset`).
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-[520px] px-5 py-16 text-center sm:py-24">
      <h1 className="mb-3 text-[28px] font-semibold sm:text-[32px]">We couldn’t load this page.</h1>
      <p className="mb-8 text-muted">Try again. Anything you hadn’t saved or downloaded may need to be entered again.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <LinkButton variant="secondary" href="/">Go to home</LinkButton>
      </div>
    </div>
  );
}
