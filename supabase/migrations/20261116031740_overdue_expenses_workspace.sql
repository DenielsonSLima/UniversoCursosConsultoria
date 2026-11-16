BEGIN;

CREATE FUNCTION public.get_despesas_vencidas_secure(
  p_tipo text, p_polo_id uuid, p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL, p_due_start date DEFAULT NULL, p_due_end date DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL, p_agrupamento text DEFAULT 'categoria'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today_local date := (now() AT TIME ZONE 'America/Maceio')::date;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_polo_id IS NULL
    OR internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,'despesas') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('DESPESA_FIXA','DESPESA_VARIAVEL')
    OR p_agrupamento IS NULL OR p_agrupamento NOT IN ('categoria','mes','fornecedor') THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_INPUT';
  END IF;

  WITH items AS MATERIALIZED (
    SELECT item.*,
      coalesce((item.payment_summary->>'remainingBefore')::numeric,item.valor) AS remaining_amount,
      coalesce((item.payment_summary->>'previouslyPaid')::numeric,item.valor_pago,0) AS paid_amount,
      CASE p_agrupamento
        WHEN 'mes' THEN to_char(item.data_vencimento,'YYYY-MM')
        WHEN 'fornecedor' THEN coalesce(item.fornecedor_id::text,'__sem_fornecedor__')
        ELSE coalesce(item.categoria_financeira_id::text,'__sem_categoria__') END AS group_key,
      CASE p_agrupamento
        WHEN 'mes' THEN to_char(item.data_vencimento,'MM/YYYY')
        WHEN 'fornecedor' THEN coalesce(nullif(btrim(partner.nome_fantasia),''),
          item.fornecedor_nome,'Fornecedor não informado')
        ELSE coalesce(item.categoria_nome,'Sem categoria') END AS group_label
    FROM public.listar_despesas_economicas_detalhadas_secure(
      p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,
      least(coalesce(p_due_end,today_local-1),today_local-1),'em_aberto',p_turma_id
    ) item
    JOIN public.despesas_lancamentos source ON source.id=item.despesa_lancamento_id
    LEFT JOIN public.parceiros partner ON partner.id=item.fornecedor_id
    WHERE item.status IN ('PENDENTE','VENCIDO') AND item.data_vencimento<today_local
      AND coalesce((item.payment_summary->>'remainingBefore')::numeric,item.valor)>0
      AND (NOT source.valor_estimado OR source.valor_confirmado_em IS NOT NULL)
      AND source.valor_sem_cobranca_em IS NULL AND source.excluido_em IS NULL
  ), totals AS (
    SELECT coalesce(sum(valor),0) AS total_value,coalesce(sum(paid_amount),0) AS paid_value,
      coalesce(sum(remaining_amount),0) AS pending_value,count(*) AS vencidos_count
    FROM items
  ), groups AS (
    SELECT group_key,min(group_label) AS group_label,
      CASE WHEN p_agrupamento='categoria' THEN (array_agg(categoria_financeira_id))[1] END AS categoria_id,
      sum(valor) AS total_value,sum(paid_amount) AS paid_value,count(*) AS item_count
    FROM items GROUP BY group_key
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(
      (to_jsonb(item)-ARRAY['remaining_amount','paid_amount','group_key','group_label'])
        || jsonb_build_object('status','VENCIDO')
      ORDER BY item.data_vencimento,item.descricao,item.id) FROM items item),'[]'::jsonb),
    'summary',to_jsonb(totals),
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'grupo_chave',group_key,'grupo_nome',group_label,'categoria_id',categoria_id,
      'categoria_nome',group_label,'total_value',total_value,'paid_value',paid_value,
      'item_count',item_count) ORDER BY group_key) FROM groups),'[]'::jsonb)
  ) INTO result FROM totals;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_despesas_vencidas_secure(text,uuid,uuid,text,date,date,uuid,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_vencidas_secure(text,uuid,uuid,text,date,date,uuid,text)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
