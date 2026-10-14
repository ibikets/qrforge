# Blinq benchmark and Qrenuvi opportunity (14 October 2026)

Purpose: a benchmark, not a template. Qrenuvi keeps its own identity (Working Desk / Forest, Naira passes, "Built by Bitzpark Limited").

## Sources read (accessed 14 Oct 2026)
| Source | Date shown on page | Used for |
|---|---|---|
| [blinq.me/pricing](https://blinq.me/pricing) | none shown | plans, prices, feature lists |
| [Digital business card](https://blinq.me/solutions/digital-business-card) | none shown (2026 notices) | sharing methods, integrations, team features |
| [Creating your first Blinq card](https://support.blinq.me/en/articles/68007-creating-your-first-blinq-card) | 14 Jul 2026 | card fields at setup |
| [Saving a Blinq card to your mobile contacts](https://support.blinq.me/en/articles/68044-saving-a-blinq-card-to-your-mobile-contacts) | 10 Aug 2026 | how recipients save a card |
| [How to choose a digital business card](https://blinq.me/blog/how-to-choose-a-digital-business-card) | 23 Jul 2026 | vendor's own criteria (marketing content, not neutral) |
| [Apple developer forum thread on X-SOCIALPROFILE import](https://developer.apple.com/forums/thread/822738) | none shown | contact-app compatibility (a question, unanswered) |

Limits: Blinq's help centre root (help.blinq.me) disallows automated reading, so I used the articles above. Blinq's pricing page contradicts itself in places (for example custom reporting and admin templates appear under Free in one table and not in the plan lists). Currency is "$" with no code. I did not test the Blinq product.

## What Blinq verifiably offers
- Plans: Free $0 (two cards); Premium $9.99/month or $7.33/month billed annually; Business $6.99 per user per month or $4.99 annually, minimum five cards at signup; Enterprise custom; lead capture $9.99 per lead.
- A hosted card the recipient opens from a QR code, link, NFC tap, Apple or Google Wallet pass, widget or email signature; recipients do not need an app; the card can be edited and the change shows immediately.
- Branding: card colours, fonts, logo, branded QR codes, field locking.
- Team: admin platform, bulk and automatic card creation, templates, SSO and SCIM on higher plans, SOC 2 Type II stated.
- Integrations: native CRM integrations (20+ stated), Zapier and API, Outlook contact sync, lead capture and enrichment, analytics.
- Recipients on Android save through a downloaded .vcf; on iPhone through a save-contact flow.
- Not verified: how many phone numbers or emails one card can hold (the setup guide does not say; the pricing page says "unlimited contact fields").

## Three different products
| Kind | What it is | Qrenuvi today |
|---|---|---|
| Static QR | the data is inside the code; cannot change after printing; no hosting | **Yes** (8 types, PNG/SVG/PDF, logo, saved drafts) |
| Dynamic QR | the code holds a short link to a redirect you control; destination editable; scans can be counted | No |
| Hosted digital profile | a web page per person/business with Save Contact, links, branding, wallet pass | No |
A vCard QR is static: all details live inside the code, so every extra field makes the code denser. That is why this release limits each group to five rows and reports when a card no longer fits.

## Where Qrenuvi competes, and where it does not
- Competes: free no-account QR creation; contact (vCard) codes with multiple phones, emails, websites and social links; logo and colour styling; Naira pricing through Paystack with optional renewal (Blinq's prices are in "$"); a management portal with audit trail, discounts and staff roles.
- Does not (yet): hosted profile, dynamic redirects, scan analytics, wallet passes, NFC, team workspaces and templates, CRM integrations, lead capture.

## Is there a credible opportunity? (assessment, not evidence of demand)
Assumptions, all unvalidated: (1) individuals and small businesses in Nigeria want contact and link sharing priced and billed in Naira; (2) many would pay a small 30-day pass without a card subscription; (3) a hosted card page is the feature that turns a one-time QR task into recurring value. I found no data in this session that proves any of these, and I am not estimating revenue. Realistic positioning: a local-currency, simple, design-led alternative for individuals and small teams, not a head-on rival to Blinq's enterprise features. Validate before building much: ask 10 to 15 target customers (sales staff, small agencies, event vendors) what they currently use, and test willingness to pay with the existing checkout.

## Three next features, ranked (judgement labels)
| # | Feature | Customer benefit | Effort | Revenue potential | Why |
|---|---|---|---|---|---|
| 1 | Hosted contact card page with Save Contact (.vcf), editable after sharing, QR points to it | High | Medium | High (recurring: the page must stay live) | removes the density limit, makes edits reach printed codes, and is the clearest reason to renew |
| 2 | Dynamic redirect QR with simple, privacy-reviewed scan counts | High for menus, flyers, events | Medium | Medium to high | same recurring logic; needs anti-abuse (phishing) checks and a fair grace period when a plan ends |
| 3 | Small team workspace: shared brand template, several cards, one bill | Medium to high | High | High per account, later | builds on features 1 and 2 and the existing staff/billing foundations |
Shared prerequisites for 1 and 2: privacy and takedown policy for public personal data, abuse reporting, rate limits, and your real Terms and Privacy text.

## Compatibility notes for the contact fields built now
- Repeated TEL, EMAIL and URL properties are standard in vCard 3.0 ([RFC 2426](https://www.rfc-editor.org/rfc/rfc2426)); the encoder keeps VERSION:3.0 and escapes commas, semicolons and newlines in text values.
- Social profiles are written as plain URL properties. X-SOCIALPROFILE is not used because an Apple developer thread reports iOS does not keep it on .vcf import (unconfirmed by Apple); plain URLs are read by every contacts app, but labels such as "Instagram" are not carried.
- Not tested on physical phones or in Apple/Google Contacts: that import check is owner-run (scan the code, tap Add Contact, confirm each number, email and link appears). An independent vCard parser (Python `vobject`) reads the generated cards correctly.
