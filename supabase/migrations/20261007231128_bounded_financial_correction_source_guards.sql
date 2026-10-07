-- LOCAL REVIEW DRAFT ONLY. No impersonated auth.uid(), role switch or RLS bypass grant.
begin;
-- Actor is the immutable recorded approver, not a caller-supplied worker identity.
-- Semantics inspected against current public authorization helpers on 2026-10-07.
create function internal_financial_correction.actor_allowed(p_actor uuid,p_polo uuid)
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
  if not coalesce(permissions->'modules' ? 'financeiro',false) then return false; end if;
  tabs := permissions#>'{tabs,financeiro}';
  if jsonb_typeof(tabs) is distinct from 'array' or jsonb_array_length(tabs) = 0 then
    tabs := permissions->'financeiroTabs';
  end if;
  if not coalesce(tabs ? 'receber',false) then return false; end if;
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
    or start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or start_time = end_time then return false; end if;
  allowed_day := case when start_time>end_time and access_time<=end_time
    then (day_number+6)%7 else day_number end;
  return (case when start_time<end_time then access_time between start_time and end_time
    else access_time>=start_time or access_time<=end_time end)
    and exists(select 1 from jsonb_array_elements_text(schedule->'dias') d(value)
      where d.value=allowed_day::text);
end $$;

create function internal_financial_correction.has_payment_evidence(r public.contas_receber)
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

create function internal_financial_correction.inspect_title(p_id uuid,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.contas_receber%rowtype;
  t public.payment_gateway_transactions%rowtype;
  payer_document text;
  identity_value jsonb;
begin
  -- Consistent order: operation, item, receivable, transaction, reconciliation.
  select * into r from public.contas_receber where id=p_id for update;
  if not found then raise exception 'CORRECTION_TITLE_MISSING'; end if;
  if not coalesce((r.status in ('PENDENTE','VENCIDO','SUSPENSO') or
    (p_completed and r.status='CANCELADO')),false) then raise exception 'CORRECTION_TITLE_STATE'; end if;
  if internal_financial_correction.has_payment_evidence(r) then
    raise exception 'CORRECTION_PAYMENT_OR_SETTLEMENT_EVIDENCE';
  end if;
  if r.gateway_provider is distinct from 'banese_card'
    or r.gateway_payment_method is distinct from 'BOLETO'
    or r.forma_pagamento is distinct from 'BOLETO' or r.gateway_boleto_issued_at is null
    or r.gateway_submission_channel is distinct from 'API'
    or r.gateway_submission_status is distinct from 'API_REGISTERED'
    or r.gateway_cnab_file_id is not null or r.gateway_creation_token is not null
    or r.renegotiation_agreement_id is not null
    or r.gateway_environment not in ('production','sandbox')
    or r.gateway_financial_terms_confirmed_at is null
    or jsonb_typeof(r.gateway_financial_terms) is distinct from 'object'
    or exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=p_id)
    or exists(select 1 from public.receivable_renegotiation_source_items s
      where s.receivable_id=p_id and s.released_at is null)
    or exists(select 1 from public.banese_cancellation_outbox q where q.receivable_id=p_id)
    or exists(select 1 from internal_academic.technical_manual_banese_reissue_jobs j
      where j.receivable_id=p_id)
  then raise exception 'CORRECTION_PROVENANCE_OR_OTHER_OPERATION'; end if;
  if upper(coalesce(r.gateway_status,'')) not in ('PENDING','OVERDUE') and not
    (p_completed and r.gateway_status='CANCELED') then
    raise exception 'CORRECTION_GATEWAY_STATE';
  end if;
  if not exists(select 1 from public.matriculas m join public.turmas c on c.id=m.turma_id
    where m.id=r.matricula_id and m.turma_id=r.turma_id and c.polo_id=r.polo_id
      and m.aluno_id=r.cliente_id) then raise exception 'CORRECTION_ENROLLMENT_IDENTITY'; end if;
  if (select count(*) from public.payment_gateway_transactions where receivable_id=p_id)<>1 then
    raise exception 'CORRECTION_TRANSACTION_AMBIGUOUS';
  end if;
  select * into t from public.payment_gateway_transactions where receivable_id=p_id for update;
  if t.provider_code is distinct from r.gateway_provider or t.environment is distinct from r.gateway_environment
    or t.payment_method is distinct from 'BOLETO' or t.amount is distinct from r.valor
    or t.origin_polo_id is distinct from r.polo_id
    or r.gateway_issuer_polo_id is null or t.issuer_polo_id is distinct from r.gateway_issuer_polo_id
    or t.pix_payload is distinct from r.gateway_pix_payload
    or t.pix_encoded_image is distinct from r.gateway_pix_encoded_image
    or t.remote_payment_id is distinct from r.gateway_payment_id
    or t.bank_slip_our_number is distinct from r.gateway_boleto_nosso_numero
    or t.remote_payment_id is distinct from r.gateway_boleto_nosso_numero
    or t.bank_slip_digitable_line is distinct from r.gateway_boleto_linha_digitavel
    or t.bank_slip_barcode is distinct from r.gateway_boleto_codigo_barras
    or nullif(t.transaction_receipt_url,'') is not null
    or (upper(coalesce(t.remote_status,'')) not in ('PENDING','OVERDUE') and not
      (p_completed and t.remote_status='CANCELED')) then
    raise exception 'CORRECTION_TRANSACTION_IDENTITY_OR_PAYMENT';
  end if;
  perform 1 from public.banese_reconciliation_queue where receivable_id=p_id for update;
  if exists(select 1 from public.banese_reconciliation_queue q where q.receivable_id=p_id
    and (q.state='LEASED' or q.lease_run_id is not null or q.lease_until is not null)) then
    raise exception 'CORRECTION_RECONCILIATION_IN_PROGRESS';
  end if;
  select regexp_replace(p.cpf_cnpj,'[^0-9]','','g') into payer_document
    from public.parceiros p where p.id=r.cliente_id;
  identity_value := jsonb_build_object(
    'receivableId',r.id,'enrollmentId',r.matricula_id,'classId',r.turma_id,
    'environment',r.gateway_environment,'convenio',r.gateway_boleto_convenio,
    'nossoNumero',r.gateway_boleto_nosso_numero,'amountCents',(r.valor*100)::bigint,
    'dueDate',r.data_vencimento,'agency',r.gateway_boleto_agencia,
    'payerDocument',payer_document,'digitableLine',r.gateway_boleto_linha_digitavel,
    'barcode',r.gateway_boleto_codigo_barras,'financialTerms',r.gateway_financial_terms);
  if r.valor<=0 or r.valor*100<>trunc(r.valor*100)
    or r.gateway_boleto_convenio !~ '^[0-9]{1,20}$'
    or r.gateway_boleto_nosso_numero !~ '^[0-9]{9}$'
    or r.gateway_boleto_agencia !~ '^[0-9]{3}$' or r.gateway_boleto_agencia='000'
    or payer_document !~ '^([0-9]{11}|[0-9]{14})$'
    or r.gateway_boleto_linha_digitavel !~ '^[0-9]{47}$'
    or r.gateway_boleto_codigo_barras !~ '^[0-9]{44}$'
    or exists(select 1 from jsonb_each(identity_value) e where e.value='null'::jsonb)
  then raise exception 'CORRECTION_BANK_IDENTITY_INCOMPLETE'; end if;
  return jsonb_build_object('identity',identity_value,'poloId',r.polo_id,
    'transactionId',t.id,'receivable',to_jsonb(r),'transaction',to_jsonb(t));
end $$;
-- Snapshot the existing source run and authorization, never a replacement run.
create function internal_financial_correction.inspect_source(p_id uuid,p_local boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.contas_receber%rowtype;
  run internal_academic.technical_manual_cycle_runs%rowtype;
  title jsonb;
  auth_snapshot jsonb;
  old_terms jsonb;
  new_terms jsonb;
  new_due date;
  kind_value text;
begin
  if (select count(*) from internal_academic.technical_manual_cycle_runs
    where p_id=any(receivable_ids))<>1 then raise exception 'CORRECTION_RUN_AMBIGUOUS'; end if;
  select * into strict run from internal_academic.technical_manual_cycle_runs
    where p_id=any(receivable_ids) for share;
  if run.state is distinct from 'LOCAL_CREATED' or run.reviewed_items is null
    or run.cycle_number not in (1,2) then raise exception 'CORRECTION_RUN_NOT_REVIEWED'; end if;
  select * into strict r from public.contas_receber where id=p_id for update;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(r);
  if run.matricula_id is distinct from r.matricula_id or run.turma_id is distinct from r.turma_id
    or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=r.matricula_id and m.turma_id=r.turma_id and m.aluno_id=r.cliente_id
        and t.polo_id=r.polo_id) then raise exception 'CORRECTION_SOURCE_IDENTITY'; end if;
  select to_jsonb(a) into auth_snapshot
    from internal_academic.technical_manual_receivable_issuance_authorizations a
    where a.receivable_id=r.id for share;
  if p_local then
    if r.status not in ('PENDENTE','VENCIDO') or r.status is null
      or r.tipo_lancamento is distinct from 'MATRICULA' or r.parcela_numero is distinct from 0
      or r.origem_cronograma_id is distinct from 'matricula' or run.cycle_number<>1
      or r.valor is distinct from 200::numeric
      or not coalesce(internal_academic.manual_cycle_has_local_intent(r),false)
      or not coalesce(internal_academic.manual_cycle_local_receivable_complete(r),false)
      or internal_academic.manual_cycle_has_bank_fields(r)
      or internal_financial_correction.has_payment_evidence(r)
      or auth_snapshot is not null
      or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id)
      or exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=r.id)
      or exists(select 1 from public.receivable_renegotiation_source_items s where s.receivable_id=r.id)
      or exists(select 1 from public.banese_cancellation_outbox c where c.receivable_id=r.id)
    then raise exception 'CORRECTION_LOCAL_FEE_NOT_NEVER_PAID'; end if;
    title := jsonb_build_object('receivable',to_jsonb(r),'poloId',r.polo_id);
    kind_value := 'LOCAL_WAIVER';
  else
    title := internal_financial_correction.inspect_title(p_id,false);
    old_terms := internal_academic.technical_manual_banese_expected_terms(r);
    if old_terms is null or old_terms is distinct from r.gateway_financial_terms
      or auth_snapshot is null
      or auth_snapshot->>'matricula_id' is distinct from r.matricula_id::text
      or auth_snapshot->>'turma_id' is distinct from r.turma_id::text
      or auth_snapshot->>'cycle_number' is distinct from run.cycle_number::text
      or auth_snapshot->>'authorized_by' is distinct from run.created_by::text
      or run.created_by is null or auth_snapshot->>'first_claimed_at' is null
      or coalesce((auth_snapshot->>'claim_count')::integer,0)<1
      or auth_snapshot->>'receivable_fingerprint' is distinct from
        internal_academic.technical_manual_receivable_issuance_fingerprint(r)
      or title#>>'{transaction,raw_payload,manualCycleIssuance,cycleRequestId}'
        is distinct from run.request_id::text
    then raise exception 'CORRECTION_CANONICAL_TERMS_OR_AUTHORIZATION'; end if;
    if run.cycle_number=1 then
      kind_value := 'RESET_C1';
      if r.tipo_lancamento is distinct from 'PARCELA' or r.parcela_numero not between 1 and 12
        or r.parcela_numero is null or r.valor is distinct from 279.90::numeric
        or run.item_count is distinct from 13
        or r.data_vencimento is distinct from (date '2026-10-05'+make_interval(months=>r.parcela_numero-1))::date
        or (old_terms#>>'{discount,value}')::numeric is distinct from 19.90::numeric
        or old_terms#>>'{discount,type}' is distinct from 'fixed'
        or (old_terms#>>'{penalty,value}')::numeric is distinct from 2::numeric
        or old_terms#>>'{penalty,type}' is distinct from 'percentage'
        or (old_terms#>>'{interest,value}')::numeric is distinct from 1::numeric
        or old_terms#>>'{interest,type}' is distinct from 'monthly-percentage'
      then raise exception 'CORRECTION_C1_BOUNDED_SHAPE'; end if;
      new_due := (date '2026-10-15'+make_interval(months=>r.parcela_numero-1))::date;
      new_terms := old_terms || jsonb_build_object('dueDate',new_due,
        'discount',(old_terms->'discount')||jsonb_build_object('validUntil',new_due),
        'penalty',(old_terms->'penalty')||jsonb_build_object('startsOn',new_due+1),
        'interest',(old_terms->'interest')||jsonb_build_object('startsOn',new_due+1));
    else
      kind_value := 'CANCEL_C2';
      if run.item_count is distinct from 13 or not (
        (r.tipo_lancamento='PARCELA' and r.parcela_numero between 1 and 12 and r.valor=279.90)
        or (r.tipo_lancamento='REMATRICULA' and r.valor=100)) then
        raise exception 'CORRECTION_C2_BOUNDED_SHAPE';
      end if;
    end if;
  end if;
  return title || jsonb_build_object('kind',kind_value,'run',to_jsonb(run),
    'authorization',auth_snapshot,'oldTerms',old_terms,'correctedDueDate',new_due,'correctedTerms',new_terms);
end $$;

-- All events reuse the existing scoped financial audit. No personal banking data.
create function internal_financial_correction.audit_event(
  p_operation_id uuid,p_receivable_id uuid,p_event text,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare i internal_financial_correction.items%rowtype; o internal_financial_correction.operations%rowtype;
begin
  select * into strict i from internal_financial_correction.items
    where operation_id=p_operation_id and receivable_id=p_receivable_id;
  select * into strict o from internal_financial_correction.operations where id=p_operation_id;
  perform public.registrar_turma_financeiro_auditoria(i.matricula_id,
    'T46_BOUNDED_'||p_event,jsonb_build_object('operationId',o.id,'receivableId',i.receivable_id,
      'planFingerprint',o.plan_fingerprint,'actorId',o.actor_id,'kind',i.kind,
      'executionActorKind','SERVICE_MAINTENANCE','details',p_details),
    'Correção financeira limitada, com evidência e aprovação imutáveis.');
end $$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
