-- ---------------------------------------------------------------------------
-- Assinatura eletrônica de Diário v6: conjunto canônico de 1..6 signatários.
--
-- Esta migration é incremental. Ela não altera nem reaplica a migration v1 de
-- provas individuais (`20260820010500_add_individual_signature_proofs_v1.sql`).
-- Os envelopes históricos continuam sob o contrato posicional Professor(1) /
-- Coordenador(2); somente uma política v6 nova cria envelopes genéricos.
-- ---------------------------------------------------------------------------

BEGIN;

-- A política v6 não recebe uma lista do navegador, nem uma regra visual por
-- papel. Ela declara apenas o seletor fechado que a transação do servidor usa
-- para derivar os signatários elegíveis.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
  p_politica jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT p_politica -> 'signerContract' = jsonb_build_object(
    'schemaVersion', 1,
    'selector', 'ASSIGNED_PROFESSOR_AND_ACTIVE_COURSE_COORDINATORS_V1',
    'minSigners', 1,
    'maxSigners', 6
  )
  AND NOT (p_politica ? 'signatarios');
$function$;

-- Vínculo atual do participante. Papéis permanecem somente como dados de
-- vínculo/prova: eles não selecionam nem posicionam elementos do carimbo.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(
  p_envelope_id uuid,
  p_parceiro_id uuid,
  p_auth_user_id uuid,
  p_papel text,
  p_coordenacao_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_papel text := upper(btrim(p_papel));
BEGIN
  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;

  IF NOT FOUND
     OR v_envelope.documento <> 'diario_classe'
     OR v_envelope.origem_tipo <> 'DIARIO'
     OR v_papel NOT IN ('PROFESSOR', 'COORDENADOR')
  THEN
    RETURN false;
  END IF;

  IF v_papel = 'PROFESSOR' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas AS vinculo
      JOIN public.parceiros AS professor ON professor.id = vinculo.professor_id
      WHERE vinculo.turma_id = v_envelope.turma_id
        AND vinculo.disciplina_id = v_envelope.disciplina_id
        AND vinculo.bloqueio_diario = 'PROFESSOR'
        AND professor.id = p_parceiro_id
        AND professor.auth_user_id = p_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.professores_coordenacoes AS coordenacao
    JOIN public.turmas AS turma ON turma.id = v_envelope.turma_id
    JOIN public.parceiros AS coordenador ON coordenador.id = coordenacao.professor_id
    WHERE coordenacao.id = p_coordenacao_id
      AND coordenacao.professor_id = p_parceiro_id
      AND coordenacao.curso_id = turma.curso_id
      AND coordenacao.polo_id = v_envelope.polo_id
      AND coordenacao.status = 'ATIVA'
      AND coordenacao.vigente_de <= statement_timestamp()
      AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
      AND coordenador.auth_user_id = p_auth_user_id
      AND upper(coordenador.tipo) = 'PROFESSOR'
      AND public.is_active_status(coordenador.status)
  );
END;
$function$;

-- Fonte canônica server-side. Não há argumento para lista, nome ou CPF de
-- signatários. O professor atribuído é obrigatório; cada coordenação ativa
-- deve possuir identidade ativa ou toda a solicitação falha fechada.
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
  v_total integer;
  v_signatarios jsonb;
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

  -- Uma coordenação marcada ativa sem parceiro/autenticação válidos não pode
  -- ser silenciosamente ignorada, pois isso mudaria a cadeia de evidências.
  IF EXISTS (
    SELECT 1
    FROM public.professores_coordenacoes AS coordenacao
    LEFT JOIN public.parceiros AS coordenador
      ON coordenador.id = coordenacao.professor_id
    WHERE coordenacao.curso_id = p_curso_id
      AND coordenacao.polo_id = p_polo_id
      AND coordenacao.status = 'ATIVA'
      AND coordenacao.vigente_de <= statement_timestamp()
      AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
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

  WITH candidatos AS (
    SELECT
      0 AS prioridade,
      'PROFESSOR'::text AS papel,
      v_professor.parceiro_id::uuid AS parceiro_id,
      v_professor.auth_user_id::uuid AS auth_user_id,
      v_professor.nome::text AS nome,
      NULL::uuid AS coordenacao_id
    UNION ALL
    SELECT
      1 AS prioridade,
      'COORDENADOR'::text AS papel,
      coordenador.id,
      coordenador.auth_user_id,
      coordenador.nome,
      coordenacao.id
    FROM public.professores_coordenacoes AS coordenacao
    JOIN public.parceiros AS coordenador ON coordenador.id = coordenacao.professor_id
    WHERE coordenacao.curso_id = p_curso_id
      AND coordenacao.polo_id = p_polo_id
      AND coordenacao.status = 'ATIVA'
      AND coordenacao.vigente_de <= statement_timestamp()
      AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
      AND upper(coordenador.tipo) = 'PROFESSOR'
      AND public.is_active_status(coordenador.status)
      AND coordenador.auth_user_id IS NOT NULL
  ), deduplicados AS (
    SELECT DISTINCT ON (auth_user_id)
      prioridade, papel, parceiro_id, auth_user_id, nome, coordenacao_id
    FROM candidatos
    ORDER BY auth_user_id, prioridade, lower(nome), parceiro_id, coordenacao_id NULLS FIRST
  ), ordenados AS (
    SELECT
      row_number() OVER (
        ORDER BY prioridade, lower(nome), parceiro_id, coordenacao_id NULLS FIRST
      )::integer AS ordem,
      *
    FROM deduplicados
  )
  SELECT
    count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'partnerId', parceiro_id,
        'authUserId', auth_user_id,
        'role', papel,
        'coordinationId', coordenacao_id,
        'contextType', papel,
        'contextId', parceiro_id,
        'identitySnapshot', jsonb_build_object(
          'schemaVersion', 1,
          'partnerId', parceiro_id,
          'authUserId', auth_user_id,
          'name', nome,
          'role', papel
        ),
        'linkSnapshot', CASE
          WHEN papel = 'PROFESSOR' THEN jsonb_build_object(
            'schemaVersion', 1,
            'type', 'TURMA_DISCIPLINA',
            'turmaId', p_turma_id,
            'disciplinaId', p_disciplina_id,
            'professorId', parceiro_id
          )
          ELSE jsonb_build_object(
            'schemaVersion', 1,
            'type', 'COORDENACAO_CURSO',
            'turmaId', p_turma_id,
            'disciplinaId', p_disciplina_id,
            'cursoId', p_curso_id,
            'poloId', p_polo_id,
            'coordenacaoId', coordenacao_id
          )
        END
      ))
      ORDER BY ordem
    ), '[]'::jsonb)
  INTO v_total, v_signatarios
  FROM ordenados;

  IF v_total NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_QUANTIDADE_INVALIDA';
  END IF;

  RETURN v_signatarios;
END;
$function$;

-- Resolve a mesma fonte para um envelope v6. O helper só é chamado por
-- triggers/RPCs internas; não é uma API de escolha de participantes.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_envelope_signatarios_v6(
  p_envelope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_curso_id uuid;
BEGIN
  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;

  IF NOT FOUND
     OR NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
       v_envelope.politica_snapshot
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_ENVELOPE_INVALIDO';
  END IF;

  SELECT turma.curso_id
  INTO v_curso_id
  FROM public.turmas AS turma
  WHERE turma.id = v_envelope.turma_id;
  IF v_curso_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CURSO_INDISPONIVEL';
  END IF;

  RETURN public.assinatura_eletronica_signatarios_diario_v6_canonicos(
    v_envelope.turma_id,
    v_envelope.disciplina_id,
    v_curso_id,
    v_envelope.polo_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_participante_diario_v6_canonico(
  p_envelope_id uuid,
  p_ordem integer,
  p_parceiro_id uuid,
  p_auth_user_id uuid,
  p_papel text,
  p_coordenacao_id uuid,
  p_contexto_tipo text,
  p_contexto_id uuid,
  p_identidade_snapshot jsonb,
  p_vinculo_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_esperado jsonb;
BEGIN
  IF p_ordem NOT BETWEEN 1 AND 6
     OR upper(btrim(p_papel)) NOT IN ('PROFESSOR', 'COORDENADOR')
  THEN
    RETURN false;
  END IF;

  SELECT item.signatario
  INTO v_esperado
  FROM jsonb_array_elements(
    public.assinatura_eletronica_envelope_signatarios_v6(p_envelope_id)
  ) WITH ORDINALITY AS item(signatario, ordem)
  WHERE item.ordem = p_ordem;

  RETURN v_esperado IS NOT NULL
    AND p_parceiro_id::text = (v_esperado ->> 'partnerId')
    AND p_auth_user_id::text = (v_esperado ->> 'authUserId')
    AND upper(btrim(p_papel)) = (v_esperado ->> 'role')
    AND p_coordenacao_id::text IS NOT DISTINCT FROM (v_esperado ->> 'coordinationId')
    AND p_contexto_tipo = (v_esperado ->> 'contextType')
    AND p_contexto_id::text = (v_esperado ->> 'contextId')
    AND (p_identidade_snapshot ->> 'partnerId') = (v_esperado -> 'identitySnapshot' ->> 'partnerId')
    AND (p_identidade_snapshot ->> 'authUserId') = (v_esperado -> 'identitySnapshot' ->> 'authUserId')
    AND (p_identidade_snapshot ->> 'name') = (v_esperado -> 'identitySnapshot' ->> 'name')
    AND (p_identidade_snapshot ->> 'role') = (v_esperado -> 'identitySnapshot' ->> 'role')
    AND p_vinculo_snapshot IS NOT DISTINCT FROM (v_esperado -> 'linkSnapshot');
END;
$function$;

-- Depois do INSERT a seleção não é rederivada. Este validador só lê o
-- envelope e os snapshots já congelados, para que uma troca posterior de
-- professor/coordenação não reescreva nem bloqueie a evidência do envelope.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
  p_envelope_id uuid,
  p_ordem integer,
  p_parceiro_id uuid,
  p_auth_user_id uuid,
  p_papel text,
  p_coordenacao_id uuid,
  p_contexto_tipo text,
  p_contexto_id uuid,
  p_identidade_snapshot jsonb,
  p_vinculo_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_papel text := upper(btrim(p_papel));
BEGIN
  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;

  IF NOT FOUND
     OR p_ordem NOT BETWEEN 1 AND 6
     OR v_papel NOT IN ('PROFESSOR', 'COORDENADOR')
     OR p_contexto_tipo IS DISTINCT FROM v_papel
     OR p_contexto_id IS DISTINCT FROM p_parceiro_id
     OR (p_identidade_snapshot ->> 'partnerId') IS DISTINCT FROM p_parceiro_id::text
     OR (p_identidade_snapshot ->> 'authUserId') IS DISTINCT FROM p_auth_user_id::text
     OR (p_identidade_snapshot ->> 'role') IS DISTINCT FROM v_papel
     OR nullif(btrim(p_identidade_snapshot ->> 'name'), '') IS NULL
     OR (p_vinculo_snapshot ->> 'turmaId') IS DISTINCT FROM v_envelope.turma_id::text
     OR (p_vinculo_snapshot ->> 'disciplinaId') IS DISTINCT FROM v_envelope.disciplina_id::text
  THEN
    RETURN false;
  END IF;

  IF v_papel = 'PROFESSOR' THEN
    RETURN p_coordenacao_id IS NULL
      AND (p_vinculo_snapshot ->> 'type') = 'TURMA_DISCIPLINA'
      AND (p_vinculo_snapshot ->> 'professorId') = p_parceiro_id::text;
  END IF;

  RETURN p_coordenacao_id IS NOT NULL
    AND (p_vinculo_snapshot ->> 'type') = 'COORDENACAO_CURSO'
    AND (p_vinculo_snapshot ->> 'coordenacaoId') = p_coordenacao_id::text
    AND (p_vinculo_snapshot ->> 'poloId') = v_envelope.polo_id::text;
END;
$function$;

-- Valida a cardinalidade/ordem do envelope, preservando a semântica exata de
-- políticas v1/v2 históricas. A função não reescreve provas já congeladas.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_participantes_diario_preparaveis_v6(
  p_envelope_id uuid,
  p_status_esperado text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_total integer;
  v_min_ordem integer;
  v_max_ordem integer;
  v_distintas integer;
  v_validadas integer;
BEGIN
  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
    v_envelope.politica_snapshot
  ) THEN
    RETURN (SELECT count(*) = 2
      FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = p_envelope_id)
      AND EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
        WHERE participante.envelope_id = p_envelope_id
          AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
          AND participante.obrigatorio AND participante.status = p_status_esperado
      )
      AND EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
        WHERE participante.envelope_id = p_envelope_id
          AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
          AND participante.obrigatorio AND participante.status = p_status_esperado
      );
  END IF;

  SELECT
    count(*), min(participante.ordem), max(participante.ordem),
    count(DISTINCT participante.ordem),
    count(*) FILTER (
      WHERE participante.obrigatorio
        AND participante.status = p_status_esperado
        AND public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
          participante.envelope_id, participante.ordem, participante.parceiro_id,
          participante.auth_user_id, participante.papel, participante.coordenacao_id,
          participante.contexto_tipo, participante.contexto_id,
          participante.identidade_snapshot, participante.vinculo_snapshot
        )
    )
  INTO v_total, v_min_ordem, v_max_ordem, v_distintas, v_validadas
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = p_envelope_id;

  RETURN v_total BETWEEN 1 AND 6
    AND v_min_ordem = 1
    AND v_max_ordem = v_total
    AND v_distintas = v_total
    AND v_validadas = v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_participantes_diario_finalizaveis_v6(
  p_envelope_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_total integer;
  v_min_ordem integer;
  v_max_ordem integer;
  v_distintas integer;
  v_assinados integer;
BEGIN
  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
    v_envelope.politica_snapshot
  ) THEN
    RETURN (SELECT count(*) = 2
      FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = p_envelope_id)
      AND EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
        WHERE participante.envelope_id = p_envelope_id
          AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
          AND participante.obrigatorio AND participante.status = 'ASSINADO'
      )
      AND EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
        WHERE participante.envelope_id = p_envelope_id
          AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
          AND participante.obrigatorio AND participante.status = 'ASSINADO'
      );
  END IF;

  SELECT
    count(*), min(participante.ordem), max(participante.ordem),
    count(DISTINCT participante.ordem),
    count(*) FILTER (
      WHERE participante.obrigatorio
        AND participante.status = 'ASSINADO'
        AND public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
          participante.envelope_id, participante.ordem, participante.parceiro_id,
          participante.auth_user_id, participante.papel, participante.coordenacao_id,
          participante.contexto_tipo, participante.contexto_id,
          participante.identidade_snapshot, participante.vinculo_snapshot
        )
    )
  INTO v_total, v_min_ordem, v_max_ordem, v_distintas, v_assinados
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = p_envelope_id;

  RETURN v_total BETWEEN 1 AND 6
    AND v_min_ordem = 1
    AND v_max_ordem = v_total
    AND v_distintas = v_total
    AND v_assinados = v_total;
END;
$function$;

-- O validador de constraint aceita o snapshot histórico exacto ou o novo
-- selector v6. Nenhuma política pode misturar ambos os contratos.
ALTER TABLE public.assinatura_eletronica_politicas
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_politicas_diario_signatarios_v1,
  ADD CONSTRAINT assinatura_eletronica_politicas_diario_signatarios_v6
    CHECK (
      documento <> 'diario_classe'
      OR public.assinatura_eletronica_politica_diario_signatarios_v6_valida(politica)
      OR politica -> 'signatarios' = jsonb_build_array(
        jsonb_build_object('role', 'PROFESSOR', 'order', 1, 'required', true),
        jsonb_build_object('role', 'COORDENADOR', 'order', 2, 'required', true)
      )
    );

-- Não arquivamos uma política que ainda é suporte de snapshot histórico: isso
-- seria uma alteração retroativa da cadeia v1/v2. O ambiente deve finalizar
-- ou substituir explicitamente esse envelope antes de migrar a política ativa.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_POLITICA_HISTORICA_REFERENCIADA';
  END IF;
END;
$migration$;

-- Cada política ativa sem envelope histórico recebe uma versão nova. A
-- atualização é única; o bloco acima já rejeitou qualquer política referida.
DO $migration$
DECLARE
  v_old public.assinatura_eletronica_politicas%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_new_policy jsonb;
BEGIN
  FOR v_old IN
    SELECT politica.*
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
    ORDER BY politica.polo_id, politica.versao
    FOR UPDATE
  LOOP
    v_new_policy := (v_old.politica - 'signatarios') || jsonb_build_object(
      'versionLabel', 'Versao ' || (v_old.versao + 1)::text,
      'signerContract', jsonb_build_object(
        'schemaVersion', 1,
        'selector', 'ASSIGNED_PROFESSOR_AND_ACTIVE_COURSE_COORDINATORS_V1',
        'minSigners', 1,
        'maxSigners', 6
      )
    );
    UPDATE public.assinatura_eletronica_politicas AS politica
    SET arquivada_em = v_now
    WHERE politica.id = v_old.id;
    INSERT INTO public.assinatura_eletronica_politicas (
      id, company_id, polo_id, documento, versao, habilitada,
      status_juridico, certificado, politica, request_id,
      criada_por, atualizada_por, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_old.company_id, v_old.polo_id, v_old.documento,
      v_old.versao + 1, v_old.habilitada, v_old.status_juridico,
      v_old.certificado, v_new_policy, NULL, v_old.criada_por,
      v_old.atualizada_por, v_now, v_now
    );
  END LOOP;
END;
$migration$;

-- As provas v1 continuam intactas. Para envelopes v6, a mesma cadeia de
-- desafios/eventos é lida pelo validador v5 já genérico (1..6); os históricos
-- usam a regra P/C original.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_eventos_assinatura_diario_v6_ou_legado_validados(
  p_envelope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_politica jsonb;
  v_provas_individuais jsonb;
BEGIN
  SELECT envelope.politica_snapshot INTO v_politica
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF v_politica IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;

  IF public.assinatura_eletronica_politica_diario_signatarios_v6_valida(v_politica) THEN
    -- O transporte do artefato continua sendo a lista de eventos, mas o
    -- finalizador precisa também reconstruir as provas individuais v5. Isso
    -- mantém nome/CPF mascarado, desafio e hash sob a mesma validação
    -- imutável antes de qualquer artefato ser emitido.
    v_provas_individuais := public.assinatura_eletronica_provas_individuais_diario_v5(
      p_envelope_id
    );
    IF jsonb_typeof(v_provas_individuais) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_provas_individuais) NOT BETWEEN 1 AND 6
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_V5_INVALIDAS';
    END IF;
    RETURN public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(
      p_envelope_id
    );
  END IF;
  RETURN public.assinatura_eletronica_eventos_assinatura_diario_validados(
    p_envelope_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida(
  p_envelope_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_politica jsonb;
  v_total integer;
  v_eventos integer;
  v_provas_individuais jsonb;
BEGIN
  SELECT envelope.politica_snapshot INTO v_politica
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF v_politica IS NULL THEN
    RETURN false;
  END IF;

  IF public.assinatura_eletronica_politica_diario_signatarios_v6_valida(v_politica) THEN
    IF NOT public.assinatura_eletronica_participantes_diario_finalizaveis_v6(p_envelope_id) THEN
      RETURN false;
    END IF;
    v_provas_individuais := public.assinatura_eletronica_provas_individuais_diario_v5(
      p_envelope_id
    );
    IF jsonb_typeof(v_provas_individuais) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_provas_individuais) NOT BETWEEN 1 AND 6
    THEN
      RETURN false;
    END IF;
    PERFORM public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(
      p_envelope_id
    );
    RETURN true;
  END IF;

  SELECT count(*) FILTER (WHERE participante.status = 'ASSINADO')
  INTO v_total
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = p_envelope_id;
  SELECT count(*) INTO v_eventos
  FROM public.assinatura_eletronica_eventos AS evento
  WHERE evento.envelope_id = p_envelope_id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA';
  RETURN v_total = 2
    AND v_eventos = 2
    AND EXISTS (
      SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = p_envelope_id
        AND participante.papel = 'PROFESSOR'
        AND participante.ordem = 1
        AND participante.status = 'ASSINADO'
    )
    AND EXISTS (
      SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = p_envelope_id
        AND participante.papel = 'COORDENADOR'
        AND participante.ordem = 2
        AND participante.status = 'ASSINADO'
    );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

-- O registrador seguro continua idempotente; só a origem da coleção de provas
-- é alterada para selecionar v5 no envelope v6.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(uuid,uuid,uuid,text,text,bigint,text,text,text,bigint,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_old := E'  v_signature_events := public.assinatura_eletronica_eventos_assinatura_diario_validados(\n    v_envelope.id\n  );';
  v_new := E'  v_signature_events := public.assinatura_eletronica_eventos_assinatura_diario_v6_ou_legado_validados(\n    v_envelope.id\n  );';
  v_occurrences := (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PROVAS_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_definition, v_old, v_new);

  -- O finalizador base ainda exigia duas assinaturas. O envelope v6 decide
  -- pelo seu snapshot de política e aceita a sequência inteira 1..6; os
  -- snapshots P/C anteriores preservam literalmente o guard histórico de
  -- duas assinaturas (os gates legados já verificam papel/contexto).
  v_old := E'     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante\n         WHERE participante.envelope_id = v_envelope.id\n           AND participante.status = \'ASSINADO\') <> 2';
  v_new := E'     OR (\n       (\n         public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n           v_envelope.politica_snapshot\n         )\n         AND NOT public.assinatura_eletronica_participantes_diario_finalizaveis_v6(\n           v_envelope.id\n         )\n       )\n       OR (\n         NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n           v_envelope.politica_snapshot\n         )\n         AND (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante\n              WHERE participante.envelope_id = v_envelope.id\n                AND participante.status = \'ASSINADO\') <> 2\n       )\n     )';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PREFLIGHT_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition
     OR v_patched ~ E'v_signature_events := public[.]assinatura_eletronica_eventos_assinatura_diario_validados'
     OR v_patched ~ E'OR [(]SELECT count[(][*][)] FROM public[.]assinatura_eletronica_participantes AS participante\\n         WHERE participante[.]envelope_id = v_envelope[.]id\\n           AND participante[.]status = \'ASSINADO\'[)][ ]*<> 2'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- A migration v1 que criou este validador não é editada. Esta substituição
-- incremental amplia apenas o ramo v6 e mantém a validação posicional para
-- qualquer envelope cujo snapshot ainda seja P/C.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.validar_assinatura_eletronica_por_codigo(text)'::regprocedure
  ) INTO v_definition;
  v_patched := v_definition;

  v_old := E'    AND participante.papel IN (\'PROFESSOR\', \'COORDENADOR\')\n    AND (\n      (participante.papel = \'PROFESSOR\' AND participante.ordem = 1)\n      OR (participante.papel = \'COORDENADOR\' AND participante.ordem = 2)\n    )';
  v_new := E'    AND participante.papel IN (\'PROFESSOR\', \'COORDENADOR\')\n    AND (\n      (\n        public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n          envelope.politica_snapshot\n        )\n        AND participante.ordem BETWEEN 1 AND 6\n        AND public.assinatura_eletronica_participante_diario_v6_snapshot_valido(\n          envelope.id, participante.ordem, participante.parceiro_id,\n          participante.auth_user_id, participante.papel, participante.coordenacao_id,\n          participante.contexto_tipo, participante.contexto_id,\n          participante.identidade_snapshot, participante.vinculo_snapshot\n        )\n      )\n      OR (\n        NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n          envelope.politica_snapshot\n        )\n        AND (\n          (participante.papel = \'PROFESSOR\' AND participante.ordem = 1)\n          OR (participante.papel = \'COORDENADOR\' AND participante.ordem = 2)\n        )\n      )\n    )';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_VALIDACAO_PUBLICA_PAPEL_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'    AND (\n      SELECT pg_catalog.count(*)\n      FROM public.assinatura_eletronica_participantes AS total_participante\n      WHERE total_participante.envelope_id = envelope.id\n        AND total_participante.status = \'ASSINADO\'\n    ) = 2\n    AND (\n      SELECT pg_catalog.count(*)\n      FROM public.assinatura_eletronica_eventos AS total_evento\n      WHERE total_evento.envelope_id = envelope.id\n        AND total_evento.tipo = \'ASSINATURA_CONCLUIDA\'\n    ) = 2';
  v_new := E'    AND public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida(\n      envelope.id\n    )';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_VALIDACAO_PUBLICA_QUANTIDADE_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_VALIDACAO_PUBLICA_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- Publicação do original libera ordem 1 de forma genérica. A geometria v5 já
-- congelada no envelope é a mesma para qualquer quantidade de participantes.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_internal_registrar_original_publicar_segu(uuid,uuid,uuid,text,text,bigint,text,text,jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure
  ) INTO v_definition;
  v_patched := v_definition;

  v_old := E'  v_professor_id uuid;';
  v_new := E'  v_primeiro_participante_id uuid;\n  v_primeiro_participante_papel text;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_DECLARACAO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  SELECT participante.id INTO v_professor_id\n  FROM public.assinatura_eletronica_participantes AS participante\n  WHERE participante.envelope_id = v_envelope.id\n    AND participante.papel = \'PROFESSOR\'\n    AND participante.ordem = 1;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_PROFESSOR_INDISPONIVEL\';\n  END IF;';
  v_new := E'  SELECT participante.id, participante.papel\n  INTO v_primeiro_participante_id, v_primeiro_participante_papel\n  FROM public.assinatura_eletronica_participantes AS participante\n  WHERE participante.envelope_id = v_envelope.id\n    AND participante.ordem = 1;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_PRIMEIRO_PARTICIPANTE_INDISPONIVEL\';\n  END IF;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_PRIMEIRO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'    \'firstParticipantId\', v_professor_id,\n    \'firstParticipantRole\', \'PROFESSOR\'';
  v_new := E'    \'firstParticipantId\', v_primeiro_participante_id,\n    \'firstParticipantRole\', v_primeiro_participante_papel';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_RESULTADO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante\n         WHERE participante.envelope_id = v_envelope.id) <> 2\n     OR NOT EXISTS (\n       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante\n       WHERE participante.envelope_id = v_envelope.id\n         AND participante.papel = \'PROFESSOR\' AND participante.ordem = 1\n         AND participante.obrigatorio AND participante.status = \'AGUARDANDO_ORDEM\'\n     )\n     OR NOT EXISTS (\n       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante\n       WHERE participante.envelope_id = v_envelope.id\n         AND participante.papel = \'COORDENADOR\' AND participante.ordem = 2\n         AND participante.obrigatorio AND participante.status = \'AGUARDANDO_ORDEM\'\n     )';
  v_new := E'     OR NOT public.assinatura_eletronica_participantes_diario_preparaveis_v6(\n       v_envelope.id, \'AGUARDANDO_ORDEM\'\n     )';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_PREFLIGHT_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  UPDATE public.assinatura_eletronica_participantes AS participante\n  SET status = \'PENDENTE\'\n  WHERE participante.envelope_id = v_envelope.id\n    AND participante.papel = \'PROFESSOR\'\n    AND participante.ordem = 1\n    AND participante.status = \'AGUARDANDO_ORDEM\'\n  RETURNING participante.id INTO v_professor_id;';
  v_new := E'  UPDATE public.assinatura_eletronica_participantes AS participante\n  SET status = \'PENDENTE\'\n  WHERE participante.envelope_id = v_envelope.id\n    AND participante.ordem = 1\n    AND participante.status = \'AGUARDANDO_ORDEM\'\n  RETURNING participante.id, participante.papel\n  INTO v_primeiro_participante_id, v_primeiro_participante_papel;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_LIBERACAO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'    v_envelope.id, v_professor_id, \'PARTICIPANTE_LIBERADO\', p_actor_auth_user_id,\n    jsonb_build_object(\'role\', \'PROFESSOR\', \'order\', 1)';
  v_new := E'    v_envelope.id, v_primeiro_participante_id, \'PARTICIPANTE_LIBERADO\', p_actor_auth_user_id,\n    jsonb_build_object(\'role\', v_primeiro_participante_papel, \'order\', 1)';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_EVENTO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition
     OR v_patched ~ E'participante[.]papel = \'PROFESSOR\'\n    AND participante[.]ordem = 1'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PUBLICAR_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- O último signatário efetivo, e não um papel visual, autoriza a finalização
-- v6. Envelopes históricos mantêm a verificação expressa de Coordenador(2).
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_v6 boolean;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF v_envelope.documento <> 'diario_classe' OR v_envelope.origem_tipo <> 'DIARIO' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_FINALIZACAO_ATOR_NAO_AUTORIZADO';
  END IF;
  v_v6 := public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
    v_envelope.politica_snapshot
  );

  SELECT participante.* INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  JOIN public.assinatura_eletronica_eventos AS evento
    ON evento.envelope_id = participante.envelope_id
   AND evento.participante_id = participante.id
   AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  JOIN public.assinatura_eletronica_desafios AS desafio
    ON desafio.id::text = (evento.dados ->> 'challengeId')
   AND desafio.envelope_id = participante.envelope_id
   AND desafio.participante_id = participante.id
  WHERE participante.envelope_id = v_envelope.id
    AND participante.ordem = (
      SELECT max(ultimo.ordem)
      FROM public.assinatura_eletronica_participantes AS ultimo
      WHERE ultimo.envelope_id = v_envelope.id
    )
    AND participante.status = 'ASSINADO'
    AND participante.auth_user_id = p_actor_auth_user_id
    AND participante.assinado_por_auth_user_id = p_actor_auth_user_id
    AND evento.ator_auth_user_id = p_actor_auth_user_id
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO'
    AND desafio.consumido_em = participante.assinado_em
    AND desafio.actor_auth_user_id = p_actor_auth_user_id
    AND desafio.auth_session_id = p_auth_session_id
    AND desafio.perfil = participante.papel
    AND desafio.contexto_id = participante.contexto_id;

  IF NOT FOUND
     OR (v_v6 AND (
       NOT public.assinatura_eletronica_participantes_diario_finalizaveis_v6(v_envelope.id)
       OR NOT public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
         v_envelope.id, v_participante.ordem, v_participante.parceiro_id,
         v_participante.auth_user_id, v_participante.papel,
         v_participante.coordenacao_id, v_participante.contexto_tipo,
         v_participante.contexto_id, v_participante.identidade_snapshot,
         v_participante.vinculo_snapshot
       )
     ))
     OR (NOT v_v6 AND (
       v_participante.papel <> 'COORDENADOR'
       OR v_participante.ordem <> 2
       OR NOT public.assinatura_eletronica_perfil_contexto_valido(
         p_actor_auth_user_id, 'COORDENADOR', v_participante.contexto_id
       )
       OR NOT public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(
         v_envelope.id, v_participante.parceiro_id, v_participante.auth_user_id,
         v_participante.papel, v_participante.coordenacao_id
       )
     ))
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_FINALIZACAO_ATOR_NAO_AUTORIZADO';
  END IF;
  RETURN v_participante.id;
END;
$function$;

-- Preparação do original: troca somente o contrato de participantes; todos os
-- demais hashes, artefatos e checagens de snapshot do wrapper seguro seguem
-- inalterados.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_internal_preparar_original_diario_seguro(uuid,uuid,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_old := E'     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante\n         WHERE participante.envelope_id = v_envelope.id) <> 2\n     OR NOT EXISTS (\n       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante\n       WHERE participante.envelope_id = v_envelope.id\n         AND participante.papel = \'PROFESSOR\' AND participante.ordem = 1\n         AND participante.obrigatorio\n     )\n     OR NOT EXISTS (\n       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante\n       WHERE participante.envelope_id = v_envelope.id\n         AND participante.papel = \'COORDENADOR\' AND participante.ordem = 2\n         AND participante.obrigatorio\n     )';
  v_new := E'     OR NOT public.assinatura_eletronica_participantes_diario_preparaveis_v6(\n       v_envelope.id, \'AGUARDANDO_ORDEM\'\n     )';
  v_occurrences := (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PREPARAR_ORIGINAL_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_definition, v_old, v_new);
  IF v_patched IS NOT DISTINCT FROM v_definition THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PREPARAR_ORIGINAL_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- Consumo sequencial: libera a próxima ordem canônica, seja ela qual for. O
-- ramo também preserva o envelope histórico de duas posições sem tratar papel
-- como uma instrução de layout.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(text,uuid,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_patched := v_definition;

  v_old := E'  v_next_participant_id uuid;\n  v_next_participant_role text;\n  v_requires_finalization boolean;';
  v_new := E'  v_next_participant_id uuid;\n  v_next_participant_role text;\n  v_next_participant_order integer;\n  v_requires_finalization boolean;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CONSUMO_DECLARACAO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  IF v_participante.status <> \'DESAFIO_PENDENTE\'\n     OR (v_participante.ordem = 1 AND v_envelope.status <> \'PENDENTE\')\n     OR (v_participante.ordem = 2 AND v_envelope.status <> \'EM_ASSINATURA\')\n  THEN';
  v_new := E'  IF v_participante.status <> \'DESAFIO_PENDENTE\'\n     OR v_participante.ordem NOT BETWEEN 1 AND 6\n     OR (v_participante.ordem = 1 AND v_envelope.status <> \'PENDENTE\')\n     OR (v_participante.ordem > 1 AND v_envelope.status <> \'EM_ASSINATURA\')\n  THEN';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CONSUMO_ESTADO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  IF v_participante.ordem = 1 THEN\n    UPDATE public.assinatura_eletronica_participantes AS participante\n    SET status = \'PENDENTE\'\n    WHERE participante.envelope_id = v_envelope.id\n      AND participante.ordem = 2\n      AND participante.papel = \'COORDENADOR\'\n      AND participante.status = \'AGUARDANDO_ORDEM\'\n    RETURNING participante.id, participante.papel\n    INTO v_next_participant_id, v_next_participant_role;\n    IF v_next_participant_id IS NULL THEN\n      RAISE EXCEPTION USING\n        ERRCODE = \'55000\',\n        MESSAGE = \'ASSINATURA_PROXIMO_PARTICIPANTE_INDISPONIVEL\';\n    END IF;\n\n    UPDATE public.assinatura_eletronica_envelopes AS envelope\n    SET status = \'EM_ASSINATURA\'\n    WHERE envelope.id = v_envelope.id;\n    v_requires_finalization := false;\n  ELSE\n    UPDATE public.assinatura_eletronica_envelopes AS envelope\n    SET status = \'FINALIZANDO\'\n    WHERE envelope.id = v_envelope.id;\n    v_next_participant_id := NULL;\n    v_next_participant_role := NULL;\n    v_requires_finalization := true;\n  END IF;';
  v_new := E'  SELECT participante.id, participante.papel, participante.ordem\n  INTO v_next_participant_id, v_next_participant_role, v_next_participant_order\n  FROM public.assinatura_eletronica_participantes AS participante\n  WHERE participante.envelope_id = v_envelope.id\n    AND participante.ordem = v_participante.ordem + 1\n    AND participante.status = \'AGUARDANDO_ORDEM\'\n  FOR UPDATE;\n\n  IF v_next_participant_id IS NOT NULL THEN\n    UPDATE public.assinatura_eletronica_participantes AS participante\n    SET status = \'PENDENTE\'\n    WHERE participante.id = v_next_participant_id\n      AND participante.status = \'AGUARDANDO_ORDEM\';\n    UPDATE public.assinatura_eletronica_envelopes AS envelope\n    SET status = \'EM_ASSINATURA\'\n    WHERE envelope.id = v_envelope.id;\n    v_requires_finalization := false;\n  ELSE\n    IF EXISTS (\n      SELECT 1\n      FROM public.assinatura_eletronica_participantes AS restante\n      WHERE restante.envelope_id = v_envelope.id\n        AND restante.ordem > v_participante.ordem\n    ) THEN\n      RAISE EXCEPTION USING\n        ERRCODE = \'55000\',\n        MESSAGE = \'ASSINATURA_PROXIMO_PARTICIPANTE_INDISPONIVEL\';\n    END IF;\n    UPDATE public.assinatura_eletronica_envelopes AS envelope\n    SET status = \'FINALIZANDO\'\n    WHERE envelope.id = v_envelope.id;\n    v_next_participant_role := NULL;\n    v_next_participant_order := NULL;\n    v_requires_finalization := true;\n  END IF;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CONSUMO_SEQUENCIA_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'      jsonb_build_object(\'role\', v_next_participant_role, \'order\', 2)';
  v_new := E'      jsonb_build_object(\'role\', v_next_participant_role, \'order\', v_next_participant_order)';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CONSUMO_EVENTO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition
     OR v_patched ~ E'participante[.]papel = \'COORDENADOR\'\n      AND participante[.]ordem = 2'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_CONSUMO_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- Trigger de fundação: v6 compara cada linha com a lista derivada no próprio
-- servidor; v1/v2 continuam a exigir exatamente Professor(1)/Coordenador(2).
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_participante_fundacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_turma_curso_id uuid;
  v_professor_id uuid;
  v_v6 boolean;
BEGIN
  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = NEW.envelope_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF TG_OP = 'INSERT' AND (v_envelope.status <> 'RASCUNHO' OR NEW.status <> 'AGUARDANDO_ORDEM') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PARTICIPANTE_ESTADO_INICIAL_INVALIDO';
  END IF;

  v_v6 := public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
    v_envelope.politica_snapshot
  );
  IF v_v6 THEN
    IF (TG_OP = 'INSERT' AND NOT public.assinatura_eletronica_participante_diario_v6_canonico(
          NEW.envelope_id, NEW.ordem, NEW.parceiro_id, NEW.auth_user_id,
          NEW.papel, NEW.coordenacao_id, NEW.contexto_tipo, NEW.contexto_id,
          NEW.identidade_snapshot, NEW.vinculo_snapshot
        ))
       OR (TG_OP = 'UPDATE' AND NOT public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
          NEW.envelope_id, NEW.ordem, NEW.parceiro_id, NEW.auth_user_id,
          NEW.papel, NEW.coordenacao_id, NEW.contexto_tipo, NEW.contexto_id,
          NEW.identidade_snapshot, NEW.vinculo_snapshot
        ))
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_PARTICIPANTE_NAO_CANONICO';
    END IF;
    RETURN NEW;
  END IF;

  SELECT turma.curso_id INTO v_turma_curso_id
  FROM public.turmas AS turma
  WHERE turma.id = v_envelope.turma_id;
  IF (NEW.papel = 'PROFESSOR' AND NEW.ordem <> 1)
     OR (NEW.papel = 'COORDENADOR' AND NEW.ordem <> 2)
     OR NEW.papel NOT IN ('PROFESSOR', 'COORDENADOR')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTES_DIARIO_INVALIDOS';
  END IF;
  IF NEW.identidade_snapshot ->> 'partnerId' IS DISTINCT FROM NEW.parceiro_id::text
     OR NEW.identidade_snapshot ->> 'authUserId' IS DISTINCT FROM NEW.auth_user_id::text
     OR NEW.vinculo_snapshot ->> 'turmaId' IS DISTINCT FROM v_envelope.turma_id::text
     OR NEW.vinculo_snapshot ->> 'disciplinaId' IS DISTINCT FROM v_envelope.disciplina_id::text
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTE_SNAPSHOT_INVALIDO';
  END IF;
  IF NEW.papel = 'PROFESSOR' THEN
    SELECT vinculo.professor_id INTO v_professor_id
    FROM public.turmas_disciplinas AS vinculo
    WHERE vinculo.turma_id = v_envelope.turma_id
      AND vinculo.disciplina_id = v_envelope.disciplina_id;
    IF v_professor_id IS DISTINCT FROM NEW.parceiro_id OR NOT public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(
      NEW.envelope_id, NEW.parceiro_id, NEW.auth_user_id, NEW.papel, NEW.coordenacao_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PROFESSOR_VINCULO_INVALIDO';
    END IF;
  ELSIF NOT public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(
    NEW.envelope_id, NEW.parceiro_id, NEW.auth_user_id, NEW.papel, NEW.coordenacao_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_COORDENADOR_VINCULO_INVALIDO';
  END IF;
  RETURN NEW;
END;
$function$;

-- A reautenticação continua vinculada a um papel/contexto probatório, mas a
-- ordem v6 é a ordem canônica do conjunto, não uma regra Professor/Coord.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_escopo_reauth(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_fase text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_fase text := upper(btrim(coalesce(p_fase, '')));
  v_email text;
  v_password_enabled boolean;
  v_v6 boolean;
BEGIN
  IF v_perfil NOT IN ('PROFESSOR', 'COORDENADOR')
     OR v_fase NOT IN ('PREPARAR', 'REGISTRAR', 'CONSUMIR')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_ESCOPO_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  v_v6 := public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
    v_envelope.politica_snapshot
  );
  SELECT participante.* INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.id = p_participante_id
    AND participante.envelope_id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_participante.papel <> v_perfil
     OR v_participante.contexto_tipo <> v_perfil
     OR v_participante.contexto_id IS DISTINCT FROM p_context_id
     OR v_participante.auth_user_id IS DISTINCT FROM p_actor_auth_user_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_PARTICIPANTE_NAO_AUTORIZADO';
  END IF;

  IF (NOT v_v6 AND (
       (v_perfil = 'PROFESSOR' AND v_participante.ordem <> 1)
       OR (v_perfil = 'COORDENADOR' AND v_participante.ordem <> 2)
     ))
     OR (v_v6 AND NOT public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
       v_envelope.id, v_participante.ordem, v_participante.parceiro_id,
       v_participante.auth_user_id, v_participante.papel,
       v_participante.coordenacao_id, v_participante.contexto_tipo,
       v_participante.contexto_id, v_participante.identidade_snapshot,
       v_participante.vinculo_snapshot
     ))
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_REAUTH_ORDEM_INVALIDA';
  END IF;

  IF v_fase IN ('PREPARAR', 'REGISTRAR') THEN
    IF v_envelope.status NOT IN ('PENDENTE', 'EM_ASSINATURA')
       OR v_participante.status NOT IN ('PENDENTE', 'DESAFIO_PENDENTE')
       OR EXISTS (
         SELECT 1
         FROM public.assinatura_eletronica_participantes AS anterior
         WHERE anterior.envelope_id = v_envelope.id
           AND anterior.ordem < v_participante.ordem
           AND anterior.status <> 'ASSINADO'
       )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_ORDEM_OU_ESTADO_INVALIDO';
    END IF;
  ELSIF v_participante.status NOT IN ('DESAFIO_PENDENTE', 'ASSINADO')
        OR v_envelope.status NOT IN ('PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO', 'ASSINADO')
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_ESTADO_INVALIDO';
  END IF;

  -- A política é sempre atual. A atribuição/vigência é revalidada na abertura
  -- e no registro do desafio; no CONSUMIR de um desafio já verificado usamos
  -- só o snapshot congelado para não invalidar um replay curto por alteração
  -- administrativa posterior.
  IF NOT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.id = v_envelope.politica_id
      AND politica.arquivada_em IS NULL
      AND politica.habilitada
      AND politica.status_juridico = 'APROVADA'
      AND politica.versao = v_envelope.politica_versao
      AND politica.politica = v_envelope.politica_snapshot
      AND politica.certificado = v_envelope.certificado_snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
  END IF;
  IF (v_v6 AND NOT public.assinatura_eletronica_participante_diario_v6_snapshot_valido(
        v_envelope.id, v_participante.ordem, v_participante.parceiro_id,
        v_participante.auth_user_id, v_participante.papel,
        v_participante.coordenacao_id, v_participante.contexto_tipo,
        v_participante.contexto_id, v_participante.identidade_snapshot,
        v_participante.vinculo_snapshot
      ))
     OR (
       (NOT v_v6 OR v_fase IN ('PREPARAR', 'REGISTRAR'))
       AND NOT public.assinatura_eletronica_perfil_contexto_valido(
         p_actor_auth_user_id, v_perfil, p_context_id
       )
     )
     OR (
       (NOT v_v6 OR v_fase IN ('PREPARAR', 'REGISTRAR'))
       AND NOT public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(
         v_envelope.id, v_participante.parceiro_id, v_participante.auth_user_id,
         v_participante.papel, v_participante.coordenacao_id
       )
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_SIGNATARIO_VINCULO_REVOGADO';
  END IF;

  SELECT auth_user.email,
         nullif(btrim(coalesce(auth_user.encrypted_password, '')), '') IS NOT NULL
  INTO v_email, v_password_enabled
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_auth_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_USUARIO_INVALIDO';
  END IF;

  RETURN jsonb_build_object(
    'email', v_email,
    'passwordEnabled', coalesce(v_password_enabled, false),
    'envelopeId', v_envelope.id,
    'envelopeStatus', v_envelope.status,
    'participantId', v_participante.id,
    'participantRole', v_participante.papel,
    'participantOrder', v_participante.ordem,
    'participantStatus', v_participante.status,
    'profile', v_perfil,
    'contextId', v_participante.contexto_id,
    'policyVersion', v_envelope.politica_versao
  );
END;
$function$;

-- A RPC pública mantém a mesma assinatura de cinco argumentos. O navegador
-- continua enviando somente turma/disciplina/contexto/idempotência; os 1..6
-- participantes são derivados pela função fechada acima. O patch parte da
-- versão v5 para preservar, entre outros, a fonte watermark_landscape do polo.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_patched := v_definition;

  v_old := E'  v_professor public.parceiros%ROWTYPE;\n  v_coordenador public.parceiros%ROWTYPE;';
  v_new := E'  v_professor public.parceiros%ROWTYPE;\n  v_signatarios_canonicos jsonb;\n  v_signatario jsonb;\n  v_ordem integer;\n  v_participante_id uuid;\n  v_coordenador public.parceiros%ROWTYPE;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_DECLARACAO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'    public.turmas_disciplinas,\n    public.matriculas,\n    public.parceiros,\n    public.aulas_turma,';
  v_new := E'    public.turmas_disciplinas,\n    public.matriculas,\n    public.parceiros,\n    public.professores_coordenacoes,\n    public.aulas_turma,';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_LOCK_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  SELECT professor.* INTO v_professor\n  FROM public.turmas_disciplinas AS vinculo\n  JOIN public.parceiros AS professor ON professor.id = vinculo.professor_id\n  WHERE vinculo.turma_id = p_turma_id\n    AND vinculo.disciplina_id = p_disciplina_id\n    AND upper(professor.tipo) = \'PROFESSOR\'\n    AND public.is_active_status(professor.status)\n    AND professor.auth_user_id IS NOT NULL\n  FOR SHARE OF professor;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_PROFESSOR_SEM_IDENTIDADE_ATIVA\';\n  END IF;\n\n  SELECT coordenacao.*\n  INTO v_coordenacao\n  FROM public.professores_coordenacoes AS coordenacao\n  JOIN public.parceiros AS coordenador ON coordenador.id = coordenacao.professor_id\n  WHERE coordenacao.curso_id = v_turma.curso_id\n    AND coordenacao.polo_id = v_turma.polo_id\n    AND coordenacao.status = \'ATIVA\'\n    AND coordenacao.vigente_de <= statement_timestamp()\n    AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())\n    AND upper(coordenador.tipo) = \'PROFESSOR\'\n    AND public.is_active_status(coordenador.status)\n    AND coordenador.auth_user_id IS NOT NULL\n  ORDER BY coordenacao.vigente_de DESC, coordenacao.id\n  LIMIT 1\n  FOR SHARE OF coordenacao, coordenador;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_COORDENADOR_SEM_VINCULO_ATIVO\';\n  END IF;\n  SELECT coordenador.* INTO v_coordenador\n  FROM public.parceiros AS coordenador\n  WHERE coordenador.id = v_coordenacao.professor_id\n  FOR SHARE;';
  v_new := E'  -- O nome do professor continua no snapshot acadêmico; a elegibilidade\n  -- de assinatura é resolvida separadamente pela fonte v6 abaixo.\n  SELECT professor.* INTO v_professor\n  FROM public.turmas_disciplinas AS vinculo\n  JOIN public.parceiros AS professor ON professor.id = vinculo.professor_id\n  WHERE vinculo.turma_id = p_turma_id\n    AND vinculo.disciplina_id = p_disciplina_id\n    AND upper(professor.tipo) = \'PROFESSOR\'\n    AND public.is_active_status(professor.status)\n  FOR SHARE OF professor;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_PROFESSOR_REFERENCIA_INDISPONIVEL\';\n  END IF;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_FONTE_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  IF NOT FOUND\n     OR NOT v_politica.habilitada\n     OR v_politica.status_juridico <> \'APROVADA\'\n     OR coalesce((v_politica.certificado ->> \'cadeiaEvidencias\')::boolean, false) IS NOT TRUE\n  THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_POLITICA_NAO_HABILITADA\';\n  END IF;';
  v_new := E'  IF NOT FOUND\n     OR NOT v_politica.habilitada\n     OR v_politica.status_juridico <> \'APROVADA\'\n     OR coalesce((v_politica.certificado ->> \'cadeiaEvidencias\')::boolean, false) IS NOT TRUE\n     OR NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(v_politica.politica)\n  THEN\n    RAISE EXCEPTION USING ERRCODE = \'55000\', MESSAGE = \'ASSINATURA_POLITICA_NAO_HABILITADA\';\n  END IF;\n\n  v_signatarios_canonicos := public.assinatura_eletronica_signatarios_diario_v6_canonicos(\n    v_turma.id, v_disciplina.id, v_curso.id, v_polo.id\n  );';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_POLITICA_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  INSERT INTO public.assinatura_eletronica_participantes (\n    id, envelope_id, papel, ordem, obrigatorio, parceiro_id, auth_user_id,\n    vinculo_verificado_em, status, contexto_tipo, contexto_id,\n    coordenacao_id, identidade_snapshot, vinculo_snapshot\n  ) VALUES\n  (\n    v_professor_participante_id, v_envelope_id, \'PROFESSOR\', 1, true,\n    v_professor.id, v_professor.auth_user_id, statement_timestamp(),\n    \'AGUARDANDO_ORDEM\', \'PROFESSOR\', v_professor.id, NULL,\n    jsonb_build_object(\n      \'schemaVersion\', 1, \'partnerId\', v_professor.id,\n      \'authUserId\', v_professor.auth_user_id, \'name\', v_professor.nome,\n      \'role\', \'PROFESSOR\'\n    ),\n    jsonb_build_object(\n      \'schemaVersion\', 1, \'type\', \'TURMA_DISCIPLINA\',\n      \'turmaId\', v_turma.id, \'disciplinaId\', v_disciplina.id,\n      \'professorId\', v_professor.id\n    )\n  ),\n  (\n    v_coordenador_participante_id, v_envelope_id, \'COORDENADOR\', 2, true,\n    v_coordenador.id, v_coordenador.auth_user_id, statement_timestamp(),\n    \'AGUARDANDO_ORDEM\', \'COORDENADOR\', v_coordenador.id, v_coordenacao.id,\n    jsonb_build_object(\n      \'schemaVersion\', 1, \'partnerId\', v_coordenador.id,\n      \'authUserId\', v_coordenador.auth_user_id, \'name\', v_coordenador.nome,\n      \'role\', \'COORDENADOR\'\n    ),\n    jsonb_build_object(\n      \'schemaVersion\', 1, \'type\', \'COORDENACAO_CURSO\',\n      \'turmaId\', v_turma.id, \'disciplinaId\', v_disciplina.id,\n      \'cursoId\', v_curso.id, \'poloId\', v_polo.id,\n      \'coordenacaoId\', v_coordenacao.id\n    )\n  );\n\n  PERFORM public.assinatura_eletronica_adicionar_evento(\n    v_envelope_id, NULL, \'ENVELOPE_CRIADO\', v_actor,\n    jsonb_build_object(\'requestId\', p_request_id, \'originVersion\', v_origem_versao)\n  );\n  PERFORM public.assinatura_eletronica_adicionar_evento(\n    v_envelope_id, v_professor_participante_id, \'PARTICIPANTE_ADICIONADO\', v_actor,\n    jsonb_build_object(\'role\', \'PROFESSOR\', \'order\', 1)\n  );\n  PERFORM public.assinatura_eletronica_adicionar_evento(\n    v_envelope_id, v_coordenador_participante_id, \'PARTICIPANTE_ADICIONADO\', v_actor,\n    jsonb_build_object(\'role\', \'COORDENADOR\', \'order\', 2)\n  );';
  v_new := E'  PERFORM public.assinatura_eletronica_adicionar_evento(\n    v_envelope_id, NULL, \'ENVELOPE_CRIADO\', v_actor,\n    jsonb_build_object(\'requestId\', p_request_id, \'originVersion\', v_origem_versao)\n  );\n\n  FOR v_signatario, v_ordem IN\n    SELECT item.signatario, item.ordem::integer\n    FROM jsonb_array_elements(v_signatarios_canonicos)\n      WITH ORDINALITY AS item(signatario, ordem)\n    ORDER BY item.ordem\n  LOOP\n    v_participante_id := gen_random_uuid();\n    INSERT INTO public.assinatura_eletronica_participantes (\n      id, envelope_id, papel, ordem, obrigatorio, parceiro_id, auth_user_id,\n      vinculo_verificado_em, status, contexto_tipo, contexto_id,\n      coordenacao_id, identidade_snapshot, vinculo_snapshot\n    ) VALUES (\n      v_participante_id, v_envelope_id, v_signatario ->> \'role\', v_ordem, true,\n      (v_signatario ->> \'partnerId\')::uuid, (v_signatario ->> \'authUserId\')::uuid,\n      statement_timestamp(), \'AGUARDANDO_ORDEM\', v_signatario ->> \'contextType\',\n      (v_signatario ->> \'contextId\')::uuid,\n      NULLIF(v_signatario ->> \'coordinationId\', \'\')::uuid,\n      v_signatario -> \'identitySnapshot\', v_signatario -> \'linkSnapshot\'\n    );\n    PERFORM public.assinatura_eletronica_adicionar_evento(\n      v_envelope_id, v_participante_id, \'PARTICIPANTE_ADICIONADO\', v_actor,\n      jsonb_build_object(\'role\', v_signatario ->> \'role\', \'order\', v_ordem)\n    );\n  END LOOP;';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_PARTICIPANTES_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'  v_resultado := jsonb_build_object(\n    \'envelopeId\', v_envelope_id,\n    \'documentType\', \'diario_classe\',\n    \'originType\', \'DIARIO\',\n    \'originVersion\', v_origem_versao,\n    \'composerSchemaVersion\', 1,\n    \'academicSnapshotSha256\', v_academico_snapshot_sha256,\n    \'status\', \'RASCUNHO\',\n    \'statusLabel\', public.assinatura_eletronica_envelope_status_label(\'RASCUNHO\'),\n    \'participants\', jsonb_build_array(\n      jsonb_build_object(\n        \'participantId\', v_professor_participante_id,\n        \'role\', \'PROFESSOR\',\n        \'roleLabel\', public.assinatura_eletronica_papel_label(\'PROFESSOR\'),\n        \'order\', 1,\n        \'status\', \'AGUARDANDO_ORDEM\',\n        \'statusLabel\', public.assinatura_eletronica_participante_status_label(\'AGUARDANDO_ORDEM\'),\n        \'contextId\', v_professor.id,\n        \'canAct\', false,\n        \'signedAt\', NULL\n      ),\n      jsonb_build_object(\n        \'participantId\', v_coordenador_participante_id,\n        \'role\', \'COORDENADOR\',\n        \'roleLabel\', public.assinatura_eletronica_papel_label(\'COORDENADOR\'),\n        \'order\', 2,\n        \'status\', \'AGUARDANDO_ORDEM\',\n        \'statusLabel\', public.assinatura_eletronica_participante_status_label(\'AGUARDANDO_ORDEM\'),\n        \'contextId\', v_coordenador.id,\n        \'canAct\', false,\n        \'signedAt\', NULL\n      )\n    )\n  );';
  v_new := E'  v_resultado := jsonb_build_object(\n    \'envelopeId\', v_envelope_id,\n    \'documentType\', \'diario_classe\',\n    \'originType\', \'DIARIO\',\n    \'originVersion\', v_origem_versao,\n    \'composerSchemaVersion\', 1,\n    \'academicSnapshotSha256\', v_academico_snapshot_sha256,\n    \'status\', \'RASCUNHO\',\n    \'statusLabel\', public.assinatura_eletronica_envelope_status_label(\'RASCUNHO\'),\n    \'participants\', (\n      SELECT coalesce(jsonb_agg(jsonb_build_object(\n        \'participantId\', participante.id,\n        \'role\', participante.papel,\n        \'roleLabel\', public.assinatura_eletronica_papel_label(participante.papel),\n        \'order\', participante.ordem,\n        \'status\', participante.status,\n        \'statusLabel\', public.assinatura_eletronica_participante_status_label(participante.status),\n        \'contextId\', participante.contexto_id,\n        \'canAct\', false,\n        \'signedAt\', NULL\n      ) ORDER BY participante.ordem), \'[]\'::jsonb)\n      FROM public.assinatura_eletronica_participantes AS participante\n      WHERE participante.envelope_id = v_envelope_id\n    )\n  );';
  v_occurrences := (pg_catalog.length(v_patched) - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_RESULTADO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition
     OR v_patched ~ E'v_professor_participante_id, v_envelope_id, \'PROFESSOR\', 1'
     OR v_patched ~ E'v_coordenador_participante_id, v_envelope_id, \'COORDENADOR\', 2'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_SIGNATARIOS_V6_SOLICITACAO_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- Helpers de resolução/validação não são endpoints: somente wrappers já
-- service-only os usam sob SECURITY DEFINER. A solicitação autenticada recebe
-- turma/disciplina/contexto, nunca uma lista, nome ou CPF de signatário.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_politica_diario_signatarios_v6_valida(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_vinculo_signatario_diario_v6_valido(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_signatarios_diario_v6_canonicos(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_envelope_signatarios_v6(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_participante_diario_v6_canonico(uuid, integer, uuid, uuid, text, uuid, text, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_participante_diario_v6_snapshot_valido(uuid, integer, uuid, uuid, text, uuid, text, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_participantes_diario_preparaveis_v6(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_participantes_diario_finalizaveis_v6(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_eventos_assinatura_diario_v6_ou_legado_validados(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_participante_fundacao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_reauth(uuid, uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autorizar_finalizacao_diario_segura(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario_seguro(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_segu(uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_solicitar_envelope_diario(uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validar_assinatura_eletronica_por_codigo(text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_solicitar_envelope_diario(uuid, uuid, text, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_validar_escopo_reauth(uuid, uuid, text, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_autorizar_finalizacao_diario_segura(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(text, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario_seguro(uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_segu(uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_assinatura_eletronica_por_codigo(text)
  TO anon, authenticated;

COMMIT;
