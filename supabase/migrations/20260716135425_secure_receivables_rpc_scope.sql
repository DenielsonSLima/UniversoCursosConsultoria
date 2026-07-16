-- Executa as consultas paginadas com o papel proprietário somente depois de
-- validar o escopo do gestor uma vez. Isso evita reavaliar as políticas RLS
-- em milhares de linhas sem ampliar o acesso entre polos.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_page_secure(
  p_modality text,
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'pending',
  p_group_mode text DEFAULT 'none',
  p_group_key text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (p_polo_id IS NULL AND public.is_gestor_global())
       OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
     ) THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_receivables_modality_page(
    p_modality,
    p_polo_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_group_mode,
    p_group_key,
    p_page,
    p_page_size
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_groups_page_secure(
  p_modality text,
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'pending',
  p_group_mode text DEFAULT 'student',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (p_polo_id IS NULL AND public.is_gestor_global())
       OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
     ) THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_receivables_modality_groups_page(
    p_modality,
    p_polo_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_group_mode,
    p_page,
    p_page_size
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_summary_v2_secure(
  p_modality text,
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (p_polo_id IS NULL AND public.is_gestor_global())
       OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
     ) THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_receivables_modality_summary_v2(
    p_modality,
    p_polo_id,
    p_search,
    p_due_start,
    p_due_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_receivables_modality_page_secure(text, uuid, text, date, date, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_receivables_modality_groups_page_secure(text, uuid, text, date, date, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_receivables_modality_summary_v2_secure(text, uuid, text, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_receivables_modality_page_secure(text, uuid, text, date, date, text, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_receivables_modality_groups_page_secure(text, uuid, text, date, date, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_receivables_modality_summary_v2_secure(text, uuid, text, date, date) TO authenticated, service_role;

COMMIT;
