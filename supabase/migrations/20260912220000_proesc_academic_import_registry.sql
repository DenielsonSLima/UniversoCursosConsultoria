begin;

-- The historical index uses an escaped pattern that preserves punctuation.
-- This canonical constraint closes the race with ordinary UI student creation.
create unique index parceiros_aluno_cpf_digits_uidx on public.parceiros
  (regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')) where tipo='Aluno';

create table internal_proesc.bootstrap_requests (
  request_id uuid primary key,
  action text not null check (action in ('STAGE','STUDENT','CLASS','ENROLLMENT')),
  actor_id uuid not null references public.usuarios_sistema(id),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((response is null) = (completed_at is null))
);
create table internal_proesc.import_batches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references internal_proesc.bootstrap_requests(request_id),
  actor_id uuid not null references public.usuarios_sistema(id),
  source_manifest_hash text not null unique check (source_manifest_hash ~ '^[0-9a-f]{64}$'),
  expected_students integer not null check (expected_students between 1 and 5000),
  expected_enrollments integer not null check (expected_enrollments between 1 and 5000),
  status text not null default 'STAGING' check (status in
    ('STAGING','STUDENTS_READY','CLASSES_READY','ENROLLMENTS_READY','COMPLETED')),
  created_at timestamptz not null default now()
);
create table internal_proesc.class_scopes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references internal_proesc.import_batches(id),
  source_unit_id text not null check (source_unit_id ~ '^[0-9]+$'),
  source_class_id text not null check (source_class_id ~ '^[0-9]+$'),
  turma_id uuid unique references public.turmas(id) deferrable initially deferred,
  polo_id uuid not null references public.polos(id),
  class_code text not null unique,
  financial_mode text not null check (financial_mode in ('PROESC_COMPLETO','CICLO1_PROESC','INDIVIDUAL_REVIEW')),
  phase text not null check (phase in ('STAGED','CONFIRMED')),
  class_spec jsonb not null default '{}'::jsonb check (jsonb_typeof(class_spec) = 'object'),
  source_academic jsonb not null default '{}'::jsonb check (jsonb_typeof(source_academic) = 'object'),
  confirmed_by uuid references public.usuarios_sistema(id),
  confirmed_at timestamptz,
  unique (source_unit_id,source_class_id),
  check (phase <> 'CONFIRMED' or (turma_id is not null and confirmed_by is not null and confirmed_at is not null))
);
create index proesc_class_scopes_batch_idx on internal_proesc.class_scopes(batch_id);
create table internal_proesc.student_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references internal_proesc.import_batches(id),
  source_unit_id text not null check (source_unit_id ~ '^[0-9]+$'),
  source_person_key text not null check (source_person_key ~ '^[0-9a-f]{64}$'),
  source_person_id text,
  partner_id uuid not null references public.parceiros(id),
  identity_fingerprint text not null check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  created_new boolean not null,
  source_profile jsonb not null check (jsonb_typeof(source_profile) = 'object'),
  request_id uuid not null unique references internal_proesc.bootstrap_requests(request_id),
  unique (batch_id,source_unit_id,source_person_key)
);
create index proesc_student_staging_partner_idx on internal_proesc.student_staging(partner_id);
create table internal_proesc.enrollment_sources (
  matricula_id uuid primary key references public.matriculas(id) deferrable initially deferred,
  scope_id uuid not null references internal_proesc.class_scopes(id),
  source_person_key text not null check (source_person_key ~ '^[0-9a-f]{64}$'),
  source_enrollment_id text,
  source_status text not null check (source_status in
    ('CURSANDO','TRANCADO','DESISTENTE','CONCLUIDO','CANCELADO','TRANSFERIDO','REMANEJADO','SOURCE_UNKNOWN')),
  source_verified boolean not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_observed_at timestamptz not null,
  source_enrolled_at timestamptz,
  source_academic jsonb not null check (jsonb_typeof(source_academic) = 'object'),
  source_provenance jsonb not null check (jsonb_typeof(source_provenance) = 'object'),
  financial_review_state text not null default 'REVIEW' check (financial_review_state in ('REVIEW','CONFIRMED')),
  request_id uuid not null unique references internal_proesc.bootstrap_requests(request_id),
  unique (scope_id,source_person_key),
  unique (scope_id,source_enrollment_id),
  check (source_status = 'SOURCE_UNKNOWN' or (source_verified and
    (nullif(source_enrollment_id,'') is not null or source_provenance->>'kind' = 'PROESC_XLS_EXPORT')))
);
create table internal_proesc.bootstrap_claims (
  request_id uuid primary key references internal_proesc.bootstrap_requests(request_id),
  transaction_id bigint not null,
  entity text not null check (entity in ('CLASS','ENROLLMENT')),
  record_id uuid not null,
  expected_new jsonb not null check (jsonb_typeof(expected_new) = 'object'),
  completed boolean not null default false
);
create index proesc_bootstrap_claims_record_idx on internal_proesc.bootstrap_claims(record_id);
alter table internal_proesc.bootstrap_requests enable row level security;
alter table internal_proesc.import_batches enable row level security;
alter table internal_proesc.class_scopes enable row level security;
alter table internal_proesc.student_staging enable row level security;
alter table internal_proesc.enrollment_sources enable row level security;
alter table internal_proesc.bootstrap_claims enable row level security;
revoke all on internal_proesc.bootstrap_requests,internal_proesc.import_batches,
  internal_proesc.class_scopes,internal_proesc.student_staging,
  internal_proesc.enrollment_sources,internal_proesc.bootstrap_claims from public,anon,authenticated,service_role;

-- Existing, already reconciled T42 is registered without changing any public row,
-- policy, bank title, external coverage or eligibility state.
-- The seed's mode is compatibility metadata only: batch_id NULL delegates to
-- existing per-enrollment rules, including already proven full external coverage.
insert into internal_proesc.class_scopes(source_unit_id,source_class_id,turma_id,polo_id,
  class_code,financial_mode,phase,source_academic,confirmed_by,confirmed_at)
select '3145','386123',class.id,class.polo_id,class.codigo,'CICLO1_PROESC','CONFIRMED',
  '{"origin":"EXISTING_RECONCILIATION"}'::jsonb,
  (select link.confirmed_by from internal_proesc.obligation_links link
    where link.turma_id=class.id order by link.confirmed_at limit 1),now()
from public.turmas class where class.codigo='ENF-T42-INT-MAT'
  and exists(select 1 from internal_proesc.obligation_links link where link.turma_id=class.id
    and link.source_unit_id='3145' and link.source_class_id='386123');

commit;
