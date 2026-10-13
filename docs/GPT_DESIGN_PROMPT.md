# Prompt to give GPT (paste this, then attach BLUEPRINT.md and the code zip)

You are a senior product designer and front-end designer. I have a working QR code generator SaaS called QRForge (Next.js 16, React 19, Tailwind CSS v4). The functionality is built and works, but the design is a bare, near-monochrome form with no brand. I need a complete UX/UI design that can be implemented in this exact codebase.

I'm attaching:
1. BLUEPRINT.md: the product, plans, routes, every screen and state, current design problems, constraints and data model.
2. A zip of the full codebase, including the components and pages that render each screen.

Read BLUEPRINT.md fully first, then open the code files it points to, and treat them as the source of truth for behaviour, copy and limits. Do not invent features that conflict with them.

## Audience and positioning
Small businesses, creators, restaurants, churches, events and freelancers in Nigeria who want a QR code for a link, WhatsApp, WiFi, a contact card or a menu. They pay in Naira through Paystack. Mobile-first: most will use a phone on mobile data, so pages must be light and the key actions reachable by thumb. The tone is friendly, trustworthy, plain English. It should feel like a modern, polished product and not a developer tool.

## What I want you to deliver

1. **Design direction** (one page): the concept, mood, 3 adjectives, and why it suits the audience. Propose one direction only and commit to it.
2. **Brand kit**: wordmark and logo mark idea for "QRForge", colour palette with exact hex values for light and dark mode (primary, accent, surface, border, text, success, warning, danger, and a Pro/Business tier colour), font pairing (Google Fonts only), type scale, spacing scale, radii, shadows and an icon set recommendation (for example Lucide).
3. **Component library spec**: buttons (primary, secondary, ghost, destructive, loading), inputs, textarea, select, checkbox, switch, slider, colour picker, file drop zone for the logo, type-picker chips/tabs, cards, modal, toast, skeleton, empty state, tier tags, usage meter, header and footer. Give every component its states (default, hover, focus, disabled, error).
4. **All screens** in BLUEPRINT.md section 5, including the ones in 5.7 that don't exist yet, at 1440, 768 and 390 widths, with empty, loading, error and success states:
   - Landing page (new, with hero, live mini-demo, how it works, QR type gallery, pricing teaser, FAQ, footer)
   - Generator (the most important screen: make it feel effortless, with a clear step flow such as 1 Type, 2 Content, 3 Style, 4 Download, and a preview that stays visible)
   - Pricing (with comparison table, auto-renew consent, Paystack trust signals, FAQ)
   - Login / sign up / forgot password / email confirmation
   - My codes (search, sort, usage meter, empty state)
   - Billing and payment result
   - Account, 404, 500, plan-expired, Terms and Privacy
   - Upgrade modal that appears when a free user hits a Pro feature
5. **Interaction and motion notes**: how gated features are shown (design this so users understand what's locked before they click), download feedback, save confirmation, delete confirmation, QR contrast warning when colours would hurt scanning.
6. **Accessibility**: WCAG AA contrast, focus rings, keyboard order, labels.
7. **Copy deck**: final text for every heading, button, empty state, error and toast. Keep the auto-renew consent meaning exactly as in the code.
8. **Implementation pack** so my developer (Claude Code) can build it:
   - Tailwind v4 theme tokens as CSS (`@theme` block) with light and dark values
   - High-fidelity HTML + Tailwind for each screen, or Figma-ready frames plus a spec for each
   - A file-by-file change list mapping each design to the existing files (for example `components/Generator.tsx`, `components/PricingGrid.tsx`, `app/layout.tsx`, `app/globals.css`) and listing any new components or routes needed

## Hard rules
- Keep all behaviour: live preview in the browser, downloads only through the server, limits from `lib/plans.ts`, the auto-renew consent, and Paystack redirect checkout.
- The generated QR code must remain scannable: keep a quiet zone, and warn when foreground/background contrast is too low.
- Stay within Tailwind CSS v4 utilities and CSS variables. No heavy UI frameworks. Keep the JavaScript light for mobile.
- Use real Naira prices: Free ₦0, Pro ₦3,500 per 30 days, Business ₦9,500 per 30 days.
- Ask me at most 3 clarifying questions, then produce the full deliverable. Don't ask for permission between sections.

Deliver in the order above and finish with the implementation pack.
