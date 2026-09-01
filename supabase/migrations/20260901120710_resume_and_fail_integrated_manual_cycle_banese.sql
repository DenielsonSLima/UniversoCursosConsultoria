begin;
set local lock_timeout = '5s';

create or replace function
public.mark_technical_manual_cycle_banese_failure(
  p_receivable_id uuid,
  p_authorization_request_id uuid,
  p_expected_creation_token uuid,
  p_remote_payment_may_exist boolean,
  p_retryable_reconciliation boolean,
  p_diagnostic_code text,
  p_error text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_error text := left(coalesce(nullif(btrim(p_error), ''),
    'Falha não detalhada na emissão BolePix.'), 500);
  v_diagnostic text := left(coalesce(nullif(upper(btrim(p_diagnostic_code)), ''),
    'UNCLASSIFIED'), 80);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à falha controlada do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_authorization_request_id is null
    or p_expected_creation_token is null
    or v_diagnostic !~ '^[A-Z0-9_]+$'
  then
    raise exception 'Parâmetros inválidos para marcar falha BolePix.'
      using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-manual-banese:' || p_receivable_id, 0)
  );
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
  for update;
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = v_receivable.matricula_id
    and run.turma_id = v_receivable.turma_id
    and v_receivable.id = any(run.receivable_ids)
    and run.state = 'LOCAL_CREATED'
  for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-banese-cycle:' || v_run.matricula_id::text || ':' ||
        v_run.cycle_number::text,
      0
    )
  );
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = p_authorization_request_id
  for update;
  if v_auth.matricula_id is distinct from v_run.matricula_id
    or v_auth.turma_id is distinct from v_run.turma_id
    or v_auth.cycle_number is distinct from v_run.cycle_number
    or v_auth.first_claimed_at is null or v_auth.claim_count < 1
    or v_auth.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable
      )
  then
    raise exception 'Autorização da tentativa com falha divergiu.'
      using errcode = '40001';
  end if;
  if v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.forma_pagamento is distinct from 'BOLETO'
    or internal_academic.technical_manual_banese_has_settlement_evidence(
      v_receivable)
  then
    raise exception 'Rota ou liquidação do recebível divergiu da emissão BolePix.'
      using errcode = '40001';
  end if;

  if v_receivable.gateway_submission_status = 'API_REGISTERED' then
    if internal_academic.technical_manual_banese_receivable_complete(
        v_receivable
      ) and exists (
        select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id
          and transaction.raw_payload -> 'manualCycleIssuance'
            ->> 'attemptToken' = p_expected_creation_token::text
          and transaction.raw_payload -> 'manualCycleIssuance'
            ->> 'authorizationRequestId' = p_authorization_request_id::text
      )
    then
      return jsonb_build_object(
        'success', true, 'alreadyPersisted', true,
        'remotePaymentMayExist', false, 'receivableId', v_receivable.id,
        'cycleNumber', v_run.cycle_number, 'state', 'EMITIDO'
      );
    end if;
    raise exception 'Título registrado não satisfaz o contrato atômico.'
      using errcode = 'PT409';
  end if;
  if v_receivable.gateway_creation_token is distinct from
      p_expected_creation_token
    or v_receivable.gateway_status is distinct from 'CREATING'
    or upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
  then
    raise exception 'Ownership mudou antes de registrar a falha BolePix.'
      using errcode = 'PT409';
  end if;

  if not coalesce(p_remote_payment_may_exist, false) then
    if v_receivable.gateway_submission_channel is not null
      or v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_payment_id is not null
      or v_receivable.gateway_payment_link_id is not null
      or v_receivable.gateway_invoice_url is not null
      or v_receivable.gateway_bank_slip_url is not null
      or v_receivable.gateway_transaction_receipt_url is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '')
        is not null
      or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '')
        is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      raise exception 'Estado local não prova ausência de POST remoto.'
        using errcode = 'PT409';
    end if;
    update public.contas_receber receivable
    set gateway_status = null, gateway_creation_token = null,
        gateway_last_error = v_error, updated_at = v_now
    where receivable.id = v_receivable.id
      and receivable.gateway_creation_token = p_expected_creation_token
      and receivable.gateway_submission_status is null;
    if not found then
      raise exception 'CAS da falha pré-remota não foi aplicado.'
        using errcode = '40001';
    end if;
  else
    if v_receivable.gateway_submission_channel not in ('API')
        and v_receivable.gateway_submission_channel is not null
      or v_receivable.gateway_submission_status not in ('API_AMBIGUOUS')
        and v_receivable.gateway_submission_status is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      raise exception 'Estado remoto ambíguo exige revisão sem nova mutação.'
        using errcode = 'PT409';
    end if;
    update public.contas_receber receivable
    set gateway_submission_channel = 'API',
        gateway_submission_status = case
          when coalesce(p_retryable_reconciliation, false)
            then 'API_AMBIGUOUS' else 'API_REVIEW' end,
        gateway_last_error = case
          when coalesce(p_retryable_reconciliation, false)
            then 'CICLO_MANUAL_BANESE_RETRY_' || v_diagnostic || ': '
          else 'CICLO_MANUAL_BANESE_REVISAO_' || v_diagnostic || ': '
        end || v_error,
        updated_at = v_now
    where receivable.id = v_receivable.id
      and receivable.gateway_creation_token = p_expected_creation_token
      and coalesce(receivable.gateway_submission_status, 'API_AMBIGUOUS') =
        'API_AMBIGUOUS';
    if not found then
      raise exception 'CAS da falha remota ambígua não foi aplicado.'
        using errcode = '40001';
    end if;
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    v_receivable.matricula_id,
    case when coalesce(p_remote_payment_may_exist, false)
      then 'CICLO_TECNICO_MANUAL_ITEM_BANESE_EM_REVISAO'
      else 'CICLO_TECNICO_MANUAL_ITEM_BANESE_FALHA_PRE_REMOTA'
    end,
    jsonb_build_object(
      'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'authorizationRequestId', p_authorization_request_id,
      'remotePaymentMayExist', coalesce(p_remote_payment_may_exist, false),
      'retryable', coalesce(p_retryable_reconciliation, false),
      'diagnosticCode', v_diagnostic
    ), 'Falha classificada sem apagar identidade bancária reservada.'
  );
  return jsonb_build_object(
    'success', false, 'alreadyPersisted', false,
    'remotePaymentMayExist', coalesce(p_remote_payment_may_exist, false),
    'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
    'state', case when coalesce(p_remote_payment_may_exist, false)
      then 'EM_REVISAO' else 'PENDENTE_RETOMADA' end
  );
end;
$function$;

revoke all on function public.mark_technical_manual_cycle_banese_failure(
  uuid, uuid, uuid, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.mark_technical_manual_cycle_banese_failure(
  uuid, uuid, uuid, boolean, boolean, text, text
) to service_role;

create or replace function
public.claim_technical_manual_cycle_banese_reconciliation(
  p_receivable_id uuid,
  p_authorization_request_id uuid,
  p_expected_creation_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_age interval;
  v_cooldown interval;
  v_retry_seconds integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à conciliação do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_authorization_request_id is null
    or p_expected_creation_token is null
  then
    raise exception 'Parâmetros inválidos para conciliar BolePix.'
      using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-manual-banese:' || p_receivable_id, 0)
  );
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = p_receivable_id
    and authz.request_id = p_authorization_request_id
  for update;
  if v_receivable.gateway_creation_token is distinct from
      p_expected_creation_token
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_AMBIGUOUS'
    or coalesce(v_receivable.gateway_boleto_nosso_numero, '') !~ '^[0-9]{9}$'
    or upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null
    or v_receivable.valor_pago is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.manual_settlement_principal_cents is not null
    or v_receivable.manual_settlement_interest_cents is not null
    or v_receivable.manual_settlement_penalty_cents is not null
    or v_receivable.manual_settlement_addition_cents is not null
    or v_receivable.manual_settlement_discount_cents is not null
    or v_receivable.manual_settlement_received_cents is not null
    or v_receivable.manual_settlement_reversed_at is not null
    or v_receivable.gateway_settlement_channel is not null
    or v_receivable.gateway_settlement_source is not null
    or v_receivable.gateway_settlement_evidence is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or v_receivable.gateway_transaction_receipt_url is not null
  then
    raise exception 'Estado não permite conciliação GET-only do BolePix.'
      using errcode = 'PT409';
  end if;
  if v_auth.first_claimed_at is null or v_auth.claim_count < 1
    or v_auth.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable
      )
  then
    raise exception 'Autorização da conciliação divergiu.'
      using errcode = '40001';
  end if;
  v_age := v_now - v_auth.first_claimed_at;
  if v_age >= interval '7 days' then
    update public.contas_receber receivable
    set gateway_submission_status = 'API_REVIEW',
        gateway_last_error =
          'CICLO_MANUAL_BANESE_REVISAO_MAX_AGE: janela de 7 dias encerrada.',
        updated_at = v_now
    where receivable.id = p_receivable_id
      and receivable.gateway_creation_token = p_expected_creation_token
      and receivable.gateway_submission_status = 'API_AMBIGUOUS';
    if not found then
      raise exception 'CAS da janela máxima de conciliação falhou.'
        using errcode = '40001';
    end if;
    perform public.registrar_turma_financeiro_auditoria(
      v_auth.matricula_id, 'CICLO_TECNICO_MANUAL_BANESE_JANELA_ENCERRADA',
      jsonb_build_object('receivableId', p_receivable_id,
        'cycleNumber', v_auth.cycle_number, 'maxAgeDays', 7),
      'Conciliação automática encerrada sem autorizar novo POST.'
    );
    return jsonb_build_object(
      'claimed', false, 'reviewRequired', true, 'reason', 'MAX_AGE',
      'receivableId', p_receivable_id
    );
  end if;
  v_cooldown := case
    when v_age < interval '6 hours' then interval '1 minute'
    when v_age < interval '24 hours' then interval '5 minutes'
    else interval '1 hour'
  end;
  if v_auth.last_claimed_at is not null
    and v_auth.last_claimed_at > v_now - v_cooldown
  then
    v_retry_seconds := greatest(1, ceil(extract(epoch from
      (v_auth.last_claimed_at + v_cooldown - v_now)))::integer);
    return jsonb_build_object(
      'claimed', false, 'retryAfterSeconds', v_retry_seconds,
      'receivableId', p_receivable_id
    );
  end if;
  update internal_academic.technical_manual_receivable_issuance_authorizations
  set last_claimed_at = v_now,
      claim_count = claim_count + 1
  where receivable_id = p_receivable_id
    and request_id = p_authorization_request_id;
  return jsonb_build_object(
    'claimed', true, 'claimedAt', v_now,
    'receivableId', p_receivable_id
  );
end;
$function$;

revoke all on function
  public.claim_technical_manual_cycle_banese_reconciliation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.claim_technical_manual_cycle_banese_reconciliation(uuid, uuid, uuid)
  to service_role;

create or replace function
public.obter_emissao_ciclo_financeiro_tecnico_manual_service(
  p_matricula_id uuid,
  p_ciclo_numero integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_polo_id uuid;
  v_aluno_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_emitted integer := 0;
  v_review integer := 0;
  v_complete boolean;
  v_item_state text;
  v_cycle_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à retomada do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_matricula_id is null or p_ciclo_numero is null
    or p_ciclo_numero not in (1, 2) then
    raise exception 'Matrícula ou ciclo inválido para retomada.'
      using errcode = '22023';
  end if;
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero
    and run.state = 'LOCAL_CREATED';
  select class.polo_id, enrollment.aluno_id into strict v_polo_id, v_aluno_id
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = v_run.matricula_id
    and enrollment.turma_id = v_run.turma_id;

  for v_receivable in
    select receivable.* from public.contas_receber receivable
    where receivable.id = any(v_run.receivable_ids)
    order by receivable.data_vencimento, receivable.id
  loop
    v_count := v_count + 1;
    v_complete :=
      internal_academic.technical_manual_banese_receivable_complete(v_receivable);
    if v_complete then
      v_item_state := 'EMITIDO';
      v_emitted := v_emitted + 1;
    elsif v_receivable.gateway_submission_status = 'API_REVIEW' then
      v_item_state := 'REVISAO_MANUAL'; v_review := v_review + 1;
    elsif v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_creation_token is not null
      or coalesce(v_receivable.gateway_payment_id,
        v_receivable.gateway_boleto_nosso_numero) is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or v_receivable.gateway_pix_payload is not null
      or v_receivable.gateway_pix_encoded_image is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      v_item_state := 'REVISAO';
    else
      v_item_state := 'PENDENTE';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_receivable.id, 'chave', v_receivable.origem_cronograma_id,
      'tipo', v_receivable.tipo_lancamento,
      'numero', v_receivable.parcela_numero,
      'descricao', v_receivable.descricao,
      'valor', pg_catalog.to_char(v_receivable.valor, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(
        v_receivable.data_vencimento, 'YYYY-MM-DD'
      ), 'status', upper(v_receivable.status),
      'emissaoBanese', v_item_state
    ));
  end loop;
  if v_count <> v_run.item_count or v_count <> cardinality(v_run.receivable_ids)
  then
    raise exception 'Run do ciclo perdeu sua cardinalidade canônica.'
      using errcode = '23514';
  end if;
  v_cycle_status := case
    when v_emitted = v_run.item_count and v_review = 0 then 'EMITIDO_BANESE'
    when v_review > 0 then 'EMISSAO_EM_REVISAO'
    when v_emitted > 0 then 'EMISSAO_PARCIAL'
    else 'PRONTO_PARA_EMISSAO_BANESE'
  end;
  return jsonb_build_object(
    'requestId', v_run.request_id, 'replayed', true,
    'matriculaId', v_run.matricula_id, 'turmaId', v_run.turma_id,
    'poloId', v_polo_id, 'alunoId', v_aluno_id,
    'regraFingerprint', v_run.rule_fingerprint,
    'politicaFingerprint', v_run.policy_fingerprint,
    'cronogramaFingerprint', v_run.schedule_fingerprint,
    'primeiroVencimento', v_run.first_due_date,
    'ciclo', jsonb_build_object(
      'numero', v_run.cycle_number, 'status', v_cycle_status,
      'quantidadeItens', v_run.item_count,
      'total', pg_catalog.to_char(v_run.total_amount, 'FM999999990.00'),
      'emitidosBanese', v_emitted,
      'pendentesEmissao', greatest(v_run.item_count - v_emitted - v_review, 0),
      'emRevisao', v_review, 'recebiveis', v_items
    ),
    'cicloManual', internal_academic.technical_manual_cycle_state(
      v_run.matricula_id
    )
  );
end;
$function$;

revoke all on function
  public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid, integer)
  to service_role;

comment on function public.mark_technical_manual_cycle_banese_failure(
  uuid, uuid, uuid, boolean, boolean, text, text
) is 'Libera somente falha comprovadamente pré-remota; ambiguidade preserva token e bloqueia novo POST.';
comment on function
  public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid, integer)
is 'Retorna, sem PII textual, o progresso estrito e retomável de um ciclo técnico manual.';

notify pgrst, 'reload schema';
commit;
