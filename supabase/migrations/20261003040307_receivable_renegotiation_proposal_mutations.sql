begin;

create function public.save_receivable_renegotiation_proposal_secure(
  p_request_id uuid,
  p_receivable_ids uuid[],
  p_expected_proposal_fingerprint text,
  p_terms jsonb default '{}'::jsonb,
  p_policy_overrides jsonb default '{}'::jsonb,
  p_as_of date default null,
  p_submit boolean default true,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_today date := (now() at time zone 'America/Maceio')::date;
  v_as_of date := coalesce(p_as_of, (now() at time zone 'America/Maceio')::date);
  v_terms jsonb := coalesce(p_terms, '{}'::jsonb);
  v_overrides jsonb := coalesce(p_policy_overrides, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ids uuid[];
  v_snapshot_ids uuid[];
  v_source_count integer;
  v_scope_count integer := 0;
  v_scope_polo uuid;
  v_polo_id uuid;
  v_company_id uuid;
  v_aluno_id uuid;
  v_matricula_id uuid;
  v_turma_id uuid;
  v_snapshot jsonb;
  v_items jsonb;
  v_proposal_fingerprint text;
  v_payload jsonb;
  v_payload_hash text;
  v_replay public.receivable_renegotiation_requests%rowtype;
  v_agreement_id uuid;
  v_lifecycle text := case when coalesce(p_submit, true) then 'PROPOSED' else 'DRAFT' end;
  v_principal_cents bigint;
  v_open_cents bigint;
  v_negotiated_cents bigint;
  v_installment_count integer;
  v_first_due_date date;
  v_result jsonb;
  v_constraint_name text;
begin
  select array_agg(id order by id) into v_ids
  from (select distinct id from unnest(p_receivable_ids) id where id is not null) normalized;
  if p_request_id is null or coalesce(cardinality(v_ids), 0) < 1
    or cardinality(v_ids) > 120
    or p_expected_proposal_fingerprint is null
    or p_expected_proposal_fingerprint !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(v_terms) is distinct from 'object'
    or jsonb_typeof(v_overrides) is distinct from 'object'
    or p_submit is null
    or length(coalesce(v_reason, '')) > 1000
    or v_as_of is null or not isfinite(v_as_of) then
    raise exception 'Payload da proposta de renegociação inválido.' using errcode = '22023';
  end if;
  perform internal_finance.assert_receivable_renegotiation_identity();

  select count(*) into v_source_count
  from public.contas_receber receivable where receivable.id = any(v_ids);
  if v_source_count <> cardinality(v_ids)
    or exists (select 1 from public.contas_receber receivable
      where receivable.id = any(v_ids) and receivable.polo_id is null) then
    raise exception 'Seleção de parcelas inválida ou incompleta.' using errcode = '23514';
  end if;
  for v_scope_polo in
    select distinct receivable.polo_id from public.contas_receber receivable
    where receivable.id = any(v_ids) order by receivable.polo_id
  loop
    perform internal_finance.assert_receivable_renegotiation_scope(v_scope_polo);
    v_scope_count := v_scope_count + 1;
    v_polo_id := v_scope_polo;
  end loop;
  if v_scope_count <> 1 then
    raise exception 'Todas as parcelas devem pertencer ao mesmo polo.' using errcode = '23514';
  end if;

  v_payload := jsonb_build_object(
    'receivableIds', to_jsonb(v_ids),
    'expectedProposalFingerprint', p_expected_proposal_fingerprint,
    'terms', v_terms,
    'policyOverrides', v_overrides,
    'asOf', v_as_of,
    'submit', p_submit,
    'reason', v_reason
  );
  v_payload_hash := encode(
    extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  select * into v_replay from public.receivable_renegotiation_requests
  where request_id = p_request_id for update;
  if found then
    if v_replay.operation <> 'SAVE_PROPOSAL'
      or v_replay.actor_id is distinct from auth.uid()
      or v_replay.polo_id is distinct from v_polo_id
      or v_replay.payload_hash <> v_payload_hash then
      raise exception 'Chave de idempotência reutilizada com outro payload.'
        using errcode = '22023';
    end if;
    return jsonb_set(v_replay.result, '{replayed}', 'true'::jsonb, true);
  end if;

  -- A mudança do dia não invalida replay já autorizado e de payload idêntico.
  -- Apenas propostas novas devem ser calculadas pela data-base pública atual.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and v_as_of <> v_today then
    raise exception 'A data-base pública deve ser a data atual.' using errcode = '22023';
  end if;

  if to_regprocedure(
    'internal_finance.build_receivable_renegotiation_snapshot(uuid[],jsonb,jsonb,date)'
  ) is null then
    raise exception 'As regras de renegociação ainda não estão disponíveis.'
      using errcode = '55000';
  end if;

  perform receivable.id from public.contas_receber receivable
  where receivable.id = any(v_ids) order by receivable.id for update;
  execute
    'select internal_finance.build_receivable_renegotiation_snapshot($1,$2,$3,$4)'
    into v_snapshot using v_ids, v_terms, v_overrides, v_as_of;

  if jsonb_typeof(v_snapshot) is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'identity') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'sourceItems') is distinct from 'array'
    or jsonb_typeof(v_snapshot -> 'policySnapshot') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'calculationSnapshot') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'terms') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'policyOverrides') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'totals') is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'schedule') is distinct from 'object'
    or jsonb_typeof(v_snapshot #> '{schedule,entries}') is distinct from 'array'
    or jsonb_typeof(v_snapshot -> 'requiresApproval') is distinct from 'boolean'
    or jsonb_typeof(v_snapshot -> 'approvalReasons') is distinct from 'array' then
    raise exception 'Snapshot canônico de renegociação inválido.' using errcode = '55000';
  end if;
  v_items := v_snapshot -> 'sourceItems';
  v_proposal_fingerprint := v_snapshot ->> 'proposalFingerprint';
  if v_proposal_fingerprint is null
    or v_proposal_fingerprint !~ '^[0-9a-f]{64}$'
    or v_snapshot ->> 'selectionFingerprint' !~ '^[0-9a-f]{64}$'
    or v_snapshot ->> 'policyFingerprint' !~ '^[0-9a-f]{64}$'
    or v_snapshot ->> 'calculationFingerprint' !~ '^[0-9a-f]{64}$'
    or (v_snapshot ->> 'asOf')::date is distinct from v_as_of then
    raise exception 'Snapshot canônico de renegociação incompleto.' using errcode = '55000';
  end if;
  if v_proposal_fingerprint <> p_expected_proposal_fingerprint then
    raise exception 'RENEGOTIATION_PREVIEW_STALE' using errcode = '40001';
  end if;
  if v_lifecycle = 'PROPOSED'
    and (v_snapshot ->> 'requiresApproval')::boolean
    and v_reason is null then
    raise exception 'RENEGOTIATION_JUSTIFICATION_REQUIRED' using errcode = '22023';
  end if;

  select array_agg(distinct (item ->> 'receivableId')::uuid
    order by (item ->> 'receivableId')::uuid),
    coalesce(sum((item ->> 'principalCents')::bigint), 0),
    coalesce(sum((item ->> 'openAmountCents')::bigint), 0)
  into v_snapshot_ids, v_principal_cents, v_open_cents
  from jsonb_array_elements(v_items) item;
  if v_snapshot_ids is distinct from v_ids
    or jsonb_array_length(v_items) <> cardinality(v_ids)
    or exists (select 1 from jsonb_array_elements(v_items) item
      where jsonb_typeof(item) <> 'object'
        or coalesce(item ->> 'status', '') = ''
        or coalesce(item ->> 'sourceFingerprint', '') !~ '^[0-9a-f]{64}$'
        or coalesce(item ->> 'principalCents', '') !~ '^[0-9]+$'
        or coalesce(item ->> 'openAmountCents', '') !~ '^[0-9]+$') then
    raise exception 'Itens do snapshot canônico não correspondem à seleção.'
      using errcode = '55000';
  end if;

  v_polo_id := nullif(v_snapshot #>> '{identity,poloId}', '')::uuid;
  v_aluno_id := nullif(v_snapshot #>> '{identity,alunoId}', '')::uuid;
  v_matricula_id := nullif(v_snapshot #>> '{identity,matriculaId}', '')::uuid;
  v_turma_id := nullif(v_snapshot #>> '{identity,turmaId}', '')::uuid;
  v_negotiated_cents := (v_snapshot #>> '{totals,negotiatedCents}')::bigint;
  v_installment_count := (v_snapshot #>> '{schedule,installmentCount}')::integer;
  v_first_due_date := nullif(v_snapshot #>> '{schedule,firstDueDate}', '')::date;
  if v_polo_id is null or v_aluno_id is null or v_matricula_id is null or v_turma_id is null
    or v_negotiated_cents is null or v_negotiated_cents < 0
    or v_installment_count is null or v_installment_count < 0 then
    raise exception 'Identidade ou totais do snapshot canônico inválidos.' using errcode = '55000';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_polo_id);
  if v_polo_id is distinct from v_scope_polo then
    raise exception 'O snapshot alterou o polo da seleção.' using errcode = '55000';
  end if;
  select polo.company_id into v_company_id from public.polos polo
  where polo.id = v_polo_id;
  if v_company_id is null then
    raise exception 'Polo da proposta não encontrado.' using errcode = '23514';
  end if;

  begin
    insert into public.receivable_renegotiation_agreements (
      company_id, polo_id, aluno_id, matricula_id, turma_id, lifecycle_status,
      as_of, source_count, source_principal_cents, source_open_cents,
      negotiated_cents, installment_count, first_due_date,
      selection_fingerprint, policy_fingerprint, calculation_fingerprint,
      proposal_fingerprint, policy_snapshot, calculation_snapshot,
      canonical_snapshot, reason, created_by, submitted_at
    ) values (
      v_company_id, v_polo_id, v_aluno_id, v_matricula_id, v_turma_id, v_lifecycle,
      v_as_of, cardinality(v_ids), v_principal_cents, v_open_cents,
      v_negotiated_cents, v_installment_count, v_first_due_date,
      v_snapshot ->> 'selectionFingerprint', v_snapshot ->> 'policyFingerprint',
      v_snapshot ->> 'calculationFingerprint', v_proposal_fingerprint,
      v_snapshot -> 'policySnapshot', v_snapshot -> 'calculationSnapshot',
      v_snapshot, v_reason, auth.uid(),
      case when v_lifecycle = 'PROPOSED' then now() else null end
    ) returning id into v_agreement_id;

    insert into public.receivable_renegotiation_source_items (
      agreement_id, polo_id, position, receivable_id, source_status, due_date,
      principal_cents, open_amount_cents, source_fingerprint, source_snapshot
    )
    select v_agreement_id, v_polo_id, ordinal::integer,
      (item ->> 'receivableId')::uuid, item ->> 'status',
      (item ->> 'dueDate')::date, (item ->> 'principalCents')::bigint,
      (item ->> 'openAmountCents')::bigint, item ->> 'sourceFingerprint', item
    from jsonb_array_elements(v_items) with ordinality source(item, ordinal)
    order by ordinal;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'receivable_renegotiation_source_active_uidx' then
      raise exception 'RENEGOTIATION_SOURCE_ALREADY_LINKED' using errcode = '40001';
    end if;
    raise;
  end;

  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    v_agreement_id, v_polo_id,
    case when v_lifecycle = 'PROPOSED' then 'PROPOSAL_SUBMITTED'
      else 'PROPOSAL_DRAFTED' end,
    null, v_lifecycle, 1, auth.uid(), p_request_id, v_payload_hash,
    jsonb_build_object('proposalFingerprint', v_proposal_fingerprint,
      'sourceCount', cardinality(v_ids))
  );
  v_result := jsonb_build_object(
    'replayed', false,
    'proposal', internal_finance.receivable_renegotiation_proposal_json(v_agreement_id)
  );
  insert into public.receivable_renegotiation_requests (
    request_id, agreement_id, polo_id, operation, actor_id, payload_hash, result
  ) values (
    p_request_id, v_agreement_id, v_polo_id, 'SAVE_PROPOSAL',
    auth.uid(), v_payload_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.discard_receivable_renegotiation_proposal_secure(
  p_request_id uuid,
  p_agreement_id uuid,
  p_expected_version bigint,
  p_expected_fingerprint text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload jsonb;
  v_payload_hash text;
  v_replay public.receivable_renegotiation_requests%rowtype;
  v_result jsonb;
begin
  if p_request_id is null or p_agreement_id is null or p_expected_version is null
    or p_expected_version < 1 or p_expected_fingerprint is null
    or p_expected_fingerprint !~ '^[0-9a-f]{64}$'
    or v_reason is null or length(v_reason) > 1000 then
    raise exception 'Payload para descartar proposta inválido.' using errcode = '22023';
  end if;
  perform internal_finance.assert_receivable_renegotiation_identity();
  select * into v_agreement from public.receivable_renegotiation_agreements
  where id = p_agreement_id for update;
  if not found then
    raise exception 'Proposta de renegociação não encontrada.' using errcode = 'P0002';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_agreement.polo_id);

  v_payload := jsonb_build_object(
    'agreementId', p_agreement_id,
    'expectedVersion', p_expected_version,
    'expectedFingerprint', p_expected_fingerprint,
    'reason', v_reason
  );
  v_payload_hash := encode(
    extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  select * into v_replay from public.receivable_renegotiation_requests
  where request_id = p_request_id for update;
  if found then
    if v_replay.operation <> 'DISCARD_PROPOSAL'
      or v_replay.actor_id is distinct from auth.uid()
      or v_replay.agreement_id is distinct from p_agreement_id
      or v_replay.polo_id is distinct from v_agreement.polo_id
      or v_replay.payload_hash <> v_payload_hash then
      raise exception 'Chave de idempotência reutilizada com outro payload.'
        using errcode = '22023';
    end if;
    return jsonb_set(v_replay.result, '{replayed}', 'true'::jsonb, true);
  end if;
  if v_agreement.version is distinct from p_expected_version
    or v_agreement.proposal_fingerprint <> p_expected_fingerprint then
    raise exception 'RENEGOTIATION_PROPOSAL_STALE' using errcode = '40001';
  end if;
  if v_agreement.lifecycle_status not in ('DRAFT', 'PROPOSED') then
    raise exception 'Somente proposta em aberto pode ser descartada.' using errcode = '55000';
  end if;

  update public.receivable_renegotiation_agreements set
    lifecycle_status = 'CANCELED', version = version + 1,
    canceled_at = now(), canceled_by = auth.uid(), canceled_reason = v_reason,
    updated_at = now()
  where id = p_agreement_id
  returning * into v_agreement;
  update public.receivable_renegotiation_source_items
  set released_at = now()
  where agreement_id = p_agreement_id and released_at is null;
  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    p_agreement_id, v_agreement.polo_id, 'PROPOSAL_CANCELED',
    case when v_agreement.submitted_at is null then 'DRAFT' else 'PROPOSED' end,
    'CANCELED', v_agreement.version, auth.uid(), p_request_id, v_payload_hash,
    jsonb_build_object('reason', v_reason, 'sourceTitlesChanged', false)
  );
  v_result := jsonb_build_object(
    'replayed', false,
    'proposal', internal_finance.receivable_renegotiation_proposal_json(p_agreement_id)
  );
  insert into public.receivable_renegotiation_requests (
    request_id, agreement_id, polo_id, operation, actor_id, payload_hash, result
  ) values (
    p_request_id, p_agreement_id, v_agreement.polo_id, 'DISCARD_PROPOSAL',
    auth.uid(), v_payload_hash, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.save_receivable_renegotiation_proposal_secure(
  uuid, uuid[], text, jsonb, jsonb, date, boolean, text
), public.discard_receivable_renegotiation_proposal_secure(
  uuid, uuid, bigint, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_receivable_renegotiation_proposal_secure(
  uuid, uuid[], text, jsonb, jsonb, date, boolean, text
), public.discard_receivable_renegotiation_proposal_secure(
  uuid, uuid, bigint, text, text
) to authenticated, service_role;

comment on function public.save_receivable_renegotiation_proposal_secure(
  uuid, uuid[], text, jsonb, jsonb, date, boolean, text
) is 'Recalcula e salva somente uma proposta; não altera títulos, saldo ou cobrança bancária.';
comment on function public.discard_receivable_renegotiation_proposal_secure(
  uuid, uuid, bigint, text, text
) is 'Descarta a proposta e libera sua exclusividade técnica; não cancela parcelas de origem.';

notify pgrst, 'reload schema';
commit;
