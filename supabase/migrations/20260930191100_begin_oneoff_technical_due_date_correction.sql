begin;
set local lock_timeout = '5s';

create function internal_academic.technical_manual_oneoff_due_date_candidate(
  p_receivable public.contas_receber,
  p_run internal_academic.technical_manual_cycle_runs,
  p_auth internal_academic.technical_manual_receivable_issuance_authorizations,
  p_transaction public.payment_gateway_transactions
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select coalesce(
    p_receivable.id = '22c59dbe-0d77-4c2f-8842-4327b1c17147'::uuid
    and p_receivable.matricula_id = '42998678-954a-400e-b8d6-780d99c8586d'::uuid
    and p_receivable.turma_id = '78fd9e65-de3a-4e00-8a99-6fe8804e1d42'::uuid
    and p_receivable.id = any(p_run.receivable_ids)
    and p_run.matricula_id = p_receivable.matricula_id
    and p_run.turma_id = p_receivable.turma_id
    and p_run.cycle_number = 1
    and p_run.request_id = '4c47d993-aa6e-403e-8569-e89ce543fa5a'::uuid
    and p_run.item_count = 12
    and p_run.state = 'LOCAL_CREATED'
    and p_auth.receivable_id = p_receivable.id
    and p_auth.matricula_id = p_run.matricula_id
    and p_auth.turma_id = p_run.turma_id
    and p_auth.cycle_number = p_run.cycle_number
    and p_auth.request_id = '35190871-1521-5acc-b39d-d22759309b75'::uuid
    and p_auth.authorized_by = p_run.created_by
    and p_auth.first_claimed_at is not null
    and p_auth.claim_count >= 1
    and p_auth.receivable_fingerprint =
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        p_receivable)
    and p_receivable.origem_cronograma_id = 'ciclo-1-parc-12'
    and p_receivable.tipo_lancamento = 'PARCELA'
    and p_receivable.parcela_numero = 12
    and p_receivable.data_vencimento = date '2027-10-15'
    and p_receivable.gateway_provider = 'banese_card'
    and p_receivable.gateway_environment = 'production'
    and p_receivable.gateway_payment_method = 'BOLETO'
    and p_receivable.forma_pagamento = 'BOLETO'
    and p_receivable.gateway_submission_channel = 'API'
    and p_receivable.gateway_submission_status = 'API_REGISTERED'
    and p_receivable.gateway_status = 'PENDING'
    and p_receivable.gateway_creation_token is null
    and p_receivable.gateway_cnab_file_id is null
    and p_receivable.gateway_boleto_issued_at is not null
    and p_receivable.gateway_financial_terms_confirmed_at is not null
    and coalesce(p_receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    and coalesce(p_receivable.gateway_boleto_convenio, '') ~ '^[0-9]+$'
    and coalesce(p_receivable.gateway_boleto_agencia, '') ~ '^[0-9]{3}$'
    and p_receivable.gateway_boleto_agencia <> '000'
    and upper(coalesce(p_receivable.status, '')) in ('PENDENTE', 'VENCIDO')
    and not internal_academic.technical_manual_banese_has_settlement_evidence(
      p_receivable)
    and internal_academic.technical_manual_banese_receivable_complete(p_receivable)
    and p_transaction.id = '340d0d1e-1171-41e9-95d2-b517b91bb450'::uuid
    and p_transaction.receivable_id = p_receivable.id
    and p_transaction.provider_code = 'banese_card'
    and p_transaction.environment = 'production'
    and p_transaction.payment_method = 'BOLETO'
    and p_transaction.origin_polo_id = p_receivable.polo_id
    and p_transaction.issuer_polo_id = p_receivable.gateway_issuer_polo_id
    and p_transaction.remote_payment_id = p_receivable.gateway_payment_id
    and p_transaction.remote_status = p_receivable.gateway_status
    and round(p_transaction.amount, 2) = round(p_receivable.valor, 2)
    and p_transaction.bank_slip_our_number =
      p_receivable.gateway_boleto_nosso_numero
    and p_transaction.bank_slip_digitable_line =
      p_receivable.gateway_boleto_linha_digitavel
    and p_transaction.bank_slip_barcode =
      p_receivable.gateway_boleto_codigo_barras
    and p_transaction.pix_payload = p_receivable.gateway_pix_payload
    and p_transaction.pix_encoded_image = p_receivable.gateway_pix_encoded_image
    and p_transaction.raw_payload->'manualCycleIssuance'->>'cycleRequestId' =
      p_run.request_id::text
    and exists (
      select 1
      from jsonb_array_elements(p_run.reviewed_items) item
      where item->>'chave' = 'ciclo-1-parc-12'
        and (item->>'vencimento')::date = date '2027-10-15'
        and item->>'tipo' = 'PARCELA'
        and (item->>'numero')::integer = 12
        and (item->>'valor')::numeric = p_receivable.valor)
    and exists (
      select 1
      from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      join public.cursos course on course.id = class.curso_id
      where enrollment.id = p_receivable.matricula_id
        and enrollment.aluno_id = p_receivable.cliente_id
        and class.id = p_receivable.turma_id
        and upper(coalesce(enrollment.status, '')) in ('ATIVO', 'PENDENTE')
        and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO'))
    and not internal_academic.is_technical_manual_cycle_protected(
      p_receivable.matricula_id)
    and coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BOLETO') <> 'LOCAL'
    and not internal_academic.manual_cycle_has_local_intent(p_receivable),
    false);
$function$;
revoke all on function
  internal_academic.technical_manual_oneoff_due_date_candidate(
    public.contas_receber,
    internal_academic.technical_manual_cycle_runs,
    internal_academic.technical_manual_receivable_issuance_authorizations,
    public.payment_gateway_transactions)
  from public, anon, authenticated, service_role;

create function public.begin_known_technical_manual_banese_due_date_correction_service(
  p_receivable_id uuid,
  p_correction_request_id uuid,
  p_expected_authorization_request_id uuid,
  p_expected_matricula_id uuid,
  p_expected_turma_id uuid,
  p_expected_cycle_number integer,
  p_expected_cycle_request_id uuid,
  p_expected_item_count integer,
  p_expected_item_key text,
  p_expected_due_date date,
  p_corrected_due_date date
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_overlay internal_academic.technical_manual_banese_due_date_overlay%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_archive internal_academic.technical_manual_banese_reissue_archive%rowtype;
  v_queue public.banese_reconciliation_queue%rowtype;
  v_replayed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à correção one-off de vencimento.'
      using errcode = '42501';
  end if;
  if p_receivable_id is distinct from '22c59dbe-0d77-4c2f-8842-4327b1c17147'::uuid
    or p_correction_request_id is distinct from '58ff2178-27f4-4994-9013-697fd935fd9f'::uuid
    or p_expected_authorization_request_id is distinct from '35190871-1521-5acc-b39d-d22759309b75'::uuid
    or p_expected_matricula_id is distinct from '42998678-954a-400e-b8d6-780d99c8586d'::uuid
    or p_expected_turma_id is distinct from '78fd9e65-de3a-4e00-8a99-6fe8804e1d42'::uuid
    or p_expected_cycle_number is distinct from 1
    or p_expected_cycle_request_id is distinct from '4c47d993-aa6e-403e-8569-e89ce543fa5a'::uuid
    or p_expected_item_count is distinct from 12
    or p_expected_item_key is distinct from 'ciclo-1-parc-12'
    or p_expected_due_date is distinct from date '2027-10-15'
    or p_corrected_due_date is distinct from date '2026-10-15'
  then
    raise exception 'Escopo divergente da correção one-off.' using errcode = '22023';
  end if;
  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform internal_academic.assert_technical_reissue_academic_access(
    p_receivable_id, p_expected_authorization_request_id,
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-banese:' || p_receivable_id::text, 0));

  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_expected_matricula_id
    and run.turma_id = p_expected_turma_id
    and run.cycle_number = p_expected_cycle_number
    and run.request_id = p_expected_cycle_request_id
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids)
  for update;
  select overlay.* into v_overlay
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  where overlay.correction_request_id = p_correction_request_id
  for update;
  select job.* into v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = p_receivable_id
  for update;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = p_expected_matricula_id
    and receivable.turma_id = p_expected_turma_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations authz
  where authz.receivable_id = p_receivable_id
    and authz.request_id = p_expected_authorization_request_id
  for update;
  select transaction.* into strict v_transaction
  from public.payment_gateway_transactions transaction
  where transaction.id = '340d0d1e-1171-41e9-95d2-b517b91bb450'::uuid
  for update;

  if v_overlay.correction_request_id is not null or v_job.id is not null then
    v_replayed := true;
    if v_overlay.correction_request_id is null or v_job.id is null
      or v_overlay.receivable_id is distinct from p_receivable_id
      or v_overlay.source_transaction_id is distinct from v_transaction.id
      or v_overlay.authorization_request_id is distinct from
        p_expected_authorization_request_id
      or v_job.recovery_request_id is distinct from
        p_expected_authorization_request_id
      or v_job.cycle_request_id is distinct from p_expected_cycle_request_id
      or v_job.expected_item_count is distinct from p_expected_item_count
    then
      raise exception 'Replay divergente da correção one-off.'
        using errcode = 'PT409';
    end if;
    if v_job.status = 'RESET_COMPLETE' then
      if v_receivable.data_vencimento is distinct from p_corrected_due_date
        or v_receivable.origem_cronograma_id is distinct from p_expected_item_key
        or v_transaction.receivable_id is not null
        or v_transaction.remote_status is distinct from 'CANCELED'
        or v_auth.receivable_fingerprint is distinct from
          internal_academic.technical_manual_receivable_issuance_fingerprint(
            v_receivable)
      then
        raise exception 'Estado terminal divergiu do overlay one-off.'
          using errcode = 'PT409';
      end if;
      return jsonb_build_object(
        'fenced', false, 'terminal', true, 'replayed', true,
        'status', v_job.status, 'receivableId', p_receivable_id,
        'correctionRequestId', p_correction_request_id,
        'correctedDueDate', p_corrected_due_date,
        'requiresNewNossoNumero', true);
    end if;
    if not internal_academic.technical_manual_oneoff_due_date_candidate(
        v_receivable, v_run, v_auth, v_transaction)
      or to_jsonb(v_receivable) is distinct from v_overlay.receivable_pre_snapshot
      or to_jsonb(v_transaction) is distinct from v_overlay.transaction_pre_snapshot
      or to_jsonb(v_auth) is distinct from v_overlay.authorization_pre_snapshot
      or v_job.canceled_nosso_numero is distinct from
        v_receivable.gateway_boleto_nosso_numero
      or v_job.expected_receivable_updated_at is distinct from
        v_receivable.updated_at
    then
      raise exception 'Título mudou depois da criação do overlay one-off.'
        using errcode = 'PT409';
    end if;
    if v_job.status not in ('FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED') then
      raise exception 'Estado do job one-off não permite retomada.'
        using errcode = 'PT409';
    elsif v_job.lease_valid_until > now() then
      raise exception 'Correção one-off ocupada por lease ativo.'
        using errcode = 'PT409';
    elsif v_job.status = 'CANCEL_INTENT'
      and v_job.cancel_mutation_intent_at > now() - interval '3 minutes'
    then
      raise exception 'Cooldown da baixa one-off ainda está ativo.'
        using errcode = 'PT409';
    end if;
    if v_job.status = 'CANCEL_CONFIRMED' then
      select archive.* into strict v_archive
      from internal_academic.technical_manual_banese_reissue_archive archive
      where archive.job_id = v_job.id
        and archive.receivable_id = p_receivable_id
        and archive.recovery_request_id = p_expected_authorization_request_id
        and archive.remote_cancel_situation_code = 5
        and archive.gateway_pre_snapshot = v_overlay.receivable_pre_snapshot
        and archive.financial_terms_snapshot =
          (v_overlay.receivable_pre_snapshot->'gateway_financial_terms');
    end if;
    select queue.* into strict v_queue
    from public.banese_reconciliation_queue queue
    where queue.receivable_id = p_receivable_id
      and queue.state = 'REPLACEMENT_FENCED'
    for update;
    update internal_academic.technical_manual_banese_reissue_jobs
    set lease_token = gen_random_uuid(),
        lease_valid_until = now() + interval '3 minutes', updated_at = now()
    where id = v_job.id returning * into v_job;
  else
    if exists (select 1
      from internal_academic.technical_manual_banese_reissue_archive archive
      where archive.receivable_id = p_receivable_id)
      or not internal_academic.technical_manual_oneoff_due_date_candidate(
        v_receivable, v_run, v_auth, v_transaction)
    then
      raise exception 'O título não é elegível à única correção autorizada.'
        using errcode = 'PT409';
    end if;
    select queue.* into strict v_queue
    from public.banese_reconciliation_queue queue
    where queue.receivable_id = p_receivable_id
      and queue.state = 'READY'
      and (queue.lease_until is null or queue.lease_until <= now())
    for update;
    insert into internal_academic.technical_manual_banese_due_date_overlay(
      correction_request_id, receivable_id, source_transaction_id,
      matricula_id, turma_id, cycle_number, cycle_request_id,
      expected_item_count, authorization_request_id, reviewed_item_key,
      original_due_date, corrected_due_date, original_actor_id,
      expected_receivable_updated_at, expected_transaction_updated_at,
      original_receivable_fingerprint, receivable_pre_snapshot,
      transaction_pre_snapshot, authorization_pre_snapshot, reason
    ) values (
      p_correction_request_id, p_receivable_id, v_transaction.id,
      v_run.matricula_id, v_run.turma_id, v_run.cycle_number, v_run.request_id,
      v_run.item_count, v_auth.request_id, p_expected_item_key,
      p_expected_due_date, p_corrected_due_date, v_run.created_by,
      v_receivable.updated_at, v_transaction.updated_at,
      v_auth.receivable_fingerprint, to_jsonb(v_receivable),
      to_jsonb(v_transaction), to_jsonb(v_auth),
      'CORRECAO_EXPLICITA_VENCIMENTO_2027_PARA_2026'
    ) returning * into v_overlay;
    insert into internal_academic.technical_manual_banese_reissue_jobs(
      receivable_id, matricula_id, turma_id, cycle_number, cycle_request_id,
      expected_item_count, recovery_request_id, original_actor_id,
      canceled_nosso_numero, convenio, agency, expected_amount,
      expected_due_date, receivable_fingerprint,
      expected_receivable_updated_at, lease_valid_until
    ) values (
      v_receivable.id, v_run.matricula_id, v_run.turma_id, v_run.cycle_number,
      v_run.request_id, v_run.item_count, v_auth.request_id, v_run.created_by,
      v_receivable.gateway_boleto_nosso_numero,
      v_receivable.gateway_boleto_convenio,
      v_receivable.gateway_boleto_agencia, round(v_receivable.valor, 2),
      v_receivable.data_vencimento, v_auth.receivable_fingerprint,
      v_receivable.updated_at, now() + interval '3 minutes'
    ) returning * into v_job;
    update public.banese_reconciliation_queue
    set state = 'REPLACEMENT_FENCED', next_check_at = null,
        lease_run_id = null, lease_until = null, updated_at = now()
    where receivable_id = p_receivable_id and state = 'READY';
    if not found then
      raise exception 'Fila mudou antes do fence one-off.' using errcode = 'PT409';
    end if;
    perform public.registrar_turma_financeiro_auditoria(
      v_run.matricula_id, 'CICLO_TECNICO_BANESE_DUE_DATE_CORRECTION_FENCED',
      jsonb_build_object(
        'mode', 'ONE_OFF_DUE_DATE_CORRECTION', 'jobId', v_job.id,
        'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
        'cycleRequestId', v_run.request_id,
        'correctionRequestId', p_correction_request_id,
        'authorizationRequestId', v_auth.request_id,
        'expectedDueDate', p_expected_due_date,
        'correctedDueDate', p_corrected_due_date),
      'Overlay imutável criado antes de qualquer baixa Banese.');
  end if;
  return jsonb_build_object(
    'fenced', true, 'terminal', false, 'replayed', v_replayed,
    'status', v_job.status, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token,
    'leaseValidUntil', v_job.lease_valid_until,
    'receivableId', v_job.receivable_id,
    'correctionRequestId', p_correction_request_id,
    'canceledNossoNumero', v_job.canceled_nosso_numero,
    'expectedDueDate', v_overlay.original_due_date,
    'correctedDueDate', v_overlay.corrected_due_date);
end;
$function$;

revoke all on function
  public.begin_known_technical_manual_banese_due_date_correction_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_known_technical_manual_banese_due_date_correction_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date)
  to service_role, postgres, supabase_admin;

notify pgrst, 'reload schema';
commit;
