begin;

create or replace function public.gerar_ciclo_financeiro_tecnico_manual_secure(
  p_matricula_id uuid,
  p_ciclo_numero integer,
  p_primeiro_vencimento date,
  p_request_id uuid,
  p_expected_regra_fingerprint text,
  p_expected_politica_fingerprint text,
  p_expected_cronograma_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_modalidade text;
  v_payload_hash text;
  v_existing record;
  v_preview_envelope jsonb;
  v_preview jsonb;
  v_item jsonb;
  v_receivable public.contas_receber%rowtype;
  v_receivable_ids uuid[] := '{}'::uuid[];
  v_receivables jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_value numeric;
  v_due date;
  v_type text;
  v_number integer;
  v_description text;
  v_key text;
  v_snapshot jsonb;
  v_stored_response jsonb;
begin
  if p_request_id is null
    or p_matricula_id is null
    or p_ciclo_numero is null
    or coalesce(p_expected_regra_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_expected_politica_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_expected_cronograma_fingerprint, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Parâmetros de geração manual inválidos.' using errcode = '22023';
  end if;

  select enrollment.turma_id, upper(coalesce(course.modalidade, ''))
  into v_turma_id, v_modalidade
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_matricula_id;
  if v_turma_id is null or v_modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Matrícula técnica não encontrada.' using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id,
      'cicloNumero', p_ciclo_numero,
      'primeiroVencimento', p_primeiro_vencimento,
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-finance-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash,
    request.response
  into v_existing
  from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'GERACAO_CICLO_TECNICO_MANUAL'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true)
      || jsonb_build_object(
        'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id),
        'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(
          v_turma_id, null
        )
      );
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0
  ));
  perform 1 from public.turmas class where class.id = v_turma_id for update;
  perform 1 from public.matriculas enrollment
    where enrollment.id = p_matricula_id for update;
  perform 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id for update;
  perform 1
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
  order by receivable.id
  for update;

  v_preview_envelope := internal_academic.technical_manual_cycle_preview(
    p_matricula_id, p_ciclo_numero, p_primeiro_vencimento
  );
  v_preview := v_preview_envelope -> 'preview';
  if v_preview ->> 'regraEfetivaFingerprint'
      <> p_expected_regra_fingerprint
    or v_preview ->> 'politicaFingerprint'
      <> p_expected_politica_fingerprint
    or v_preview ->> 'cronogramaFingerprint'
      <> p_expected_cronograma_fingerprint
  then
    raise exception 'A configuração ou o cronograma mudou. Gere nova prévia.'
      using errcode = '40001';
  end if;

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    rule_fingerprint, policy_fingerprint, schedule_fingerprint,
    first_due_date, item_count, expected_installment_count,
    total_amount, created_by
  ) values (
    p_matricula_id, v_turma_id, p_ciclo_numero, 'GENERATING', p_request_id,
    p_expected_regra_fingerprint, p_expected_politica_fingerprint,
    p_expected_cronograma_fingerprint,
    (v_preview ->> 'primeiroVencimento')::date,
    (v_preview ->> 'quantidadeItens')::integer,
    (
      select count(*)::integer
      from jsonb_array_elements(v_preview -> 'itens') preview_item
      where preview_item ->> 'tipo' = 'PARCELA'
    ),
    (v_preview ->> 'total')::numeric,
    auth.uid()
  );

  perform set_config(
    'app.technical_manual_cycle_request_id', p_request_id::text, true
  );

  for v_item in select item from jsonb_array_elements(v_preview -> 'itens') item
  loop
    v_type := v_item ->> 'tipo';
    v_number := (v_item ->> 'numero')::integer;
    v_description := v_item ->> 'descricao';
    v_value := (v_item ->> 'valor')::numeric;
    v_due := (v_item ->> 'vencimento')::date;
    v_key := v_item ->> 'chave';
    v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
      p_matricula_id, v_type, v_description, v_value, false
    ) || jsonb_build_object('cicloManual', jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'requestId', p_request_id,
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint
    ));

    insert into public.contas_receber(
      polo_id, descricao, valor, data_vencimento, status, categoria,
      cliente_id, matricula_id, turma_id, tipo_lancamento,
      parcela_numero, origem_cronograma_id,
      regra_financeira_tecnica_snapshot
    )
    select
      class.polo_id, v_description, v_value, v_due, 'PENDENTE',
      'MENSALIDADE', enrollment.aluno_id, enrollment.id,
      enrollment.turma_id, v_type, v_number, v_key, v_snapshot
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where enrollment.id = p_matricula_id
    returning * into v_receivable;

    v_inserted := v_inserted + 1;
    v_receivable_ids := array_append(v_receivable_ids, v_receivable.id);
    v_receivables := v_receivables || jsonb_build_array(jsonb_build_object(
      'id', v_receivable.id,
      'chave', v_receivable.origem_cronograma_id,
      'tipo', v_receivable.tipo_lancamento,
      'numero', v_receivable.parcela_numero,
      'descricao', v_receivable.descricao,
      'valor', pg_catalog.to_char(v_receivable.valor, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_receivable.data_vencimento, 'YYYY-MM-DD'),
      'status', v_receivable.status,
      'emissaoBanese', 'NAO_EMITIDO'
    ));
  end loop;

  if v_inserted <> (v_preview ->> 'quantidadeItens')::integer then
    raise exception 'O ciclo não foi criado integralmente.' using errcode = 'P0001';
  end if;

  update internal_academic.technical_manual_cycle_runs run
  set state = 'LOCAL_CREATED', receivable_ids = v_receivable_ids,
      completed_at = pg_catalog.clock_timestamp()
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero
    and run.request_id = p_request_id
    and run.state = 'GENERATING';
  if not found then
    raise exception 'Fence do ciclo manual mudou durante a geração.' using errcode = '40001';
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'CICLO_TECNICO_MANUAL_CRIADO_LOCAL',
    jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'quantidadeItens', v_inserted,
      'total', v_preview ->> 'total',
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint,
      'requestId', p_request_id
    ),
    'Recebíveis locais criados por ação explícita; nenhuma emissão bancária foi executada.'
  );

  v_stored_response := jsonb_build_object(
    'operacao', 'GERACAO_CICLO_TECNICO_MANUAL',
    'requestId', p_request_id,
    'replayed', false,
    'ciclo', jsonb_build_object(
      'numero', p_ciclo_numero,
      'status', 'CRIADO_LOCAL',
      'quantidadeItens', v_inserted,
      'total', v_preview ->> 'total',
      'recebiveis', v_receivables
    )
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'GERACAO_CICLO_TECNICO_MANUAL', auth.uid(),
    v_payload_hash, v_stored_response
  );

  return v_stored_response || jsonb_build_object(
    'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id),
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(
      v_turma_id, null
    )
  );
end;
$function$;

revoke all on function public.gerar_ciclo_financeiro_tecnico_manual_secure(
  uuid, integer, date, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.gerar_ciclo_financeiro_tecnico_manual_secure(
  uuid, integer, date, uuid, text, text, text
) to authenticated, service_role;

create or replace function public.gerar_ciclo_financeiro_apos_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_manual boolean := false;
begin
  if new.status = 'PAGO'
    and old.status is distinct from 'PAGO'
    and new.matricula_id is not null
  then
    select
      upper(coalesce(course.modalidade, '')),
      exists (
        select 1
        from internal_academic.technical_manual_cycle_policies policy
        where policy.turma_id = enrollment.turma_id
          and policy.active
          and policy.generation_mode = 'MANUAL'
      )
    into v_modalidade, v_manual
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    where enrollment.id = new.matricula_id;

    if v_modalidade in ('TECNICO', 'TÉCNICO') and not v_manual then
      if new.tipo_lancamento = 'MATRICULA' then
        perform public.gerar_parcelas_matricula(new.matricula_id);
      elsif new.tipo_lancamento = 'PARCELA' then
        perform public.gerar_rematricula_apos_parcelas(new.matricula_id);
      end if;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.gerar_ciclo_financeiro_apos_pagamento()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
