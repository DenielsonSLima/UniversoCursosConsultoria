begin;
set local lock_timeout = '5s';

-- One-off, immutable authorization for the single reviewed title whose year was
-- confirmed wrong. The old run remains immutable; this overlay is the only
-- accepted projection of its reviewed due date.
create table internal_academic.technical_manual_banese_due_date_overlay (
  correction_request_id uuid primary key check (
    correction_request_id = '58ff2178-27f4-4994-9013-697fd935fd9f'::uuid
  ),
  receivable_id uuid not null unique
    references public.contas_receber(id) on delete restrict check (
      receivable_id = '22c59dbe-0d77-4c2f-8842-4327b1c17147'::uuid
    ),
  source_transaction_id uuid not null unique
    references public.payment_gateway_transactions(id) on delete restrict check (
      source_transaction_id = '340d0d1e-1171-41e9-95d2-b517b91bb450'::uuid
    ),
  matricula_id uuid not null check (
    matricula_id = '42998678-954a-400e-b8d6-780d99c8586d'::uuid
  ),
  turma_id uuid not null check (
    turma_id = '78fd9e65-de3a-4e00-8a99-6fe8804e1d42'::uuid
  ),
  cycle_number smallint not null check (cycle_number = 1),
  cycle_request_id uuid not null check (
    cycle_request_id = '4c47d993-aa6e-403e-8569-e89ce543fa5a'::uuid
  ),
  expected_item_count integer not null check (expected_item_count = 12),
  authorization_request_id uuid not null check (
    authorization_request_id = '35190871-1521-5acc-b39d-d22759309b75'::uuid
  ),
  reviewed_item_key text not null check (reviewed_item_key = 'ciclo-1-parc-12'),
  original_due_date date not null check (original_due_date = date '2027-10-15'),
  corrected_due_date date not null check (corrected_due_date = date '2026-10-15'),
  original_actor_id uuid not null references auth.users(id) on delete restrict,
  expected_receivable_updated_at timestamptz not null,
  expected_transaction_updated_at timestamptz not null,
  original_receivable_fingerprint text not null check (
    original_receivable_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  receivable_pre_snapshot jsonb not null check (
    jsonb_typeof(receivable_pre_snapshot) = 'object'
  ),
  transaction_pre_snapshot jsonb not null check (
    jsonb_typeof(transaction_pre_snapshot) = 'object'
  ),
  authorization_pre_snapshot jsonb not null check (
    jsonb_typeof(authorization_pre_snapshot) = 'object'
  ),
  reason text not null check (
    reason = 'CORRECAO_EXPLICITA_VENCIMENTO_2027_PARA_2026'
  ),
  created_at timestamptz not null default now(),
  foreign key (matricula_id, cycle_number)
    references internal_academic.technical_manual_cycle_runs(
      matricula_id, cycle_number
    ) on delete restrict
);

alter table internal_academic.technical_manual_banese_due_date_overlay
  enable row level security;
revoke all on table
  internal_academic.technical_manual_banese_due_date_overlay
  from public, anon, authenticated, service_role;

create function
internal_academic.prevent_technical_manual_due_date_overlay_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  raise exception 'O overlay da correção de vencimento técnico é imutável.'
    using errcode = '55000';
end;
$function$;
revoke all on function
  internal_academic.prevent_technical_manual_due_date_overlay_mutation()
  from public, anon, authenticated, service_role;
create trigger prevent_technical_manual_due_date_overlay_mutation
before update or delete
on internal_academic.technical_manual_banese_due_date_overlay
for each row execute function
  internal_academic.prevent_technical_manual_due_date_overlay_mutation();

create function
internal_academic.technical_manual_due_date_correction_bypass_valid(
  p_receivable_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    or session_user in ('postgres', 'supabase_admin', 'service_role')
  ) and exists (
    select 1
    from internal_academic.technical_manual_banese_due_date_overlay overlay
    join internal_academic.technical_manual_banese_reissue_jobs job
      on job.receivable_id = overlay.receivable_id
     and job.recovery_request_id = overlay.authorization_request_id
     and job.cycle_request_id = overlay.cycle_request_id
    join internal_academic.technical_manual_banese_reissue_archive archive
      on archive.job_id = job.id
     and archive.receivable_id = overlay.receivable_id
     and archive.recovery_request_id = overlay.authorization_request_id
    join public.contas_receber receivable
      on receivable.id = overlay.receivable_id
    where overlay.receivable_id = p_receivable_id
      and overlay.correction_request_id::text = current_setting(
        'app.technical_manual_due_date_correction_id', true)
      and job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true)
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true)
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true)
      and job.status = 'CANCEL_CONFIRMED'
      and job.lease_valid_until > clock_timestamp()
      and archive.remote_cancel_situation_code = 5
      and to_jsonb(receivable) = overlay.receivable_pre_snapshot
  );
$function$;
revoke all on function
  internal_academic.technical_manual_due_date_correction_bypass_valid(uuid)
  from public, anon, authenticated, service_role;

create function internal_academic.guard_technical_due_date_overlay_receivable()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_status text;
begin
  select job.status into v_status
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  join internal_academic.technical_manual_banese_reissue_jobs job
    on job.receivable_id = overlay.receivable_id
   and job.recovery_request_id = overlay.authorization_request_id
  where overlay.receivable_id = old.id;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Recebível do overlay one-off não pode ser removido.'
      using errcode = '55000';
  end if;
  if v_status in ('FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED')
    and not internal_academic.technical_manual_due_date_correction_bypass_valid(
      old.id)
  then
    raise exception 'Recebível bloqueado pela correção one-off de vencimento.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;
revoke all on function
  internal_academic.guard_technical_due_date_overlay_receivable()
  from public, anon, authenticated, service_role;
create trigger a0_guard_technical_due_date_overlay_receivable
before update or delete on public.contas_receber
for each row execute function
  internal_academic.guard_technical_due_date_overlay_receivable();

create function internal_academic.guard_technical_due_date_overlay_transaction()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_overlay internal_academic.technical_manual_banese_due_date_overlay%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
begin
  select overlay.* into v_overlay
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  where overlay.source_transaction_id = old.id;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Transação arquivada no overlay one-off é imutável.'
      using errcode = '55000';
  end if;
  select job.* into strict v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = v_overlay.receivable_id
    and job.recovery_request_id = v_overlay.authorization_request_id;
  if coalesce(auth.role(), '') <> 'service_role'
      and session_user not in ('postgres', 'supabase_admin', 'service_role')
    or v_overlay.correction_request_id::text is distinct from current_setting(
      'app.technical_manual_due_date_correction_id', true)
    or v_job.id::text is distinct from current_setting(
      'app.technical_manual_banese_reissue_job_id', true)
    or v_job.lease_token::text is distinct from current_setting(
      'app.technical_manual_banese_reissue_lease_token', true)
    or v_job.status <> 'CANCEL_CONFIRMED'
    or v_job.lease_valid_until <= clock_timestamp()
    or to_jsonb(old) is distinct from v_overlay.transaction_pre_snapshot
    or new.receivable_id is not null
    or new.remote_status is distinct from 'CANCELED'
    or new.last_error is not null
    or new.synced_at is null or new.updated_at is null
    or new.synced_at is distinct from new.updated_at
    or new.updated_at <= old.updated_at
    or to_jsonb(new) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ]
  then
    raise exception 'Transação bloqueada pelo overlay one-off.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;
revoke all on function
  internal_academic.guard_technical_due_date_overlay_transaction()
  from public, anon, authenticated, service_role;
create trigger a0_guard_technical_due_date_overlay_transaction
before update or delete on public.payment_gateway_transactions
for each row execute function
  internal_academic.guard_technical_due_date_overlay_transaction();

do $guard$
declare
  v_assert_definition text := pg_get_functiondef(
    'internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)'::regprocedure);
  v_identity_definition text := pg_get_functiondef(
    'internal_academic.guard_manual_cycle_reviewed_identity()'::regprocedure);
begin
  if md5(v_assert_definition) <> '841f8620ce502c55e3443f3b3521dbd9'
    or position(
      'coalesce(item->>''destinoCobranca'',''BANESE'')' in
      v_assert_definition) = 0
    or position(
      'v_run.reviewed_items is null then return' in v_assert_definition) = 0
  then
    raise exception
      'Canonical reviewed-receivable assertion drifted; one-off aborted.';
  end if;
  if md5(v_identity_definition) <> 'ed137a83b6bad60fb4677d60921a318c'
    or position(
      'new.data_vencimento' in v_identity_definition) = 0
    or position(
      'run.reviewed_items is not null' in v_identity_definition) = 0
  then
    raise exception
      'Canonical reviewed-identity guard drifted; one-off aborted.';
  end if;
end;
$guard$;

create or replace function internal_academic.assert_manual_cycle_reviewed_receivable(
  p_receivable public.contas_receber
)
returns void language plpgsql stable security definer set search_path = '' as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_matches integer;
  v_overlay_matches integer;
begin
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where p_receivable.id = any(run.receivable_ids) and run.state = 'LOCAL_CREATED';
  if v_run.reviewed_items is null then return; end if;
  select count(*) into v_matches from jsonb_array_elements(v_run.reviewed_items) item
  where item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'vencimento')::date = p_receivable.data_vencimento
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  select count(*) into v_overlay_matches
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  cross join lateral jsonb_array_elements(v_run.reviewed_items) item
  where overlay.receivable_id = p_receivable.id
    and overlay.matricula_id = v_run.matricula_id
    and overlay.turma_id = v_run.turma_id
    and overlay.cycle_number = v_run.cycle_number
    and overlay.cycle_request_id = v_run.request_id
    and overlay.expected_item_count = v_run.item_count
    and overlay.reviewed_item_key = item->>'chave'
    and overlay.original_due_date = (item->>'vencimento')::date
    and overlay.corrected_due_date = p_receivable.data_vencimento
    and item->>'chave' = p_receivable.origem_cronograma_id
    and (item->>'valor')::numeric = p_receivable.valor
    and item->>'tipo' = p_receivable.tipo_lancamento
    and (item->>'numero')::integer = p_receivable.parcela_numero
    and coalesce(item->>'destinoCobranca', 'BANESE') = coalesce(
      p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca',
      'BANESE');
  if (v_matches <> 1 and v_overlay_matches <> 1)
    or v_run.matricula_id is distinct from p_receivable.matricula_id
    or v_run.turma_id is distinct from p_receivable.turma_id
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'
      is distinct from v_run.request_id::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'
      is distinct from v_run.cycle_number::text
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'
      is distinct from v_run.rule_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'
      is distinct from v_run.policy_fingerprint
    or p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'
      is distinct from v_run.schedule_fingerprint
    or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=v_run.matricula_id and m.turma_id=v_run.turma_id
        and m.aluno_id=p_receivable.cliente_id and t.polo_id=p_receivable.polo_id)
  then
    raise exception 'Recebível diverge da revisão canônica do ciclo manual.'
      using errcode = '23514';
  end if;
end;
$function$;

create or replace function internal_academic.guard_manual_cycle_reviewed_identity()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
      new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor,new.data_vencimento)
    is distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
      old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor,old.data_vencimento)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where old.id=any(run.receivable_ids) and run.reviewed_items is not null)
    and not (
      row(new.id,new.cliente_id,new.matricula_id,new.turma_id,new.polo_id,
        new.tipo_lancamento,new.origem_cronograma_id,new.parcela_numero,new.valor)
      is not distinct from row(old.id,old.cliente_id,old.matricula_id,old.turma_id,old.polo_id,
        old.tipo_lancamento,old.origem_cronograma_id,old.parcela_numero,old.valor)
      and new.data_vencimento is distinct from old.data_vencimento
      and internal_academic.technical_manual_due_date_correction_bypass_valid(old.id)
    )
  then
    raise exception 'A identidade e o vencimento revisados do ciclo manual são imutáveis.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
commit;
