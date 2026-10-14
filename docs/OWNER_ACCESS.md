# Qrenuvi management access: operations runbook (restricted)

Audience: the Owner and whoever operates the deployment. Do not link this from the product or paste it into public tickets.

## How management sign-in works
- Staff sign in at `/admin/login` with **email and password**, then an **authenticator code** (TOTP). There is no Google sign-in and no registration for staff.
- Staff use their **own session** (cookie `qrf-staff-auth`, own inactivity clock `qrf-staff-active`, 20 minutes). Customer sessions, including Google, live in a different cookie and are never read by management pages or `/api/admin/*`.
- Every request re-checks, on the server: a valid staff session, that it was created by **password** sign-in (`amr` claim; OAuth, magic-link and recovery sessions are refused), that the account has an **active** `staff_members` row, **aal2** (second factor), then the role's capability and, for sensitive actions, a fresh sign-in (step-up).
- Logging out of staff access revokes only that staff session. A customer session in the same browser keeps working.
- The same sign-in provider and user table are used, so a staff member's customer account (for example a Google sign-in on the same email) is **not** modified by getting a staff password; the password is simply added.

## First Owner (one time)
Trusted configuration names exactly one Owner email: the Vercel environment variable `OWNER_BOOTSTRAP_EMAIL` (Production). Nothing else grants Owner: not a name, not a domain, not "first to sign in".
1. Open `/admin/login/forgot`, enter the Owner email, and use the link that arrives **in the same browser**. The page only sends a link while no staff exist yet and the email matches the variable (an invitation or an active staff row also qualifies other people later). The answer on screen is identical for every address.
2. Choose a password of 12+ characters. You are returned to `/admin/login`.
3. Sign in. Because no Owner exists yet and the email matches, a single button "Set up the Owner account" appears. It works once; the database refuses a second claim. It is audited (`staff.bootstrap_owner`).
4. Add the authenticator app when asked (QR code), enter the 6-digit code. Management opens.
5. Optional hardening: remove `OWNER_BOOTSTRAP_EMAIL` afterwards (Vercel, then redeploy). With an Owner present the variable has no effect, but removing it leaves nothing to misuse.

## Adding staff
Owner → Staff → invite by exact email and role. The invited person opens the invitation link, is taken to `/admin/login`, uses "Forgot password?" once to set a password, signs in, accepts, and enrols their authenticator.

## Lost authenticator or password
- Password: `/admin/login/forgot` (staff only; link expires).
- Authenticator: the Owner revokes and re-invites the person, or removes the factor in the Supabase dashboard (Authentication → Users → the user → factors). Do this only after verifying the person out of band. If the **Owner** loses the authenticator: remove the factor in the dashboard, then sign in and enrol again; a dashboard operator is the recovery path, so keep dashboard access secured.

## One-time project settings to confirm (Supabase dashboard; the app cannot read these)
- Authentication → URL configuration: the Redirect URLs list must allow `https://qrforge-henna.vercel.app/admin/auth/callback` (or `https://qrforge-henna.vercel.app/**`). If it does not, recovery emails land on the Site URL instead and the set-password step fails.
- Authentication → Multi-factor: TOTP enrolment and verification enabled.
- Authentication → Emails: the built-in sender is rate limited and meant for testing. Add a real SMTP provider before relying on recovery emails for staff.

## Failure states and what a person sees
| Situation | Screen |
|---|---|
| Wrong email or password, or a customer/unknown account | "Email or password is not correct." (identical for all) |
| Too many attempts | Wait message (per account and per address) |
| Staff without second step yet | "Confirm it's you" (nothing else is rendered) |
| Active staff, role lacks the screen | "No access" for that view only |
| Revoked staff | "Access ended" |
| Idle 20 minutes | Staff sign-in with "You were signed out", returns to the same admin page |
| Expired or foreign-browser recovery link | "Ask for a new link" |

## Rollback
Revert the merge commit for this change. The database is unchanged by it (no migration), so reverting restores the previous single-session behaviour.
