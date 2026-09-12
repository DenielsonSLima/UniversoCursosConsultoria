begin;

-- One audited contract at a time. This service creates only five missing,
-- unpaid historical items; it never creates a gateway transaction or title.
create function public.import_and_protect_t42_proesc_cycle2_service(
  p_actor_id uuid, p_request_id uuid, p_matricula_id uuid, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = ''
set lock_timeout = '5s'
as $function$
declare
  v_actor jsonb;
  v_permissions jsonb;
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_coverage internal_academic.technical_external_cycle_coverage%rowtype;
  v_existing public.contas_receber%rowtype;
  v_item jsonb;
  v_expected jsonb;
  v_existing_hashes jsonb;
  v_after_hashes jsonb;
  v_payload_hash text;
  v_receivable_id uuid;
  v_account_id uuid;
  v_origin text;
  v_kind text;
  v_ordinal integer;
  v_amount numeric;
  v_due date;
  v_count integer;
  v_new boolean;
  v_response jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role'
    is distinct from 'service_role' then
    raise exception 'Acesso interno Proesc não autorizado.' using errcode = '42501';
  end if;
  select to_jsonb(u), case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
      then p.permissoes else u.permissoes end into v_actor, v_permissions
  from public.usuarios_sistema u
  left join public.perfis_acesso p on p.id = u.perfil_acesso_id
  where u.id = p_actor_id and lower(u.status) in ('ativo', 'active')
    and lower(u.perfil) = 'gestor';
  -- Authorize before looking up request_id, including an idempotent replay.
  if v_actor is null or v_permissions -> 'allPolos' is distinct from 'true'::jsonb
    or not coalesce(v_permissions -> 'modules' @> '["configuracoes"]'::jsonb, false)
    or (jsonb_typeof(v_actor -> 'polo_ids') = 'array' and v_actor -> 'polo_ids' <> '[]'::jsonb)
    or btrim(coalesce(v_actor ->> 'context', ''))
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'Gestor global ativo autorizado em Configurações obrigatório.' using errcode = '42501';
  end if;
  if p_actor_id is null or p_request_id is null or p_matricula_id is null
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Contrato Proesc inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) <> 25 then
    raise exception 'A cobertura exige as 25 obrigações conferidas.' using errcode = '22023';
  end if;
  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'matriculaId', p_matricula_id, 'itens', p_items
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('proesc:external-coverage:' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0
  ));
  select coverage.* into v_coverage
  from internal_academic.technical_external_cycle_coverage coverage
  where coverage.request_id = p_request_id or coverage.matricula_id = p_matricula_id
  for update;
  if found then
    if v_coverage.request_id is distinct from p_request_id
      or v_coverage.matricula_id is distinct from p_matricula_id
      or v_coverage.created_by is distinct from p_actor_id
      or v_coverage.payload_hash is distinct from v_payload_hash
      or v_coverage.state <> 'CONFIRMED' then
      raise exception 'Cobertura ou requisição já registrada com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_build_object('replayed', true, 'importados', 0, 'vinculados', 25,
      'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id));
  end if;

  select * into strict v_enrollment from public.matriculas where id = p_matricula_id;
  select * into strict v_class from public.turmas where id = v_enrollment.turma_id for update;
  select * into strict v_enrollment from public.matriculas where id = p_matricula_id for update;
  if v_enrollment.turma_id is distinct from v_class.id
    or v_class.codigo is distinct from 'ENF-T42-INT-MAT'
    or upper(coalesce(v_enrollment.status, '')) not in ('ATIVO', 'PENDENTE')
    or not exists (
      select 1 from internal_academic.technical_manual_cycle_policies policy
      where policy.turma_id = v_class.id and policy.active and policy.generation_mode = 'MANUAL'
        and policy.baseline_cycle = 1 and policy.max_cycle = 2
        and policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
    ) then
    raise exception 'Matrícula fora do escopo da cobertura T42.' using errcode = '42501';
  end if;
  perform 1 from public.matriculas_tecnicas_financeiro_config
  where matricula_id = p_matricula_id for update;
  if not found then raise exception 'Configuração técnica ausente.' using errcode = '22023'; end if;
  if exists (select 1 from internal_academic.technical_manual_cycle_runs
    where matricula_id = p_matricula_id) then
    raise exception 'Existe geração local; a cobertura externa exige revisão.' using errcode = '22023';
  end if;
  perform 1 from public.contas_receber where matricula_id = p_matricula_id order by id for update;
  select count(*), jsonb_object_agg(id::text, md5(to_jsonb(c)::text))
    into v_count, v_existing_hashes from public.contas_receber c where matricula_id = p_matricula_id;
  if v_count <> 20 then
    raise exception 'O conjunto auditado deve conter vinte recebíveis existentes.' using errcode = '40001';
  end if;
  select account.id into strict v_account_id from public.contas_bancarias account
  join public.polos owner on owner.id = account.polo_id and owner.is_matriz
    and lower(owner.status) = 'ativo'
  join public.contas_bancarias_polos scope on scope.conta_bancaria_id = account.id
    and scope.polo_id = v_class.polo_id
  where account.codigo_interno = 'INTEGRATION:PROESC:' || owner.id::text
    and account.natureza = 'BANCARIA' and account.system_managed and account.ativo;

  if exists (select 1 from jsonb_array_elements(p_items) item
    where not coalesce((
      jsonb_typeof(item) = 'object'
      and item -> 'source_identity' ->> 'api_version' = '1.0'
      and item -> 'source_identity' ->> 'unit_id' ~ '^[0-9]+$'
      and item -> 'source_identity' ->> 'class_id' ~ '^[0-9]+$'
      and item -> 'source_identity' ->> 'accounting_key' ~ '^[0-9]+$'
      and item ->> 'source_line_fingerprint' ~ '^[0-9a-f]{64}$'
      and item ->> 'due_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and jsonb_typeof(item -> 'principal_amount_cents') = 'number'
      and item ->> 'principal_amount_cents' ~ '^[0-9]+$'
      and item ->> 'obligation_kind' in ('TUITION', 'REENROLLMENT_FEE_USER_CONFIRMED')
      and item -> 'all_rows_not_cancelled' = 'true'::jsonb
      and item -> 'any_renegotiation' = 'false'::jsonb
    ), false)) then
    raise exception 'Identidade ou contrato da obrigação Proesc inválido.' using errcode = '22023';
  end if;
  if (select count(distinct (item -> 'source_identity' ->> 'unit_id',
        item -> 'source_identity' ->> 'class_id')) from jsonb_array_elements(p_items) item) <> 1
    or (select count(distinct item -> 'source_identity' ->> 'accounting_key')
      from jsonb_array_elements(p_items) item) <> 25
    or (select count(*) from jsonb_array_elements(p_items) item
      where item ->> 'obligation_kind' = 'TUITION'
        and (item ->> 'principal_amount_cents')::integer = 27990) <> 24
    or (select count(*) from jsonb_array_elements(p_items) item
      where item ->> 'obligation_kind' = 'REENROLLMENT_FEE_USER_CONFIRMED'
        and (item ->> 'principal_amount_cents')::integer = 10000) <> 1
    or (select count(distinct item ->> 'existing_local_id')
      from jsonb_array_elements(p_items) item) <> 20
    or (select count(*) from jsonb_array_elements(p_items) item
      where nullif(item ->> 'existing_local_id', '') is null) <> 5
  then
    raise exception 'Contrato exige 24 mensalidades, uma rematrícula e somente cinco inclusões.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where item ->> 'obligation_kind' = 'TUITION'
      and not coalesce(item ->> 'tuition_ordinal' ~ '^([1-9]|1[0-9]|2[0-4])$', false))
    or (select count(distinct item ->> 'tuition_ordinal') from jsonb_array_elements(p_items) item
      where item ->> 'obligation_kind' = 'TUITION') <> 24 then
    raise exception 'As 24 posições externas devem estar comprovadas.' using errcode = '22023';
  end if;
  insert into internal_academic.technical_external_cycle_coverage (
    matricula_id, turma_id, cycle_number, source_system, scope, state,
    request_id, payload_hash, item_count, installment_count, total_amount,
    import_transaction_id, created_by
  ) values (p_matricula_id, v_class.id, 2, 'PROESC', 'CONTRATO_COMPLETO', 'IMPORTING',
    p_request_id, v_payload_hash, 25, 24, 6817.60, txid_current(), p_actor_id);

  for v_item in select item from jsonb_array_elements(p_items) item loop
    v_amount := (v_item ->> 'principal_amount_cents')::numeric / 100;
    v_due := (v_item ->> 'due_date')::date;
    if to_char(v_due, 'YYYY-MM-DD') is distinct from v_item ->> 'due_date' then
      raise exception 'Data de origem Proesc inválida.' using errcode = '22023';
    end if;
    v_kind := case when v_item ->> 'obligation_kind' = 'TUITION' then 'MENSALIDADE' else 'REMATRICULA' end;
    v_ordinal := case when v_kind = 'MENSALIDADE' then (v_item ->> 'tuition_ordinal')::integer end;
    v_new := nullif(v_item ->> 'existing_local_id', '') is null;
    if v_new then
      if v_kind <> 'MENSALIDADE' or v_ordinal not between 20 and 24
        or v_due < (timezone('America/Maceio', now()))::date
        or v_item -> 'any_payment_date' is distinct from 'false'::jsonb
        or v_item ->> 'operation' is distinct from 'INSERT_MISSING_ONLY'
        or v_item ->> 'proposed_status' is distinct from 'PENDENTE' then
        raise exception 'Inclusão restrita às cinco mensalidades futuras e não pagas.' using errcode = '22023';
      end if;
      v_receivable_id := gen_random_uuid();
      v_origin := 'PROESC-V1:' || (v_item -> 'source_identity' ->> 'unit_id') || ':'
        || (v_item -> 'source_identity' ->> 'accounting_key');
      if exists (select 1 from public.contas_receber
        where matricula_id = p_matricula_id and origem_cronograma_id = v_origin) then
        raise exception 'A identidade de origem já está registrada.' using errcode = '40001';
      end if;
      v_expected := jsonb_build_object('id', v_receivable_id, 'matricula_id', p_matricula_id,
        'turma_id', v_class.id, 'cliente_id', v_enrollment.aluno_id, 'polo_id', v_class.polo_id,
        'descricao', 'Mensalidade ' || v_ordinal || '/24 - Histórico Proesc',
        'valor', v_amount, 'data_vencimento', v_due, 'status', 'PENDENTE',
        'valor_pago', 0, 'data_pagamento', null, 'tipo_lancamento', 'PARCELA',
        'parcela_numero', v_ordinal, 'origem_cronograma_id', v_origin,
        'origem_pagamento', 'SISTEMA_ANTERIOR', 'conta_bancaria_id', v_account_id);
    else
      v_receivable_id := (v_item ->> 'existing_local_id')::uuid;
      select * into strict v_existing from public.contas_receber where id = v_receivable_id;
      if v_existing.matricula_id is distinct from p_matricula_id
        or v_existing.turma_id is distinct from v_class.id
        or v_existing.cliente_id is distinct from v_enrollment.aluno_id
        or v_existing.valor is distinct from v_amount or v_existing.data_vencimento is distinct from v_due
        or v_existing.origem_pagamento is distinct from 'SISTEMA_ANTERIOR'
        or v_existing.origem_cronograma_id is distinct from v_item ->> 'existing_origin'
        or v_existing.gateway_provider is not null or v_existing.gateway_payment_id is not null
        or v_existing.gateway_creation_token is not null
        or v_existing.gateway_submission_channel is not null or v_existing.gateway_submission_status is not null
        or v_existing.gateway_boleto_nosso_numero is not null
        or v_existing.gateway_boleto_linha_digitavel is not null
        or v_existing.gateway_boleto_codigo_barras is not null
        or v_existing.gateway_pix_payload is not null or v_existing.gateway_pix_encoded_image is not null
        or v_existing.asaas_payment_id is not null or v_existing.nosso_numero_asaas is not null
        or (v_existing.regra_financeira_tecnica_snapshot -> 'cicloManual') is not null
        or exists (select 1 from public.payment_gateway_transactions where receivable_id = v_receivable_id)
      then
        raise exception 'Recebível existente divergiu da obrigação histórica conferida.' using errcode = '40001';
      end if;
      v_expected := jsonb_build_object('id', v_existing.id, 'matricula_id', v_existing.matricula_id,
        'turma_id', v_existing.turma_id, 'valor', v_existing.valor,
        'data_vencimento', v_existing.data_vencimento, 'origem_cronograma_id', v_existing.origem_cronograma_id);
    end if;
    insert into internal_academic.technical_external_cycle_evidence (
      matricula_id, cycle_number, source_key, source_unit_id, source_class_id,
      source_kind, source_ordinal, source_fingerprint, receivable_id, imported_now, expected_receivable
    ) values (p_matricula_id, 2, v_item -> 'source_identity' ->> 'accounting_key',
      v_item -> 'source_identity' ->> 'unit_id', v_item -> 'source_identity' ->> 'class_id',
      v_kind, v_ordinal, v_item ->> 'source_line_fingerprint', v_receivable_id, v_new, v_expected);
    if v_new then
      insert into public.contas_receber (
        id, matricula_id, turma_id, cliente_id, polo_id, descricao, valor, data_vencimento,
        status, valor_pago, data_pagamento, tipo_lancamento, parcela_numero,
        origem_cronograma_id, origem_pagamento, conta_bancaria_id, categoria
      ) values (v_receivable_id, p_matricula_id, v_class.id, v_enrollment.aluno_id, v_class.polo_id,
        v_expected ->> 'descricao', v_amount, v_due, 'PENDENTE', 0, null, 'PARCELA', v_ordinal,
        v_origin, 'SISTEMA_ANTERIOR', v_account_id, 'MENSALIDADE');
    end if;
  end loop;

  select jsonb_object_agg(c.id::text, md5(to_jsonb(c)::text)) into v_after_hashes
  from public.contas_receber c where v_existing_hashes ? c.id::text;
  if v_after_hashes is distinct from v_existing_hashes
    or (select count(*) from public.contas_receber where matricula_id = p_matricula_id) <> 25
    or (select count(*) from internal_academic.technical_external_cycle_evidence
      where matricula_id = p_matricula_id) <> 25 then
    raise exception 'A importação deve preservar os vinte recebíveis e incluir somente cinco.' using errcode = '40001';
  end if;
  update internal_academic.technical_external_cycle_coverage
  set state = 'CONFIRMED', confirmed_at = now()
  where matricula_id = p_matricula_id and request_id = p_request_id and state = 'IMPORTING';
  v_response := jsonb_build_object('replayed', false, 'importados', 5, 'vinculados', 25,
    'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id));
  if v_response -> 'cicloManual' ->> 'estado' is distinct from 'PROTEGIDO_EXISTENTE'
    or v_response -> 'cicloManual' ->> 'podeGerar' is distinct from 'false' then
    raise exception 'A cobertura externa não bloqueou novas cobranças.' using errcode = '40001';
  end if;
  return v_response;
end;
$function$;
revoke all on function public.import_and_protect_t42_proesc_cycle2_service(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_and_protect_t42_proesc_cycle2_service(uuid, uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
