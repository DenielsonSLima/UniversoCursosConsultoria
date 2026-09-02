begin;
set local lock_timeout = '5s';

create or replace function
public.prepare_technical_manual_cycle_banese_reissue_service(
  p_receivable_id uuid,
  p_recovery_request_id uuid,
  p_expected_matricula_id uuid,
  p_expected_cycle_number integer,
  p_expected_cycle_request_id uuid,
  p_expected_item_count integer,
  p_lease_token uuid,
  p_confirmed_remote_status text,
  p_confirmed_situation_code integer,
  p_confirmed_at timestamptz,
  p_cancel_fingerprint text,
  p_already_canceled boolean,
  p_mutation_attempted boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_after public.contas_receber%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_archive internal_academic.technical_manual_banese_reissue_archive%rowtype;
  v_now timestamptz := clock_timestamp();
  v_previous_job text := current_setting(
    'app.technical_manual_banese_reissue_job_id', true);
  v_previous_request text := current_setting(
    'app.technical_manual_banese_reissue_request_id', true);
  v_previous_lease text := current_setting(
    'app.technical_manual_banese_reissue_lease_token', true);
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
  if p_receivable_id is null or p_recovery_request_id is null
    or p_expected_matricula_id is null
    or p_expected_cycle_number is null
    or p_expected_cycle_request_id is null
    or p_expected_item_count is null or p_lease_token is null
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
    raise exception 'Baixa remota Banese não foi confirmada de forma válida.'
      using errcode = '22023';
  end if;
  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-banese:' || p_receivable_id::text, 0));
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_expected_matricula_id
    and run.cycle_number = p_expected_cycle_number
    and run.request_id = p_expected_cycle_request_id
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids)
  for update;
  select job.* into strict v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = p_receivable_id
    and job.recovery_request_id = p_recovery_request_id
    and job.matricula_id = p_expected_matricula_id
    and job.cycle_number = p_expected_cycle_number
    and job.cycle_request_id = p_expected_cycle_request_id
    and job.expected_item_count = p_expected_item_count
  for update;
  if v_job.lease_token is distinct from p_lease_token
    or v_job.original_actor_id is distinct from v_run.created_by
  then
    raise exception 'Lease ou ator divergiu antes do reset técnico.'
      using errcode = 'PT409';
  end if;

  if v_job.status = 'RESET_COMPLETE' then
    select archive.* into strict v_archive
    from internal_academic.technical_manual_banese_reissue_archive archive
    where archive.job_id = v_job.id
      and archive.receivable_id = p_receivable_id
      and archive.recovery_request_id = p_recovery_request_id
      and archive.remote_cancel_situation_code = 5;
    return jsonb_build_object(
      'ready', true, 'replayed', true, 'status', v_job.status,
      'jobId', v_job.id, 'receivableId', v_job.receivable_id,
      'recoveryRequestId', v_job.recovery_request_id,
      'authorizationRequestId', v_job.recovery_request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero,
      'preserveAuthorization', true, 'requiresNewNossoNumero', true);
  elsif v_job.status = 'RECOVERED_PIX' then
    raise exception 'O Pix oficial foi recuperado; cancelamento proibido.'
      using errcode = 'PT409';
  elsif v_job.lease_valid_until <= now()
    or v_job.status not in ('FENCED', 'CANCEL_INTENT')
  then
    raise exception 'Lease expirou ou o job não permite reset.'
      using errcode = 'PT409';
  end if;
  if (v_job.status = 'FENCED' and (
      not p_already_canceled or p_mutation_attempted
      or v_job.cancel_mutation_intent_at is not null))
    or (v_job.status = 'CANCEL_INTENT' and
      v_job.cancel_mutation_intent_at is null)
  then
    raise exception 'Evidência de mutação não corresponde ao job.'
      using errcode = 'PT409';
  end if;

  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = v_run.matricula_id
    and receivable.turma_id = v_run.turma_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations authz
  where authz.receivable_id = p_receivable_id
    and authz.request_id = p_recovery_request_id
  for update;
  if v_receivable.updated_at is distinct from
      v_job.expected_receivable_updated_at
    or round(v_receivable.valor, 2) is distinct from v_job.expected_amount
    or v_receivable.data_vencimento is distinct from v_job.expected_due_date
    or v_receivable.gateway_boleto_nosso_numero is distinct from
      v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_convenio is distinct from v_job.convenio
    or v_receivable.gateway_boleto_agencia is distinct from v_job.agency
    or v_job.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable)
    or not internal_academic.technical_manual_banese_review_cancel_candidate(
      v_receivable, v_run, v_auth, p_recovery_request_id)
  then
    raise exception 'Recebível técnico mudou após o fence de baixa.'
      using errcode = 'PT409';
  end if;

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
    v_run.cycle_number, v_run.request_id, p_recovery_request_id,
    v_run.created_by, v_job.canceled_nosso_numero, 'production',
    v_job.convenio, v_job.agency, v_job.expected_amount,
    v_job.expected_due_date, v_job.receivable_fingerprint,
    upper(p_confirmed_remote_status), p_confirmed_situation_code,
    p_confirmed_at, p_cancel_fingerprint,
    v_job.cancel_mutation_intent_at is null,
    v_job.cancel_mutation_intent_at is not null,
    v_job.cancel_mutation_intent_at, to_jsonb(v_receivable),
    v_receivable.gateway_financial_terms
  ) returning * into v_archive;
  update internal_academic.technical_manual_banese_reissue_jobs
  set status = 'CANCEL_CONFIRMED',
      lease_valid_until = now() + interval '3 minutes', updated_at = now()
  where id = v_job.id returning * into v_job;

  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_job_id', v_job.id::text, true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_request_id',
    p_recovery_request_id::text, true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_lease_token',
    p_lease_token::text, true);
  begin
    update public.contas_receber
    set gateway_payment_id = null, gateway_customer_id = null,
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
      and updated_at = v_job.expected_receivable_updated_at
      and gateway_creation_token = p_recovery_request_id
      and gateway_boleto_nosso_numero = v_job.canceled_nosso_numero
      and gateway_submission_status = 'API_REVIEW'
    returning * into v_after;
    if not found
      or v_after.updated_at <= v_receivable.updated_at
      or v_after.gateway_financial_terms is distinct from
        v_receivable.gateway_financial_terms
      or to_jsonb(v_after) - (v_reset_fields || array['updated_at'])
        is distinct from
        to_jsonb(v_receivable) - (v_reset_fields || array['updated_at'])
    then
      raise exception 'Reset técnico não corresponde ao snapshot arquivado.'
        using errcode = '40001';
    end if;
  exception when others then
    perform pg_catalog.set_config(
      'app.technical_manual_banese_reissue_job_id',
      coalesce(v_previous_job, ''), true);
    perform pg_catalog.set_config(
      'app.technical_manual_banese_reissue_request_id',
      coalesce(v_previous_request, ''), true);
    perform pg_catalog.set_config(
      'app.technical_manual_banese_reissue_lease_token',
      coalesce(v_previous_lease, ''), true);
    raise;
  end;
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_job_id',
    coalesce(v_previous_job, ''), true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_request_id',
    coalesce(v_previous_request, ''), true);
  perform pg_catalog.set_config(
    'app.technical_manual_banese_reissue_lease_token',
    coalesce(v_previous_lease, ''), true);

  update internal_academic.technical_manual_banese_reissue_jobs
  set status = 'RESET_COMPLETE', reset_completed_at = v_now,
      updated_at = v_now
  where id = v_job.id and status = 'CANCEL_CONFIRMED'
  returning * into v_job;
  if not found then
    raise exception 'Job perdeu o fence após o reset técnico.'
      using errcode = '40001';
  end if;
  perform public.registrar_turma_financeiro_auditoria(
    v_run.matricula_id, 'CICLO_TECNICO_MANUAL_BANESE_REISSUE_READY',
    jsonb_build_object(
      'mode', 'INTERNAL_RECOVERY', 'jobId', v_job.id,
      'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'recoveryRequestId', p_recovery_request_id,
      'authorizationRequestId', v_auth.request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero,
      'cancelFingerprint', p_cancel_fingerprint),
    'Baixa code 5 arquivada; recebível liberado para novo Nosso Número.');
  return jsonb_build_object(
    'ready', true, 'replayed', false, 'status', v_job.status,
    'jobId', v_job.id, 'receivableId', v_job.receivable_id,
    'recoveryRequestId', v_job.recovery_request_id,
    'authorizationRequestId', v_auth.request_id,
    'canceledNossoNumero', v_job.canceled_nosso_numero,
    'preserveAuthorization', true, 'requiresNewNossoNumero', true);
end;
$function$;

revoke all on function
  public.prepare_technical_manual_cycle_banese_reissue_service(
    uuid,uuid,uuid,integer,uuid,integer,uuid,
    text,integer,timestamptz,text,boolean,boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  public.prepare_technical_manual_cycle_banese_reissue_service(
    uuid,uuid,uuid,integer,uuid,integer,uuid,
    text,integer,timestamptz,text,boolean,boolean)
  to service_role, postgres, supabase_admin;

notify pgrst, 'reload schema';
commit;
