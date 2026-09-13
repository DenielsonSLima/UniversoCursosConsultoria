begin;

-- Diagnostic metadata only: financial verification and evidence guards stay unchanged.
do $base$
begin
  if md5(pg_get_functiondef('public.proesc_record_financial_snapshot_service(uuid,uuid,jsonb)'::regprocedure))
    <> 'd27f5fe9229847af10bb975de43357a1' then
    raise exception 'Snapshot service changed; rebase before applying diagnostic metadata.';
  end if;
end;
$base$;

create function internal_proesc.collector_review_reason_codes(p_reasons jsonb)
returns jsonb language sql immutable set search_path = '' as $codes$
  select coalesce(jsonb_agg(code order by code), '[]'::jsonb)
  from (
    select distinct item #>> '{}' as code
    from jsonb_array_elements(case when jsonb_typeof(p_reasons) = 'array'
      then p_reasons else '[]'::jsonb end) as source(item)
    where jsonb_typeof(item) = 'string' and item #>> '{}' in (
      'IDENTITY_REQUIRES_REVIEW', 'SOURCE_STATE_REQUIRES_REVIEW',
      'PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD', 'PRINCIPAL_REQUIRES_REVIEW',
      'PAYMENT_OBSERVED_IN_MULTIPLE_PERIODS',
      'NO_PAYMENT_IN_OBSERVED_PERIODS', 'PAYMENTS_ON_MULTIPLE_DATES_REQUIRE_REVIEW',
      'PAYMENT_AMOUNT_EXCEEDS_SAFE_RANGE', 'PAYMENT_REQUIRES_REVIEW'
    )
  ) as recognized;
$codes$;
revoke all on function internal_proesc.collector_review_reason_codes(jsonb)
  from public, anon, authenticated, service_role;

alter table internal_proesc.financial_snapshots
  add column collector_review_reasons jsonb not null default '[]'::jsonb
  check (jsonb_typeof(collector_review_reasons) = 'array');
comment on column internal_proesc.financial_snapshots.collector_review_reasons is
  'Whitelisted collector diagnostics, separate from authoritative database review reasons. Empty historical metadata does not imply absence of a collector issue.';

-- Existing snapshots and replay stay immutable; new snapshots retain sanitized diagnostics.
CREATE OR REPLACE FUNCTION public.proesc_record_financial_snapshot_service(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
  v_open jsonb := p_payload -> 'openEvidence';
  v_evidence text := case when p_payload ->> 'evidenceKind' = 'NORMALIZER_PAYMENT_TOTAL'
    then 'API_PAYMENT_TOTAL' else p_payload ->> 'evidenceKind' end;
begin
  v_replay := internal_proesc.begin_financial_request('SNAPSHOT', p_actor_id, p_request_id, p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce((p_payload ->> 'sourceFingerprint' ~ '^[0-9a-f]{64}$'
    and p_payload ->> 'principalCents' ~ '^[0-9]+$'
    and p_payload ->> 'sourceStatus' in ('OPEN', 'PAID', 'CANCELED', 'UNKNOWN')
    and v_verification in ('VERIFIED', 'REVIEW')
    and v_evidence in ('API_SINGLE_PAYMENT', 'API_PAYMENT_TOTAL', 'PORTAL_CONFIRMED', 'UNRESOLVED', 'API_OPEN_OBLIGATION')), false)
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
  elsif v_evidence = 'API_OPEN_OBLIGATION' then
    if p_payload ->> 'sourceStatus' <> 'OPEN' or v_received is not null or v_date is not null then
      v_reasons := v_reasons || '"ABERTO_COM_PAGAMENTO_INCOERENTE"'::jsonb;
    end if;
    if not internal_proesc.open_obligation_evidence_verified(v_receivable,v_lines,v_open,v_observed) then
      v_reasons := v_reasons || '"HISTORICO_ABERTO_NAO_COMPROVADO"'::jsonb;
    end if;
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
      v_snapshot.components, v_snapshot.accounting_lines, v_snapshot.open_evidence)
      is distinct from (v_principal, v_received, v_date, p_payload ->> 'sourceStatus',
        v_verification, v_evidence, v_components, v_lines, case when v_evidence='API_OPEN_OBLIGATION' then v_open end) then
      raise exception 'Fingerprint de origem reutilizado com evidência diferente.' using errcode = '40001'; end if;
  else
    insert into internal_proesc.financial_snapshots(link_id, observed_at, source_fingerprint,
      principal_cents, received_cents, payment_date, source_status, verification,
      evidence_kind, components, accounting_lines, review_reasons, recorded_by, open_evidence,
      collector_review_reasons)
    values (v_link.id, v_observed, p_payload ->> 'sourceFingerprint', v_principal, v_received,
      v_date, p_payload ->> 'sourceStatus', v_verification, v_evidence,
      v_components, v_lines, v_reasons, p_actor_id,
      case when v_evidence='API_OPEN_OBLIGATION' then v_open end,
      internal_proesc.collector_review_reason_codes(p_payload -> 'reviewReasons')) returning * into v_snapshot;
  end if;
  return internal_proesc.finish_financial_request(p_request_id, jsonb_build_object(
    'snapshotId', v_snapshot.id, 'verification', v_snapshot.verification, 'reviewReasons', v_snapshot.review_reasons,
    'collectorReviewReasons', v_snapshot.collector_review_reasons,
    'currentBefore', internal_proesc.receivable_fingerprint(v_receivable)));
end;
$function$;

-- Transactional contract assertions: failure rolls back this migration.
do $test$
declare
  v_codes jsonb;
begin
  select internal_proesc.collector_review_reason_codes((
    '["PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","NO_PAYMENT_IN_OBSERVED_PERIODS",' ||
    '"PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","untrusted arbitrary text",null,12,{}]'
  )::jsonb) into v_codes;
  if v_codes is distinct from
    '["NO_PAYMENT_IN_OBSERVED_PERIODS","PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD"]'::jsonb then
    raise exception 'Collector diagnostics must be recognized codes, unique and deterministic.';
  end if;

  if internal_proesc.collector_review_reason_codes(null) <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('null') <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('{}') <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('"NO_PAYMENT_IN_OBSERVED_PERIODS"') <> '[]'::jsonb then
    raise exception 'Legacy and non-array diagnostic inputs must remain compatible.';
  end if;

  if jsonb_array_length(internal_proesc.collector_review_reason_codes((
    '["IDENTITY_REQUIRES_REVIEW","SOURCE_STATE_REQUIRES_REVIEW",' ||
    '"PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","PRINCIPAL_REQUIRES_REVIEW",' ||
    '"PAYMENT_OBSERVED_IN_MULTIPLE_PERIODS",' ||
    '"NO_PAYMENT_IN_OBSERVED_PERIODS","PAYMENTS_ON_MULTIPLE_DATES_REQUIRE_REVIEW",' ||
    '"PAYMENT_AMOUNT_EXCEEDS_SAFE_RANGE","PAYMENT_REQUIRES_REVIEW"]'
  )::jsonb)) <> 9 then
    raise exception 'Every current collector reason must survive sanitization.';
  end if;

  if has_function_privilege('anon', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute')
    or has_function_privilege('service_role', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute') then
    raise exception 'Diagnostic sanitizer must stay internal.';
  end if;
end;
$test$;

commit;
