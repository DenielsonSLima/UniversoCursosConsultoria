begin;

create function internal_academic.contract_financial_summary(p_plan jsonb)
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
  v_payment text := '';
  v_conditions text := '';
  v_label text;
  v_interest text;
  v_fine text;
  v_dates text;
  v_group_dates date[];
  v_regular boolean;
  v_index integer;
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
      array_agg((i ->> 'vencimento')::date order by (i ->> 'vencimento')::date) as dates,
      count(i ->> 'vencimento') as dated_count
    from jsonb_array_elements(v_items) i
    group by (i ->> 'cicloNumero')::integer, i ->> 'tipo', (i ->> 'valor')::numeric
    order by cycle, first_order
  loop
    v_label := case v_row.kind when 'MATRICULA' then 'matrícula(s)'
      when 'REMATRICULA' then 'rematrícula(s)' else 'mensalidade(s)' end;
    v_group_dates := v_row.dates;
    v_regular := v_row.quantity > 1 and v_row.dated_count = v_row.quantity;
    if v_regular then
      for v_index in 1..v_row.quantity loop
        if v_group_dates[v_index] is distinct from public.data_vencimento_mensal(
          v_row.first_due, extract(day from v_row.first_due)::integer, v_index - 1) then
          v_regular := false;
          exit;
        end if;
      end loop;
    end if;
    if v_row.dated_count <> v_row.quantity then
      v_dates := 'vencimentos a confirmar individualmente';
    elsif v_row.quantity = 1 then
      v_dates := 'vencimento em ' || to_char(v_row.first_due, 'DD/MM/YYYY');
    elsif v_regular then
      v_dates := 'mensalmente no dia ' || extract(day from v_row.first_due)::integer
        || ', de ' || to_char(v_row.first_due, 'DD/MM/YYYY') || ' a ' || to_char(v_row.last_due, 'DD/MM/YYYY');
    else
      select 'vencimentos em ' || string_agg(to_char(d, 'DD/MM/YYYY'), ', ' order by d)
        into v_dates from unnest(v_group_dates) d;
    end if;
    v_payment := concat_ws('; ', nullif(v_payment, ''), format('ciclo %s: %s %s de %s (%s)',
      v_row.cycle, v_row.quantity, v_label, public.formatar_valor_brl_documento(v_row.amount),
      v_dates));
  end loop;
  if jsonb_array_length(v_items) = 0 then v_payment := 'Sem cobranças previstas neste plano individual'; end if;

  -- Group by the actual terms, never use one monetary fine as a second charge.
  for v_row in
    select i ->> 'tipo' as kind,
      (i ->> 'descontoPontualidade')::numeric as discount,
      (i ->> 'jurosAtrasoPercentual')::numeric as interest,
      (i ->> 'multaAtrasoPercentual')::numeric as fine,
      count(*) as quantity,
      string_agg(distinct i ->> 'cicloNumero', ', ' order by i ->> 'cicloNumero') as cycles
    from jsonb_array_elements(v_items) i
    group by i ->> 'tipo', (i ->> 'descontoPontualidade')::numeric,
      (i ->> 'jurosAtrasoPercentual')::numeric, (i ->> 'multaAtrasoPercentual')::numeric
    order by kind, discount, interest, fine
  loop
    v_label := case v_row.kind when 'MATRICULA' then 'matrícula(s)'
      when 'REMATRICULA' then 'rematrícula(s)' else 'mensalidade(s)' end;
    v_interest := replace(trim(trailing '.' from trim(trailing '0' from to_char(v_row.interest, 'FM990.000000'))), '.', ',');
    v_fine := replace(trim(trailing '.' from trim(trailing '0' from to_char(v_row.fine, 'FM990.000000'))), '.', ',');
    v_conditions := concat_ws('; ', nullif(v_conditions, ''), format('%s %s do(s) ciclo(s) %s: %s; %s; %s',
      v_row.quantity, v_label, v_row.cycles,
      case when v_row.discount > 0 then 'desconto de pontualidade de '
        || public.formatar_valor_brl_documento(v_row.discount) || ' por cobrança, para pagamento até o vencimento'
        else 'sem desconto de pontualidade' end,
      case when v_row.interest > 0 then 'juros de ' || v_interest || '% ao mês, proporcionais aos dias de atraso'
        else 'sem juros por atraso' end,
      case when v_row.fine > 0 then 'multa única de ' || v_fine || '% sobre o valor principal da cobrança em atraso'
        else 'sem multa por atraso' end));
  end loop;
  if v_conditions = '' then v_conditions := 'Sem cobranças, descontos ou encargos previstos neste plano individual'; end if;

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
    'planoPagamentoExibicao', v_payment,
    'condicoesExibicao', v_conditions,
    'diaVencimento', case when v_monthly_count = 0 then 'Não aplicável'
      when v_due_day is not null then v_due_day::text
      when v_first is null then 'A confirmar no cronograma individual'
      else 'Conforme os vencimentos individuais de cada cobrança' end,
    'primeiroVencimento', v_first,
    'primeiroVencimentoExibicao', case when v_monthly_count = 0 then 'Não aplicável'
      when v_first is null then 'A confirmar no cronograma individual' else to_char(v_first, 'DD/MM/YYYY') end,
    'ultimoVencimentoConfirmado', v_last,
    'vencimentosPendentesConfirmacao', exists(select 1 from jsonb_array_elements(v_items) i where i ->> 'vencimento' is null)
  );
end;
$function$;

revoke all on function internal_academic.contract_financial_summary(jsonb)
  from public, anon, authenticated, service_role;
commit;
