"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { formatNaira, PLANS, type PlanId } from "@/lib/plans";

type Quote = {
  id: string | null;
  plan: PlanId;
  baseKobo: number;
  savingKobo: number;
  payableKobo: number;
  renewalKobo: number;
  periodDays: number;
  offer: string | null;
};
const n = (kobo: number) => formatNaira(kobo / 100);
const NEXT = (plan: string) =>
  `/login?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`;

export default function CheckoutPanel({
  plan,
  email,
}: {
  plan: Exclude<PlanId, "free">;
  email: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "paying">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);
  const busy = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const fetchQuote = useCallback(
    async (
      offerCode?: string,
    ): Promise<{
      quote?: Quote;
      error?: string;
      kind?: "offer" | "other" | "auth";
    }> => {
      try {
        const res = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            code: offerCode || undefined,
            autoRenew,
          }),
        });
        if (res.status === 401) return { kind: "auth" };
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.quote) return { quote: json.quote as Quote };
        return {
          error:
            json.error ??
            "We couldn’t prepare your price. Nothing was charged. Try again.",
          kind: json.code === "offer_unavailable" ? "offer" : "other",
        };
      } catch {
        return {
          error:
            "We couldn’t reach checkout. Nothing was charged. Check your connection and try again.",
          kind: "other",
        };
      }
    },
    [plan, autoRenew],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await fetchQuote();
      if (!live) return;
      if (r.kind === "auth") return router.push(NEXT(plan));
      if (r.quote) {
        setQuote(r.quote);
        setState("ready");
      } else {
        setMessage(r.error ?? null);
        setState("error");
      }
    })();
    return () => {
      live = false;
    };
    // the first price is requested once; later changes go through apply/remove/pay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (applying || !code.trim()) {
      if (!code.trim()) {
        setCodeErr("Enter an offer code.");
        codeRef.current?.focus();
      }
      return;
    }
    setApplying(true);
    setCodeErr(null);
    const r = await fetchQuote(code.trim());
    setApplying(false);
    if (r.kind === "auth") return router.push(NEXT(plan));
    if (r.quote) {
      setQuote(r.quote);
      setApplied(code.trim().toUpperCase());
      setChanged(null);
      setCode("");
    } else {
      setCodeErr(r.error ?? null);
      codeRef.current?.focus();
    } // the typed code and the current total stay as they were
  }
  async function remove() {
    setApplying(true);
    setCodeErr(null);
    const r = await fetchQuote();
    setApplying(false);
    if (r.quote) {
      setQuote(r.quote);
      setApplied(null);
      setChanged(null);
    } else setCodeErr(r.error ?? null);
  }

  async function pay() {
    if (busy.current || !quote) return;
    busy.current = true;
    setState("paying");
    setMessage(null);
    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, autoRenew, quoteId: quote.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) return router.push(NEXT(plan));
      if (json.url) {
        window.location.href = json.url;
        return;
      } // full-page redirect; stay "paying" while the browser leaves
      if (json.code === "quote_changed") {
        const r = await fetchQuote(applied ?? undefined);
        if (r.quote) {
          setQuote(r.quote);
          setChanged(
            r.quote.payableKobo === quote.payableKobo
              ? "Your price was refreshed. Review the total, then pay."
              : "This offer changed. Review the updated total before paying.",
          );
          setState("ready");
          busy.current = false;
          return;
        }
      }
      setMessage(
        json.error ??
          "We couldn’t start checkout. Nothing was charged. Try again.",
      );
    } catch {
      setMessage(
        "We couldn’t reach checkout. Nothing was charged. Check your connection and try again.",
      );
    }
    busy.current = false;
    setState("ready");
  }

  if (state === "loading")
    return (
      <div
        role="status"
        aria-busy="true"
        className="h-64 rounded-panel bg-disabled"
      >
        <span className="sr-only">Preparing your price…</span>
      </div>
    );
  if (state === "error" || !quote)
    return (
      <div role="alert" className="rounded-panel bg-surface p-6">
        <h2 className="mb-2 text-xl font-medium">
          We couldn’t prepare your price
        </h2>
        <p className="mb-5 text-muted">
          {message ?? "Nothing was charged. Try again."}
        </p>
        <Button
          onClick={() => {
            setState("loading");
            fetchQuote().then((r) => {
              if (r.quote) {
                setQuote(r.quote);
                setState("ready");
              } else {
                setMessage(r.error ?? null);
                setState("error");
              }
            });
          }}
        >
          Try again
        </Button>
      </div>
    );

  const discounted = quote.savingKobo > 0;
  return (
    <div className="grid gap-8 min-[900px]:grid-cols-[1fr_380px]">
      <div>
        <section aria-labelledby="co-account" className="mb-8">
          <h2 id="co-account" className="mb-2 text-xl font-medium">
            Account
          </h2>
          <p className="text-muted">
            Paying as <strong className="text-ink">{email}</strong>
          </p>
        </section>

        <section aria-labelledby="co-offer" className="mb-8">
          <h2 id="co-offer" className="mb-2 text-xl font-medium">
            Offer code
          </h2>
          {applied ? (
            <p className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-soft px-3 py-2 font-medium text-brand">
                {applied} applied
              </span>
              <Button variant="ghost" onClick={remove} disabled={applying}>
                Remove code
              </Button>
            </p>
          ) : (
            <form
              onSubmit={apply}
              noValidate
              className="flex max-w-[440px] flex-wrap items-start gap-3"
            >
              <div className="min-w-0 flex-1">
                <label htmlFor="offer-code" className="sr-only">
                  Offer code
                </label>
                <input
                  id="offer-code"
                  ref={codeRef}
                  className={controlClass}
                  value={code}
                  maxLength={40}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Have a code?"
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeErr(null);
                  }}
                  aria-invalid={codeErr ? true : undefined}
                  aria-describedby={codeErr ? "offer-err" : undefined}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={applying}>
                {applying ? "Checking…" : "Apply"}
              </Button>
            </form>
          )}
          <div aria-live="polite">
            {codeErr ? (
              <p id="offer-err" className="mt-2 text-sm text-danger">
                {codeErr}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="co-renew" className="mb-6">
          <h2 id="co-renew" className="sr-only">
            Renewal
          </h2>
          <label className="flex items-start gap-3 rounded-panel bg-surface p-4">
            <input
              type="checkbox"
              className="mt-0.5 size-6 shrink-0"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
            />
            <span>
              <strong>Renew automatically every 30 days.</strong> I authorise
              Qrenuvi to charge the card I pay with at each renewal, at{" "}
              {n(quote.renewalKobo)}
              {discounted
                ? " (the offer applies to this first payment only)"
                : ""}
              . I can cancel anytime from Billing. (Card payments only.)
            </span>
          </label>
          <div role="status" aria-live="polite">
            {autoRenew ? (
              <Notice title="Card payments for auto-renewal">
                Turn renewal off to pay with other available methods.
              </Notice>
            ) : (
              <Notice title="One-off 30-day pass">
                Auto-renewal is off. You will choose from the available payment
                methods at checkout.
              </Notice>
            )}
          </div>
        </section>
      </div>

      <aside
        aria-labelledby="co-sum"
        className="h-fit rounded-panel bg-soft p-6"
      >
        <h2 id="co-sum" className="mb-4 text-xl font-medium">
          {PLANS[plan].name} · 30 days
        </h2>
        <div aria-live="polite">
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            <dt>
              {discounted ? "Normal price" : `${PLANS[plan].name}, 30 days`}
            </dt>
            <dd className="m-0 text-right">{n(quote.baseKobo)}</dd>
            {discounted ? (
              <>
                <dt className="text-brand">{quote.offer ?? "Offer"}</dt>
                <dd className="m-0 text-right text-brand">
                  −{n(quote.savingKobo)}
                </dd>
              </>
            ) : null}
            <dt className="border-t border-divider pt-2 font-semibold">
              Pay today
            </dt>
            <dd className="m-0 border-t border-divider pt-2 text-right text-xl font-semibold">
              {n(quote.payableKobo)}
            </dd>
          </dl>
          <p className="mt-4 text-sm text-muted">
            {discounted
              ? `${n(quote.payableKobo)} for the first 30 days. `
              : ""}
            {autoRenew
              ? `Then ${n(quote.renewalKobo)} / 30 days if you renew.`
              : `Your pass ends after 30 days. It will not renew.`}
          </p>
          {changed ? (
            <p role="alert" className="mt-3 text-sm font-medium text-warning">
              {changed}
            </p>
          ) : null}
        </div>
        <Button
          className="mt-5 w-full"
          onClick={pay}
          disabled={state === "paying"}
        >
          {state === "paying"
            ? "Opening payment…"
            : `Pay ${n(quote.payableKobo)}`}
        </Button>
        {message ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {message}
          </p>
        ) : null}
        <p className="mt-4 text-[13px] text-muted">
          Naira, processed by Paystack. Static QR codes: changing a saved code
          affects new downloads only; printed codes keep their content.
        </p>
      </aside>
    </div>
  );
}
