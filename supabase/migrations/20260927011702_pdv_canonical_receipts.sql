BEGIN;
CREATE FUNCTION internal_pdv.paid_receivable(p_id uuid) RETURNS public.contas_receber
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.contas_receber;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_gestor(),false)
    OR NOT coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'),false) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao comprovante.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.contas_receber WHERE id=p_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recebível indisponível.' USING ERRCODE='PT404'; END IF;
  PERFORM internal_pdv.assert_scope(v.polo_id);
  IF v.categoria IS DISTINCT FROM 'OUTROS_CREDITOS' OR v.matricula_id IS NOT NULL
    OR v.turma_id IS NOT NULL OR v.origem_cronograma_id IS NOT NULL
    OR coalesce(v.tipo_lancamento,'') IN('MATRICULA','PARCELA','REMATRICULA','DEPENDENCIA')
    OR coalesce(v.origem_pagamento,'') ~* 'PROESC|SISTEMA_ANTERIOR'
    OR EXISTS(SELECT 1 FROM public.emprestimos_financeiros WHERE conta_receber_id=v.id)
    OR EXISTS(SELECT 1 FROM public.inscricoes_online WHERE receivable_id=v.id)
    OR EXISTS(SELECT 1 FROM public.matricula_dependencia_cobrancas WHERE conta_receber_id=v.id)
    OR EXISTS(SELECT 1 FROM internal_proesc.obligation_links WHERE receivable_id=v.id) THEN
    RAISE EXCEPTION 'Recebível fora do contexto de créditos avulsos.' USING ERRCODE='PT404';
  END IF;
  IF v.status IS DISTINCT FROM 'PAGO' OR v.valor_pago IS NULL
    OR v.valor_pago<=0 OR v.valor_pago>999999999.99 OR v.data_pagamento IS NULL
    OR v.manual_settlement_reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Comprovante exige pagamento confirmado e íntegro.' USING ERRCODE='PT409';
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION internal_pdv.settlement_fingerprint(v public.contas_receber) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT md5(jsonb_build_object('receivable',v.id,'paid',v.valor_pago,'paidAt',v.data_pagamento,
    'manualSettlement',v.manual_settlement_id,'provider',v.gateway_provider,
    'bankPayment',coalesce(v.gateway_payment_id,v.asaas_payment_id))::text)
$$;

CREATE FUNCTION internal_pdv.receipt_dto(p_receipt internal_pdv.receipts,
  p_station uuid DEFAULT NULL,p_printer uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_printer internal_pdv.printers; v_template jsonb; v_behavior text:='PERGUNTAR';
  v_transport text:='BROWSER';
BEGIN
  IF p_station IS NOT NULL THEN
    PERFORM internal_pdv.assert_workstation(p_station,p_receipt.polo_id);
    SELECT * INTO v_printer FROM internal_pdv.printers WHERE polo_id=p_receipt.polo_id
      AND workstation_id=p_station AND active
      AND CASE WHEN p_printer IS NULL THEN is_default ELSE id=p_printer END;
  END IF;
  IF p_printer IS NOT NULL AND v_printer.id IS NULL THEN
    RAISE EXCEPTION 'Impressora não autorizada nesta estação.' USING ERRCODE='42501';
  END IF;
  IF v_printer.id IS NOT NULL THEN
    v_template:=v_printer.template||jsonb_build_object('version',v_printer.version,'source','PRINTER');
    v_behavior:=v_printer.behavior; v_transport:=v_printer.transport;
  ELSE
    v_template:=internal_pdv.validate_template('{}')||jsonb_build_object('version',1,'source','DEFAULT');
  END IF;
  RETURN p_receipt.financial_snapshot||jsonb_build_object('version',1,'id',p_receipt.id,
    'number','PDV-'||lpad(p_receipt.number::text,8,'0'),'issuedAt',p_receipt.issued_at,
    'receivableId',p_receipt.receivable_id,'poloId',p_receipt.polo_id,
    'template',v_template,'printerId',v_printer.id,'workstationId',p_station,
    'behavior',v_behavior,'transport',v_transport,'transportReady',v_transport='BROWSER',
    'automaticReady',false,'hasPriorPrint',EXISTS(SELECT 1 FROM internal_pdv.print_jobs
      WHERE receipt_id=p_receipt.id AND status IN('CLAIMED','DIALOG_CLOSED','UNKNOWN')));
END $$;

CREATE FUNCTION public.prepare_pdv_receipt(p_receivable_id uuid,
  p_printer_id uuid DEFAULT NULL,p_workstation_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.contas_receber; v_polo public.polos; v_payer public.parceiros;
  v_receipt internal_pdv.receipts; v_fingerprint text; v_document text; v_masked text;
  v_financial jsonb;
BEGIN
  v:=internal_pdv.paid_receivable(p_receivable_id);
  IF p_workstation_id IS NOT NULL THEN
    PERFORM internal_pdv.assert_workstation(p_workstation_id,v.polo_id);
  END IF;
  IF p_printer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM internal_pdv.printers
    WHERE id=p_printer_id AND polo_id=v.polo_id AND workstation_id=p_workstation_id AND active) THEN
    RAISE EXCEPTION 'Impressora não autorizada nesta estação.' USING ERRCODE='42501';
  END IF;
  v_fingerprint:=internal_pdv.settlement_fingerprint(v);
  SELECT * INTO v_receipt FROM internal_pdv.receipts
    WHERE receivable_id=v.id AND settlement_fingerprint=v_fingerprint;
  IF NOT FOUND THEN
    -- No receipt/comprovante template exists in the current institutional catalog.
    -- A later configured document model must be integrated explicitly, never ignored.
    IF EXISTS(SELECT 1 FROM public.documentos_modelos_configuracoes WHERE
      template_key ILIKE '%recibo%' OR template_key ILIKE '%receipt%' OR template_key ILIKE '%comprovante%') THEN
      RAISE EXCEPTION 'Há modelo institucional de comprovante pendente de integração.' USING ERRCODE='PT409';
    END IF;
    SELECT * INTO v_polo FROM public.polos WHERE id=v.polo_id;
    SELECT * INTO v_payer FROM public.parceiros WHERE id=v.cliente_id;
    v_document:=regexp_replace(coalesce(v_payer.cpf_cnpj,''),'[^0-9]','','g');
    v_masked:=CASE WHEN length(v_document) IN(11,14) THEN
      substr(v_document,1,2)||repeat('*',length(v_document)-5)||right(v_document,3) ELSE NULL END;
    v_financial:=jsonb_build_object(
      'totalCents',round(v.valor_pago*100)::bigint,
      'totalDisplay','R$ '||translate(to_char(v.valor_pago,'FM999,999,999,990.00'),',.','.,'),
      'paidAt',v.data_pagamento,'paidAtDisplay',to_char(v.data_pagamento,'DD/MM/YYYY'),
      'paymentMethod',coalesce(v.forma_pagamento,v.gateway_payment_method,'NÃO INFORMADO'),
      'payer',jsonb_build_object('name',coalesce(v_payer.nome,'Cliente geral'),'documentMasked',v_masked),
      'description',v.descricao,
      'issuer',jsonb_build_object('id',v_polo.id,'name',v_polo.nome,'cnpj',v_polo.cnpj,
        'address',v_polo.endereco,'number',v_polo.numero,'complement',v_polo.complemento,
        'neighborhood',v_polo.bairro,'city',v_polo.cidade,'state',v_polo.estado,
        'postalCode',v_polo.cep,'phone',v_polo.telefone,'email',v_polo.email,
        'isHeadquarters',v_polo.is_matriz,'logoUrl',v_polo.logo_url,
        'watermarkUrl',v_polo.watermark_url,'watermarkOpacity',v_polo.watermark_opacity,
        'watermarkScale',v_polo.watermark_scale,'watermarkRotate',v_polo.watermark_rotate));
    INSERT INTO internal_pdv.receipts(receivable_id,polo_id,settlement_fingerprint,financial_snapshot,created_by)
      VALUES(v.id,v.polo_id,v_fingerprint,v_financial,auth.uid()) ON CONFLICT DO NOTHING
      RETURNING * INTO v_receipt;
    IF NOT FOUND THEN SELECT * INTO v_receipt FROM internal_pdv.receipts
      WHERE receivable_id=v.id AND settlement_fingerprint=v_fingerprint; END IF;
  END IF;
  RETURN internal_pdv.receipt_dto(v_receipt,p_workstation_id,p_printer_id);
END $$;

CREATE FUNCTION internal_pdv.reject_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Snapshot de comprovante é imutável.' USING ERRCODE='PT409'; END $$;
CREATE TRIGGER pdv_receipt_immutable BEFORE UPDATE OR DELETE ON internal_pdv.receipts
  FOR EACH ROW EXECUTE FUNCTION internal_pdv.reject_receipt_mutation();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_pdv_receipt(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_pdv_receipt(uuid,uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
