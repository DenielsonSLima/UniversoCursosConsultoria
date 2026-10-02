BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- Explicit extension of the authorized zero operational opening. Only the
-- confirmed Proesc account/polo pairs below are affected. Historical ledger,
-- implantation expenses, September positions and every Banese account remain
-- unchanged; the existing reader predicate provides durable backfill isolation.
LOCK TABLE internal_contas.proesc_operational_openings IN SHARE ROW EXCLUSIVE MODE;

DO $opening$
DECLARE
  v_account uuid;
  v_count integer;
  v_matriz constant uuid := '44444444-4444-4444-4444-444444444444';
  v_polos constant uuid[] := ARRAY[
    '31497afd-e2dd-4444-aa3d-8087c0ae0753'::uuid, -- Porto da Folha
    '335fdbe4-b3b4-4622-aa7d-04c585455091'::uuid, -- Aquidabã
    'ff20c5e3-c816-4ee6-b9e9-e731135c9a07'::uuid  -- Propriá
  ];
BEGIN
  SELECT count(*),min(cb.id::text)::uuid INTO v_count,v_account
  FROM public.contas_bancarias cb
  WHERE cb.codigo_interno='INTEGRATION:PROESC:'||v_matriz::text
    AND cb.polo_id=v_matriz AND cb.natureza='BANCARIA'
    AND cb.system_managed AND cb.saldo_inicial=0 AND cb.data_saldo IS NULL;
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one confirmed Proesc control account'; END IF;

  -- Validate every scope before looking up replay state or inserting any row.
  SELECT count(DISTINCT p.id) INTO v_count
  FROM public.polos p JOIN public.contas_bancarias_polos a ON a.polo_id=p.id
  WHERE p.id=ANY(v_polos) AND a.conta_bancaria_id=v_account
    AND lower(coalesce(p.status,''))='ativo';
  IF v_count<>cardinality(v_polos) THEN
    RAISE EXCEPTION 'Every authorized polo must remain active and linked to the Proesc account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM internal_contas.proesc_operational_openings opening
    WHERE opening.account_id=v_account AND opening.polo_id=v_matriz
      AND opening.opening_date='2026-10-01' AND opening.opening_balance=0) THEN
    RAISE EXCEPTION 'The previously authorized Proesc opening must remain consistent';
  END IF;
  IF EXISTS(SELECT 1 FROM internal_contas.proesc_operational_openings opening
    WHERE opening.account_id=v_account AND opening.polo_id=ANY(v_polos)
      AND (opening.opening_date IS DISTINCT FROM date '2026-10-01'
        OR opening.opening_balance IS DISTINCT FROM 0::numeric)) THEN
    RAISE EXCEPTION 'Conflicting Proesc operational opening; refusing to overwrite';
  END IF;

  INSERT INTO internal_contas.proesc_operational_openings(
    account_id,polo_id,opening_date,opening_balance,authorization_note
  ) SELECT v_account,polo_id,date '2026-10-01',0,
    'Explicit owner authorization: extend zero operational opening on 2026-10-01 to Porto da Folha, Aquidaba and Propria; preserve all historical facts'
  FROM unnest(v_polos) scope(polo_id)
  ON CONFLICT(account_id,polo_id) DO NOTHING;
END;
$opening$;

COMMIT;
