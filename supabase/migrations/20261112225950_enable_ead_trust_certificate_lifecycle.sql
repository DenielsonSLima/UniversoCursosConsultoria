BEGIN;

DO $$
DECLARE v_function text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'internal_academic.ead_has_confirmed_payment(uuid)',
    'internal_academic.ead_has_own_trust_manual_payment(uuid)',
    'internal_academic.project_ead_trust_manual_payment(uuid)',
    'internal_academic.ead_trust_financial_blocked(uuid)',
    'internal_academic.ead_certificate_is_deliverable(uuid)',
    'internal_academic.ead_trust_document_is_revoked(uuid)',
    'internal_academic.reconcile_ead_trust_certificate(uuid)',
    'internal_academic.process_expired_ead_trust_certificates(integer)',
    'public.ead_get_certificate_delivery_state(uuid)'
  ] LOOP
    IF to_regprocedure(v_function) IS NULL THEN
      RAISE EXCEPTION 'O ciclo de certificados por confiança não está completamente instalado.' USING ERRCODE='55000'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgdeferrable AND tginitdeferred
    AND tgname IN ('ead_trust_certificate_receivable_confirmation','ead_trust_certificate_inscription_confirmation',
      'ead_trust_certificate_gateway_confirmation','ead_trust_certificate_manual_confirmation',
      'ead_trust_certificate_payment_confirmation','ead_trust_certificate_attempt_closure'))<>6 THEN
    RAISE EXCEPTION 'A confirmação financeira dos certificados não está instalada.' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='ead-trust-certificate-expiry' AND active
    AND schedule='* * * * *' AND command='select internal_academic.process_expired_ead_trust_certificates(100)') THEN
    RAISE EXCEPTION 'A revogação automática dos certificados não está agendada.' USING ERRCODE='55000'; END IF;
  IF position('project_ead_trust_manual_payment' IN pg_get_functiondef('internal_academic.sync_ead_trust_certificate_after_financial_write()'::regprocedure))=0
    OR position('ead_trust_document_is_revoked' IN pg_get_functiondef('public.validar_documento_por_codigo(text)'::regprocedure))=0
    OR position('ead_certificate_is_deliverable' IN pg_get_functiondef('internal_academic.get_aluno_ead_certificate_model(uuid)'::regprocedure))=0
    OR position('ead_trust_certificate_issues' IN pg_get_functiondef('internal_academic.ead_emitir_certificado_automatico(uuid)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'As proteções de emissão, consulta e entrega do certificado estão incompletas.' USING ERRCODE='55000'; END IF;
END;
$$;

UPDATE internal_academic.ead_trust_runtime_control SET full_course_enabled=true,updated_at=clock_timestamp() WHERE singleton;

COMMIT;
