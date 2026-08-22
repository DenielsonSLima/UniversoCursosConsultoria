begin;

create or replace function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  p_request_id uuid,
  p_turma_id uuid,
  p_aluno_id uuid,
  p_expected_revisao integer,
  p_expected_fingerprint text,
  p_ajuste jsonb,
  p_gerar_agora boolean,
  p_codigo text default null,
  p_motivo text default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.turmas_plano_financeiro_unico%rowtype;
  v_class public.turmas%rowtype;
  v_enrollment public.matriculas%rowtype;
  v_config public.matriculas_plano_financeiro_unico_config%rowtype;
  v_snapshot public.matriculas_plano_financeiro_unico%rowtype;
  v_adjustment jsonb;
  v_normalized jsonb;
  v_rule jsonb;
  v_reason jsonb;
  v_authorization jsonb;
  v_generation jsonb := jsonb_build_object(
    'snapshot', null,
    'parcelasInseridas', 0,
    'parcelasGeradas', 0,
    'parcelas', '[]'::jsonb
  );
  v_existing_config boolean := false;
  v_created boolean := false;
  v_condition_changed boolean := false;
  v_requires_code boolean := false;
  v_requires_finance boolean := false;
  v_can_view_finance boolean := false;
  v_expected_override_revision integer;
  v_expected_override_fingerprint text;
  v_expected_plan_fingerprint text := pg_catalog.btrim(coalesce(
    p_expected_fingerprint, ''
  ));
  v_input_mode text;
  v_input_reason text;
  v_input_justification text;
  v_intent_requires_finance boolean;
  v_payload_hash text;
  v_existing_request record;
  v_response jsonb;
begin
  if p_request_id is null or p_turma_id is null or p_aluno_id is null
    or p_expected_revisao is null
    or nullif(v_expected_plan_fingerprint, '') is null
    or p_gerar_agora is null
  then
    raise exception 'Request, turma, aluno, identidade e intenção são obrigatórios.'
      using errcode = '22023';
  end if;
  perform internal_academic.assert_can_operate_nontechnical_plan_v2(
    p_turma_id, false
  );
  if p_ajuste is not null and jsonb_typeof(p_ajuste) <> 'object' then
    raise exception 'A condição financeira deve ser um objeto.' using errcode = '22023';
  end if;
  begin
    v_expected_override_revision := nullif(
      p_ajuste ->> 'expectedOverrideRevisao', ''
    )::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'A revisão esperada da condição é inválida.' using errcode = '22023';
  end;
  v_expected_override_fingerprint := nullif(pg_catalog.btrim(coalesce(
    p_ajuste ->> 'expectedOverrideFingerprint', ''
  )), '');
  v_adjustment := coalesce(p_ajuste, '{"modo":"HERDAR"}'::jsonb)
    - 'expectedOverrideRevisao' - 'expectedOverrideFingerprint';
  v_input_mode := upper(pg_catalog.btrim(coalesce(
    v_adjustment ->> 'modo', 'HERDAR'
  )));
  v_input_reason := upper(pg_catalog.btrim(coalesce(p_motivo, '')));
  v_input_justification := nullif(
    pg_catalog.btrim(coalesce(p_justificativa, '')), ''
  );
  v_intent_requires_finance := p_gerar_agora
    or v_input_mode = 'PERSONALIZAR'
    or v_input_reason <> ''
    or v_input_justification is not null;
  if v_intent_requires_finance then
    perform internal_academic.assert_can_operate_nontechnical_plan_v2(
      p_turma_id, true
    );
  end if;
  v_can_view_finance := internal_academic.is_service_financial_actor()
    or public.gestor_has_tab('gestao', 'financeiro');

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'alunoId', p_aluno_id,
      'expectedRevisao', p_expected_revisao,
      'expectedFingerprint', v_expected_plan_fingerprint,
      'ajuste', v_adjustment || jsonb_build_object('modo', v_input_mode),
      'expectedOverrideRevisao', v_expected_override_revision,
      'expectedOverrideFingerprint', v_expected_override_fingerprint,
      'gerarAgora', p_gerar_agora,
      'motivo', nullif(v_input_reason, ''),
      'justificativa', v_input_justification
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nontechnical-single-plan-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing_request
  from internal_academic.nontechnical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing_request.operation <> 'MATRICULAR_ALUNO_PLANO_UNICO_V2'
      or v_existing_request.actor_id is distinct from auth.uid()
      or v_existing_request.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    v_response := v_existing_request.response;
    if not v_can_view_finance then
      v_response := jsonb_set(v_response, '{regra}', 'null'::jsonb, true);
      v_response := jsonb_set(v_response, '{parcelas}', '[]'::jsonb, true);
      v_response := jsonb_set(v_response, '{parcelasInseridas}', '0'::jsonb, true);
      v_response := jsonb_set(v_response, '{parcelasGeradas}', '0'::jsonb, true);
    end if;
    return jsonb_set(v_response, '{replayed}', 'true'::jsonb, true);
  end if;

  select class.* into v_class
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id
    and upper(coalesce(course.modalidade, '')) in ('LIVRE', 'ESPECIALIZACAO');
  if not found then
    raise exception 'Esta turma não utiliza plano financeiro único.' using errcode = '22023';
  end if;
  select plan.* into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id;
  if not found then
    raise exception 'Configure o plano financeiro antes de matricular.' using errcode = '22023';
  end if;
  if p_expected_revisao <> v_plan.revisao
    or v_expected_plan_fingerprint <> v_plan.fingerprint
  then
    raise exception 'O plano financeiro mudou. Recarregue antes de confirmar.'
      using errcode = '40001';
  end if;
  perform 1 from public.parceiros student
  where student.id = p_aluno_id and student.tipo = 'Aluno';
  if not found then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nontechnical-single-plan-enrollment:' || p_turma_id::text || ':'
    || p_aluno_id::text,
    0
  ));

  v_normalized := internal_academic.normalize_nontechnical_adjustment_v2(
    v_plan, v_adjustment
  );
  v_rule := internal_academic.render_nontechnical_condition_v2(
    v_plan, v_adjustment, null, false
  );
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.turma_id = p_turma_id and enrollment.aluno_id = p_aluno_id;
  if found then
    select config.* into v_config
    from public.matriculas_plano_financeiro_unico_config config
    where config.matricula_id = v_enrollment.id;
    v_existing_config := found;
  end if;
  v_condition_changed := not v_existing_config
    or v_config.override_fingerprint
      <> v_rule -> 'identidade' ->> 'overrideFingerprint';
  v_requires_code := v_condition_changed and (
    (v_normalized ->> 'modo') = 'PERSONALIZAR'
    or (v_existing_config and v_config.modo_condicao = 'PERSONALIZAR')
  );
  v_requires_finance := p_gerar_agora
    or (v_normalized ->> 'modo') = 'PERSONALIZAR'
    or (v_existing_config and v_config.modo_condicao = 'PERSONALIZAR');
  if v_requires_finance then
    perform internal_academic.assert_can_operate_nontechnical_plan_v2(
      p_turma_id, true
    );
  end if;
  if v_requires_code then
    v_reason := internal_academic.normalize_nontechnical_condition_reason_v2(
      p_motivo, p_justificativa
    );
    if (v_normalized ->> 'descontoComercialTipo') = 'A_VISTA'
      and (v_reason ->> 'motivo') <> 'A_VISTA'
    then
      raise exception 'O desconto à vista exige o motivo A_VISTA.' using errcode = '22023';
    end if;
  end if;

  if v_requires_code then
    v_authorization := public.validar_codigo_condicao_individual_plano_unico_secure(
      p_turma_id, p_aluno_id, p_codigo,
      v_reason ->> 'motivo', v_reason ->> 'justificativa'
    );
    if coalesce((v_authorization ->> 'autorizado')::boolean, false) is not true then
      return jsonb_build_object(
        'operacao', 'AUTORIZACAO_NEGADA',
        'requestId', p_request_id,
        'replayed', false,
        'autorizacao', v_authorization
      );
    end if;
  end if;

  select plan.* into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id for update;
  if p_expected_revisao <> v_plan.revisao
    or v_expected_plan_fingerprint <> v_plan.fingerprint
  then
    raise exception 'O plano financeiro mudou. Recarregue antes de confirmar.'
      using errcode = '40001';
  end if;
  if v_enrollment.id is not null then
    select snapshot.* into v_snapshot
    from public.matriculas_plano_financeiro_unico snapshot
    where snapshot.matricula_id = v_enrollment.id for update;
    if found then
      if v_snapshot.regra_snapshot ->> 'fingerprint' <> v_rule ->> 'fingerprint'
        and not (
          coalesce((v_snapshot.regra_snapshot ->> 'versao')::integer, 1) < 2
          and (v_normalized ->> 'modo') = 'HERDAR'
        )
      then
        raise exception 'As parcelas já foram geradas com uma condição imutável.'
          using errcode = '23514';
      end if;
    end if;
  end if;

  if v_snapshot.matricula_id is null then
    if v_enrollment.id is null then
      perform public.assert_aluno_sem_matricula_curso_duplicada(
        p_aluno_id, v_class.curso_id, p_turma_id
      );
      v_class := internal_academic.assert_nontechnical_single_plan_enrollment_lifecycle(
        p_turma_id, p_aluno_id
      );
      perform pg_catalog.set_config(
        'app.nontechnical_single_plan_enrollment', p_request_id::text, true
      );
      insert into public.matriculas(
        aluno_id, turma_id, status, financeiro_herdado,
        gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas
      ) values (
        p_aluno_id, p_turma_id, 'PENDENTE', false, false, false, false
      ) returning * into v_enrollment;
      v_created := true;
      insert into public.matricula_movimentacoes(
        matricula_id, aluno_id, tipo, status_anterior, status_novo,
        turma_destino_id, motivo, responsavel_id
      ) values (
        v_enrollment.id, p_aluno_id, 'MATRICULA', null, 'PENDENTE',
        p_turma_id, 'Vínculo acadêmico com financeiro local pendente.', null
      );
    elsif upper(coalesce(v_enrollment.status, '')) <> 'PENDENTE' then
      raise exception 'A matrícula existente não pode receber uma condição pendente.'
        using errcode = '23514';
    end if;
    perform pg_catalog.set_config(
      'app.nontechnical_single_plan_v2', p_request_id::text, true
    );
    v_config := internal_academic.save_nontechnical_pending_condition_v2(
      v_enrollment.id, v_plan, v_adjustment, v_rule,
      v_expected_override_revision, v_expected_override_fingerprint,
      v_reason, auth.uid()
    );
    v_rule := internal_academic.render_nontechnical_condition_v2(
      v_plan,
      internal_academic.nontechnical_config_adjustment_v2(v_config),
      v_config.override_revisao,
      false
    );
    if p_gerar_agora then
      v_generation := internal_academic.generate_nontechnical_titles_v2(
        p_request_id, v_enrollment.id, v_plan, v_rule
      );
      select config.* into v_config
      from public.matriculas_plano_financeiro_unico_config config
      where config.matricula_id = v_enrollment.id;
    end if;
  else
    select config.* into v_config
    from public.matriculas_plano_financeiro_unico_config config
    where config.matricula_id = v_enrollment.id;
    select jsonb_build_object(
      'snapshot', v_snapshot.regra_snapshot,
      'parcelasInseridas', 0,
      'parcelasGeradas', count(*)::integer,
      'parcelas', coalesce(jsonb_agg(jsonb_build_object(
        'id', title.id, 'numero', title.parcela_numero,
        'valor', title.valor, 'vencimento', title.data_vencimento,
        'status', title.status, 'formaPagamento', title.forma_pagamento
      ) order by title.parcela_numero), '[]'::jsonb)
    ) into v_generation
    from public.contas_receber title
    where title.matricula_id = v_enrollment.id
      and title.regra_financeira_plano_unico_snapshot ->> 'fingerprint'
        = v_snapshot.regra_snapshot ->> 'fingerprint';
  end if;

  v_response := jsonb_build_object(
    'operacao', 'MATRICULAR_ALUNO_PLANO_UNICO_V2',
    'requestId', p_request_id,
    'replayed', false,
    'financeiroExigido', v_requires_finance,
    'matricula', jsonb_build_object(
      'id', v_enrollment.id,
      'alunoId', v_enrollment.aluno_id,
      'turmaId', v_enrollment.turma_id,
      'status', v_enrollment.status,
      'criada', v_created
    ),
    'financeiro', jsonb_build_object(
      'status', v_config.status_financeiro,
      'modo', v_config.modo_condicao,
      'overrideRevisao', v_config.override_revisao,
      'overrideFingerprint', v_config.override_fingerprint,
      'regraEfetivaFingerprint', v_config.regra_efetiva_fingerprint
    ),
    'regra', case when v_can_view_finance then coalesce(
      v_snapshot.regra_snapshot, v_rule
    ) else null end,
    'cobrancaGerada', v_config.status_financeiro = 'GERADA',
    'parcelasInseridas', coalesce((v_generation ->> 'parcelasInseridas')::integer, 0),
    'parcelasGeradas', coalesce((v_generation ->> 'parcelasGeradas')::integer, 0),
    'parcelas', coalesce(v_generation -> 'parcelas', '[]'::jsonb)
  );
  insert into internal_academic.nontechnical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'MATRICULAR_ALUNO_PLANO_UNICO_V2',
    auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

revoke all on function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) from public, anon;
grant execute on function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) to authenticated, service_role;

commit;
