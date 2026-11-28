BEGIN;

CREATE TABLE internal_academic.ead_certificate_period_corrections (
  previous_document_id uuid PRIMARY KEY REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  replacement_document_id uuid NOT NULL UNIQUE REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  certificate_id uuid NOT NULL REFERENCES public.certificados_academicos(id) ON DELETE RESTRICT,
  started_on date NOT NULL,
  completed_on date NOT NULL,
  evidence_reference text NOT NULL CHECK (char_length(evidence_reference) BETWEEN 4 AND 300),
  evidence_source text NOT NULL CHECK (evidence_source IN ('AUDITORIA_PROGRESSO', 'DOCUMENTO_EXTERNO')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  corrected_by uuid NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (started_on <= completed_on),
  CHECK (previous_document_id <> replacement_document_id)
);
ALTER TABLE internal_academic.ead_certificate_period_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_academic.ead_certificate_period_corrections
  FROM PUBLIC, anon, authenticated, service_role;

-- A definitive certificate issued by trust may also receive a documentary
-- correction. Its financial ledger is historical and keeps its own pointers.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('internal_academic.ead_certificate_is_deliverable(uuid)'::regprocedure);
  trust_anchor constant text := $anchor$OR (issue.state='TEMPORARY' AND document.id=issue.original_document_id$anchor$;
  corrected_document constant text := $text$OR (issue.state IN ('DEFINITIVE','REISSUED') AND EXISTS (
          SELECT 1 FROM internal_academic.ead_certificate_period_corrections correction
          WHERE correction.certificate_id=certificate.id AND correction.replacement_document_id=document.id))
        $text$;
BEGIN
  IF length(definition) - length(replace(definition, trust_anchor, '')) <> length(trust_anchor) THEN
    RAISE EXCEPTION 'EAD_CERTIFICATE_CORRECTION_DELIVERY_DRIFT';
  END IF;
  EXECUTE replace(definition, trust_anchor, corrected_document || trust_anchor);
END $migration$;

CREATE FUNCTION public.retificar_periodo_certificado_ead(
  p_certificado_id uuid,
  p_codigo_original text,
  p_inicio_comprovado date,
  p_referencia_evidencia text,
  p_motivo text,
  p_usar_evidencia_interna boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  source_code text := upper(btrim(coalesce(p_codigo_original, '')));
  evidence_reference text := btrim(coalesce(p_referencia_evidencia, ''));
  evidence_source text := CASE WHEN p_usar_evidencia_interna THEN 'AUDITORIA_PROGRESSO' ELSE 'DOCUMENTO_EXTERNO' END;
  correction_reason text := btrim(coalesce(p_motivo, ''));
  target record;
  trust_state text;
  certificate public.certificados_academicos%ROWTYPE;
  previous_document public.documentos_validacao%ROWTYPE;
  replacement_document public.documentos_validacao%ROWTYPE;
  prior internal_academic.ead_certificate_period_corrections%ROWTYPE;
  issuance record;
  canonical_identity text;
  study_period jsonb;
  verified_audit jsonb;
  completed_on date;
  expected_public_visibility boolean;
BEGIN
  SELECT c.matricula_id, c.polo_id INTO target
  FROM public.certificados_academicos c
  WHERE c.id = p_certificado_id AND c.modalidade = 'EAD';

  IF NOT FOUND OR actor IS NULL
    OR NOT coalesce(public.can_manage_secretaria_document('certificado_ead', target.polo_id), false) THEN
    RAISE EXCEPTION 'Acesso à retificação deste certificado EAD não autorizado.' USING ERRCODE = '42501';
  END IF;

  IF char_length(source_code) NOT BETWEEN 1 AND 80 OR p_inicio_comprovado IS NULL
    OR char_length(evidence_reference) NOT BETWEEN 4 AND 300
    OR char_length(correction_reason) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Informe a data de início comprovada, a referência e o motivo da retificação.' USING ERRCODE = '22023';
  END IF;

  -- Same lock order as financial reconciliation: enrollment, trust issue,
  -- academic certificate, validation document.
  PERFORM 1 FROM public.matriculas m WHERE m.id = target.matricula_id FOR UPDATE;
  SELECT issue.state INTO trust_state FROM internal_academic.ead_trust_certificate_issues issue
    WHERE issue.matricula_id = target.matricula_id FOR UPDATE;
  SELECT c.* INTO certificate FROM public.certificados_academicos c
    WHERE c.id = p_certificado_id AND c.matricula_id = target.matricula_id
      AND c.polo_id IS NOT DISTINCT FROM target.polo_id AND c.modalidade = 'EAD'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O certificado mudou de vínculo. Reabra a ficha antes de retificar.' USING ERRCODE = '55000';
  END IF;

  SELECT d.* INTO previous_document FROM public.documentos_validacao d
    WHERE d.codigo = source_code AND d.documento = 'certificado_ead'
      AND d.matricula_id = certificate.matricula_id AND d.aluno_id = certificate.aluno_id
      AND d.polo_id IS NOT DISTINCT FROM certificate.polo_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O documento original não foi localizado para este certificado.' USING ERRCODE = '55000';
  END IF;

  -- Retrying the same correction after a lost response returns its existing
  -- validation code. A different request must use the current document code.
  SELECT c.* INTO prior FROM internal_academic.ead_certificate_period_corrections c
    WHERE c.previous_document_id = previous_document.id;
  IF FOUND THEN
    IF prior.certificate_id = certificate.id AND prior.corrected_by = actor
      AND prior.started_on = p_inicio_comprovado AND prior.evidence_reference = evidence_reference
      AND prior.evidence_source = evidence_source AND prior.reason = correction_reason THEN
      RETURN (SELECT d.codigo FROM public.documentos_validacao d WHERE d.id = prior.replacement_document_id);
    END IF;
    RAISE EXCEPTION 'Este documento já foi retificado. Reabra a ficha para consultar o registro atual.' USING ERRCODE = '55000';
  END IF;

  canonical_identity := 'certificado_ead:' || certificate.matricula_id::text || ':-:-';
  IF certificate.codigo_validacao IS DISTINCT FROM source_code
    OR previous_document.identidade IS DISTINCT FROM canonical_identity
    OR (trust_state IS NOT NULL AND trust_state NOT IN ('DEFINITIVE','REISSUED'))
    OR NOT internal_academic.ead_certificate_is_deliverable(certificate.id)
    OR previous_document.campos_publicos_emissao IS NULL OR previous_document.politica_versao_emissao IS NULL
    OR previous_document.dados_publicos_snapshot IS NULL
    OR previous_document.dados_emissao ->> 'certificateId' IS DISTINCT FROM certificate.id::text
    OR previous_document.dados_emissao ->> 'completionDate' IS DISTINCT FROM certificate.data_conclusao::text THEN
    RAISE EXCEPTION 'A retificação exige um certificado definitivo com conclusão documental confirmada.' USING ERRCODE = '55000';
  END IF;

  completed_on := certificate.data_conclusao;
  IF p_usar_evidencia_interna THEN
    verified_audit := internal_academic.ead_historical_study_evidence(certificate.id);
    IF verified_audit IS NULL OR verified_audit ->> 'fonte' IS DISTINCT FROM evidence_source
      OR verified_audit ->> 'inicioData' IS DISTINCT FROM p_inicio_comprovado::text
      OR verified_audit ->> 'referencia' IS DISTINCT FROM evidence_reference THEN
      RAISE EXCEPTION 'A evidência de progresso mudou. Abra novamente a retificação para conferir os dados.'
        USING ERRCODE = '55000';
    END IF;
    completed_on := (verified_audit ->> 'conclusaoData')::date;
    IF completed_on IS NULL OR completed_on > certificate.data_conclusao
      OR completed_on < certificate.data_conclusao - 1 THEN
      RAISE EXCEPTION 'A auditoria não confirma o dia da conclusão deste certificado.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF p_inicio_comprovado > completed_on
    OR p_inicio_comprovado < (certificate.data_inscricao AT TIME ZONE 'America/Maceio')::date THEN
    RAISE EXCEPTION 'A data de início deve estar entre a inscrição e a conclusão atestada.' USING ERRCODE = '22023';
  END IF;
  IF previous_document.dados_emissao #>> '{eadStudyPeriod,startedOn}' = p_inicio_comprovado::text
    AND completed_on = certificate.data_conclusao THEN
    RAISE EXCEPTION 'A data informada já consta na emissão atual.' USING ERRCODE = '22023';
  END IF;

  study_period := jsonb_build_object('eadStudyPeriod', jsonb_build_object(
    'startedOn', p_inicio_comprovado, 'completedOn', completed_on,
    'source', 'DOCUMENTARY_CORRECTION'
  ));

  -- Keep the original snapshot intact under its prior code. A new code is
  -- issued by the same document service as the original and published atomically.
  UPDATE public.documentos_validacao SET status = 'REVOGADO',
    identidade = canonical_identity || ':REVOGADO:' || previous_document.id::text,
    revogado_em = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = previous_document.id;

  SELECT * INTO issuance FROM public.emitir_documento_validacao_interno(
    'certificado_ead', certificate.matricula_id, NULL, NULL, NULL, actor, false
  );
  SELECT d.* INTO replacement_document FROM public.documentos_validacao d WHERE d.codigo = issuance.codigo FOR UPDATE;
  IF NOT FOUND OR replacement_document.id = previous_document.id OR replacement_document.status <> 'ATIVO'
    OR replacement_document.identidade IS DISTINCT FROM canonical_identity
    OR replacement_document.documento <> 'certificado_ead'
    OR replacement_document.matricula_id IS DISTINCT FROM certificate.matricula_id
    OR replacement_document.aluno_id IS DISTINCT FROM certificate.aluno_id
    OR replacement_document.polo_id IS DISTINCT FROM certificate.polo_id THEN
    RAISE EXCEPTION 'A emissão de substituição não corresponde ao certificado.' USING ERRCODE = '23514';
  END IF;

  expected_public_visibility := previous_document.validacao_publica AND replacement_document.validacao_publica;
  INSERT INTO internal_academic.ead_certificate_period_corrections(
    previous_document_id, replacement_document_id, certificate_id, started_on,
    completed_on, evidence_reference, evidence_source, reason, corrected_by
  ) VALUES (
    previous_document.id, replacement_document.id, certificate.id, p_inicio_comprovado,
    completed_on, evidence_reference, evidence_source, correction_reason, actor
  );

  UPDATE public.documentos_validacao SET
    dados_emissao = (previous_document.dados_emissao - ARRAY['validationCode','code']) || study_period
      || jsonb_build_object('completionDate', completed_on)
      || CASE WHEN previous_document.dados_emissao ? 'validationCode'
        THEN jsonb_build_object('validationCode', replacement_document.codigo) ELSE '{}'::jsonb END
      || CASE WHEN previous_document.dados_emissao ? 'code'
        THEN jsonb_build_object('code', replacement_document.codigo) ELSE '{}'::jsonb END,
    updated_at = clock_timestamp()
  WHERE id = replacement_document.id
  RETURNING * INTO replacement_document;
  IF replacement_document.politica_versao_emissao IS DISTINCT FROM previous_document.politica_versao_emissao
    OR replacement_document.campos_publicos_emissao IS DISTINCT FROM previous_document.campos_publicos_emissao
    OR replacement_document.validacao_publica IS DISTINCT FROM expected_public_visibility THEN
    RAISE EXCEPTION 'A nova emissão não preservou os limites de visibilidade documental.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.certificados_academicos SET codigo_validacao = replacement_document.codigo,
    emitido_em = replacement_document.emitido_em, emitido_por = actor,
    data_conclusao = completed_on,
    metadados = coalesce(metadados, '{}'::jsonb) || study_period,
    updated_at = clock_timestamp()
  WHERE id = certificate.id;

  RETURN replacement_document.codigo;
END;
$function$;

REVOKE ALL ON FUNCTION public.retificar_periodo_certificado_ead(uuid, text, date, text, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retificar_periodo_certificado_ead(uuid, text, date, text, text, boolean)
  TO authenticated;

COMMIT;
