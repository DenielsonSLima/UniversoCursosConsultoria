BEGIN;

-- Private, append-only proof. Financial facts remain on the original receivable.
CREATE TABLE internal_finance.other_credit_reversals (
  request_id uuid PRIMARY KEY,
  receivable_id uuid NOT NULL UNIQUE REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  before_fingerprint text NOT NULL,
  database_txid bigint NOT NULL,
  reversed_at timestamptz NOT NULL
);
ALTER TABLE internal_finance.other_credit_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_finance.other_credit_reversals FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_finance.other_credit_reversal_authorized(
  p_old public.contas_receber, p_new public.contas_receber
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT p_old.status = 'PAGO' AND p_new.status = 'ESTORNADO'
    AND (to_jsonb(p_old) - ARRAY['status','updated_at'])
      = (to_jsonb(p_new) - ARRAY['status','updated_at'])
    AND EXISTS (
      SELECT 1 FROM internal_finance.other_credit_reversals e
      WHERE e.receivable_id = p_old.id AND e.actor_id = auth.uid()
        AND e.database_txid = pg_catalog.txid_current()
        AND e.reversed_at = p_new.updated_at
        AND e.before_fingerprint = pg_catalog.md5(to_jsonb(p_old)::text)
    );
$function$;
REVOKE ALL ON FUNCTION internal_finance.other_credit_reversal_authorized(public.contas_receber,public.contas_receber)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_finance.protect_reversed_other_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM internal_finance.other_credit_reversals WHERE receivable_id = OLD.id) THEN
    IF TG_OP = 'UPDATE' AND internal_finance.other_credit_reversal_authorized(OLD,NEW) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'O histórico de um crédito estornado é imutável.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER protect_reversed_other_credit BEFORE UPDATE OR DELETE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION internal_finance.protect_reversed_other_credit();
REVOKE ALL ON FUNCTION internal_finance.protect_reversed_other_credit() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.estornar_outro_credito_secure(
  p_receivable_id uuid, p_request_id uuid, p_reason text, p_confirm boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $function$
DECLARE
  r public.contas_receber%ROWTYPE;
  e internal_finance.other_credit_reversals%ROWTYPE;
  s public.receivable_manual_settlements%ROWTYPE;
  actor uuid;
  reason text := btrim(coalesce(p_reason,''));
  stamp timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Autenticação obrigatória para estornar este crédito.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.contas_receber WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crédito indisponível.' USING ERRCODE = '42501'; END IF;
  PERFORM internal_finance.authorize_other_credit_plan(r.polo_id);
  IF p_request_id IS NULL OR p_confirm IS NOT TRUE OR length(reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Informe um motivo de 5 a 500 caracteres e confirme o estorno.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('other-credit-reversal:' || p_request_id::text,0));
  -- Use the manual finalizer lock order: settlement first, receivable second.
  IF r.manual_settlement_id IS NOT NULL THEN
    SELECT * INTO s FROM public.receivable_manual_settlements
      WHERE id = r.manual_settlement_id AND receivable_id = r.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Baixa manual indisponível para revisão.'; END IF;
  END IF;
  SELECT * INTO STRICT r FROM public.contas_receber WHERE id = p_receivable_id FOR UPDATE;
  PERFORM internal_finance.authorize_other_credit_plan(r.polo_id);
  SELECT * INTO e FROM internal_finance.other_credit_reversals WHERE request_id = p_request_id;
  IF FOUND THEN
    IF e.receivable_id IS DISTINCT FROM r.id OR e.actor_id IS DISTINCT FROM auth.uid()
      OR e.reason IS DISTINCT FROM reason OR r.status IS DISTINCT FROM 'ESTORNADO' THEN
      RAISE EXCEPTION 'A chave deste estorno pertence a outra operação.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('success',true,'status',r.status,'replayed',true);
  END IF;
  IF r.categoria IS DISTINCT FROM 'OUTROS_CREDITOS' OR r.status IS DISTINCT FROM 'PAGO'
    OR coalesce(r.tipo_lancamento,'OUTRO_CREDITO') <> 'OUTRO_CREDITO'
    OR r.matricula_id IS NOT NULL OR r.turma_id IS NOT NULL OR r.origem_cronograma_id IS NOT NULL
    OR r.outros_creditos_plano_id IS NOT NULL
    OR r.renegotiation_agreement_id IS NOT NULL OR r.ead_checkout_attempt_id IS NOT NULL
    OR r.regra_financeira_tecnica_snapshot IS NOT NULL
    OR r.regra_financeira_plano_unico_snapshot IS NOT NULL
    OR r.regra_financeira_dependencia_snapshot IS NOT NULL
    OR r.regra_financeira_renegociacao_snapshot IS NOT NULL
    OR r.regra_financeira_outros_creditos_snapshot IS NOT NULL
    OR upper(btrim(coalesce(r.origem_pagamento,''))) NOT IN ('PRESENCIAL','LOCAL')
    OR r.conta_bancaria_id IS NULL OR coalesce(r.valor_pago,0) <= 0 OR r.data_pagamento IS NULL
    OR r.manual_settlement_reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Somente um crédito avulso local pago pode ser estornado aqui. Encaminhe os demais à revisão financeira.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id=r.id)
    OR EXISTS (SELECT 1 FROM public.inscricoes_online l WHERE l.receivable_id=r.id)
    OR EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas l WHERE l.conta_receber_id=r.id)
    OR EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos l WHERE l.conta_receber_id=r.id)
    OR EXISTS (SELECT 1 FROM public.emprestimos_financeiros l WHERE l.conta_receber_id=r.id)
    OR EXISTS (SELECT 1 FROM public.receivable_renegotiation_source_items l WHERE l.receivable_id=r.id AND l.released_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.banese_cancellation_outbox l WHERE l.receivable_id=r.id) THEN
    RAISE EXCEPTION 'O crédito possui vínculo financeiro ou acadêmico e exige revisão específica.' USING ERRCODE = '22023';
  END IF;
  -- A bank identity, even canceled, must not be represented as a bank refund.
  IF EXISTS (SELECT 1 FROM jsonb_each(to_jsonb(r)) f
      WHERE (f.key LIKE 'gateway\_%' ESCAPE '\' OR f.key LIKE 'asaas\_%' ESCAPE '\'
        OR f.key = 'nosso_numero_asaas') AND f.value <> 'null'::jsonb AND f.value <> '""'::jsonb)
    OR EXISTS (SELECT 1 FROM public.financial_payment_events p WHERE p.source_kind = 'RECEIVABLE' AND p.source_id = r.id)
    OR EXISTS (SELECT 1 FROM public.payment_gateway_transactions t WHERE t.receivable_id = r.id) THEN
    RAISE EXCEPTION 'O crédito possui histórico bancário ou recebimentos compostos e exige revisão financeira.' USING ERRCODE = '22023';
  END IF;
  IF r.manual_settlement_id IS NOT NULL THEN
    IF s.id IS DISTINCT FROM r.manual_settlement_id OR s.state IS DISTINCT FROM 'COMPLETED'
      OR s.reversed_at IS NOT NULL OR s.received_cents IS DISTINCT FROM round(r.valor_pago * 100)::bigint
      OR s.account_id IS DISTINCT FROM r.conta_bancaria_id OR s.payment_date IS DISTINCT FROM r.data_pagamento
      OR s.provider_code IS NOT NULL OR s.remote_payment_id IS NOT NULL OR s.remote_payment_link_id IS NOT NULL THEN
      RAISE EXCEPTION 'A baixa manual possui divergências e exige revisão financeira.';
    END IF;
    SELECT u.id INTO actor FROM public.usuarios_sistema u WHERE u.auth_user_id = auth.uid()
      AND public.is_active_status(u.status) AND lower(btrim(u.perfil)) IN ('gestor','financeiro') LIMIT 1;
    IF actor IS NULL THEN RAISE EXCEPTION 'Operador financeiro indisponível.' USING ERRCODE = '42501'; END IF;
  END IF;
  stamp := clock_timestamp();
  INSERT INTO internal_finance.other_credit_reversals
    (request_id,receivable_id,actor_id,reason,before_fingerprint,database_txid,reversed_at)
    VALUES (p_request_id,r.id,auth.uid(),reason,pg_catalog.md5(to_jsonb(r)::text),pg_catalog.txid_current(),stamp);
  IF r.manual_settlement_id IS NOT NULL THEN
    UPDATE public.receivable_manual_settlements SET state = 'REVERSED', reversed_at = stamp, updated_at = stamp WHERE id = s.id;
    INSERT INTO public.receivable_manual_settlement_events(settlement_id,actor_id,event_type,details)
      VALUES (s.id,actor,'LOCAL_SETTLEMENT_REVERSED',jsonb_build_object('operation','OTHER_CREDIT_REVERSAL',
        'requestId',p_request_id,'reason',reason,'reversedAt',stamp));
  END IF;
  UPDATE public.contas_receber SET status = 'ESTORNADO', updated_at = stamp WHERE id = r.id;
  RETURN jsonb_build_object('success',true,'status','ESTORNADO','replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.estornar_outro_credito_secure(uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estornar_outro_credito_secure(uuid,uuid,text,boolean) TO authenticated;

-- Preserve the latest shared guard; fail closed if another release changed it.
DO $guard$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.protect_paid_financial_history()'::regprocedure);
  IF pg_catalog.md5(definition) <> '289ec2a8a14cdc53546384693a8443e4' THEN
    RAISE EXCEPTION 'A proteção do histórico financeiro mudou; revise a integração do estorno avulso.';
  END IF;
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n  IF TG_TABLE_NAME = ''contas_receber'' AND TG_OP = ''UPDATE'' THEN\n    IF internal_finance.other_credit_reversal_authorized(OLD,NEW) THEN RETURN NEW; END IF;\n  END IF;\n');
END;
$guard$;
NOTIFY pgrst, 'reload schema';
COMMIT;
