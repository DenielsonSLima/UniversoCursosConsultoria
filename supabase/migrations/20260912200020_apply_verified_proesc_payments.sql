begin;

create function internal_proesc.has_exact_payment_claim(p_receivable public.contas_receber, p_historical_only boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from internal_proesc.mutation_claims claim
    join internal_proesc.reconciliation_requests request on request.request_id = claim.request_id
    where claim.receivable_id = p_receivable.id and claim.transaction_id = txid_current()
      and not claim.completed and request.action = 'APPLY' and request.response is null
      and claim.kind in ('IMPORT', 'AUTO', 'CORRECTION')
      and (not p_historical_only or claim.kind in ('IMPORT', 'CORRECTION'))
      and to_jsonb(p_receivable) @> claim.expected_new);
$$;
revoke all on function internal_proesc.has_exact_payment_claim(public.contas_receber, boolean)
  from public, anon, authenticated, service_role;

create function public.proesc_apply_financial_snapshot_service(
  p_actor_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_replay jsonb;
  v_snapshot internal_proesc.financial_snapshots%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_before jsonb;
  v_expected jsonb;
  v_account uuid;
  v_mode text := p_payload ->> 'mode';
  v_result text := 'APPLIED';
  v_reason text;
begin
  v_replay := internal_proesc.begin_financial_request('APPLY', p_actor_id, p_request_id, p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce(v_mode in ('IMPORT', 'AUTO', 'CORRECTION')
    and p_payload ->> 'expectedBefore' ~ '^[0-9a-f]{64}$', false) then
    raise exception 'Conciliação exige modo e snapshot anterior explícitos.' using errcode = '22023'; end if;
  select * into strict v_snapshot from internal_proesc.financial_snapshots
  where id = (p_payload ->> 'snapshotId')::uuid;
  select * into strict v_link from internal_proesc.obligation_links where id = v_snapshot.link_id;
  if v_mode = 'AUTO' then
    if nullif(p_payload ->> 'syncLeaseId', '') is null then
      raise exception 'Automação exige lease de sincronização vigente.' using errcode = '42501'; end if;
    perform internal_proesc.assert_sync_lease((p_payload ->> 'syncLeaseId')::uuid, v_link.id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || v_link.matricula_id::text, 0));
  perform 1 from public.turmas where id = v_link.turma_id for update;
  perform 1 from public.matriculas where id = v_link.matricula_id for update;
  select * into strict v_link from internal_proesc.obligation_links where id = v_snapshot.link_id for update;
  select * into strict v_receivable from public.contas_receber where id = v_link.receivable_id for update;
  perform internal_proesc.assert_historical_receivable(v_receivable);
  if internal_proesc.receivable_fingerprint(v_receivable) is distinct from p_payload ->> 'expectedBefore' then
    raise exception 'Recebível mudou após a conferência; operação não aplicada.' using errcode = '40001'; end if;
  if v_mode = 'AUTO' and not v_link.auto_enabled then
    raise exception 'Automação restrita a vínculos previamente confirmados e habilitados.' using errcode = '42501'; end if;
  v_before := to_jsonb(v_receivable);
  if v_snapshot.verification <> 'VERIFIED' or v_snapshot.source_status in ('CANCELED', 'UNKNOWN') then
    v_reason := 'EVIDENCIA_REQUER_REVISAO';
  elsif v_receivable.status = 'CANCELADO' then
    v_reason := 'CANCELAMENTO_LOCAL_REQUER_REVISAO';
  elsif v_snapshot.principal_cents <> round(v_receivable.valor * 100)::bigint then
    v_reason := 'PRINCIPAL_DIVERGENTE';
  elsif exists (select 1 from internal_proesc.financial_snapshots snapshot
    where snapshot.link_id = v_link.id and snapshot.observed_at > v_snapshot.observed_at) then
    v_reason := 'OBSERVACAO_SUPERADA';
  elsif v_mode = 'AUTO' and v_snapshot.evidence_kind not in ('API_SINGLE_PAYMENT', 'API_PAYMENT_TOTAL') then
    v_reason := 'AUTOMACAO_EXIGE_PAGAMENTO_API_CONFIRMADO';
  elsif v_snapshot.source_status = 'OPEN' then
    if v_receivable.status = 'PAGO' then v_reason := 'AUSENCIA_NAO_REVERTE_PAGAMENTO';
    else v_result := 'UNCHANGED'; end if;
  elsif v_snapshot.received_cents is null or v_snapshot.received_cents <= 0
    or v_snapshot.payment_date is null then
    v_reason := 'PAGAMENTO_INCOMPLETO';
  elsif v_receivable.status = 'PAGO' and (
    v_receivable.valor_pago is distinct from v_snapshot.received_cents::numeric / 100
    or v_receivable.data_pagamento is distinct from v_snapshot.payment_date)
    and exists (select 1 from internal_proesc.reconciliation_events event
      join internal_proesc.financial_snapshots previous on previous.id = event.snapshot_id
      where event.link_id = v_link.id and event.result = 'APPLIED'
        and previous.observed_at >= v_snapshot.observed_at) then
    v_reason := 'CORRECAO_EXIGE_OBSERVACAO_MAIS_RECENTE';
  elsif v_mode = 'CORRECTION' and v_receivable.status <> 'PAGO' then
    v_reason := 'CORRECAO_RESTRITA_A_PAGAMENTO_EXISTENTE';
  end if;
  if v_reason is not null then v_result := 'REVIEW'; end if;
  if v_result = 'APPLIED' then
    v_account := internal_proesc.shared_account(v_receivable.polo_id);
    v_expected := jsonb_build_object('id', v_receivable.id, 'matricula_id', v_link.matricula_id,
      'turma_id', v_link.turma_id, 'valor', v_receivable.valor, 'data_vencimento', v_receivable.data_vencimento,
      'status', 'PAGO', 'valor_pago', v_snapshot.received_cents::numeric / 100,
      'data_pagamento', v_snapshot.payment_date, 'conta_bancaria_id', v_account,
      'origem_pagamento', v_receivable.origem_pagamento);
    if to_jsonb(v_receivable) @> v_expected then v_result := 'UNCHANGED';
    else
      insert into internal_proesc.mutation_claims(request_id, transaction_id, receivable_id, kind, expected_new)
      values (p_request_id, txid_current(), v_receivable.id, v_mode, v_expected);
      -- The receipt is the actual amount reported, including partial-transfer
      -- cases. Gross principal is untouched; no discount is manufactured.
      update public.contas_receber set status = 'PAGO',
        valor_pago = v_snapshot.received_cents::numeric / 100,
        data_pagamento = v_snapshot.payment_date, conta_bancaria_id = v_account, updated_at = now()
      where id = v_receivable.id returning * into v_receivable;
      if not to_jsonb(v_receivable) @> v_expected
        or (to_jsonb(v_receivable) - array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at'])
          is distinct from (v_before - array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at']) then
        raise exception 'A conciliação alterou campos fora do contrato.' using errcode = '40001'; end if;
      update internal_proesc.mutation_claims set completed = true where request_id = p_request_id;
    end if;
  end if;
  insert into internal_proesc.reconciliation_events(request_id, link_id, snapshot_id, mode, result, before_state, after_state)
  values (p_request_id, v_link.id, v_snapshot.id, v_mode, v_result, v_before, to_jsonb(v_receivable));
  return internal_proesc.finish_financial_request(p_request_id, jsonb_build_object(
    'result', v_result, 'reviewReason', v_reason, 'receivableId', v_receivable.id,
    'currentBefore', internal_proesc.receivable_fingerprint(v_receivable)));
end;
$$;
revoke all on function public.proesc_apply_financial_snapshot_service(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.proesc_apply_financial_snapshot_service(uuid, uuid, jsonb) to service_role;

create function internal_proesc.guard_linked_financial_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from internal_proesc.obligation_links where receivable_id = old.id) then return new; end if;
  if (new.id,new.matricula_id,new.turma_id,new.cliente_id,new.polo_id,new.valor,new.data_vencimento,
    new.origem_cronograma_id,new.origem_pagamento,new.tipo_lancamento,new.gateway_provider,
    new.gateway_payment_id,new.gateway_boleto_nosso_numero,new.gateway_creation_token,new.manual_settlement_id)
    is distinct from (old.id,old.matricula_id,old.turma_id,old.cliente_id,old.polo_id,old.valor,old.data_vencimento,
      old.origem_cronograma_id,old.origem_pagamento,old.tipo_lancamento,old.gateway_provider,
      old.gateway_payment_id,old.gateway_boleto_nosso_numero,old.gateway_creation_token,old.manual_settlement_id)
  then raise exception 'Identidade Proesc vinculada exige revisão auditada.' using errcode = '42501'; end if;
  if (new.status,new.valor_pago,new.data_pagamento) is distinct from (old.status,old.valor_pago,old.data_pagamento)
    and not internal_proesc.has_exact_payment_claim(new, false) then
    raise exception 'Pagamento Proesc exige conciliação interna comprovada.' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function internal_proesc.guard_linked_financial_identity() from public, anon, authenticated, service_role;
create trigger guard_proesc_linked_financial_identity before update on public.contas_receber
for each row execute function internal_proesc.guard_linked_financial_identity();

create or replace function public.enqueue_payment_confirmation_push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_allowed boolean := false; v_new_paid boolean; v_old_paid boolean;
begin
  if new.cliente_id is null or internal_proesc.has_exact_payment_claim(new, true) then return new; end if;
  v_new_paid := public.financial_receivable_is_paid_confirmed(new.status, new.data_pagamento);
  v_old_paid := public.financial_receivable_is_paid_confirmed(old.status, old.data_pagamento);
  if not v_new_paid or v_old_paid then return new; end if;
  select policy.enabled and coalesce((policy.categories ->> 'financial')::boolean, false)
    into v_allowed from public.push_notification_policies policy where policy.id is true;
  if not coalesce(v_allowed, false) then return new; end if;
  insert into public.push_notification_jobs(source_type,source_id,category,aluno_id,title,body,deep_link,data,idempotency_key)
  values ('financial',new.id,'financial',new.cliente_id,'Pagamento confirmado',
    'Recebemos seu pagamento. Consulte os detalhes no Financeiro do app.', '/aluno/?module=financeiro',
    jsonb_build_object('receivable_id',new.id,'event','payment_confirmed','collapse_key','financial:' || new.id::text),
    'financial:payment-confirmed:' || new.id::text) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_payment_confirmation_push_notification() from public, anon, authenticated, service_role;
commit;
