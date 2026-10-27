-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
CREATE OR REPLACE FUNCTION internal_academic.build_technical_receivable_policy_snapshot(p_matricula_id uuid, p_tipo_lancamento text, p_descricao text, p_valor numeric, p_preservar_politica_legada boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_reviewed_snapshot_before_transfer_schedule(p_matricula_id uuid, p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_details jsonb := p_item -> 'detalhesBoleto';
  v_value numeric := (p_item ->> 'valor')::numeric;
  v_fine numeric := coalesce((v_details #>> '{multa,percentual}')::numeric, 0);
begin
  return internal_academic.build_technical_receivable_policy_snapshot(
    p_matricula_id, p_item ->> 'tipo', p_item ->> 'descricao', v_value, false
  ) || jsonb_build_object(
    'versao', 2,
    'destinoCobranca', coalesce(p_item->>'destinoCobranca','BANESE'),
    'valorBase', v_value,
    'descontoPontualidade', coalesce((v_details #>> '{desconto,valor}')::numeric, 0),
    'jurosAtrasoPercentual', coalesce((v_details #>> '{juros,percentualMes}')::numeric, 0),
    'multaAtrasoPercentual', v_fine,
    'multaAtrasoValor', round(v_value * v_fine / 100, 2),
    'aplicarDesconto', v_details -> 'desconto' is distinct from 'null'::jsonb,
    'aplicarMultaJuros', v_details -> 'juros' is distinct from 'null'::jsonb
      or v_details -> 'multa' is distinct from 'null'::jsonb,
    'revisaoPorItem', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_reviewed_snapshot(p_matricula_id uuid, p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_snapshot jsonb; v_entry internal_academic.technical_transfer_entry_plans%rowtype;
begin
  v_snapshot:=internal_academic.manual_cycle_reviewed_snapshot_before_transfer_schedule(p_matricula_id,p_item);
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if found and v_entry.financial_plan->'versao'='3'::jsonb then
    if not exists(select 1 from jsonb_array_elements(v_entry.financial_plan->'itens') i
      where i->>'itemId'=p_item->>'itemId' and i->>'tipo'=p_item->>'tipo') then
      raise exception 'A cobrança não pertence ao cronograma recebido.' using errcode='23514'; end if;
    return v_snapshot||jsonb_build_object('cronogramaEntradaVersao',3,'itemId',p_item->>'itemId',
      'cronogramaEntradaFingerprint',internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan),
      'recebimentoRequestId',v_entry.request_id);
  end if;
  return v_snapshot;
end;
$function$;

