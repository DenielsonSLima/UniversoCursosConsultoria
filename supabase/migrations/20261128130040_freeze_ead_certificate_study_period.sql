BEGIN;

CREATE FUNCTION internal_academic.ead_certificate_study_period(
  p_matricula_id uuid,
  p_completed_on date
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'eadStudyPeriod', jsonb_build_object(
        'startedOn', (period.started_at AT TIME ZONE 'America/Maceio')::date,
        'completedOn', p_completed_on,
        'source', 'VERIFIED_STUDY_ACTIVITY'
      )
    )
    FROM internal_academic.ead_study_periods period
    WHERE period.matricula_id = p_matricula_id
      AND period.started_at <= statement_timestamp()
      AND (period.started_at AT TIME ZONE 'America/Maceio')::date <= p_completed_on
  ), '{}'::jsonb)
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_certificate_study_period(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'public.ead_update_aluno_progress_core_20260822(uuid,uuid,text,text,jsonb)'::regprocedure
  );
  enrollment_date_anchor constant text := $anchor$v_matricula.data_matricula,
      current_date,
      (v_progress ->> 'quizScore')::numeric,$anchor$;
  local_completion_date constant text := $replacement$v_matricula.data_matricula,
      (statement_timestamp() AT TIME ZONE 'America/Maceio')::date,
      (v_progress ->> 'quizScore')::numeric,$replacement$;
BEGIN
  IF length(definition) - length(replace(definition, enrollment_date_anchor, ''))
     <> length(enrollment_date_anchor) THEN
    RAISE EXCEPTION 'EAD_CERTIFICATE_COMPLETION_DATE_DRIFT';
  END IF;

  EXECUTE replace(definition, enrollment_date_anchor, local_completion_date);
END $migration$;

DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'internal_academic.ead_emitir_certificado_automatico(uuid)'::regprocedure
  );
  declaration_anchor constant text := '  v_identity jsonb := ''{}''::jsonb;';
  first_issue_anchor constant text := '    v_curriculum := internal_academic.ead_certificate_curriculum_snapshot(v_config, v_total_hours);';
  reused_issue_anchor constant text := '    -- A validação é da grade congelada; mudanças no curso não reescrevem o documento.';
  academic_metadata_anchor constant text := ']) || v_identity || v_curriculum || jsonb_build_object(';
  document_snapshot_anchor constant text := 'SET dados_emissao = coalesce(dados_emissao, ''{}''::jsonb) || v_identity || v_curriculum || jsonb_build_object(';
  anchor text;
BEGIN
  FOREACH anchor IN ARRAY ARRAY[declaration_anchor, first_issue_anchor, reused_issue_anchor,
    academic_metadata_anchor, document_snapshot_anchor] LOOP
    IF length(definition) - length(replace(definition, anchor, '')) <> length(anchor) THEN
      RAISE EXCEPTION 'EAD_CERTIFICATE_PERIOD_ISSUANCE_DRIFT';
    END IF;
  END LOOP;

  definition := replace(definition, declaration_anchor,
    declaration_anchor || E'\n  v_study_period jsonb := ''{}''::jsonb;');
  definition := replace(definition, first_issue_anchor,
    $period$    v_study_period := internal_academic.ead_certificate_study_period(p_matricula_id, v_cert.data_conclusao);
$period$ || first_issue_anchor);
  definition := replace(definition, reused_issue_anchor,
    $period$    IF v_document.dados_emissao ? 'eadStudyPeriod' THEN
      v_study_period := jsonb_build_object('eadStudyPeriod', v_document.dados_emissao -> 'eadStudyPeriod');
    END IF;
$period$ || reused_issue_anchor);
  definition := replace(definition, academic_metadata_anchor,
    $period$, 'eadStudyPeriod']) || v_identity || v_curriculum || v_study_period || jsonb_build_object($period$);
  definition := replace(definition, document_snapshot_anchor,
    'SET dados_emissao = coalesce(dados_emissao, ''{}''::jsonb) || v_identity || v_curriculum || v_study_period || jsonb_build_object(');

  EXECUTE definition;
END $migration$;

COMMIT;
