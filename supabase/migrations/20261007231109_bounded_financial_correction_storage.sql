-- LOCAL REVIEW DRAFT ONLY. Apply only through the canonical reviewed MCP migration.
-- No live operation, approval, personal data, credentials or bank request is seeded.
begin;
create schema if not exists internal_financial_correction;
revoke all on schema internal_financial_correction from public, anon, authenticated, service_role;

create table internal_financial_correction.operations (
  id uuid primary key,
  purpose text not null check (purpose = 'FINANCIAL_CORRECTION_CANCEL_ONLY'),
  actor_id uuid not null references auth.users(id),
  execution_actor_kind text not null default 'SERVICE_MAINTENANCE'
    check (execution_actor_kind='SERVICE_MAINTENANCE'),
  approval_source text not null check (approval_source = 'EXPLICIT_OWNER_APPROVAL'),
  approval_reference text not null check (length(approval_reference) between 8 and 512),
  approval_evidence_hash text not null check (approval_evidence_hash ~ '^[a-f0-9]{64}$'),
  canonical_text text not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  turma_id uuid not null references public.turmas(id),
  polo_id uuid not null references public.polos(id),
  plan jsonb not null,
  plan_fingerprint text not null check (plan_fingerprint ~ '^[a-f0-9]{64}$'),
  item_count integer not null default 49 check (item_count=49),
  state text not null default 'PREPARED' check (state in ('PREPARED','APPROVED','BANK_CONFIRMED','FINALIZED')),
  execution_enabled boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (state = 'PREPARED' or approved_at is not null)
);
create table internal_financial_correction.items (
  operation_id uuid not null references internal_financial_correction.operations(id),
  receivable_id uuid not null references public.contas_receber(id),
  kind text not null check (kind in ('RESET_C1','CANCEL_C2','LOCAL_WAIVER')),
  matricula_id uuid not null references public.matriculas(id),
  cycle_number integer not null check (cycle_number in (1,2)),
  run_snapshot jsonb not null,
  authorization_snapshot jsonb,
  corrected_due_date date,
  corrected_terms jsonb,
  bank_evidence jsonb,
  bank_evidence_hash text,
  job_id uuid,
  finalized_at timestamptz,
  consent_request_id uuid,
  consent_actor_id uuid,
  consent_at timestamptz,
  consent_fingerprint text,
  position integer not null check (position between 1 and 100),
  polo_id uuid not null references public.polos(id),
  transaction_id uuid references public.payment_gateway_transactions(id),
  identity_snapshot jsonb,
  receivable_snapshot jsonb not null,
  transaction_snapshot jsonb,
  guard_updated_at timestamptz,
  guard_gateway_synced_at timestamptz,
  guard_transaction_updated_at timestamptz,
  guard_transaction_synced_at timestamptz,
  state text not null default 'READY'
    check (state in ('READY','LEASED','INTENT','REVIEW','BANK_CONFIRMED','FINALIZED')),
  lease_token uuid,
  lease_until timestamptz,
  intent_at timestamptz,
  attempt_count integer not null default 0,
  review_reason text,
  primary key (operation_id, receivable_id),
  unique (receivable_id),
  unique (operation_id, position),
  check ((kind='LOCAL_WAIVER' and transaction_id is null and identity_snapshot is null
    and transaction_snapshot is null and corrected_due_date is null and corrected_terms is null)
    or (kind<>'LOCAL_WAIVER' and transaction_id is not null and identity_snapshot is not null
      and transaction_snapshot is not null)),
  check (kind<>'RESET_C1' or (corrected_due_date is not null and corrected_terms is not null)),
  check ((bank_evidence is null and bank_evidence_hash is null) or
    (bank_evidence is not null and bank_evidence_hash ~ '^[a-f0-9]{64}$'))
);
alter table internal_financial_correction.operations enable row level security;
alter table internal_financial_correction.items enable row level security;
revoke all on all tables in schema internal_financial_correction from public,anon,authenticated,service_role;

create function internal_financial_correction.preserve_immutable()
returns trigger language plpgsql set search_path = '' as $$
declare mutable text[];
begin
  if tg_op='DELETE' then raise exception 'CORRECTION_HISTORY_IMMUTABLE'; end if;
  if tg_table_name='operations' then
    mutable := array['state','execution_enabled','approved_at','completed_at','finalizing_xid'];
    if old.approved_at is not null and new.approved_at is distinct from old.approved_at then
      raise exception 'CORRECTION_APPROVAL_IMMUTABLE';
    end if;
  else
    mutable := array['state','lease_token','lease_until','intent_at','attempt_count','review_reason',
      'guard_updated_at','guard_gateway_synced_at','guard_transaction_updated_at',
      'guard_transaction_synced_at','bank_evidence','bank_evidence_hash','job_id','finalized_at',
      'consent_request_id','consent_actor_id','consent_at','consent_fingerprint','consent_batch_id','last_dispatch_at'];
    if (old.intent_at is not null and new.intent_at is distinct from old.intent_at)
      or (old.bank_evidence is not null and (new.bank_evidence is distinct from old.bank_evidence
        or new.bank_evidence_hash is distinct from old.bank_evidence_hash))
      or (old.finalized_at is not null and new.finalized_at is distinct from old.finalized_at)
      or (old.job_id is not null and new.job_id is distinct from old.job_id)
    then raise exception 'CORRECTION_EVIDENCE_IMMUTABLE'; end if;
  end if;
  if (to_jsonb(new)-mutable) is distinct from (to_jsonb(old)-mutable) then
    raise exception 'CORRECTION_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger immutable_correction_operation before update or delete
  on internal_financial_correction.operations for each row
  execute function internal_financial_correction.preserve_immutable();
create trigger immutable_correction_item before update or delete
  on internal_financial_correction.items for each row
  execute function internal_financial_correction.preserve_immutable();

create function internal_financial_correction.sha256(p_text text)
returns text language sql immutable strict set search_path = '' as $$
  select encode(extensions.digest(convert_to(p_text,'UTF8'),'sha256'),'hex');
$$;
-- Exact-byte SHA-256 for immutable manifest transport and independent receipt hashing.
-- Manifest transport hashes canonical_text bytes; JSONB's stable text is retained.
create function internal_financial_correction.service_only()
returns void language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'CORRECTION_SERVICE_ONLY' using errcode = '42501';
  end if;
end $$;
revoke all on all functions in schema internal_financial_correction
  from public, anon, authenticated, service_role;
commit;
