-- Projeta a auditoria já persistida, somente para as cobranças da página autorizada.
CREATE OR REPLACE FUNCTION public.get_receivables_modality_page_v4_secure(
  p_modality text,
  p_polo_id uuid DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
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
SET search_path = ''
AS $function$
DECLARE
  v_page jsonb;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_receivables_filter_scope(p_polo_id);

  v_page := public.get_receivables_modality_page_v3_secure(
    p_modality, p_polo_id, p_turma_id, p_search, p_due_start, p_due_end,
    p_status_scope, p_group_mode, p_group_key, p_page, p_page_size
  );

  SELECT COALESCE(pg_catalog.jsonb_agg(
    entry.value || pg_catalog.jsonb_build_object(
      'manual_settlement_actor_name', NULLIF(pg_catalog.btrim(actor.nome), ''),
      'manual_settlement_completed_at', settlement.completed_at
    ) ORDER BY entry.ordinality
  ), '[]'::jsonb)
  INTO v_rows
  FROM pg_catalog.jsonb_array_elements(v_page -> 'rows')
    WITH ORDINALITY AS entry(value, ordinality)
  LEFT JOIN public.contas_receber receivable
    ON receivable.id = (entry.value ->> 'id')::uuid
    AND receivable.status = 'PAGO'
    AND receivable.manual_settlement_reversed_at IS NULL
  LEFT JOIN public.receivable_manual_settlements settlement
    ON settlement.id = receivable.manual_settlement_id
    AND settlement.receivable_id = receivable.id
    AND settlement.polo_id IS NOT DISTINCT FROM receivable.polo_id
    AND settlement.state = 'COMPLETED'
    AND settlement.reversed_at IS NULL
  LEFT JOIN public.usuarios_sistema actor ON actor.id = settlement.actor_id;

  RETURN pg_catalog.jsonb_set(v_page, '{rows}', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_receivables_modality_page_v4_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_receivables_modality_page_v4_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_receivables_modality_page_v4_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) IS 'Página autorizada com usuário e instante real da baixa manual; sem inferir auditoria histórica.';

NOTIFY pgrst, 'reload schema';
