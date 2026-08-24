-- O Diário institucional exige duas pessoas distintas na cadeia:
-- 1) o professor atribuído à disciplina; 2) outro professor com coordenação
-- ativa no mesmo curso e polo. O papel COORDENADOR continua sendo evidência
-- do vínculo, nunca um tipo separado de parceiro ou credencial.

BEGIN;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_signatarios_diario_v6_canonicos(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_curso_id uuid,
  p_polo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_professor record;
  v_coordenador record;
  v_coordenadores_distintos integer;
BEGIN
  IF p_turma_id IS NULL OR p_disciplina_id IS NULL
     OR p_curso_id IS NULL OR p_polo_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_ORIGEM_INVALIDA';
  END IF;

  SELECT
    professor.id AS parceiro_id,
    professor.auth_user_id,
    professor.nome
  INTO v_professor
  FROM public.turmas_disciplinas AS vinculo
  JOIN public.parceiros AS professor ON professor.id = vinculo.professor_id
  WHERE vinculo.turma_id = p_turma_id
    AND vinculo.disciplina_id = p_disciplina_id
    AND vinculo.bloqueio_diario = 'PROFESSOR'
    AND upper(professor.tipo) = 'PROFESSOR'
    AND public.is_active_status(professor.status)
  FOR KEY SHARE OF vinculo, professor;

  IF NOT FOUND OR v_professor.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PROFESSOR_INELEGIVEL';
  END IF;

  -- Uma coordenação declarada ativa nunca pode ser ignorada quando a pessoa
  -- ou a identidade de autenticação estiver inválida.
  IF EXISTS (
    SELECT 1
    FROM public.professores_coordenacoes AS coordenacao
    LEFT JOIN public.parceiros AS coordenador
      ON coordenador.id = coordenacao.professor_id
    WHERE coordenacao.curso_id = p_curso_id
      AND coordenacao.polo_id = p_polo_id
      AND coordenacao.status = 'ATIVA'
      AND coordenacao.vigente_de <= statement_timestamp()
      AND (
        coordenacao.vigente_ate IS NULL
        OR coordenacao.vigente_ate > statement_timestamp()
      )
      AND (
        coordenador.id IS NULL
        OR coordenador.auth_user_id IS NULL
        OR upper(coordenador.tipo) <> 'PROFESSOR'
        OR NOT public.is_active_status(coordenador.status)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_COORDENACAO_INELEGIVEL';
  END IF;

  SELECT count(*)::integer
  INTO v_coordenadores_distintos
  FROM public.professores_coordenacoes AS coordenacao
  JOIN public.parceiros AS coordenador
    ON coordenador.id = coordenacao.professor_id
  WHERE coordenacao.curso_id = p_curso_id
    AND coordenacao.polo_id = p_polo_id
    AND coordenacao.status = 'ATIVA'
    AND coordenacao.vigente_de <= statement_timestamp()
    AND (
      coordenacao.vigente_ate IS NULL
      OR coordenacao.vigente_ate > statement_timestamp()
    )
    AND upper(coordenador.tipo) = 'PROFESSOR'
    AND public.is_active_status(coordenador.status)
    AND coordenador.auth_user_id IS NOT NULL
    AND coordenador.auth_user_id <> v_professor.auth_user_id;

  IF v_coordenadores_distintos = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_COORDENADOR_DISTINTO_OBRIGATORIO';
  END IF;
  IF v_coordenadores_distintos <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_COORDENADORES_ATIVOS_AMBIGUOS';
  END IF;

  SELECT
    coordenador.id AS parceiro_id,
    coordenador.auth_user_id,
    coordenador.nome,
    coordenacao.id AS coordenacao_id
  INTO v_coordenador
  FROM public.professores_coordenacoes AS coordenacao
  JOIN public.parceiros AS coordenador
    ON coordenador.id = coordenacao.professor_id
  WHERE coordenacao.curso_id = p_curso_id
    AND coordenacao.polo_id = p_polo_id
    AND coordenacao.status = 'ATIVA'
    AND coordenacao.vigente_de <= statement_timestamp()
    AND (
      coordenacao.vigente_ate IS NULL
      OR coordenacao.vigente_ate > statement_timestamp()
    )
    AND upper(coordenador.tipo) = 'PROFESSOR'
    AND public.is_active_status(coordenador.status)
    AND coordenador.auth_user_id IS NOT NULL
    AND coordenador.auth_user_id <> v_professor.auth_user_id
  ORDER BY coordenacao.vigente_de DESC, coordenacao.id
  FOR KEY SHARE OF coordenacao, coordenador;

  IF NOT FOUND
     OR v_coordenador.parceiro_id IS NULL
     OR v_coordenador.auth_user_id IS NULL
     OR v_coordenador.coordenacao_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_COORDENACAO_INELEGIVEL';
  END IF;

  RETURN jsonb_build_array(
    jsonb_build_object(
      'partnerId', v_professor.parceiro_id,
      'authUserId', v_professor.auth_user_id,
      'role', 'PROFESSOR',
      'contextType', 'PROFESSOR',
      'contextId', v_professor.parceiro_id,
      'identitySnapshot', jsonb_build_object(
        'schemaVersion', 1,
        'partnerId', v_professor.parceiro_id,
        'authUserId', v_professor.auth_user_id,
        'name', v_professor.nome,
        'role', 'PROFESSOR'
      ),
      'linkSnapshot', jsonb_build_object(
        'schemaVersion', 1,
        'type', 'TURMA_DISCIPLINA',
        'turmaId', p_turma_id,
        'disciplinaId', p_disciplina_id,
        'professorId', v_professor.parceiro_id
      )
    ),
    jsonb_build_object(
      'partnerId', v_coordenador.parceiro_id,
      'authUserId', v_coordenador.auth_user_id,
      'role', 'COORDENADOR',
      'coordinationId', v_coordenador.coordenacao_id,
      'contextType', 'COORDENADOR',
      'contextId', v_coordenador.parceiro_id,
      'identitySnapshot', jsonb_build_object(
        'schemaVersion', 1,
        'partnerId', v_coordenador.parceiro_id,
        'authUserId', v_coordenador.auth_user_id,
        'name', v_coordenador.nome,
        'role', 'COORDENADOR'
      ),
      'linkSnapshot', jsonb_build_object(
        'schemaVersion', 1,
        'type', 'COORDENACAO_CURSO',
        'turmaId', p_turma_id,
        'disciplinaId', p_disciplina_id,
        'cursoId', p_curso_id,
        'poloId', p_polo_id,
        'coordenacaoId', v_coordenador.coordenacao_id
      )
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.assinatura_eletronica_signatarios_diario_v6_canonicos(
  uuid, uuid, uuid, uuid
) IS
  'Deriva exatamente duas pessoas distintas: professor atribuído e outro professor com coordenação ativa no curso e polo.';

COMMIT;
