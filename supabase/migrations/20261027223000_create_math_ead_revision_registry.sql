-- Revisões acadêmicas privadas, habilitadas somente para os dois cursos auditados.
CREATE TABLE internal_academic.ead_course_revisions (
  course_id uuid NOT NULL REFERENCES public.cursos(id),
  revision text NOT NULL CHECK (revision = btrim(revision) AND length(revision) BETWEEN 1 AND 100),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  activity_answers jsonb NOT NULL CHECK (jsonb_typeof(activity_answers) = 'object'),
  quiz_answers jsonb NOT NULL CHECK (jsonb_typeof(quiz_answers) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, revision)
);

CREATE TABLE internal_academic.ead_progress_revision_archives (
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id),
  course_id uuid NOT NULL,
  from_revision text NOT NULL,
  to_revision text NOT NULL,
  progress jsonb NOT NULL CHECK (jsonb_typeof(progress) = 'object'),
  started_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, course_id, from_revision),
  FOREIGN KEY (course_id, from_revision)
    REFERENCES internal_academic.ead_course_revisions(course_id, revision),
  FOREIGN KEY (course_id, to_revision)
    REFERENCES internal_academic.ead_course_revisions(course_id, revision)
);

ALTER TABLE internal_academic.ead_course_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_academic.ead_progress_revision_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_academic.ead_course_revisions,
  internal_academic.ead_progress_revision_archives
  FROM PUBLIC, anon, authenticated, service_role;

-- Não há IDs gerados codificados nem publicação do conteúdo nesta migration.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.cursos
      WHERE modalidade = 'EAD' AND nome IN ('Matemática Básica', 'Matemática para Enem')) <> 2 THEN
    RAISE EXCEPTION 'A revisão requer exatamente os dois cursos EAD de Matemática auditados.';
  END IF;
END;
$$;

INSERT INTO internal_academic.ead_course_revisions
  (course_id, revision, config, activity_answers, quiz_answers)
SELECT c.id, 'legacy-20261027',
  c.ead_config || jsonb_build_object('assessmentRevision', 'legacy-20261027'),
  k.activity_answers, k.quiz_answers
FROM public.cursos c
JOIN internal_academic.ead_assessment_answer_keys k ON k.course_id = c.id
WHERE c.modalidade = 'EAD' AND c.nome IN ('Matemática Básica', 'Matemática para Enem');

DO $$
BEGIN
  IF (SELECT count(*) FROM internal_academic.ead_course_revisions) <> 2 THEN
    RAISE EXCEPTION 'Os dois gabaritos privados são obrigatórios para congelar a revisão legada.';
  END IF;
END;
$$;

-- A inclusão do marcador não reaproveita, apaga nem recalcula respostas/notas.
UPDATE public.ead_aluno_progresso ep
SET progress = ep.progress || jsonb_build_object('assessmentRevision', 'legacy-20261027')
WHERE EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r WHERE r.course_id = ep.curso_id)
  AND (
    ep.progress ?| ARRAY['quizScore', 'lastQuizScoreAt', 'completedAt', 'certificateId']
    OR coalesce(ep.progress -> 'completedContentIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(ep.progress -> 'completedActivityIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(ep.progress -> 'completedVideoIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(ep.progress -> 'activityAnswers', '{}'::jsonb) <> '{}'::jsonb
    OR coalesce(ep.progress -> 'quizAnswers', '{}'::jsonb) <> '{}'::jsonb
    OR EXISTS (SELECT 1 FROM public.certificados_academicos ca
      WHERE ca.aluno_id = ep.aluno_id AND ca.curso_id = ep.curso_id AND ca.modalidade = 'EAD')
  );

CREATE FUNCTION internal_academic.ead_revision_context(p_aluno_id uuid, p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_course record;
  v_progress jsonb;
  v_revision text;
  v_current text;
  v_snapshot record;
BEGIN
  SELECT c.ead_config, k.activity_answers, k.quiz_answers INTO v_course
  FROM public.cursos c
  JOIN internal_academic.ead_assessment_answer_keys k ON k.course_id = c.id
  WHERE c.id = p_course_id AND c.modalidade = 'EAD';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração do curso EAD não encontrada.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r WHERE r.course_id = p_course_id) THEN
    RETURN jsonb_build_object('config', v_course.ead_config,
      'activityAnswers', v_course.activity_answers, 'quizAnswers', v_course.quiz_answers,
      'revision', NULL, 'currentRevision', NULL);
  END IF;

  v_current := coalesce(nullif(v_course.ead_config ->> 'assessmentRevision', ''), 'legacy-20261027');
  SELECT ep.progress INTO v_progress FROM public.ead_aluno_progresso ep
  WHERE ep.aluno_id = p_aluno_id AND ep.curso_id = p_course_id;
  v_revision := coalesce(nullif(v_progress ->> 'assessmentRevision', ''), v_current);
  SELECT r.* INTO v_snapshot FROM internal_academic.ead_course_revisions r
  WHERE r.course_id = p_course_id AND r.revision = v_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revisão acadêmica EAD não encontrada. Avise o suporte.' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object('config', v_snapshot.config,
    'activityAnswers', v_snapshot.activity_answers, 'quizAnswers', v_snapshot.quiz_answers,
    'revision', v_revision, 'currentRevision', v_current);
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_revision_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_academic.ead_bind_initial_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision text;
BEGIN
  IF TG_OP = 'UPDATE' AND nullif(OLD.progress ->> 'assessmentRevision', '') IS NOT NULL
    AND nullif(NEW.progress ->> 'assessmentRevision', '') IS NULL THEN
    NEW.progress := NEW.progress || jsonb_build_object('assessmentRevision', OLD.progress ->> 'assessmentRevision');
  END IF;
  IF nullif(NEW.progress ->> 'assessmentRevision', '') IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Abrir o catálogo não inicia uma avaliação: progresso ainda vazio segue
  -- automaticamente a versão publicada, até a primeira interação acadêmica.
  IF NOT (
    NEW.progress ?| ARRAY['quizScore', 'lastQuizScoreAt', 'completedAt', 'certificateId']
    OR coalesce(NEW.progress -> 'completedContentIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(NEW.progress -> 'completedActivityIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(NEW.progress -> 'completedVideoIds', '[]'::jsonb) <> '[]'::jsonb
    OR coalesce(NEW.progress -> 'activityAnswers', '{}'::jsonb) <> '{}'::jsonb
    OR coalesce(NEW.progress -> 'quizAnswers', '{}'::jsonb) <> '{}'::jsonb
    OR EXISTS (SELECT 1 FROM public.certificados_academicos ca
      WHERE ca.aluno_id = NEW.aluno_id AND ca.curso_id = NEW.curso_id AND ca.modalidade = 'EAD')
  ) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(nullif(c.ead_config ->> 'assessmentRevision', ''), 'legacy-20261027')
  INTO v_revision FROM public.cursos c
  WHERE c.id = NEW.curso_id
    AND EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r WHERE r.course_id = c.id)
  FOR SHARE OF c;
  IF FOUND THEN
    NEW.progress := NEW.progress || jsonb_build_object('assessmentRevision', v_revision);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_bind_initial_revision()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER bind_initial_ead_revision BEFORE INSERT OR UPDATE OF progress ON public.ead_aluno_progresso
FOR EACH ROW EXECUTE FUNCTION internal_academic.ead_bind_initial_revision();

CREATE FUNCTION internal_academic.ead_revision_snapshot_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := coalesce(p_config, '{}'::jsonb);
  v_items jsonb := '[]'::jsonb;
  v_provas jsonb := '[]'::jsonb;
  v_questions jsonb;
  v_item jsonb;
  v_prova jsonb;
BEGIN
  IF v_result ? 'atividades' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_result -> 'atividades') LOOP
      v_items := v_items || jsonb_build_array(
        v_item - 'respostaCorreta' - 'resposta_correta'
          - 'correctAnswer' - 'correct_answer' - 'gabarito'
      );
    END LOOP;
    v_result := jsonb_set(v_result, '{atividades}', v_items, true);
  END IF;

  IF v_result ? 'provas' THEN
    FOR v_prova IN SELECT value FROM jsonb_array_elements(v_result -> 'provas') LOOP
      IF v_prova ? 'questoes' THEN
        v_questions := '[]'::jsonb;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_prova -> 'questoes') LOOP
          v_questions := v_questions || jsonb_build_array(
            v_item - 'respostaCorreta' - 'resposta_correta'
              - 'correctAnswer' - 'correct_answer' - 'gabarito'
          );
        END LOOP;
        v_prova := jsonb_set(v_prova, '{questoes}', v_questions, true);
      END IF;
      v_provas := v_provas || jsonb_build_array(v_prova);
    END LOOP;
    v_result := jsonb_set(v_result, '{provas}', v_provas, true);
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_revision_snapshot_config(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_academic.ead_preserve_course_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous text;
  v_revision text;
  v_existing record;
  v_keys jsonb;
  v_config jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r WHERE r.course_id = OLD.id) THEN
    RETURN NEW;
  END IF;
  IF NEW.modalidade IS DISTINCT FROM OLD.modalidade THEN
    RAISE EXCEPTION 'Curso com histórico de revisões EAD deve preservar a modalidade.' USING ERRCODE = '23514';
  END IF;
  v_previous := coalesce(nullif(OLD.ead_config ->> 'assessmentRevision', ''), 'legacy-20261027');
  v_revision := nullif(btrim(NEW.ead_config ->> 'assessmentRevision'), '');
  IF v_revision IS NULL OR v_revision IS DISTINCT FROM NEW.ead_config ->> 'assessmentRevision' THEN
    RAISE EXCEPTION 'Preserve assessmentRevision ao editar este curso; publique nova revisão para alterar conteúdo/avaliação.'
      USING ERRCODE = '23514';
  END IF;
  SELECT r.* INTO STRICT v_existing FROM internal_academic.ead_course_revisions r
  WHERE r.course_id = OLD.id AND r.revision = v_previous;
  v_keys := internal_academic.ead_collect_assessment_answer_keys(
    NEW.ead_config, v_existing.activity_answers, v_existing.quiz_answers);
  IF v_revision = v_previous THEN
    NEW.ead_config := internal_academic.ead_revision_restore_explanations(NEW.ead_config, v_existing.config);
  END IF;
  v_config := internal_academic.ead_revision_snapshot_config(NEW.ead_config);

  IF v_revision = v_previous THEN
    -- A página de apresentação é editável; o contrato acadêmico publicado é imutável.
    IF (v_config - 'pagina' - 'assessmentRevision') IS DISTINCT FROM
        (v_existing.config - 'pagina' - 'assessmentRevision')
      OR v_keys -> 'activities' IS DISTINCT FROM v_existing.activity_answers
      OR v_keys -> 'quiz' IS DISTINCT FROM v_existing.quiz_answers THEN
      RAISE EXCEPTION 'Publique uma nova assessmentRevision para alterar conteúdo, atividades, prova ou gabarito.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE internal_academic.ead_course_revisions SET config = v_config
    WHERE course_id = OLD.id AND revision = v_revision;
  ELSE
    IF EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r
        WHERE r.course_id = OLD.id AND r.revision = v_revision) THEN
      RAISE EXCEPTION 'Uma revisão acadêmica anterior não pode ser sobrescrita ou reativada.' USING ERRCODE = '23514';
    END IF;
    INSERT INTO internal_academic.ead_course_revisions
      (course_id, revision, config, activity_answers, quiz_answers)
    VALUES (OLD.id, v_revision, v_config, v_keys -> 'activities', v_keys -> 'quiz');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_preserve_course_revision()
  FROM PUBLIC, anon, authenticated, service_role;
-- Antes de secure_ead_course_config: o gabarito explícito ainda está disponível.
CREATE TRIGGER preserve_ead_course_revision BEFORE UPDATE OF ead_config, modalidade ON public.cursos
FOR EACH ROW EXECUTE FUNCTION internal_academic.ead_preserve_course_revision();
