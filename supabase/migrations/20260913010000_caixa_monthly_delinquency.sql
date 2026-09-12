begin;

-- Private, deterministic date/status contract. A discounted settlement pays
-- the obligation; its cash amount is never subtracted from nominal principal.
create function internal_contas.caixa_monthly_receivable_state(
  p_status text,p_payment_date date,p_payment_cutoff_exclusive date,
  p_requires_review boolean,p_received_amount numeric
) returns text language sql immutable set search_path='' as $$
  select case
    when p_status not in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      or p_status is null then 'EXCLUDED'
    when p_requires_review then 'REVIEW'
    when p_status='PAGO' and p_payment_date is null then 'REVIEW'
    when p_status<>'PAGO' and coalesce(p_received_amount,0)>0 then 'REVIEW'
    when p_status='PAGO' and p_payment_date<p_payment_cutoff_exclusive then 'SETTLED'
    else 'OUTSTANDING' end;
$$;

create function internal_contas.caixa_monthly_delinquency(
  p_polo_id uuid,p_competencia date,p_today date
) returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select date_trunc('month',p_competencia)::date inicio,
      (date_trunc('month',p_competencia)+interval '1 month')::date fim
  ), cutoff as (
    select b.*,least(p_today,b.fim-1) data_corte,
      least(p_today,b.fim) overdue_exclusive,
      least(p_today+1,b.fim) payment_exclusive from bounds b
  ), source_rows as materialized (
    select c.id,c.status,c.valor,c.valor_pago,c.data_vencimento,c.data_pagamento,b.*,
      case when l.id is null then false
        when internal_proesc.reconciliation_source_system(c)<>'PROESC' then true
        when f.verification is distinct from 'VERIFIED' then true
        when c.status='PAGO' then f.source_status is distinct from 'PAID'
          or f.principal_cents is distinct from round(c.valor*100)::bigint
          or f.received_cents is distinct from round(c.valor_pago*100)::bigint
          or f.payment_date is distinct from c.data_pagamento
        else f.source_status is distinct from 'OPEN' end requires_review
    from public.contas_receber c cross join cutoff b
    left join internal_proesc.obligation_links l on l.receivable_id=c.id
    left join lateral(select s.verification,s.source_status,s.principal_cents,s.received_cents,s.payment_date
      from internal_proesc.financial_snapshots s where s.link_id=l.id
      order by s.observed_at desc,s.recorded_at desc,s.id desc limit 1) f on true
    where c.data_vencimento>=b.inicio and c.data_vencimento<b.fim
      and (p_polo_id is null or c.polo_id=p_polo_id)
      and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      and not exists(select 1 from public.emprestimos_financeiros e where e.conta_receber_id=c.id)
      -- Never turn a merely prepared manual cycle into an issued obligation.
      and not (c.status<>'PAGO' and c.regra_financeira_tecnica_snapshot->'cicloManual' is not null
        and c.gateway_payment_id is null and c.gateway_boleto_nosso_numero is null
        and not exists(select 1 from public.payment_gateway_cnab_records r where r.receivable_id=c.id
          and r.provider_code in ('banese','banese_card') and r.status in ('RECORDED','ACTIVATION_PENDING','ACTIVATED')))
  ), positioned as materialized (
    select s.*,internal_contas.caixa_monthly_receivable_state(s.status,s.data_pagamento,
      s.payment_exclusive,s.requires_review,s.valor_pago) position from source_rows s
  ), totals as (
    select coalesce(sum(valor) filter(where position in ('SETTLED','OUTSTANDING')),0) base,
      count(*) filter(where position in ('SETTLED','OUTSTANDING')) eligible_count,
      coalesce(sum(valor) filter(where position='OUTSTANDING' and data_vencimento<overdue_exclusive),0) overdue,
      count(*) filter(where position='REVIEW') review_count,
      coalesce(sum(valor) filter(where position='REVIEW'),0) review_principal from positioned
  )
  select jsonb_build_object('receber_vencido',t.overdue,
    'margem_inadimplencia',case when t.base>0 then round(t.overdue/t.base*100,2) else 0 end,
    'inadimplencia_mensal',jsonb_build_object('periodo_inicio',b.inicio,'periodo_fim_exclusivo',b.fim,
      'data_corte',b.data_corte,'base_elegivel',t.base,'quantidade_elegiveis',t.eligible_count,
      'quantidade_em_conferencia',t.review_count,'valor_nominal_em_conferencia',t.review_principal,
      'completo',t.review_count=0,'criterio','VENCIMENTO_MENSAL_POSICAO_NO_CORTE'))
  from totals t cross join cutoff b;
$$;
revoke all on function internal_contas.caixa_monthly_receivable_state(text,date,date,boolean,numeric),
  internal_contas.caixa_monthly_delinquency(uuid,date,date) from public,anon,authenticated,service_role;

-- Preserve the operational-financing wrapper. Only the two requested KPI
-- fields and their evidence metadata are replaced after its existing auth guard.
CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb;
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_credito_financiamento numeric := 0;
  v_credito_quantidade integer := 0;
  v_saida_financiamento numeric := 0;
  v_saida_quantidade integer := 0;
  v_resumo jsonb;
  v_entradas numeric := 0;
  v_saidas numeric := 0;
  v_resultado numeric := 0;
  v_recebimentos integer := 0;
  v_pagamentos integer := 0;
  v_receitas_modalidades jsonb := '[]'::jsonb;
  v_despesas_categorias jsonb := '[]'::jsonb;
  v_serie_mensal jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_caixa_prestacao_mensal_secure_raw(
    p_polo_id,
    p_competencia,
    p_meses_historico
  );

  SELECT
    coalesce(sum(coalesce(cr.valor_pago, cr.valor, 0)), 0),
    count(*)::integer
  INTO v_credito_financiamento, v_credito_quantidade
  FROM public.emprestimos_financeiros emprestimo
  JOIN public.contas_receber cr ON cr.id = emprestimo.conta_receber_id
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= v_inicio
    AND cr.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id);

  SELECT
    coalesce(sum(coalesce(cp.valor_pago, cp.valor, 0)), 0),
    count(*)::integer
  INTO v_saida_financiamento, v_saida_quantidade
  FROM public.contas_pagar cp
  WHERE cp.status = 'PAGO'
    AND cp.emprestimo_parcela_id IS NOT NULL
    AND cp.data_pagamento >= v_inicio
    AND cp.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id);

  v_resumo := coalesce(v_payload -> 'resumo_competencia', '{}'::jsonb);
  v_entradas := greatest(0, coalesce((v_resumo ->> 'entradas_recebidas_brutas')::numeric, 0) - v_credito_financiamento);
  v_saidas := greatest(0, coalesce((v_resumo ->> 'saidas_pagas')::numeric, 0) - v_saida_financiamento);
  v_resultado := v_entradas - v_saidas;
  v_recebimentos := greatest(0, coalesce((v_resumo ->> 'quantidade_recebimentos')::integer, 0) - v_credito_quantidade);
  v_pagamentos := greatest(0, coalesce((v_resumo ->> 'quantidade_pagamentos')::integer, 0) - v_saida_quantidade);

  v_payload := jsonb_set(
    v_payload,
    '{resumo_competencia}',
    v_resumo || jsonb_build_object(
      'entradas_recebidas_brutas', v_entradas,
      'saidas_pagas', v_saidas,
      'resultado', v_resultado,
      'resultado_status', CASE
        WHEN v_resultado > 0 THEN 'POSITIVO'
        WHEN v_resultado < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'quantidade_recebimentos', v_recebimentos,
      'quantidade_pagamentos', v_pagamentos
    ),
    true
  );

  WITH itens AS (
    SELECT item, ordinal, item ->> 'codigo' AS codigo,
      coalesce((item ->> 'valor')::numeric, 0) AS valor,
      coalesce((item ->> 'quantidade')::integer, 0) AS quantidade
    FROM jsonb_array_elements(coalesce(v_payload -> 'receitas_por_modalidade', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), ajustados AS (
    SELECT item, ordinal,
      CASE WHEN codigo = 'OUTROS_CREDITOS' THEN greatest(0, valor - v_credito_financiamento) ELSE valor END AS valor,
      CASE WHEN codigo = 'OUTROS_CREDITOS' THEN greatest(0, quantidade - v_credito_quantidade) ELSE quantidade END AS quantidade
    FROM itens
  ), total AS (
    SELECT coalesce(sum(valor), 0) AS valor FROM ajustados
  )
  SELECT coalesce(jsonb_agg(
    ajustados.item || jsonb_build_object(
      'valor', ajustados.valor,
      'quantidade', ajustados.quantidade,
      'percentual', CASE WHEN total.valor = 0 THEN 0 ELSE round((ajustados.valor / total.valor) * 100, 2) END
    ) ORDER BY ajustados.ordinal
  ), '[]'::jsonb)
  INTO v_receitas_modalidades
  FROM ajustados CROSS JOIN total;

  v_payload := jsonb_set(v_payload, '{receitas_por_modalidade}', v_receitas_modalidades, true);

  WITH itens AS (
    SELECT item, ordinal, item ->> 'codigo' AS codigo,
      coalesce((item ->> 'valor')::numeric, 0) AS valor,
      coalesce((item ->> 'quantidade')::integer, 0) AS quantidade
    FROM jsonb_array_elements(coalesce(v_payload -> 'despesas_por_categoria', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), ajustados AS (
    SELECT item, ordinal,
      CASE WHEN codigo = 'OUTRAS_DESPESAS' THEN greatest(0, valor - v_saida_financiamento) ELSE valor END AS valor,
      CASE WHEN codigo = 'OUTRAS_DESPESAS' THEN greatest(0, quantidade - v_saida_quantidade) ELSE quantidade END AS quantidade
    FROM itens
  ), total AS (
    SELECT coalesce(sum(valor), 0) AS valor FROM ajustados
  )
  SELECT coalesce(jsonb_agg(
    ajustados.item || jsonb_build_object(
      'valor', ajustados.valor,
      'quantidade', ajustados.quantidade,
      'percentual', CASE WHEN total.valor = 0 THEN 0 ELSE round((ajustados.valor / total.valor) * 100, 2) END
    ) ORDER BY ajustados.ordinal
  ), '[]'::jsonb)
  INTO v_despesas_categorias
  FROM ajustados CROSS JOIN total;

  v_payload := jsonb_set(v_payload, '{despesas_por_categoria}', v_despesas_categorias, true);

  WITH serie AS (
    SELECT item, ordinal, (item ->> 'competencia')::date AS competencia,
      coalesce((item ->> 'entradas')::numeric, 0) AS entradas,
      coalesce((item ->> 'saidas')::numeric, 0) AS saidas
    FROM jsonb_array_elements(coalesce(v_payload -> 'serie_mensal', '[]'::jsonb))
      WITH ORDINALITY AS origem(item, ordinal)
  ), financiamento AS (
    SELECT date_trunc('month', cr.data_pagamento)::date AS competencia,
      coalesce(sum(coalesce(cr.valor_pago, cr.valor, 0)), 0) AS entradas,
      0::numeric AS saidas
    FROM public.emprestimos_financeiros emprestimo
    JOIN public.contas_receber cr ON cr.id = emprestimo.conta_receber_id
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento IS NOT NULL
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
    GROUP BY date_trunc('month', cr.data_pagamento)::date

    UNION ALL

    SELECT date_trunc('month', cp.data_pagamento)::date,
      0::numeric,
      coalesce(sum(coalesce(cp.valor_pago, cp.valor, 0)), 0)
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.emprestimo_parcela_id IS NOT NULL
      AND cp.data_pagamento IS NOT NULL
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    GROUP BY date_trunc('month', cp.data_pagamento)::date
  ), financiamento_mes AS (
    SELECT competencia, sum(entradas) AS entradas, sum(saidas) AS saidas
    FROM financiamento
    GROUP BY competencia
  ), ajustada AS (
    SELECT serie.item, serie.ordinal,
      greatest(0, serie.entradas - coalesce(financiamento_mes.entradas, 0)) AS entradas,
      greatest(0, serie.saidas - coalesce(financiamento_mes.saidas, 0)) AS saidas
    FROM serie
    LEFT JOIN financiamento_mes ON financiamento_mes.competencia = serie.competencia
  ), escala AS (
    SELECT greatest(coalesce(max(entradas), 0), coalesce(max(saidas), 0)) AS maximo
    FROM ajustada
  )
  SELECT coalesce(jsonb_agg(
    ajustada.item || jsonb_build_object(
      'entradas', ajustada.entradas,
      'saidas', ajustada.saidas,
      'resultado', ajustada.entradas - ajustada.saidas,
      'resultado_status', CASE
        WHEN ajustada.entradas - ajustada.saidas > 0 THEN 'POSITIVO'
        WHEN ajustada.entradas - ajustada.saidas < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'entradas_escala_percentual', CASE WHEN escala.maximo = 0 THEN 0 ELSE round((ajustada.entradas / escala.maximo) * 100, 2) END,
      'saidas_escala_percentual', CASE WHEN escala.maximo = 0 THEN 0 ELSE round((ajustada.saidas / escala.maximo) * 100, 2) END
    ) ORDER BY ajustada.ordinal
  ), '[]'::jsonb)
  INTO v_serie_mensal
  FROM ajustada CROSS JOIN escala;

  v_payload := jsonb_set(v_payload, '{serie_mensal}', v_serie_mensal, true);
  RETURN jsonb_set(v_payload, '{compromissos}',
    coalesce(v_payload->'compromissos','{}'::jsonb) || internal_contas.caixa_monthly_delinquency(
      p_polo_id,p_competencia,(now() at time zone 'America/Maceio')::date),true);
END;
$function$;


notify pgrst,'reload schema';
commit;
