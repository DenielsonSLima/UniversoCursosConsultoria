-- Run only via MCP Supabase after the migration. No bank/Edge call is made.
-- Existing authorized fixture; every deliberate divergence is rolled back.
-- No new cycle is created and full row snapshots must remain identical.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  v_authorization_request uuid;
  v_attempt uuid := gen_random_uuid();
  v_row public.contas_receber%rowtype;
  v_original_receivable jsonb;
  v_original_authorization jsonb;
  v_actor uuid;
  v_candidate record;
  v_function regprocedure;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
    'public.mark_technical_manual_cycle_banese_failure(uuid,uuid,uuid,boolean,boolean,text,text)',
    'public.persist_technical_manual_cycle_banese_issuance(uuid,uuid,uuid,jsonb)',
    'public.claim_technical_manual_cycle_banese_reconciliation(uuid,uuid,uuid)',
    'internal_academic.guard_manual_technical_receivable_first_bank_claim()'
  ] loop
    v_function := v_signature::regprocedure;
    if pg_get_functiondef(v_function) ~*
      'using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001'''
    then
      raise exception 'Business validation still requests transaction retry: %',
        v_signature;
    end if;
  end loop;

  -- The former fixture required an eligible enrollment without a run. That
  -- population can legitimately be empty after cycles are issued. Reuse an
  -- existing legacy authorization with no active claim and preserve all data.
  for v_candidate in
    select c.id, c.polo_id, a.authorized_by
    from internal_academic.technical_manual_cycle_runs r
    join public.contas_receber c on c.id = any(r.receivable_ids)
    join public.matriculas m on m.id = r.matricula_id
    join internal_academic.technical_manual_receivable_issuance_authorizations a
      on a.receivable_id = c.id
    where r.state = 'LOCAL_CREATED' and r.reviewed_items is null
      and upper(c.status) in ('PENDENTE', 'VENCIDO')
      and upper(m.status) in ('ATIVO', 'PENDENTE')
      and c.gateway_creation_token is null
      and not internal_academic.is_technical_manual_cycle_protected(m.id)
      and not internal_academic.manual_cycle_has_local_intent(c)
      and exists (select 1 from public.usuarios_sistema u
        where u.auth_user_id = a.authorized_by
          and public.is_active_status(u.status))
    order by c.id
  loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'authenticated', 'sub', v_candidate.authorized_by)::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if public.gestor_has_financeiro_tab('receber')
      and public.is_gestor_for_polo(v_candidate.polo_id)
    then
      v_actor := v_candidate.authorized_by;
      select * into strict v_row from public.contas_receber
        where id = v_candidate.id for update;
      exit;
    end if;
  end loop;
  if v_actor is null then
    raise exception 'Existing authorized fixture unavailable; run read-only preflight';
  end if;
  v_original_receivable := to_jsonb(v_row);
  select a.request_id, to_jsonb(a)
    into strict v_authorization_request, v_original_authorization
  from internal_academic.technical_manual_receivable_issuance_authorizations a
  where a.receivable_id = v_row.id for update;

  -- Replay mismatch must terminate, retaining the original rejection.
  begin
    update internal_academic.technical_manual_receivable_issuance_authorizations
      set receivable_fingerprint = repeat('0', 64)
      where receivable_id = v_row.id;
    perform public.authorize_technical_manual_receivable_issuance_secure(
      v_row.id, v_authorization_request);
    raise exception 'Incompatible replay was accepted';
  exception when sqlstate 'PT422' then
    if sqlerrm <> 'Replay de autorização incompatível.' then raise; end if;
  end;

  -- The trigger must reject a stale authorization before any claim is stored.
  begin
    update internal_academic.technical_manual_receivable_issuance_authorizations
      set receivable_fingerprint = repeat('0', 64)
      where receivable_id = v_row.id;
    update public.contas_receber set gateway_creation_token = v_attempt
      where id = v_row.id;
    raise exception 'Stale authorization accepted a first bank claim';
  exception when sqlstate 'PT422' then
    if sqlerrm <> 'A autorização não corresponde mais ao recebível.' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    update internal_academic.technical_manual_receivable_issuance_authorizations
      set receivable_fingerprint = repeat('0', 64)
      where receivable_id = v_row.id;
    perform public.mark_technical_manual_cycle_banese_failure(
      v_row.id, v_authorization_request, v_attempt,
      false, false, 'CONTRACT_TEST', 'Incompatible authorization');
    raise exception 'Failure mutation accepted an incompatible authorization';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'Autorização da tentativa com falha divergiu.' then raise; end if;
  end;
  begin
    update internal_academic.technical_manual_receivable_issuance_authorizations
      set receivable_fingerprint = repeat('0', 64)
      where receivable_id = v_row.id;
    perform public.persist_technical_manual_cycle_banese_issuance(
      v_row.id, v_authorization_request, v_attempt, '{}'::jsonb);
    raise exception 'Persistence accepted an incompatible authorization';
  exception when sqlstate 'PT422' then
    if sqlerrm <> 'Autorização ou fingerprint do recebível divergiu.' then raise; end if;
  end;

  if v_original_receivable is distinct from (
    select to_jsonb(c) from public.contas_receber c where c.id = v_row.id
  ) or v_original_authorization is distinct from (
    select to_jsonb(a)
    from internal_academic.technical_manual_receivable_issuance_authorizations a
    where a.receivable_id = v_row.id
  ) then
    raise exception 'A rejected attempt altered the original row snapshots';
  end if;
end;
$test$;
select 'manual_cycle_validation_rejections_passed' as result,
  4 as rejection_paths, true as original_snapshots_preserved;
rollback;
