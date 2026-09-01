begin;
set local lock_timeout = '5s';

create or replace function internal_academic.build_technical_receivable_policy_snapshot(
  p_matricula_id uuid,
  p_tipo_lancamento text,
  p_descricao text,
  p_valor numeric,
  p_preservar_politica_legada boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_modalidade text;
  v_has_config boolean;
  v_override_active boolean := false;
  v_effective jsonb;
  v_kind text;
  v_kind_key text;
  v_version integer := 1;
  v_discount numeric;
  v_interest numeric;
  v_fine_percent numeric;
  v_fine_value numeric;
  v_apply_discount boolean;
  v_apply_late boolean;
  v_instruction text;
  v_identity jsonb;
  v_snapshot jsonb;
begin
  if p_matricula_id is null then return null; end if;

  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then return null; end if;

  select class.* into v_class
  from public.turmas class
  where class.id = v_enrollment.turma_id;
  if not found then return null; end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course
  where course.id = v_class.curso_id;
  if not found or v_modalidade not in ('TECNICO', 'TÉCNICO') then
    return null;
  end if;

  v_kind := case
    when upper(coalesce(p_tipo_lancamento, '')) = 'REMATRICULA'
      or lower(coalesce(p_descricao, '')) like '%rematricula%'
      or lower(coalesce(p_descricao, '')) like '%rematrícula%'
      then 'REMATRICULA'
    when upper(coalesce(p_tipo_lancamento, '')) = 'MATRICULA'
      or lower(coalesce(p_descricao, '')) like '%matricula%'
      or lower(coalesce(p_descricao, '')) like '%matrícula%'
      then 'MATRICULA'
    else 'MENSALIDADE'
  end;
  v_kind_key := case v_kind
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'rematricula'
    else 'mensalidade'
  end;

  select config.override_ativo into v_override_active
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id;
  v_has_config := found;

  if v_has_config and not p_preservar_politica_legada then
    v_version := 2;
    v_effective :=
      internal_academic.technical_financial_effective_rule(p_matricula_id);
    v_discount := greatest(0, coalesce(
      (v_effective -> 'encargos' ->> 'descontoPontualidade')::numeric, 0
    ));
    v_interest := greatest(0, coalesce(
      (v_effective -> 'encargos' ->> 'jurosAtrasoPercentual')::numeric, 0
    ));
    v_fine_percent := greatest(0, coalesce(
      (v_effective -> 'encargos' ->> 'multaAtrasoPercentual')::numeric, 0
    ));
    v_fine_value := round(
      greatest(0, coalesce(p_valor, 0)) * v_fine_percent / 100.0, 2
    );
    v_apply_discount := coalesce(
      (v_effective -> 'aplicacao' -> v_kind_key ->> 'desconto')::boolean,
      false
    );
    v_apply_late := coalesce(
      (v_effective -> 'aplicacao' -> v_kind_key ->> 'multaJuros')::boolean,
      false
    );
    v_instruction := v_effective -> 'boleto' ->> 'instrucao';
    v_identity := v_effective -> 'identidade';
  else
    v_discount := greatest(0, coalesce(
      v_enrollment.desconto_pontualidade_individual,
      v_class.desconto_pontualidade, 0
    ));
    v_interest := greatest(0, coalesce(
      v_enrollment.juros_atraso_individual, v_class.juros_atraso, 0
    ));
    v_fine_percent := null;
    v_fine_value := greatest(0, coalesce(
      v_enrollment.multa_atraso_individual, v_class.multa_atraso, 0
    ));
    v_apply_discount := case v_kind
      when 'MATRICULA' then v_class.aplicar_desconto_matricula is true
      when 'REMATRICULA' then v_class.aplicar_desconto_rematricula is not false
      else v_class.aplicar_desconto_mensalidade is not false
    end;
    v_apply_late := case v_kind
      when 'MATRICULA' then v_class.aplicar_multa_juros_matricula is not false
      when 'REMATRICULA' then
        v_class.aplicar_multa_juros_rematricula is not false
      else v_class.aplicar_multa_juros_mensalidade is not false
    end;
    v_instruction := v_class.instrucao_boleto_carne;
    v_identity := jsonb_build_object(
      'turmaRevisao', v_class.regra_financeira_revisao,
      'turmaFingerprint', v_class.regra_financeira_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', null
    );
  end if;

  v_snapshot := jsonb_build_object(
    'versao', v_version,
    'origem', case
      when p_preservar_politica_legada then 'LEGADO_CONGELADO'
      when v_override_active then 'INDIVIDUAL'
      else 'TURMA'
    end,
    'overrideAtivo', case
      when p_preservar_politica_legada then null else v_override_active
    end,
    'tipoLancamento', v_kind,
    'valorBase', round(greatest(0, coalesce(p_valor, 0)), 2),
    'descontoPontualidade', round(v_discount, 2),
    'jurosAtrasoPercentual', round(v_interest, 6),
    'multaAtrasoValor', round(v_fine_value, 2),
    'aplicarDesconto', v_apply_discount,
    'aplicarMultaJuros', v_apply_late,
    'instrucaoBoleto', v_instruction,
    'identidade', v_identity,
    'capturadoEm', now()
  );
  if v_version = 2 then
    v_snapshot := v_snapshot || jsonb_build_object(
      'multaAtrasoPercentual', round(v_fine_percent, 6)
    );
  end if;
  return v_snapshot;
end;
$function$;

revoke all on function internal_academic.build_technical_receivable_policy_snapshot(
  uuid, text, text, numeric, boolean
) from public, anon, authenticated, service_role;

create or replace function internal_academic.guard_technical_receivable_policy_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot jsonb;
  v_cycle jsonb;
  v_request_setting text;
  v_authorization_id uuid;
begin
  if tg_op = 'INSERT' then
    v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
      new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
    );
    if v_snapshot is null then return new; end if;

    v_cycle := new.regra_financeira_tecnica_snapshot -> 'cicloManual';
    v_request_setting := nullif(current_setting(
      'app.technical_manual_cycle_request_id', true
    ), '');
    if v_cycle is not null or v_request_setting is not null then
      if jsonb_typeof(v_cycle) <> 'object'
        or coalesce(v_cycle ->> 'requestId', '') <> v_request_setting
        or not exists (
          select 1
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = new.matricula_id
            and run.turma_id = new.turma_id
            and run.cycle_number = (v_cycle ->> 'cicloNumero')::integer
            and run.request_id = (v_cycle ->> 'requestId')::uuid
            and run.rule_fingerprint = v_cycle ->> 'regraFingerprint'
            and run.policy_fingerprint = v_cycle ->> 'politicaFingerprint'
            and run.schedule_fingerprint = v_cycle ->> 'cronogramaFingerprint'
            and run.state = 'GENERATING'
        )
      then
        raise exception 'Contexto do ciclo manual inválido no snapshot técnico.'
          using errcode = '23514';
      end if;
      v_snapshot := v_snapshot || jsonb_build_object(
        'cicloManual', v_cycle
      );
    end if;
    new.regra_financeira_tecnica_snapshot := v_snapshot;
    return new;
  end if;

  if old.regra_financeira_tecnica_snapshot is not null then
    if new.valor is distinct from old.valor
      or new.matricula_id is distinct from old.matricula_id
      or new.tipo_lancamento is distinct from old.tipo_lancamento
    then
      raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
        using errcode = '23514';
    end if;
    if new.regra_financeira_tecnica_snapshot
        is distinct from old.regra_financeira_tecnica_snapshot
    then
      select audit.id into v_authorization_id
      from internal_academic.banese_discount_correction_audit audit
      where audit.receivable_id = old.id
        and audit.database_txid = pg_catalog.txid_current()
        and audit.state = 'AUTHORIZED'
        and audit.expected_technical_snapshot
          = old.regra_financeira_tecnica_snapshot
        and audit.corrected_technical_snapshot
          = new.regra_financeira_tecnica_snapshot
      for update;
      if not found then
        raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
          using errcode = '23514';
      end if;
      update internal_academic.banese_discount_correction_audit audit
      set state = 'SNAPSHOT_APPLIED', snapshot_applied_at = clock_timestamp()
      where audit.id = v_authorization_id and audit.state = 'AUTHORIZED';
      if not found then
        raise exception 'Autorização da correção técnica já foi consumida.'
          using errcode = '40001';
      end if;
    end if;
    return new;
  end if;

  v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
    new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
  );
  if v_snapshot is not null then
    new.regra_financeira_tecnica_snapshot := v_snapshot;
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_technical_receivable_policy_snapshot()
  from public, anon, authenticated, service_role;

do $fix_t42$
declare
  v_class public.turmas%rowtype;
  v_updated integer;
begin
  select class.* into strict v_class
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.codigo = 'ENF-T42-INT-MAT'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  for update of class;

  if v_class.regra_financeira_revisao <> 2
    or v_class.regra_financeira_fingerprint <>
      '5439c26924faa7a642d14377cac507c3caa47e0b5f646de11d632227d612ab21'
    or round(v_class.multa_atraso_percentual, 2) <> 0.00
    or round(v_class.multa_atraso, 2) <> 0.00
    or round(v_class.juros_atraso, 2) <> 2.00
    or v_class.aplicar_desconto_rematricula is not false
    or v_class.aplicar_multa_juros_rematricula is not true
    or v_class.aplicar_desconto_mensalidade is not true
    or v_class.aplicar_multa_juros_mensalidade is not true
  then
    raise exception 'CAS financeiro da T42 divergiu; nenhuma alteração aplicada.'
      using errcode = '40001';
  end if;

  update public.turmas class
  set multa_atraso_percentual = 2.00
  where class.id = v_class.id
    and class.regra_financeira_revisao = 2
    and class.regra_financeira_fingerprint =
      '5439c26924faa7a642d14377cac507c3caa47e0b5f646de11d632227d612ab21';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'A multa da T42 não foi atualizada exatamente uma vez.'
      using errcode = '40001';
  end if;

  if not exists (
    select 1 from public.turmas class
    where class.id = v_class.id
      and class.regra_financeira_revisao = 3
      and class.regra_financeira_fingerprint ~ '^[0-9a-f]{64}$'
      and class.regra_financeira_fingerprint <>
        '5439c26924faa7a642d14377cac507c3caa47e0b5f646de11d632227d612ab21'
      and round(class.multa_atraso_percentual, 2) = 2.00
      and round(class.multa_atraso, 2) = 5.60
  ) then
    raise exception 'A regra corrigida da T42 não foi materializada.'
      using errcode = '23514';
  end if;
end;
$fix_t42$;

comment on function internal_academic.build_technical_receivable_policy_snapshot(
  uuid, text, text, numeric, boolean
) is 'Congela política técnica v2 com multa percentual e valor derivado; v1 legado permanece fixo.';

commit;
