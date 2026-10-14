-- Qrenuvi management portal: staff, audit, customer admin, plan versions, discounts/quotes, content, support, refunds.
-- Depends on 20261014000000_atomic_limits.sql (apply_payment, plan_limits). Apply in one transaction, after a backup.
-- Nothing here is readable by browsers: every table is RLS-on with no policies and no anon/authenticated grants;
-- only the server (service_role) touches them. Rollback: supabase/rollback/20261015000000_admin_portal.down.sql
begin;

-- ===== 1. Staff ============================================================================================
create table qrforge.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','support','billing','content_editor')),
  extra_grants text[] not null default '{}'
    check (extra_grants <@ array['content.publish','billing.adjust','billing.refund_request','plans.draft']::text[]),
  state text not null default 'active' check (state in ('active','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table qrforge.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner','support','billing','content_editor')),
  extra_grants text[] not null default '{}'
    check (extra_grants <@ array['content.publish','billing.adjust','billing.refund_request','plans.draft']::text[]),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- The last active Owner can neither be demoted, revoked nor deleted. Serialised so two concurrent changes cannot both pass.
create function qrforge.protect_last_owner() returns trigger language plpgsql as $$
declare v_left integer;
begin
  if tg_op = 'UPDATE' and not (old.role = 'owner' and old.state = 'active' and (new.role <> 'owner' or new.state <> 'active')) then
    return new;
  end if;
  if tg_op = 'DELETE' and not (old.role = 'owner' and old.state = 'active') then return old; end if;
  perform pg_advisory_xact_lock(hashtextextended('qrforge.owners', 0));
  select count(*) into v_left from qrforge.staff_members
    where role = 'owner' and state = 'active' and user_id <> old.user_id;
  if v_left = 0 then raise exception 'QF010: the last active Owner cannot be removed' using errcode = 'P0001'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger staff_last_owner before update or delete on qrforge.staff_members
  for each row execute function qrforge.protect_last_owner();

-- ===== 2. Audit: append-only ===============================================================================
create table qrforge.audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  before_state jsonb,   -- redacted by the application BEFORE it is written
  after_state jsonb,
  correlation_id text
);
create index audit_events_at_idx on qrforge.audit_events (at desc);
create index audit_events_actor_idx on qrforge.audit_events (actor_id, at desc);
create function qrforge.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'QF011: audit events are append-only' using errcode = 'P0001'; end $$;
create trigger audit_no_change before update or delete on qrforge.audit_events
  for each row execute function qrforge.audit_immutable();
create trigger audit_no_truncate before truncate on qrforge.audit_events
  for each statement execute function qrforge.audit_immutable();

-- ===== 3. Customers (contact details are separate from the provider-managed sign-in identity) ==============
create table qrforge.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  contact_email text check (char_length(contact_email) <= 254),
  status text not null default 'active' check (status in ('active','suspended')),
  status_reason text check (char_length(status_reason) <= 500),
  status_changed_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table qrforge.customer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_notes_user_idx on qrforge.customer_notes (user_id, created_at desc);

-- ===== 4. Plan versions (price and display copy; entitlements stay code-owned in plan_limits / lib/plans.ts) ==
create table qrforge.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('pro','business')),
  version integer not null,
  base_kobo integer not null check (base_kobo > 0),
  period_days integer not null default 30 check (period_days between 1 and 366),
  display jsonb not null default '{}'::jsonb check (octet_length(display::text) <= 4000),
  state text not null default 'draft' check (state in ('draft','published','archived')),
  effective_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan, version)
);
-- Once published, a version is history: only archiving is allowed.
create function qrforge.plan_version_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.state <> 'draft' then raise exception 'QF012: published plan versions cannot be deleted' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.state <> 'draft' and (new.base_kobo <> old.base_kobo or new.period_days <> old.period_days or new.display <> old.display
      or new.plan <> old.plan or new.version <> old.version or new.effective_at is distinct from old.effective_at) then
    raise exception 'QF012: a published plan version is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger plan_versions_guard before update or delete on qrforge.plan_versions
  for each row execute function qrforge.plan_version_guard();
insert into qrforge.plan_versions (plan, version, base_kobo, display, state, effective_at) values
  ('pro', 1, 350000, '{}', 'published', '2026-01-01'),
  ('business', 1, 950000, '{}', 'published', '2026-01-01');

-- ===== 5. Campaigns, quotes, redemptions ==================================================================
create table qrforge.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  internal_reason text check (char_length(internal_reason) <= 500),
  discount_kind text not null check (discount_kind in ('percent','fixed')),
  basis_points integer check (basis_points between 1 and 9999),
  fixed_kobo integer check (fixed_kobo > 0),
  plans text[] not null check (cardinality(plans) > 0 and plans <@ array['pro','business']::text[]),
  audience text not null default 'any' check (audience in ('any','new_paid')),
  delivery text not null default 'public' check (delivery in ('public','private','targeted')),
  code_hash text,
  banner_text text check (char_length(banner_text) <= 140),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  display_tz text not null default 'Africa/Lagos',
  total_limit integer check (total_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  priority integer not null default 0,
  state text not null default 'draft' check (state in ('draft','scheduled','active','paused','ended','archived')),
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((discount_kind = 'percent' and basis_points is not null and fixed_kobo is null)
      or (discount_kind = 'fixed' and fixed_kobo is not null and basis_points is null)),
  check (delivery <> 'private' or code_hash is not null)
);
create unique index campaigns_code_hash_key on qrforge.campaigns (code_hash) where code_hash is not null and state <> 'archived';
create table qrforge.campaign_targets (
  campaign_id uuid not null references qrforge.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (campaign_id, user_id)
);
-- Immutable snapshot written at publish: quotes and payments point at this, so editing a campaign never rewrites history.
create table qrforge.campaign_versions (
  campaign_id uuid not null references qrforge.campaigns(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (campaign_id, version)
);

create table qrforge.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro','business')),
  plan_version_id uuid not null references qrforge.plan_versions(id),
  campaign_id uuid references qrforge.campaigns(id),
  campaign_version integer,
  base_kobo integer not null check (base_kobo > 0),
  saving_kobo integer not null default 0 check (saving_kobo >= 0),
  payable_kobo integer not null check (payable_kobo > 0),
  renewal_kobo integer not null check (renewal_kobo > 0),
  period_days integer not null,
  auto_renew boolean not null,
  state text not null default 'open' check (state in ('open','initialised','paid','expired')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  reference text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (payable_kobo = base_kobo - saving_kobo)
);
create table qrforge.redemptions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references qrforge.quotes(id) on delete cascade,
  campaign_id uuid not null references qrforge.campaigns(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text,
  state text not null default 'reserved' check (state in ('reserved','consumed','released')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index redemptions_campaign_idx on qrforge.redemptions (campaign_id, state);
create index redemptions_user_idx on qrforge.redemptions (campaign_id, user_id, state);

alter table qrforge.payments
  add column if not exists quote_id uuid references qrforge.quotes(id),
  add column if not exists base_kobo integer,
  add column if not exists discount_kobo integer not null default 0,
  add column if not exists campaign_id uuid references qrforge.campaigns(id),
  add column if not exists campaign_version integer;
alter table qrforge.subscriptions add column if not exists renewal_kobo integer check (renewal_kobo > 0);

-- Quote: the server decides the price. Eligibility is evaluated here against the database, never from client input.
create function qrforge.issue_quote(p_user uuid, p_plan text, p_code_hash text, p_idem text, p_auto_renew boolean,
  p_ttl interval default interval '10 minutes')
returns qrforge.quotes language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_pv qrforge.plan_versions%rowtype;
  v_c qrforge.campaigns%rowtype;
  v_q qrforge.quotes%rowtype;
  v_saving bigint := 0;
  v_expires timestamptz;
begin
  select * into v_q from qrforge.quotes where user_id = p_user and idempotency_key = p_idem;
  if found then return v_q; end if;

  select * into v_pv from qrforge.plan_versions
    where plan = p_plan and state = 'published' and effective_at <= now() order by effective_at desc, version desc limit 1;
  if not found then raise exception 'QF020: no published price for this plan' using errcode = 'P0001'; end if;

  select c.* into v_c from qrforge.campaigns c
    where c.state = 'active' and now() >= c.starts_at and now() < c.ends_at and p_plan = any (c.plans)
      and ( (p_code_hash is null and (c.delivery = 'public' or (c.delivery = 'targeted' and c.code_hash is null)))
         or (p_code_hash is not null and c.code_hash = p_code_hash) )
      and (c.delivery <> 'targeted' or exists (select 1 from qrforge.campaign_targets t where t.campaign_id = c.id and t.user_id = p_user))
      and (c.audience <> 'new_paid' or not exists (select 1 from qrforge.payments pay where pay.user_id = p_user and pay.status = 'success'))
      and (select count(*) from qrforge.redemptions r where r.campaign_id = c.id and r.user_id = p_user and r.state in ('reserved','consumed')) < c.per_customer_limit
      and (c.total_limit is null or (select count(*) from qrforge.redemptions r where r.campaign_id = c.id and r.state in ('reserved','consumed')) < c.total_limit)
    order by c.priority desc, c.created_at, c.id limit 1;

  if p_code_hash is not null and not found then raise exception 'QF021: offer unavailable' using errcode = 'P0001'; end if;

  if found then
    -- integer arithmetic only: round half up on basis points
    v_saving := case when v_c.discount_kind = 'percent' then (v_pv.base_kobo::bigint * v_c.basis_points + 5000) / 10000 else v_c.fixed_kobo end;
    if v_saving <= 0 or v_saving >= v_pv.base_kobo then
      if p_code_hash is not null then raise exception 'QF021: offer unavailable' using errcode = 'P0001'; end if;
      v_c := null; v_saving := 0;
    end if;
  end if;

  v_expires := now() + p_ttl;
  if v_c.id is not null and v_c.ends_at < v_expires then v_expires := v_c.ends_at; end if;

  insert into qrforge.quotes (user_id, plan, plan_version_id, campaign_id, campaign_version, base_kobo, saving_kobo, payable_kobo,
      renewal_kobo, period_days, auto_renew, idempotency_key, expires_at)
    values (p_user, p_plan, v_pv.id, v_c.id, case when v_c.id is null then null else v_c.version end, v_pv.base_kobo, v_saving,
      v_pv.base_kobo - v_saving, v_pv.base_kobo, v_pv.period_days, coalesce(p_auto_renew, true), p_idem, v_expires)
    returning * into v_q;
  return v_q;
end $$;

-- Reserve the redemption and bind the quote to a payment reference. Capacity is checked under a per-campaign lock,
-- so two buyers racing for the last slot cannot both succeed. Calling again for the same quote and reference is a no-op.
create function qrforge.reserve_redemption(p_quote uuid, p_reference text) returns text
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_q qrforge.quotes%rowtype;
  v_c qrforge.campaigns%rowtype;
begin
  select * into v_q from qrforge.quotes where id = p_quote for update;
  if not found then return 'unavailable'; end if;
  if v_q.state in ('initialised','paid') then return case when v_q.reference = p_reference then 'ok' else 'not_open' end; end if;
  if v_q.state <> 'open' then return 'not_open'; end if;
  if v_q.expires_at <= now() then update qrforge.quotes set state = 'expired' where id = v_q.id; return 'quote_expired'; end if;

  if v_q.campaign_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('qrforge.campaign:' || v_q.campaign_id::text, 0));
    select * into v_c from qrforge.campaigns where id = v_q.campaign_id;
    if v_c.state <> 'active' or now() >= v_c.ends_at then return 'unavailable'; end if;
    if (select count(*) from qrforge.redemptions r where r.campaign_id = v_c.id and r.user_id = v_q.user_id and r.state in ('reserved','consumed')) >= v_c.per_customer_limit
      then return 'unavailable'; end if;
    if v_c.total_limit is not null
       and (select count(*) from qrforge.redemptions r where r.campaign_id = v_c.id and r.state in ('reserved','consumed')) >= v_c.total_limit
      then return 'sold_out'; end if;
    insert into qrforge.redemptions (quote_id, campaign_id, user_id, reference, expires_at)
      values (v_q.id, v_c.id, v_q.user_id, p_reference, now() + interval '24 hours');
  end if;
  update qrforge.quotes set state = 'initialised', reference = p_reference where id = v_q.id;
  return 'ok';
end $$;

-- Apply a verified quoted payment. The amount must equal the quote exactly. Idempotent: a repeated or concurrent event for
-- the same reference changes nothing the second time. A late-but-valid payment is honoured even if the offer has since ended.
create function qrforge.apply_quoted_payment(p_reference text, p_amount integer, p_authorization_code text, p_customer_email text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_q qrforge.quotes%rowtype;
  v_end timestamptz;
begin
  select * into v_q from qrforge.quotes where reference = p_reference for update;
  if not found then raise exception 'QF022: unknown quote reference' using errcode = 'P0001'; end if;
  if v_q.payable_kobo <> p_amount then raise exception 'QF023: amount does not match the quote' using errcode = 'P0001'; end if;
  v_end := qrforge.apply_payment(p_reference, v_q.user_id, v_q.plan, p_amount, p_authorization_code, p_customer_email, v_q.auto_renew, v_q.period_days);
  update qrforge.payments set quote_id = v_q.id, base_kobo = v_q.base_kobo, discount_kobo = v_q.saving_kobo,
      campaign_id = v_q.campaign_id, campaign_version = v_q.campaign_version
    where reference = p_reference and quote_id is null;
  if v_q.campaign_id is not null then
    insert into qrforge.redemptions (quote_id, campaign_id, user_id, reference, state, expires_at, consumed_at)
      values (v_q.id, v_q.campaign_id, v_q.user_id, p_reference, 'consumed', now(), now())
      on conflict (quote_id) do update set state = 'consumed', consumed_at = coalesce(qrforge.redemptions.consumed_at, now());
  end if;
  if v_q.state <> 'paid' then
    update qrforge.quotes set state = 'paid' where id = v_q.id;
    update qrforge.subscriptions set renewal_kobo = v_q.renewal_kobo where user_id = v_q.user_id;
  end if;
  return v_end;
end $$;

-- Free slots held by checkouts that were never paid. Allowlisted maintenance job.
create function qrforge.release_expired_reservations() returns integer
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_n integer;
begin
  update qrforge.redemptions r set state = 'released'
    where r.state = 'reserved' and r.expires_at < now()
      and exists (select 1 from qrforge.quotes q where q.id = r.quote_id and q.state <> 'paid');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ===== 6. Refund requests and entitlement adjustments (journals; neither fabricates a payment) ===============
create table qrforge.refund_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null references qrforge.payments(reference),
  amount_kobo integer not null check (amount_kobo > 0),
  reason text not null check (char_length(reason) between 5 and 500),
  state text not null default 'requested' check (state in ('requested','approved','declined','executed','failed')),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text check (char_length(decision_reason) <= 500),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 80),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create table qrforge.entitlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('extend_days','set_plan')),
  previous jsonb not null,
  next jsonb not null,
  reason text not null check (char_length(reason) between 5 and 500),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create function qrforge.adjust_entitlement(p_user uuid, p_kind text, p_days integer, p_plan text, p_reason text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_cur qrforge.subscriptions%rowtype;
  v_prev jsonb; v_next jsonb; v_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('qrforge.pay:' || p_user::text, 0));
  select * into v_cur from qrforge.subscriptions where user_id = p_user for update;
  v_prev := jsonb_build_object('plan', coalesce(v_cur.plan, 'free'), 'current_period_end', v_cur.current_period_end);
  if p_kind = 'extend_days' then
    if p_days is null or p_days < 1 or p_days > 90 then raise exception 'QF030: extension must be 1 to 90 days' using errcode = 'P0001'; end if;
    if not found then raise exception 'QF031: customer has no paid plan to extend' using errcode = 'P0001'; end if;
    v_end := greatest(v_cur.current_period_end, now()) + make_interval(days => p_days);
    update qrforge.subscriptions set current_period_end = v_end, updated_at = now() where user_id = p_user;
  elsif p_kind = 'set_plan' then
    if p_plan not in ('pro','business') or not found then raise exception 'QF032: set_plan needs an existing paid plan and a paid target' using errcode = 'P0001'; end if;
    update qrforge.subscriptions set plan = p_plan, updated_at = now() where user_id = p_user;
    v_end := v_cur.current_period_end;
  else raise exception 'QF033: unknown adjustment' using errcode = 'P0001';
  end if;
  v_next := jsonb_build_object('plan', coalesce(case when p_kind = 'set_plan' then p_plan end, v_cur.plan), 'current_period_end', v_end);
  insert into qrforge.entitlement_adjustments (user_id, kind, previous, next, reason, actor_id) values (p_user, p_kind, v_prev, v_next, p_reason, p_actor);
  return jsonb_build_object('previous', v_prev, 'next', v_next);
end $$;

-- ===== 7. Landing content: draft, revisions, published pointer ==============================================
create table qrforge.content_drafts (
  page text primary key check (page in ('landing')),
  data jsonb not null check (octet_length(data::text) <= 60000),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table qrforge.content_revisions (
  id bigint generated always as identity primary key,
  page text not null,
  data jsonb not null,
  author_id uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table qrforge.content_published (
  page text primary key,
  revision_id bigint not null references qrforge.content_revisions(id),
  published_at timestamptz not null default now()
);
-- Compare-and-set: succeeds only when the caller saw the latest version; otherwise the caller must reload (conflict).
create function qrforge.save_content_draft(p_page text, p_expected integer, p_data jsonb, p_actor uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_v integer;
begin
  if p_expected = 0 then
    insert into qrforge.content_drafts (page, data, updated_by) values (p_page, p_data, p_actor) on conflict do nothing returning version into v_v;
  else
    update qrforge.content_drafts set data = p_data, version = version + 1, updated_by = p_actor, updated_at = now()
      where page = p_page and version = p_expected returning version into v_v;
  end if;
  if v_v is null then raise exception 'QF040: content changed since you opened it' using errcode = 'P0001'; end if;
  return v_v;
end $$;
create function qrforge.publish_content(p_page text, p_expected integer, p_actor uuid) returns bigint
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_d qrforge.content_drafts%rowtype; v_rev bigint;
begin
  select * into v_d from qrforge.content_drafts where page = p_page for update;
  if not found or v_d.version <> p_expected then raise exception 'QF040: content changed since you opened it' using errcode = 'P0001'; end if;
  insert into qrforge.content_revisions (page, data, author_id, published_by) values (p_page, v_d.data, v_d.updated_by, p_actor) returning id into v_rev;
  insert into qrforge.content_published (page, revision_id) values (p_page, v_rev)
    on conflict (page) do update set revision_id = excluded.revision_id, published_at = now();
  return v_rev;
end $$;

-- ===== 8. Support ============================================================================================
create table qrforge.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 140),
  state text not null default 'open' check (state in ('open','pending','resolved')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table qrforge.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references qrforge.support_tickets(id) on delete cascade,
  kind text not null check (kind in ('internal_note','reply_draft','customer')),
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket_idx on qrforge.ticket_messages (ticket_id, created_at);

-- ===== 9. Safe display settings (links only; secrets never live here) =======================================
create table qrforge.app_settings (
  key text primary key check (key in ('support_email','support_url','terms_url','privacy_url','refund_policy_url','company_url')),
  value text not null check (char_length(value) between 3 and 300),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Owner bootstrap: succeeds only while NO staff exist at all. The application additionally requires the caller to be the
-- verified identity named in OWNER_BOOTSTRAP_EMAIL; this function is the race-proof second lock.
create function qrforge.bootstrap_owner(p_user uuid, p_email text) returns boolean
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('qrforge.owners', 0));
  if exists (select 1 from qrforge.staff_members) then return false; end if;
  insert into qrforge.staff_members (user_id, email, role) values (p_user, lower(p_email), 'owner');
  return true;
end $$;

-- Accept a staff invitation. The signed-in account's verified email must equal the invited email; one use only; expires.
create function qrforge.accept_invite(p_token_hash text, p_user uuid, p_email text) returns text
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_i qrforge.staff_invites%rowtype;
begin
  select * into v_i from qrforge.staff_invites where token_hash = p_token_hash for update;
  if not found then return 'invalid'; end if;
  if v_i.revoked_at is not null then return 'revoked'; end if;
  if v_i.accepted_at is not null then return 'used'; end if;
  if v_i.expires_at <= now() then return 'expired'; end if;
  if v_i.email <> lower(p_email) then return 'wrong_account'; end if;
  insert into qrforge.staff_members as m (user_id, email, role, extra_grants, state, invited_by)
    values (p_user, lower(p_email), v_i.role, v_i.extra_grants, 'active', v_i.invited_by)
    on conflict (user_id) do update set role = excluded.role, extra_grants = excluded.extra_grants, state = 'active',
      invited_by = excluded.invited_by, version = m.version + 1, updated_at = now();
  update qrforge.staff_invites set accepted_at = now(), accepted_by = p_user where id = v_i.id;
  return 'ok';
end $$;

-- ===== 9b. Read models for the portal (server only). No payloads, authorization codes or secrets are returned. =====
create function qrforge.list_customers(p_q text, p_status text, p_limit integer, p_offset integer)
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, plan text,
  current_period_end timestamptz, auto_renew boolean, status text, total bigint)
language sql stable security definer set search_path = pg_catalog, qrforge as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         case when s.current_period_end > now() then s.plan else 'free' end,
         s.current_period_end, s.auto_renew,
         case when u.banned_until is not null and u.banned_until > now() then 'suspended' else coalesce(p.status, 'active') end,
         count(*) over ()
  from auth.users u
  left join qrforge.subscriptions s on s.user_id = u.id
  left join qrforge.customer_profiles p on p.user_id = u.id
  where (p_q is null or p_q = '' or position(lower(p_q) in lower(u.email)) > 0)
    and (p_status is null or p_status = '' or
         (case when u.banned_until is not null and u.banned_until > now() then 'suspended' else coalesce(p.status, 'active') end) = p_status
         or (p_status in ('free','pro','business') and (case when s.current_period_end > now() then s.plan else 'free' end) = p_status))
  order by u.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

create function qrforge.stats_summary(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = pg_catalog, qrforge as $$
  select jsonb_build_object(
    'customers_total', (select count(*) from auth.users),
    'customers_new', (select count(*) from auth.users where created_at >= p_from and created_at < p_to),
    'paid_accounts_active', (select count(*) from qrforge.subscriptions where current_period_end > now()),
    'payments_confirmed', (select count(*) from qrforge.payments where status = 'success' and created_at >= p_from and created_at < p_to),
    'gross_kobo', (select coalesce(sum(amount_kobo), 0) from qrforge.payments where status = 'success' and created_at >= p_from and created_at < p_to),
    'discount_kobo', (select coalesce(sum(discount_kobo), 0) from qrforge.payments where status = 'success' and created_at >= p_from and created_at < p_to),
    'redemptions_consumed', (select count(*) from qrforge.redemptions where state = 'consumed' and consumed_at >= p_from and consumed_at < p_to),
    'refund_requests_open', (select count(*) from qrforge.refund_requests where state = 'requested'),
    'refunds_executed_kobo', (select coalesce(sum(amount_kobo), 0) from qrforge.refund_requests where state = 'executed' and decided_at >= p_from and decided_at < p_to),
    'saved_codes_total', (select count(*) from qrforge.qr_codes),
    'tickets_open', (select count(*) from qrforge.support_tickets where state <> 'resolved'),
    'drafts_unpublished', (select count(*) from qrforge.content_drafts d left join qrforge.content_published cp on cp.page = d.page
        left join qrforge.content_revisions r on r.id = cp.revision_id where r.data is distinct from d.data)
  )
$$;
create function qrforge.payments_by_day(p_from timestamptz, p_to timestamptz)
returns table (day date, payments bigint, gross_kobo bigint, discount_kobo bigint)
language sql stable security definer set search_path = pg_catalog, qrforge as $$
  select (created_at at time zone 'Africa/Lagos')::date, count(*), sum(amount_kobo)::bigint, coalesce(sum(discount_kobo), 0)::bigint
  from qrforge.payments where status = 'success' and created_at >= p_from and created_at < p_to group by 1 order by 1
$$;

-- ===== 10. Access: server only ===============================================================================
do $$
declare t text;
begin
  foreach t in array array['staff_members','staff_invites','audit_events','customer_profiles','customer_notes','plan_versions','campaigns',
      'campaign_targets','campaign_versions','quotes','redemptions','refund_requests','entitlement_adjustments','content_drafts',
      'content_revisions','content_published','support_tickets','ticket_messages','app_settings']
  loop
    execute format('alter table qrforge.%I enable row level security', t);
    execute format('revoke all on qrforge.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on qrforge.%I to service_role', t);
  end loop;
end $$;
-- Even the server cannot rewrite or remove the audit trail.
revoke update, delete, truncate on qrforge.audit_events from service_role;
revoke all on function qrforge.list_customers(text, text, integer, integer) from public, anon, authenticated;
revoke all on function qrforge.stats_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function qrforge.payments_by_day(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function qrforge.list_customers(text, text, integer, integer) to service_role;
grant execute on function qrforge.stats_summary(timestamptz, timestamptz) to service_role;
grant execute on function qrforge.payments_by_day(timestamptz, timestamptz) to service_role;
revoke all on function qrforge.bootstrap_owner(uuid, text) from public, anon, authenticated;
revoke all on function qrforge.accept_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function qrforge.bootstrap_owner(uuid, text) to service_role;
grant execute on function qrforge.accept_invite(text, uuid, text) to service_role;
revoke all on function qrforge.issue_quote(uuid, text, text, text, boolean, interval) from public, anon, authenticated;
revoke all on function qrforge.reserve_redemption(uuid, text) from public, anon, authenticated;
revoke all on function qrforge.apply_quoted_payment(text, integer, text, text) from public, anon, authenticated;
revoke all on function qrforge.release_expired_reservations() from public, anon, authenticated;
revoke all on function qrforge.adjust_entitlement(uuid, text, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function qrforge.save_content_draft(text, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function qrforge.publish_content(text, integer, uuid) from public, anon, authenticated;
grant execute on function qrforge.issue_quote(uuid, text, text, text, boolean, interval) to service_role;
grant execute on function qrforge.reserve_redemption(uuid, text) to service_role;
grant execute on function qrforge.apply_quoted_payment(text, integer, text, text) to service_role;
grant execute on function qrforge.release_expired_reservations() to service_role;
grant execute on function qrforge.adjust_entitlement(uuid, text, integer, text, text, uuid) to service_role;
grant execute on function qrforge.save_content_draft(text, integer, jsonb, uuid) to service_role;
grant execute on function qrforge.publish_content(text, integer, uuid) to service_role;

commit;
