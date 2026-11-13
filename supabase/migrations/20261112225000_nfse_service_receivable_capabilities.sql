BEGIN;
CREATE FUNCTION private.nfse_service_receivable_capabilities(c public.contas_receber) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;l private.nfse_service_receivables%ROWTYPE;job_state text;
  allowed boolean;can_settle boolean;reason text;
BEGIN
  SELECT * INTO l FROM private.nfse_service_receivables WHERE receivable_id=c.id;
  allowed:=l.receivable_id IS NOT NULL AND auth.uid() IS NOT NULL
    AND coalesce(public.gestor_has_effective_financeiro_tab('receber'),false)
    AND coalesce(public.is_financeiro_for_polo(c.polo_id),false);
  base:=internal_academic.receivable_operation_capabilities(c);
  SELECT state INTO job_state FROM private.nfse_service_cancellation_jobs WHERE receivable_id=c.id;
  can_settle:=allowed AND coalesce((base->>'canSettle')::boolean,false)
    AND c.status IN ('PENDENTE','VENCIDO') AND l.fiscal_cancelled_at IS NULL
    AND coalesce(job_state,'') NOT IN ('READY','LEASED','REVIEW');
  reason:=CASE WHEN NOT allowed THEN 'Acesso não autorizado ao recebível deste polo.'
    WHEN l.fiscal_cancelled_at IS NOT NULL THEN 'NFS-e cancelada. Confira o vínculo financeiro antes de receber.'
    WHEN job_state IN ('READY','LEASED') THEN 'Cancelamento da cobrança em processamento.'
    WHEN job_state='REVIEW' THEN 'O cancelamento da cobrança exige revisão financeira.'
    WHEN can_settle THEN NULL
    ELSE coalesce(base->>'readOnlyReason','Consulte o histórico dos recebimentos desta cobrança.') END;
  -- Keep canonical bank identity/provenance and partial-payment policy. This
  -- read model grants no issuance/cancellation permission or financial mutation.
  RETURN base||jsonb_build_object('canSettle',can_settle,'canEmit',false,'canCancel',false,
    'canOpenExisting',allowed AND coalesce((base->>'canOpenExisting')::boolean,false),
    'canReconcile',allowed AND coalesce((base->>'canReconcile')::boolean,false),'readOnlyReason',reason);
END$$;
REVOKE ALL ON FUNCTION private.nfse_service_receivable_capabilities(public.contas_receber)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfse_service_receivable_filtered(p_polo_id uuid,p_search text,
  p_due_start date,p_due_end date,p_status_scope text) RETURNS SETOF public.contas_receber
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_search text:=nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search,''))),'');
  v_today date:=(now() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  IF length(coalesce(p_search,''))>200 OR p_status_scope IS NULL
    OR p_status_scope NOT IN ('ALL','PENDING','RECEIVED','CANCELLED','OVERDUE','UPCOMING')
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
      OR (p_status_scope='OVERDUE' AND (c.status='VENCIDO' OR (c.status='PENDENTE' AND c.data_vencimento<v_today)))
      OR (p_status_scope='UPCOMING' AND c.status IN ('PENDENTE','VENCIDO','SUSPENSO') AND c.data_vencimento>=v_today))
    AND (v_search IS NULL OR public.financeiro_normalize_search_text(concat_ws(' ',
      c.descricao,partner.nome,partner.cpf_cnpj,o.result->>'number',o.result->>'accessKey')) LIKE '%'||v_search||'%');
END$$;
CREATE OR REPLACE FUNCTION private.nfse_service_receivable_projection(p_id uuid) RETURNS jsonb
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
    'operation_capabilities',private.nfse_service_receivable_capabilities(c),
    'nfse_number',l.fiscal_number,'nfse_fiscal_description',l.fiscal_description,
    'nfse_installment_number',l.installment_number,'nfse_installment_count',l.installment_count,
    'parcela_numero',l.installment_number,'gateway_financial_terms',c.gateway_financial_terms,
    'nfse_access_key',o.result->>'accessKey',
    'nfse_operation_id',l.operation_id,'nfse_service_id',l.service_id,
    'nfse_fiscal_cancelled_at',l.fiscal_cancelled_at,
    'nfse_cancellation_state',CASE WHEN cancel.state='REVIEW' THEN 'REVIEW_REQUIRED'
      WHEN cancel.state='DONE' AND cancel.outcome='PAID' THEN 'PAID'
      WHEN cancel.state='DONE' THEN 'CANCELLED' WHEN cancel.id IS NOT NULL THEN 'PENDING' ELSE NULL END,
    'nfse_cancellation_reason',cancel.diagnostic_code)
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
  LEFT JOIN private.nfse_service_cancellation_jobs cancel ON cancel.receivable_id=c.id
  LEFT JOIN public.polos p ON p.id=c.polo_id
  LEFT JOIN public.parceiros partner ON partner.id=c.cliente_id
  LEFT JOIN public.categorias_financeiras category ON category.id=c.categoria_financeira_id
  WHERE c.id=p_id;
$function$;

COMMIT;
