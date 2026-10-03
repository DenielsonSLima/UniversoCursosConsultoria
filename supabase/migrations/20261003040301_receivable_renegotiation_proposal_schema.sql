begin;

create schema if not exists internal_finance;
revoke all on schema internal_finance from public, anon, authenticated;

create table public.receivable_renegotiation_agreements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  matricula_id uuid not null references public.matriculas(id) on delete restrict,
  turma_id uuid not null references public.turmas(id) on delete restrict,
  lifecycle_status text not null default 'DRAFT'
    check (lifecycle_status in ('DRAFT', 'PROPOSED', 'CANCELED')),
  version bigint not null default 1 check (version > 0),
  as_of date not null,
  source_count integer not null check (source_count > 0),
  source_principal_cents bigint not null check (source_principal_cents >= 0),
  source_open_cents bigint not null check (source_open_cents >= 0),
  negotiated_cents bigint not null check (negotiated_cents >= 0),
  installment_count integer not null check (installment_count >= 0),
  first_due_date date,
  selection_fingerprint text not null
    check (selection_fingerprint ~ '^[0-9a-f]{64}$'),
  policy_fingerprint text not null
    check (policy_fingerprint ~ '^[0-9a-f]{64}$'),
  calculation_fingerprint text not null
    check (calculation_fingerprint ~ '^[0-9a-f]{64}$'),
  proposal_fingerprint text not null
    check (proposal_fingerprint ~ '^[0-9a-f]{64}$'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  calculation_snapshot jsonb not null
    check (jsonb_typeof(calculation_snapshot) = 'object'),
  canonical_snapshot jsonb not null check (jsonb_typeof(canonical_snapshot) = 'object'),
  reason text,
  created_by uuid,
  submitted_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid,
  canceled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receivable_renegotiation_agreements_reason_chk
    check (reason is null or length(reason) <= 1000),
  constraint receivable_renegotiation_agreements_cancel_reason_chk
    check (canceled_reason is null or length(canceled_reason) <= 1000),
  constraint receivable_renegotiation_agreements_lifecycle_chk check (
    (lifecycle_status = 'DRAFT' and submitted_at is null
      and canceled_at is null and canceled_reason is null)
    or (lifecycle_status = 'PROPOSED' and submitted_at is not null
      and canceled_at is null and canceled_reason is null)
    or (lifecycle_status = 'CANCELED' and canceled_at is not null
      and nullif(btrim(canceled_reason), '') is not null)
  )
);

create table public.receivable_renegotiation_source_items (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null
    references public.receivable_renegotiation_agreements(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  position integer not null check (position > 0),
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  source_status text not null,
  due_date date not null,
  principal_cents bigint not null check (principal_cents >= 0),
  open_amount_cents bigint not null check (open_amount_cents >= 0),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, position),
  unique (agreement_id, receivable_id)
);

create table public.receivable_renegotiation_events (
  id bigint generated always as identity primary key,
  agreement_id uuid not null
    references public.receivable_renegotiation_agreements(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  event_type text not null check (event_type in (
    'PROPOSAL_DRAFTED', 'PROPOSAL_SUBMITTED', 'PROPOSAL_CANCELED'
  )),
  from_lifecycle_status text,
  to_lifecycle_status text not null
    check (to_lifecycle_status in ('DRAFT', 'PROPOSED', 'CANCELED')),
  version bigint not null check (version > 0),
  actor_id uuid,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (request_id, event_type)
);

create table public.receivable_renegotiation_requests (
  request_id uuid primary key,
  agreement_id uuid
    references public.receivable_renegotiation_agreements(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  operation text not null check (operation in ('SAVE_PROPOSAL', 'DISCARD_PROPOSAL')),
  actor_id uuid,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

create index receivable_renegotiation_agreements_workspace_idx
  on public.receivable_renegotiation_agreements
    (polo_id, lifecycle_status, updated_at desc, id desc);
create index receivable_renegotiation_agreements_student_idx
  on public.receivable_renegotiation_agreements
    (aluno_id, matricula_id, updated_at desc);
create index receivable_renegotiation_agreements_company_idx
  on public.receivable_renegotiation_agreements (company_id);
create index receivable_renegotiation_agreements_class_idx
  on public.receivable_renegotiation_agreements (turma_id);
create index receivable_renegotiation_source_receivable_idx
  on public.receivable_renegotiation_source_items (receivable_id, agreement_id);
create unique index receivable_renegotiation_source_active_uidx
  on public.receivable_renegotiation_source_items (receivable_id)
  where released_at is null;
create index receivable_renegotiation_source_polo_idx
  on public.receivable_renegotiation_source_items (polo_id, agreement_id);
create index receivable_renegotiation_events_timeline_idx
  on public.receivable_renegotiation_events (agreement_id, created_at, id);
create index receivable_renegotiation_events_polo_idx
  on public.receivable_renegotiation_events (polo_id, created_at desc);
create index receivable_renegotiation_requests_agreement_idx
  on public.receivable_renegotiation_requests (agreement_id, created_at desc);
create index receivable_renegotiation_requests_polo_idx
  on public.receivable_renegotiation_requests (polo_id, created_at desc);

alter table public.receivable_renegotiation_agreements enable row level security;
alter table public.receivable_renegotiation_source_items enable row level security;
alter table public.receivable_renegotiation_events enable row level security;
alter table public.receivable_renegotiation_requests enable row level security;

create policy receivable_renegotiation_agreements_select_scoped
  on public.receivable_renegotiation_agreements for select to authenticated
  using (public.is_financeiro_for_polo(polo_id)
    and public.gestor_has_effective_financeiro_tab('receber'));
create policy receivable_renegotiation_source_items_select_scoped
  on public.receivable_renegotiation_source_items for select to authenticated
  using (public.is_financeiro_for_polo(polo_id)
    and public.gestor_has_effective_financeiro_tab('receber'));
create policy receivable_renegotiation_events_select_scoped
  on public.receivable_renegotiation_events for select to authenticated
  using (public.is_financeiro_for_polo(polo_id)
    and public.gestor_has_effective_financeiro_tab('receber'));
create policy receivable_renegotiation_requests_deny_direct
  on public.receivable_renegotiation_requests for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.receivable_renegotiation_agreements,
  public.receivable_renegotiation_source_items,
  public.receivable_renegotiation_events,
  public.receivable_renegotiation_requests from public, anon, authenticated, service_role;
grant select on table public.receivable_renegotiation_agreements,
  public.receivable_renegotiation_source_items,
  public.receivable_renegotiation_events to authenticated, service_role;

create function internal_finance.assert_receivable_renegotiation_identity()
returns void language plpgsql stable security invoker set search_path = '' as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return; end if;
  if auth.uid() is null or not coalesce(public.is_gestor(), false)
    or not coalesce(public.gestor_has_effective_financeiro_tab('receber'), false) then
    raise exception 'Identidade gestora com acesso a Receber é obrigatória.'
      using errcode = '42501';
  end if;
end;
$function$;

create function internal_finance.assert_receivable_renegotiation_scope(p_polo_id uuid)
returns void language plpgsql stable security invoker set search_path = '' as $function$
declare v_allowed boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return; end if;
  perform internal_finance.assert_receivable_renegotiation_identity();
  v_allowed := case when p_polo_id is null then
    coalesce(public.gestor_has_any_global_module(array['financeiro']), false)
  else
    coalesce(public.gestor_has_any_module_for_polo(array['financeiro'], p_polo_id), false)
  end;
  if not v_allowed then
    raise exception 'Financeiro, Receber ou polo fora do escopo autorizado.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_finance.assert_receivable_renegotiation_identity(),
  internal_finance.assert_receivable_renegotiation_scope(uuid)
  from public, anon, authenticated, service_role;

create trigger receivable_renegotiation_agreements_emit_finance_event
after insert or update on public.receivable_renegotiation_agreements
for each row execute function public.emit_caixa_realtime_event('ROW');

comment on table public.receivable_renegotiation_agreements is
  'Propostas de renegociação; nesta fase não ativam acordo nem alteram títulos ou saldos.';
comment on table public.receivable_renegotiation_requests is
  'Registro privado de idempotência das mutações de propostas de renegociação.';

commit;
