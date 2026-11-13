BEGIN;
CREATE FUNCTION public.get_servicos_receber_groups(p_polo_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'ALL',
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.authorize_nfse_service_receivable_read(p_polo_id);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Paginação dos parceiros de serviços inválida.' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT c.id,c.cliente_id,c.status,c.data_vencimento,c.created_at
    FROM private.nfse_service_receivable_filtered(p_polo_id,p_search,p_due_start,p_due_end,p_status_scope) c
  ), ranked AS (
    SELECT f.*,row_number() OVER(PARTITION BY cliente_id ORDER BY data_vencimento,created_at,id) AS position FROM filtered f
  ), grouped AS MATERIALIZED (
    SELECT f.cliente_id AS key,coalesce(p.nome,'Parceiro') AS label,count(*) AS item_count,
      count(*) FILTER(WHERE f.status IN ('PENDENTE','VENCIDO','SUSPENSO')) AS pending_count,
      count(*) FILTER(WHERE f.status='PAGO') AS received_count,
      count(*) FILTER(WHERE f.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO')) AS canceled_count,
      min(f.data_vencimento) FILTER(WHERE f.status IN ('PENDENTE','VENCIDO','SUSPENSO')) AS next_due,
      (max(f.id::text) FILTER(WHERE f.position=1))::uuid AS first_id
    FROM ranked f LEFT JOIN public.parceiros p ON p.id=f.cliente_id GROUP BY f.cliente_id,p.nome
  ) SELECT jsonb_build_object('groups',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key',g.key,'label',g.label,'item_count',g.item_count,'pending_count',g.pending_count,
      'received_count',g.received_count,'canceled_count',g.canceled_count,'next_due',g.next_due,
      'first',private.nfse_service_receivable_projection(g.first_id)) ORDER BY lower(g.label),g.key)
    FROM(SELECT * FROM grouped ORDER BY lower(label),key LIMIT p_page_size OFFSET(p_page-1)*p_page_size) g),'[]'::jsonb),
    'total_items',(SELECT count(*) FROM grouped),'total_receivables',(SELECT count(*) FROM filtered),
    'page',p_page,'page_size',p_page_size) INTO result;
  RETURN result;
END$$;

CREATE FUNCTION public.listar_servicos_receber_group_items(p_polo_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'ALL',
  p_partner_id uuid DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.authorize_nfse_service_receivable_read(p_polo_id);
  IF p_partner_id IS NULL OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Paginação das parcelas do parceiro inválida.' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT c.id,c.data_vencimento,c.created_at
    FROM private.nfse_service_receivable_filtered(p_polo_id,p_search,p_due_start,p_due_end,p_status_scope) c
    WHERE c.cliente_id=p_partner_id
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(private.nfse_service_receivable_projection(c.id)
      ORDER BY c.data_vencimento,c.created_at,c.id)
    FROM(SELECT * FROM filtered ORDER BY data_vencimento,created_at,id
      LIMIT p_page_size OFFSET(p_page-1)*p_page_size)c),'[]'::jsonb),
    'total_items',(SELECT count(*) FROM filtered),'page',p_page,'page_size',p_page_size) INTO result;
  RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.get_servicos_receber_groups(uuid,text,date,date,text,integer,integer),
  public.listar_servicos_receber_group_items(uuid,text,date,date,text,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_servicos_receber_groups(uuid,text,date,date,text,integer,integer),
  public.listar_servicos_receber_group_items(uuid,text,date,date,text,uuid,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
