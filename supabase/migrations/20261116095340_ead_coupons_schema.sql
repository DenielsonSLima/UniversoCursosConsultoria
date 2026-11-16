begin;

-- Local development only. Installation stays dormant until an isolated
-- database administrator explicitly enables this runtime row.
create table internal_contas.ead_coupon_runtime (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into internal_contas.ead_coupon_runtime(singleton) values(true);
alter table internal_contas.ead_coupon_runtime enable row level security;
revoke all on internal_contas.ead_coupon_runtime from public,anon,authenticated,service_role;

create table public.ead_coupons (
  id uuid primary key default gen_random_uuid(),
  polo_id uuid not null references public.polos(id),
  code text not null unique check(code=upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  discount_percent integer not null check(discount_percent in (50,100)),
  total_limit integer check(total_limit>0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  per_student_limit integer not null check(per_student_limit>0),
  active boolean not null default true,
  all_courses boolean not null default true,
  course_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(ends_at>starts_at),
  check((all_courses and cardinality(course_ids)=0) or (not all_courses and cardinality(course_ids)>0))
);
create index ead_coupons_polo_created_idx on public.ead_coupons(polo_id,created_at desc,id);

create table public.ead_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_id uuid not null references auth.users(id),
  coupon_id uuid not null references public.ead_coupons(id),
  polo_id uuid not null references public.polos(id),
  aluno_id uuid not null references public.parceiros(id),
  curso_id uuid not null references public.cursos(id),
  turma_id uuid not null references public.turmas(id),
  matricula_id uuid not null references public.matriculas(id),
  receivable_id uuid unique references public.contas_receber(id),
  attempt_id uuid unique references public.ead_checkout_attempts(id),
  status text not null check(status in ('RESERVED','CONFIRMED','RELEASED')),
  original_amount numeric(14,2) not null check(original_amount>0),
  discount_amount numeric(14,2) not null check(discount_amount>0),
  payable_amount numeric(14,2) not null check(payable_amount>=0),
  discount_percent integer not null check(discount_percent in (50,100)),
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  released_at timestamptz,
  check(original_amount=discount_amount+payable_amount),
  check((discount_percent=100 and payable_amount=0 and receivable_id is null and status='CONFIRMED')
    or (discount_percent=50 and payable_amount>0 and receivable_id is not null and attempt_id is not null))
);
create unique index ead_coupon_live_student_course_idx
  on public.ead_coupon_redemptions(coupon_id,aluno_id,curso_id) where status<>'RELEASED';
create index ead_coupon_usage_idx on public.ead_coupon_redemptions(coupon_id,status,aluno_id);
create index ead_coupon_redemptions_polo_idx on public.ead_coupon_redemptions(polo_id,coupon_id,created_at desc);

create table internal_contas.ead_coupon_management_requests (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  polo_id uuid not null references public.polos(id),
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table internal_contas.ead_coupon_management_requests enable row level security;
revoke all on internal_contas.ead_coupon_management_requests from public,anon,authenticated,service_role;

create function public.ead_coupons_can_manage(p_polo_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.role()='authenticated'
    and coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false)
    and coalesce(public.gestor_has_module('secretaria'),false)
    and coalesce(public.gestor_has_module('financeiro'),false)
    and coalesce(public.is_financeiro_for_polo(p_polo_id),false)
    and exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
      and public.is_active_status(u.status))
$$;
revoke all on function public.ead_coupons_can_manage(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_can_manage(uuid) to authenticated;

create function public.ead_coupons_available()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.role()='authenticated'
    and coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false)
$$;
revoke all on function public.ead_coupons_available() from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_available() to authenticated;

alter table public.ead_coupons enable row level security;
alter table public.ead_coupon_redemptions enable row level security;
revoke all on public.ead_coupons,public.ead_coupon_redemptions from public,anon,authenticated,service_role;
grant select on public.ead_coupons,public.ead_coupon_redemptions to authenticated;
create policy ead_coupons_manager_read on public.ead_coupons for select to authenticated
  using(public.ead_coupons_can_manage(polo_id));
create policy ead_coupon_redemptions_read on public.ead_coupon_redemptions for select to authenticated
  using(public.ead_coupons_can_manage(polo_id) or
    (auth.uid() is not null and aluno_id=public.current_aluno_id()
      and public.ead_coupons_available()));

-- Minimal invalidation metadata: never send student identity, code or prices
-- to other students through campaign change events.
create table public.ead_coupon_events (
  coupon_id uuid primary key references public.ead_coupons(id),
  polo_id uuid not null references public.polos(id),
  revision bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.ead_coupon_events enable row level security;
revoke all on public.ead_coupon_events from public,anon,authenticated,service_role;
grant select on public.ead_coupon_events to authenticated;
create policy ead_coupon_events_read on public.ead_coupon_events for select to authenticated
  using(public.ead_coupons_available() and
    (public.current_aluno_id() is not null or public.ead_coupons_can_manage(polo_id)));

create function internal_contas.ead_coupon_invalidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_coupon uuid; v_polo uuid;
begin
  if tg_table_name='ead_coupons' then v_coupon:=new.id; else v_coupon:=new.coupon_id; end if;
  v_polo:=new.polo_id;
  insert into public.ead_coupon_events(coupon_id,polo_id) values(v_coupon,v_polo)
  on conflict(coupon_id) do update set revision=public.ead_coupon_events.revision+1,updated_at=clock_timestamp();
  return new;
end; $$;
revoke all on function internal_contas.ead_coupon_invalidate() from public,anon,authenticated,service_role;
create trigger ead_coupon_changed after insert or update on public.ead_coupons
  for each row execute function internal_contas.ead_coupon_invalidate();
create trigger ead_coupon_redemption_changed after insert or update on public.ead_coupon_redemptions
  for each row execute function internal_contas.ead_coupon_invalidate();

-- Realtime delivers only rows admitted by the SELECT policies above.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.ead_coupons,public.ead_coupon_redemptions,public.ead_coupon_events;
  end if;
end; $$;

commit;
