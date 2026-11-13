BEGIN;

-- Only certificates first issued under the new trust workflow enter this ledger.
-- Existing academic certificates and their immutable documents are not backfilled.
CREATE TABLE internal_academic.ead_trust_certificate_issues (
  certificate_id uuid PRIMARY KEY REFERENCES public.certificados_academicos(id) ON DELETE RESTRICT,
  matricula_id uuid NOT NULL UNIQUE REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  original_document_id uuid NOT NULL UNIQUE REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  deadline timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL DEFAULT 'TEMPORARY' CHECK (state IN ('TEMPORARY','DEFINITIVE','REVOKED','REISSUED')),
  confirmed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IN ('TRUST_EXPIRED','FINANCIAL_ACCESS_CLOSED')),
  replacement_document_id uuid UNIQUE REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  CHECK (replacement_document_id IS NULL OR replacement_document_id<>original_document_id),
  CHECK (state<>'DEFINITIVE' OR (confirmed_at IS NOT NULL AND confirmed_at<deadline)),
  CHECK (state<>'REISSUED' OR (confirmed_at IS NOT NULL AND replacement_document_id IS NOT NULL)),
  CHECK (state<>'REISSUED' OR confirmed_at>=deadline OR revocation_reason='FINANCIAL_ACCESS_CLOSED'),
  CHECK (state NOT IN ('REVOKED','REISSUED') OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE INDEX ead_trust_certificate_expiry_idx ON internal_academic.ead_trust_certificate_issues(deadline)
  WHERE state='TEMPORARY';
CREATE TABLE internal_academic.ead_trust_certificate_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  certificate_id uuid NOT NULL REFERENCES public.certificados_academicos(id) ON DELETE RESTRICT,
  matricula_id uuid NOT NULL REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN ('ISSUED_TEMPORARY','PAYMENT_CONFIRMED','REVOKED','REISSUED_AFTER_PAYMENT')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  document_id uuid NOT NULL REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  related_document_id uuid REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  UNIQUE(certificate_id,event)
);
ALTER TABLE internal_academic.ead_trust_certificate_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_academic.ead_trust_certificate_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_academic.ead_trust_certificate_issues,
  internal_academic.ead_trust_certificate_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE internal_academic.ead_trust_certificate_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_academic.ead_trust_document_is_revoked(p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM internal_academic.ead_trust_certificate_issues issue
    WHERE issue.original_document_id=p_document_id AND (
      issue.state IN ('REVOKED','REISSUED') OR (issue.state='TEMPORARY' AND (
        issue.deadline<=statement_timestamp()
        OR NOT internal_academic.ead_has_trust_access(issue.matricula_id)))));
$$;
REVOKE ALL ON FUNCTION internal_academic.ead_trust_document_is_revoked(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_academic.ead_certificate_is_deliverable(p_certificate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.certificados_academicos certificate
    JOIN public.documentos_validacao document ON document.codigo=certificate.codigo_validacao
      AND document.documento='certificado_ead' AND document.matricula_id=certificate.matricula_id
      AND document.aluno_id=certificate.aluno_id AND document.polo_id IS NOT DISTINCT FROM certificate.polo_id
    LEFT JOIN internal_academic.ead_trust_certificate_issues issue ON issue.certificate_id=certificate.id
    WHERE certificate.id=p_certificate_id AND certificate.modalidade='EAD' AND certificate.status='FINALIZADO'
      AND document.status='ATIVO' AND (document.validade_ate IS NULL OR document.validade_ate>=statement_timestamp())
      AND (issue.certificate_id IS NULL
        OR (issue.state='DEFINITIVE' AND document.id=issue.original_document_id)
        OR (issue.state='REISSUED' AND document.id=issue.replacement_document_id)
        OR (issue.state='TEMPORARY' AND document.id=issue.original_document_id
          AND internal_academic.ead_trust_full_course_enabled()
          AND issue.deadline>statement_timestamp() AND internal_academic.ead_has_trust_access(issue.matricula_id))));
$$;
REVOKE ALL ON FUNCTION internal_academic.ead_certificate_is_deliverable(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Mirrors the current certificate SELECT policy; an unknown/inaccessible ID has
-- one denial and cannot be used to enumerate student or document metadata.
CREATE FUNCTION public.ead_get_certificate_delivery_state(p_certificado_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cert public.certificados_academicos%ROWTYPE;
  v_issue internal_academic.ead_trust_certificate_issues%ROWTYPE; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Certificado indisponível para este acesso.' USING ERRCODE='42501'; END IF;
  SELECT certificate.* INTO v_cert FROM public.certificados_academicos certificate
    WHERE certificate.id=p_certificado_id AND certificate.modalidade='EAD'
      AND (((certificate.polo_id IS NOT NULL AND public.is_gestor_for_polo(certificate.polo_id))
          OR (certificate.polo_id IS NULL AND public.is_gestor_global()))
        AND (public.gestor_has_module('relatorios') OR public.gestor_has_any_tab('secretaria',ARRAY['declaracoes','historico']))
        OR certificate.aluno_id=public.current_aluno_id() AND certificate.status='FINALIZADO' AND certificate.codigo_validacao IS NOT NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado indisponível para este acesso.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_issue FROM internal_academic.ead_trust_certificate_issues WHERE certificate_id=v_cert.id;
  v_allowed:=internal_academic.ead_certificate_is_deliverable(v_cert.id);
  RETURN jsonb_build_object('allowed',v_allowed,'deadline',CASE WHEN v_allowed AND v_issue.state='TEMPORARY' THEN v_issue.deadline END,
    'state',CASE WHEN NOT v_allowed THEN 'REVOKED' WHEN v_issue.state='TEMPORARY' THEN 'TEMPORARY' ELSE 'DEFINITIVE' END,
    'code',v_cert.codigo_validacao);
END;
$$;
REVOKE ALL ON FUNCTION public.ead_get_certificate_delivery_state(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ead_get_certificate_delivery_state(uuid) TO authenticated;

COMMIT;
