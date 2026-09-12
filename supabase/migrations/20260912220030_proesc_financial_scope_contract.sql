-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

-- Remote base CAS from MCP read-only inspection.
do $base_30$
begin
  if md5(pg_get_functiondef('internal_proesc.assert_historical_receivable(public.contas_receber)'::regprocedure)) <> '4b0f2526b92718b8ff011d66f7777a6b' then
    raise exception 'Remote base changed: internal_proesc.assert_historical_receivable; rebase required.'; end if;
end;
$base_30$;

alter table internal_proesc.reconciliation_requests drop constraint reconciliation_requests_action_check;
alter table internal_proesc.reconciliation_requests add constraint reconciliation_requests_action_check
  check (action in ('LINK','SNAPSHOT','APPLY','IMPORT_RESIDUAL','IMPORT_ORIGINAL'));
alter table internal_proesc.reconciliation_events drop constraint reconciliation_events_mode_check;
alter table internal_proesc.reconciliation_events add constraint reconciliation_events_mode_check
  check (mode in ('LINK','IMPORT','AUTO','CORRECTION','IMPORT_RESIDUAL','IMPORT_ORIGINAL'));
alter table internal_proesc.mutation_claims drop constraint mutation_claims_kind_check;
alter table internal_proesc.mutation_claims add constraint mutation_claims_kind_check
  check (kind in ('IMPORT','AUTO','CORRECTION','IMPORT_RESIDUAL','IMPORT_ORIGINAL'));

create table internal_proesc.obligation_imports (
  link_id uuid primary key references internal_proesc.obligation_links(id),
  request_id uuid not null unique references internal_proesc.reconciliation_requests(request_id),
  scope_id uuid not null references internal_proesc.class_scopes(id),
  source_person_hash text not null check (source_person_hash ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_cycle text not null check (source_cycle in ('FIRST','SECOND','FULL_CONTRACT','UNRESOLVED')),
  obligation_kind text not null check (obligation_kind in ('TUITION','REENROLLMENT_FEE','OTHER_CONFIRMED','UNRESOLVED')),
  source_ordinal integer check (source_ordinal between 1 and 1000),
  recorded_at timestamptz not null default now()
);
alter table internal_proesc.obligation_imports enable row level security;
revoke all on internal_proesc.obligation_imports from public,anon,authenticated,service_role;

create function internal_proesc.person_document_hash(p_person_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_document text;
begin
  select regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g') into strict v_document
  from public.parceiros where id=p_person_id;
  if v_document !~ '^[0-9]{11}$' then
    raise exception 'CPF canônico de onze dígitos obrigatório para vincular a origem.' using errcode='22023'; end if;
  return encode(extensions.digest(v_document,'sha256'),'hex');
end;
$$;

-- Excludes financial_review_state: importing the next obligation must not change
-- the academic/person/scope CAS. These identities remain protected by row locks.
create function internal_proesc.enrollment_import_fingerprint(p_matricula_id uuid)
returns text language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_identity jsonb;
begin
  select jsonb_build_object('enrollment',to_jsonb(m),'personHash',internal_proesc.person_document_hash(m.aluno_id),
    'scopeId',s.id,'scopePhase',s.phase,'financialMode',s.financial_mode,'poloId',s.polo_id,
    'sourceUnit',s.source_unit_id,'sourceClass',s.source_class_id,
    'source',jsonb_build_object('scopeId',e.scope_id,'personKey',e.source_person_key,
      'status',e.source_status,'verified',e.source_verified,'fingerprint',e.source_fingerprint,
      'observedAt',e.source_observed_at)) into strict v_identity
  from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  left join internal_proesc.enrollment_sources e on e.matricula_id=m.id
  where m.id=p_matricula_id;
  return encode(extensions.digest(v_identity::text,'sha256'),'hex');
end;
$$;

create or replace function internal_proesc.assert_historical_receivable(p_receivable public.contas_receber)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_receivable.id is null or p_receivable.origem_pagamento is distinct from 'SISTEMA_ANTERIOR'
    or p_receivable.matricula_id is null or p_receivable.cliente_id is null
    or not exists (select 1 from public.matriculas m join public.turmas t on t.id = m.turma_id
      where m.id = p_receivable.matricula_id and m.aluno_id = p_receivable.cliente_id
        and t.id = p_receivable.turma_id and t.polo_id = p_receivable.polo_id
        and exists (select 1 from internal_proesc.class_scopes scope
          where scope.turma_id = t.id and scope.polo_id = t.polo_id and scope.phase = 'CONFIRMED'))
    or p_receivable.gateway_provider is not null or p_receivable.gateway_payment_id is not null
    or p_receivable.gateway_creation_token is not null or p_receivable.gateway_submission_channel is not null
    or p_receivable.gateway_submission_status is not null or p_receivable.gateway_boleto_nosso_numero is not null
    or p_receivable.gateway_boleto_linha_digitavel is not null or p_receivable.gateway_boleto_codigo_barras is not null
    or p_receivable.gateway_pix_payload is not null or p_receivable.gateway_pix_encoded_image is not null
    or p_receivable.asaas_payment_id is not null or p_receivable.nosso_numero_asaas is not null
    or p_receivable.manual_settlement_id is not null
    or (p_receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is not null
    or exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = p_receivable.id and not exists (
        select 1 from internal_proesc.class_scopes scope where scope.turma_id = link.turma_id
          and scope.source_unit_id = link.source_unit_id and scope.source_class_id = link.source_class_id
          and scope.phase = 'CONFIRMED'))
    or exists (select 1 from public.payment_gateway_transactions where receivable_id = p_receivable.id)
    or exists (select 1 from internal_academic.technical_manual_cycle_runs run
      where p_receivable.id = any(run.receivable_ids))
  then raise exception 'A obrigação não pertence ao histórico Proesc autorizado.' using errcode = '42501'; end if;
end;
$$;


-- Extend the existing transaction-bound exception, never a caller-controlled GUC.
alter function internal_academic.is_authorized_external_history_insert(public.contas_receber)
  rename to is_authorized_external_history_insert_before_original;
create function internal_academic.is_authorized_external_history_insert(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $$
  select internal_academic.is_authorized_external_history_insert_before_original(p_receivable)
    or exists (select 1 from internal_proesc.mutation_claims claim
      join internal_proesc.reconciliation_requests request on request.request_id=claim.request_id
      where claim.transaction_id=txid_current() and claim.receivable_id=p_receivable.id
        and claim.kind='IMPORT_ORIGINAL' and not claim.completed
        and request.action='IMPORT_ORIGINAL' and request.response is null
        and to_jsonb(p_receivable) @> claim.expected_new
        and p_receivable.origem_pagamento='SISTEMA_ANTERIOR'
        and p_receivable.gateway_provider is null and p_receivable.gateway_payment_id is null
        and p_receivable.gateway_creation_token is null and p_receivable.gateway_submission_channel is null
        and p_receivable.gateway_submission_status is null and p_receivable.gateway_boleto_nosso_numero is null
        and p_receivable.gateway_boleto_linha_digitavel is null and p_receivable.gateway_boleto_codigo_barras is null
        and p_receivable.gateway_pix_payload is null and p_receivable.gateway_pix_encoded_image is null
        and p_receivable.asaas_payment_id is null and p_receivable.nosso_numero_asaas is null
        and p_receivable.manual_settlement_id is null
        and (p_receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is null);
$$;
revoke all on function internal_proesc.person_document_hash(uuid),
  internal_proesc.enrollment_import_fingerprint(uuid),
  internal_academic.is_authorized_external_history_insert_before_original(public.contas_receber),
  internal_academic.is_authorized_external_history_insert(public.contas_receber)
  from public,anon,authenticated,service_role;
commit;
