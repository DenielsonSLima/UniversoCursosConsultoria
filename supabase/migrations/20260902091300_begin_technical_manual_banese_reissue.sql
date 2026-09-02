begin;
set local lock_timeout = '5s';

create or replace function
internal_academic.technical_manual_banese_review_cancel_candidate(
  p_receivable public.contas_receber,
  p_run internal_academic.technical_manual_cycle_runs,
  p_auth internal_academic.technical_manual_receivable_issuance_authorizations,
  p_recovery_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_receivable.id = any(p_run.receivable_ids)
    and p_receivable.matricula_id = p_run.matricula_id
    and p_receivable.turma_id = p_run.turma_id
    and p_run.state = 'LOCAL_CREATED'
    and p_auth.receivable_id = p_receivable.id
    and p_auth.matricula_id = p_run.matricula_id
    and p_auth.turma_id = p_run.turma_id
    and p_auth.cycle_number = p_run.cycle_number
    and p_auth.request_id = p_recovery_request_id
    and p_auth.authorized_by = p_run.created_by
    and p_auth.first_claimed_at is not null
    and p_auth.claim_count >= 1
    and p_auth.receivable_fingerprint =
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        p_receivable)
    and p_receivable.gateway_provider = 'banese_card'
    and p_receivable.gateway_environment = 'production'
    and p_receivable.gateway_payment_method = 'BOLETO'
    and p_receivable.forma_pagamento = 'BOLETO'
    and p_receivable.gateway_issuer_polo_id is not null
    and p_receivable.gateway_submission_channel = 'API'
    and p_receivable.gateway_submission_status = 'API_REVIEW'
    and p_receivable.gateway_status = 'CREATING'
    and p_receivable.gateway_creation_token = p_recovery_request_id
    and p_receivable.gateway_last_error =
      'CICLO_MANUAL_BANESE_REVISAO_INTERNAL_GET:' ||
        p_recovery_request_id::text
    and coalesce(p_receivable.gateway_boleto_nosso_numero, '')
      ~ '^[0-9]{9}$'
    and coalesce(p_receivable.gateway_boleto_convenio, '') ~ '^[0-9]+$'
    and coalesce(p_receivable.gateway_boleto_agencia, '')
      ~ '^[0-9]{3}$'
    and p_receivable.gateway_boleto_agencia <> '000'
    and jsonb_typeof(p_receivable.gateway_financial_terms) = 'object'
    and p_receivable.gateway_financial_terms =
      internal_academic.technical_manual_banese_expected_terms(p_receivable)
    and p_receivable.gateway_financial_terms_confirmed_at is null
    and upper(coalesce(p_receivable.status, '')) in ('PENDENTE', 'VENCIDO')
    and not internal_academic.technical_manual_banese_has_settlement_evidence(
      p_receivable)
    and p_receivable.gateway_payment_id is null
    and p_receivable.gateway_customer_id is null
    and p_receivable.gateway_payment_link_id is null
    and p_receivable.gateway_installment_id is null
    and p_receivable.gateway_invoice_url is null
    and p_receivable.gateway_bank_slip_url is null
    and p_receivable.gateway_transaction_receipt_url is null
    and p_receivable.gateway_boleto_linha_digitavel is null
    and p_receivable.gateway_boleto_codigo_barras is null
    and p_receivable.gateway_boleto_issued_at is null
    and p_receivable.gateway_pix_payload is null
    and p_receivable.gateway_pix_encoded_image is null
    and p_receivable.gateway_fee_value is null
    and p_receivable.gateway_net_value is null
    and p_receivable.gateway_synced_at is null
    and p_receivable.gateway_cnab_file_id is null
    and p_receivable.asaas_payment_id is null
    and p_receivable.asaas_payment_link_id is null
    and p_receivable.asaas_installment_id is null
    and p_receivable.nosso_numero_asaas is null
    and p_receivable.asaas_invoice_url is null
    and p_receivable.asaas_bank_slip_url is null
    and p_receivable.asaas_transaction_receipt_url is null
    and p_receivable.asaas_status is null
    and p_receivable.asaas_synced_at is null
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = p_receivable.id)
    and exists (
      select 1 from public.payment_gateway_routes as route
      where upper(route.modalidade) = 'TECNICO'
        and route.payment_method = 'BOLETO'
        and route.environment = 'production'
        and route.provider_code = 'banese_card'
        and route.enabled)
    and exists (
      select 1
      from public.matriculas as enrollment
      join public.turmas as class on class.id = enrollment.turma_id
      join public.cursos as course on course.id = class.curso_id
      where enrollment.id = p_receivable.matricula_id
        and enrollment.aluno_id = p_receivable.cliente_id
        and class.id = p_receivable.turma_id
        and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO'));
$function$;

revoke all on function
  internal_academic.technical_manual_banese_review_cancel_candidate(
    public.contas_receber,
    internal_academic.technical_manual_cycle_runs,
    internal_academic.technical_manual_receivable_issuance_authorizations,
    uuid
  ) from public, anon, authenticated, service_role;

create or replace function
internal_academic.technical_manual_banese_reissue_bypass_valid(
  p_receivable_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_jobs job
    join internal_academic.technical_manual_banese_reissue_archive archive
      on archive.job_id = job.id
    join public.contas_receber receivable
      on receivable.id = job.receivable_id
    join internal_academic.technical_manual_cycle_runs run
      on run.matricula_id = job.matricula_id
      and run.cycle_number = job.cycle_number
    join internal_academic.technical_manual_receivable_issuance_authorizations authz
      on authz.receivable_id = job.receivable_id
      and authz.request_id = job.recovery_request_id
    where (
        coalesce(auth.role(), '') = 'service_role'
        or session_user in ('postgres', 'supabase_admin', 'service_role'))
      and job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true)
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true)
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true)
      and job.lease_valid_until > clock_timestamp()
      and job.receivable_id = p_receivable_id
      and job.status = 'CANCEL_CONFIRMED'
      and job.expected_receivable_updated_at = receivable.updated_at
      and job.receivable_fingerprint =
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          receivable)
      and archive.receivable_id = job.receivable_id
      and archive.recovery_request_id = job.recovery_request_id
      and archive.canceled_nosso_numero = job.canceled_nosso_numero
      and archive.remote_cancel_situation_code = 5
      and internal_academic.technical_manual_banese_review_cancel_candidate(
        receivable, run, authz, job.recovery_request_id));
$function$;

revoke all on function
  internal_academic.technical_manual_banese_reissue_bypass_valid(uuid)
  from public, anon, authenticated, service_role;

create or replace function
public.begin_technical_manual_cycle_banese_review_cancel_service(
  p_receivable_id uuid,
  p_recovery_request_id uuid,
  p_expected_matricula_id uuid,
  p_expected_cycle_number integer,
  p_expected_cycle_request_id uuid,
  p_expected_item_count integer
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
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_replayed boolean := false;
begin
  if p_receivable_id is null or p_recovery_request_id is null
    or p_expected_matricula_id is null
    or p_expected_cycle_number is null
    or p_expected_cycle_request_id is null
    or p_expected_item_count is null
  then
    raise exception 'Escopo inválido para o fence de baixa Banese.'
      using errcode = '22023';
  end if;
  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id, p_expected_cycle_number,
    p_expected_cycle_request_id, p_expected_item_count);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-banese:' || p_receivable_id::text, 0));
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs as run
  where run.matricula_id = p_expected_matricula_id
    and run.cycle_number = p_expected_cycle_number
    and run.request_id = p_expected_cycle_request_id
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids)
  for update;
  select receivable.* into strict v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = v_run.matricula_id
    and receivable.turma_id = v_run.turma_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = p_recovery_request_id
  for update;
  if exists (
      select 1
      from internal_academic.technical_manual_banese_reissue_archive archive
      where archive.receivable_id = v_receivable.id
    ) or exists (
      select 1
      from internal_academic.technical_manual_banese_reissue_jobs terminal_job
      where terminal_job.receivable_id = v_receivable.id
        and terminal_job.status in ('RECOVERED_PIX', 'RESET_COMPLETE')
    )
  then
    raise exception 'Recebível técnico já consumiu sua única substituição.'
      using errcode = 'PT409';
  end if;
  if not internal_academic.technical_manual_banese_review_cancel_candidate(
      v_receivable, v_run, v_auth, p_recovery_request_id) then
    raise exception 'O título técnico mudou antes do fence de baixa.'
      using errcode = 'PT409';
  end if;

  select job.* into v_job
  from internal_academic.technical_manual_banese_reissue_jobs as job
  where job.receivable_id = v_receivable.id
    and job.canceled_nosso_numero =
      v_receivable.gateway_boleto_nosso_numero
  for update;
  if found then
    if v_job.matricula_id is distinct from v_run.matricula_id
      or v_job.turma_id is distinct from v_run.turma_id
      or v_job.cycle_number is distinct from v_run.cycle_number
      or v_job.cycle_request_id is distinct from v_run.request_id
      or v_job.expected_item_count is distinct from v_run.item_count
      or v_job.recovery_request_id is distinct from p_recovery_request_id
      or v_job.original_actor_id is distinct from v_run.created_by
      or v_job.canceled_nosso_numero is distinct from
        v_receivable.gateway_boleto_nosso_numero
      or v_job.convenio is distinct from
        v_receivable.gateway_boleto_convenio
      or v_job.agency is distinct from v_receivable.gateway_boleto_agencia
      or v_job.expected_amount is distinct from round(v_receivable.valor, 2)
      or v_job.expected_due_date is distinct from
        v_receivable.data_vencimento
      or v_job.expected_receivable_updated_at is distinct from
        v_receivable.updated_at
      or v_job.receivable_fingerprint is distinct from
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          v_receivable)
    then
      raise exception 'Replay incompatível do fence de baixa técnica.'
        using errcode = '40001';
    end if;
    v_replayed := true;
    if v_job.status in ('FENCED', 'CANCEL_INTENT')
      and v_job.lease_valid_until > now()
    then
      raise exception 'Job de baixa técnica ocupado por lease ativo.'
        using errcode = 'PT409';
    elsif v_job.status = 'CANCEL_INTENT'
      and v_job.cancel_mutation_intent_at > now() - interval '3 minutes'
    then
      raise exception 'Cooldown da tentativa Banese ainda está ativo.'
        using errcode = 'PT409';
    elsif v_job.status in ('FENCED', 'CANCEL_INTENT') then
      update internal_academic.technical_manual_banese_reissue_jobs
      set lease_token = gen_random_uuid(),
          lease_valid_until = now() + interval '3 minutes',
          updated_at = now()
      where id = v_job.id returning * into v_job;
    end if;
    return jsonb_build_object(
      'fenced', v_job.status in ('FENCED', 'CANCEL_INTENT'),
      'replayed', true, 'terminal',
      v_job.status in ('RECOVERED_PIX', 'RESET_COMPLETE'),
      'mode', case when v_job.status = 'CANCEL_INTENT'
        then 'CANCEL_ALLOWED_AFTER_GET' else 'CANCEL_ALLOWED' end,
      'status', v_job.status, 'jobId', v_job.id,
      'leaseToken', v_job.lease_token,
      'leaseValidUntil', v_job.lease_valid_until,
      'receivableId', v_job.receivable_id,
      'recoveryRequestId', v_job.recovery_request_id,
      'authorizationRequestId', v_auth.request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero,
      'convenio', v_job.convenio, 'agency', v_job.agency,
      'expectedAmount', v_job.expected_amount,
      'expectedDueDate', v_job.expected_due_date);
  end if;

  insert into internal_academic.technical_manual_banese_reissue_jobs(
    receivable_id, matricula_id, turma_id, cycle_number, cycle_request_id,
    expected_item_count, recovery_request_id, original_actor_id,
    canceled_nosso_numero, convenio, agency, expected_amount,
    expected_due_date, receivable_fingerprint,
    expected_receivable_updated_at, lease_valid_until
  ) values (
    v_receivable.id, v_run.matricula_id, v_run.turma_id, v_run.cycle_number,
    v_run.request_id, v_run.item_count, p_recovery_request_id,
    v_run.created_by, v_receivable.gateway_boleto_nosso_numero,
    v_receivable.gateway_boleto_convenio,
    v_receivable.gateway_boleto_agencia, round(v_receivable.valor, 2),
    v_receivable.data_vencimento,
    internal_academic.technical_manual_receivable_issuance_fingerprint(
      v_receivable),
    v_receivable.updated_at, now() + interval '3 minutes'
  ) returning * into v_job;
  perform public.registrar_turma_financeiro_auditoria(
    v_run.matricula_id, 'CICLO_TECNICO_MANUAL_BANESE_CANCEL_FENCED',
    jsonb_build_object(
      'mode', 'INTERNAL_RECOVERY', 'jobId', v_job.id,
      'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'recoveryRequestId', p_recovery_request_id,
      'authorizationRequestId', v_auth.request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero),
    'Título técnico cercado antes de eventual baixa Banese confirmada.');
  return jsonb_build_object(
    'fenced', true, 'replayed', v_replayed, 'terminal', false,
    'mode', 'CANCEL_ALLOWED',
    'status', v_job.status, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token,
    'leaseValidUntil', v_job.lease_valid_until,
    'receivableId', v_job.receivable_id,
    'recoveryRequestId', v_job.recovery_request_id,
    'authorizationRequestId', v_auth.request_id,
    'canceledNossoNumero', v_job.canceled_nosso_numero,
    'convenio', v_job.convenio, 'agency', v_job.agency,
    'expectedAmount', v_job.expected_amount,
    'expectedDueDate', v_job.expected_due_date);
end;
$function$;

create or replace function
public.mark_technical_manual_cycle_banese_cancel_intent_service(
  p_receivable_id uuid,
  p_recovery_request_id uuid,
  p_expected_matricula_id uuid,
  p_expected_cycle_number integer,
  p_expected_cycle_request_id uuid,
  p_expected_item_count integer,
  p_lease_token uuid
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
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_replayed boolean := false;
begin
  if p_lease_token is null then
    raise exception 'Lease obrigatório para registrar intenção de baixa.'
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
    and p_receivable_id = any(run.receivable_ids);
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations authz
  where authz.receivable_id = p_receivable_id
    and authz.request_id = p_recovery_request_id for update;
  select job.* into strict v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = p_receivable_id
    and job.recovery_request_id = p_recovery_request_id
    and job.cycle_request_id = p_expected_cycle_request_id
    and job.expected_item_count = p_expected_item_count
  for update;
  if v_job.lease_token is distinct from p_lease_token
    or v_job.lease_valid_until <= now()
    or v_job.status not in ('FENCED', 'CANCEL_INTENT')
    or v_job.matricula_id is distinct from v_run.matricula_id
    or v_job.turma_id is distinct from v_run.turma_id
    or v_job.cycle_number is distinct from v_run.cycle_number
    or v_job.original_actor_id is distinct from v_run.created_by
    or v_job.canceled_nosso_numero is distinct from
      v_receivable.gateway_boleto_nosso_numero
    or v_job.convenio is distinct from v_receivable.gateway_boleto_convenio
    or v_job.agency is distinct from v_receivable.gateway_boleto_agencia
    or v_job.expected_amount is distinct from round(v_receivable.valor, 2)
    or v_job.expected_due_date is distinct from v_receivable.data_vencimento
    or v_job.expected_receivable_updated_at is distinct from
      v_receivable.updated_at
    or v_job.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable)
    or not internal_academic.technical_manual_banese_review_cancel_candidate(
      v_receivable, v_run, v_auth, p_recovery_request_id)
  then
    raise exception 'Fence ou lease mudou antes da intenção de baixa.'
      using errcode = 'PT409';
  end if;
  if v_job.cancel_mutation_intent_count >= 3 then
    raise exception 'Limite de tentativas de baixa técnica atingido.'
      using errcode = 'PT409';
  else
    update internal_academic.technical_manual_banese_reissue_jobs
    set status = 'CANCEL_INTENT',
        cancel_mutation_intent_at = clock_timestamp(),
        cancel_mutation_intent_count = cancel_mutation_intent_count + 1,
        lease_valid_until = now() + interval '3 minutes', updated_at = now()
    where id = v_job.id returning * into v_job;
    perform public.registrar_turma_financeiro_auditoria(
      v_run.matricula_id,
      'CICLO_TECNICO_MANUAL_BANESE_CANCEL_MUTATION_INTENT',
      jsonb_build_object(
        'mode', 'INTERNAL_RECOVERY', 'jobId', v_job.id,
        'receivableId', v_receivable.id,
        'cycleNumber', v_run.cycle_number,
        'cycleRequestId', v_run.request_id,
        'recoveryRequestId', p_recovery_request_id,
        'canceledNossoNumero', v_job.canceled_nosso_numero),
      'Intenção durável registrada imediatamente antes da baixa Banese.');
  end if;
  return jsonb_build_object(
    'intent', true, 'replayed', v_replayed, 'status', v_job.status,
    'mode', 'GET_RECONCILE_ONLY',
    'jobId', v_job.id, 'leaseToken', v_job.lease_token,
    'leaseValidUntil', v_job.lease_valid_until,
    'receivableId', v_job.receivable_id,
    'recoveryRequestId', v_job.recovery_request_id,
    'canceledNossoNumero', v_job.canceled_nosso_numero,
    'cancelMutationIntentAt', v_job.cancel_mutation_intent_at);
end;
$function$;

revoke all on function
  public.begin_technical_manual_cycle_banese_review_cancel_service(
    uuid,uuid,uuid,integer,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_technical_manual_cycle_banese_review_cancel_service(
    uuid,uuid,uuid,integer,uuid,integer)
  to service_role, postgres, supabase_admin;
revoke all on function
  public.mark_technical_manual_cycle_banese_cancel_intent_service(
    uuid,uuid,uuid,integer,uuid,integer,uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.mark_technical_manual_cycle_banese_cancel_intent_service(
    uuid,uuid,uuid,integer,uuid,integer,uuid)
  to service_role, postgres, supabase_admin;

commit;
