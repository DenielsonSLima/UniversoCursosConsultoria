BEGIN;

-- Deferred callbacks observe the complete canonical financial transaction,
-- including legacy inscription projections that update enrollment before title.
CREATE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_matricula uuid; v_receivable uuid;
BEGIN
  IF TG_TABLE_NAME IN ('contas_receber','inscricoes_online','ead_checkout_attempts') THEN
    v_matricula:=NEW.matricula_id;
  ELSIF TG_TABLE_NAME='payment_gateway_transactions' THEN v_receivable:=NEW.receivable_id;
  ELSIF TG_TABLE_NAME='receivable_manual_settlements' THEN v_receivable:=NEW.receivable_id;
  ELSIF TG_TABLE_NAME='financial_payment_events' THEN
    IF NEW.source_kind<>'RECEIVABLE' THEN RETURN NEW; END IF;
    v_receivable:=NEW.source_id;
  ELSE RAISE EXCEPTION 'Origem de confirmação EAD inválida.' USING ERRCODE='22023'; END IF;
  IF v_receivable IS NOT NULL THEN
    SELECT matricula_id INTO v_matricula FROM public.contas_receber WHERE id=v_receivable;
  END IF;
  IF v_matricula IS NOT NULL AND EXISTS(SELECT 1 FROM internal_academic.ead_trust_certificate_issues
    WHERE matricula_id=v_matricula AND state IN ('TEMPORARY','REVOKED')) THEN
    PERFORM internal_academic.reconcile_ead_trust_certificate(v_matricula);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE CONSTRAINT TRIGGER ead_trust_certificate_receivable_confirmation
AFTER INSERT OR UPDATE ON public.contas_receber DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();
CREATE CONSTRAINT TRIGGER ead_trust_certificate_inscription_confirmation
AFTER INSERT OR UPDATE ON public.inscricoes_online DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();
CREATE CONSTRAINT TRIGGER ead_trust_certificate_gateway_confirmation
AFTER INSERT OR UPDATE ON public.payment_gateway_transactions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();
CREATE CONSTRAINT TRIGGER ead_trust_certificate_manual_confirmation
AFTER INSERT OR UPDATE ON public.receivable_manual_settlements DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();
CREATE CONSTRAINT TRIGGER ead_trust_certificate_payment_confirmation
AFTER INSERT OR UPDATE ON public.financial_payment_events DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();
CREATE CONSTRAINT TRIGGER ead_trust_certificate_attempt_closure
AFTER INSERT OR UPDATE ON public.ead_checkout_attempts DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write();

CREATE FUNCTION internal_academic.process_expired_ead_trust_certificates(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_matricula uuid; v_processed integer:=0;
BEGIN
  IF NOT internal_academic.ead_trust_full_course_enabled() THEN RETURN 0; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN
    RAISE EXCEPTION 'Limite do processamento EAD inválido.' USING ERRCODE='22023'; END IF;
  FOR v_matricula IN SELECT m.id FROM public.matriculas m
    JOIN internal_academic.ead_trust_certificate_issues issue ON issue.matricula_id=m.id
    WHERE issue.state='TEMPORARY' AND (issue.deadline<=statement_timestamp()
      OR NOT internal_academic.ead_has_trust_access(m.id))
    ORDER BY issue.deadline,m.id LIMIT p_limit FOR UPDATE OF m SKIP LOCKED
  LOOP
    PERFORM internal_academic.reconcile_ead_trust_certificate(v_matricula);
    v_processed:=v_processed+1;
  END LOOP;
  RETURN v_processed;
END;
$$;
REVOKE ALL ON FUNCTION internal_academic.process_expired_ead_trust_certificates(integer)
  FROM PUBLIC,anon,authenticated,service_role;

SELECT cron.schedule('ead-trust-certificate-expiry','* * * * *',
  'select internal_academic.process_expired_ead_trust_certificates(100)');

COMMIT;
