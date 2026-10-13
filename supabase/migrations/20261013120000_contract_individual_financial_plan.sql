begin;

-- A contract describes the entire agreed plan, including unissued cycles.
-- This pure projection never infers installments from the course duration.
create function internal_academic.contract_financial_rule_item(
  p_rule jsonb, p_cycle integer, p_kind text, p_order integer, p_due date
)
returns jsonb language sql immutable set search_path = '' as $function$
  select jsonb_build_object(
    'cicloNumero', p_cycle, 'tipo', p_kind, 'ordem', p_order,
    'vencimento', p_due, 'fonte', 'REGRA_MATRICULA',
    'valor', (p_rule #>> array['cobranca', k.kind, 'valor'])::numeric,
    'descontoPontualidade', case when (p_rule #>> array['aplicacao', k.kind, 'desconto'])::boolean
      then (p_rule #>> '{encargos,descontoPontualidade}')::numeric else 0 end,
    'jurosAtrasoPercentual', case when (p_rule #>> array['aplicacao', k.kind, 'multaJuros'])::boolean
      then (p_rule #>> '{encargos,jurosAtrasoPercentual}')::numeric else 0 end,
    'multaAtrasoPercentual', case when (p_rule #>> array['aplicacao', k.kind, 'multaJuros'])::boolean
      then (p_rule #>> '{encargos,multaAtrasoPercentual}')::numeric else 0 end)
  from (select case p_kind when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'rematricula' else 'mensalidade' end as kind) k;
$function$;

create function internal_academic.contract_financial_plan(
  p_rule jsonb, p_entry jsonb, p_runs jsonb, p_first_due date
)
returns jsonb language plpgsql stable set search_path = '' as $function$
declare
  v_rule jsonb := p_rule;
  v_items jsonb := '[]';
  v_run jsonb;
  v_item jsonb;
  v_kind text;
  v_key text;
  v_initial integer := 1;
  v_max integer;
  v_cycle integer;
  v_count integer;
  v_number integer;
  v_order integer;
  v_day integer;
  v_fee boolean;
  v_due date;
  v_first date := p_first_due;
  v_transfer boolean := p_entry is not null and p_entry <> 'null'::jsonb;
begin
  if v_transfer then
    v_rule := p_entry -> 'rule_snapshot';
    v_initial := (p_entry ->> 'initial_cycle')::integer;
    v_first := (p_entry ->> 'first_due_date')::date;
  end if;
  v_max := (v_rule #>> '{continuidade,maxCiclos}')::integer;
  v_day := (v_rule #>> '{vencimento,diaBase}')::integer;
  if v_max is null or v_max not between 1 and 2
    or v_initial is null or v_initial not between 1 and v_max
    or v_day is null or v_day not between 1 and 31
  then
    raise exception 'Contrato: quantidade de ciclos ou vencimento sem configuração comprovada. Revise o plano financeiro individual.'
      using errcode = '55000';
  end if;

  if v_transfer and p_entry #> '{financial_plan,versao}' = '3'::jsonb then
    -- V3 may have independent dates, different values, waived fees or no fees.
    v_items := internal_academic.normalize_transfer_schedule(
      v_rule, p_entry -> 'financial_plan', false) -> 'itens';
    select coalesce(jsonb_agg(i || jsonb_build_object('fonte', 'PLANO_TRANSFERENCIA')
      order by (i ->> 'cicloNumero')::integer, (i ->> 'ordem')::integer), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) i;
  else
    for v_cycle in v_initial..v_max loop
      v_count := case when v_rule #>> '{cobranca,mensalidade,habilitada}' = 'false' then 0
        when v_transfer and v_cycle = v_initial then (p_entry ->> 'installment_count')::integer
        else (v_rule #>> '{cobranca,mensalidade,quantidade}')::integer end;
      if v_count is null or v_count not between 0 and 60
        or (v_count = 0 and v_rule #>> '{cobranca,mensalidade,habilitada}' is distinct from 'false')
      then
        raise exception 'Contrato: quantidade de mensalidades do ciclo % não comprovada. Revise o plano individual.', v_cycle
          using errcode = '55000';
      end if;
      v_kind := case when v_cycle = 1 then 'matricula' else 'rematricula' end;
      v_fee := (v_rule #>> array['cobranca', v_kind, 'habilitada'])::boolean;
      if v_fee is null then
        raise exception 'Contrato: incidência da taxa do ciclo % não comprovada.', v_cycle using errcode = '55000';
      end if;
      v_order := 0;
      -- Later manual cycles require an individually confirmed date. Do not
      -- manufacture that date from the academic end date or today's date.
      v_due := case when v_cycle = v_initial then v_first else null end;
      if v_fee then
        v_order := 1;
        v_items := v_items || jsonb_build_array(internal_academic.contract_financial_rule_item(
          v_rule, v_cycle, upper(v_kind), v_order, v_due));
      end if;
      for v_number in 1..v_count loop
        v_items := v_items || jsonb_build_array(internal_academic.contract_financial_rule_item(
          v_rule, v_cycle, 'PARCELA', v_order + v_number,
          case when v_due is null then null else public.data_vencimento_mensal(
            v_due, v_day, v_number - case when v_fee then 0 else 1 end) end));
      end loop;
    end loop;
  end if;

  if jsonb_typeof(p_runs) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_runs) r
      group by r ->> 'cycle_number' having count(*) > 1) then
    raise exception 'Contrato: evidências dos ciclos inválidas.' using errcode = '55000';
  end if;
  for v_run in select r from jsonb_array_elements(p_runs) r order by (r ->> 'cycle_number')::integer loop
    v_cycle := (v_run ->> 'cycle_number')::integer;
    if v_run ->> 'state' is distinct from 'LOCAL_CREATED'
      or v_cycle is null or v_cycle not between v_initial and v_max
      or jsonb_typeof(v_run -> 'reviewed_items') is distinct from 'array'
      or jsonb_array_length(v_run -> 'reviewed_items') is distinct from (v_run ->> 'item_count')::integer
      or (select count(*) from jsonb_array_elements(v_run -> 'reviewed_items') i
        where i ->> 'tipo' = 'PARCELA') is distinct from (v_run ->> 'expected_installment_count')::integer
    then
      raise exception 'Contrato: ciclo % em processamento ou sem termos individuais completos. Conclua a revisão financeira antes de emitir.', v_cycle
        using errcode = '55000';
    end if;
    if exists(select 1 from jsonb_array_elements(v_items) i
      where (i ->> 'cicloNumero')::integer = v_cycle and i ->> 'tipo' <> 'PARCELA')
      and not exists(select 1 from jsonb_array_elements(v_run -> 'reviewed_items') i
        where i ->> 'tipo' <> 'PARCELA')
      and (v_cycle = 1 and v_run ->> 'modoMatricula' = 'OMITIR') is not true then
      raise exception 'Contrato: ausência de taxa no ciclo % sem dispensa ou omissão explicitamente comprovada.', v_cycle
        using errcode = '55000';
    end if;
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_items from jsonb_array_elements(v_items) i
      where (i ->> 'cicloNumero')::integer <> v_cycle;
    v_order := 0;
    for v_item in select i from jsonb_array_elements(v_run -> 'reviewed_items') i loop
      -- Canonical local fee waivers are excluded by the evidence loader only.
      if v_item ->> 'dispensaComprovada' = 'true' then continue; end if;
      v_order := v_order + 1;
      if jsonb_typeof(v_item -> 'detalhesBoleto') is distinct from 'object'
        or v_item ->> 'tipo' not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
        or v_item ->> 'vencimento' is null then
        raise exception 'Contrato: item do ciclo % sem termos financeiros comprovados.', v_cycle using errcode = '55000';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'cicloNumero', v_cycle, 'tipo', v_item ->> 'tipo', 'ordem', v_order,
        'itemId', v_item ->> 'itemId', 'chave', v_item ->> 'chave',
        'valor', (v_item ->> 'valor')::numeric, 'vencimento', (v_item ->> 'vencimento')::date,
        'fonte', 'CICLO_REVISADO', 'destinoCobranca', v_item ->> 'destinoCobranca',
        'descontoPontualidade', coalesce((v_item #>> '{detalhesBoleto,desconto,valor}')::numeric, 0),
        'jurosAtrasoPercentual', coalesce((v_item #>> '{detalhesBoleto,juros,percentualMes}')::numeric, 0),
        'multaAtrasoPercentual', coalesce((v_item #>> '{detalhesBoleto,multa,percentual}')::numeric, 0)));
    end loop;
  end loop;

  -- Every amount/term must be explicit. Missing values must not silently become
  -- zero obligations, nor may an unconfigured future cycle disappear.
  for v_item in select i from jsonb_array_elements(v_items) i loop
    foreach v_key in array array['valor', 'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtrasoPercentual'] loop
      if v_item ->> v_key is null or (v_item ->> v_key)::numeric < 0 then
        raise exception 'Contrato: valor ou encargo não comprovado no plano individual.' using errcode = '55000';
      end if;
    end loop;
    if (v_item ->> 'valor')::numeric = 0
      or (v_item ->> 'descontoPontualidade')::numeric >= (v_item ->> 'valor')::numeric
      or (v_item ->> 'jurosAtrasoPercentual')::numeric >= 100
      or (v_item ->> 'multaAtrasoPercentual')::numeric >= 100 then
      raise exception 'Contrato: obrigação financeira inválida; confira valores, descontos e isenções.' using errcode = '55000';
    end if;
    if (v_item ->> 'multaAtrasoPercentual')::numeric > 2 then
      raise exception 'Contrato: multa moratória superior a 2%%. Revise as condições individuais antes da emissão; nenhum valor financeiro foi alterado.'
        using errcode = '55000';
    end if;
  end loop;
  select coalesce(jsonb_agg(i order by (i ->> 'cicloNumero')::integer, (i ->> 'ordem')::integer), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) i;
  return jsonb_build_object('versao', 1, 'itens', v_items, 'cicloInicial', v_initial,
    'cicloFinal', v_max, 'quantidadeCiclos', v_max - v_initial + 1,
    'diaBase', v_day, 'origem', case when v_transfer then 'TRANSFERENCIA_INDIVIDUAL' else p_rule ->> 'origem' end,
    'identidade', p_rule -> 'identidade');
end;
$function$;

revoke all on function internal_academic.contract_financial_rule_item(jsonb, integer, text, integer, date),
  internal_academic.contract_financial_plan(jsonb, jsonb, jsonb, date)
  from public, anon, authenticated, service_role;
commit;
