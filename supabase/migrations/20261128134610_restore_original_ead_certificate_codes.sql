BEGIN;

SET LOCAL lock_timeout = '5s';

-- Drain certificate operations in their normal lock order before retiring the
-- correction ledger. Ordinary reads can continue during the restoration.
LOCK TABLE public.matriculas IN EXCLUSIVE MODE;

REVOKE ALL ON FUNCTION public.retificar_periodo_certificado_ead(uuid, text, date, text, text, boolean),
  public.secretaria_get_ead_certificate_study_evidence(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing events and prevent any cached invocation of the
-- previous RPC from recording a new replacement.
ALTER TABLE internal_academic.ead_certificate_period_corrections
  ADD CONSTRAINT ead_certificate_period_corrections_archived CHECK (false) NOT VALID;

CREATE TABLE internal_academic.ead_certificate_code_restorations (
  previous_document_id uuid PRIMARY KEY
    REFERENCES internal_academic.ead_certificate_period_corrections(previous_document_id) ON DELETE RESTRICT,
  restored_at timestamptz NOT NULL,
  operator_session_role name NOT NULL,
  operator_effective_role name NOT NULL,
  original_revoked_at timestamptz NOT NULL,
  replaced_completion_date date NOT NULL,
  restored_completion_date date NOT NULL,
  reason text NOT NULL
);

ALTER TABLE internal_academic.ead_certificate_code_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_academic.ead_certificate_code_restorations
  FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  correction internal_academic.ead_certificate_period_corrections%ROWTYPE;
  certificate public.certificados_academicos%ROWTYPE;
  original public.documentos_validacao%ROWTYPE;
  replacement public.documentos_validacao%ROWTYPE;
  updated_document public.documentos_validacao%ROWTYPE;
  updated_certificate public.certificados_academicos%ROWTYPE;
  canonical_identity text;
  original_completion_date date;
  restored_at timestamptz;
  lifecycle_columns constant text[] := ARRAY['identidade', 'status', 'revogado_em', 'updated_at'];
BEGIN
  -- Only the automatic certificates replaced in the November 28 operation
  -- qualify. The migration also runs on databases with an empty ledger.
  IF (SELECT count(*) FROM internal_academic.ead_certificate_period_corrections) > 3
    OR EXISTS (
      SELECT 1 FROM internal_academic.ead_certificate_period_corrections
      WHERE corrected_at < timestamptz '2026-11-28 13:27:00+00'
        OR corrected_at >= timestamptz '2026-11-28 13:32:00+00'
        OR evidence_source <> 'AUDITORIA_PROGRESSO'
    ) THEN
    RAISE EXCEPTION 'O lote de restauração de certificados EAD diverge da operação auditada.'
      USING ERRCODE = '55000';
  END IF;

  FOR correction IN
    SELECT * FROM internal_academic.ead_certificate_period_corrections ORDER BY previous_document_id
  LOOP
    SELECT * INTO STRICT certificate FROM public.certificados_academicos
      WHERE id = correction.certificate_id FOR UPDATE;
    SELECT * INTO STRICT original FROM public.documentos_validacao
      WHERE id = correction.previous_document_id FOR UPDATE;
    SELECT * INTO STRICT replacement FROM public.documentos_validacao
      WHERE id = correction.replacement_document_id FOR UPDATE;

    canonical_identity := 'certificado_ead:' || certificate.matricula_id::text || ':-:-';
    IF certificate.modalidade <> 'EAD' OR certificate.status <> 'FINALIZADO'
      OR certificate.codigo_validacao IS DISTINCT FROM replacement.codigo
      OR certificate.emitido_em IS DISTINCT FROM replacement.emitido_em
      OR certificate.emitido_por IS DISTINCT FROM correction.corrected_by
      OR certificate.data_conclusao IS DISTINCT FROM correction.completed_on
      OR certificate.metadados -> 'emissaoAutomaticaEad' IS DISTINCT FROM 'true'::jsonb
      OR (certificate.metadados ->> 'emissaoAutomaticaEm')::timestamptz
        IS DISTINCT FROM original.emitido_em
      OR certificate.metadados -> 'eadStudyPeriod' IS DISTINCT FROM jsonb_build_object(
        'startedOn', correction.started_on, 'completedOn', correction.completed_on, 'source', 'DOCUMENTARY_CORRECTION'
      )
      OR original.status <> 'REVOGADO' OR original.revogado_em IS NULL
      OR original.emitido_em IS NULL OR original.emitido_por IS NOT NULL
      OR original.identidade IS DISTINCT FROM canonical_identity || ':REVOGADO:' || original.id::text
      OR original.dados_emissao ? 'eadStudyPeriod'
      OR (original.dados_emissao ->> 'completionDate') IS NULL
      OR replacement.status <> 'ATIVO' OR replacement.revogado_em IS NOT NULL
      OR replacement.emitido_por IS DISTINCT FROM correction.corrected_by
      OR replacement.identidade IS DISTINCT FROM canonical_identity
      OR replacement.dados_emissao -> 'eadStudyPeriod' IS DISTINCT FROM certificate.metadados -> 'eadStudyPeriod'
      OR EXISTS (
        SELECT 1 FROM public.documentos_validacao d
        WHERE d.id IN (original.id, replacement.id)
          AND (d.documento <> 'certificado_ead'
            OR d.matricula_id IS DISTINCT FROM certificate.matricula_id
            OR d.aluno_id IS DISTINCT FROM certificate.aluno_id
            OR d.polo_id IS DISTINCT FROM certificate.polo_id
            OR d.dados_emissao ->> 'certificateId' IS DISTINCT FROM certificate.id::text
            OR d.validacao_publica IS DISTINCT FROM true
            OR d.validade_ate IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1 FROM internal_academic.ead_trust_certificate_issues issue
        WHERE issue.matricula_id = certificate.matricula_id
      )
      OR EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_envelopes signature
        WHERE signature.documento_validacao_id = replacement.id
      ) THEN
      RAISE EXCEPTION 'Um certificado EAD diverge da emissão original ou da substituição auditada.'
        USING ERRCODE = '55000';
    END IF;

    original_completion_date := (original.dados_emissao ->> 'completionDate')::date;
    restored_at := clock_timestamp();

    -- codigo and identidade are unique. Free the canonical identity before
    -- reactivating the original under its existing validation code.
    UPDATE public.documentos_validacao
      SET identidade = canonical_identity || ':REVOGADO:' || replacement.id::text,
          status = 'REVOGADO', revogado_em = restored_at, updated_at = restored_at
      WHERE id = replacement.id
      RETURNING * INTO updated_document;
    IF updated_document.identidade IS DISTINCT FROM canonical_identity || ':REVOGADO:' || replacement.id::text
      OR updated_document.revogado_em IS DISTINCT FROM restored_at
      OR to_jsonb(updated_document) - lifecycle_columns IS DISTINCT FROM to_jsonb(replacement) - lifecycle_columns THEN
      RAISE EXCEPTION 'A revogação alterou o conteúdo da emissão substituta.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.documentos_validacao
      SET identidade = canonical_identity, status = 'ATIVO',
          revogado_em = NULL, updated_at = restored_at
      WHERE id = original.id
      RETURNING * INTO updated_document;
    IF updated_document.identidade IS DISTINCT FROM canonical_identity OR updated_document.revogado_em IS NOT NULL
      OR to_jsonb(updated_document) - lifecycle_columns IS DISTINCT FROM to_jsonb(original) - lifecycle_columns THEN
      RAISE EXCEPTION 'A restauração alterou o conteúdo da emissão original.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.certificados_academicos
      SET codigo_validacao = original.codigo, emitido_em = original.emitido_em,
          emitido_por = original.emitido_por, data_conclusao = original_completion_date,
          metadados = metadados - 'eadStudyPeriod', updated_at = restored_at
      WHERE id = certificate.id
      RETURNING * INTO updated_certificate;

    IF updated_certificate.codigo_validacao IS DISTINCT FROM original.codigo
      OR updated_certificate.emitido_em IS DISTINCT FROM original.emitido_em
      OR updated_certificate.emitido_por IS DISTINCT FROM original.emitido_por
      OR updated_certificate.data_conclusao IS DISTINCT FROM original_completion_date
      OR updated_certificate.metadados IS DISTINCT FROM certificate.metadados - 'eadStudyPeriod'
      OR NOT internal_academic.ead_certificate_is_deliverable(certificate.id)
      OR public.validar_documento_por_codigo(original.codigo) ->> 'status' IS DISTINCT FROM 'ACTIVE'
      OR public.validar_documento_por_codigo(replacement.codigo) ->> 'status' IS DISTINCT FROM 'REVOKED' THEN
      RAISE EXCEPTION 'A entrega ou a validação pública do certificado EAD divergiu após a restauração.'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO internal_academic.ead_certificate_code_restorations (
      previous_document_id, restored_at, operator_session_role, operator_effective_role,
      original_revoked_at, replaced_completion_date, restored_completion_date, reason
    ) VALUES (
      original.id, restored_at, SESSION_USER, CURRENT_USER, original.revogado_em,
      certificate.data_conclusao, original_completion_date, 'Preservação do código da emissão original'
    );
  END LOOP;
END;
$migration$;

COMMIT;
