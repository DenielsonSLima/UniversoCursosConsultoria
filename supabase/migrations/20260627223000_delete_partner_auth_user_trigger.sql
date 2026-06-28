-- Garante que exclusoes diretas em parceiros nao deixem usuarios Auth orfaos.
-- A remocao e conservadora: nao apaga Auth se o e-mail ainda pertence a outro
-- aluno/professor ou a um usuario ativo do sistema.

CREATE OR REPLACE FUNCTION public.delete_partner_auth_user_on_partner_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(nullif(trim(coalesce(OLD.email, '')), ''));
BEGIN
  IF OLD.tipo NOT IN ('Aluno', 'Professor') OR v_email IS NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(coalesce(u.email, '')) = v_email
      AND public.is_active_status(u.status)
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id <> OLD.id
      AND p.tipo IN ('Aluno', 'Professor')
      AND lower(coalesce(p.email, '')) = v_email
  ) THEN
    RETURN OLD;
  END IF;

  DELETE FROM auth.users u
  WHERE lower(coalesce(u.email, '')) = v_email;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_partner_auth_user_on_partner_delete ON public.parceiros;
CREATE TRIGGER trg_delete_partner_auth_user_on_partner_delete
BEFORE DELETE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.delete_partner_auth_user_on_partner_delete();

REVOKE EXECUTE ON FUNCTION public.delete_partner_auth_user_on_partner_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_partner_auth_user_on_partner_delete() TO service_role;
