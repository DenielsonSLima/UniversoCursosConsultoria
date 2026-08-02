-- Novos usuários nunca recebem visão global do WhatsApp por omissão.
ALTER TABLE public.usuarios_sistema
  ALTER COLUMN pode_visualizar_todos_setores SET DEFAULT false;

-- O acesso às conversas falha de forma fechada:
-- ou o usuário é gestor geral, ou precisa ter polo e setor compatíveis.
CREATE OR REPLACE FUNCTION public.whatsapp_gestor_can_access(
  p_setor text,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')
    AND EXISTS (
      SELECT 1
      FROM public.usuarios_sistema usuario
      WHERE lower(usuario.email) = public.auth_email()
        AND public.is_active_status(usuario.status)
        AND (
          COALESCE(usuario.pode_visualizar_todos_setores, false)
          OR (
            usuario.polo_comunicacao_id IS NOT NULL
            AND p_polo_id IS NOT NULL
            AND usuario.polo_comunicacao_id = p_polo_id
            AND (
              COALESCE(usuario.setor_comunicacao, 'todos') = 'todos'
              OR usuario.setor_comunicacao = COALESCE(
                p_setor,
                'atendimento_geral'
              )
            )
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_gestor_can_access(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_gestor_can_access(text, uuid)
  TO authenticated, service_role;
