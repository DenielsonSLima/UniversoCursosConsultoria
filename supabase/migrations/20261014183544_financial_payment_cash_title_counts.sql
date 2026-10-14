BEGIN;
-- A receipt can contain several cash movements; an installment is counted once.
CREATE FUNCTION internal_financial_payments.cash_source_settled(p_id uuid,p_start date,p_end date)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT r.status='PAGO' AND r.data_pagamento>=p_start AND r.data_pagamento<p_end
 FROM public.contas_receber r WHERE r.id=internal_financial_payments.cash_source_id(p_id)),false);
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.cash_source_settled(uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
DO $counts$
DECLARE target record; definition text; original text; received_predicate text;
BEGIN
 received_predicate:=$predicate$(
        upper(cr.status) = 'PAGO'
        AND cr.data_pagamento >= p_inicio
        AND cr.data_pagamento < p_fim
      ) AS parcela_recebida$predicate$;
 FOR target IN SELECT * FROM (VALUES
    ('internal_contas.caixa_monthly_delinquency(uuid, date, date)','47f3d9fde0fdc6513d4f55b251c43948'),
    ('public.get_caixa_relatorio_carteira_recorrente_core(uuid, date, date)','0375d930f2a229e7836a1e0bff0b4275'),
    ('public.get_caixa_relatorio_resumo_turmas_core(uuid, date, date)','c053b3d20028ee20e96e99867296fa66')
 ) targets(signature,definition_hash) LOOP
   definition:=pg_get_functiondef(target.signature::regprocedure);
   IF md5(definition)<>target.definition_hash THEN
     RAISE EXCEPTION 'Cash title-count reader changed; review before applying: %',target.signature;
   END IF;
   original:=definition;
   IF target.signature LIKE '%caixa_monthly_delinquency(%' THEN
     definition:=replace(definition,'count(*) filter(where position',
       'count(DISTINCT internal_financial_payments.cash_source_id(id)) filter(where position');
     definition:=replace(definition,'ead_checkout_is_optional(c.id)',
       'ead_checkout_is_optional(internal_financial_payments.cash_source_id(c.id))');
     definition:=replace(definition,'ead_checkout_paid_after_cutoff(c.id,',
       'ead_checkout_paid_after_cutoff(internal_financial_payments.cash_source_id(c.id),');
   ELSE
     IF position(received_predicate in definition)=0 THEN RAISE EXCEPTION 'Cash installment predicate changed'; END IF;
     definition:=regexp_replace(definition,'SELECT\n      ',
       E'SELECT\n      internal_financial_payments.cash_source_id(cr.id) AS source_id,\n      ');
     definition:=replace(definition,received_predicate,
       'internal_financial_payments.cash_source_settled(cr.id,p_inicio,p_fim) AS parcela_recebida');
     definition:=replace(definition,'count(*) FILTER (WHERE parcela_',
       'count(DISTINCT source_id) FILTER (WHERE parcela_');
   END IF;
   IF definition=original THEN RAISE EXCEPTION 'Cash counts were not updated'; END IF;
   EXECUTE definition;
 END LOOP;
END $counts$;
COMMIT;
