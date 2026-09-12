begin;

create function public.proesc_link_obligation_service(
  p_actor_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_replay jsonb;
  v_receivable public.contas_receber%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_parent internal_proesc.obligation_links%rowtype;
  v_account uuid;
  v_before jsonb;
  v_kind text := coalesce(p_payload ->> 'kind', 'ORIGINAL');
begin
  v_replay := internal_proesc.begin_financial_request('LINK', p_actor_id, p_request_id, p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce((p_payload -> 'source' ->> 'unitId' ~ '^[0-9]+$'
    and p_payload -> 'source' ->> 'classId' ~ '^[0-9]+$'
    and p_payload -> 'source' ->> 'key' ~ '^[0-9]+$'
    and p_payload ->> 'expectedBefore' ~ '^[0-9a-f]{64}$'
    and v_kind in ('ORIGINAL', 'RESIDUAL')), false)
    or (p_payload ? 'autoEnabled' and jsonb_typeof(p_payload -> 'autoEnabled') <> 'boolean') then
    raise exception 'Vínculo Proesc inválido.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('proesc:obligation:' || (p_payload -> 'source')::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || (p_payload ->> 'matriculaId'), 0));
  select * into strict v_receivable from public.contas_receber
  where id = (p_payload ->> 'receivableId')::uuid for update;
  perform internal_proesc.assert_historical_receivable(v_receivable);
  if v_receivable.matricula_id is distinct from (p_payload ->> 'matriculaId')::uuid
    or internal_proesc.receivable_fingerprint(v_receivable) is distinct from p_payload ->> 'expectedBefore'
  then raise exception 'Recebível alterado; refaça a conferência.' using errcode = '40001'; end if;
  if v_kind = 'RESIDUAL' then
    select * into strict v_parent from internal_proesc.obligation_links
    where id = (p_payload ->> 'parentLinkId')::uuid;
    if v_parent.matricula_id <> v_receivable.matricula_id
      or v_parent.turma_id <> v_receivable.turma_id
      or v_parent.source_unit_id <> p_payload -> 'source' ->> 'unitId'
      or v_parent.source_class_id <> p_payload -> 'source' ->> 'classId'
      or v_parent.receivable_id = v_receivable.id then
      raise exception 'Residual exige obrigação-pai da mesma matrícula e origem.' using errcode = '22023'; end if;
  elsif nullif(p_payload ->> 'parentLinkId', '') is not null then
    raise exception 'Obrigação original não pode informar residual-pai.' using errcode = '22023';
  end if;
  if exists (select 1 from internal_academic.technical_external_cycle_evidence e
    where e.receivable_id = v_receivable.id and (
      e.source_unit_id <> p_payload -> 'source' ->> 'unitId'
      or e.source_class_id <> p_payload -> 'source' ->> 'classId'
      or e.source_key <> p_payload -> 'source' ->> 'key')) then
    raise exception 'Identidade conflita com a cobertura externa já comprovada.' using errcode = '40001'; end if;
  select * into v_link from internal_proesc.obligation_links
  where receivable_id = v_receivable.id for update;
  if found then
    if v_link.source_unit_id <> p_payload -> 'source' ->> 'unitId'
      or v_link.source_class_id <> p_payload -> 'source' ->> 'classId'
      or v_link.source_key <> p_payload -> 'source' ->> 'key'
      or v_link.kind <> v_kind or v_link.parent_link_id is distinct from v_parent.id then
      raise exception 'Vínculo existente não pode ser redirecionado.' using errcode = '40001'; end if;
    update internal_proesc.obligation_links set auto_enabled = coalesce((p_payload ->> 'autoEnabled')::boolean, false)
    where id = v_link.id;
  else
    insert into internal_proesc.obligation_links(matricula_id, turma_id, receivable_id,
      source_unit_id, source_class_id, source_key, kind, parent_link_id, auto_enabled, confirmed_by)
    values (v_receivable.matricula_id, v_receivable.turma_id, v_receivable.id,
      p_payload -> 'source' ->> 'unitId', p_payload -> 'source' ->> 'classId',
      p_payload -> 'source' ->> 'key', v_kind, v_parent.id,
      coalesce((p_payload ->> 'autoEnabled')::boolean, false), p_actor_id) returning * into v_link;
  end if;
  v_before := to_jsonb(v_receivable);
  v_account := internal_proesc.shared_account(v_receivable.polo_id);
  if v_receivable.conta_bancaria_id is distinct from v_account then
    update public.contas_receber set conta_bancaria_id = v_account, updated_at = now()
    where id = v_receivable.id returning * into v_receivable;
  end if;
  insert into internal_proesc.reconciliation_events(request_id, link_id, mode, result, before_state, after_state)
  values (p_request_id, v_link.id, 'LINK', 'LINKED', v_before, to_jsonb(v_receivable));
  return internal_proesc.finish_financial_request(p_request_id, jsonb_build_object(
    'linkId', v_link.id, 'result', 'LINKED', 'currentBefore', internal_proesc.receivable_fingerprint(v_receivable)));
end;
$$;

create function public.proesc_record_financial_snapshot_service(
  p_actor_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_replay jsonb;
  v_link internal_proesc.obligation_links%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_snapshot internal_proesc.financial_snapshots%rowtype;
  v_components jsonb := jsonb_build_object('interestCents', null, 'penaltyCents', null,
    'discountCents', null, 'additionCents', null) || coalesce(p_payload -> 'components', '{}'::jsonb);
  v_lines jsonb := coalesce(p_payload -> 'lines', '[]'::jsonb);
  v_verification text := p_payload ->> 'verification';
  v_reasons jsonb := '[]'::jsonb;
  v_principal bigint;
  v_received bigint;
  v_date date;
  v_observed timestamptz;
  v_count integer;
  v_evidence text := case when p_payload ->> 'evidenceKind' = 'NORMALIZER_PAYMENT_TOTAL'
    then 'API_PAYMENT_TOTAL' else p_payload ->> 'evidenceKind' end;
begin
  v_replay := internal_proesc.begin_financial_request('SNAPSHOT', p_actor_id, p_request_id, p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce((p_payload ->> 'sourceFingerprint' ~ '^[0-9a-f]{64}$'
    and p_payload ->> 'principalCents' ~ '^[0-9]+$'
    and p_payload ->> 'sourceStatus' in ('OPEN', 'PAID', 'CANCELED', 'UNKNOWN')
    and v_verification in ('VERIFIED', 'REVIEW')
    and v_evidence in ('API_SINGLE_PAYMENT', 'API_PAYMENT_TOTAL', 'PORTAL_CONFIRMED', 'UNRESOLVED')), false)
    or jsonb_typeof(v_components) <> 'object' or jsonb_typeof(v_lines) <> 'array' then
    raise exception 'Snapshot financeiro Proesc inválido.' using errcode = '22023'; end if;
  if jsonb_array_length(v_lines) > 200 then raise exception 'Snapshot excedeu limite de linhas.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each(v_components) entry where entry.key not in
    ('interestCents', 'penaltyCents', 'discountCents', 'additionCents') or not (
      entry.value = 'null'::jsonb or (jsonb_typeof(entry.value) = 'number' and entry.value::text ~ '^[0-9]+$')))
    or exists (select 1 from jsonb_array_elements(v_lines) line where not coalesce((
      jsonb_typeof(line) = 'object' and line ->> 'blockCode' ~ '^[0-9]+$'
      and line ->> 'amountCents' ~ '^[0-9]+$' and jsonb_typeof(line -> 'cancelled') = 'boolean'), false))
  then raise exception 'Componentes/linhas devem preservar valores explícitos, sem inferência.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) line,
    lateral jsonb_object_keys(line) key where key not in
      ('blockCode','amountCents','paymentDate','cancelled','renegotiation','paymentMethod','sourceMonth','sourceYear')) then
    raise exception 'Linha contábil contém campo fora do contrato privado.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) line where
    (line ? 'renegotiation' and jsonb_typeof(line -> 'renegotiation') <> 'boolean')
    or (line ? 'paymentMethod' and line -> 'paymentMethod' <> 'null'::jsonb
      and (jsonb_typeof(line -> 'paymentMethod') <> 'string' or length(line ->> 'paymentMethod') > 80))
    or (line ? 'sourceMonth' and not coalesce(line ->> 'sourceMonth' ~ '^([1-9]|1[0-2])$', false))
    or (line ? 'sourceYear' and not coalesce(line ->> 'sourceYear' ~ '^20[0-9]{2}$', false))) then
    raise exception 'Proveniência mensal ou forma de pagamento inválida.' using errcode = '22023'; end if;
  v_principal := (p_payload ->> 'principalCents')::bigint;
  v_received := (p_payload ->> 'receivedCents')::bigint;
  v_date := (p_payload ->> 'paymentDate')::date;
  v_observed := (p_payload ->> 'observedAt')::timestamptz;
  if v_observed is null or not isfinite(v_observed) or v_observed > now() + interval '5 minutes'
    or v_principal <= 0 or v_received < 0 or (v_date is not null and not isfinite(v_date)) then
    raise exception 'Valores ou data de observação inválidos.' using errcode = '22023'; end if;
  select * into strict v_link from internal_proesc.obligation_links
  where id = (p_payload ->> 'linkId')::uuid for update;
  select * into strict v_receivable from public.contas_receber where id = v_link.receivable_id;
  perform internal_proesc.assert_historical_receivable(v_receivable);
  if v_principal <> round(v_receivable.valor * 100)::bigint then v_reasons := v_reasons || '"PRINCIPAL_DIVERGENTE"'::jsonb; end if;
  if p_payload ->> 'sourceStatus' in ('CANCELED', 'UNKNOWN')
    or exists (select 1 from jsonb_array_elements(v_lines) line
      where line -> 'cancelled' = 'true'::jsonb or line -> 'renegotiation' = 'true'::jsonb)
  then v_reasons := v_reasons || '"ESTADO_REQUER_REVISAO"'::jsonb; end if;
  if p_payload ->> 'sourceStatus' = 'PAID' and (v_received is null or v_received <= 0 or v_date is null
    or v_date > (timezone('America/Maceio', now()))::date) then
    v_reasons := v_reasons || '"PAGAMENTO_INCOMPLETO"'::jsonb;
  end if;
  if v_evidence in ('API_SINGLE_PAYMENT', 'API_PAYMENT_TOTAL') then
    select count(*) into v_count from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '2';
    if v_count = 0 or (v_evidence = 'API_SINGLE_PAYMENT' and v_count <> 1) then
      v_reasons := v_reasons || '"MULTIPLICIDADE_OU_AUSENCIA_PAGAMENTO"'::jsonb; end if;
    if not exists (select 1 from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '1')
      or exists (select 1 from jsonb_array_elements(v_lines) line
        where line ->> 'blockCode' = '1' and (line ->> 'amountCents')::bigint <> v_principal)
    then v_reasons := v_reasons || '"PRINCIPAL_NAO_CONFIRMADO"'::jsonb; end if;
    -- Block 2 is a multiset: repeated card installments are separate receipts.
    -- The collector must select each observation month once, never dedup lines.
    if (select sum((line ->> 'amountCents')::bigint) from jsonb_array_elements(v_lines) line
      where line ->> 'blockCode' = '2') is distinct from v_received
      or exists (select 1 from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '2'
        and (line ->> 'paymentDate')::date is distinct from v_date)
    then v_reasons := v_reasons || '"PAGAMENTO_NAO_CONFIRMADO"'::jsonb; end if;
    if v_components -> 'discountCents' <> 'null'::jsonb or v_components -> 'additionCents' <> 'null'::jsonb
      or (v_components -> 'interestCents' <> 'null'::jsonb and (
        (select count(*) from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '3') <> 1
        or not exists (select 1 from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '3'
          and line ->> 'amountCents' = v_components ->> 'interestCents')))
      or (v_components -> 'penaltyCents' <> 'null'::jsonb and (
        (select count(*) from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '4') <> 1
        or not exists (select 1 from jsonb_array_elements(v_lines) line where line ->> 'blockCode' = '4'
          and line ->> 'amountCents' = v_components ->> 'penaltyCents')))
    then v_reasons := v_reasons || '"COMPONENTES_NAO_COMPROVADOS"'::jsonb; end if;
  elsif v_evidence = 'UNRESOLVED' then
    v_reasons := v_reasons || '"SEM_CONFIRMACAO"'::jsonb;
  end if;
  if v_verification = 'REVIEW' or jsonb_array_length(v_reasons) > 0 then v_verification := 'REVIEW'; end if;
  select * into v_snapshot from internal_proesc.financial_snapshots
  where link_id = v_link.id and source_fingerprint = p_payload ->> 'sourceFingerprint'
    and observed_at = v_observed;
  if found then
    if (v_snapshot.principal_cents, v_snapshot.received_cents, v_snapshot.payment_date,
      v_snapshot.source_status, v_snapshot.verification, v_snapshot.evidence_kind,
      v_snapshot.components, v_snapshot.accounting_lines)
      is distinct from (v_principal, v_received, v_date, p_payload ->> 'sourceStatus',
        v_verification, v_evidence, v_components, v_lines) then
      raise exception 'Fingerprint de origem reutilizado com evidência diferente.' using errcode = '40001'; end if;
  else
    insert into internal_proesc.financial_snapshots(link_id, observed_at, source_fingerprint,
      principal_cents, received_cents, payment_date, source_status, verification,
      evidence_kind, components, accounting_lines, review_reasons, recorded_by)
    values (v_link.id, v_observed, p_payload ->> 'sourceFingerprint', v_principal, v_received,
      v_date, p_payload ->> 'sourceStatus', v_verification, v_evidence,
      v_components, v_lines, v_reasons, p_actor_id) returning * into v_snapshot;
  end if;
  return internal_proesc.finish_financial_request(p_request_id, jsonb_build_object(
    'snapshotId', v_snapshot.id, 'verification', v_snapshot.verification, 'reviewReasons', v_snapshot.review_reasons,
    'currentBefore', internal_proesc.receivable_fingerprint(v_receivable)));
end;
$$;

revoke all on function public.proesc_link_obligation_service(uuid, uuid, jsonb),
  public.proesc_record_financial_snapshot_service(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.proesc_link_obligation_service(uuid, uuid, jsonb),
  public.proesc_record_financial_snapshot_service(uuid, uuid, jsonb) to service_role;
commit;
