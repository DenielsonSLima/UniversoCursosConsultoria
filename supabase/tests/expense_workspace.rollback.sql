-- Read-only post-migration contract probe. No business rows or Auth changes.
BEGIN READ ONLY;
DO $test$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM private.expense_workspace_bounds('mes_atual',NULL,NULL,'2026-12-01T01:30:00Z');
  IF b.today_local<>DATE '2026-11-30' OR b.due_start<>DATE '2026-11-01' OR b.due_end<>DATE '2026-11-30' THEN
    RAISE EXCEPTION 'Expense month advanced before midnight in Maceio';
  END IF;
  SELECT * INTO b FROM private.expense_workspace_bounds('mes_atual',NULL,NULL,'2027-01-01T03:00:00Z');
  IF b.due_start<>DATE '2027-01-01' OR b.due_end<>DATE '2027-01-31' THEN
    RAISE EXCEPTION 'Expense year boundary is incorrect';
  END IF;
  SELECT * INTO b FROM private.expense_workspace_bounds('mes_atual',NULL,NULL,'2028-02-15T15:00:00Z');
  IF b.due_end<>DATE '2028-02-29' THEN RAISE EXCEPTION 'Expense leap month is incorrect'; END IF;
  SELECT * INTO b FROM private.expense_workspace_bounds('mes_atual','2026-11-15','2026-12-10','2026-11-20T15:00:00Z');
  IF b.due_start<>DATE '2026-11-15' OR b.due_end<>DATE '2026-11-30' THEN
    RAISE EXCEPTION 'Manual dates no longer intersect the current due month';
  END IF;
  IF has_function_privilege('anon',
      'public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','private.expense_workspace_bounds(text,date,date,timestamp with time zone)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected workspace or private-clock execution grant';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated workspace execution is missing';
  END IF;
END $test$;
SELECT 'PASS expense workspace: Maceio calendar, manual bounds and execution grants; read only' AS result;
ROLLBACK;
