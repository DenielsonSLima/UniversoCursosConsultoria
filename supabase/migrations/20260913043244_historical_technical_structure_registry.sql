begin;

-- Structure recovery is separate from importing academic evidence. Unknown module
-- dates remain unknown; this registry is not permission to open a diary.
create table internal_academic.historical_structure_requests (
  request_id uuid primary key,
  turma_id uuid not null unique references public.turmas(id),
  source_scope_id uuid not null references internal_proesc.class_scopes(id),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  curriculum_sha256 text not null check (curriculum_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  curriculum_snapshot jsonb not null check (jsonb_typeof(curriculum_snapshot) = 'array'),
  transaction_id text not null,
  backend_pid integer not null,
  created_at timestamptz not null default now(),
  response jsonb,
  completed_at timestamptz,
  check ((response is null) = (completed_at is null))
);

create table internal_academic.historical_period_scopes (
  periodo_letivo_id uuid primary key references public.periodos_letivos(id)
    deferrable initially deferred,
  request_id uuid not null references internal_academic.historical_structure_requests(request_id),
  turma_id uuid not null references public.turmas(id),
  modulo_id uuid not null references public.modulos(id),
  calendar_state text not null default 'REVIEW' check (calendar_state = 'REVIEW'),
  expected_period jsonb not null check (jsonb_typeof(expected_period) = 'object'),
  created_at timestamptz not null default now(),
  unique (turma_id, modulo_id)
);
create index historical_period_scopes_request_idx
  on internal_academic.historical_period_scopes(request_id);
alter table internal_academic.historical_structure_requests enable row level security;
alter table internal_academic.historical_period_scopes enable row level security;
revoke all on internal_academic.historical_structure_requests,
  internal_academic.historical_period_scopes from public, anon, authenticated, service_role;

create function internal_academic.technical_curriculum_snapshot(p_curso_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', module.id, 'nome', module.nome, 'ordem', module.position,
    'disciplinas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nome', d.nome, 'ordem', d.ordem,
      'carga_horaria', d.carga_horaria, 'teoria', d.carga_horaria_teoria,
      'pratica', d.carga_horaria_pratica, 'estagio', d.carga_horaria_estagio
    ) order by d.ordem nulls last, d.created_at, d.id)
      from public.disciplinas d where d.modulo_id = module.id), '[]'::jsonb)
  ) order by module.position), '[]'::jsonb)
  from (select m.id, m.nome,
    row_number() over (order by m.ordem nulls last, m.created_at, m.nome, m.id)::integer position
    from public.modulos m where m.curso_id = p_curso_id) module;
$$;

-- The private request must still be executing in this exact transaction/backend.
-- Each trigger consumes its own single-use claim, with the complete expected
-- structural projection checked before consumption. No session bypass switch.
create function internal_academic.consume_historical_period_claim(p_entity text, p_row jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_request uuid; v_allowed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_entity not in ('HISTORICAL_PERIOD_STRUCTURE', 'HISTORICAL_PERIOD_DATES') then
    return false;
  end if;
  select r.request_id into v_request
  from internal_academic.historical_period_scopes s
  join internal_academic.historical_structure_requests r on r.request_id = s.request_id
  where s.periodo_letivo_id = (p_row->>'id')::uuid
    and s.turma_id = r.turma_id and s.calendar_state = 'REVIEW'
    and r.transaction_id = pg_current_xact_id()::text and r.backend_pid = pg_backend_pid()
    and r.completed_at is null and p_row @> s.expected_period;
  if v_request is null then return false; end if;
  delete from internal_academic.transition_authorizations a
  where a.transaction_id = pg_current_xact_id()::text and a.backend_pid = pg_backend_pid()
    and a.entity = p_entity and a.record_id = (p_row->>'id')::uuid
    and a.new_status = v_request::text
  returning true into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

create function internal_academic.consume_historical_binding_claim(p_row jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_allowed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or not (p_row @> '{"concluida":false,"professor_id":null,"professor_nome":null}'::jsonb) then
    return false;
  end if;
  if not exists (
    select 1 from internal_academic.historical_period_scopes s
    join internal_academic.historical_structure_requests r on r.request_id = s.request_id
    join public.disciplinas d on d.modulo_id = s.modulo_id
    where s.periodo_letivo_id = (p_row->>'periodo_letivo_id')::uuid
      and s.turma_id = (p_row->>'turma_id')::uuid and r.turma_id = s.turma_id
      and d.id = (p_row->>'disciplina_id')::uuid and s.calendar_state = 'REVIEW'
      and r.transaction_id = pg_current_xact_id()::text and r.backend_pid = pg_backend_pid()
      and r.completed_at is null
  ) then return false; end if;
  delete from internal_academic.transition_authorizations a
  where a.transaction_id = pg_current_xact_id()::text and a.backend_pid = pg_backend_pid()
    and a.entity = 'HISTORICAL_BINDING:' || (p_row->>'turma_id')
    and a.record_id = (p_row->>'disciplina_id')::uuid
    and a.new_status = p_row->>'periodo_letivo_id'
  returning true into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

revoke all on function internal_academic.technical_curriculum_snapshot(uuid),
  internal_academic.consume_historical_period_claim(text, jsonb),
  internal_academic.consume_historical_binding_claim(jsonb)
  from public, anon, authenticated, service_role;

comment on table internal_academic.historical_period_scopes is
  'Historical canonical structure only. REVIEW preserves unknown module dates; it does not open periods or authorize grades/attendance.';

commit;
