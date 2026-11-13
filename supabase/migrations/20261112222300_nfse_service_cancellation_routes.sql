BEGIN;
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

CREATE OR REPLACE FUNCTION private.kick_nfse_service_bolepix_worker(p_continuation boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;gateway_jwt text;encoded text;claims jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('nfse-service-bolepix-kick',0)) OR NOT EXISTS(
    SELECT 1 FROM private.nfse_service_bolepix_control WHERE singleton AND enabled
      AND (p_continuation OR last_kick_at IS NULL OR last_kick_at<clock_timestamp()-interval '5 seconds'))
    OR EXISTS(SELECT 1 FROM (SELECT state,lease_until FROM private.nfse_service_bolepix_jobs
      UNION ALL SELECT state,lease_until FROM private.nfse_service_cancellation_jobs) active
      WHERE state='LEASED' AND lease_until>clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM (SELECT state,next_check_at,lease_until FROM private.nfse_service_bolepix_jobs
      UNION ALL SELECT state,next_check_at,lease_until FROM private.nfse_service_cancellation_jobs) due
      WHERE state='READY' AND next_check_at<=clock_timestamp() OR state='LEASED' AND lease_until<=clock_timestamp()) THEN RETURN; END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='payment_gateway_banese_card_reconciliation_worker_secret')<>1
    OR (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt')<>1 THEN RETURN; END IF;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets
    WHERE name='payment_gateway_banese_card_reconciliation_worker_secret';
  SELECT decrypted_secret INTO gateway_jwt FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt';
  IF length(coalesce(secret,''))<32 OR octet_length(coalesce(gateway_jwt,''))>4096
    OR coalesce(gateway_jwt,'') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RETURN; END IF;
  encoded:=translate(split_part(gateway_jwt,'.',2),'-_','+/');encoded:=encoded||repeat('=',(4-length(encoded)%4)%4);
  claims:=convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
  IF claims->>'role' IS DISTINCT FROM 'anon' OR claims->>'ref' IS DISTINCT FROM 'kfekgwyqozhicpfuunpo'
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' OR (claims->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RETURN; END IF;
  UPDATE private.nfse_service_bolepix_control SET last_kick_at=clock_timestamp() WHERE singleton;
  PERFORM net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/nfse-service-bolepix-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||gateway_jwt,'X-Banese-Worker-Token',secret),
    body:='{}'::jsonb,timeout_milliseconds:=85000);
EXCEPTION WHEN OTHERS THEN
  -- The fiscal/financial transaction survives a scheduler outage; cron recovers the durable queue.
  RAISE WARNING 'NFSE_SERVICE_BOLEPIX_KICK_UNAVAILABLE';
END$$;
CREATE TRIGGER nfse_service_cancellation_worker_kick AFTER INSERT OR UPDATE OF state,next_check_at
  ON private.nfse_service_cancellation_jobs FOR EACH ROW EXECUTE FUNCTION private.notify_nfse_service_bolepix_worker();
COMMIT;
