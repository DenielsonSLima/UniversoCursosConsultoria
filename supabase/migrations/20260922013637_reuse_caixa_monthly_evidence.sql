-- Reuse the complete selected-month evidence, preserving proof and open positions.
-- Applied migrations remain immutable; exact source guards reject drift.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5s';
DO $patch$
DECLARE
  v_function regprocedure := 'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
  v_change record;
  v_acl aclitem[];
  v_owner oid;
BEGIN
  SELECT proacl, proowner INTO STRICT v_acl, v_owner FROM pg_proc WHERE oid = v_function;
  IF encode(extensions.digest(v_definition, 'sha256'), 'hex') <>
    '614a26b7e75f87f6c284815fdba05280383477a625b8802982950f239a4fd705' THEN
    RAISE EXCEPTION 'Caixa function changed; review and rebase the optimization.';
  END IF;
  FOR v_change IN SELECT * FROM (VALUES
    (
      'retain the complete selected-month evidence',
$before$  v_serie_mensal jsonb := '[]'::jsonb;
BEGIN$before$,
$after$  v_serie_mensal jsonb := '[]'::jsonb;
  v_competencia_evidence jsonb;
BEGIN$after$
    ),
    (
      'reuse evidence before projecting chart-only fields',
$before$  ) ORDER BY ordinal),'[]'::jsonb) INTO v_serie_mensal FROM monthly_evidence;$before$,
$after$  ) ORDER BY ordinal),'[]'::jsonb),
    (
      SELECT selected.evidence
      FROM monthly_evidence selected
      WHERE date_trunc('month',(selected.item->>'competencia')::date)::date = v_inicio
    )
  INTO v_serie_mensal, v_competencia_evidence
  FROM monthly_evidence;
  IF v_competencia_evidence IS NULL THEN
    RAISE EXCEPTION 'Selected Caixa month is missing from its evidence series.'
      USING ERRCODE = '22023';
  END IF;$after$
    ),
    (
      'use the selected evidence for commitments',
$before$    coalesce(v_payload->'compromissos','{}'::jsonb) || internal_contas.caixa_monthly_delinquency(
      p_polo_id,p_competencia,(now() at time zone 'America/Maceio')::date)$before$,
$after$    coalesce(v_payload->'compromissos','{}'::jsonb) || v_competencia_evidence$after$
    )
  ) changes(label, before_text, after_text)
  LOOP
    IF (length(v_definition) - length(replace(v_definition, v_change.before_text, '')))
      / length(v_change.before_text) <> 1 THEN
      RAISE EXCEPTION 'Caixa optimization target is not unique: %', v_change.label;
    END IF;
    v_definition := replace(v_definition, v_change.before_text, v_change.after_text);
  END LOOP;
  EXECUTE v_definition;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef AND provolatile = 's'
      AND proconfig = ARRAY['search_path=""'] AND proacl IS NOT DISTINCT FROM v_acl
      AND proowner = v_owner
  ) THEN
    RAISE EXCEPTION 'Caixa optimization changed its privilege or execution contract.';
  END IF;
END;
$patch$;
NOTIFY pgrst, 'reload schema';

