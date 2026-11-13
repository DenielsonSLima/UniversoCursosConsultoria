BEGIN;

-- A manual settlement is academic evidence only for its own audited EAD
-- purchase. Remote cancellation remains bank history, never a fake bank payment.
CREATE FUNCTION internal_academic.ead_has_own_trust_manual_payment(p_receivable_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.contas_receber c
  JOIN public.matriculas m ON m.id=c.matricula_id AND m.aluno_id=c.cliente_id
   AND coalesce(c.turma_id,m.turma_id)=m.turma_id
  JOIN internal_academic.ead_trust_access_audit audit ON audit.matricula_id=m.id
  JOIN public.turmas t ON t.id=m.turma_id AND t.polo_id=c.polo_id
  JOIN public.cursos course ON course.id=t.curso_id AND course.modalidade='EAD'
  JOIN public.inscricoes_online i ON i.receivable_id=c.id AND i.matricula_id=m.id
   AND i.aluno_id=m.aluno_id AND i.turma_id=t.id AND i.curso_id=course.id AND i.valor=c.valor
  WHERE c.id=p_receivable_id AND c.tipo_lancamento='MATRICULA'
   AND m.status IN ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO','VENCIDO','ATIVO','CONCLUIDO')
   AND c.status='PAGO' AND c.valor>0 AND c.valor_pago>0 AND c.data_pagamento IS NOT NULL
   AND c.data_pagamento<=(statement_timestamp() AT TIME ZONE 'America/Maceio')::date
   AND (
    (c.ead_checkout_attempt_id IS NULL AND i.ead_checkout_attempt_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.ead_checkout_attempts a WHERE a.matricula_id=m.id))
    OR EXISTS(SELECT 1 FROM public.ead_checkout_attempts a
     WHERE a.id=c.ead_checkout_attempt_id AND a.receivable_id=c.id AND a.inscription_id=i.id
      AND i.ead_checkout_attempt_id=a.id AND a.matricula_id=m.id AND a.aluno_id=m.aluno_id
      AND a.turma_id=t.id AND a.curso_id=course.id AND a.is_current
      AND a.state IN ('OPEN','EXPIRED','PAID')
      AND NOT EXISTS(SELECT 1 FROM public.ead_checkout_attempts other
       WHERE other.matricula_id=m.id AND other.id<>a.id AND other.state IN ('PAID','PAID_REVIEW')))
   )
   AND (
    (coalesce(c.gateway_provider,'local') IN ('','local')
     AND nullif(coalesce(c.gateway_payment_id,c.asaas_payment_id),'') IS NULL
     AND nullif(c.gateway_boleto_nosso_numero,'') IS NULL
     AND nullif(coalesce(i.gateway_payment_id,i.asaas_payment_id),'') IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.payment_gateway_transactions tx WHERE tx.receivable_id=c.id))
    OR (upper(coalesce(c.gateway_status,c.asaas_status,'')) IN ('CANCELED','CANCELLED','DELETED')
     AND EXISTS(SELECT 1 FROM public.payment_gateway_transactions tx
      WHERE tx.receivable_id=c.id AND tx.inscricao_online_id=i.id
       AND tx.provider_code=c.gateway_provider AND tx.environment=c.gateway_environment
       AND tx.environment=coalesce(i.gateway_environment,c.gateway_environment)
       AND tx.remote_payment_id=coalesce(c.gateway_payment_id,c.asaas_payment_id)
       AND tx.remote_payment_id=coalesce(i.gateway_payment_id,i.asaas_payment_id)
       AND tx.amount=c.valor AND upper(tx.remote_status) IN ('CANCELED','CANCELLED','DELETED')
       AND (c.ead_checkout_attempt_id IS NULL OR EXISTS(SELECT 1 FROM public.ead_checkout_attempts a
        WHERE a.id=c.ead_checkout_attempt_id AND a.transaction_id=tx.id)))
     AND (SELECT count(*) FROM public.payment_gateway_transactions tx WHERE tx.receivable_id=c.id)=1)
   )
   AND (
    EXISTS(SELECT 1 FROM public.financial_payment_events e
     WHERE e.source_kind='RECEIVABLE' AND e.source_id=c.id AND e.reversed_at IS NULL
     GROUP BY e.source_id
     HAVING bool_and(e.original_cents=c.valor*100 AND e.polo_id IS NOT DISTINCT FROM c.polo_id)
      AND sum(e.principal_cents+e.discount_cents)=c.valor*100
      AND sum(e.payment_cents)=c.valor_pago*100 AND sum(e.payment_cents)>0)
    OR EXISTS(SELECT 1 FROM public.receivable_manual_settlements s
     WHERE s.id=c.manual_settlement_id AND s.receivable_id=c.id AND s.polo_id=c.polo_id
      AND s.state='COMPLETED' AND s.completed_at IS NOT NULL AND s.reversed_at IS NULL
      AND c.manual_settlement_reversed_at IS NULL AND s.principal_cents=c.valor*100
      AND s.received_cents=c.valor_pago*100 AND s.received_cents>0
      AND (NOT s.requires_remote_cancellation OR s.remote_canceled_at IS NOT NULL))
   )
 );
$$;
REVOKE ALL ON FUNCTION internal_academic.ead_has_own_trust_manual_payment(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION internal_academic.ead_has_confirmed_payment(p_matricula_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT EXISTS(
  SELECT 1 FROM public.matriculas m
  JOIN public.turmas turma ON turma.id=m.turma_id
  JOIN public.cursos curso ON curso.id=turma.curso_id AND curso.modalidade='EAD'
  JOIN public.contas_receber c ON c.matricula_id=m.id
    AND c.cliente_id=m.aluno_id AND coalesce(c.turma_id,m.turma_id)=m.turma_id AND c.polo_id=turma.polo_id
  WHERE m.id=p_matricula_id AND c.tipo_lancamento='MATRICULA'
   AND c.status='PAGO' AND c.valor>0 AND c.valor_pago>0 AND c.data_pagamento IS NOT NULL
   AND c.data_pagamento<=(statement_timestamp() AT TIME ZONE 'America/Maceio')::date
   AND (c.ead_checkout_attempt_id IS NULL OR EXISTS(
    SELECT 1 FROM public.ead_checkout_attempts a JOIN public.inscricoes_online i ON i.id=a.inscription_id
    WHERE a.id=c.ead_checkout_attempt_id AND a.receivable_id=c.id AND a.matricula_id=m.id
     AND a.aluno_id=m.aluno_id AND a.turma_id=m.turma_id AND a.curso_id=curso.id
     AND i.ead_checkout_attempt_id=a.id AND i.receivable_id=c.id AND i.matricula_id=m.id
     AND i.aluno_id=m.aluno_id AND i.turma_id=m.turma_id AND i.curso_id=curso.id))
   AND (
    -- Manual proof must belong to this audited, eligible purchase itself.
    internal_academic.ead_has_own_trust_manual_payment(c.id)
    OR EXISTS(
     SELECT 1 FROM public.inscricoes_online i JOIN public.payment_gateway_transactions tx
       ON tx.receivable_id=c.id AND tx.inscricao_online_id=i.id
     WHERE i.receivable_id=c.id AND i.matricula_id=m.id AND i.aluno_id=m.aluno_id
      AND i.turma_id=m.turma_id AND i.curso_id=curso.id AND i.status='PAGO' AND i.valor=c.valor
      AND tx.amount=c.valor AND tx.provider_code=coalesce(c.gateway_provider,'asaas')
      AND tx.environment=coalesce(c.gateway_environment,i.gateway_environment)
      AND tx.remote_payment_id=coalesce(c.gateway_payment_id,c.asaas_payment_id)
      AND tx.remote_payment_id=coalesce(i.gateway_payment_id,i.asaas_payment_id)
      AND (c.ead_checkout_attempt_id IS NULL OR EXISTS(SELECT 1 FROM public.ead_checkout_attempts a
        WHERE a.id=c.ead_checkout_attempt_id AND a.transaction_id=tx.id AND a.inscription_id=i.id
          AND a.state IN ('PAID','PAID_REVIEW')))
      AND (SELECT count(*) FROM public.payment_gateway_transactions same WHERE same.receivable_id=c.id)=1
      AND (
       (tx.provider_code='banese_card' AND tx.payment_method='BOLETO'
        AND tx.remote_payment_id=c.gateway_boleto_nosso_numero AND tx.bank_slip_our_number=c.gateway_boleto_nosso_numero
        AND c.gateway_status='PAID' AND c.origem_pagamento='BANESE' AND c.gateway_settlement_source='API'
        AND c.gateway_settlement_evidence->>'paymentCount' ~ '^[1-9][0-9]{0,5}$'
        AND upper(tx.remote_status) IN ('PAID','RECEIVED','CONFIRMED'))
       OR (tx.provider_code='asaas' AND upper(coalesce(c.gateway_status,c.asaas_status)) IN ('PAID','RECEIVED','CONFIRMED')
        AND upper(tx.remote_status) IN ('PAID','RECEIVED','CONFIRMED'))
      )
    )
   )
 );
$function$;
REVOKE ALL ON FUNCTION internal_academic.ead_has_confirmed_payment(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ead_activate_matricula_on_paid_inscricao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_a public.ead_checkout_attempts%ROWTYPE; v_c public.contas_receber%ROWTYPE;
BEGIN
 IF NEW.ead_checkout_attempt_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT v_a FROM public.ead_checkout_attempts WHERE id=NEW.ead_checkout_attempt_id FOR UPDATE;
 IF NEW.status<>'PAGO' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT v_c FROM public.contas_receber WHERE id=v_a.receivable_id;
 IF (v_c.status IS DISTINCT FROM 'PAGO' OR v_c.data_pagamento IS NULL OR coalesce(v_c.valor_pago,0)<=0
   OR v_c.gateway_status IS DISTINCT FROM 'PAID' OR v_c.origem_pagamento IS DISTINCT FROM 'BANESE')
   AND NOT internal_academic.ead_has_own_trust_manual_payment(v_c.id) THEN
  RAISE EXCEPTION 'Inscrição EAD exige seu próprio pagamento canônico.' USING ERRCODE='PT409';
 END IF;
 UPDATE public.ead_checkout_attempts SET state=CASE WHEN state='PAID_REVIEW' THEN state ELSE 'PAID' END,
  paid_at=coalesce(paid_at,NEW.pago_em,now()),updated_at=now() WHERE id=v_a.id;
 IF v_a.state<>'PAID_REVIEW' AND NOT EXISTS(SELECT 1 FROM public.ead_checkout_attempts other
   WHERE other.matricula_id=v_a.matricula_id AND other.id<>v_a.id AND other.state IN ('PAID','PAID_REVIEW')) THEN
  UPDATE public.matriculas SET status='ATIVO' WHERE id=v_a.matricula_id
   AND status IN ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO','VENCIDO');
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ead_activate_matricula_on_paid_inscricao()
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_academic.project_ead_trust_manual_payment(p_receivable_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT internal_academic.ead_has_own_trust_manual_payment(p_receivable_id) THEN RETURN; END IF;
 -- Keep the established lock order: inscription -> attempt -> enrollment.
 -- The effective financial ledger is read without taking financial row locks.
 UPDATE public.inscricoes_online i SET status='PAGO',pago_em=coalesce(i.pago_em,clock_timestamp()),
  confirmado_em=coalesce(i.confirmado_em,clock_timestamp()),updated_at=clock_timestamp()
 WHERE i.receivable_id=p_receivable_id AND i.status<>'PAGO'
  AND internal_academic.ead_has_own_trust_manual_payment(p_receivable_id);
 -- A previously projected inscription (or the legacy confirmation status)
 -- still needs the same exact receipt before its pending enrollment is opened.
 UPDATE public.matriculas m SET status='ATIVO' FROM public.contas_receber c
 WHERE c.id=p_receivable_id AND m.id=c.matricula_id
  AND m.status IN ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO','VENCIDO')
  AND internal_academic.ead_has_own_trust_manual_payment(c.id)
  AND EXISTS(SELECT 1 FROM public.inscricoes_online i WHERE i.receivable_id=c.id AND i.status='PAGO');
END;
$$;
REVOKE ALL ON FUNCTION internal_academic.project_ead_trust_manual_payment(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Existing deferred triggers already cover all six canonical financial sources.
-- Project the own manual receipt before certificate reconciliation, even when
-- no certificate was issued. No client retry or browser session is required.
CREATE OR REPLACE FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_matricula uuid; v_receivable uuid;
BEGIN
 IF TG_TABLE_NAME='contas_receber' THEN v_receivable:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('inscricoes_online','ead_checkout_attempts','payment_gateway_transactions',
   'receivable_manual_settlements') THEN v_receivable:=NEW.receivable_id;
 ELSIF TG_TABLE_NAME='financial_payment_events' THEN
  IF NEW.source_kind<>'RECEIVABLE' THEN RETURN NEW; END IF;
  v_receivable:=NEW.source_id;
 ELSE RAISE EXCEPTION 'Origem de confirmação EAD inválida.' USING ERRCODE='22023'; END IF;
 IF v_receivable IS NOT NULL THEN
  PERFORM internal_academic.project_ead_trust_manual_payment(v_receivable);
  SELECT matricula_id INTO v_matricula FROM public.contas_receber WHERE id=v_receivable;
 END IF;
 IF v_matricula IS NOT NULL AND EXISTS(SELECT 1 FROM internal_academic.ead_trust_certificate_issues
   WHERE matricula_id=v_matricula AND state IN ('TEMPORARY','REVOKED')) THEN
  PERFORM internal_academic.reconcile_ead_trust_certificate(v_matricula);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION internal_academic.sync_ead_trust_certificate_after_financial_write()
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
