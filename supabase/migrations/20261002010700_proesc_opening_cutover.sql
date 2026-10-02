BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- Operational opening is not a payment, expense or bank-account base balance.
-- Keep the historical ledger and its implantation adjustment immutable. A later
-- backfill before opening must never become operational cash after opening.
CREATE TABLE internal_contas.proesc_operational_openings (
  account_id uuid NOT NULL REFERENCES public.contas_bancarias(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  opening_date date NOT NULL CHECK (extract(day FROM opening_date)=1),
  opening_balance numeric(15,2) NOT NULL DEFAULT 0 CHECK (opening_balance=0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  authorization_note text NOT NULL,
  PRIMARY KEY(account_id,polo_id)
);
ALTER TABLE internal_contas.proesc_operational_openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_contas.proesc_operational_openings FROM PUBLIC,anon,authenticated,service_role;

DO $seed$
DECLARE v_account uuid; v_count integer;
BEGIN
  SELECT count(*),min(cb.id::text)::uuid INTO v_count,v_account
  FROM public.contas_bancarias cb
  WHERE cb.codigo_interno='INTEGRATION:PROESC:44444444-4444-4444-4444-444444444444'
    AND cb.polo_id='44444444-4444-4444-4444-444444444444' AND cb.natureza='BANCARIA'
    AND cb.system_managed AND cb.saldo_inicial=0 AND cb.data_saldo IS NULL
    AND EXISTS(SELECT 1 FROM public.contas_bancarias_polos a
      WHERE a.conta_bancaria_id=cb.id AND a.polo_id='44444444-4444-4444-4444-444444444444');
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one confirmed Proesc control account'; END IF;
  INSERT INTO internal_contas.proesc_operational_openings(account_id,polo_id,opening_date,authorization_note)
  VALUES(v_account,'44444444-4444-4444-4444-444444444444','2026-10-01',
    'Explicit owner authorization: zero opening on 2026-10-01 for this polo; preserve historical facts and October receipts');
END;
$seed$;

CREATE FUNCTION internal_contas.proesc_operational_movement_included(
  p_account_id uuid,p_polo_id uuid,p_movement_date date,p_position_date date
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM internal_contas.proesc_operational_openings opening
    WHERE opening.account_id=p_account_id AND opening.polo_id=p_polo_id
      AND p_position_date>=opening.opening_date
      AND (p_movement_date IS NULL OR p_movement_date<opening.opening_date)
  );
$function$;
REVOKE ALL ON FUNCTION internal_contas.proesc_operational_movement_included(uuid,uuid,date,date)
  FROM PUBLIC,anon,authenticated,service_role;

-- Patch only the five movement branches in each already-authorized reader.
-- Guard each exact anchor against schema drift; CREATE OR REPLACE preserves
-- signatures, grants, ownership and all existing access checks. No public
-- bypass reader is introduced. Monthly revenues/expenses remain untouched.
DO $readers$
DECLARE
  v_name text; v_ddl text; v_before text; v_after text; v_alias text; v_direction text;
  v_position_date text := '(now() at time zone ''America/Maceio'')::date';
BEGIN
  FOREACH v_name IN ARRAY ARRAY['get_contas_bancarias_saldos','get_contas_bancarias_posicoes_polos_secure'] LOOP
    v_ddl:=pg_get_functiondef(('public.'||v_name||'()')::regprocedure);
    FOREACH v_alias IN ARRAY ARRAY['cr','cp','dl'] LOOP
      v_before:=v_alias||'.status = ''PAGO''';
      v_after:=v_before||E'\n      AND internal_contas.proesc_operational_movement_included(cb.id,'
        ||v_alias||'.polo_id,'||v_alias||'.data_pagamento,'||v_position_date||')';
      IF (length(v_ddl)-length(replace(v_ddl,v_before,'')))/length(v_before)<>1 THEN
        RAISE EXCEPTION 'Unexpected movement anchor in %.%',v_name,v_alias;
      END IF;
      v_ddl:=replace(v_ddl,v_before,v_after);
    END LOOP;
    FOREACH v_direction IN ARRAY ARRAY['origem','destino'] LOOP
      v_before:='JOIN public.contas_bancarias cb ON cb.id = tc.conta_'||v_direction||'_id';
      v_after:=v_before||E'\n      AND internal_contas.proesc_operational_movement_included(cb.id,tc.'
        ||CASE WHEN v_direction='origem' THEN 'polo_id' ELSE 'polo_destino_id' END
        ||',tc.data_transferencia,'||v_position_date||')';
      IF (length(v_ddl)-length(replace(v_ddl,v_before,'')))/length(v_before)<>1 THEN
        RAISE EXCEPTION 'Unexpected transfer anchor in %.%',v_name,v_direction;
      END IF;
      v_ddl:=replace(v_ddl,v_before,v_after);
    END LOOP;
    EXECUTE v_ddl;
  END LOOP;

  v_ddl:=pg_get_functiondef('public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure);
  FOREACH v_alias IN ARRAY ARRAY['recebimento','pagamento','despesa'] LOOP
    v_before:='where '||v_alias||'.status = ''PAGO'''
      ||CASE WHEN v_alias='pagamento' THEN E'\n      and pagamento.despesa_lancamento_id is null' ELSE '' END
      ||E'\n      and (';
    v_after:='where '||v_alias||'.status = ''PAGO'''
      ||CASE WHEN v_alias='pagamento' THEN E'\n      and pagamento.despesa_lancamento_id is null' ELSE '' END
      ||E'\n      and '
      ||'internal_contas.proesc_operational_movement_included(conta.id,'
      ||v_alias||'.polo_id,'||v_alias||'.data_pagamento,v_data_corte)'||E'\n      and (';
    IF (length(v_ddl)-length(replace(v_ddl,v_before,'')))/length(v_before)<>1 THEN
      RAISE EXCEPTION 'Unexpected position anchor for %',v_alias;
    END IF;
    v_ddl:=replace(v_ddl,v_before,v_after);
  END LOOP;
  FOREACH v_direction IN ARRAY ARRAY['origem','destino'] LOOP
    v_before:='join contas_escopo conta on conta.id = transferencia.conta_'||v_direction||'_id';
    v_after:=v_before||E'\n      and internal_contas.proesc_operational_movement_included(conta.id,transferencia.'
      ||CASE WHEN v_direction='origem' THEN 'polo_id' ELSE 'polo_destino_id' END
      ||',transferencia.data_transferencia,v_data_corte)';
    IF (length(v_ddl)-length(replace(v_ddl,v_before,'')))/length(v_before)<>1 THEN
      RAISE EXCEPTION 'Unexpected position transfer anchor for %',v_direction;
    END IF;
    v_ddl:=replace(v_ddl,v_before,v_after);
  END LOOP;
  v_before:='Inclui movimentos históricos confirmados do controle Proesc, que não representam saldo bancário disponível.';
  v_after:='Preserva o histórico; desde a abertura operacional autorizada, o saldo do respectivo polo considera somente movimentos a partir desse marco. Controle Proesc não representa saldo bancário disponível.';
  IF position(v_before IN v_ddl)=0 THEN RAISE EXCEPTION 'Unexpected position disclosure'; END IF;
  EXECUTE replace(v_ddl,v_before,v_after);
END;
$readers$;

COMMIT;
