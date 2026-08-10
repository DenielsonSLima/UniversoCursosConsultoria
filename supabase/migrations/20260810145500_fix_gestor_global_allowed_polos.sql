-- Corrige a enumeração canônica de polos para gestores com escopo global.
--
-- `gestor_has_all_polos()` sempre representou autorização para todos os polos,
-- mas `gestor_allowed_polo_ids()` devolvia um array vazio nesse mesmo caso.
-- RPCs e políticas que consomem a lista canônica acabavam negando o gestor
-- global. O retorno abaixo materializa somente polos ativos; usuários locais
-- continuam limitados aos UUIDs atribuídos no cadastro.

BEGIN;

CREATE OR REPLACE FUNCTION public.gestor_allowed_polo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN NOT public.gestor_schedule_allows_access() THEN ARRAY[]::uuid[]
    WHEN public.gestor_has_all_polos() THEN (
      SELECT coalesce(
        array_agg(polo.id ORDER BY polo.created_at, polo.id),
        ARRAY[]::uuid[]
      )
      FROM public.polos polo
      WHERE lower(coalesce(polo.status, 'ativo')) = 'ativo'
    )
    WHEN cardinality(coalesce(usuario.polo_ids, ARRAY[]::uuid[])) > 0
      THEN usuario.polo_ids
    WHEN usuario.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ARRAY[usuario.context::uuid]
    ELSE ARRAY[]::uuid[]
  END
  FROM public.usuarios_sistema usuario
  WHERE usuario.auth_user_id = auth.uid()
    AND public.is_active_status(usuario.status)
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.gestor_allowed_polo_ids() IS
  'Lista canônica dos polos autorizados; materializa todos os polos ativos para gestor com allPolos e preserva o escopo explícito dos demais usuários.';

COMMIT;
