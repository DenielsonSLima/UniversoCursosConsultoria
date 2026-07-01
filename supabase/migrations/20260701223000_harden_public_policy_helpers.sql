BEGIN;

-- Ajusta todas as assinaturas remotas de get_despesas_summary sem depender
-- de uma assinatura local exata.
DO $$
DECLARE
  v_proc regprocedure;
BEGIN
  FOR v_proc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_despesas_summary'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_proc);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_proc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_proc);
  END LOOP;
END;
$$;

-- As policies legadas abaixo usavam helpers SECURITY DEFINER sem TO, ou seja,
-- tambem eram avaliadas por anon. Mantemos seu comportamento para usuários
-- autenticados e adicionamos policies anonimas com predicados diretos.
DO $$
BEGIN
  IF to_regclass('public.modulos') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_modulos_select" ON public.modulos TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_modulos_public_select" ON public.modulos';
    EXECUTE $policy$
      CREATE POLICY "portal_modulos_public_select"
        ON public.modulos
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.cursos c
            WHERE c.id = modulos.curso_id
              AND lower(coalesce(c.status, '')) = 'ativo'
              AND coalesce(c.publicar_site, false) = true
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.disciplinas') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_disciplinas_select" ON public.disciplinas TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_disciplinas_public_select" ON public.disciplinas';
    EXECUTE $policy$
      CREATE POLICY "portal_disciplinas_public_select"
        ON public.disciplinas
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.modulos m
            JOIN public.cursos c ON c.id = m.curso_id
            WHERE m.id = disciplinas.modulo_id
              AND lower(coalesce(c.status, '')) = 'ativo'
              AND coalesce(c.publicar_site, false) = true
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.aulas') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_aulas_select" ON public.aulas TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_aulas_public_select" ON public.aulas';
    EXECUTE $policy$
      CREATE POLICY "portal_aulas_public_select"
        ON public.aulas
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.disciplinas d
            JOIN public.modulos m ON m.id = d.modulo_id
            JOIN public.cursos c ON c.id = m.curso_id
            WHERE d.id = aulas.disciplina_id
              AND lower(coalesce(c.status, '')) = 'ativo'
              AND coalesce(c.publicar_site, false) = true
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.turmas_disciplinas') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_turmas_disciplinas_select" ON public.turmas_disciplinas TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_turmas_disciplinas_public_select" ON public.turmas_disciplinas';
    EXECUTE $policy$
      CREATE POLICY "portal_turmas_disciplinas_public_select"
        ON public.turmas_disciplinas
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.turmas t
            JOIN public.cursos c ON c.id = t.curso_id
            WHERE t.id = turmas_disciplinas.turma_id
              AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
              AND coalesce(t.permitir_inscricoes_online, false) = true
              AND lower(coalesce(c.status, '')) = 'ativo'
              AND coalesce(c.publicar_site, false) = true
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.aulas_turma') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_aulas_turma_select" ON public.aulas_turma TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_aulas_turma_public_select" ON public.aulas_turma';
    EXECUTE $policy$
      CREATE POLICY "portal_aulas_turma_public_select"
        ON public.aulas_turma
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.turmas t
            JOIN public.cursos c ON c.id = t.curso_id
            WHERE t.id = aulas_turma.turma_id
              AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
              AND coalesce(t.permitir_inscricoes_online, false) = true
              AND lower(coalesce(c.status, '')) = 'ativo'
              AND coalesce(c.publicar_site, false) = true
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.modelos_fichas') IS NOT NULL THEN
    EXECUTE 'ALTER POLICY "portal_modelos_fichas_select" ON public.modelos_fichas TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "portal_modelos_fichas_public_select" ON public.modelos_fichas';
    EXECUTE $policy$
      CREATE POLICY "portal_modelos_fichas_public_select"
        ON public.modelos_fichas
        FOR SELECT
        TO anon, authenticated
        USING (
          coalesce(status, 'ATIVO') = 'ATIVO'
          AND (
            curso_especifico_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.cursos c
              WHERE c.id = modelos_fichas.curso_especifico_id
                AND lower(coalesce(c.status, '')) = 'ativo'
                AND coalesce(c.publicar_site, false) = true
            )
          )
        )
    $policy$;
  END IF;
END;
$$;

DO $$
DECLARE
  v_signature text;
  v_proc regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.can_access_curso(uuid)',
    'public.can_access_turma(uuid)',
    'public.is_public_course(uuid)',
    'public.is_public_turma(uuid)'
  ]
  LOOP
    v_proc := to_regprocedure(v_signature);

    IF v_proc IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_proc);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_proc);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
