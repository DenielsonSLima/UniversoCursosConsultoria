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
  select * into v_snapshot from internal_proesc.financial_observation_history
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

CREATE OR REPLACE FUNCTION public.proesc_apply_financial_snapshot_service(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
  select * into strict v_snapshot from internal_proesc.financial_observation_history
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
  perform internal_proesc.rehydrate_financial_snapshot(v_snapshot);
  insert into internal_proesc.reconciliation_events(request_id, link_id, snapshot_id, mode, result, before_state, after_state)
  values (p_request_id, v_link.id, v_snapshot.id, v_mode, v_result,
    case when v_mode = 'AUTO' and v_result = 'UNCHANGED'
      and v_before = to_jsonb(v_receivable) then null else v_before end,
    case when v_mode = 'AUTO' and v_result = 'UNCHANGED'
      and v_before = to_jsonb(v_receivable)
      then internal_proesc.compact_unchanged_state(v_before)
      else to_jsonb(v_receivable) end);
  return internal_proesc.finish_financial_request(p_request_id, jsonb_build_object(
    'result', v_result, 'reviewReason', v_reason, 'receivableId', v_receivable.id,
    'currentBefore', internal_proesc.receivable_fingerprint(v_receivable)));
end;
$function$;


CREATE OR REPLACE FUNCTION public.proesc_finalize_enrollment_financial_service(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  v_replay jsonb; v_matricula uuid:=(p_payload->>'matriculaId')::uuid;
  v_scope internal_proesc.class_scopes%rowtype;
  v_enrollment public.matriculas%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_snapshot internal_proesc.financial_snapshots%rowtype;
  v_import internal_proesc.obligation_imports%rowtype;
  v_item jsonb; v_items jsonb:=p_payload->'obligations';
  v_principal bigint:=0; v_received bigint:=0; v_count integer:=0;
  v_tuition integer:=0; v_fee integer:=0; v_other integer:=0; v_unclassified integer:=0;
  v_before jsonb; v_protected boolean;
begin
  v_replay:=internal_proesc.begin_financial_request('FINALIZE',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  if p_payload->'completeObligationSetConfirmed' is distinct from 'true'::jsonb
    or not coalesce(p_payload->>'sourceManifestHash' ~ '^[0-9a-f]{64}$'
      and p_payload->>'expectedEnrollmentBefore' ~ '^[0-9a-f]{64}$'
      and p_payload->>'expectedPrincipalCents' ~ '^[1-9][0-9]*$'
      and p_payload->>'expectedReceivedCents' ~ '^[0-9]+$'
      and p_payload->>'expectedTuitionCount' ~ '^[0-9]+$'
      and p_payload->>'expectedReenrollmentCount' ~ '^[0-9]+$'
      and p_payload->>'expectedOtherCount' ~ '^[0-9]+$'
      and p_payload->>'expectedUnclassifiedCount' ~ '^[0-9]+$',false)
    or jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'Fechamento exige manifesto completo e totais conferidos.' using errcode='22023'; end if;
  if jsonb_array_length(v_items) not between 1 and 500
    or exists (select 1 from jsonb_array_elements(v_items) i where not coalesce(
      i->>'key' ~ '^[1-9][0-9]*$' and i->>'expectedBefore' ~ '^[0-9a-f]{64}$'
      and i->>'snapshotId' ~ '^[0-9a-fA-F-]{36}$',false))
    or (select count(distinct i->>'key') from jsonb_array_elements(v_items) i)<>jsonb_array_length(v_items) then
    raise exception 'Conjunto de obrigações inválido ou duplicado.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||v_matricula::text,0));
  select * into strict v_enrollment from public.matriculas where id=v_matricula;
  perform 1 from public.turmas where id=v_enrollment.turma_id for update;
  select * into strict v_enrollment from public.matriculas where id=v_matricula for update;
  select * into strict v_scope from internal_proesc.class_scopes where turma_id=v_enrollment.turma_id for update;
  if v_scope.phase<>'CONFIRMED' or v_scope.batch_id is null then
    raise exception 'Fechamento restrito às novas turmas confirmadas.' using errcode='42501'; end if;
  perform 1 from public.parceiros where id=v_enrollment.aluno_id for share;
  select to_jsonb(e) into strict v_before from internal_proesc.enrollment_sources e
    where matricula_id=v_matricula and scope_id=v_scope.id for update;
  if internal_proesc.enrollment_import_fingerprint(v_matricula) is distinct from p_payload->>'expectedEnrollmentBefore' then
    raise exception 'Identidade acadêmica mudou após a conferência.' using errcode='40001'; end if;
  if (select count(*) from internal_proesc.obligation_links where matricula_id=v_matricula)<>jsonb_array_length(v_items)
    or exists (select 1 from public.contas_receber c where c.matricula_id=v_matricula
      and c.origem_pagamento='SISTEMA_ANTERIOR' and not exists (
        select 1 from internal_proesc.obligation_links l where l.receivable_id=c.id)) then
    raise exception 'Há obrigação omitida ou recebível histórico sem vínculo.' using errcode='40001'; end if;
  for v_item in select value from jsonb_array_elements(v_items) order by value->>'key' loop
    select * into strict v_link from internal_proesc.obligation_links where matricula_id=v_matricula
      and source_unit_id=v_scope.source_unit_id and source_class_id=v_scope.source_class_id
      and source_key=v_item->>'key' for update;
    select * into strict v_import from internal_proesc.obligation_imports where link_id=v_link.id;
    select * into strict v_receivable from public.contas_receber where id=v_link.receivable_id for update;
    perform internal_proesc.assert_historical_receivable(v_receivable);
    if internal_proesc.receivable_fingerprint(v_receivable) is distinct from v_item->>'expectedBefore'
      or v_import.scope_id<>v_scope.id or v_import.source_person_hash<>internal_proesc.person_document_hash(v_enrollment.aluno_id) then
      raise exception 'Identidade de obrigação requer revisão individual.' using errcode='40001'; end if;
    -- Financial closure checks recorded obligations, not contract-cycle eligibility.
    select * into strict v_snapshot from internal_proesc.financial_observation_history
      where id=(v_item->>'snapshotId')::uuid and link_id=v_link.id;
    if v_snapshot.verification<>'VERIFIED' or v_snapshot.source_status not in ('OPEN','PAID')
      or v_snapshot.principal_cents<>round(v_receivable.valor*100)::bigint
      or exists (select 1 from internal_proesc.financial_snapshots newer
        where newer.link_id=v_link.id and (newer.observed_at>v_snapshot.observed_at
          or (newer.observed_at=v_snapshot.observed_at and newer.recorded_at>v_snapshot.recorded_at))) then
      raise exception 'Snapshot não verificado ou superado; refaça a conferência.' using errcode='40001'; end if;
    if v_snapshot.source_status='OPEN' and (v_snapshot.evidence_kind not in ('API_OPEN_OBLIGATION','PORTAL_CONFIRMED')
      or v_receivable.status not in ('PENDENTE','VENCIDO') or coalesce(v_receivable.valor_pago,0)<>0
      or v_receivable.data_pagamento is not null) then
      raise exception 'Obrigação aberta diverge do pagamento local ou da prova completa.' using errcode='40001'; end if;
    if v_snapshot.source_status='PAID' and (v_receivable.status<>'PAGO'
      or round(v_receivable.valor_pago*100)::bigint is distinct from v_snapshot.received_cents
      or v_receivable.data_pagamento is distinct from v_snapshot.payment_date) then
      raise exception 'Pagamento verificado ainda não conciliado.' using errcode='40001'; end if;
    -- Missing cycle/ordinal remains protected by individual coverage UNKNOWN.
    v_count:=v_count+1; v_principal:=v_principal+v_snapshot.principal_cents;
    v_received:=v_received+coalesce(v_snapshot.received_cents,0);
    v_tuition:=v_tuition+case when v_import.obligation_kind='TUITION' then 1 else 0 end;
    v_fee:=v_fee+case when v_import.obligation_kind='REENROLLMENT_FEE' then 1 else 0 end;
    v_other:=v_other+case when v_import.obligation_kind='OTHER_CONFIRMED' then 1 else 0 end;
    v_unclassified:=v_unclassified+case when v_import.obligation_kind='UNRESOLVED' then 1 else 0 end;
  end loop;
  if (v_principal,v_received,v_tuition,v_fee,v_other,v_unclassified) is distinct from
    ((p_payload->>'expectedPrincipalCents')::bigint,(p_payload->>'expectedReceivedCents')::bigint,
      (p_payload->>'expectedTuitionCount')::integer,(p_payload->>'expectedReenrollmentCount')::integer,
      (p_payload->>'expectedOtherCount')::integer,(p_payload->>'expectedUnclassifiedCount')::integer)
    or exists (select 1 from internal_proesc.obligation_imports i join internal_proesc.obligation_links l on l.id=i.link_id
      where l.matricula_id=v_matricula and i.obligation_kind='TUITION' and i.source_ordinal is not null
      group by i.source_cycle,i.source_ordinal having count(*)>1) then
    raise exception 'Totais, categorias ou posições divergem do manifesto.' using errcode='40001'; end if;
  insert into internal_proesc.enrollment_financial_confirmations(request_id,matricula_id,scope_id,source_manifest_hash,
    obligation_count,principal_cents,received_cents,confirmed_snapshots,confirmed_by)
  values(p_request_id,v_matricula,v_scope.id,p_payload->>'sourceManifestHash',v_count,v_principal,v_received,v_items,p_actor_id);
  update internal_proesc.enrollment_sources set financial_review_state='CONFIRMED' where matricula_id=v_matricula;
  update internal_proesc.obligation_links set auto_enabled=true where matricula_id=v_matricula;
  v_protected:=internal_academic.is_technical_manual_cycle_protected(v_matricula);
  insert into internal_proesc.reconciliation_events(request_id,mode,result,before_state,after_state)
  values(p_request_id,'FINALIZE','CONFIRMED',v_before,jsonb_build_object('matriculaId',v_matricula,
    'sourceManifestHash',p_payload->>'sourceManifestHash','obligations',v_count,'principalCents',v_principal,
    'receivedCents',v_received,'localCycleProtected',v_protected));
  return internal_proesc.finish_financial_request(p_request_id,jsonb_build_object('result','CONFIRMED',
    'obligations',v_count,'autoEnabled',true,'localCycleProtected',v_protected));
end;
$function$;
