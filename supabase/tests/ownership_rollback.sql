-- Cross-user ownership check for the REAL database. Paste into the Supabase SQL editor and run.
-- It creates two throw-away users, exercises row-level security as each role, then ALWAYS rolls back by raising an exception;
-- the result is printed in the error message ("ROLLBACK_RESULT {...}"). Nothing is kept. No real customer rows are read or changed.
-- Expected on the current schema: B_* counts all 0, all "denied:*" entries denied, anon denied, authorization_code/customer_email denied.
-- BEFORE migration 20261014000000: A_direct_inserts_accepted_beyond_free_limit_of_3 = 5 and A_insert_1MB_fields = ALLOWED (known gap).
-- AFTER the migration: A_direct_inserts... = 0 or limited (user A has a Pro subscription in this test, so inserts up to 100 pass) and
-- A_insert_1MB_fields = denied:23514.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; n int; code_a uuid; ok_count int := 0; i int;
begin
  insert into auth.users(id, email) values (a, 'rls-test-a@invalid.test'), (b, 'rls-test-b@invalid.test');
  insert into qrforge.subscriptions(user_id, plan, current_period_end, authorization_code, customer_email)
    values (a, 'pro', now() + interval '10 days', 'AUTH_TESTONLY', 'rls-test-a@invalid.test');
  insert into qrforge.payments(reference, user_id, plan, amount_kobo, status) values ('rls_test_ref_a', a, 'pro', 350000, 'success');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  insert into qrforge.qr_codes(user_id, name, type, fields, style) values (a, 'A code', 'url', '{"url":"https://a.test"}', '{}') returning id into code_a;
  res := res || jsonb_build_object('A_insert_own', 'ok');
  select count(*) into n from qrforge.qr_codes; res := res || jsonb_build_object('A_sees_own_rows', n);
  begin perform authorization_code from qrforge.subscriptions; res := res || jsonb_build_object('A_read_authorization_code', 'ALLOWED'); exception when others then res := res || jsonb_build_object('A_read_authorization_code', 'denied:' || sqlstate); end;
  begin perform customer_email from qrforge.subscriptions; res := res || jsonb_build_object('A_read_customer_email', 'ALLOWED'); exception when others then res := res || jsonb_build_object('A_read_customer_email', 'denied:' || sqlstate); end;
  begin insert into qrforge.subscriptions(user_id, plan, current_period_end) values (b, 'business', now() + interval '1 year'); res := res || jsonb_build_object('A_insert_subscription', 'ALLOWED'); exception when others then res := res || jsonb_build_object('A_insert_subscription', 'denied:' || sqlstate); end;
  begin update qrforge.subscriptions set plan = 'business' where user_id = a; get diagnostics n = row_count; res := res || jsonb_build_object('A_update_own_subscription', case when n = 0 then 'denied:0rows' else 'ALLOWED' end); exception when others then res := res || jsonb_build_object('A_update_own_subscription', 'denied:' || sqlstate); end;
  begin insert into qrforge.payments(reference, user_id, plan, amount_kobo, status) values ('rls_forged', a, 'business', 1, 'success'); res := res || jsonb_build_object('A_insert_payment', 'ALLOWED'); exception when others then res := res || jsonb_build_object('A_insert_payment', 'denied:' || sqlstate); end;
  begin update qrforge.qr_codes set user_id = b where id = code_a; get diagnostics n = row_count; res := res || jsonb_build_object('A_reassign_code_to_B', case when n = 0 then 'denied:0rows' else 'ALLOWED' end); exception when others then res := res || jsonb_build_object('A_reassign_code_to_B', 'denied:' || sqlstate); end;
  for i in 1..5 loop
    begin insert into qrforge.qr_codes(user_id, name, type, fields, style) values (a, 'bulk ' || i, 'vcard', '{}', '{}'); ok_count := ok_count + 1; exception when others then null; end;
  end loop;
  res := res || jsonb_build_object('A_direct_inserts_accepted', ok_count);
  begin insert into qrforge.qr_codes(user_id, name, type, fields, style) values (a, 'huge', 'text', jsonb_build_object('text', repeat('x', 1000000)), '{}'); res := res || jsonb_build_object('A_insert_1MB_fields', 'ALLOWED'); exception when others then res := res || jsonb_build_object('A_insert_1MB_fields', 'denied:' || sqlstate); end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  select count(*) into n from qrforge.qr_codes where id = code_a; res := res || jsonb_build_object('B_reads_A_code', n);
  update qrforge.qr_codes set name = 'pwned' where id = code_a; get diagnostics n = row_count; res := res || jsonb_build_object('B_updates_A_code_rows', n);
  delete from qrforge.qr_codes where id = code_a; get diagnostics n = row_count; res := res || jsonb_build_object('B_deletes_A_code_rows', n);
  begin insert into qrforge.qr_codes(user_id, name, type) values (a, 'planted', 'url'); res := res || jsonb_build_object('B_inserts_row_owned_by_A', 'ALLOWED'); exception when others then res := res || jsonb_build_object('B_inserts_row_owned_by_A', 'denied:' || sqlstate); end;
  select count(*) into n from qrforge.subscriptions; res := res || jsonb_build_object('B_sees_A_subscription_rows', n);
  select count(*) into n from qrforge.payments; res := res || jsonb_build_object('B_sees_A_payment_rows', n);

  reset role;
  set local role anon;
  begin perform 1 from qrforge.qr_codes limit 1; res := res || jsonb_build_object('anon_select_qr_codes', 'ALLOWED'); exception when others then res := res || jsonb_build_object('anon_select_qr_codes', 'denied:' || sqlstate); end;
  begin perform 1 from qrforge.subscriptions limit 1; res := res || jsonb_build_object('anon_select_subscriptions', 'ALLOWED'); exception when others then res := res || jsonb_build_object('anon_select_subscriptions', 'denied:' || sqlstate); end;
  reset role;
  raise exception 'ROLLBACK_RESULT %', res::text;
end $$;
