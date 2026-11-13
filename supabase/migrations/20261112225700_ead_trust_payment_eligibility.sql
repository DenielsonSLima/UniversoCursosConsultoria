BEGIN;

-- Read canonical evidence only. No financial row locks, bank requests, mutable
-- confirmation timestamps or student/course heuristics decide this predicate.
CREATE FUNCTION internal_academic.ead_has_confirmed_payment(p_matricula_id uuid)
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
    -- Canonical partial-payment events may finish a title after the original
    -- bank charge was canceled. The effective ledger, not remote status, wins.
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

-- An obsolete attempt cannot revoke a new open purchase of the same enrollment.
-- The banking expiration/cancellation workflow remains the owner of these states.
CREATE FUNCTION internal_academic.ead_trust_financial_blocked(p_matricula_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT NOT internal_academic.ead_has_confirmed_payment(p_matricula_id) AND (
  EXISTS(SELECT 1 FROM public.ead_checkout_attempts a
   JOIN public.matriculas m ON m.id=a.matricula_id AND m.aluno_id=a.aluno_id AND m.turma_id=a.turma_id
   JOIN public.turmas t ON t.id=m.turma_id AND t.curso_id=a.curso_id
   JOIN public.cursos curso ON curso.id=t.curso_id AND curso.modalidade='EAD'
   JOIN public.contas_receber c ON c.id=a.receivable_id AND c.ead_checkout_attempt_id=a.id
    AND c.matricula_id=m.id AND c.cliente_id=m.aluno_id AND c.turma_id=m.turma_id AND c.polo_id=t.polo_id
   WHERE m.id=p_matricula_id AND a.is_current AND a.state='EXPIRED'
    AND c.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO'))
  OR (
   NOT EXISTS(SELECT 1 FROM public.ead_checkout_attempts a WHERE a.matricula_id=p_matricula_id)
   AND EXISTS(SELECT 1 FROM public.contas_receber c JOIN public.matriculas m ON m.id=c.matricula_id
     JOIN public.turmas t ON t.id=m.turma_id JOIN public.cursos curso ON curso.id=t.curso_id AND curso.modalidade='EAD'
     WHERE m.id=p_matricula_id AND c.cliente_id=m.aluno_id AND c.polo_id=t.polo_id
      AND coalesce(c.turma_id,m.turma_id)=m.turma_id AND c.tipo_lancamento='MATRICULA'
      AND c.status IN ('CANCELADO','ESTORNADO','DEVOLVIDO'))
   AND NOT EXISTS(SELECT 1 FROM public.contas_receber open_title
     WHERE open_title.matricula_id=p_matricula_id AND open_title.tipo_lancamento='MATRICULA'
      AND open_title.status IN ('PENDENTE','VENCIDO','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO'))
  )
 );
$function$;
REVOKE ALL ON FUNCTION internal_academic.ead_trust_financial_blocked(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION internal_academic.ead_has_trust_access(p_matricula_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT EXISTS(SELECT 1 FROM public.matriculas m
  JOIN public.turmas t ON t.id=m.turma_id JOIN public.cursos c ON c.id=t.curso_id
  WHERE m.id=p_matricula_id AND c.modalidade='EAD'
   AND upper(m.status) IN ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
   AND m.acesso_temporario_ate>statement_timestamp()
   AND (NOT internal_academic.ead_trust_full_course_enabled()
     OR NOT internal_academic.ead_trust_financial_blocked(m.id)));
$function$;
REVOKE ALL ON FUNCTION internal_academic.ead_has_trust_access(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ead_liberar_por_confianca(p_matricula_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_m public.matriculas%rowtype; v_expiry timestamptz; v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not coalesce(public.gestor_has_module('gestao'),false) then
    raise exception 'Acesso à gestão EAD obrigatório.' using errcode='42501';
  end if;
  select m.* into v_m from public.matriculas m
    join public.turmas t on t.id=m.turma_id join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and c.modalidade='EAD' for update of m;
  if not found or not coalesce(public.can_write_turma(v_m.turma_id),false) then
    raise exception 'Matrícula fora do escopo autorizado.' using errcode='42501';
  end if;
  if coalesce(upper(v_m.status),'') not in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO') then
    raise exception 'A confiança exige matrícula aguardando pagamento.' using errcode='23514';
  end if;
  select expires_at into v_expiry from internal_academic.ead_trust_access_audit
    where matricula_id=p_matricula_id;
  if found then
    if v_expiry <= v_now then
      raise exception 'As 24 horas de confiança já expiraram; confirme o pagamento.' using errcode='PT409';
    end if;
    return v_expiry;
  end if;
  if internal_academic.ead_trust_full_course_enabled()
    and internal_academic.ead_trust_financial_blocked(p_matricula_id) then
    raise exception 'A cobrança desta matrícula foi encerrada. Confira a compra EAD antes de liberar confiança.' using errcode='55000';
  end if;
  v_expiry := v_now + interval '24 hours';
  insert into internal_academic.ead_trust_access_audit
    values(p_matricula_id,v_now,v_expiry,auth.uid(),session_user);
  update public.matriculas set acesso_temporario_ate=v_expiry where id=p_matricula_id;
  return v_expiry;
end $$;
REVOKE ALL ON FUNCTION public.ead_liberar_por_confianca(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ead_liberar_por_confianca(uuid) TO authenticated;

COMMIT;
