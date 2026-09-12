-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

alter table internal_proesc.reconciliation_requests drop constraint reconciliation_requests_action_check;
alter table internal_proesc.reconciliation_requests add constraint reconciliation_requests_action_check
  check (action in ('LINK','SNAPSHOT','APPLY','IMPORT_RESIDUAL','IMPORT_ORIGINAL','FINALIZE'));
alter table internal_proesc.reconciliation_events drop constraint reconciliation_events_mode_check;
alter table internal_proesc.reconciliation_events add constraint reconciliation_events_mode_check
  check (mode in ('LINK','IMPORT','AUTO','CORRECTION','IMPORT_RESIDUAL','IMPORT_ORIGINAL','FINALIZE'));
alter table internal_proesc.reconciliation_events drop constraint reconciliation_events_result_check;
alter table internal_proesc.reconciliation_events add constraint reconciliation_events_result_check
  check (result in ('LINKED','APPLIED','UNCHANGED','REVIEW','IMPORTED','CONFIRMED'));
create table internal_proesc.enrollment_financial_confirmations (
  request_id uuid primary key references internal_proesc.reconciliation_requests(request_id),
  matricula_id uuid not null references public.matriculas(id),
  scope_id uuid not null references internal_proesc.class_scopes(id),
  source_manifest_hash text not null check (source_manifest_hash ~ '^[0-9a-f]{64}$'),
  obligation_count integer not null check (obligation_count>0),
  principal_cents bigint not null check (principal_cents>0),
  received_cents bigint not null check (received_cents>=0),
  confirmed_snapshots jsonb not null check (jsonb_typeof(confirmed_snapshots)='array'),
  confirmed_by uuid not null references public.usuarios_sistema(id),
  confirmed_at timestamptz not null default now()
);
create index proesc_enrollment_financial_confirmations_enrollment_idx
  on internal_proesc.enrollment_financial_confirmations(matricula_id);
alter table internal_proesc.enrollment_financial_confirmations enable row level security;
revoke all on internal_proesc.enrollment_financial_confirmations from public,anon,authenticated,service_role;

create function public.proesc_finalize_enrollment_financial_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
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
    select * into strict v_snapshot from internal_proesc.financial_snapshots
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
$$;
revoke all on function public.proesc_finalize_enrollment_financial_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_finalize_enrollment_financial_service(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
