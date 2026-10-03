begin;

alter table public.contas_receber
  add column regra_financeira_renegociacao_snapshot jsonb,
  add column renegotiation_agreement_id uuid references
    public.receivable_renegotiation_agreements(id) on delete restrict;

alter table public.contas_receber
  add constraint contas_receber_regra_financeira_renegociacao_snapshot_check
  check (regra_financeira_renegociacao_snapshot is null or (
    jsonb_typeof(regra_financeira_renegociacao_snapshot) = 'object'
    and regra_financeira_renegociacao_snapshot ->> 'origin' = 'RENEGOTIATION'
    and regra_financeira_renegociacao_snapshot ->> 'version' = '1'
    and jsonb_typeof(
      regra_financeira_renegociacao_snapshot -> 'receiptPolicy'
    ) = 'object'
    and jsonb_typeof(
      regra_financeira_renegociacao_snapshot -> 'financialTerms'
    ) = 'object'
  ));

alter table public.contas_receber
  drop constraint contas_receber_tipo_lancamento_check;
alter table public.contas_receber
  add constraint contas_receber_tipo_lancamento_check check (
    tipo_lancamento is null or tipo_lancamento in (
      'MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA', 'RENEGOCIACAO'
    )
  );

alter table public.receivable_renegotiation_agreements
  add column activation_started_at timestamptz,
  add column activated_at timestamptz,
  add column review_required_at timestamptz;

alter table public.receivable_renegotiation_agreements
  drop constraint receivable_renegotiation_agreements_lifecycle_status_check,
  drop constraint receivable_renegotiation_agreements_lifecycle_chk;
alter table public.receivable_renegotiation_agreements
  add constraint receivable_renegotiation_agreements_lifecycle_status_check
  check (lifecycle_status in (
    'DRAFT', 'PROPOSED', 'CANCELED', 'ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED'
  )),
  add constraint receivable_renegotiation_agreements_lifecycle_chk check (
    (lifecycle_status = 'DRAFT' and submitted_at is null
      and canceled_at is null and activation_started_at is null)
    or (lifecycle_status = 'PROPOSED' and submitted_at is not null
      and canceled_at is null and activation_started_at is null)
    or (lifecycle_status = 'CANCELED' and canceled_at is not null
      and nullif(btrim(canceled_reason), '') is not null
      and activation_started_at is null)
    or (lifecycle_status = 'ACTIVATING' and submitted_at is not null
      and activation_started_at is not null and activated_at is null
      and canceled_at is null and review_required_at is null)
    or (lifecycle_status = 'ACTIVE' and submitted_at is not null
      and activation_started_at is not null and activated_at is not null
      and canceled_at is null and review_required_at is null)
    or (lifecycle_status = 'REVIEW_REQUIRED' and submitted_at is not null
      and activation_started_at is not null and review_required_at is not null
      and canceled_at is null)
  );

alter table public.receivable_renegotiation_events
  drop constraint receivable_renegotiation_events_event_type_check,
  drop constraint receivable_renegotiation_events_to_lifecycle_status_check;
alter table public.receivable_renegotiation_events
  add constraint receivable_renegotiation_events_event_type_check check (
    event_type in (
      'PROPOSAL_DRAFTED', 'PROPOSAL_SUBMITTED', 'PROPOSAL_CANCELED',
      'ACTIVATION_STARTED', 'ACTIVATION_REVIEW_REQUIRED', 'ACTIVATION_COMPLETED'
    )
  ),
  add constraint receivable_renegotiation_events_to_lifecycle_status_check
  check (to_lifecycle_status in (
    'DRAFT', 'PROPOSED', 'CANCELED', 'ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED'
  ));

create table public.receivable_renegotiation_activation_operations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null unique references
    public.receivable_renegotiation_agreements(id) on delete restrict,
  request_id uuid not null unique,
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  matricula_id uuid not null references public.matriculas(id) on delete restrict,
  turma_id uuid not null references public.turmas(id) on delete restrict,
  actor_id uuid,
  state text not null check (state in (
    'CANCELING_SOURCES', 'ISSUING_REPLACEMENTS', 'ACTIVE', 'REVIEW_REQUIRED'
  )),
  expected_version bigint not null check (expected_version > 0),
  expected_fingerprint text not null
    check (expected_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  course_type text not null check (
    course_type in ('TECNICO', 'LIVRE', 'ESPECIALIZACAO')
  ),
  route_id uuid not null references public.payment_gateway_routes(id) on delete restrict,
  credential_id uuid not null references
    public.payment_gateway_credentials(id) on delete restrict,
  issuer_polo_id uuid not null references public.polos(id) on delete restrict,
  gateway_environment text not null check (gateway_environment = 'production'),
  gateway_convenio text not null check (gateway_convenio ~ '^[0-9]+$'),
  gateway_agency text not null check (
    gateway_agency ~ '^[0-9]{3}$' and gateway_agency <> '000'
  ),
  gateway_account text not null check (gateway_account ~ '^[0-9]{9}$'),
  gateway_runtime_snapshot jsonb not null
    check (jsonb_typeof(gateway_runtime_snapshot) = 'object'),
  gateway_runtime_fingerprint text not null
    check (gateway_runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  activation_snapshot jsonb not null
    check (jsonb_typeof(activation_snapshot) = 'object'),
  snapshot_fingerprint text not null
    check (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count integer not null check (source_count between 1 and 120),
  replacement_count integer not null check (replacement_count between 1 and 120),
  lease_token uuid,
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 500),
  next_attempt_at timestamptz not null default now(),
  pix_recovery_first_pending_at timestamptz,
  pix_recovery_count integer not null default 0
    check (pix_recovery_count between 0 and 500),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  review_required_at timestamptz,
  constraint receivable_renegotiation_activation_lease_check
    check ((lease_token is null) = (lease_until is null)),
  constraint receivable_renegotiation_activation_pix_recovery_check
    check ((pix_recovery_count = 0) =
      (pix_recovery_first_pending_at is null)),
  constraint receivable_renegotiation_activation_completed_check
    check (state <> 'ACTIVE' or completed_at is not null),
  constraint receivable_renegotiation_activation_review_check
    check ((state = 'REVIEW_REQUIRED') = (review_required_at is not null))
);

create table public.receivable_renegotiation_activation_sources (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references
    public.receivable_renegotiation_activation_operations(id) on delete restrict,
  source_item_id uuid not null unique references
    public.receivable_renegotiation_source_items(id) on delete restrict,
  receivable_id uuid not null unique references public.contas_receber(id) on delete restrict,
  position integer not null check (position between 1 and 120),
  kind text not null check (kind in ('LOCAL', 'BANESE')),
  state text not null default 'PENDING' check (state in (
    'PENDING', 'CANCEL_INTENT', 'CANCELED_CONFIRMED', 'REVIEW_REQUIRED'
  )),
  attempt_key uuid not null unique,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  bank_snapshot jsonb check (
    bank_snapshot is null or jsonb_typeof(bank_snapshot) = 'object'
  ),
  bank_snapshot_fingerprint text check (
    bank_snapshot_fingerprint is null
      or bank_snapshot_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  transaction_id uuid references public.payment_gateway_transactions(id) on delete restrict,
  cancel_intent_at timestamptz,
  cancel_intent_count integer not null default 0 check (cancel_intent_count between 0 and 1),
  cancellation_evidence jsonb check (
    cancellation_evidence is null or jsonb_typeof(cancellation_evidence) = 'object'
  ),
  cancellation_evidence_fingerprint text check (
    cancellation_evidence_fingerprint is null
      or cancellation_evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, position),
  check ((kind = 'BANESE') = (bank_snapshot is not null)),
  check ((kind = 'BANESE') = (transaction_id is not null)),
  check ((state = 'CANCELED_CONFIRMED') = (canceled_at is not null))
);

create table public.receivable_renegotiation_replacements (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references
    public.receivable_renegotiation_activation_operations(id) on delete restrict,
  agreement_id uuid not null references
    public.receivable_renegotiation_agreements(id) on delete restrict,
  receivable_id uuid not null unique,
  sequence integer not null check (sequence between 0 and 120),
  kind text not null check (kind in ('DOWN_PAYMENT', 'INSTALLMENT')),
  due_date date not null,
  amount_cents bigint not null check (amount_cents between 1 and 9000000000000000),
  state text not null default 'PLANNED' check (state in (
    'PLANNED', 'PENDING', 'ISSUANCE_INTENT', 'ISSUED', 'REVIEW_REQUIRED'
  )),
  attempt_key uuid not null unique,
  financial_terms jsonb not null check (jsonb_typeof(financial_terms) = 'object'),
  collection_policy jsonb not null
    check (jsonb_typeof(collection_policy) = 'object'),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  issuance_intent_at timestamptz,
  issuance_intent_count integer not null default 0 check (issuance_intent_count between 0 and 1),
  gateway_transaction_id uuid references
    public.payment_gateway_transactions(id) on delete restrict,
  issuance_evidence_fingerprint text check (
    issuance_evidence_fingerprint is null
      or issuance_evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  creation_response jsonb check (
    creation_response is null or jsonb_typeof(creation_response) = 'object'
  ),
  creation_response_fingerprint text check (
    creation_response_fingerprint is null
      or creation_response_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  creation_response_recorded_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agreement_id, sequence),
  unique (operation_id, sequence),
  check ((state = 'ISSUED') = (issued_at is not null)),
  check ((state = 'ISSUED') = (gateway_transaction_id is not null))
);

alter table public.receivable_renegotiation_replacements
  add constraint receivable_renegotiation_replacements_receivable_fkey
  foreign key (receivable_id) references public.contas_receber(id)
  deferrable initially deferred;

create index receivable_renegotiation_activation_queue_idx on
  public.receivable_renegotiation_activation_operations
  (state, next_attempt_at, created_at) where state in (
    'CANCELING_SOURCES', 'ISSUING_REPLACEMENTS'
  );
create index receivable_renegotiation_activation_polo_idx on
  public.receivable_renegotiation_activation_operations (polo_id, created_at desc);
create index receivable_renegotiation_activation_sources_operation_idx on
  public.receivable_renegotiation_activation_sources (operation_id, position);
create index receivable_renegotiation_replacements_operation_idx on
  public.receivable_renegotiation_replacements (operation_id, sequence);
create index contas_receber_renegotiation_agreement_idx on
  public.contas_receber (renegotiation_agreement_id)
  where renegotiation_agreement_id is not null;

alter table public.receivable_renegotiation_activation_operations enable row level security;
alter table public.receivable_renegotiation_activation_sources enable row level security;
alter table public.receivable_renegotiation_replacements enable row level security;
revoke all on table public.receivable_renegotiation_activation_operations,
  public.receivable_renegotiation_activation_sources,
  public.receivable_renegotiation_replacements from public, anon, authenticated, service_role;
grant select on table public.receivable_renegotiation_activation_operations,
  public.receivable_renegotiation_activation_sources,
  public.receivable_renegotiation_replacements to service_role;

comment on table public.receivable_renegotiation_activation_operations is
  'Saga idempotente de cancelamento das origens e emissão dos títulos substitutos.';
comment on table public.receivable_renegotiation_activation_sources is
  'Snapshots privados e fences dos títulos originais da renegociação.';
comment on table public.receivable_renegotiation_replacements is
  'Plano imutável e estado de emissão de cada título substituto.';

commit;
