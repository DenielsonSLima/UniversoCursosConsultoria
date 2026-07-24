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
DECLARE
  v_payload jsonb;
  v_rows jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         (p_polo_id IS NULL AND public.is_gestor_global())
         OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
       )
       AND public.gestor_has_financeiro_tab('receber')
     ) THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.' USING ERRCODE = '42501';
  END IF;

  v_payload := public.get_receivables_modality_page(
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

  SELECT COALESCE(
    jsonb_agg(
      entry.row_data || jsonb_build_object(
        'gateway_provider', receivable.gateway_provider,
        'gateway_environment', receivable.gateway_environment,
        'gateway_payment_method', receivable.gateway_payment_method
      )
      ORDER BY entry.position
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_payload -> 'rows', '[]'::jsonb))
       WITH ORDINALITY AS entry(row_data, position)
  LEFT JOIN public.contas_receber AS receivable
    ON receivable.id = (entry.row_data ->> 'id')::uuid;

  RETURN jsonb_set(v_payload, '{rows}', v_rows, true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) TO authenticated, service_role;

COMMIT;
