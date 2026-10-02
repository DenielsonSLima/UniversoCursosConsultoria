begin;

-- Explicit portal evidence resolves a single disputed payment. It does not
-- redefine the provider's PARTIAL status, infer composition or contact Proesc.
create table internal_proesc.portal_payment_confirmations (
  request_id uuid primary key references internal_proesc.reconciliation_requests(request_id),
  actor_id uuid not null references public.usuarios_sistema(id),
  link_id uuid not null references internal_proesc.obligation_links(id),
  observation_id uuid not null references internal_proesc.v2_invoice_observations(id),
  snapshot_id uuid not null unique references internal_proesc.financial_snapshots(id),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  payload_hash text not null check(payload_hash=md5(payload::text)),
  evidence_reference text not null check(length(evidence_reference) between 8 and 500),
  approval_reference text not null check(length(approval_reference) between 8 and 200),
  executed_by text not null,
  database_session text not null,
  transaction_id bigint not null,
  recorded_at timestamptz not null default now(),
  response jsonb not null
);
alter table internal_proesc.portal_payment_confirmations enable row level security;
revoke all on internal_proesc.portal_payment_confirmations from public,anon,authenticated,service_role;

create function internal_proesc.confirm_portal_payment(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $confirm$
declare
  v_actor jsonb; v_permissions jsonb;
  v_replay internal_proesc.portal_payment_confirmations;
  v_link internal_proesc.obligation_links; v_receipt public.contas_receber;
  v_pin internal_proesc.v2_enrollment_links; v_observation internal_proesc.v2_invoice_observations;
  v_previous internal_proesc.financial_snapshots;
  v_row jsonb; v_before jsonb; v_expected jsonb; v_response jsonb;
  v_snapshot uuid:=gen_random_uuid(); v_account uuid; v_paid bigint; v_date date;
  v_observed timestamptz:=clock_timestamp(); v_fingerprint text;
begin
  if current_user<>'postgres' then
    raise exception 'Conferência de portal restrita à manutenção autorizada.' using errcode='42501'; end if;
  -- Real requester attribution; no synthesized JWT or impersonation of an actor.
  select to_jsonb(u),case when p.id is not null and not coalesce(u.personalizar_permissoes,false)
    then p.permissoes else u.permissoes end into v_actor,v_permissions
  from public.usuarios_sistema u left join public.perfis_acesso p on p.id=u.perfil_acesso_id
  where u.id=p_actor_id and lower(u.status) in ('ativo','active') and lower(u.perfil)='gestor';
  if v_actor is null or v_permissions->'allPolos' is distinct from 'true'::jsonb
    or not coalesce(v_permissions->'modules' @> '["configuracoes"]'::jsonb,false)
    or (jsonb_typeof(v_actor->'polo_ids')='array' and v_actor->'polo_ids'<>'[]'::jsonb)
    or btrim(coalesce(v_actor->>'context',''))~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Solicitante financeiro global real obrigatório.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'portalStatus' is distinct from 'PAGA'
    or length(coalesce(p_payload->>'evidenceReference','')) not between 8 and 500
    or length(coalesce(p_payload->>'approvalReference','')) not between 8 and 200
    or not coalesce(p_payload->>'expectedBefore'~'^[0-9a-f]{64}$',false)
    or not coalesce(p_payload->>'observationHash'~'^[0-9a-f]{32}$',false)
    or not coalesce(p_payload->>'latestSnapshotHash'~'^[0-9a-f]{32}$',false)
    or not coalesce(p_payload->>'evidenceSha256'~'^[0-9a-f]{64}$',false)
    or not coalesce(p_payload->>'paidCents'~'^[0-9]+$',false) then
    raise exception 'Prova de portal e manifesto financeiro obrigatórios.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('proesc:financial-request:'||p_request_id::text,0));
  select * into v_replay from internal_proesc.portal_payment_confirmations where request_id=p_request_id;
  if found then
    if v_replay.actor_id is distinct from p_actor_id or v_replay.payload is distinct from p_payload then
      raise exception 'Replay da conferência divergente.' using errcode='40001'; end if;
    return v_replay.response||'{"replayed":true}'::jsonb;
  end if;
  if exists(select 1 from internal_proesc.reconciliation_requests where request_id=p_request_id)
    or exists(select 1 from internal_proesc.archived_receipt_requests where request_id=p_request_id)
    or exists(select 1 from internal_proesc.administrative_archive_requests where request_id=p_request_id) then
    raise exception 'Requisição já pertence a outra operação.' using errcode='40001'; end if;
  select * into strict v_link from internal_proesc.obligation_links where id=(p_payload->>'linkId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||v_link.matricula_id::text,0));
  perform 1 from public.turmas where id=v_link.turma_id for update;
  perform 1 from public.matriculas where id=v_link.matricula_id for update;
  select * into strict v_link from internal_proesc.obligation_links where id=v_link.id for update;
  if v_link.receivable_id is null or v_link.archived_receivable_id is not null then
    raise exception 'Obrigação arquivada não pode receber quitação.' using errcode='40001'; end if;
  select * into strict v_receipt from public.contas_receber where id=v_link.receivable_id for update;
  perform internal_proesc.assert_historical_receivable(v_receipt);
  if internal_proesc.receivable_fingerprint(v_receipt) is distinct from p_payload->>'expectedBefore'
    or v_receipt.status not in ('PENDENTE','VENCIDO') or coalesce(v_receipt.valor_pago,0)<>0
    or v_receipt.data_pagamento is not null then
    raise exception 'Recebível mudou ou já possui liquidação.' using errcode='40001'; end if;
  select * into strict v_observation from internal_proesc.v2_invoice_observations
    where id=(p_payload->>'observationId')::uuid for share;
  select * into strict v_pin from internal_proesc.v2_enrollment_links where matricula_id=v_link.matricula_id;
  select * into strict v_previous from internal_proesc.financial_snapshots where link_id=v_link.id
    order by observed_at desc,recorded_at desc,id desc limit 1 for share;
  v_row:=v_observation.normalized;
  v_paid:=(p_payload->>'paidCents')::bigint; v_date:=(p_payload->>'paymentDate')::date;
  if v_paid<=0 or v_date is null or not isfinite(v_date) or v_date>(now() at time zone 'America/Maceio')::date
    or md5(to_jsonb(v_observation)::text) is distinct from p_payload->>'observationHash'
    or v_observation.source_status is distinct from 'PAGAMENTO PARCIAL'
    or v_row->>'sourceStatus' is distinct from v_observation.source_status
    or v_row->>'personId' is null or v_row->>'sourceEnrollmentId' is null
    or v_row->>'sourceClassId' is null or v_row->>'personHash' is null
    or v_observation.unit_id is distinct from v_link.source_unit_id
    or v_observation.invoice_id is distinct from v_link.source_key
    or p_payload->>'portalInvoiceId' is distinct from v_link.source_key
    or (p_payload->>'portalDueDate')::date is distinct from v_receipt.data_vencimento
    or (p_payload->>'principalCents')::bigint is distinct from round(v_receipt.valor*100)::bigint
    or v_observation.link_id is distinct from v_link.id
    or v_row->>'invoiceId' is distinct from v_link.source_key
    or v_row->>'sourceClassId' is distinct from v_link.source_class_id
    or v_pin.unit_id is distinct from v_link.source_unit_id
    or v_pin.source_class_id is distinct from v_link.source_class_id
    or v_pin.source_person_id is distinct from v_row->>'personId'
    or v_pin.source_enrollment_id is distinct from v_row->>'sourceEnrollmentId'
    or v_pin.person_hash is distinct from v_row->>'personHash'
    or v_pin.person_hash is distinct from internal_proesc.person_document_hash(v_receipt.cliente_id)
    or (select count(distinct (person.person_id,enrollment->>'sourceEnrollmentId'))
      from internal_proesc.v2_people_observations person
      cross join lateral jsonb_array_elements(person.enrollments) enrollment
      where person.run_id=(select id from internal_proesc.v2_runs where mode='FULL' and status='COMPLETE'
        order by finished_at desc limit 1) and person.unit_id=v_link.source_unit_id
        and person.person_hash=v_pin.person_hash and enrollment->>'sourceClassId'=v_link.source_class_id)<>1
    or not exists(select 1 from internal_proesc.v2_people_observations person
      cross join lateral jsonb_array_elements(person.enrollments) enrollment
      where person.run_id=(select id from internal_proesc.v2_runs where mode='FULL' and status='COMPLETE'
        order by finished_at desc limit 1) and person.unit_id=v_pin.unit_id
        and person.person_hash=v_pin.person_hash and person.person_id=v_pin.source_person_id
        and enrollment->>'sourceClassId'=v_pin.source_class_id
        and enrollment->>'sourceEnrollmentId'=v_pin.source_enrollment_id)
    or round(v_receipt.valor*100)::bigint is distinct from (v_row->>'principalCents')::bigint
    or v_receipt.data_vencimento is distinct from (v_row->>'dueDate')::date
    or v_paid is distinct from (v_row->>'paidCents')::bigint
    or v_date is distinct from (v_row->>'paymentDate')::date
    or v_previous.verification is distinct from 'REVIEW' or v_previous.source_status is distinct from 'UNKNOWN'
    or v_previous.id is distinct from (p_payload->>'latestSnapshotId')::uuid
    or md5(to_jsonb(v_previous)::text) is distinct from p_payload->>'latestSnapshotHash'
    or v_previous.observed_at>v_observed
    or exists(select 1 from jsonb_array_elements_text(v_row->'reviewReasons') reason
      where reason<>'PARTIAL_PAYMENT_REQUIRES_REVIEW')
    or exists(select 1 from internal_proesc.v2_invoice_observations newer
      where newer.unit_id=v_link.source_unit_id and newer.invoice_id=v_link.source_key
        and (newer.observed_at,newer.recorded_at,newer.id)>(v_observation.observed_at,v_observation.recorded_at,v_observation.id)
        and newer.normalized is distinct from v_row)
    or exists(select 1 from internal_proesc.financial_snapshots s where s.link_id=v_link.id
      and (s.source_status in ('CANCELED','PAID') or exists(select 1 from jsonb_array_elements(s.accounting_lines) line
        where line->>'cancelled'='true' or line->>'renegotiation'='true'))) then
    raise exception 'Prova de pagamento ou identidade requer nova conferência.' using errcode='40001'; end if;
  v_before:=to_jsonb(v_receipt);
  v_account:=internal_proesc.shared_account(v_receipt.polo_id);
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('basis','PORTAL_SCREENSHOT_CONFIRMED',
    'requestId',p_request_id,'payload',p_payload)::text,'sha256'),'hex');
  insert into internal_proesc.financial_snapshots(id,link_id,observed_at,source_fingerprint,
    principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
    components,accounting_lines,review_reasons,recorded_by,collector_review_reasons)
  values(v_snapshot,v_link.id,v_observed,v_fingerprint,round(v_receipt.valor*100)::bigint,v_paid,v_date,
    'PAID','VERIFIED','PORTAL_CONFIRMED',
    '{"interestCents":null,"penaltyCents":null,"discountCents":null,"additionCents":null}',
    '[]','[]',p_actor_id,'[]');
  insert into internal_proesc.reconciliation_requests(request_id,action,actor_id,payload_hash)
    values(p_request_id,'APPLY',p_actor_id,encode(extensions.digest(p_payload::text,'sha256'),'hex'));
  v_expected:=jsonb_build_object('id',v_receipt.id,'matricula_id',v_link.matricula_id,'turma_id',v_link.turma_id,
    'valor',v_receipt.valor,'data_vencimento',v_receipt.data_vencimento,'status','PAGO',
    'valor_pago',v_paid::numeric/100,'data_pagamento',v_date,'conta_bancaria_id',v_account,
    'origem_pagamento',v_receipt.origem_pagamento);
  insert into internal_proesc.mutation_claims(request_id,transaction_id,receivable_id,kind,expected_new)
    values(p_request_id,txid_current(),v_receipt.id,'IMPORT',v_expected);
  update public.contas_receber set status='PAGO',valor_pago=v_paid::numeric/100,
    data_pagamento=v_date,conta_bancaria_id=v_account,updated_at=now() where id=v_receipt.id returning * into v_receipt;
  if not to_jsonb(v_receipt) @> v_expected
    or (to_jsonb(v_receipt)-array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at'])
      is distinct from (v_before-array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at']) then
    raise exception 'Quitação alterou campos fora do contrato.' using errcode='40001'; end if;
  update internal_proesc.mutation_claims set completed=true where request_id=p_request_id;
  insert into internal_proesc.reconciliation_events(request_id,link_id,snapshot_id,mode,result,before_state,after_state)
    values(p_request_id,v_link.id,v_snapshot,'IMPORT','APPLIED',v_before,to_jsonb(v_receipt));
  v_response:=jsonb_build_object('result','APPLIED','receivableId',v_receipt.id,'snapshotId',v_snapshot,
    'evidenceKind','PORTAL_CONFIRMED','paymentDate',v_date,'receivedCents',v_paid,'compositionConfirmed',false);
  update internal_proesc.reconciliation_requests set response=v_response,completed_at=now() where request_id=p_request_id;
  insert into internal_proesc.portal_payment_confirmations(request_id,actor_id,link_id,observation_id,snapshot_id,
    payload,payload_hash,evidence_reference,approval_reference,executed_by,database_session,transaction_id,response)
  values(p_request_id,p_actor_id,v_link.id,v_observation.id,v_snapshot,p_payload,md5(p_payload::text),
    p_payload->>'evidenceReference',p_payload->>'approvalReference',current_user,session_user,txid_current(),v_response);
  return v_response;
end;
$confirm$;
revoke all on function internal_proesc.confirm_portal_payment(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
commit;
