-- Corrige referências não qualificadas de polo_id que impediam o PostgreSQL
-- de preparar as RPCs multiperfil. A alteração preserva shape, autorização,
-- SECURITY DEFINER, search_path vazio e grants existentes.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_listar_perfis()
RETURNS TABLE (
  role text,
  "contextId" uuid,
  label text,
  "homeRoute" text,
  capabilities text[],
  "poloIds" uuid[],
  "allPolos" boolean,
  "requiresPoloSelection" boolean,
  scopes jsonb,
  "firstAccess" jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  RETURN QUERY
  WITH perfis AS (
    SELECT
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN 'ALUNO'
        ELSE 'PROFESSOR'
      END AS role,
      parceiro.id AS context_id,
      parceiro.nome AS label,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN '/aluno'
        ELSE '/professor'
      END AS home_route,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN ARRAY['PORTAL_ALUNO']::text[]
        ELSE ARRAY['PORTAL_PROFESSOR']::text[]
      END AS capabilities,
      coalesce(escopo.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
      false AS all_polos,
      jsonb_build_array() AS scopes,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN pg_catalog.jsonb_build_object(
          'acceptedTermsAt', CASE
            WHEN coalesce(parceiro.aceitou_termos_uso, false)
              AND parceiro.termos_uso_versao =
                public.portal_identidade_termos_versao_vigente()
              THEN parceiro.aceitou_termos_uso_em
            ELSE NULL
          END,
          'acceptedTermsVersion', CASE
            WHEN coalesce(parceiro.aceitou_termos_uso, false)
              AND parceiro.termos_uso_versao =
                public.portal_identidade_termos_versao_vigente()
              THEN parceiro.termos_uso_versao
            ELSE NULL
          END,
          'requiresPasswordReset', coalesce(
            parceiro.troca_senha_obrigatoria,
            false
          )
        )
        ELSE NULL::jsonb
      END AS first_access,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN 20
        ELSE 30
      END AS prioridade
    FROM public.parceiros AS parceiro
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT DISTINCT polo_escopo.polo_id
        FROM pg_catalog.unnest(
          coalesce(parceiro.polo_ids, ARRAY[]::uuid[])
          || CASE
            WHEN parceiro.polo_id IS NULL THEN ARRAY[]::uuid[]
            ELSE ARRAY[parceiro.polo_id]
          END
        ) AS polo_escopo(polo_id)
        WHERE polo_escopo.polo_id IS NOT NULL
        ORDER BY polo_escopo.polo_id
      ) AS polo_ids
    ) AS escopo
    WHERE parceiro.auth_user_id = v_actor
      AND upper(parceiro.tipo) IN ('ALUNO', 'PROFESSOR')
      AND coalesce(public.is_active_status(parceiro.status), false)

    UNION ALL

    SELECT
      'RESPONSAVEL_LEGAL'::text,
      responsavel.id,
      responsavel.nome,
      '/responsavel'::text,
      ARRAY['PORTAL_RESPONSAVEL_LEGAL', 'LISTAR_DEPENDENTES']::text[],
      coalesce(escopo.polo_ids, ARRAY[]::uuid[]),
      false,
      jsonb_build_array(),
      NULL::jsonb,
      40
    FROM public.responsaveis_legais AS responsavel
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT DISTINCT polo_escopo.polo_id
        FROM public.responsaveis_legais_alunos AS vinculo
        JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
        CROSS JOIN LATERAL pg_catalog.unnest(
          coalesce(aluno.polo_ids, ARRAY[]::uuid[])
          || CASE
            WHEN aluno.polo_id IS NULL THEN ARRAY[]::uuid[]
            ELSE ARRAY[aluno.polo_id]
          END
        ) AS polo_escopo(polo_id)
        WHERE vinculo.responsavel_legal_id = responsavel.id
          AND vinculo.status = 'VERIFICADO'
          AND vinculo.vigente_de <= statement_timestamp()
          AND (
            vinculo.vigente_ate IS NULL
            OR vinculo.vigente_ate > statement_timestamp()
          )
          AND upper(aluno.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno.status), false)
          AND polo_escopo.polo_id IS NOT NULL
        ORDER BY polo_escopo.polo_id
      ) AS polo_ids
    ) AS escopo
    WHERE responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
      AND EXISTS (
        SELECT 1
        FROM public.responsaveis_legais_alunos AS vinculo_ativo
        JOIN public.parceiros AS aluno_ativo
          ON aluno_ativo.id = vinculo_ativo.aluno_id
        WHERE vinculo_ativo.responsavel_legal_id = responsavel.id
          AND vinculo_ativo.status = 'VERIFICADO'
          AND vinculo_ativo.vigente_de <= statement_timestamp()
          AND (
            vinculo_ativo.vigente_ate IS NULL
            OR vinculo_ativo.vigente_ate > statement_timestamp()
          )
          AND upper(aluno_ativo.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno_ativo.status), false)
      )

    UNION ALL

    SELECT
      'COORDENADOR'::text,
      professor.id,
      'Coordenação · ' || professor.nome,
      '/coordenador'::text,
      ARRAY[
        'PORTAL_COORDENADOR',
        'LISTAR_ATRIBUICOES',
        'ASSINATURAS_VISUALIZAR'
      ]::text[],
      escopo.polo_ids,
      false,
      escopo.scopes,
      NULL::jsonb,
      50
    FROM public.parceiros AS professor
    CROSS JOIN LATERAL (
      SELECT
        ARRAY(
          SELECT DISTINCT coordenacao_polo.polo_id
          FROM public.professores_coordenacoes AS coordenacao_polo
          JOIN public.cursos AS curso_polo
            ON curso_polo.id = coordenacao_polo.curso_id
          JOIN public.polos AS polo_ativo
            ON polo_ativo.id = coordenacao_polo.polo_id
          WHERE coordenacao_polo.professor_id = professor.id
            AND coordenacao_polo.status = 'ATIVA'
            AND (
              professor.polo_id = coordenacao_polo.polo_id
              OR coordenacao_polo.polo_id = ANY(
                coalesce(professor.polo_ids, ARRAY[]::uuid[])
              )
            )
            AND coalesce(public.is_active_status(curso_polo.status), false)
            AND coalesce(public.is_active_status(polo_ativo.status), false)
            AND coordenacao_polo.vigente_de <= statement_timestamp()
            AND (
              coordenacao_polo.vigente_ate IS NULL
              OR coordenacao_polo.vigente_ate > statement_timestamp()
            )
          ORDER BY coordenacao_polo.polo_id
        ) AS polo_ids,
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'coordenacaoId', coordenacao.id,
                'cursoId', curso.id,
                'cursoNome', curso.nome,
                'poloId', polo.id,
                'poloNome', polo.nome,
                'vigenteDe', coordenacao.vigente_de,
                'vigenteAte', coordenacao.vigente_ate
              )
              ORDER BY curso.nome, polo.nome, coordenacao.id
            )
            FROM public.professores_coordenacoes AS coordenacao
            JOIN public.cursos AS curso ON curso.id = coordenacao.curso_id
            JOIN public.polos AS polo ON polo.id = coordenacao.polo_id
            WHERE coordenacao.professor_id = professor.id
              AND coordenacao.status = 'ATIVA'
              AND (
                professor.polo_id = coordenacao.polo_id
                OR coordenacao.polo_id = ANY(
                  coalesce(professor.polo_ids, ARRAY[]::uuid[])
                )
              )
              AND coalesce(public.is_active_status(curso.status), false)
              AND coalesce(public.is_active_status(polo.status), false)
              AND coordenacao.vigente_de <= statement_timestamp()
              AND (
                coordenacao.vigente_ate IS NULL
                OR coordenacao.vigente_ate > statement_timestamp()
              )
          ),
          jsonb_build_array()
        ) AS scopes
    ) AS escopo
    WHERE professor.auth_user_id = v_actor
      AND upper(professor.tipo) = 'PROFESSOR'
      AND coalesce(public.is_active_status(professor.status), false)
      AND pg_catalog.cardinality(escopo.polo_ids) > 0

    UNION ALL

    SELECT
      'GESTOR'::text,
      gestor.id,
      gestor.nome,
      '/gestor'::text,
      ARRAY['PORTAL_GESTOR']::text[],
      ARRAY(
        SELECT polo_permitido.valor::uuid
        FROM pg_catalog.jsonb_array_elements_text(
          coalesce(
            gestor_escopo.valor -> 'poloIds',
            pg_catalog.jsonb_build_array()
          )
        ) AS polo_permitido(valor)
        ORDER BY polo_permitido.valor
      ),
      coalesce((gestor_escopo.valor ->> 'allPolos')::boolean, false),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'kind', 'GESTOR_PERMISSIONS',
          'permissions', coalesce(
            gestor_escopo.valor -> 'permissions',
            '{}'::jsonb
          )
        )
      ),
      NULL::jsonb,
      10
    FROM public.usuarios_sistema AS gestor
    CROSS JOIN LATERAL (
      SELECT public.portal_identidade_gestor_escopo_atual() AS valor
    ) AS gestor_escopo
    WHERE gestor.auth_user_id = v_actor
      AND coalesce(public.is_active_status(gestor.status), false)
      AND coalesce(public.is_gestor(), false)
  )
  SELECT
    perfil.role,
    perfil.context_id,
    perfil.label,
    perfil.home_route,
    perfil.capabilities,
    perfil.polo_ids,
    perfil.all_polos,
    pg_catalog.cardinality(perfil.polo_ids) > 1,
    perfil.scopes,
    perfil.first_access
  FROM perfis AS perfil
  ORDER BY perfil.prioridade, perfil.label, perfil.context_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_listar_dependentes(
  p_responsavel_legal_id uuid
)
RETURNS TABLE (
  "vinculoId" uuid,
  "alunoId" uuid,
  nome text,
  parentesco text,
  "poloIds" uuid[],
  "vigenteDe" timestamptz,
  "vigenteAte" timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  IF p_responsavel_legal_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id
      AND responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERFIL_RESPONSAVEL_NAO_AUTORIZADO';
  END IF;

  RETURN QUERY
  SELECT
    vinculo.id,
    aluno.id,
    aluno.nome,
    vinculo.parentesco,
    ARRAY(
      SELECT DISTINCT polo_escopo.polo_id
      FROM pg_catalog.unnest(
        coalesce(aluno.polo_ids, ARRAY[]::uuid[])
        || CASE
          WHEN aluno.polo_id IS NULL THEN ARRAY[]::uuid[]
          ELSE ARRAY[aluno.polo_id]
        END
      ) AS polo_escopo(polo_id)
      WHERE polo_escopo.polo_id IS NOT NULL
      ORDER BY polo_escopo.polo_id
    ),
    vinculo.vigente_de,
    vinculo.vigente_ate
  FROM public.responsaveis_legais_alunos AS vinculo
  JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
  WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
    AND vinculo.status = 'VERIFICADO'
    AND vinculo.vigente_de <= statement_timestamp()
    AND (
      vinculo.vigente_ate IS NULL
      OR vinculo.vigente_ate > statement_timestamp()
    )
    AND upper(aluno.tipo) = 'ALUNO'
    AND coalesce(public.is_active_status(aluno.status), false)
  ORDER BY aluno.nome, aluno.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_listar_perfis()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.portal_listar_perfis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  TO authenticated;

COMMIT;
