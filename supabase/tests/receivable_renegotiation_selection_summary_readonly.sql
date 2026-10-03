-- Gate pós-migration: sem fixtures, dados pessoais, dívida ou efeito bancário.
begin read only;
do $test$
declare
  v_public regprocedure := to_regprocedure(
    'public.summarize_receivable_renegotiation_selection_secure(uuid[],date)');
  v_helper regprocedure := to_regprocedure(
    'internal_finance.receivable_renegotiation_punctual_discount(public.contas_receber,jsonb,date)');
  v_source text;
begin
  assert v_public is not null and v_helper is not null;
  assert (select prosecdef and provolatile = 's' and 'search_path=""' = any(proconfig)
    from pg_proc where oid = v_public);
  assert (select not prosecdef and provolatile = 's' and 'search_path=""' = any(proconfig)
    from pg_proc where oid = v_helper);
  assert has_function_privilege('authenticated', v_public, 'EXECUTE');
  assert has_function_privilege('service_role', v_public, 'EXECUTE');
  assert not has_function_privilege('anon', v_public, 'EXECUTE');
  assert not has_function_privilege('authenticated', v_helper, 'EXECUTE');
  assert not has_function_privilege('service_role', v_helper, 'EXECUTE');
  assert not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) acl
    where p.oid in (v_public, v_helper) and acl.grantee = 0);
  select prosrc into v_source from pg_proc where oid = v_public;
  assert position('assert_receivable_renegotiation_identity()' in v_source)
    < position('from public.contas_receber' in v_source), 'Autorização deve preceder leitura';
  assert position('receivable_renegotiation_source_item(v_row.id, v_as_of)' in v_source) > 0;
  assert to_regprocedure('public.banese_next_national_banking_day(date)') is not null;
  assert public.banese_next_national_banking_day('2026-09-06') = '2026-09-08';
  assert public.banese_next_national_banking_day('2027-01-02') is null;
end;
$test$;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure('{}'::uuid[], null);
    raise exception 'Identidade ausente acessou RPC';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
select jsonb_build_object('status', 'PASS', 'checks',
  jsonb_build_array('catalog', 'grants', 'auth-before-data', 'canonical-calendar', 'no-identity-denied'),
  'businessDataWritten', false, 'bankCalls', false,
  'transactionReadOnly', current_setting('transaction_read_only')) as selection_summary_release;
rollback;
