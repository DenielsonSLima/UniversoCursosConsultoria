CREATE OR REPLACE FUNCTION public.current_aluno_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id
  FROM public.parceiros p
  WHERE p.auth_user_id = auth.uid()
    AND p.tipo = 'Aluno'
    AND public.is_active_status(p.status)
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_professor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.parceiros p
  WHERE p.auth_user_id = auth.uid()
    AND p.tipo = 'Professor'
    AND public.is_active_status(p.status)
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;
$$;
