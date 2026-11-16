BEGIN;

CREATE FUNCTION private.expense_workspace_bounds(
  p_scope text, p_due_start date, p_due_end date, p_at timestamptz
)
RETURNS TABLE(today_local date,due_start date,due_end date)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH clock AS (SELECT (p_at AT TIME ZONE 'America/Maceio')::date AS today),
  bounds AS (SELECT today,date_trunc('month',today)::date AS first_day,
    (date_trunc('month',today)+interval '1 month - 1 day')::date AS last_day FROM clock)
  SELECT today,
    CASE WHEN p_scope='mes_atual' THEN greatest(first_day,coalesce(p_due_start,first_day)) ELSE p_due_start END,
    CASE WHEN p_scope='mes_atual' THEN least(last_day,coalesce(p_due_end,last_day))
      WHEN p_scope='vencidos' THEN least(today-1,coalesce(p_due_end,today-1)) ELSE p_due_end END
  FROM bounds;
$$;

CREATE FUNCTION public.get_despesas_workspace_secure(
  p_tipo text, p_polo_id uuid, p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL, p_due_start date DEFAULT NULL, p_due_end date DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL, p_status_scope text DEFAULT 'mes_atual',
  p_situacao text DEFAULT 'todas', p_ordem text DEFAULT 'vencimento_asc',
  p_agrupamento text DEFAULT 'nenhum'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_today date;
  v_start date;
  v_end date;
  v_situacao text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_polo_id IS NULL
    OR internal_financial_payments.actor_allowed(auth.uid(),p_polo_id,'despesas') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('DESPESA_FIXA','DESPESA_VARIAVEL')
    OR p_status_scope IS NULL OR p_status_scope NOT IN ('mes_atual','em_aberto','vencidos','todos')
    OR p_situacao IS NULL OR p_situacao NOT IN ('todas','pagas','em_aberto','vencidas')
    OR p_ordem IS NULL OR p_ordem NOT IN ('vencimento_asc','vencimento_desc')
    OR p_agrupamento IS NULL OR p_agrupamento NOT IN ('nenhum','categoria','mes','fornecedor') THEN
    RAISE EXCEPTION 'PAYMENT_WORKSPACE_INVALID_FILTER';
  END IF;
  SELECT b.today_local,b.due_start,b.due_end INTO v_today,v_start,v_end
    FROM private.expense_workspace_bounds(p_status_scope,p_due_start,p_due_end,now()) b;
  v_situacao:=CASE p_status_scope WHEN 'em_aberto' THEN 'em_aberto'
    WHEN 'vencidos' THEN 'vencidas' ELSE p_situacao END;

  WITH raw AS MATERIALIZED (
    SELECT item.* FROM public.listar_despesas_economicas_detalhadas_secure(
      p_tipo,p_polo_id,p_categoria_id,p_search,v_start,v_end,'todos',p_turma_id
    ) item JOIN public.despesas_lancamentos source ON source.id=item.despesa_lancamento_id
    WHERE source.excluido_em IS NULL
      AND (v_start IS NULL OR item.data_vencimento>=v_start)
      AND (v_end IS NULL OR item.data_vencimento<=v_end)
  ), numbered AS (
    SELECT id,(row_number() OVER(ORDER BY id)-1)/5000 AS batch_number FROM raw
  ), batches AS (
    SELECT array_agg(id ORDER BY id) AS ids FROM numbered GROUP BY batch_number
  ), metadata AS MATERIALIZED (
    SELECT m.* FROM batches b CROSS JOIN LATERAL public.get_despesas_estimativas_secure(b.ids) m
  ), amounts AS MATERIALIZED (
    SELECT item.*,m.valor_estimado,m.valor_estimado_original,m.valor_confirmado_em,m.valor_confirmado_por,
      m.valor_estimado_versao,m.is_estimativa_pendente,m.pagamento_unico,
      m.valor_sem_cobranca_em,m.valor_sem_cobranca_por,
      CASE WHEN partner.tipo='PJ' THEN nullif(btrim(partner.nome_fantasia),'') END AS fornecedor_nome_fantasia,
      (item.payment_summary->>'remainingBefore')::numeric AS remaining_amount,
      (item.payment_summary->>'previouslyPaid')::numeric AS paid_amount
    FROM raw item JOIN metadata m ON m.id=item.id
    LEFT JOIN public.parceiros partner ON partner.id=item.fornecedor_id
  ), classified AS MATERIALIZED (
    SELECT item.*,item.status IN ('PENDENTE','VENCIDO') AND item.remaining_amount>0
        AND item.data_vencimento<v_today AND NOT item.is_estimativa_pendente
        AND item.valor_sem_cobranca_em IS NULL AS is_overdue,
      CASE p_agrupamento
        WHEN 'mes' THEN coalesce(to_char(item.data_vencimento,'YYYY-MM'),'__sem_vencimento__')
        WHEN 'fornecedor' THEN coalesce(item.fornecedor_id::text,'__sem_fornecedor__')
        ELSE coalesce(item.categoria_financeira_id::text,'__sem_categoria__') END AS group_key,
      CASE p_agrupamento
        WHEN 'mes' THEN coalesce(to_char(item.data_vencimento,'MM/YYYY'),'Sem vencimento')
        WHEN 'fornecedor' THEN coalesce(item.fornecedor_nome_fantasia,item.fornecedor_nome,'Fornecedor não informado')
        ELSE coalesce(item.categoria_nome,'Sem categoria') END AS group_label
    FROM amounts item
  ), items AS MATERIALIZED (
    SELECT item.* FROM classified item WHERE v_situacao='todas'
      OR (v_situacao='pagas' AND item.status='PAGO' AND item.remaining_amount=0
        AND NOT item.is_estimativa_pendente AND item.valor_sem_cobranca_em IS NULL)
      OR (v_situacao='em_aberto' AND item.status IN ('PENDENTE','VENCIDO')
        AND item.remaining_amount>0 AND item.valor_sem_cobranca_em IS NULL)
      OR (v_situacao='vencidas' AND item.is_overdue)
  ), totals AS (
    SELECT coalesce(sum(valor) FILTER(WHERE status<>'CANCELADO'),0) AS total_value,
      coalesce(sum(paid_amount) FILTER(WHERE status<>'CANCELADO'),0) AS paid_value,
      coalesce(sum(remaining_amount) FILTER(WHERE status IN ('PENDENTE','VENCIDO')),0) AS pending_value,
      coalesce(sum(remaining_amount) FILTER(WHERE status IN ('PENDENTE','VENCIDO') AND NOT is_estimativa_pendente),0) AS confirmed_pending_value,
      coalesce(sum(valor) FILTER(WHERE is_estimativa_pendente),0) AS estimated_value,
      count(*) FILTER(WHERE is_estimativa_pendente) AS estimated_count,
      count(*) FILTER(WHERE is_overdue) AS vencidos_count
    FROM items
  ), groups AS (
    SELECT group_key,min(group_label) AS group_label,
      CASE WHEN p_agrupamento='categoria' THEN (array_agg(categoria_financeira_id))[1] END AS categoria_id,
      coalesce(sum(valor) FILTER(WHERE status<>'CANCELADO'),0) AS total_value,
      coalesce(sum(paid_amount) FILTER(WHERE status<>'CANCELADO'),0) AS paid_value,count(*) AS item_count,
      coalesce(sum(valor) FILTER(WHERE is_estimativa_pendente),0) AS estimated_value,
      count(*) FILTER(WHERE is_estimativa_pendente) AS estimated_count
    FROM items WHERE p_agrupamento<>'nenhum' GROUP BY group_key
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(
      (to_jsonb(item)-ARRAY['remaining_amount','paid_amount','is_overdue','group_key','group_label'])
      || jsonb_build_object('status',CASE WHEN item.status IN ('PENDENTE','VENCIDO') THEN
          CASE WHEN item.is_overdue THEN 'VENCIDO' ELSE 'PENDENTE' END ELSE item.status END,
        'valor',CASE WHEN item.valor_sem_cobranca_em IS NOT NULL THEN 0 ELSE item.valor END)
      ORDER BY CASE WHEN p_ordem='vencimento_asc' THEN item.data_vencimento END ASC NULLS LAST,
        CASE WHEN p_ordem='vencimento_desc' THEN item.data_vencimento END DESC NULLS LAST,
        item.created_at ASC NULLS LAST,item.id ASC) FROM items item),'[]'::jsonb),
    'summary',to_jsonb(totals),
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'grupo_chave',group_key,'grupo_nome',group_label,'categoria_id',categoria_id,'categoria_nome',group_label,
      'total_value',total_value,'paid_value',paid_value,'item_count',item_count,
      'estimated_value',estimated_value,'estimated_count',estimated_count)
      ORDER BY CASE WHEN p_agrupamento='mes' AND p_ordem='vencimento_asc' THEN group_key END ASC,
        CASE WHEN p_agrupamento='mes' AND p_ordem='vencimento_desc' THEN group_key END DESC,
        group_label,group_key) FROM groups),'[]'::jsonb),
    '_raw_count',(SELECT count(*) FROM raw),'_metadata_count',(SELECT count(*) FROM metadata),
    '_financial_summary_missing',(SELECT count(*) FROM raw
      WHERE payment_summary->>'remainingBefore' IS NULL OR payment_summary->>'previouslyPaid' IS NULL)
  ) INTO v_result FROM totals;
  IF v_result->>'_raw_count' IS DISTINCT FROM v_result->>'_metadata_count' THEN
    RAISE EXCEPTION 'PAYMENT_WORKSPACE_METADATA_INCOMPLETE';
  END IF;
  IF (v_result->>'_financial_summary_missing')::bigint<>0 THEN
    RAISE EXCEPTION 'PAYMENT_WORKSPACE_FINANCIAL_SUMMARY_INCOMPLETE';
  END IF;
  RETURN v_result-ARRAY['_raw_count','_metadata_count','_financial_summary_missing'];
END $$;

REVOKE ALL ON FUNCTION private.expense_workspace_bounds(text,date,date,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
