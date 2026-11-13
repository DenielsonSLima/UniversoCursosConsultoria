BEGIN;

-- Called by deferred financial callbacks and the bounded expiry worker.
-- Lock order: enrollment -> trust issue -> certificate -> validation document.
-- Financial evidence is read, never locked or changed by this lifecycle.
CREATE FUNCTION internal_academic.reconcile_ead_trust_certificate(p_matricula_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_issue internal_academic.ead_trust_certificate_issues%ROWTYPE;
  v_cert public.certificados_academicos%ROWTYPE; v_doc public.documentos_validacao%ROWTYPE;
  v_new_doc public.documentos_validacao%ROWTYPE; v_emission record; v_now timestamptz; v_paid boolean;
  v_identity text; v_reason text;
BEGIN
  PERFORM 1 FROM public.matriculas WHERE id=p_matricula_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_issue FROM internal_academic.ead_trust_certificate_issues
    WHERE matricula_id=p_matricula_id FOR UPDATE;
  IF NOT FOUND OR v_issue.state IN ('DEFINITIVE','REISSUED') THEN RETURN; END IF;
  v_now:=clock_timestamp();
  v_paid:=internal_academic.ead_has_confirmed_payment(p_matricula_id);
  IF v_paid AND v_issue.confirmed_at IS NULL THEN
    UPDATE internal_academic.ead_trust_certificate_issues SET confirmed_at=v_now
      WHERE certificate_id=v_issue.certificate_id;
    v_issue.confirmed_at:=v_now;
    INSERT INTO internal_academic.ead_trust_certificate_audit(certificate_id,matricula_id,event,document_id,occurred_at)
      VALUES(v_issue.certificate_id,p_matricula_id,'PAYMENT_CONFIRMED',v_issue.original_document_id,v_now)
      ON CONFLICT(certificate_id,event) DO NOTHING;
  END IF;
  IF v_issue.state='TEMPORARY' AND v_paid AND v_issue.confirmed_at<v_issue.deadline THEN
    UPDATE internal_academic.ead_trust_certificate_issues SET state='DEFINITIVE'
      WHERE certificate_id=v_issue.certificate_id;
    RETURN;
  END IF;
  IF v_issue.state='TEMPORARY' AND NOT v_paid AND v_now<v_issue.deadline
    AND internal_academic.ead_has_trust_access(p_matricula_id) THEN RETURN; END IF;

  SELECT * INTO v_cert FROM public.certificados_academicos WHERE id=v_issue.certificate_id FOR UPDATE;
  IF NOT FOUND OR v_cert.matricula_id IS DISTINCT FROM p_matricula_id OR v_cert.modalidade<>'EAD' THEN
    RAISE EXCEPTION 'O certificado por confiança diverge da matrícula.' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_doc FROM public.documentos_validacao WHERE id=v_issue.original_document_id FOR UPDATE;
  v_identity:='certificado_ead:'||p_matricula_id::text||':-:-';
  IF NOT FOUND OR v_doc.documento<>'certificado_ead' OR v_doc.matricula_id IS DISTINCT FROM p_matricula_id
    OR v_doc.aluno_id IS DISTINCT FROM v_cert.aluno_id OR v_doc.polo_id IS DISTINCT FROM v_cert.polo_id
    OR v_doc.codigo IS DISTINCT FROM v_cert.codigo_validacao
    OR v_doc.identidade NOT IN (v_identity,v_identity||':REVOGADO:'||v_doc.id::text) THEN
    RAISE EXCEPTION 'A validação do certificado por confiança diverge da emissão.' USING ERRCODE='23514'; END IF;

  IF v_issue.state='TEMPORARY' THEN
    IF v_doc.status<>'ATIVO' OR v_cert.status<>'FINALIZADO' THEN
      RAISE EXCEPTION 'A emissão por confiança exige revisão documental.' USING ERRCODE='55000'; END IF;
    v_reason:=CASE WHEN v_now>=v_issue.deadline THEN 'TRUST_EXPIRED' ELSE 'FINANCIAL_ACCESS_CLOSED' END;
    UPDATE public.documentos_validacao SET status='REVOGADO',revogado_em=v_now,updated_at=v_now WHERE id=v_doc.id;
    UPDATE public.certificados_academicos SET status='CANCELADO',updated_at=v_now WHERE id=v_cert.id;
    UPDATE internal_academic.ead_trust_certificate_issues SET state='REVOKED',revoked_at=v_now,revocation_reason=v_reason
      WHERE certificate_id=v_cert.id;
    INSERT INTO internal_academic.ead_trust_certificate_audit(certificate_id,matricula_id,event,document_id,occurred_at)
      VALUES(v_cert.id,p_matricula_id,'REVOKED',v_doc.id,v_now) ON CONFLICT(certificate_id,event) DO NOTHING;
    UPDATE public.ead_aluno_progresso SET progress=progress-'certificateId'
      WHERE aluno_id=v_cert.aluno_id AND curso_id=v_cert.curso_id AND progress->>'certificateId'=v_cert.id::text;
  END IF;
  IF NOT v_paid THEN RETURN; END IF;

  -- A late confirmation creates a new document; the old code remains revoked.
  -- This is the audited identity-archive pattern already used by academic issuance.
  UPDATE public.documentos_validacao SET identidade=v_identity||':REVOGADO:'||v_doc.id::text,
    status='REVOGADO',revogado_em=coalesce(revogado_em,v_now),updated_at=v_now WHERE id=v_doc.id;
  SELECT * INTO v_emission FROM public.emitir_documento_validacao_interno(
    'certificado_ead',p_matricula_id,NULL,NULL,NULL,NULL,false);
  SELECT * INTO v_new_doc FROM public.documentos_validacao WHERE codigo=v_emission.codigo FOR UPDATE;
  IF NOT FOUND OR v_new_doc.id=v_doc.id OR v_new_doc.status<>'ATIVO'
    OR v_new_doc.identidade<>v_identity OR v_new_doc.matricula_id IS DISTINCT FROM p_matricula_id
    OR v_new_doc.aluno_id IS DISTINCT FROM v_cert.aluno_id OR v_new_doc.polo_id IS DISTINCT FROM v_cert.polo_id THEN
    RAISE EXCEPTION 'A nova emissão não corresponde ao certificado pago.' USING ERRCODE='23514'; END IF;
  -- Preserve the approved curriculum, identity and public-visibility snapshots.
  -- Only the new issuance timestamps/code belong to the replacement document.
  UPDATE public.documentos_validacao SET dados_emissao=(v_doc.dados_emissao-ARRAY['validationCode','code'])
      ||CASE WHEN v_doc.dados_emissao?'validationCode' THEN jsonb_build_object('validationCode',v_new_doc.codigo) ELSE '{}'::jsonb END
      ||CASE WHEN v_doc.dados_emissao?'code' THEN jsonb_build_object('code',v_new_doc.codigo) ELSE '{}'::jsonb END,
    dados_publicos_snapshot=(v_doc.dados_publicos_snapshot-ARRAY['code','validationCode','status','type'])||jsonb_build_object(
      'code',v_new_doc.codigo,'issuedAt',v_new_doc.emitido_em,'lastIssuedAt',v_new_doc.ultima_emissao_em,'issueCount',v_new_doc.quantidade_emissoes),
    politica_versao_emissao=v_doc.politica_versao_emissao,campos_publicos_emissao=v_doc.campos_publicos_emissao,
    validacao_publica=v_doc.validacao_publica,updated_at=v_now WHERE id=v_new_doc.id;
  UPDATE public.certificados_academicos SET status='FINALIZADO',codigo_validacao=v_new_doc.codigo,
    emitido_em=v_new_doc.emitido_em,emitido_por=NULL,updated_at=v_now WHERE id=v_cert.id;
  UPDATE internal_academic.ead_trust_certificate_issues SET state='REISSUED',replacement_document_id=v_new_doc.id
    WHERE certificate_id=v_cert.id;
  INSERT INTO internal_academic.ead_trust_certificate_audit(certificate_id,matricula_id,event,document_id,related_document_id,occurred_at)
    VALUES(v_cert.id,p_matricula_id,'REISSUED_AFTER_PAYMENT',v_new_doc.id,v_doc.id,v_now)
    ON CONFLICT(certificate_id,event) DO NOTHING;
  UPDATE public.ead_aluno_progresso SET progress=jsonb_set(progress,'{certificateId}',to_jsonb(v_cert.id::text),true)
    WHERE aluno_id=v_cert.aluno_id AND curso_id=v_cert.curso_id
      AND (progress->>'certificateId' IS NULL OR progress->>'certificateId'=v_cert.id::text);
END;
$$;
REVOKE ALL ON FUNCTION internal_academic.reconcile_ead_trust_certificate(uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
