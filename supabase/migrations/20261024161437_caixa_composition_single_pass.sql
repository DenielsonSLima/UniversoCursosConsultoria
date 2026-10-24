BEGIN;

-- V1 remains unchanged. V2 computes its totals and review classification in
-- the same pass, instead of reading both report cores again after calling V1.
CREATE OR REPLACE FUNCTION public.get_caixa_composicao_mensal_v2_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone('America/Maceio',pg_catalog.now())::date
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_inicio date;
  v_fim date;
  v_resumo jsonb;
  v_result jsonb;
  v_row record;
  v_expected_total numeric;
  v_expected_count integer;
  v_complete boolean;
BEGIN
  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Competência obrigatória para a composição mensal do Caixa.' USING ERRCODE='22023';
  END IF;
  v_inicio:=pg_catalog.date_trunc('month',p_competencia)::date;
  v_fim:=(v_inicio+pg_catalog.make_interval(months=>1))::date;

  -- Preserve V1's identity/module/polo authorization and independent canonical
  -- reconciliation. This call must precede every privileged report-core read.
  v_resumo:=public.get_caixa_prestacao_mensal_secure(p_polo_id,v_inicio,1)->'resumo_competencia';
  IF pg_catalog.jsonb_typeof(v_resumo) IS DISTINCT FROM 'object'
    OR NOT v_resumo ?& ARRAY['entradas_recebidas_brutas','saidas_pagas',
      'quantidade_recebimentos','quantidade_pagamentos'] THEN
    RAISE EXCEPTION 'Resumo canônico do Caixa sem campos de conciliação.' USING ERRCODE='P0001';
  END IF;
  v_result:=pg_catalog.jsonb_build_object(
    'versao',2,'competencia',v_inicio,'periodo_inicio',v_inicio,'periodo_fim_exclusivo',v_fim,
    'escopo_tipo',CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id',p_polo_id,'gerado_em',pg_catalog.statement_timestamp());

  FOR v_row IN
    WITH movements AS (
      SELECT 'recebimentos'::text section,r.valor_recebido total,r.valor_base base,
        r.juros,r.multa,r.acrescimo,r.desconto,r.diferenca_nao_discriminada difference,
        (r.composicao_status IS NULL OR r.valor_base IS NULL
          OR r.juros IS NULL OR r.multa IS NULL OR r.acrescimo IS NULL
          OR r.desconto IS NULL OR r.diferenca_nao_discriminada IS NULL
          OR r.composicao_status IN (
            'NAO_DISCRIMINADA_PELO_GATEWAY','NAO_DISCRIMINADA','PARCIAL_POR_API_PROESC')
          OR (r.composicao_status IN (
            'CALCULADO_REGRA_INFORMADA_PROESC','API_E_REGRA_INFORMADA_PROESC')
            AND coalesce(r.diferenca_nao_discriminada,0)<>0)) incomplete
      FROM public.get_caixa_relatorio_recebimentos_core(p_polo_id,v_inicio,v_fim) r
      UNION ALL
      SELECT 'despesas',d.valor_pago,d.valor_base,d.juros,d.multa,d.acrescimo,d.desconto,
        d.diferenca_nao_discriminada,
        (d.composicao_status IS NULL OR d.valor_base IS NULL
          OR d.juros IS NULL OR d.multa IS NULL OR d.acrescimo IS NULL
          OR d.desconto IS NULL OR d.diferenca_nao_discriminada IS NULL
          OR d.composicao_status='NAO_DISCRIMINADA')
      FROM public.get_caixa_relatorio_despesas_core(p_polo_id,v_inicio,v_fim) d
    ), totals AS (
      SELECT section,count(*)::integer quantity,coalesce(sum(total),0) total,
        CASE WHEN count(*) FILTER(WHERE base IS NULL)>0 THEN NULL ELSE sum(base) END base,
        sum(juros) juros,sum(multa) multa,sum(acrescimo) acrescimo,sum(desconto) desconto,
        CASE WHEN count(*) FILTER(WHERE difference IS NULL)>0 THEN NULL ELSE sum(difference) END difference,
        count(*) FILTER(WHERE incomplete)::integer review_count,
        count(*) FILTER(WHERE incomplete AND difference=0)::integer no_detail_count,
        count(*) FILTER(WHERE incomplete AND difference IS DISTINCT FROM 0)::integer difference_count
      FROM movements GROUP BY section
    )
    SELECT names.section,coalesce(t.quantity,0) quantity,coalesce(t.total,0) total,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.base END base,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.juros END juros,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.multa END multa,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.acrescimo END acrescimo,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.desconto END desconto,
      CASE WHEN t.quantity IS NULL THEN 0 ELSE t.difference END difference,
      coalesce(t.review_count,0) review_count,coalesce(t.no_detail_count,0) no_detail_count,
      coalesce(t.difference_count,0) difference_count
    FROM (VALUES('recebimentos'),('despesas')) names(section)
    LEFT JOIN totals t ON t.section=names.section
  LOOP
    BEGIN
      v_expected_total:=(v_resumo->>CASE v_row.section WHEN 'recebimentos'
        THEN 'entradas_recebidas_brutas' ELSE 'saidas_pagas' END)::numeric;
      v_expected_count:=(v_resumo->>CASE v_row.section WHEN 'recebimentos'
        THEN 'quantidade_recebimentos' ELSE 'quantidade_pagamentos' END)::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Resumo canônico do Caixa com campos de conciliação inválidos.' USING ERRCODE='P0001';
    END;
    IF v_expected_total IS NULL OR v_expected_count IS NULL THEN
      RAISE EXCEPTION 'Resumo canônico do Caixa com conciliação nula.' USING ERRCODE='P0001';
    END IF;
    IF pg_catalog.round(v_row.total,2) IS DISTINCT FROM pg_catalog.round(v_expected_total,2)
      OR v_row.quantity IS DISTINCT FROM v_expected_count THEN
      RAISE EXCEPTION 'A composição mensal diverge do resumo canônico do Caixa.' USING ERRCODE='P0001';
    END IF;
    IF v_row.no_detail_count+v_row.difference_count IS DISTINCT FROM v_row.review_count THEN
      RAISE EXCEPTION 'Classificação da composição diverge da projeção canônica.' USING ERRCODE='P0001';
    END IF;
    v_complete:=v_row.review_count=0;
    IF v_complete AND v_row.base IS NOT NULL AND v_row.juros IS NOT NULL
      AND v_row.multa IS NOT NULL AND v_row.acrescimo IS NOT NULL
      AND v_row.desconto IS NOT NULL AND v_row.difference IS NOT NULL
      AND pg_catalog.abs(v_row.total-v_row.base-v_row.juros-v_row.multa-v_row.acrescimo
        +v_row.desconto-v_row.difference)>0.005 THEN
      RAISE EXCEPTION 'Componentes financeiros não fecham com os totais mensais.' USING ERRCODE='P0001';
    END IF;
    v_result:=pg_catalog.jsonb_set(v_result,ARRAY[v_row.section],pg_catalog.jsonb_build_object(
      'disponivel',true,'completo',v_complete,
      'motivo',CASE WHEN v_complete THEN NULL ELSE 'DADOS_INCOMPLETOS' END,
      'observacao',CASE WHEN v_complete THEN NULL ELSE
        'Diferença líquida zero não comprova os componentes do pagamento. Componentes não informados não integram os subtotais.' END,
      'dados',pg_catalog.jsonb_build_object(
        'total',v_row.total::numeric(30,2)::text,'quantidade',v_row.quantity,
        'base',v_row.base::numeric(30,2)::text,'juros',v_row.juros::numeric(30,2)::text,
        'multa',v_row.multa::numeric(30,2)::text,'acrescimo',v_row.acrescimo::numeric(30,2)::text,
        'desconto',v_row.desconto::numeric(30,2)::text,
        'diferenca_a_conferir',v_row.difference::numeric(30,2)::text,
        'quantidade_a_conferir',v_row.review_count,
        'quantidade_sem_detalhamento',v_row.no_detail_count,
        'quantidade_com_diferenca',v_row.difference_count)));
  END LOOP;
  RETURN v_result;
END;
$function$;

-- CREATE OR REPLACE preserves the existing owner and ACL; assert the intended
-- API boundary rather than widening grants as part of a performance change.
DO $security$
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated',
      'public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon',
      'public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE')
    OR pg_catalog.has_function_privilege('service_role',
      'public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected composition V2 API grants';
  END IF;
END;
$security$;

NOTIFY pgrst,'reload schema';
COMMIT;
