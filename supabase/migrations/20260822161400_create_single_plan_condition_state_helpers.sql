begin;

create or replace function internal_academic.nontechnical_config_adjustment_v2(
  p_config public.matriculas_plano_financeiro_unico_config
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select case when p_config.modo_condicao = 'HERDAR'
    then jsonb_build_object('modo', 'HERDAR')
    else jsonb_build_object(
      'modo', 'PERSONALIZAR',
      'qtdParcelas', p_config.qtd_parcelas_individual,
      'primeiroVencimento', p_config.primeiro_vencimento_individual,
      'descontoComercialTipo', p_config.desconto_comercial_tipo,
      'descontoComercialValor', p_config.desconto_comercial_valor,
      'descontoPontualidade', p_config.desconto_pontualidade_individual,
      'jurosAtrasoPercentual', p_config.juros_atraso_percentual_individual,
      'multaAtraso', p_config.multa_atraso_individual
    ) end;
$function$;

revoke all on function internal_academic.nontechnical_config_adjustment_v2(
  public.matriculas_plano_financeiro_unico_config
) from public, anon, authenticated, service_role;

create or replace function internal_academic.save_nontechnical_pending_condition_v2(
  p_matricula_id uuid,
  p_plan public.turmas_plano_financeiro_unico,
  p_adjustment jsonb,
  p_rule jsonb,
  p_expected_override_revision integer,
  p_expected_override_fingerprint text,
  p_reason jsonb,
  p_actor_id uuid
)
returns public.matriculas_plano_financeiro_unico_config
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_current public.matriculas_plano_financeiro_unico_config%rowtype;
  v_result public.matriculas_plano_financeiro_unico_config%rowtype;
  v_normalized jsonb := internal_academic.normalize_nontechnical_adjustment_v2(
    p_plan, p_adjustment
  );
  v_mode text := v_normalized ->> 'modo';
  v_override_fingerprint text := p_rule -> 'identidade' ->> 'overrideFingerprint';
  v_effective_fingerprint text := p_rule -> 'identidade' ->> 'efetivaFingerprint';
  v_next_revision integer;
  v_changed boolean := true;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id
  for update;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select config.* into v_current
  from public.matriculas_plano_financeiro_unico_config config
  where config.matricula_id = p_matricula_id
  for update;
  if found then
    if v_current.status_financeiro = 'GERADA' then
      if v_current.regra_efetiva_fingerprint <> v_effective_fingerprint then
        raise exception 'A condição não pode ser alterada após gerar as parcelas.'
          using errcode = '23514';
      end if;
      return v_current;
    end if;
    v_changed := v_current.override_fingerprint <> v_override_fingerprint;
    if v_changed and (
      p_expected_override_revision is null
      or coalesce(p_expected_override_fingerprint, '') = ''
      or p_expected_override_revision <> v_current.override_revisao
      or p_expected_override_fingerprint <> v_current.override_fingerprint
    ) then
      raise exception 'A condição pendente mudou. Recarregue antes de salvar.'
        using errcode = '40001';
    end if;
    if not v_changed then return v_current; end if;
    v_next_revision := v_current.override_revisao + 1;
  else
    v_next_revision := case when v_mode = 'HERDAR' then 0 else 1 end;
  end if;

  insert into public.matriculas_plano_financeiro_unico_config as config(
    matricula_id, turma_id, aluno_id, status_financeiro, modo_condicao,
    plano_turma_revisao, plano_turma_fingerprint,
    qtd_parcelas_individual, primeiro_vencimento_individual,
    desconto_comercial_tipo, desconto_comercial_valor,
    desconto_pontualidade_individual, juros_atraso_percentual_individual,
    multa_atraso_individual, override_revisao, override_fingerprint,
    regra_efetiva_fingerprint, motivo, justificativa, autorizado_por,
    created_by, updated_at
  ) values (
    p_matricula_id, v_enrollment.turma_id, v_enrollment.aluno_id,
    'PENDENTE', v_mode, p_plan.revisao, p_plan.fingerprint,
    case when v_mode = 'PERSONALIZAR'
      then (v_normalized ->> 'qtdParcelas')::integer else null end,
    case when v_mode = 'PERSONALIZAR'
      then (v_normalized ->> 'primeiroVencimento')::date else null end,
    v_normalized ->> 'descontoComercialTipo',
    (v_normalized ->> 'descontoComercialValor')::numeric,
    case when v_mode = 'PERSONALIZAR'
      then (v_normalized ->> 'descontoPontualidade')::numeric else null end,
    case when v_mode = 'PERSONALIZAR'
      then (v_normalized ->> 'jurosAtrasoPercentual')::numeric else null end,
    case when v_mode = 'PERSONALIZAR'
      then (v_normalized ->> 'multaAtraso')::numeric else null end,
    v_next_revision, v_override_fingerprint, v_effective_fingerprint,
    p_reason ->> 'motivo', p_reason ->> 'justificativa',
    case when p_reason is null then null else p_actor_id end,
    p_actor_id, now()
  ) on conflict (matricula_id) do update set
    modo_condicao = excluded.modo_condicao,
    plano_turma_revisao = excluded.plano_turma_revisao,
    plano_turma_fingerprint = excluded.plano_turma_fingerprint,
    qtd_parcelas_individual = excluded.qtd_parcelas_individual,
    primeiro_vencimento_individual = excluded.primeiro_vencimento_individual,
    desconto_comercial_tipo = excluded.desconto_comercial_tipo,
    desconto_comercial_valor = excluded.desconto_comercial_valor,
    desconto_pontualidade_individual = excluded.desconto_pontualidade_individual,
    juros_atraso_percentual_individual = excluded.juros_atraso_percentual_individual,
    multa_atraso_individual = excluded.multa_atraso_individual,
    override_revisao = excluded.override_revisao,
    override_fingerprint = excluded.override_fingerprint,
    regra_efetiva_fingerprint = excluded.regra_efetiva_fingerprint,
    motivo = excluded.motivo,
    justificativa = excluded.justificativa,
    autorizado_por = excluded.autorizado_por,
    updated_at = now()
  returning * into v_result;
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_result.turma_id, p_matricula_id,
    case when v_mode = 'HERDAR'
      then 'CONDICAO_PLANO_UNICO_HERDADA'
      else 'CONDICAO_PLANO_UNICO_PERSONALIZADA' end,
    p_rule || jsonb_build_object(
      'auditoria', jsonb_build_object(
        'atorId', p_actor_id,
        'motivo', p_reason ->> 'motivo',
        'overrideRevisao', v_next_revision,
        'overrideFingerprint', v_override_fingerprint,
        'regraEfetivaFingerprint', v_effective_fingerprint
      )
    ),
    case when p_reason is null then 'Condição padrão da turma.' else
      'Motivo: ' || (p_reason ->> 'motivo') || coalesce(
        '. ' || nullif(p_reason ->> 'justificativa', ''), ''
      ) end
  );
  return v_result;
end;
$function$;

revoke all on function internal_academic.save_nontechnical_pending_condition_v2(
  uuid, public.turmas_plano_financeiro_unico, jsonb, jsonb,
  integer, text, jsonb, uuid
) from public, anon, authenticated, service_role;

create or replace function internal_academic.generate_nontechnical_titles_v2(
  p_request_id uuid,
  p_matricula_id uuid,
  p_plan public.turmas_plano_financeiro_unico,
  p_rule jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_config public.matriculas_plano_financeiro_unico_config%rowtype;
  v_snapshot jsonb;
  v_inserted integer := 0;
  v_total integer := 0;
  v_titles jsonb := '[]'::jsonb;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id
  for update;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_class from public.turmas class
  where class.id = v_enrollment.turma_id for update;
  select config.* into v_config
  from public.matriculas_plano_financeiro_unico_config config
  where config.matricula_id = p_matricula_id for update;
  if not found then
    raise exception 'A condição pendente da matrícula não foi configurada.'
      using errcode = '23514';
  end if;
  if v_config.regra_efetiva_fingerprint
    <> p_rule -> 'identidade' ->> 'efetivaFingerprint'
  then
    raise exception 'A regra efetiva mudou. Recarregue antes de gerar.'
      using errcode = '40001';
  end if;
  perform pg_catalog.set_config(
    'app.nontechnical_single_plan_v2', p_request_id::text, true
  );
  insert into public.matriculas_plano_financeiro_unico(
    matricula_id, turma_id, aluno_id, plano_turma_revisao,
    plano_turma_fingerprint, regra_snapshot, valor_total, qtd_parcelas,
    generated_by
  ) values (
    p_matricula_id, v_enrollment.turma_id, v_enrollment.aluno_id,
    p_plan.revisao, p_plan.fingerprint, p_rule,
    (p_rule ->> 'valorTotalEfetivo')::numeric,
    (p_rule ->> 'qtdParcelas')::integer,
    auth.uid()
  ) on conflict (matricula_id) do nothing;
  select snapshot.regra_snapshot into v_snapshot
  from public.matriculas_plano_financeiro_unico snapshot
  where snapshot.matricula_id = p_matricula_id for update;
  if v_snapshot is null
    or v_snapshot ->> 'fingerprint' <> p_rule ->> 'fingerprint'
  then
    raise exception 'Já existe um snapshot diferente e imutável para esta matrícula.'
      using errcode = '23514';
  end if;
  perform pg_catalog.set_config(
    'app.nontechnical_single_plan_titles', p_request_id::text, true
  );
  insert into public.contas_receber(
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento, parcela_numero,
    origem_cronograma_id, forma_pagamento,
    regra_financeira_plano_unico_snapshot
  )
  select
    v_class.polo_id,
    (item ->> 'label') || ' - ' || v_class.nome,
    (item ->> 'valor')::numeric,
    (item ->> 'dataVencimento')::date,
    case when (item ->> 'dataVencimento')::date < current_date
      then 'VENCIDO' else 'PENDENTE' end,
    'MENSALIDADE', v_enrollment.aluno_id, p_matricula_id,
    v_enrollment.turma_id, 'PARCELA', (item ->> 'numero')::integer,
    item ->> 'id', 'BOLETO',
    (v_snapshot - 'cronograma') || jsonb_build_object(
      'origem', 'PLANO_UNICO', 'parcela', item
    )
  from jsonb_array_elements(v_snapshot -> 'cronograma') schedule(item)
  on conflict (matricula_id, origem_cronograma_id)
    where matricula_id is not null and origem_cronograma_id is not null
  do nothing;
  get diagnostics v_inserted = row_count;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'id', title.id,
    'numero', title.parcela_numero,
    'valor', title.valor,
    'vencimento', title.data_vencimento,
    'status', title.status,
    'formaPagamento', title.forma_pagamento
  ) order by title.parcela_numero), '[]'::jsonb)
  into v_total, v_titles
  from public.contas_receber title
  where title.matricula_id = p_matricula_id
    and title.regra_financeira_plano_unico_snapshot ->> 'fingerprint'
      = v_snapshot ->> 'fingerprint';
  if v_total <> jsonb_array_length(v_snapshot -> 'cronograma') then
    raise exception 'A quantidade de parcelas locais diverge do snapshot financeiro.'
      using errcode = '23514';
  end if;
  update public.matriculas_plano_financeiro_unico_config config set
    status_financeiro = 'GERADA',
    generated_by = auth.uid(),
    generated_at = coalesce(config.generated_at, now()),
    updated_at = now()
  where config.matricula_id = p_matricula_id;
  if v_inserted > 0 then
    insert into public.historico_turma_financeira(
      turma_id, matricula_id, evento, regra, observacao
    ) values (
      v_enrollment.turma_id, p_matricula_id,
      'PLANO_UNICO_V2_PARCELAS_GERADAS', v_snapshot,
      v_inserted || ' parcela(s) local(is) criada(s); emissão bancária permanece posterior.'
    );
  end if;
  return jsonb_build_object(
    'snapshot', v_snapshot,
    'parcelasInseridas', v_inserted,
    'parcelasGeradas', v_total,
    'parcelas', v_titles
  );
end;
$function$;

revoke all on function internal_academic.generate_nontechnical_titles_v2(
  uuid, uuid, public.turmas_plano_financeiro_unico, jsonb
) from public, anon, authenticated, service_role;

commit;
