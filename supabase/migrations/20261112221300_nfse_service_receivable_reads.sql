BEGIN;

CREATE FUNCTION private.authorize_nfse_service_receivable_read(p_polo_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.gestor_has_effective_financeiro_tab('receber'),false)
    OR NOT coalesce(CASE WHEN p_polo_id IS NULL THEN public.is_financeiro_global()
      ELSE public.is_financeiro_for_polo(p_polo_id) END,false) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos recebíveis de serviços deste escopo.' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE FUNCTION private.nfse_service_receivable_filtered(p_polo_id uuid,p_search text,
  p_due_start date,p_due_end date,p_status_scope text) RETURNS SETOF public.contas_receber
LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_search text:=nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search,''))),'');
  v_today date:=(now() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  IF length(coalesce(p_search,''))>200 OR p_status_scope IS NULL
    OR p_status_scope NOT IN ('ALL','PENDING','RECEIVED','CANCELLED','OVERDUE')
    OR (p_due_start IS NOT NULL AND p_due_end IS NOT NULL AND p_due_end<p_due_start) THEN
    RAISE EXCEPTION 'Filtros dos recebíveis de serviços inválidos.' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT c.* FROM public.contas_receber c
  JOIN private.nfse_service_receivables l ON l.receivable_id=c.id
  JOIN private.nfse_individual_operations o ON o.id=l.operation_id
  LEFT JOIN public.parceiros partner ON partner.id=c.cliente_id
  WHERE (p_polo_id IS NULL OR c.polo_id=p_polo_id)
    AND (p_due_start IS NULL OR c.data_vencimento>=p_due_start)
    AND (p_due_end IS NULL OR c.data_vencimento<=p_due_end)
    AND (p_status_scope='ALL'
      OR (p_status_scope='PENDING' AND c.status IN ('PENDENTE','VENCIDO','SUSPENSO'))
      OR (p_status_scope='RECEIVED' AND c.status='PAGO')
      OR (p_status_scope='CANCELLED' AND c.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO'))
      OR (p_status_scope='OVERDUE' AND (c.status='VENCIDO' OR (c.status='PENDENTE' AND c.data_vencimento<v_today))))
    AND (v_search IS NULL OR public.financeiro_normalize_search_text(concat_ws(' ',
      c.descricao,partner.nome,partner.cpf_cnpj,o.result->>'number',o.result->>'accessKey')) LIKE '%'||v_search||'%');
END;
$function$;

CREATE FUNCTION private.nfse_service_receivable_projection(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('id',c.id,'polo_id',c.polo_id,'polo_nome',p.nome,'polo_cnpj',p.cnpj,
    'polo_cidade',p.cidade,'polo_uf',p.estado,'descricao',c.descricao,'valor',c.valor,
    'data_vencimento',c.data_vencimento,'data_emissao',coalesce(c.gateway_boleto_issued_at,c.created_at),
    'data_pagamento',c.data_pagamento,'valor_pago',c.valor_pago,'status',c.status,
    'categoria',c.categoria,'categoria_financeira_id',c.categoria_financeira_id,
    'categoria_financeira_nome',category.nome,'cliente_id',c.cliente_id,'cliente_nome',partner.nome,
    'cliente_cpf_cnpj',partner.cpf_cnpj,'cliente_telefone',partner.telefone,
    'forma_pagamento',c.forma_pagamento,'origem_pagamento',c.origem_pagamento,
    'gateway_provider',c.gateway_provider,'gateway_payment_method',c.gateway_payment_method,
    'gateway_settlement_channel',c.gateway_settlement_channel,'gateway_settlement_source',c.gateway_settlement_source,
    'conta_bancaria_id',c.conta_bancaria_id,'created_at',c.created_at,'tipo_lancamento',c.tipo_lancamento,
    'payment_summary',c.payment_summary,'other_credit_cancellation_eligible',false,
    'nfse_number',l.fiscal_number,'nfse_fiscal_description',l.fiscal_description,
    'nfse_installment_number',l.installment_number,'nfse_installment_count',l.installment_count,
    'parcela_numero',l.installment_number,'gateway_financial_terms',c.gateway_financial_terms,
    'nfse_access_key',o.result->>'accessKey',
    'nfse_operation_id',l.operation_id,'nfse_service_id',l.service_id,
    'nfse_fiscal_cancelled_at',l.fiscal_cancelled_at)
    ||jsonb_build_object('manual_settlement_id',c.manual_settlement_id,
      'nosso_numero_asaas',c.nosso_numero_asaas,
      'asaas_payment_id',coalesce(c.asaas_payment_id,c.gateway_payment_id),
      'asaas_payment_link_id',coalesce(c.asaas_payment_link_id,c.gateway_payment_link_id),
      'asaas_invoice_url',coalesce(c.asaas_invoice_url,c.gateway_invoice_url),
      'asaas_bank_slip_url',coalesce(c.asaas_bank_slip_url,c.gateway_bank_slip_url),
      'asaas_installment_id',coalesce(c.asaas_installment_id,c.gateway_installment_id),
      'asaas_transaction_receipt_url',c.asaas_transaction_receipt_url,
      'asaas_status',coalesce(c.asaas_status,c.gateway_status),
      'asaas_last_error',c.asaas_last_error,
      'taxa',coalesce(c.asaas_fee_value,c.gateway_fee_value),
      'valor_liquido',coalesce(c.asaas_net_value,c.gateway_net_value))
  FROM public.contas_receber c JOIN private.nfse_service_receivables l ON l.receivable_id=c.id
  JOIN private.nfse_individual_operations o ON o.id=l.operation_id
  LEFT JOIN public.polos p ON p.id=c.polo_id
  LEFT JOIN public.parceiros partner ON partner.id=c.cliente_id
  LEFT JOIN public.categorias_financeiras category ON category.id=c.categoria_financeira_id
  WHERE c.id=p_id;
$function$;

CREATE FUNCTION public.listar_servicos_receber_secure(p_polo_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'ALL',
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM private.authorize_nfse_service_receivable_read(p_polo_id);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Paginação dos recebíveis de serviços inválida.' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_total FROM private.nfse_service_receivable_filtered(
    p_polo_id,p_search,p_due_start,p_due_end,p_status_scope);
  SELECT coalesce(jsonb_agg(private.nfse_service_receivable_projection(c.id)
    ORDER BY c.data_vencimento,c.created_at,c.id),'[]') INTO v_rows FROM (
      SELECT id,data_vencimento,created_at FROM private.nfse_service_receivable_filtered(
        p_polo_id,p_search,p_due_start,p_due_end,p_status_scope)
      ORDER BY data_vencimento,created_at,id LIMIT p_page_size OFFSET (p_page-1)*p_page_size
    ) c;
  RETURN jsonb_build_object('rows',v_rows,'total_items',v_total,'page',p_page,'page_size',p_page_size);
END;
$function$;

CREATE FUNCTION public.get_servicos_receber_summary(p_polo_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'ALL')
RETURNS TABLE(pending_count bigint,received_count bigint,canceled_count bigint,overdue_count bigint,all_count bigint,
  pending_value numeric,received_value numeric,canceled_value numeric,overdue_value numeric,all_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  PERFORM private.authorize_nfse_service_receivable_read(p_polo_id);
  RETURN QUERY SELECT
    count(*) FILTER(WHERE c.status IN ('PENDENTE','VENCIDO','SUSPENSO')),
    count(*) FILTER(WHERE c.status='PAGO'),
    count(*) FILTER(WHERE c.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO')),
    count(*) FILTER(WHERE c.status='VENCIDO' OR (c.status='PENDENTE' AND c.data_vencimento<v_today)),count(*),
    coalesce(sum(coalesce((c.payment_summary->>'remainingBefore')::numeric,c.valor))
      FILTER(WHERE c.status IN ('PENDENTE','VENCIDO','SUSPENSO')),0),
    coalesce(sum(CASE WHEN c.payment_summary IS NOT NULL THEN (c.payment_summary->>'previouslyPaid')::numeric
      WHEN c.status='PAGO' THEN coalesce(c.valor_pago,c.valor) ELSE 0 END),0),
    coalesce(sum(c.valor) FILTER(WHERE c.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO')),0),
    coalesce(sum(coalesce((c.payment_summary->>'remainingBefore')::numeric,c.valor))
      FILTER(WHERE c.status='VENCIDO' OR (c.status='PENDENTE' AND c.data_vencimento<v_today)),0),
    coalesce(sum(c.valor),0)
  FROM private.nfse_service_receivable_filtered(p_polo_id,p_search,p_due_start,p_due_end,p_status_scope) c;
END;
$function$;

CREATE FUNCTION public.get_nfse_service_boleto_context_internal(p_receivable_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_context jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'Contexto bancário de serviço exige backend autorizado.' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('invoiceNumber',l.fiscal_number,'serviceDescription',l.fiscal_description,
    'installmentNumber',l.installment_number,'installmentCount',l.installment_count,
    'operationId',l.operation_id,'serviceId',l.service_id,'receivableIds',(
      SELECT jsonb_agg(sibling.receivable_id ORDER BY sibling.installment_number)
      FROM private.nfse_service_receivables sibling WHERE sibling.service_id=l.service_id
        AND sibling.operation_id=l.operation_id)) INTO v_context
  FROM private.nfse_service_receivables l JOIN private.nfse_individual_operations o ON o.id=l.operation_id
  WHERE l.receivable_id=p_receivable_id AND o.state='AUTHORIZED' AND o.environment='PRODUCAO';
  RETURN v_context;
END;
$function$;
CREATE FUNCTION public.can_read_nfse_service_boleto_secure(p_receivable_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT coalesce(auth.role()='authenticated' AND auth.uid() IS NOT NULL
    AND public.gestor_has_effective_financeiro_tab('receber') AND EXISTS(
      SELECT 1 FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id
      WHERE c.id=p_receivable_id AND public.is_financeiro_for_polo(c.polo_id)),false);
$function$;

REVOKE ALL ON FUNCTION private.authorize_nfse_service_receivable_read(uuid),
  private.nfse_service_receivable_filtered(uuid,text,date,date,text),private.nfse_service_receivable_projection(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.listar_servicos_receber_secure(uuid,text,date,date,text,integer,integer),
  public.get_servicos_receber_summary(uuid,text,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.listar_servicos_receber_secure(uuid,text,date,date,text,integer,integer),
  public.get_servicos_receber_summary(uuid,text,date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_nfse_service_boleto_context_internal(uuid),
  public.can_read_nfse_service_boleto_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_service_boleto_context_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_read_nfse_service_boleto_secure(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
