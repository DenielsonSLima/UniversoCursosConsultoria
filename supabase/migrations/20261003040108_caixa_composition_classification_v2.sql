BEGIN;

-- Read-side classification only. Unknown components remain NULL, and opposing
-- differences in distinct movements must never cancel their review counts.
CREATE FUNCTION public.get_caixa_composicao_mensal_v2_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone('America/Maceio',pg_catalog.now())::date
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_inicio date;
  v_fim date;
  v_recebimentos_sem integer;
  v_recebimentos_diferenca integer;
  v_despesas_sem integer;
  v_despesas_diferenca integer;
  v_section text;
  v_sem integer;
  v_diferenca integer;
  v_expected integer;
BEGIN
  -- The existing wrapper authorizes identity/module/polo before any core read.
  -- It also preserves canonical totals, monthly boundaries and parity checks.
  v_result:=public.get_caixa_composicao_mensal_secure(p_polo_id,p_competencia);
  v_inicio:=(v_result->>'periodo_inicio')::date;
  v_fim:=(v_result->>'periodo_fim_exclusivo')::date;

  WITH classified AS (
    SELECT r.diferenca_nao_discriminada,
      (r.composicao_status IS NULL OR r.valor_base IS NULL
        OR r.juros IS NULL OR r.multa IS NULL OR r.acrescimo IS NULL
        OR r.desconto IS NULL OR r.diferenca_nao_discriminada IS NULL
        OR r.composicao_status IN (
          'NAO_DISCRIMINADA_PELO_GATEWAY','NAO_DISCRIMINADA','PARCIAL_POR_API_PROESC')
        OR (r.composicao_status IN (
          'CALCULADO_REGRA_INFORMADA_PROESC','API_E_REGRA_INFORMADA_PROESC')
          AND coalesce(r.diferenca_nao_discriminada,0)<>0)) AS incomplete
    FROM public.get_caixa_relatorio_recebimentos_core(p_polo_id,v_inicio,v_fim) r
  )
  SELECT count(*) FILTER (WHERE incomplete AND diferenca_nao_discriminada=0)::integer,
    count(*) FILTER (WHERE incomplete AND diferenca_nao_discriminada IS DISTINCT FROM 0)::integer
  INTO v_recebimentos_sem,v_recebimentos_diferenca FROM classified;

  WITH classified AS (
    SELECT d.diferenca_nao_discriminada,
      (d.composicao_status IS NULL OR d.valor_base IS NULL
        OR d.juros IS NULL OR d.multa IS NULL OR d.acrescimo IS NULL
        OR d.desconto IS NULL OR d.diferenca_nao_discriminada IS NULL
        OR d.composicao_status='NAO_DISCRIMINADA') AS incomplete
    FROM public.get_caixa_relatorio_despesas_core(p_polo_id,v_inicio,v_fim) d
  )
  SELECT count(*) FILTER (WHERE incomplete AND diferenca_nao_discriminada=0)::integer,
    count(*) FILTER (WHERE incomplete AND diferenca_nao_discriminada IS DISTINCT FROM 0)::integer
  INTO v_despesas_sem,v_despesas_diferenca FROM classified;

  FOREACH v_section IN ARRAY ARRAY['recebimentos','despesas'] LOOP
    v_sem:=CASE v_section WHEN 'recebimentos' THEN v_recebimentos_sem ELSE v_despesas_sem END;
    v_diferenca:=CASE v_section WHEN 'recebimentos' THEN v_recebimentos_diferenca ELSE v_despesas_diferenca END;
    v_expected:=(v_result#>>ARRAY[v_section,'dados','quantidade_a_conferir'])::integer;
    IF v_expected IS NULL OR v_sem+v_diferenca IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Classificação da composição diverge da projeção canônica.' USING ERRCODE='P0001';
    END IF;
    v_result:=pg_catalog.jsonb_set(v_result,ARRAY[v_section,'dados'],
      (v_result#>ARRAY[v_section,'dados'])||pg_catalog.jsonb_build_object(
        'quantidade_sem_detalhamento',v_sem,'quantidade_com_diferenca',v_diferenca));
    v_result:=pg_catalog.jsonb_set(v_result,ARRAY[v_section,'observacao'],
      CASE WHEN v_expected=0 THEN 'null'::jsonb ELSE pg_catalog.to_jsonb(
        'Diferença líquida zero não comprova os componentes do pagamento. Componentes não informados não integram os subtotais.'::text)
      END);
  END LOOP;
  RETURN pg_catalog.jsonb_set(v_result,'{versao}','2'::jsonb);
END;
$function$;

ALTER FUNCTION public.get_caixa_composicao_mensal_v2_secure(uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_caixa_composicao_mensal_v2_secure(uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_composicao_mensal_v2_secure(uuid,date) TO authenticated;
COMMENT ON FUNCTION public.get_caixa_composicao_mensal_v2_secure(uuid,date) IS
  'Composição mensal V2: preserva a V1 e separa movimentos incompletos sem diferença líquida daqueles com diferença ou residual desconhecido. Sem mutação financeira.';

NOTIFY pgrst,'reload schema';
COMMIT;
