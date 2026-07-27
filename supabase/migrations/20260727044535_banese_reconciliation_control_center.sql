-- Central operacional de consulta da API Banese.
-- Este modulo apenas consulta titulos ja emitidos e confirma pagamentos.
-- Ele nao cria, reemite, cancela ou projeta cobrancas futuras.

create table if not exists public.banese_reconciliation_profiles (
  id smallint primary key,
  name text not null,
  titles_per_minute integer not null,
  estimated_requests_per_minute integer not null,
  capacity_per_hour integer generated always as (titles_per_minute * 60) stored,
  group_name text not null check (group_name in ('CONSERVATIVE', 'EXPERIMENTAL')),
  sicredi_reference_percent numeric(5,2),
  selectable boolean not null default false,
  source_note text not null,
  created_at timestamptz not null default now(),
  constraint banese_reconciliation_profiles_id_check check (id between 1 and 10),
  constraint banese_reconciliation_profiles_capacity_check check (
    titles_per_minute > 0
    and estimated_requests_per_minute = titles_per_minute * 2
  ),
  constraint banese_reconciliation_profiles_advanced_lock_check check (
    (id <= 6 and group_name = 'CONSERVATIVE' and selectable)
    or (id >= 7 and group_name = 'EXPERIMENTAL' and not selectable)
  )
);

insert into public.banese_reconciliation_profiles (
  id,
  name,
  titles_per_minute,
  estimated_requests_per_minute,
  group_name,
  sicredi_reference_percent,
  selectable,
  source_note
)
values
  (1, 'Recuperação', 1, 2, 'CONSERVATIVE', null, true, 'Retomada controlada após indisponibilidade.'),
  (2, 'Base distribuída', 2, 4, 'CONSERVATIVE', null, true, 'Equivale ao ritmo anterior de 10 títulos a cada 5 minutos, distribuído por minuto.'),
  (3, 'Transição', 3, 6, 'CONSERVATIVE', null, true, 'Primeiro aumento gradual.'),
  (4, 'Cauteloso', 5, 10, 'CONSERVATIVE', null, true, 'Teste intermediário com observação.'),
  (5, 'Moderado', 8, 16, 'CONSERVATIVE', null, true, 'Aproximação gradual do perfil EAD.'),
  (6, 'EAD recomendado', 10, 20, 'CONSERVATIVE', null, true, 'Teto automático inicial para operação com prioridade EAD.'),
  (7, 'Experimental 20%', 90, 180, 'EXPERIMENTAL', 20, false, 'Referência comparativa de 20% sobre 15 TPS publicados pelo Sicredi; não é limite autorizado pelo Banese.'),
  (8, 'Experimental 40%', 180, 360, 'EXPERIMENTAL', 40, false, 'Referência comparativa de 40% sobre 15 TPS publicados pelo Sicredi; não é limite autorizado pelo Banese.'),
  (9, 'Experimental 60%', 270, 540, 'EXPERIMENTAL', 60, false, 'Referência comparativa de 60% sobre 15 TPS publicados pelo Sicredi; não é limite autorizado pelo Banese.'),
  (10, 'Experimental 80%', 360, 720, 'EXPERIMENTAL', 80, false, 'Referência comparativa de 80% sobre 15 TPS publicados pelo Sicredi, preservando 20% de margem; não é limite autorizado pelo Banese.')
on conflict (id) do update
set name = excluded.name,
    titles_per_minute = excluded.titles_per_minute,
    estimated_requests_per_minute = excluded.estimated_requests_per_minute,
    group_name = excluded.group_name,
    sicredi_reference_percent = excluded.sicredi_reference_percent,
    selectable = excluded.selectable,
    source_note = excluded.source_note;

create table if not exists public.banese_reconciliation_config (
  environment text primary key check (environment in ('sandbox', 'production')),
  mode text not null default 'AUTOMATIC' check (mode in ('MANUAL', 'AUTOMATIC', 'PAUSED')),
  selected_profile_id smallint not null default 6 references public.banese_reconciliation_profiles(id),
  effective_profile_id smallint not null default 2 references public.banese_reconciliation_profiles(id),
  last_stable_profile_id smallint not null default 2 references public.banese_reconciliation_profiles(id),
  state text not null default 'OBSERVING' check (state in ('OBSERVING', 'STABLE', 'COOLDOWN', 'SUSPENDED', 'PAUSED')),
  stable_since timestamptz not null default now(),
  cooldown_until timestamptz,
  suspended_reason text,
  oauth_reuse_enabled boolean not null default true,
  oauth_refresh_margin_seconds integer not null default 60 check (oauth_refresh_margin_seconds between 30 and 300),
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banese_reconciliation_config_profile_order_check check (
    effective_profile_id between 1 and 6
    and last_stable_profile_id between 1 and 6
    and selected_profile_id between 1 and 6
    and effective_profile_id <= selected_profile_id
  )
);

insert into public.banese_reconciliation_config (
  environment,
  mode,
  selected_profile_id,
  effective_profile_id,
  last_stable_profile_id
)
values
  ('sandbox', 'AUTOMATIC', 6, 2, 2),
  ('production', 'AUTOMATIC', 6, 2, 2)
on conflict (environment) do nothing;

create table if not exists public.banese_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('sandbox', 'production')),
  mode text not null check (mode in ('MANUAL', 'AUTOMATIC')),
  profile_id smallint not null references public.banese_reconciliation_profiles(id),
  target_titles integer not null check (target_titles between 1 and 10),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'THROTTLED', 'ABANDONED')),
  claimed integer not null default 0 check (claimed >= 0),
  checked integer not null default 0 check (checked >= 0),
  pending integer not null default 0 check (pending >= 0),
  paid integer not null default 0 check (paid >= 0),
  failed integer not null default 0 check (failed >= 0),
  throttled boolean not null default false,
  oauth_requests integer not null default 0 check (oauth_requests >= 0),
  oauth_reused boolean not null default false,
  decision text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists banese_reconciliation_runs_environment_started_idx
  on public.banese_reconciliation_runs(environment, started_at desc);
create unique index if not exists banese_reconciliation_one_running_per_environment_idx
  on public.banese_reconciliation_runs(environment)
  where status = 'RUNNING';

create table if not exists public.banese_reconciliation_queue (
  receivable_id uuid primary key references public.contas_receber(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  modality text not null default 'OUTROS_CREDITOS',
  priority smallint not null default 50,
  state text not null default 'READY' check (state in ('READY', 'LEASED', 'DONE', 'QUARANTINED')),
  next_check_at timestamptz,
  lease_run_id uuid references public.banese_reconciliation_runs(id) on delete set null,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  issued_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_result text,
  last_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banese_reconciliation_queue_lease_check check (
    (state = 'LEASED' and lease_run_id is not null and lease_until is not null)
    or state <> 'LEASED'
  )
);

create index if not exists banese_reconciliation_queue_claim_idx
  on public.banese_reconciliation_queue(environment, priority, next_check_at, issued_at)
  where state in ('READY', 'LEASED');

create table if not exists public.banese_reconciliation_attempts (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.banese_reconciliation_runs(id) on delete cascade,
  receivable_id uuid not null references public.contas_receber(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  modality text not null,
  result text not null check (result in ('PENDING', 'PAID', 'ERROR', 'THROTTLED')),
  remote_status text,
  error_class text,
  http_status integer,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, receivable_id)
);

create index if not exists banese_reconciliation_attempts_created_idx
  on public.banese_reconciliation_attempts(environment, created_at desc);
create index if not exists banese_reconciliation_attempts_result_idx
  on public.banese_reconciliation_attempts(environment, result, created_at desc);

create table if not exists public.banese_reconciliation_transitions (
  id bigint generated always as identity primary key,
  environment text not null check (environment in ('sandbox', 'production')),
  transition_type text not null,
  from_profile_id smallint references public.banese_reconciliation_profiles(id),
  to_profile_id smallint references public.banese_reconciliation_profiles(id),
  from_mode text,
  to_mode text,
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  run_id uuid references public.banese_reconciliation_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists banese_reconciliation_transitions_created_idx
  on public.banese_reconciliation_transitions(environment, created_at desc);

alter table public.banese_reconciliation_profiles enable row level security;
alter table public.banese_reconciliation_config enable row level security;
alter table public.banese_reconciliation_runs enable row level security;
alter table public.banese_reconciliation_queue enable row level security;
alter table public.banese_reconciliation_attempts enable row level security;
alter table public.banese_reconciliation_transitions enable row level security;

revoke all on public.banese_reconciliation_profiles from public, anon, authenticated;
revoke all on public.banese_reconciliation_config from public, anon, authenticated;
revoke all on public.banese_reconciliation_runs from public, anon, authenticated;
revoke all on public.banese_reconciliation_queue from public, anon, authenticated;
revoke all on public.banese_reconciliation_attempts from public, anon, authenticated;
revoke all on public.banese_reconciliation_transitions from public, anon, authenticated;

grant select on public.banese_reconciliation_profiles to authenticated;
grant select on public.banese_reconciliation_config to authenticated;
grant select on public.banese_reconciliation_runs to authenticated;
grant select on public.banese_reconciliation_queue to authenticated;
grant select on public.banese_reconciliation_attempts to authenticated;
grant select on public.banese_reconciliation_transitions to authenticated;
grant all on public.banese_reconciliation_profiles to service_role;
grant all on public.banese_reconciliation_config to service_role;
grant all on public.banese_reconciliation_runs to service_role;
grant all on public.banese_reconciliation_queue to service_role;
grant all on public.banese_reconciliation_attempts to service_role;
grant all on public.banese_reconciliation_transitions to service_role;
grant usage, select on sequence public.banese_reconciliation_attempts_id_seq to service_role;
grant usage, select on sequence public.banese_reconciliation_transitions_id_seq to service_role;

drop policy if exists banese_reconciliation_profiles_config_read on public.banese_reconciliation_profiles;
create policy banese_reconciliation_profiles_config_read
on public.banese_reconciliation_profiles
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists banese_reconciliation_config_config_read on public.banese_reconciliation_config;
create policy banese_reconciliation_config_config_read
on public.banese_reconciliation_config
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists banese_reconciliation_runs_config_read on public.banese_reconciliation_runs;
create policy banese_reconciliation_runs_config_read
on public.banese_reconciliation_runs
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists banese_reconciliation_queue_config_read on public.banese_reconciliation_queue;
create policy banese_reconciliation_queue_config_read
on public.banese_reconciliation_queue
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists banese_reconciliation_attempts_config_read on public.banese_reconciliation_attempts;
create policy banese_reconciliation_attempts_config_read
on public.banese_reconciliation_attempts
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists banese_reconciliation_transitions_config_read on public.banese_reconciliation_transitions;
create policy banese_reconciliation_transitions_config_read
on public.banese_reconciliation_transitions
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

create or replace function public.banese_reconciliation_resolve_modality(
  p_receivable_id uuid,
  p_turma_id uuid,
  p_matricula_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select upper(c.modalidade)
      from public.turmas t
      join public.cursos c on c.id = t.curso_id
      where t.id = p_turma_id
      limit 1
    ),
    (
      select upper(c.modalidade)
      from public.matriculas m
      join public.turmas t on t.id = m.turma_id
      join public.cursos c on c.id = t.curso_id
      where m.id = p_matricula_id
      limit 1
    ),
    (
      select upper(c.modalidade)
      from public.inscricoes_online io
      join public.cursos c on c.id = io.curso_id
      where io.receivable_id = p_receivable_id
      order by io.created_at desc
      limit 1
    ),
    'OUTROS_CREDITOS'
  );
$$;

revoke all on function public.banese_reconciliation_resolve_modality(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.banese_reconciliation_resolve_modality(uuid, uuid, uuid)
  to service_role;

create or replace function public.banese_reconciliation_queue_receivable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modality text;
  v_eligible boolean;
begin
  v_eligible :=
    new.gateway_provider = 'banese_card'
    and new.gateway_payment_method = 'BOLETO'
    and new.gateway_environment in ('sandbox', 'production')
    and new.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    and coalesce(new.gateway_status, '') not in (
      'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
      'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
    );

  if not v_eligible then
    update public.banese_reconciliation_queue
    set state = case
          when state = 'LEASED' and lease_until > now() then 'LEASED'
          else 'DONE'
        end,
        next_check_at = null,
        lease_run_id = case
          when state = 'LEASED' and lease_until > now() then lease_run_id
          else null
        end,
        lease_until = case
          when state = 'LEASED' and lease_until > now() then lease_until
          else null
        end,
        last_result = coalesce(new.status, new.gateway_status, 'TERMINAL'),
        updated_at = now()
    where receivable_id = new.id;
    return new;
  end if;

  v_modality := public.banese_reconciliation_resolve_modality(
    new.id,
    new.turma_id,
    new.matricula_id
  );

  insert into public.banese_reconciliation_queue (
    receivable_id,
    environment,
    modality,
    priority,
    state,
    next_check_at,
    issued_at
  )
  values (
    new.id,
    new.gateway_environment,
    v_modality,
    case
      when v_modality = 'EAD' then 10
      when v_modality in ('LIVRE', 'ESPECIALIZACAO') then 20
      when new.status = 'VENCIDO' then 35
      else 50
    end,
    'READY',
    now(),
    coalesce(new.gateway_boleto_issued_at, new.created_at, now())
  )
  on conflict (receivable_id) do update
  set environment = excluded.environment,
      modality = excluded.modality,
      priority = excluded.priority,
      state = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then 'LEASED'
        else 'READY'
      end,
      next_check_at = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then public.banese_reconciliation_queue.next_check_at
        else least(
          coalesce(public.banese_reconciliation_queue.next_check_at, now()),
          now()
        )
      end,
      updated_at = now();

  return new;
end;
$$;

revoke all on function public.banese_reconciliation_queue_receivable()
  from public, anon, authenticated;

drop trigger if exists trg_banese_reconciliation_queue_receivable on public.contas_receber;
create trigger trg_banese_reconciliation_queue_receivable
after insert or update of
  gateway_provider,
  gateway_payment_method,
  gateway_environment,
  gateway_boleto_nosso_numero,
  gateway_status,
  gateway_submission_status,
  status,
  turma_id,
  matricula_id
on public.contas_receber
for each row
execute function public.banese_reconciliation_queue_receivable();

insert into public.banese_reconciliation_queue (
  receivable_id,
  environment,
  modality,
  priority,
  state,
  next_check_at,
  issued_at
)
select
  cr.id,
  cr.gateway_environment,
  modality.value,
  case
    when modality.value = 'EAD' then 10
    when modality.value in ('LIVRE', 'ESPECIALIZACAO') then 20
    when cr.status = 'VENCIDO' then 35
    else 50
  end,
  'READY',
  now(),
  coalesce(cr.gateway_boleto_issued_at, cr.created_at, now())
from public.contas_receber cr
cross join lateral (
  select public.banese_reconciliation_resolve_modality(
    cr.id,
    cr.turma_id,
    cr.matricula_id
  ) as value
) modality
where cr.gateway_provider = 'banese_card'
  and cr.gateway_payment_method = 'BOLETO'
  and cr.gateway_environment in ('sandbox', 'production')
  and cr.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
  and coalesce(cr.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
  and coalesce(cr.gateway_status, '') not in (
    'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
    'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
  )
on conflict (receivable_id) do nothing;

create or replace function public.get_banese_reconciliation_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_available boolean;
  v_result jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado à Consulta API Banese.'
      using errcode = '42501';
  end if;

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;

  v_environment := coalesce(v_environment, 'sandbox');
  select exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method in ('BOLETO', 'PIX')
      and route.enabled
  )
  into v_available;

  if not v_available then
    return jsonb_build_object(
      'available', false,
      'environment', v_environment
    );
  end if;

  select jsonb_build_object(
    'available', true,
    'environment', v_environment,
    'config', to_jsonb(config),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(profile) order by profile.id), '[]'::jsonb)
      from public.banese_reconciliation_profiles profile
    ),
    'queue', jsonb_build_object(
      'ready', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'READY'
          and coalesce(queue.next_check_at, now()) <= now()
      ),
      'leased', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'LEASED'
          and queue.lease_until > now()
      ),
      'eadReady', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.modality = 'EAD'
          and queue.state = 'READY'
          and coalesce(queue.next_check_at, now()) <= now()
      ),
      'quarantined', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'QUARANTINED'
      )
    ),
    'lastRuns', (
      select coalesce(jsonb_agg(to_jsonb(run) order by run.started_at desc), '[]'::jsonb)
      from (
        select id, environment, mode, profile_id, target_titles, status,
               claimed, checked, pending, paid, failed, throttled,
               oauth_requests, oauth_reused, decision, duration_ms,
               started_at, finished_at
        from public.banese_reconciliation_runs
        where environment = v_environment
        order by started_at desc
        limit 30
      ) run
    ),
    'lastAttempts', (
      select coalesce(jsonb_agg(to_jsonb(attempt) order by attempt.created_at desc), '[]'::jsonb)
      from (
        select id, run_id, receivable_id, modality, result, remote_status,
               error_class, http_status, duration_ms, created_at
        from public.banese_reconciliation_attempts
        where environment = v_environment
        order by created_at desc
        limit 50
      ) attempt
    ),
    'transitions', (
      select coalesce(jsonb_agg(to_jsonb(transition) order by transition.created_at desc), '[]'::jsonb)
      from (
        select id, transition_type, from_profile_id, to_profile_id,
               from_mode, to_mode, reason, created_at
        from public.banese_reconciliation_transitions
        where environment = v_environment
        order by created_at desc
        limit 30
      ) transition
    )
  )
  into v_result
  from public.banese_reconciliation_config config
  where config.environment = v_environment;

  return coalesce(
    v_result,
    jsonb_build_object('available', true, 'environment', v_environment)
  );
end;
$$;

revoke all on function public.get_banese_reconciliation_dashboard()
  from public, anon;
grant execute on function public.get_banese_reconciliation_dashboard()
  to authenticated, service_role;

create or replace function public.update_banese_reconciliation_config(
  p_mode text,
  p_profile_id integer,
  p_expected_version bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_mode text := upper(trim(coalesce(p_mode, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_before public.banese_reconciliation_config%rowtype;
  v_after public.banese_reconciliation_config%rowtype;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado à configuração da Consulta API Banese.'
      using errcode = '42501';
  end if;
  if v_mode not in ('MANUAL', 'AUTOMATIC', 'PAUSED') then
    raise exception 'Modo de operação inválido.';
  end if;
  if length(v_reason) < 5 or length(v_reason) > 300 then
    raise exception 'Informe um motivo entre 5 e 300 caracteres.';
  end if;
  if not exists (
    select 1
    from public.banese_reconciliation_profiles profile
    where profile.id = p_profile_id
      and profile.selectable
      and profile.id <= 6
  ) then
    raise exception 'Perfil bloqueado até confirmação formal do limite pelo Banese.';
  end if;

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;

  if not exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method in ('BOLETO', 'PIX')
      and route.enabled
  ) then
    raise exception 'O Banese não é o responsável pelas cobranças no ambiente ativo.';
  end if;

  select *
  into v_before
  from public.banese_reconciliation_config
  where environment = v_environment
  for update;

  if v_before.version <> p_expected_version then
    raise exception 'A configuração foi alterada por outro usuário. Atualize a tela e tente novamente.'
      using errcode = '40001';
  end if;

  update public.banese_reconciliation_config
  set mode = v_mode,
      selected_profile_id = p_profile_id,
      effective_profile_id = case
        when v_mode = 'MANUAL' then p_profile_id
        when v_mode = 'AUTOMATIC' then least(effective_profile_id, p_profile_id)
        else effective_profile_id
      end,
      last_stable_profile_id = case
        when v_mode = 'MANUAL' then p_profile_id
        else least(last_stable_profile_id, p_profile_id)
      end,
      state = case
        when v_mode = 'PAUSED' then 'PAUSED'
        else 'OBSERVING'
      end,
      stable_since = now(),
      cooldown_until = null,
      suspended_reason = null,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where environment = v_environment
    and version = p_expected_version
  returning * into v_after;

  insert into public.banese_reconciliation_transitions (
    environment,
    transition_type,
    from_profile_id,
    to_profile_id,
    from_mode,
    to_mode,
    reason,
    actor_id
  )
  values (
    v_environment,
    'ADMIN_CONFIGURATION',
    v_before.effective_profile_id,
    v_after.effective_profile_id,
    v_before.mode,
    v_after.mode,
    v_reason,
    auth.uid()
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  from public, anon;
grant execute on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  to authenticated;

create or replace function public.begin_banese_reconciliation_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_config public.banese_reconciliation_config%rowtype;
  v_profile public.banese_reconciliation_profiles%rowtype;
  v_run_id uuid;
begin
  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  where enabled
  limit 1;

  if v_environment is null or not exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method = 'BOLETO'
      and route.enabled
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'BANESE_NOT_RESPONSIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtext('banese-reconciliation-' || v_environment));

  update public.banese_reconciliation_runs
  set status = 'ABANDONED',
      decision = 'Lease da execução expirou.',
      finished_at = now()
  where environment = v_environment
    and status = 'RUNNING'
    and started_at < now() - interval '2 minutes';

  if exists (
    select 1
    from public.banese_reconciliation_runs
    where environment = v_environment
      and status = 'RUNNING'
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'RUN_ALREADY_ACTIVE');
  end if;

  select *
  into v_config
  from public.banese_reconciliation_config
  where environment = v_environment
  for update;

  if v_config.mode = 'PAUSED' then
    return jsonb_build_object('enabled', false, 'reason', 'PAUSED');
  end if;
  if v_config.state = 'SUSPENDED' then
    return jsonb_build_object('enabled', false, 'reason', 'SUSPENDED');
  end if;
  if v_config.cooldown_until is not null and v_config.cooldown_until > now() then
    return jsonb_build_object(
      'enabled', false,
      'reason', 'COOLDOWN',
      'cooldownUntil', v_config.cooldown_until
    );
  end if;

  if v_config.state = 'COOLDOWN' then
    update public.banese_reconciliation_config
    set state = 'OBSERVING',
        cooldown_until = null,
        stable_since = now(),
        updated_at = now()
    where environment = v_environment;
  end if;

  select *
  into v_profile
  from public.banese_reconciliation_profiles
  where id = least(v_config.effective_profile_id, 6)
    and selectable;

  insert into public.banese_reconciliation_runs (
    environment,
    mode,
    profile_id,
    target_titles
  )
  values (
    v_environment,
    v_config.mode,
    v_profile.id,
    least(v_profile.titles_per_minute, 10)
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'enabled', true,
    'runId', v_run_id,
    'environment', v_environment,
    'mode', v_config.mode,
    'profileId', v_profile.id,
    'targetTitles', least(v_profile.titles_per_minute, 10),
    'oauthReuseEnabled', v_config.oauth_reuse_enabled,
    'oauthRefreshMarginSeconds', v_config.oauth_refresh_margin_seconds
  );
end;
$$;

revoke all on function public.begin_banese_reconciliation_run()
  from public, anon, authenticated;
grant execute on function public.begin_banese_reconciliation_run()
  to service_role;

create or replace function public.claim_banese_reconciliation_batch_v2(
  p_run_id uuid
)
returns table(receivable_id uuid, modality text, environment text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.banese_reconciliation_runs%rowtype;
begin
  select *
  into v_run
  from public.banese_reconciliation_runs
  where id = p_run_id
    and status = 'RUNNING'
  for update;

  if v_run.id is null then
    raise exception 'Execução Banese inválida ou encerrada.';
  end if;

  return query
  with candidates as (
    select queue.receivable_id
    from public.banese_reconciliation_queue queue
    join public.contas_receber receivable
      on receivable.id = queue.receivable_id
    where queue.environment = v_run.environment
      and (
        (
          queue.state = 'READY'
          and coalesce(queue.next_check_at, '-infinity'::timestamptz) <= now()
        )
        or (
          queue.state = 'LEASED'
          and queue.lease_until <= now()
        )
      )
      and receivable.gateway_provider = 'banese_card'
      and receivable.gateway_payment_method = 'BOLETO'
      and receivable.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
      and coalesce(receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    order by
      case
        when queue.modality <> 'EAD'
          and queue.issued_at < now() - interval '24 hours' then -1
        when queue.modality = 'EAD' then 0
        when queue.priority <= 20 then 1
        else 2
      end,
      queue.priority,
      queue.next_check_at,
      queue.issued_at,
      queue.receivable_id
    limit v_run.target_titles
    for update of queue skip locked
  ),
  leased as (
    update public.banese_reconciliation_queue queue
    set state = 'LEASED',
        lease_run_id = p_run_id,
        lease_until = now() + interval '90 seconds',
        updated_at = now()
    from candidates candidate
    where queue.receivable_id = candidate.receivable_id
    returning queue.receivable_id, queue.modality, queue.environment
  )
  select leased.receivable_id, leased.modality, leased.environment
  from leased;

  update public.banese_reconciliation_runs run
  set claimed = (
    select count(*)
    from public.banese_reconciliation_queue queue
    where queue.lease_run_id = p_run_id
  )
  where run.id = p_run_id;
end;
$$;

revoke all on function public.claim_banese_reconciliation_batch_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_banese_reconciliation_batch_v2(uuid)
  to service_role;

create or replace function public.record_banese_reconciliation_attempt(
  p_run_id uuid,
  p_receivable_id uuid,
  p_result text,
  p_remote_status text,
  p_error_class text,
  p_http_status integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.banese_reconciliation_queue%rowtype;
  v_result text := upper(trim(coalesce(p_result, '')));
  v_error_class text := upper(regexp_replace(trim(coalesce(p_error_class, '')), '[^A-Z0-9_]', '', 'g'));
  v_next_check timestamptz;
begin
  if v_result not in ('PENDING', 'PAID', 'ERROR', 'THROTTLED') then
    raise exception 'Resultado de consulta Banese inválido.';
  end if;
  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception 'Status HTTP inválido.';
  end if;

  select *
  into v_queue
  from public.banese_reconciliation_queue
  where receivable_id = p_receivable_id
    and lease_run_id = p_run_id
    and state = 'LEASED'
  for update;

  if v_queue.receivable_id is null then
    raise exception 'Lease Banese inválido para registrar tentativa.';
  end if;

  insert into public.banese_reconciliation_attempts (
    run_id,
    receivable_id,
    environment,
    modality,
    result,
    remote_status,
    error_class,
    http_status,
    duration_ms
  )
  values (
    p_run_id,
    p_receivable_id,
    v_queue.environment,
    v_queue.modality,
    v_result,
    nullif(left(upper(trim(coalesce(p_remote_status, ''))), 40), ''),
    nullif(left(v_error_class, 50), ''),
    p_http_status,
    greatest(0, least(coalesce(p_duration_ms, 0), 300000))
  )
  on conflict (run_id, receivable_id) do nothing;

  if v_result = 'PAID' then
    update public.banese_reconciliation_queue
    set state = 'DONE',
        next_check_at = null,
        lease_run_id = null,
        lease_until = null,
        attempts = attempts + 1,
        consecutive_failures = 0,
        last_checked_at = now(),
        last_result = 'PAID',
        last_error_class = null,
        updated_at = now()
    where receivable_id = p_receivable_id;
    return;
  end if;

  if v_result = 'PENDING' then
    v_next_check := case
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '20 minutes'
        then now() + interval '1 minute'
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '2 hours'
        then now() + interval '5 minutes'
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '24 hours'
        then now() + interval '30 minutes'
      when v_queue.modality = 'EAD'
        then now() + interval '6 hours'
      else now() + interval '5 minutes'
    end;
  elsif v_result = 'THROTTLED' then
    v_next_check := now() + interval '1 hour';
  else
    v_next_check := now()
      + make_interval(mins => least(360, 5 * (2 ^ least(v_queue.consecutive_failures, 6))::integer));
  end if;

  update public.banese_reconciliation_queue
  set state = case
        when v_result = 'ERROR' and consecutive_failures + 1 >= 8 then 'QUARANTINED'
        else 'READY'
      end,
      next_check_at = v_next_check,
      lease_run_id = null,
      lease_until = null,
      attempts = attempts + 1,
      consecutive_failures = case
        when v_result = 'PENDING' then 0
        else consecutive_failures + 1
      end,
      last_checked_at = now(),
      last_result = v_result,
      last_error_class = nullif(left(v_error_class, 50), ''),
      updated_at = now()
  where receivable_id = p_receivable_id;
end;
$$;

revoke all on function public.record_banese_reconciliation_attempt(uuid, uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_banese_reconciliation_attempt(uuid, uuid, text, text, text, integer, integer)
  to service_role;

create or replace function public.finish_banese_reconciliation_run(
  p_run_id uuid,
  p_oauth_requests integer,
  p_oauth_reused boolean,
  p_duration_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.banese_reconciliation_runs%rowtype;
  v_config public.banese_reconciliation_config%rowtype;
  v_checked integer;
  v_pending integer;
  v_paid integer;
  v_failed integer;
  v_throttled integer;
  v_auth_failed integer;
  v_from_profile smallint;
  v_to_profile smallint;
  v_decision text := 'Perfil mantido.';
  v_status text;
  v_sample integer;
begin
  select *
  into v_run
  from public.banese_reconciliation_runs
  where id = p_run_id
    and status = 'RUNNING'
  for update;

  if v_run.id is null then
    raise exception 'Execução Banese inválida ou já encerrada.';
  end if;

  select
    count(*),
    count(*) filter (where result = 'PENDING'),
    count(*) filter (where result = 'PAID'),
    count(*) filter (where result = 'ERROR'),
    count(*) filter (where result = 'THROTTLED'),
    count(*) filter (where error_class = 'AUTH')
  into v_checked, v_pending, v_paid, v_failed, v_throttled, v_auth_failed
  from public.banese_reconciliation_attempts
  where run_id = p_run_id;

  v_status := case
    when v_throttled > 0 then 'THROTTLED'
    when v_checked = 0 and v_run.claimed > 0 then 'FAILED'
    when v_failed > 0 and v_paid + v_pending > 0 then 'PARTIAL'
    when v_failed > 0 then 'FAILED'
    else 'SUCCESS'
  end;

  select *
  into v_config
  from public.banese_reconciliation_config
  where environment = v_run.environment
  for update;

  v_from_profile := v_config.effective_profile_id;
  v_to_profile := v_from_profile;

  if v_auth_failed > 0 then
    update public.banese_reconciliation_config
    set state = 'SUSPENDED',
        suspended_reason = 'Falha de autenticação após renovação única do OAuth.',
        cooldown_until = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := 'Circuito suspenso por falha de autenticação.';
  elsif v_throttled > 0 then
    v_to_profile := greatest(1, v_from_profile - 1);
    update public.banese_reconciliation_config
    set effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN',
        stable_since = now(),
        cooldown_until = now() + interval '1 hour',
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := format('HTTP 429: retorno automático do P%s para P%s e resfriamento de 1 hora.', v_from_profile, v_to_profile);
  elsif v_failed > 0 and v_checked > 0 and v_failed::numeric / v_checked >= 0.25 then
    v_to_profile := greatest(1, v_from_profile - 1);
    update public.banese_reconciliation_config
    set effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN',
        stable_since = now(),
        cooldown_until = now() + interval '15 minutes',
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := format('Taxa de erro elevada: retorno do P%s para P%s.', v_from_profile, v_to_profile);
  elsif v_config.mode = 'AUTOMATIC'
    and v_failed = 0
    and v_throttled = 0
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < least(v_config.selected_profile_id, 6)
  then
    select count(*)
    into v_sample
    from public.banese_reconciliation_attempts attempt
    join public.banese_reconciliation_runs run on run.id = attempt.run_id
    where run.environment = v_run.environment
      and run.profile_id = v_from_profile
      and attempt.created_at >= v_config.stable_since
      and attempt.result in ('PENDING', 'PAID');

    if v_sample >= greatest(10, v_from_profile * 10) then
      v_to_profile := v_from_profile + 1;
      update public.banese_reconciliation_config
      set effective_profile_id = v_to_profile,
          last_stable_profile_id = v_from_profile,
          state = 'OBSERVING',
          stable_since = now(),
          updated_at = now()
      where environment = v_run.environment;
      v_decision := format('Amostra estável concluída: promoção do P%s para P%s.', v_from_profile, v_to_profile);
    else
      update public.banese_reconciliation_config
      set state = 'OBSERVING',
          updated_at = now()
      where environment = v_run.environment;
      v_decision := format('Perfil mantido: amostra insuficiente (%s consultas válidas).', v_sample);
    end if;
  else
    update public.banese_reconciliation_config
    set state = case
          when mode = 'MANUAL' then 'STABLE'
          else state
        end,
        updated_at = now()
    where environment = v_run.environment;
  end if;

  update public.banese_reconciliation_runs
  set status = v_status,
      checked = v_checked,
      pending = v_pending,
      paid = v_paid,
      failed = v_failed,
      throttled = v_throttled > 0,
      oauth_requests = greatest(0, coalesce(p_oauth_requests, 0)),
      oauth_reused = coalesce(p_oauth_reused, false),
      decision = v_decision,
      duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 300000)),
      finished_at = now()
  where id = p_run_id;

  update public.banese_reconciliation_queue
  set state = 'READY',
      lease_run_id = null,
      lease_until = null,
      next_check_at = greatest(coalesce(next_check_at, now()), now() + interval '1 minute'),
      updated_at = now()
  where lease_run_id = p_run_id
    and state = 'LEASED';

  if v_from_profile <> v_to_profile or v_auth_failed > 0 then
    insert into public.banese_reconciliation_transitions (
      environment,
      transition_type,
      from_profile_id,
      to_profile_id,
      from_mode,
      to_mode,
      reason,
      run_id
    )
    values (
      v_run.environment,
      case
        when v_auth_failed > 0 then 'CIRCUIT_SUSPENDED'
        when v_to_profile < v_from_profile then 'AUTOMATIC_ROLLBACK'
        else 'AUTOMATIC_PROMOTION'
      end,
      v_from_profile,
      v_to_profile,
      v_config.mode,
      v_config.mode,
      v_decision,
      p_run_id
    );
  end if;

  return jsonb_build_object(
    'status', v_status,
    'checked', v_checked,
    'pending', v_pending,
    'paid', v_paid,
    'failed', v_failed,
    'decision', v_decision,
    'effectiveProfileId', v_to_profile
  );
end;
$$;

revoke all on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  to service_role;

-- Compatibilidade: o worker antigo não deve reservar títulos depois que o
-- controle por fila estiver instalado.
create or replace function public.claim_banese_reconciliation_batch(
  p_limit integer default 10
)
returns table(receivable_id uuid)
language sql
security definer
set search_path = public
as $$
  select null::uuid
  where false;
$$;

revoke all on function public.claim_banese_reconciliation_batch(integer)
  from public, anon, authenticated;
grant execute on function public.claim_banese_reconciliation_batch(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'banese-reconciliation-every-5-minutes',
      'banese-reconciliation-every-minute'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'banese-reconciliation-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/banese-reconciliation-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Banese-Worker-Token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'payment_gateway_banese_card_reconciliation_worker_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'banese_reconciliation_config',
    'banese_reconciliation_runs',
    'banese_reconciliation_transitions'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

comment on table public.banese_reconciliation_profiles is
  'Perfis de consulta de confirmação Banese; P7-P10 são referências externas bloqueadas.';
comment on table public.banese_reconciliation_queue is
  'Fila com lease próprio para consultar somente títulos Banese já emitidos.';
comment on function public.get_banese_reconciliation_dashboard() is
  'Painel sanitizado e protegido do submódulo Configurações > Consulta API Banese.';
