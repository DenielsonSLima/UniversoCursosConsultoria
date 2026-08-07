-- Permite restringir o WhatsApp por setor, mantendo acesso a todos os polos.
ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS pode_visualizar_todos_polos boolean NOT NULL DEFAULT false;

-- O escopo global já existente continua incluindo todos os polos.
UPDATE public.usuarios_sistema
SET pode_visualizar_todos_polos = true
WHERE COALESCE(pode_visualizar_todos_setores, false);

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
            p_polo_id IS NOT NULL
            AND (
              COALESCE(usuario.pode_visualizar_todos_polos, false)
              OR (
                usuario.polo_comunicacao_id IS NOT NULL
                AND usuario.polo_comunicacao_id = p_polo_id
              )
            )
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
