begin;

-- Project the continuous payment schedule for the contract snapshot.
-- The review and generation of actual receivables have their own workflow.
create or replace function internal_academic.contract_financial_plan(
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
  v_last_cycle_one_due date;
  v_cycle_one_reviewed boolean;
  v_cycle_two_first_due date;
  v_cycle_two_day integer;
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
      -- Future cycle dates are projected after reviewed items replace estimates.
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
  -- The contractual schedule follows the last C1 monthly due date after review.
  -- Explicit schedules and reviewed C2 items keep their recorded dates.
  if v_initial = 1 and v_max = 2 then
    select max((i ->> 'vencimento')::date), bool_or(i ->> 'fonte' = 'CICLO_REVISADO')
    into v_last_cycle_one_due, v_cycle_one_reviewed
    from jsonb_array_elements(v_items) i
    where i ->> 'cicloNumero' = '1' and i ->> 'tipo' = 'PARCELA'
    having count(i ->> 'vencimento') = count(*);
    if v_last_cycle_one_due is not null then
      if v_cycle_one_reviewed then
        -- Match the suggested first item and resulting cadence of the manual preview.
        v_cycle_two_first_due := internal_academic.technical_manual_cycle_due_from_last_boleto(v_last_cycle_one_due);
        v_cycle_two_day := extract(day from v_cycle_two_first_due)::integer;
      else
        v_cycle_two_first_due := public.data_vencimento_mensal(v_last_cycle_one_due, v_day, 1);
        v_cycle_two_day := v_day;
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(
    case when v_cycle_two_first_due is not null
      and i ->> 'cicloNumero' = '2' and i ->> 'fonte' = 'REGRA_MATRICULA'
      and i ->> 'vencimento' is null
    then i || jsonb_build_object('vencimento', public.data_vencimento_mensal(
      v_cycle_two_first_due, v_cycle_two_day, (i ->> 'ordem')::integer - 1))
    else i end
    order by (i ->> 'cicloNumero')::integer, (i ->> 'ordem')::integer
  ), '[]'::jsonb) into v_items from jsonb_array_elements(v_items) i;
  return jsonb_build_object('versao', 1, 'itens', v_items, 'cicloInicial', v_initial,
    'cicloFinal', v_max, 'quantidadeCiclos', v_max - v_initial + 1,
    'diaBase', v_day, 'origem', case when v_transfer then 'TRANSFERENCIA_INDIVIDUAL' else p_rule ->> 'origem' end,
    'identidade', p_rule -> 'identidade');
end;
$function$;

revoke all on function internal_academic.contract_financial_plan(jsonb, jsonb, jsonb, date)
  from public, anon, authenticated, service_role;

-- Generate readable payment and charge blocks for the existing template tokens.
-- The approved model and rendered snapshots remain the sources for old contracts.
create or replace function internal_academic.contract_financial_summary(p_plan jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_items jsonb := p_plan -> 'itens';
  v_row record;
  v_monthly_count integer;
  v_fee_count integer;
  v_renewal_count integer;
  v_monthly_total numeric;
  v_fee_total numeric;
  v_renewal_total numeric;
  v_monthly_value numeric;
  v_fee_value numeric;
  v_renewal_value numeric;
  v_first date;
  v_last date;
  v_due_day integer;
  v_payment_cycle integer;
  v_regular_day integer;
  v_payment text := '';
  v_conditions text := '';
  v_label text;
  v_interest text;
  v_fine text;
  v_dates text;
begin
  if jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'Contrato: plano financeiro completo obrigatório.' using errcode = '55000';
  end if;
  select count(*) filter(where i ->> 'tipo' = 'PARCELA'),
    count(*) filter(where i ->> 'tipo' = 'MATRICULA'),
    count(*) filter(where i ->> 'tipo' = 'REMATRICULA'),
    coalesce(sum((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'PARCELA'), 0),
    coalesce(sum((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'MATRICULA'), 0),
    coalesce(sum((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'REMATRICULA'), 0),
    case when count(distinct (i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'PARCELA') = 1
      then min((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'PARCELA') end,
    case when count(distinct (i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'MATRICULA') = 1
      then min((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'MATRICULA') end,
    case when count(distinct (i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'REMATRICULA') = 1
      then min((i ->> 'valor')::numeric) filter(where i ->> 'tipo' = 'REMATRICULA') end,
    min((i ->> 'vencimento')::date) filter(where i ->> 'tipo' = 'PARCELA'),
    max((i ->> 'vencimento')::date) filter(where i ->> 'tipo' = 'PARCELA'),
    case when count(distinct extract(day from (i ->> 'vencimento')::date)) filter(where i ->> 'tipo' = 'PARCELA') = 1
      then min(extract(day from (i ->> 'vencimento')::date)) filter(where i ->> 'tipo' = 'PARCELA') end
  into v_monthly_count, v_fee_count, v_renewal_count, v_monthly_total, v_fee_total,
    v_renewal_total, v_monthly_value, v_fee_value, v_renewal_value, v_first, v_last, v_due_day
  from jsonb_array_elements(v_items) i;

  for v_row in
    select (i ->> 'cicloNumero')::integer as cycle, i ->> 'tipo' as kind,
      (i ->> 'valor')::numeric as amount, count(*) as quantity,
      min((i ->> 'ordem')::integer) as first_order,
      min((i ->> 'vencimento')::date) as first_due, max((i ->> 'vencimento')::date) as last_due,
      array_agg((i ->> 'vencimento')::date order by (i ->> 'vencimento')::date)
        filter (where i ->> 'vencimento' is not null) as dates,
      count(i ->> 'vencimento') as dated_count,
      i ->> 'origem' as origin, i ->> 'dataPagamento' as paid_date
    from jsonb_array_elements(v_items) i
    group by cycle, kind, amount, origin, paid_date
    order by cycle, first_order
  loop
    if v_payment_cycle is distinct from v_row.cycle then
      v_payment := concat_ws(E'\n\n', nullif(v_payment, ''), format('Ciclo %s', v_row.cycle));
      v_payment_cycle := v_row.cycle;
    end if;

    if v_row.origin = 'RECEBIMENTO_EXTERNO_DECLARADO' then
      v_payment := v_payment || E'\nMatrícula de ' || public.formatar_valor_brl_documento(v_row.amount)
        || ', já recebida presencialmente'
        || case when v_row.paid_date is null then '' else ' em ' || to_char(v_row.paid_date::date, 'DD/MM/YYYY') end
        || ', conforme registro administrativo. Incluída no valor total do contrato, sem nova cobrança.';
      continue;
    end if;

    v_label := case v_row.kind
      when 'MATRICULA' then case when v_row.quantity = 1 then 'matrícula' else 'matrículas' end
      when 'REMATRICULA' then case when v_row.quantity = 1 then 'rematrícula' else 'rematrículas' end
      else case when v_row.quantity = 1 then 'mensalidade' else 'mensalidades' end end;
    v_regular_day := extract(day from v_row.first_due)::integer;
    -- Dates shortened at the start of a month-end schedule may still follow the
    -- configured billing day. Use it only if it matches every recorded date.
    select days.day into v_regular_day
    from (values (v_regular_day, 1), ((p_plan ->> 'diaBase')::integer, 2)) as days(day, preference)
    where v_row.quantity > 1 and v_row.dated_count = v_row.quantity and days.day is not null
      and not exists (
        select 1
        from unnest(v_row.dates) with ordinality as due(value, position)
        where due.value is distinct from
          public.data_vencimento_mensal(v_row.first_due, days.day, (due.position - 1)::integer)
      )
    order by days.preference
    limit 1;
    if v_row.dated_count = 0 then
      v_dates := case when v_row.quantity = 1 then 'vencimento a confirmar individualmente'
        else 'vencimentos a confirmar individualmente' end;
    elsif v_row.quantity = 1 then
      v_dates := 'vencimento em ' || to_char(v_row.first_due, 'DD/MM/YYYY');
    elsif v_regular_day is not null then
      v_dates := 'mensalmente no dia ' || v_regular_day
        || case when v_regular_day > 28 then ' (ou no último dia do mês, quando necessário)' else '' end
        || ', de ' || to_char(v_row.first_due, 'DD/MM/YYYY') || ' a ' || to_char(v_row.last_due, 'DD/MM/YYYY');
    else
      select 'vencimentos em ' || string_agg(to_char(d, 'DD/MM/YYYY'), ', ' order by d)
        into v_dates from unnest(v_row.dates) d;
      if v_row.dated_count < v_row.quantity then
        v_dates := v_dates || '. Demais vencimentos a confirmar individualmente';
      end if;
    end if;
    v_payment := v_payment || format(E'\n%s %s de %s (%s).',
      v_row.quantity, v_label, public.formatar_valor_brl_documento(v_row.amount), v_dates);
  end loop;
  if v_payment = '' then v_payment := 'Sem cobranças previstas neste plano individual.'; end if;

  -- Keep distinct sets of monetary terms. An enrollment already paid outside
  -- the system is only displayed in the payment plan and included in the total.
  for v_row in
    with charges as (
      select i ->> 'tipo' as kind, (i ->> 'cicloNumero')::integer as cycle,
        (i ->> 'ordem')::integer as item_order, (i ->> 'vencimento')::date as due_date,
        (i ->> 'descontoPontualidade')::numeric as discount,
        (i ->> 'jurosAtrasoPercentual')::numeric as interest,
        (i ->> 'multaAtrasoPercentual')::numeric as fine
      from jsonb_array_elements(v_items) i
      where i ->> 'origem' is distinct from 'RECEBIMENTO_EXTERNO_DECLARADO'
    ), numbered as (
      select *, row_number() over (partition by cycle, kind order by item_order) as item_number,
        count(*) over (partition by cycle, kind) <>
          count(*) over (partition by cycle, kind, discount, interest, fine) as mixed_terms
      from charges
    )
    select kind, discount, interest, fine,
      count(*) as quantity, count(distinct cycle) as cycle_count,
      string_agg(distinct cycle::text, ' e ' order by cycle::text) as cycles,
      string_agg(format('a cobrança nº %s do ciclo %s%s', item_number, cycle,
        coalesce(' (' || to_char(due_date, 'DD/MM/YYYY') || ')', '')), ', ' order by cycle, item_number)
        filter (where mixed_terms) as identified_items
    from numbered
    group by kind, discount, interest, fine
    order by kind, discount, interest, fine
  loop
    v_label := case v_row.kind
      when 'MATRICULA' then case when v_row.quantity = 1 then 'matrícula' else 'matrículas' end
      when 'REMATRICULA' then case when v_row.quantity = 1 then 'rematrícula' else 'rematrículas' end
      else case when v_row.quantity = 1 then 'mensalidade' else 'mensalidades' end end;
    v_interest := replace(trim(trailing '.' from trim(trailing '0' from to_char(v_row.interest, 'FM990.000000'))), '.', ',');
    v_fine := replace(trim(trailing '.' from trim(trailing '0' from to_char(v_row.fine, 'FM990.000000'))), '.', ',');
    v_conditions := concat_ws(E'\n\n', nullif(v_conditions, ''), concat_ws(E'\n',
      format('%s %s %s %s', v_row.quantity, v_label,
        case when v_row.cycle_count = 1 then 'do ciclo' else 'dos ciclos' end, v_row.cycles),
      'Nos ciclos com condições distintas, este grupo abrange ' || v_row.identified_items || '.',
      case when v_row.discount > 0 then 'Desconto de pontualidade de '
        || public.formatar_valor_brl_documento(v_row.discount) || ' por cobrança, para pagamento até o vencimento.'
        else 'Sem desconto de pontualidade.' end,
      case when v_row.interest > 0 then 'Juros de ' || v_interest || '% ao mês, proporcionais aos dias de atraso.'
        else 'Sem juros por atraso.' end,
      case when v_row.fine > 0 then 'Multa única de ' || v_fine || '% sobre o valor principal da cobrança em atraso.'
        else 'Sem multa por atraso.' end));
  end loop;
  if v_conditions = '' then v_conditions := 'Sem cobranças, descontos ou encargos previstos neste plano individual.'; end if;

  return jsonb_build_object(
    'versaoPlanoContratual', 1, 'planoContratual', p_plan,
    'quantidadeCiclos', (p_plan ->> 'quantidadeCiclos')::integer,
    'quantidadeParcelas', v_monthly_count,
    'valorParcela', v_monthly_value,
    'valorParcelaExibicao', case when v_monthly_count = 0 then 'Não aplicável'
      when v_monthly_value is null then 'Valores discriminados no plano de pagamento'
      else public.formatar_valor_brl_documento(v_monthly_value) end,
    'valorTotalMensalidades', v_monthly_total,
    'valorTotalMensalidadesExibicao', public.formatar_valor_brl_documento(v_monthly_total),
    'quantidadeMatriculas', v_fee_count, 'valorMatricula', coalesce(v_fee_value, 0),
    'valorMatriculaExibicao', case when v_fee_count = 0 then 'Não prevista neste plano'
      else public.formatar_valor_brl_documento(v_fee_value) end,
    'valorTotalMatriculas', v_fee_total,
    'valorTotalMatriculasExibicao', public.formatar_valor_brl_documento(v_fee_total),
    'quantidadeRematriculas', v_renewal_count, 'valorRematricula', coalesce(v_renewal_value, 0),
    'valorRematriculaExibicao', case when v_renewal_count = 0 then 'Não prevista neste plano'
      else public.formatar_valor_brl_documento(v_renewal_value) end,
    'valorTotalRematriculas', v_renewal_total,
    'valorTotalRematriculasExibicao', public.formatar_valor_brl_documento(v_renewal_total),
    'valorTotalContrato', v_monthly_total + v_fee_total + v_renewal_total,
    'valorTotalContratoExibicao', public.formatar_valor_brl_documento(v_monthly_total + v_fee_total + v_renewal_total),
    'planoPagamentoExibicao', E'\n' || rtrim(v_payment, '.'),
    'condicoesExibicao', E'\n' || rtrim(v_conditions, '.'),
    'diaVencimento', case when v_monthly_count = 0 then 'Não aplicável'
      when v_due_day is not null then v_due_day::text
      when v_first is null then 'A confirmar no cronograma individual'
      else 'Conforme os vencimentos individuais de cada cobrança' end,
    'primeiroVencimento', v_first,
    'primeiroVencimentoExibicao', case when v_monthly_count = 0 then 'Não aplicável'
      when v_first is null then 'A confirmar no cronograma individual' else to_char(v_first, 'DD/MM/YYYY') end,
    'ultimoVencimentoConfirmado', v_last,
    'vencimentosPendentesConfirmacao', exists(select 1 from jsonb_array_elements(v_items) i where i ->> 'vencimento' is null
      and i ->> 'origem' is distinct from 'RECEBIMENTO_EXTERNO_DECLARADO')
  );
end;
$function$;

revoke all on function internal_academic.contract_financial_summary(jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.contract_summary_with_external_enrollment(
  p_matricula_id uuid, p_plan jsonb
)
returns jsonb language plpgsql set search_path = '' as $function$
declare
  v_receipt internal_academic.contract_external_enrollment_receipts%rowtype;
  v_base jsonb;
  v_result jsonb;
  v_item jsonb;
begin
  v_base := internal_academic.contract_financial_summary(p_plan);
  select e.* into v_receipt from internal_academic.contract_external_enrollment_receipts e
    where e.matricula_id = p_matricula_id for share nowait;
  if not found then return v_base; end if;

  -- A regenerated or changed cycle must be reconciled before reusing evidence.
  if not exists (
    select 1 from public.matriculas m
    join internal_academic.technical_manual_cycle_runs r on r.matricula_id = m.id
    join internal_academic.technical_financial_requests q on q.request_id = r.request_id
      and q.operation = 'GERACAO_CICLO_TECNICO_MANUAL'
    where m.id = p_matricula_id and m.turma_id = v_receipt.turma_id
      and r.turma_id = m.turma_id and r.cycle_number = 1 and r.state = 'LOCAL_CREATED'
      and r.request_id = v_receipt.first_cycle_request_id
      and q.response #>> '{ciclo,numero}' = '1'
      and q.response #>> '{ciclo,quantidadeItens}' = r.item_count::text
      and (
        (q.response #>> '{ciclo,modoMatricula}' = 'OMITIR'
          and not exists (select 1 from jsonb_array_elements(r.reviewed_items) i where i->>'tipo' = 'MATRICULA'))
        or (q.response #>> '{ciclo,modoMatricula}' = 'REGISTRO_SEM_BOLETO'
          and (select count(*) from jsonb_array_elements(r.reviewed_items) i where i->>'tipo' = 'MATRICULA') = 1
          and exists (select 1 from public.contas_receber c
            where c.id = any(r.receivable_ids) and c.matricula_id = m.id and c.turma_id = m.turma_id
              and c.origem_cronograma_id = 'matricula' and c.valor = v_receipt.amount
              and internal_academic.contract_local_waiver_complete(c)))
      )
  ) or (v_base->>'quantidadeMatriculas')::integer <> 0 then
    raise exception 'Contrato: matrícula recebida externamente conflita com o ciclo atual. Revise o registro antes de emitir.'
      using errcode = '55000';
  end if;

  v_item := jsonb_build_object('tipo', 'MATRICULA', 'cicloNumero', 1, 'ordem', 0,
    'valor', v_receipt.amount, 'vencimento', null,
    'descontoPontualidade', 0, 'jurosAtrasoPercentual', 0, 'multaAtrasoPercentual', 0,
    'origem', 'RECEBIMENTO_EXTERNO_DECLARADO', 'situacao', 'PAGO_FORA_DO_SISTEMA',
    'dataPagamento', v_receipt.payment_date, 'registradoEm', v_receipt.recorded_at,
    'referenciaRegistro', v_receipt.operation_reference, 'incluiSaldoACobrar', false);
  v_result := internal_academic.contract_financial_summary(jsonb_set(p_plan, '{itens}',
    jsonb_build_array(v_item) || (p_plan->'itens')));
  return v_result || jsonb_build_object(
    'valorMatriculaRecebidoExternamente', v_receipt.amount,
    'recebimentoExternoMatricula', v_item);
end;
$function$;
revoke all on function internal_academic.contract_summary_with_external_enrollment(uuid,jsonb)
  from public, anon, authenticated, service_role;

commit;
