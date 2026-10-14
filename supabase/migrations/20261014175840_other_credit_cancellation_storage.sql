BEGIN;
-- Cancellation-only ledger. No operation or banking side effect is seeded.
CREATE SCHEMA internal_other_credit_cancellation;
REVOKE ALL ON SCHEMA internal_other_credit_cancellation FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE internal_other_credit_cancellation.operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  receivable_ids uuid[] NOT NULL CHECK (cardinality(receivable_ids) BETWEEN 1 AND 25),
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE internal_other_credit_cancellation.items (
  operation_id uuid NOT NULL REFERENCES internal_other_credit_cancellation.operations(id),
  receivable_id uuid NOT NULL REFERENCES public.contas_receber(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','LEASED','INTENT','REVIEW','COMPLETE')),
  lease_token uuid,
  lease_until timestamptz,
  intent_at timestamptz,
  evidence jsonb,
  review_reason text,
  completed_at timestamptz,
  PRIMARY KEY (operation_id,receivable_id),
  UNIQUE (receivable_id)
);
ALTER TABLE internal_other_credit_cancellation.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_other_credit_cancellation.items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA internal_other_credit_cancellation FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION internal_other_credit_cancellation.service_only()
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'CANCELLATION_SERVICE_ONLY' USING ERRCODE='42501';
  END IF;
END $$;
create function internal_other_credit_cancellation.actor_allowed(p_actor uuid,p_polo uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  u public.usuarios_sistema%rowtype;
  profile public.perfis_acesso%rowtype;
  permissions jsonb;
  tabs jsonb;
  schedule jsonb;
  allowed_polos uuid[];
  day_number integer;
  access_time text;
  start_time text;
  end_time text;
  allowed_day integer;
begin
  if p_actor is null or p_polo is null or not coalesce(
    public.portal_identidade_institucional_acesso_liberado(p_actor,'GESTOR'),false)
  then return false; end if;
  select * into u from public.usuarios_sistema where auth_user_id = p_actor;
  if not found or not coalesce(public.is_active_status(u.status),false)
    or lower(btrim(coalesce(u.perfil,''))) not in ('gestor','financeiro') then
    return false;
  end if;
  select * into profile from public.perfis_acesso where id = u.perfil_acesso_id;
  permissions := case when profile.id is not null and not coalesce(u.personalizar_permissoes,false)
    then coalesce(profile.permissoes,'{}'::jsonb) else coalesce(u.permissoes,'{}'::jsonb) end;
  if jsonb_typeof(permissions->'modules') is distinct from 'array'
    or not coalesce(permissions->'modules' ? 'financeiro',false) then return false; end if;
  tabs := permissions#>'{tabs,financeiro}';
  if jsonb_typeof(tabs) is distinct from 'array' or jsonb_array_length(tabs) = 0 then
    tabs := permissions->'financeiroTabs';
  end if;
  if jsonb_typeof(tabs) is distinct from 'array'
    or not coalesce(tabs ? 'outros-creditos',false) then return false; end if;
  allowed_polos := coalesce(u.polo_ids,array[]::uuid[]);
  if cardinality(allowed_polos) = 0 and u.context ~*
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    allowed_polos := array[u.context::uuid];
  end if;
  if not coalesce((p_polo = any(allowed_polos) or (
    u.permissoes->'allPolos' = 'true'::jsonb
    and cardinality(coalesce(u.polo_ids,array[]::uuid[])) = 0
    and exists (select 1 from public.polos where id=p_polo and lower(status)='ativo')
  )),false) then return false; end if;
  schedule := coalesce(u.restricao_horario,profile.restricao_horario,
    '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb);
  if jsonb_typeof(schedule->'ativo') is distinct from 'boolean' then return false; end if;
  if schedule->'ativo' = 'false'::jsonb then return true; end if;
  day_number := extract(dow from now() at time zone 'America/Maceio')::integer;
  access_time := to_char(now() at time zone 'America/Maceio','HH24:MI');
  start_time := schedule->>'horario_inicio'; end_time := schedule->>'horario_fim';
  if jsonb_typeof(schedule->'dias') is distinct from 'array'
    or start_time is null or end_time is null
    or start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or start_time = end_time then return false; end if;
  allowed_day := case when start_time>end_time and access_time<=end_time
    then (day_number+6)%7 else day_number end;
  return coalesce((case when start_time<end_time then access_time between start_time and end_time
    else access_time>=start_time or access_time<=end_time end)
    and exists(select 1 from jsonb_array_elements_text(schedule->'dias') d(value)
      where d.value=allowed_day::text),false);
end $$;

create function internal_other_credit_cancellation.has_payment_evidence(r public.contas_receber)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    coalesce(r.valor_pago,0)<>0 or r.data_pagamento is not null
    or r.manual_settlement_id is not null or r.manual_settlement_reversed_at is not null
    or coalesce(r.manual_settlement_received_cents,0)<>0
    or coalesce(r.manual_settlement_principal_cents,0)<>0
    or coalesce(r.manual_settlement_interest_cents,0)<>0
    or coalesce(r.manual_settlement_penalty_cents,0)<>0
    or coalesce(r.manual_settlement_addition_cents,0)<>0
    or coalesce(r.manual_settlement_discount_cents,0)<>0
    or r.gateway_settlement_recorded_at is not null
    or r.gateway_settlement_evidence is not null
    or r.gateway_settlement_source is not null or r.gateway_settlement_channel is not null
    or nullif(r.gateway_transaction_receipt_url,'') is not null
    or exists(select 1 from public.receivable_manual_settlements s where s.receivable_id=r.id)
    or upper(coalesce(r.status,'')) in ('PAGO','PARCIAL','EM_PROCESSAMENTO')
    or upper(coalesce(r.gateway_status,'')) in
      ('PAID','RECEIVED','CONFIRMED','PAGO','LIQUIDATED','PARTIALLY_PAID','PROCESSING')
  ),false);
$$;


CREATE FUNCTION internal_other_credit_cancellation.eligible(r public.contas_receber)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT coalesce(
  r.categoria='OUTROS_CREDITOS' AND r.tipo_lancamento='OUTRO_CREDITO'
  AND r.status IN ('PENDENTE','VENCIDO') AND r.polo_id IS NOT NULL
  AND r.matricula_id IS NULL AND r.turma_id IS NULL AND r.origem_cronograma_id IS NULL
  AND r.renegotiation_agreement_id IS NULL AND r.ead_checkout_attempt_id IS NULL
  AND r.regra_financeira_tecnica_snapshot IS NULL AND r.regra_financeira_plano_unico_snapshot IS NULL
  AND r.regra_financeira_dependencia_snapshot IS NULL AND r.regra_financeira_renegociacao_snapshot IS NULL
  AND NOT internal_other_credit_cancellation.has_payment_evidence(r)
  AND NOT EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.inscricoes_online l WHERE l.receivable_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.emprestimos_financeiros l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.receivable_renegotiation_source_items l
    WHERE l.receivable_id=r.id AND l.released_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM public.banese_cancellation_outbox l WHERE l.receivable_id=r.id)
  AND r.gateway_creation_token IS NULL AND r.gateway_cnab_file_id IS NULL
  AND (
    (coalesce(r.gateway_provider,'') IN ('','local') AND r.origem_pagamento='LOCAL'
      AND r.gateway_payment_id IS NULL AND r.asaas_payment_id IS NULL
      AND r.gateway_boleto_nosso_numero IS NULL AND r.nosso_numero_asaas IS NULL
      AND r.gateway_submission_channel IS NULL AND r.gateway_submission_status IS NULL
      AND r.gateway_invoice_url IS NULL AND r.gateway_bank_slip_url IS NULL
      AND r.gateway_pix_payload IS NULL AND r.asaas_invoice_url IS NULL
      AND r.asaas_bank_slip_url IS NULL AND r.gateway_boleto_issued_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.payment_gateway_transactions t WHERE t.receivable_id=r.id))
    OR (r.gateway_provider='banese_card' AND r.gateway_payment_method='BOLETO'
      AND r.forma_pagamento='BOLETO' AND r.gateway_environment IN ('production','sandbox')
      AND r.gateway_submission_channel='API' AND r.gateway_submission_status='API_REGISTERED'
      AND r.gateway_boleto_issued_at IS NOT NULL AND r.gateway_financial_terms_confirmed_at IS NOT NULL
      AND jsonb_typeof(r.gateway_financial_terms)='object'
      AND r.gateway_status IN ('PENDING','OVERDUE','CANCELED')
      AND r.gateway_payment_id=r.gateway_boleto_nosso_numero)
  ),false);
$$;
CREATE FUNCTION internal_other_credit_cancellation.snapshot(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object(
 'receivable',to_jsonb(r)-ARRAY['updated_at','gateway_synced_at','asaas_synced_at','gateway_last_error','asaas_last_error'],
 'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)-ARRAY['updated_at','synced_at','last_error','raw_payload'] ORDER BY t.id)
    FROM public.payment_gateway_transactions t WHERE t.receivable_id=r.id),'[]'::jsonb),
 'payerDocument',(SELECT regexp_replace(p.cpf_cnpj,'[^0-9]','','g') FROM public.parceiros p WHERE p.id=r.cliente_id))
FROM public.contas_receber r WHERE r.id=p_id;
$$;
CREATE FUNCTION internal_other_credit_cancellation.inspect(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.contas_receber%ROWTYPE; t public.payment_gateway_transactions%ROWTYPE; doc text;
BEGIN
  SELECT * INTO r FROM public.contas_receber WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT internal_other_credit_cancellation.eligible(r) THEN
    RAISE EXCEPTION 'CANCELLATION_TITLE_INELIGIBLE';
  END IF;
  IF coalesce(r.gateway_provider,'') IN ('','local') THEN
    RETURN jsonb_build_object('receivable',to_jsonb(r),'mode','LOCAL');
  END IF;
  PERFORM 1 FROM public.payment_gateway_transactions WHERE receivable_id=p_id ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.payment_gateway_transactions WHERE receivable_id=p_id)<>1 THEN
    RAISE EXCEPTION 'CANCELLATION_TRANSACTION_AMBIGUOUS';
  END IF;
  SELECT * INTO t FROM public.payment_gateway_transactions WHERE receivable_id=p_id;
  IF t.provider_code IS DISTINCT FROM r.gateway_provider OR t.environment IS DISTINCT FROM r.gateway_environment
    OR t.payment_method IS DISTINCT FROM 'BOLETO' OR t.amount IS DISTINCT FROM r.valor
    OR t.origin_polo_id IS DISTINCT FROM r.polo_id
    OR r.gateway_issuer_polo_id IS NULL OR t.issuer_polo_id IS DISTINCT FROM r.gateway_issuer_polo_id
    OR t.remote_payment_id IS DISTINCT FROM r.gateway_payment_id
    OR t.bank_slip_our_number IS DISTINCT FROM r.gateway_boleto_nosso_numero
    OR t.bank_slip_digitable_line IS DISTINCT FROM r.gateway_boleto_linha_digitavel
    OR t.bank_slip_barcode IS DISTINCT FROM r.gateway_boleto_codigo_barras
    OR nullif(t.transaction_receipt_url,'') IS NOT NULL
    OR coalesce(t.remote_status,'') NOT IN ('PENDING','OVERDUE','CANCELED') THEN
    RAISE EXCEPTION 'CANCELLATION_TRANSACTION_CHANGED';
  END IF;
  PERFORM 1 FROM public.banese_reconciliation_queue WHERE receivable_id=p_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.banese_reconciliation_queue q WHERE q.receivable_id=p_id
    AND (q.state='LEASED' OR q.lease_run_id IS NOT NULL OR q.lease_until>clock_timestamp())) THEN
    RAISE EXCEPTION 'CANCELLATION_RECONCILIATION_BUSY';
  END IF;
  SELECT regexp_replace(p.cpf_cnpj,'[^0-9]','','g') INTO doc FROM public.parceiros p WHERE p.id=r.cliente_id;
  IF r.valor<=0 OR r.valor*100<>trunc(r.valor*100) OR r.data_vencimento IS NULL
    OR coalesce(r.gateway_boleto_convenio,'') !~ '^[0-9]{1,20}$'
    OR coalesce(r.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
    OR coalesce(r.gateway_boleto_agencia,'') !~ '^[0-9]{3}$' OR r.gateway_boleto_agencia='000'
    OR coalesce(doc,'') !~ '^([0-9]{11}|[0-9]{14})$'
    OR coalesce(r.gateway_boleto_linha_digitavel,'') !~ '^[0-9]{47}$'
    OR coalesce(r.gateway_boleto_codigo_barras,'') !~ '^[0-9]{44}$' THEN
    RAISE EXCEPTION 'CANCELLATION_IDENTITY_INCOMPLETE';
  END IF;
  RETURN jsonb_build_object('receivable',to_jsonb(r),'payerDocument',doc,'transactionId',t.id,'mode','BANK');
END $$;
CREATE FUNCTION internal_other_credit_cancellation.preserve_history()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='operations' THEN RAISE EXCEPTION 'CANCELLATION_HISTORY_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','lease_token','lease_until','intent_at','evidence','review_reason','completed_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lease_token','lease_until','intent_at','evidence','review_reason','completed_at'])
    OR (OLD.intent_at IS NOT NULL AND NEW.intent_at IS DISTINCT FROM OLD.intent_at)
    OR (OLD.evidence IS NOT NULL AND NEW.evidence IS DISTINCT FROM OLD.evidence)
    OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'CANCELLATION_HISTORY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_operation BEFORE UPDATE OR DELETE ON internal_other_credit_cancellation.operations
 FOR EACH ROW EXECUTE FUNCTION internal_other_credit_cancellation.preserve_history();
CREATE TRIGGER preserve_item BEFORE UPDATE OR DELETE ON internal_other_credit_cancellation.items
 FOR EACH ROW EXECUTE FUNCTION internal_other_credit_cancellation.preserve_history();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_other_credit_cancellation FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
