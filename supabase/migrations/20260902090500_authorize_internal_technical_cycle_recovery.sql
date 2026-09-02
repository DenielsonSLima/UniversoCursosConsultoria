begin;

create or replace function
public.assert_technical_manual_cycle_recovery_service(
  p_matricula_id uuid,
  p_ciclo_numero integer,
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
  v_actor_email text;
  v_polo_id uuid;
  v_scope_count integer;
  v_distinct_count integer;
  v_receivable_count integer;
  v_mismatch_count integer;
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_role text := current_setting('request.jwt.claim.role', true);
  v_previous_email text := current_setting('request.jwt.claim.email', true);
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à recuperação interna do ciclo técnico.'
      using errcode = '42501';
  end if;
  if p_matricula_id is null or p_ciclo_numero is null
    or p_ciclo_numero < 1 or p_ciclo_numero > 2
    or p_expected_cycle_request_id is null
    or p_expected_item_count is null or p_expected_item_count < 1
  then
    raise exception 'Escopo inválido para recuperação interna do ciclo técnico.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-cycle-internal-recovery:' ||
        p_matricula_id::text || ':' || p_ciclo_numero::text,
      0
    )
  );

  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs as run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero;
  if not found then
    raise exception 'Run do ciclo técnico não encontrado para recuperação.'
      using errcode = '22023';
  end if;
  if v_run.state is distinct from 'LOCAL_CREATED'
    or v_run.request_id is distinct from p_expected_cycle_request_id
    or v_run.item_count is distinct from p_expected_item_count
    or v_run.created_by is null
  then
    raise exception 'O run divergiu do escopo exato da recuperação interna.'
      using errcode = 'PT409';
  end if;

  select
    count(*)::integer,
    count(distinct scope.receivable_id)::integer,
    count(receivable.id)::integer,
    count(*) filter (
      where receivable.id is null
        or receivable.matricula_id is distinct from v_run.matricula_id
        or receivable.turma_id is distinct from v_run.turma_id
    )::integer
  into v_scope_count, v_distinct_count, v_receivable_count, v_mismatch_count
  from unnest(v_run.receivable_ids) as scope(receivable_id)
  left join public.contas_receber as receivable
    on receivable.id = scope.receivable_id;
  if cardinality(v_run.receivable_ids) is distinct from v_run.item_count
    or v_scope_count is distinct from v_run.item_count
    or v_distinct_count is distinct from v_run.item_count
    or v_receivable_count is distinct from v_run.item_count
    or v_mismatch_count <> 0
  then
    raise exception 'A cardinalidade canônica do run técnico divergiu.'
      using errcode = '23514';
  end if;

  select class.polo_id into v_polo_id
  from public.matriculas as enrollment
  join public.turmas as class on class.id = enrollment.turma_id
  where enrollment.id = v_run.matricula_id
    and enrollment.turma_id = v_run.turma_id;
  if not found or v_polo_id is null then
    raise exception 'O run técnico perdeu seu escopo acadêmico.'
      using errcode = '23514';
  end if;

  select auth_user.email into v_actor_email
  from auth.users as auth_user
  where auth_user.id = v_run.created_by
    and auth_user.deleted_at is null
    and (
      auth_user.banned_until is null
      or auth_user.banned_until <= pg_catalog.now()
    );
  if not found then
    raise exception 'O ator original do run não está habilitado.'
      using errcode = '42501';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_run.created_by,
      'role', 'authenticated',
      'email', v_actor_email
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_run.created_by::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claim.email', coalesce(v_actor_email, ''), true
  );

  begin
    if auth.uid() is distinct from v_run.created_by
      or not public.gestor_has_financeiro_tab('receber')
      or not public.is_gestor_for_polo(v_polo_id)
    then
      raise exception 'O ator original não possui mais o acesso financeiro exigido.'
        using errcode = '42501';
    end if;
  exception when others then
    perform set_config(
      'request.jwt.claims', coalesce(v_previous_claims, ''), true
    );
    perform set_config(
      'request.jwt.claim.sub', coalesce(v_previous_sub, ''), true
    );
    perform set_config(
      'request.jwt.claim.role', coalesce(v_previous_role, ''), true
    );
    perform set_config(
      'request.jwt.claim.email', coalesce(v_previous_email, ''), true
    );
    raise;
  end;

  perform set_config(
    'request.jwt.claims', coalesce(v_previous_claims, ''), true
  );
  perform set_config(
    'request.jwt.claim.sub', coalesce(v_previous_sub, ''), true
  );
  perform set_config(
    'request.jwt.claim.role', coalesce(v_previous_role, ''), true
  );
  perform set_config(
    'request.jwt.claim.email', coalesce(v_previous_email, ''), true
  );

  return jsonb_build_object(
    'authorized', true,
    'internalRecovery', true,
    'matriculaId', v_run.matricula_id,
    'cycleNumber', v_run.cycle_number,
    'cycleRequestId', v_run.request_id,
    'itemCount', v_run.item_count
  );
end;
$function$;

create or replace function
public.authorize_technical_manual_receivable_issuance_recovery_service(
  p_receivable_id uuid,
  p_request_id uuid,
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
  v_existing_authorization
    internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_actor_email text;
  v_authorization jsonb;
  v_authorized_by uuid;
  v_authorized_matricula_id uuid;
  v_authorized_turma_id uuid;
  v_authorized_cycle_number smallint;
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_role text := current_setting('request.jwt.claim.role', true);
  v_previous_email text := current_setting('request.jwt.claim.email', true);
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à autorização interna do recebível técnico.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_request_id is null
    or p_expected_matricula_id is null
    or p_expected_cycle_number is null
    or p_expected_cycle_request_id is null
    or p_expected_item_count is null
  then
    raise exception 'Recebível e requisições da recuperação são obrigatórios.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-receivable-internal-recovery:' ||
        p_receivable_id::text,
      0
    )
  );
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs as run
  where run.request_id = p_expected_cycle_request_id
    and run.matricula_id = p_expected_matricula_id
    and run.cycle_number = p_expected_cycle_number
    and run.item_count = p_expected_item_count
    and p_receivable_id = any(run.receivable_ids);
  if not found then
    raise exception 'Recebível fora do run esperado para recuperação interna.'
      using errcode = '22023';
  end if;

  select receivable.* into v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.matricula_id = v_run.matricula_id
    and receivable.turma_id = v_run.turma_id
  for update;
  if not found then
    raise exception 'Recebível divergiu do escopo acadêmico do run.'
      using errcode = '23514';
  end if;

  perform public.assert_technical_manual_cycle_recovery_service(
    p_expected_matricula_id,
    p_expected_cycle_number,
    p_expected_cycle_request_id,
    p_expected_item_count
  );

  select authz.* into v_existing_authorization
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = p_receivable_id;
  if v_existing_authorization.receivable_id is not null
    and v_existing_authorization.request_id is distinct from p_request_id
  then
    if v_existing_authorization.authorized_by is distinct from v_run.created_by
      or v_existing_authorization.matricula_id is distinct from
        v_run.matricula_id
      or v_existing_authorization.turma_id is distinct from v_run.turma_id
      or v_existing_authorization.cycle_number is distinct from
        v_run.cycle_number
      or v_existing_authorization.first_claimed_at is not null
      or v_existing_authorization.last_claimed_at is not null
      or v_existing_authorization.claim_count <> 0
      or v_existing_authorization.receivable_fingerprint is distinct from
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          v_receivable
        )
      or v_receivable.gateway_creation_token is not null
      or v_receivable.gateway_cnab_file_id is not null
      or v_receivable.gateway_status is not null
      or v_receivable.gateway_submission_channel is not null
      or v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_payment_id is not null
      or v_receivable.gateway_payment_link_id is not null
      or v_receivable.gateway_invoice_url is not null
      or v_receivable.gateway_bank_slip_url is not null
      or v_receivable.gateway_transaction_receipt_url is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or v_receivable.gateway_boleto_nosso_numero is not null
      or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '')
        is not null
      or nullif(btrim(coalesce(
        v_receivable.gateway_pix_encoded_image, ''
      )), '') is not null
      or v_receivable.asaas_payment_id is not null
      or v_receivable.asaas_payment_link_id is not null
      or internal_academic.technical_manual_banese_has_settlement_evidence(
        v_receivable
      )
      or exists (
        select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = p_receivable_id
      )
    then
      raise exception 'A autorização anterior não pode ser substituída com segurança.'
        using errcode = '40001';
    end if;
  end if;

  select auth_user.email into v_actor_email
  from auth.users as auth_user
  where auth_user.id = v_run.created_by
    and auth_user.deleted_at is null
    and (
      auth_user.banned_until is null
      or auth_user.banned_until <= pg_catalog.now()
    );
  if not found then
    raise exception 'O ator original do run não está habilitado.'
      using errcode = '42501';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_run.created_by,
      'role', 'authenticated',
      'email', v_actor_email
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_run.created_by::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claim.email', coalesce(v_actor_email, ''), true
  );

  begin
    v_authorization :=
      public.authorize_technical_manual_receivable_issuance_secure(
        p_receivable_id,
        p_request_id
      );
  exception when others then
    perform set_config(
      'request.jwt.claims', coalesce(v_previous_claims, ''), true
    );
    perform set_config(
      'request.jwt.claim.sub', coalesce(v_previous_sub, ''), true
    );
    perform set_config(
      'request.jwt.claim.role', coalesce(v_previous_role, ''), true
    );
    perform set_config(
      'request.jwt.claim.email', coalesce(v_previous_email, ''), true
    );
    raise;
  end;

  perform set_config(
    'request.jwt.claims', coalesce(v_previous_claims, ''), true
  );
  perform set_config(
    'request.jwt.claim.sub', coalesce(v_previous_sub, ''), true
  );
  perform set_config(
    'request.jwt.claim.role', coalesce(v_previous_role, ''), true
  );
  perform set_config(
    'request.jwt.claim.email', coalesce(v_previous_email, ''), true
  );

  if coalesce((v_authorization ->> 'authorized')::boolean, false) is not true
    or coalesce((v_authorization ->> 'required')::boolean, false) is not true
  then
    raise exception 'O recebível não aceitou a autorização interna.'
      using errcode = 'PT409';
  end if;

  select
    authz.authorized_by,
    authz.matricula_id,
    authz.turma_id,
    authz.cycle_number
  into
    v_authorized_by,
    v_authorized_matricula_id,
    v_authorized_turma_id,
    v_authorized_cycle_number
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = p_receivable_id
    and authz.request_id = p_request_id;
  if not found
    or v_authorized_by is distinct from v_run.created_by
    or v_authorized_matricula_id is distinct from v_run.matricula_id
    or v_authorized_turma_id is distinct from v_run.turma_id
    or v_authorized_cycle_number is distinct from v_run.cycle_number
  then
    raise exception 'A autorização interna divergiu do ator ou do run original.'
      using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.historico_turma_financeira as audit
    where audit.matricula_id = v_run.matricula_id
      and audit.evento = 'CICLO_TECNICO_MANUAL_INTERNAL_RECOVERY'
      and audit.regra ->> 'receivableId' = p_receivable_id::text
      and audit.regra ->> 'authorizationRequestId' = p_request_id::text
      and audit.regra ->> 'cycleRequestId' = v_run.request_id::text
  ) then
    perform public.registrar_turma_financeiro_auditoria(
      v_run.matricula_id,
      'CICLO_TECNICO_MANUAL_INTERNAL_RECOVERY',
      jsonb_build_object(
        'mode', 'INTERNAL_RECOVERY',
        'receivableId', p_receivable_id,
        'cycleNumber', v_run.cycle_number,
        'cycleRequestId', v_run.request_id,
        'authorizationRequestId', p_request_id,
        'originalActorId', v_run.created_by,
        'authorizationReplayed', coalesce(
          (v_authorization ->> 'replayed')::boolean,
          false
        )
      ),
      'Recuperação interna autorizada sob o ator original, sem chamada bancária.'
    );
  end if;

  return v_authorization || jsonb_build_object(
    'internalRecovery', true,
    'cycleRequestId', v_run.request_id
  );
end;
$function$;

revoke all on function
  public.assert_technical_manual_cycle_recovery_service(
    uuid, integer, uuid, integer
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.assert_technical_manual_cycle_recovery_service(
    uuid, integer, uuid, integer
  ) to service_role, postgres, supabase_admin;

revoke all on function
  public.authorize_technical_manual_receivable_issuance_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.authorize_technical_manual_receivable_issuance_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer
  ) to service_role, postgres, supabase_admin;

comment on function
  public.assert_technical_manual_cycle_recovery_service(
    uuid, integer, uuid, integer
  ) is
  'Valida o run LOCAL_CREATED e o RBAC atual do ator original antes da recuperação interna.';
comment on function
  public.authorize_technical_manual_receivable_issuance_recovery_service(
    uuid, uuid, uuid, integer, uuid, integer
  ) is
  'Autoriza um recebível para recuperação interna sob o ator original e audita INTERNAL_RECOVERY; não chama o banco.';

notify pgrst, 'reload schema';
commit;
