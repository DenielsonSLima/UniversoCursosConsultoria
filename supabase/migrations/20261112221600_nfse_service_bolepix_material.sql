BEGIN;
CREATE FUNCTION private.lock_nfse_service_bolepix_job(p_job uuid,p_lease uuid)
RETURNS private.nfse_service_bolepix_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BOLEPIX_WORKER_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO job FROM private.nfse_service_bolepix_jobs WHERE id=p_job FOR UPDATE NOWAIT;
  IF NOT FOUND OR job.state<>'LEASED' OR job.lease_token IS DISTINCT FROM p_lease OR job.lease_until<=clock_timestamp()
    THEN RAISE EXCEPTION 'BOLEPIX_LEASE_CHANGED' USING ERRCODE='40001'; END IF;
  RETURN job;
END$$;
REVOKE ALL ON FUNCTION private.lock_nfse_service_bolepix_job(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_nfse_service_bolepix_material_internal(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
  l private.nfse_service_receivables%ROWTYPE;r public.payment_gateway_routes%ROWTYPE;
  credential public.payment_gateway_credentials%ROWTYPE;issuer uuid;action text;
BEGIN
  job:=private.lock_nfse_service_bolepix_job(p_job_id,p_lease_token);
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=job.receivable_id FOR UPDATE NOWAIT;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=c.id FOR SHARE NOWAIT;
  IF l.origin<>'CREATED' OR l.operation_id<>job.operation_id OR l.service_id<>job.service_id
    OR private.nfse_service_bolepix_intent(c,l) IS DISTINCT FROM job.intent
    OR c.categoria IS DISTINCT FROM 'OUTROS_CREDITOS' OR c.tipo_lancamento IS DISTINCT FROM 'OUTRO_CREDITO'
    OR c.matricula_id IS NOT NULL OR c.turma_id IS NOT NULL OR c.origem_cronograma_id IS NOT NULL
    OR nullif(btrim(l.fiscal_number),'') IS NULL OR nullif(btrim(l.fiscal_description),'') IS NULL
    OR c.status NOT IN ('PENDENTE','VENCIDO') OR c.data_pagamento IS NOT NULL OR c.valor_pago IS NOT NULL
    OR c.manual_settlement_id IS NOT NULL OR c.gateway_settlement_recorded_at IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.parceiros WHERE id=c.cliente_id
      AND regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=job.payer_document)
    OR NOT coalesce(internal_financial_payments.actor_allowed(job.actor_auth_user_id,c.polo_id,'receber'),false) THEN
    RAISE EXCEPTION 'BOLEPIX_SCOPE_OR_INTENT_CHANGED' USING ERRCODE='42501'; END IF;
  -- Reauthorize the current actor; a historic NFS-e permission never grants bank access.
  PERFORM 1 FROM public.usuarios_sistema WHERE auth_user_id=job.actor_auth_user_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.perfis_acesso WHERE id IN (SELECT perfil_acesso_id FROM public.usuarios_sistema
    WHERE auth_user_id=job.actor_auth_user_id) FOR SHARE NOWAIT;
  IF NOT coalesce(internal_financial_payments.actor_allowed(job.actor_auth_user_id,c.polo_id,'receber'),false)
    THEN RAISE EXCEPTION 'BOLEPIX_ACTOR_CHANGED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_gateway_runtime_config WHERE id AND enabled AND active_environment='production')
    THEN RAISE EXCEPTION 'BOLEPIX_RUNTIME_BLOCKED' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT r FROM public.payment_gateway_routes WHERE modalidade='OUTROS_CREDITOS'
    AND payment_method='BOLETO' AND environment='production' AND enabled FOR SHARE NOWAIT;
  IF r.provider_code<>'banese_card' THEN RAISE EXCEPTION 'BOLEPIX_ROUTE_BLOCKED' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT credential FROM public.payment_gateway_credentials WHERE id=r.credential_id FOR SHARE NOWAIT;
  IF credential.provider_code<>'banese_card' OR credential.environment<>'production' OR NOT credential.configured
    OR NOT credential.client_id_configured OR NOT credential.client_secret_configured
    OR credential.metadata->'bolepixBankManaged' IS DISTINCT FROM 'true'::jsonb
    THEN RAISE EXCEPTION 'BOLEPIX_CREDENTIAL_BLOCKED' USING ERRCODE='55000'; END IF;
  SELECT issuer_polo_id INTO STRICT issuer FROM public.payment_gateway_issuer_config
    WHERE id=1 AND active AND applies_to_all_polos FOR SHARE NOWAIT;
  IF NOT EXISTS(SELECT 1 FROM public.polos WHERE id=issuer AND is_matriz AND public.is_active_status(status))
    THEN RAISE EXCEPTION 'BOLEPIX_ISSUER_BLOCKED' USING ERRCODE='55000'; END IF;
  IF (job.credential_id IS NOT NULL AND job.credential_id IS DISTINCT FROM credential.id)
    OR (job.issuer_polo_id IS NOT NULL AND job.issuer_polo_id IS DISTINCT FROM issuer) THEN
    RAISE EXCEPTION 'BOLEPIX_FROZEN_ROUTE_CHANGED' USING ERRCODE='55000'; END IF;
  UPDATE private.nfse_service_bolepix_jobs SET credential_id=credential.id,issuer_polo_id=issuer WHERE id=job.id;
  IF c.gateway_submission_channel='API' AND c.gateway_submission_status IN ('API_AMBIGUOUS','API_REGISTERED') THEN
    IF c.gateway_provider IS DISTINCT FROM 'banese_card' OR c.gateway_environment IS DISTINCT FROM 'production'
      OR c.gateway_payment_method IS DISTINCT FROM 'BOLETO' OR c.gateway_issuer_polo_id IS DISTINCT FROM issuer
      OR coalesce(c.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
      OR c.gateway_boleto_nosso_numero IS DISTINCT FROM job.bank_our_number
      OR (c.gateway_submission_status='API_AMBIGUOUS' AND (c.gateway_creation_token IS DISTINCT FROM job.api_attempt_token OR c.gateway_status<>'CREATING'))
      THEN RAISE EXCEPTION 'BOLEPIX_REMOTE_IDENTITY_CHANGED' USING ERRCODE='55000'; END IF;
    action:='GET';
  ELSE
    IF l.fiscal_cancelled_at IS NOT NULL OR c.gateway_submission_status IS NOT NULL OR c.gateway_submission_channel IS NOT NULL
      OR c.gateway_cnab_file_id IS NOT NULL OR c.gateway_payment_id IS NOT NULL OR c.gateway_payment_link_id IS NOT NULL
      OR c.gateway_boleto_linha_digitavel IS NOT NULL OR c.gateway_boleto_codigo_barras IS NOT NULL
      OR c.gateway_pix_payload IS NOT NULL OR c.gateway_pix_encoded_image IS NOT NULL OR c.gateway_boleto_issued_at IS NOT NULL
      OR c.gateway_financial_terms_confirmed_at IS NOT NULL OR c.gateway_status IS NOT NULL AND c.gateway_status<>'CREATING'
      OR c.gateway_creation_token IS NOT NULL AND c.gateway_creation_token IS DISTINCT FROM job.api_attempt_token
      OR EXISTS(SELECT 1 FROM public.payment_gateway_transactions WHERE receivable_id=c.id)
      THEN RAISE EXCEPTION 'BOLEPIX_REMOTE_EVIDENCE_REVIEW' USING ERRCODE='55000'; END IF;
    UPDATE private.nfse_service_bolepix_jobs SET api_attempt_token=job.lease_token WHERE id=job.id;
    UPDATE public.contas_receber SET forma_pagamento='BOLETO',gateway_provider='banese_card',gateway_environment='production',
      gateway_payment_method='BOLETO',gateway_issuer_polo_id=issuer,gateway_installments=1,gateway_status='CREATING',
      gateway_creation_token=job.lease_token,updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
    action:='CREATE';
  END IF;
  RETURN jsonb_build_object('jobId',job.id,'leaseToken',job.lease_token,'action',action,'credentialId',credential.id,
    'receivable',to_jsonb(c),'payer',(SELECT to_jsonb(p) FROM public.parceiros p WHERE id=c.cliente_id AND public.is_active_status(p.status)),
    'metadata',credential.metadata,'fiscalNumber',l.fiscal_number,'fiscalDescription',l.fiscal_description);
END$$;
REVOKE ALL ON FUNCTION public.get_nfse_service_bolepix_material_internal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_service_bolepix_material_internal(uuid,uuid) TO service_role;
COMMIT;
