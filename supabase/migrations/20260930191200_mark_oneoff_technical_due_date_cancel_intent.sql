begin;
set local lock_timeout = '5s';

create function public.mark_known_technical_manual_banese_due_date_cancel_intent_service(
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
  p_lease_token uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_overlay internal_academic.technical_manual_banese_due_date_overlay%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
  v_queue public.banese_reconciliation_queue%rowtype;
  v_replayed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à intenção de baixa one-off.'
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
    or p_lease_token is null
  then
    raise exception 'Escopo divergente da intenção de baixa one-off.'
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
    or v_job.lease_valid_until <= now()
    or v_job.status not in ('FENCED', 'CANCEL_INTENT')
    or v_job.matricula_id is distinct from v_run.matricula_id
    or v_job.turma_id is distinct from v_run.turma_id
    or v_job.cycle_number is distinct from v_run.cycle_number
    or v_job.original_actor_id is distinct from v_run.created_by
    or v_job.canceled_nosso_numero is distinct from
      v_receivable.gateway_boleto_nosso_numero
    or v_job.expected_due_date is distinct from p_expected_due_date
    or v_job.expected_receivable_updated_at is distinct from v_receivable.updated_at
    or v_queue.state is distinct from 'REPLACEMENT_FENCED'
    or to_jsonb(v_receivable) is distinct from v_overlay.receivable_pre_snapshot
    or to_jsonb(v_transaction) is distinct from v_overlay.transaction_pre_snapshot
    or to_jsonb(v_auth) is distinct from v_overlay.authorization_pre_snapshot
    or not internal_academic.technical_manual_oneoff_due_date_candidate(
      v_receivable, v_run, v_auth, v_transaction)
  then
    raise exception 'Fence one-off mudou antes da intenção de baixa.'
      using errcode = 'PT409';
  end if;
  if v_job.cancel_mutation_intent_count >= 3 then
    raise exception 'Limite de tentativas de baixa one-off atingido.'
      using errcode = 'PT409';
  end if;

  v_replayed := v_job.status = 'CANCEL_INTENT';
  update internal_academic.technical_manual_banese_reissue_jobs
  set status = 'CANCEL_INTENT',
      cancel_mutation_intent_at = clock_timestamp(),
      cancel_mutation_intent_count = cancel_mutation_intent_count + 1,
      lease_valid_until = now() + interval '3 minutes', updated_at = now()
  where id = v_job.id returning * into v_job;
  perform public.registrar_turma_financeiro_auditoria(
    v_run.matricula_id,
    'CICLO_TECNICO_BANESE_DUE_DATE_CANCEL_MUTATION_INTENT',
    jsonb_build_object(
      'mode', 'ONE_OFF_DUE_DATE_CORRECTION', 'jobId', v_job.id,
      'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'correctionRequestId', p_correction_request_id,
      'authorizationRequestId', v_auth.request_id,
      'canceledNossoNumero', v_job.canceled_nosso_numero),
    'Intenção durável registrada imediatamente antes da baixa Banese one-off.');
  return jsonb_build_object(
    'intent', true, 'replayed', v_replayed,
    'status', v_job.status, 'mode', 'CANCEL_MUTATION_AUTHORIZED',
    'jobId', v_job.id, 'leaseToken', v_job.lease_token,
    'leaseValidUntil', v_job.lease_valid_until,
    'receivableId', v_job.receivable_id,
    'correctionRequestId', p_correction_request_id,
    'canceledNossoNumero', v_job.canceled_nosso_numero,
    'cancelMutationIntentAt', v_job.cancel_mutation_intent_at);
end;
$function$;

revoke all on function
  public.mark_known_technical_manual_banese_due_date_cancel_intent_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.mark_known_technical_manual_banese_due_date_cancel_intent_service(
    uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid)
  to service_role, postgres, supabase_admin;

notify pgrst, 'reload schema';
commit;
