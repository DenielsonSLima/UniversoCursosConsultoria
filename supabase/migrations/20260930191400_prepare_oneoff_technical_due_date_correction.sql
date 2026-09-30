begin;
set local lock_timeout = '5s';

create function public.prepare_known_technical_manual_banese_due_date_correction_service(
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
  p_corrected_due_date date,
  p_lease_token uuid,
  p_confirmed_remote_status text,
  p_confirmed_situation_code integer,
  p_confirmed_at timestamptz,
  p_cancel_fingerprint text,
  p_already_canceled boolean,
  p_mutation_attempted boolean
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_after public.contas_receber%rowtype;
  v_projected public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_transaction_after public.payment_gateway_transactions%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_overlay internal_academic.technical_manual_banese_due_date_overlay%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_archive internal_academic.technical_manual_banese_reissue_archive%rowtype;
  v_queue public.banese_reconciliation_queue%rowtype;
  v_corrected_terms jsonb;
  v_now timestamptz := clock_timestamp();
  v_previous_job text := current_setting(
    'app.technical_manual_banese_reissue_job_id', true);
  v_previous_request text := current_setting(
    'app.technical_manual_banese_reissue_request_id', true);
  v_previous_lease text := current_setting(
    'app.technical_manual_banese_reissue_lease_token', true);
  v_previous_correction text := current_setting(
    'app.technical_manual_due_date_correction_id', true);
  v_reset_fields text[] := array[
    'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
    'gateway_installment_id', 'gateway_status', 'gateway_invoice_url',
    'gateway_bank_slip_url', 'gateway_pix_payload',
    'gateway_pix_encoded_image', 'gateway_transaction_receipt_url',
    'gateway_fee_value', 'gateway_net_value', 'gateway_synced_at',
    'gateway_last_error', 'gateway_boleto_linha_digitavel',
    'gateway_boleto_codigo_barras', 'gateway_boleto_nosso_numero',
    'gateway_boleto_issued_at', 'gateway_financial_terms_confirmed_at',
    'gateway_creation_token', 'gateway_submission_channel',
    'gateway_submission_status', 'gateway_cnab_file_id'
  ];
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado ao reset one-off.' using errcode = '42501';
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
    or p_lease_token is null
    or upper(coalesce(p_confirmed_remote_status, ''))
      not in ('CANCELED', 'CANCELLED')
    or p_confirmed_situation_code is distinct from 5
    or p_confirmed_at is null
    or p_confirmed_at < now() - interval '10 minutes'
    or p_confirmed_at > now() + interval '1 minute'
    or coalesce(p_cancel_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_already_canceled is null or p_mutation_attempted is null
    or p_already_canceled = p_mutation_attempted
  then
    raise exception 'Escopo ou prova code 5 divergente do reset one-off.'
      using errcode = '22023';
  end if;
  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform internal_academic.assert_technical_reissue_academic_access(
    p_receivable_id, p_expected_authorization_request_id,
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
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
  select overlay.* into strict v_overlay
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  where overlay.correction_request_id = p_correction_request_id
    and overlay.receivable_id = p_receivable_id
    and overlay.source_transaction_id = '340d0d1e-1171-41e9-95d2-b517b91bb450'::uuid
  for update;
  select job.* into strict v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = p_receivable_id
    and job.recovery_request_id = p_expected_authorization_request_id
    and job.cycle_request_id = p_expected_cycle_request_id
    and job.expected_item_count = p_expected_item_count
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
  where transaction.id = v_overlay.source_transaction_id
  for update;
  select queue.* into strict v_queue
  from public.banese_reconciliation_queue queue
  where queue.receivable_id = p_receivable_id
  for update;

  if v_job.lease_token is distinct from p_lease_token
    or v_job.original_actor_id is distinct from v_run.created_by
    or v_overlay.authorization_request_id is distinct from v_auth.request_id
  then
    raise exception 'Lease, ator ou autorização divergiu no reset one-off.'
      using errcode = 'PT409';
  end if;
  if v_job.status = 'RESET_COMPLETE' then
    select archive.* into strict v_archive
    from internal_academic.technical_manual_banese_reissue_archive archive
    where archive.job_id = v_job.id
      and archive.receivable_id = p_receivable_id
      and archive.recovery_request_id = p_expected_authorization_request_id
      and archive.remote_cancel_situation_code = 5;
    if v_receivable.data_vencimento is distinct from p_corrected_due_date
      or v_transaction.receivable_id is not null
      or v_transaction.remote_status is distinct from 'CANCELED'
      or v_auth.receivable_fingerprint is distinct from
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          v_receivable)
    then
      raise exception 'Replay terminal divergiu do reset one-off.'
        using errcode = 'PT409';
    end if;
    return jsonb_build_object(
      'ready', true, 'replayed', true, 'status', v_job.status,
      'jobId', v_job.id, 'receivableId', v_job.receivable_id,
      'correctionRequestId', p_correction_request_id,
      'correctedDueDate', p_corrected_due_date,
      'requiresNewNossoNumero', true);
  end if;
  if v_job.lease_valid_until <= now()
    or v_job.status not in ('FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED')
    or v_queue.state is distinct from 'REPLACEMENT_FENCED'
    or to_jsonb(v_receivable) is distinct from v_overlay.receivable_pre_snapshot
    or to_jsonb(v_transaction) is distinct from v_overlay.transaction_pre_snapshot
    or to_jsonb(v_auth) is distinct from v_overlay.authorization_pre_snapshot
    or not internal_academic.technical_manual_oneoff_due_date_candidate(
      v_receivable, v_run, v_auth, v_transaction)
  then
    raise exception 'Snapshot ou fence mudou antes do reset one-off.'
      using errcode = 'PT409';
  end if;
  if (v_job.status = 'FENCED' and (
      not p_already_canceled or p_mutation_attempted
      or v_job.cancel_mutation_intent_at is not null))
    or (v_job.status = 'CANCEL_INTENT'
      and v_job.cancel_mutation_intent_at is null)
    or (v_job.status = 'CANCEL_CONFIRMED' and (
      not p_already_canceled or p_mutation_attempted))
  then
    raise exception 'Prova de baixa não corresponde ao estado one-off.'
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
      and archive.financial_terms_snapshot = v_receivable.gateway_financial_terms;
  else
    insert into internal_academic.technical_manual_banese_reissue_archive(
      job_id, receivable_id, matricula_id, turma_id, cycle_number,
      cycle_request_id, recovery_request_id, original_actor_id,
      canceled_nosso_numero, environment, convenio, agency,
      expected_amount, expected_due_date, receivable_fingerprint,
      remote_cancel_status, remote_cancel_situation_code,
      remote_cancel_confirmed_at, remote_cancel_fingerprint,
      remote_cancel_observed_pre_canceled, remote_cancel_put_attempted,
      cancel_mutation_intent_at, gateway_pre_snapshot,
      financial_terms_snapshot
    ) values (
      v_job.id, v_receivable.id, v_run.matricula_id, v_run.turma_id,
      v_run.cycle_number, v_run.request_id, v_auth.request_id,
      v_run.created_by, v_job.canceled_nosso_numero, 'production',
      v_job.convenio, v_job.agency, v_job.expected_amount,
      v_job.expected_due_date, v_job.receivable_fingerprint,
      upper(p_confirmed_remote_status), p_confirmed_situation_code,
      p_confirmed_at, p_cancel_fingerprint,
      v_job.status = 'FENCED', v_job.status = 'CANCEL_INTENT',
      case when v_job.status = 'CANCEL_INTENT'
        then v_job.cancel_mutation_intent_at else null end,
      to_jsonb(v_receivable), v_receivable.gateway_financial_terms
    ) returning * into v_archive;
    update internal_academic.technical_manual_banese_reissue_jobs
    set status = 'CANCEL_CONFIRMED',
        lease_valid_until = now() + interval '3 minutes', updated_at = now()
    where id = v_job.id returning * into v_job;
  end if;

  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_job_id', v_job.id::text, true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_request_id',
    v_auth.request_id::text, true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_lease_token',
    p_lease_token::text, true);
  perform pg_catalog.set_config(
    'app.technical_manual_due_date_correction_id',
    p_correction_request_id::text, true);
  begin
    update public.payment_gateway_transactions transaction
    set receivable_id = null, remote_status = 'CANCELED', last_error = null,
        synced_at = v_now, updated_at = v_now
    where transaction.id = v_overlay.source_transaction_id
      and transaction.receivable_id = v_receivable.id
      and transaction.updated_at = v_overlay.expected_transaction_updated_at
    returning * into v_transaction_after;
    if not found
      or v_transaction_after.updated_at <= v_transaction.updated_at
      or to_jsonb(v_transaction_after) - array[
        'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
      ] is distinct from to_jsonb(v_transaction) - array[
        'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
      ]
    then
      raise exception 'Detach da transação antiga divergiu do snapshot.'
        using errcode = 'PT409';
    end if;

    v_projected := v_receivable;
    v_projected.data_vencimento := p_corrected_due_date;
    v_corrected_terms :=
      internal_academic.technical_manual_banese_expected_terms(v_projected);
    update public.contas_receber
    set data_vencimento = p_corrected_due_date,
        gateway_financial_terms = v_corrected_terms,
        gateway_payment_id = null, gateway_customer_id = null,
        gateway_payment_link_id = null, gateway_installment_id = null,
        gateway_status = null, gateway_invoice_url = null,
        gateway_bank_slip_url = null, gateway_pix_payload = null,
        gateway_pix_encoded_image = null,
        gateway_transaction_receipt_url = null, gateway_fee_value = null,
        gateway_net_value = null, gateway_synced_at = null,
        gateway_last_error = null, gateway_boleto_linha_digitavel = null,
        gateway_boleto_codigo_barras = null,
        gateway_boleto_nosso_numero = null,
        gateway_boleto_issued_at = null,
        gateway_financial_terms_confirmed_at = null,
        gateway_creation_token = null, gateway_submission_channel = null,
        gateway_submission_status = null, gateway_cnab_file_id = null,
        updated_at = v_now
    where id = v_receivable.id
      and updated_at = v_overlay.expected_receivable_updated_at
      and data_vencimento = p_expected_due_date
      and gateway_boleto_nosso_numero = v_job.canceled_nosso_numero
      and gateway_submission_status = 'API_REGISTERED'
    returning * into v_after;
    if not found or v_after.updated_at <= v_receivable.updated_at
      or v_after.gateway_financial_terms is distinct from v_corrected_terms
      or to_jsonb(v_after) - (v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ]) is distinct from to_jsonb(v_receivable) - (v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ])
    then
      raise exception 'Reset one-off divergiu do snapshot arquivado.'
        using errcode = 'PT409';
    end if;
    update internal_academic.technical_manual_receivable_issuance_authorizations
    set receivable_fingerprint =
      internal_academic.technical_manual_receivable_issuance_fingerprint(v_after)
    where receivable_id = v_after.id and request_id = v_auth.request_id
      and receivable_fingerprint = v_overlay.original_receivable_fingerprint;
    if not found then
      raise exception 'Rotação da autorização one-off falhou.'
        using errcode = 'PT409';
    end if;
  exception when others then
    perform pg_catalog.set_config('app.technical_manual_banese_reissue_job_id',
      coalesce(v_previous_job, ''), true);
    perform pg_catalog.set_config('app.technical_manual_banese_reissue_request_id',
      coalesce(v_previous_request, ''), true);
    perform pg_catalog.set_config('app.technical_manual_banese_reissue_lease_token',
      coalesce(v_previous_lease, ''), true);
    perform pg_catalog.set_config('app.technical_manual_due_date_correction_id',
      coalesce(v_previous_correction, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('app.technical_manual_banese_reissue_job_id',
    coalesce(v_previous_job, ''), true);
  perform pg_catalog.set_config('app.technical_manual_banese_reissue_request_id',
    coalesce(v_previous_request, ''), true);
  perform pg_catalog.set_config('app.technical_manual_banese_reissue_lease_token',
    coalesce(v_previous_lease, ''), true);
  perform pg_catalog.set_config('app.technical_manual_due_date_correction_id',
    coalesce(v_previous_correction, ''), true);

  select queue.* into strict v_queue
  from public.banese_reconciliation_queue queue
  where queue.receivable_id = p_receivable_id
    and queue.state = 'DONE';
  update internal_academic.technical_manual_banese_reissue_jobs
  set status = 'RESET_COMPLETE', reset_completed_at = v_now,
      lease_valid_until = v_now, updated_at = v_now
  where id = v_job.id and status = 'CANCEL_CONFIRMED'
  returning * into v_job;
  if not found then
    raise exception 'Job perdeu o fence após o reset one-off.'
      using errcode = 'PT409';
  end if;
  perform public.registrar_turma_financeiro_auditoria(
    v_run.matricula_id, 'CICLO_TECNICO_BANESE_DUE_DATE_CORRECTION_READY',
    jsonb_build_object(
      'mode', 'ONE_OFF_DUE_DATE_CORRECTION', 'jobId', v_job.id,
      'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'correctionRequestId', p_correction_request_id,
      'authorizationRequestId', v_auth.request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero,
      'cancelFingerprint', p_cancel_fingerprint,
      'expectedDueDate', p_expected_due_date,
      'correctedDueDate', p_corrected_due_date),
    'Baixa code 5 arquivada; vencimento corrigido e título liberado para novo Nosso Número.');
  return jsonb_build_object(
    'ready', true, 'replayed', false, 'status', v_job.status,
    'jobId', v_job.id, 'receivableId', v_job.receivable_id,
    'correctionRequestId', p_correction_request_id,
    'correctedDueDate', p_corrected_due_date,
    'requiresNewNossoNumero', true);
end;
$function$;

revoke all on function
  public.prepare_known_technical_manual_banese_due_date_correction_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid,
    text,integer,timestamptz,text,boolean,boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  public.prepare_known_technical_manual_banese_due_date_correction_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid,
    text,integer,timestamptz,text,boolean,boolean)
  to service_role, postgres, supabase_admin;

notify pgrst, 'reload schema';
commit;
