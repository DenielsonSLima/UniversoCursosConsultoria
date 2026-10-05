begin;

-- One academic enrollment; one immutable financial identity per purchase attempt.
create table public.ead_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id),
  aluno_id uuid not null references public.parceiros(id),
  turma_id uuid not null references public.turmas(id),
  curso_id uuid not null references public.cursos(id),
  receivable_id uuid not null unique references public.contas_receber(id) deferrable initially deferred,
  inscription_id uuid not null unique references public.inscricoes_online(id) deferrable initially deferred,
  transaction_id uuid unique references public.payment_gateway_transactions(id),
  sequence_number integer not null check(sequence_number>0),
  nature text not null default 'COMPRA_OPCIONAL' check(nature='COMPRA_OPCIONAL'),
  state text not null check(state in ('RESERVED','OPEN','PAYMENT_RECOVERY_FENCED','EXPIRED','PAID','PAID_REVIEW')),
  is_current boolean not null default true,
  canceled_at timestamptz,paid_at timestamptz,
  payment_fingerprint text check(payment_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(matricula_id,sequence_number),
  unique(id,matricula_id,aluno_id,turma_id),
  unique(id,receivable_id,inscription_id)
);
create unique index ead_checkout_attempt_current_uidx
  on public.ead_checkout_attempts(matricula_id) where is_current;
alter table public.contas_receber add column ead_checkout_attempt_id uuid unique,
  add constraint contas_receber_ead_attempt_identity_fk
  foreign key(ead_checkout_attempt_id,matricula_id,cliente_id,turma_id)
  references public.ead_checkout_attempts(id,matricula_id,aluno_id,turma_id);
alter table public.inscricoes_online add column ead_checkout_attempt_id uuid unique
  references public.ead_checkout_attempts(id);
-- Only purchases managed by the attempt RPC are exempt from the legacy singleton.
-- Rolling deployment: keep the published singleton contracts until every
-- inscription writer has switched to exact identity/CAS (final release step).
create unique index contas_receber_legacy_matricula_uidx on public.contas_receber(matricula_id)
  where matricula_id is not null and tipo_lancamento='MATRICULA' and ead_checkout_attempt_id is null;
create unique index inscricoes_online_legacy_matricula_uidx on public.inscricoes_online(matricula_id)
  where ead_checkout_attempt_id is null;

create table public.ead_checkout_requests (
  request_id uuid primary key,aluno_id uuid not null,turma_id uuid not null,
  attempt_id uuid not null references public.ead_checkout_attempts(id),
  payload jsonb not null,created_at timestamptz not null default now()
);
create table public.ead_payment_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ead_checkout_attempts(id),
  other_attempt_id uuid references public.ead_checkout_attempts(id),
  receivable_id uuid not null references public.contas_receber(id),
  polo_id uuid not null references public.polos(id),
  reason text not null check(reason in ('DUPLICATE_PAYMENT','PAYMENT_EVIDENCE_MISMATCH','PENDING_ATTEMPT_CANCELLATION','CHECKOUT_CREATION_UNCERTAIN')),
  state text not null default 'OPEN' check(state in ('OPEN','RESOLVED')),
  evidence jsonb not null,assigned_to uuid,
  resolution_action text,resolution_request_id uuid unique,resolved_by uuid,resolved_at timestamptz,
  refund_expense_id uuid unique references public.despesas_lancamentos(id),resolution_notes text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(attempt_id,reason)
);
create index ead_payment_reviews_open_polo_idx on public.ead_payment_reviews(polo_id,created_at) where state='OPEN';
alter table public.banese_ead_checkout_expiration_jobs
  add column attempt_id uuid references public.ead_checkout_attempts(id),
  add column cancel_reason text not null default 'EXPIRED_OPTIONAL'
    check(cancel_reason in ('EXPIRED_OPTIONAL','DUPLICATE_PENDING')),
  add column official_last_payment_date date,
  add column preflight_fingerprint text,
  add column recovery_fingerprint text;

alter table public.ead_checkout_attempts enable row level security;
alter table public.ead_checkout_requests enable row level security;
alter table public.ead_payment_reviews enable row level security;
revoke all on public.ead_checkout_attempts,public.ead_checkout_requests,public.ead_payment_reviews
  from public,anon,authenticated,service_role;
grant select on public.ead_checkout_attempts,public.ead_payment_reviews to service_role;

create function internal_contas.ead_assert_service_role()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Integração EAD não autorizada.' using errcode='42501';
  end if;
end; $$;
revoke all on function internal_contas.ead_assert_service_role() from public,anon,authenticated,service_role;

create function public.guard_ead_checkout_attempt_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_attempt public.ead_checkout_attempts%rowtype;
begin
  if tg_op='DELETE' then
    if old.ead_checkout_attempt_id is not null then
      raise exception 'Histórico da tentativa EAD não pode ser excluído.' using errcode='PT409';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.ead_checkout_attempt_id is not null
    and new.ead_checkout_attempt_id is distinct from old.ead_checkout_attempt_id then
    raise exception 'Tentativa EAD imutável.' using errcode='PT409';
  end if;
  if new.ead_checkout_attempt_id is null then return new; end if;
  select * into strict v_attempt from public.ead_checkout_attempts where id=new.ead_checkout_attempt_id;
  if tg_table_name='contas_receber' then
    if new.id is distinct from v_attempt.receivable_id or new.tipo_lancamento is distinct from 'MATRICULA'
      or new.matricula_id is distinct from v_attempt.matricula_id or new.cliente_id is distinct from v_attempt.aluno_id
      or new.turma_id is distinct from v_attempt.turma_id then raise exception 'Identidade do título EAD divergente.' using errcode='PT409'; end if;
    if v_attempt.state='PAYMENT_RECOVERY_FENCED' and new.status is distinct from old.status
      and not internal_contas.ead_expiration_write_allowed(new.id) then
      raise exception 'Nova tentativa aguarda cancelamento bancário.' using errcode='PT409';
    end if;
  else
    if new.id is distinct from v_attempt.inscription_id or new.receivable_id is distinct from v_attempt.receivable_id
      or new.matricula_id is distinct from v_attempt.matricula_id or new.aluno_id is distinct from v_attempt.aluno_id
      or new.turma_id is distinct from v_attempt.turma_id or new.curso_id is distinct from v_attempt.curso_id then
      raise exception 'Identidade da inscrição EAD divergente.' using errcode='PT409'; end if;
  end if;
  return new;
end; $$;
create trigger a_guard_ead_checkout_attempt_receivable before insert or update or delete on public.contas_receber
  for each row execute function public.guard_ead_checkout_attempt_identity();
create trigger a_guard_ead_checkout_attempt_inscription before insert or update or delete on public.inscricoes_online
  for each row execute function public.guard_ead_checkout_attempt_identity();
revoke all on function public.guard_ead_checkout_attempt_identity() from public,anon,authenticated,service_role;

commit;
