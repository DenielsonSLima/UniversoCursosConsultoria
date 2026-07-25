DO $migration$
DECLARE
  v_function_definition text;
  v_old_expression text := $old$
      COALESCE(
        MIN(data_vencimento) FILTER (WHERE status NOT IN ('PAGO', 'CANCELADO')),
        MIN(data_vencimento)
      ) AS next_due
$old$;
  v_new_expression text := $new$
      MIN(data_vencimento) FILTER (
        WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      ) AS next_due
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_receivables_modality_groups_page(text, uuid, text, date, date, text, text, integer, integer)'::regprocedure
  )
  INTO v_function_definition;

  IF STRPOS(v_function_definition, v_old_expression) = 0 THEN
    RAISE EXCEPTION
      'Expected next_due expression was not found in get_receivables_modality_groups_page';
  END IF;

  EXECUTE REPLACE(v_function_definition, v_old_expression, v_new_expression);
END;
$migration$;
