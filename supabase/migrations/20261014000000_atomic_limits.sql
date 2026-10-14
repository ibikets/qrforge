-- QRForge: database-enforced entitlements and atomic payment application.
-- Apply in one transaction (Supabase `apply_migration` does this). Rollback: supabase/rollback/20261014000000_atomic_limits.down.sql
-- Safe ordering: the app falls back to its previous behaviour if this is not yet applied, so migrate first, then deploy.
begin;

-- 1. Plan capabilities, readable only by the server. Must match lib/plans.ts (a test in the repo compares them).
create table if not exists qrforge.plan_limits (
  plan text primary key,
  max_saved integer not null check (max_saved >= 0),
  all_types boolean not null,
  logo boolean not null,
  max_size integer not null
);
insert into qrforge.plan_limits (plan, max_saved, all_types, logo, max_size) values
  ('free', 3, false, false, 512),
  ('pro', 100, true, true, 2048),
  ('business', 1000, true, true, 4096)
on conflict (plan) do update set max_saved = excluded.max_saved, all_types = excluded.all_types,
  logo = excluded.logo, max_size = excluded.max_size;
alter table qrforge.plan_limits enable row level security;   -- no policies: invisible to anon/authenticated
revoke all on qrforge.plan_limits from anon, authenticated;
grant select on qrforge.plan_limits to service_role;

-- 2. Row-shape constraints (stop oversized rows written straight through the data API).
alter table qrforge.qr_codes drop constraint if exists qr_codes_type_check;
alter table qrforge.qr_codes add constraint qr_codes_type_check
  check (type in ('url','text','email','phone','sms','whatsapp','wifi','vcard'));
alter table qrforge.qr_codes drop constraint if exists qr_codes_fields_size;
alter table qrforge.qr_codes add constraint qr_codes_fields_size check (octet_length(fields::text) <= 20000);
alter table qrforge.qr_codes drop constraint if exists qr_codes_style_size;
alter table qrforge.qr_codes add constraint qr_codes_style_size check (octet_length(style::text) <= 160000);
alter table qrforge.qr_codes drop constraint if exists qr_codes_json_objects;
alter table qrforge.qr_codes add constraint qr_codes_json_objects
  check (jsonb_typeof(fields) = 'object' and jsonb_typeof(style) = 'object');

-- 3. Users may change only what the editor changes: never user_id or id.
revoke update on qrforge.qr_codes from authenticated;
grant update (name, type, fields, style, updated_at) on qrforge.qr_codes to authenticated;

-- 4. Entitlements enforced where the data lives, so EVERY write path is covered:
--    the app API, the Supabase data API with a user's own token, SQL console edits by non-superusers.
--    Concurrency: a per-user transaction-scoped advisory lock serialises inserts for one user. Under READ COMMITTED
--    (the PostgREST default) the count that follows the lock takes a fresh snapshot, so it sees every earlier
--    insert that committed while this one waited. Inserts for different users do not block each other.
create or replace function qrforge.enforce_code_entitlements() returns trigger
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_plan text;
  v_lim qrforge.plan_limits%rowtype;
  v_count integer;
  v_size numeric;
begin
  if TG_OP = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('qrforge.codes:' || NEW.user_id::text, 0));
  end if;

  select s.plan into v_plan from qrforge.subscriptions s
    where s.user_id = NEW.user_id and s.current_period_end > now();
  select * into v_lim from qrforge.plan_limits where plan = coalesce(v_plan, 'free');

  if TG_OP = 'INSERT' then
    select count(*) into v_count from qrforge.qr_codes where user_id = NEW.user_id;
    if v_count >= v_lim.max_saved then
      raise exception 'saved-code limit reached for plan %', coalesce(v_plan, 'free')
        using errcode = 'QF001', hint = 'limit=' || v_lim.max_saved;
    end if;
  end if;

  if not v_lim.all_types and NEW.type not in ('url','text','email') then
    raise exception 'type % needs a paid plan', NEW.type using errcode = 'QF002';
  end if;
  if not v_lim.logo and coalesce(NEW.style->>'logo', '') <> '' then
    raise exception 'logo needs a paid plan' using errcode = 'QF003';
  end if;
  begin
    v_size := (NEW.style->>'size')::numeric;
  exception when others then
    v_size := null;
  end;
  if v_size is not null and v_size > v_lim.max_size then
    raise exception 'size above plan maximum' using errcode = 'QF004';
  end if;
  return NEW;
end $$;
revoke all on function qrforge.enforce_code_entitlements() from public, anon, authenticated;

drop trigger if exists qr_codes_entitlements on qrforge.qr_codes;
create trigger qr_codes_entitlements before insert or update on qrforge.qr_codes
  for each row execute function qrforge.enforce_code_entitlements();

-- 5. Apply a verified payment atomically: payment row and subscription change commit together or not at all,
--    and concurrent payments for one user are serialised so no purchased days are lost.
create or replace function qrforge.apply_payment(
  p_reference text, p_user uuid, p_plan text, p_amount integer,
  p_authorization_code text, p_customer_email text, p_auto_renew boolean, p_days integer default 30
) returns timestamptz
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare
  v_rows integer;
  v_end timestamptz;
  v_cur qrforge.subscriptions%rowtype;
  v_plan text := p_plan;
begin
  if p_plan not in ('pro','business') then raise exception 'invalid plan' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('qrforge.pay:' || p_user::text, 0));

  insert into qrforge.payments (reference, user_id, plan, amount_kobo, status)
    values (p_reference, p_user, p_plan, p_amount, 'success')
    on conflict (reference) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- already applied; payment and subscription were committed together
    select current_period_end into v_end from qrforge.subscriptions where user_id = p_user;
    return v_end;
  end if;

  select * into v_cur from qrforge.subscriptions where user_id = p_user for update;
  v_end := greatest(coalesce(v_cur.current_period_end, now()), now()) + make_interval(days => p_days);
  -- a payment for a lower plan never downgrades a higher plan that is still active
  if v_cur.current_period_end > now() and v_cur.plan = 'business' and p_plan = 'pro' then v_plan := 'business'; end if;

  insert into qrforge.subscriptions as s (user_id, plan, current_period_end, paystack_reference, authorization_code,
      customer_email, auto_renew, failed_attempts, updated_at)
    values (p_user, v_plan, v_end, p_reference, p_authorization_code, p_customer_email, coalesce(p_auto_renew, true), 0, now())
    on conflict (user_id) do update set
      plan = excluded.plan,
      current_period_end = excluded.current_period_end,
      paystack_reference = excluded.paystack_reference,
      authorization_code = coalesce(excluded.authorization_code, s.authorization_code),
      customer_email = coalesce(excluded.customer_email, s.customer_email),
      auto_renew = case when p_auto_renew is null then s.auto_renew else p_auto_renew end,
      failed_attempts = 0,
      updated_at = now();
  return v_end;
end $$;
revoke all on function qrforge.apply_payment(text, uuid, text, integer, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function qrforge.apply_payment(text, uuid, text, integer, text, text, boolean, integer) to service_role;

commit;
