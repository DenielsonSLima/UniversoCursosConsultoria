begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_old text := $old$when 'API_REVIEW' then false$old$;
  v_new text := $new$when 'API_REVIEW' then
        new.gateway_submission_status = 'API_AMBIGUOUS'
        and current_setting(
          'app.technical_manual_cycle_review_reopen_receivable_id', true
        ) = old.id::text
        and old.gateway_submission_channel = 'API'
        and new.gateway_submission_channel = 'API'
        and new.gateway_creation_token is not distinct from
          old.gateway_creation_token
        and new.gateway_boleto_nosso_numero is not distinct from
          old.gateway_boleto_nosso_numero$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.enforce_receivable_gateway_submission_fence()'::regprocedure
  ) into v_definition;
  v_updated := pg_catalog.replace(v_definition, v_old, v_new);
  if v_updated is not distinct from v_definition then
    raise exception 'Fence API_REVIEW não foi localizado.';
  end if;
  execute v_updated;
end;
$migration$;

create or replace function
public.claim_technical_manual_cycle_banese_review_recovery_service(
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
  v_claim_prefix text :=
    'CICLO_MANUAL_BANESE_REVISAO_INTERNAL_GET:' || p_recovery_request_id::text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à conciliação interna do título técnico.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_recovery_request_id is null
    or p_expected_matricula_id is null
    or p_expected_cycle_number is null
    or p_expected_cycle_request_id is null
    or p_expected_item_count is null
  then
    raise exception 'Escopo da conciliação interna inválido.'
      using errcode = '22023';
  end if;

  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id,
    p_expected_cycle_number,
    p_expected_cycle_request_id,
    p_expected_item_count
  );
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs as run
  where run.matricula_id = p_expected_matricula_id
    and run.cycle_number = p_expected_cycle_number
    and run.request_id = p_expected_cycle_request_id
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids);
  select receivable.* into strict v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = v_run.matricula_id
    and receivable.turma_id = v_run.turma_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = v_receivable.gateway_creation_token
  for update;

  if v_auth.authorized_by is distinct from v_run.created_by
    or v_auth.first_claimed_at is null or v_auth.claim_count < 1
    or v_auth.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable
      )
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.forma_pagamento is distinct from 'BOLETO'
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_REVIEW'
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_creation_token is null
    or coalesce(v_receivable.gateway_boleto_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(v_receivable.gateway_boleto_convenio, '') !~ '^[0-9]+$'
    or coalesce(v_receivable.gateway_boleto_agencia, '') !~ '^[0-9]{3}$'
    or v_receivable.gateway_financial_terms is null
    or internal_academic.technical_manual_banese_has_settlement_evidence(
      v_receivable
    )
    or v_receivable.gateway_payment_id is not null
    or v_receivable.gateway_payment_link_id is not null
    or v_receivable.gateway_invoice_url is not null
    or v_receivable.gateway_bank_slip_url is not null
    or v_receivable.gateway_boleto_linha_digitavel is not null
    or v_receivable.gateway_boleto_codigo_barras is not null
    or v_receivable.gateway_boleto_issued_at is not null
    or v_receivable.gateway_financial_terms_confirmed_at is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '')
      is not null
    or nullif(btrim(coalesce(
      v_receivable.gateway_pix_encoded_image, ''
    )), '') is not null
    or exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = v_receivable.id
    )
  then
    raise exception 'O título em revisão não satisfaz o contrato GET-only.'
      using errcode = '40001';
  end if;

  if coalesce(v_receivable.gateway_last_error, '') = v_claim_prefix then
    return jsonb_build_object(
      'claimed', true, 'replayed', true,
      'receivableId', v_receivable.id,
      'authorizationRequestId', v_auth.request_id
    );
  end if;
  if coalesce(v_receivable.gateway_last_error, '') not like
      'CICLO_MANUAL_BANESE_REVISAO_REVIEW_REQUIRED:%'
  then
    raise exception 'A revisão não pertence à falha de contrato recuperável.'
      using errcode = '40001';
  end if;

  update public.contas_receber as receivable
  set gateway_last_error = v_claim_prefix,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = v_receivable.id
    and receivable.gateway_submission_status = 'API_REVIEW'
    and receivable.gateway_last_error = v_receivable.gateway_last_error;
  if not found then
    raise exception 'O claim GET-only perdeu a concorrência.'
      using errcode = '40001';
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    v_run.matricula_id,
    'CICLO_TECNICO_MANUAL_ITEM_REVIEW_GET_CLAIMED',
    jsonb_build_object(
      'mode', 'INTERNAL_GET_ONLY',
      'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'recoveryRequestId', p_recovery_request_id,
      'authorizationRequestId', v_auth.request_id
    ),
    'Título remoto existente reservado para consulta exata sem novo POST.'
  );
  return jsonb_build_object(
    'claimed', true, 'replayed', false,
    'receivableId', v_receivable.id,
    'authorizationRequestId', v_auth.request_id
  );
end;
$function$;

create or replace function
public.persist_technical_manual_cycle_banese_review_recovery_service(
  p_receivable_id uuid,
  p_recovery_request_id uuid,
  p_expected_matricula_id uuid,
  p_expected_cycle_number integer,
  p_expected_cycle_request_id uuid,
  p_expected_item_count integer,
  p_result jsonb
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
  v_result jsonb;
  v_previous_reopen text := current_setting(
    'app.technical_manual_cycle_review_reopen_receivable_id', true
  );
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à persistência da conciliação técnica.'
      using errcode = '42501';
  end if;
  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id,
    p_expected_cycle_number,
    p_expected_cycle_request_id,
    p_expected_item_count
  );
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs as run
  where run.matricula_id = p_expected_matricula_id
    and run.cycle_number = p_expected_cycle_number
    and run.request_id = p_expected_cycle_request_id
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids);
  select receivable.* into strict v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = v_run.matricula_id
    and receivable.turma_id = v_run.turma_id
  for update;
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = v_receivable.gateway_creation_token
  for update;

  if v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_REVIEW'
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_creation_token is null
    or v_receivable.gateway_last_error is distinct from
      'CICLO_MANUAL_BANESE_REVISAO_INTERNAL_GET:' ||
        p_recovery_request_id::text
    or v_auth.authorized_by is distinct from v_run.created_by
    or v_auth.first_claimed_at is null or v_auth.claim_count < 1
    or exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = v_receivable.id
    )
  then
    raise exception 'O claim GET-only divergiu antes da persistência.'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config(
    'app.technical_manual_cycle_review_reopen_receivable_id',
    v_receivable.id::text,
    true
  );
  begin
    update public.contas_receber as receivable
    set gateway_submission_status = 'API_AMBIGUOUS'
    where receivable.id = v_receivable.id
      and receivable.gateway_submission_status = 'API_REVIEW'
      and receivable.gateway_creation_token = v_auth.request_id;
    if not found then
      raise exception 'A reabertura GET-only perdeu a concorrência.'
        using errcode = '40001';
    end if;
    v_result := public.persist_technical_manual_cycle_banese_issuance(
      v_receivable.id,
      v_auth.request_id,
      v_auth.request_id,
      p_result
    );
  exception when others then
    perform pg_catalog.set_config(
      'app.technical_manual_cycle_review_reopen_receivable_id',
      coalesce(v_previous_reopen, ''),
      true
    );
    raise;
  end;
  perform pg_catalog.set_config(
    'app.technical_manual_cycle_review_reopen_receivable_id',
    coalesce(v_previous_reopen, ''),
    true
  );
  return v_result || jsonb_build_object(
    'reviewRecovered', true,
    'recoveryRequestId', p_recovery_request_id
  );
end;
$function$;

revoke all on function
  public.claim_technical_manual_cycle_banese_review_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.claim_technical_manual_cycle_banese_review_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer
  ) to service_role, postgres, supabase_admin;
revoke all on function
  public.persist_technical_manual_cycle_banese_review_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer, jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.persist_technical_manual_cycle_banese_review_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer, jsonb
  ) to service_role, postgres, supabase_admin;

comment on constraint contas_receber_gateway_submission_status_check
  on public.contas_receber is
  'API_REVIEW é terminal, salvo conciliação service-only GET exata e atômica.';
notify pgrst, 'reload schema';
commit;
