-- Dados vacinais exigem atribuição funcional explícita, inclusive para globais.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_aluno_vacina(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND public.is_gestor()
    AND public.gestor_has_tab('gestao', 'vacinas')
    AND coalesce(
      jsonb_typeof(
        public.gestor_effective_permissions() -> 'tabs' -> 'gestao'
      ) = 'array'
      AND (
        public.gestor_effective_permissions() -> 'tabs' -> 'gestao'
      ) ? 'vacinas',
      false
    )
    AND EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = p_aluno_id
        AND p.tipo = 'Aluno'
        AND (
          public.is_gestor_global()
          OR (
            p.polo_id IS NOT NULL
            AND p.polo_id = ANY(coalesce(
              public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
            ))
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(
              coalesce(p.polo_ids, ARRAY[]::uuid[])
            ) AS scoped_polo(id)
            WHERE scoped_polo.id IS NOT NULL
              AND scoped_polo.id = ANY(coalesce(
                public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
              ))
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_aluno_vacina(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_aluno_vacina(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_aluno_vacina(uuid) IS
  'Exige gestor institucional ativo, aba explícita Gestão/Vacinas e escopo de polo. Reutilizado por RLS, gatilhos e Storage; não altera acesso do aluno aos próprios comprovantes.';

COMMIT;
