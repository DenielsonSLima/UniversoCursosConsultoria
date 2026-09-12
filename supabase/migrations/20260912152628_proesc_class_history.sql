-- Histórico auditável por turma. Consultar a API não comprova importação.
begin;

create table internal_proesc.class_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_payload jsonb not null,
  class_id uuid not null references public.turmas(id),
  operation text not null check (operation in
    ('CONSULTA', 'IMPORTACAO', 'IMPORTACAO_HISTORICO', 'SINCRONIZACAO')),
  status text not null check (status in ('EM_ANDAMENTO', 'CONCLUIDO', 'PARCIAL', 'FALHOU')),
  source text not null check (source in ('PROESC_API', 'LEGADO')),
  occurred_at timestamptz not null,
  records integer not null check (records >= 0),
  summary text not null check (length(summary) between 1 and 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.usuarios_sistema(id),
  check ((source = 'LEGADO') = (operation = 'IMPORTACAO_HISTORICO'))
);
create index proesc_class_history_class_time_idx
  on internal_proesc.class_history (class_id, occurred_at desc, id desc);
alter table internal_proesc.class_history enable row level security;
revoke all on internal_proesc.class_history from public, anon, authenticated;
comment on table internal_proesc.class_history is
  'Eventos internos por turma; sem payload externo, dados de aluno ou credenciais. Não deriva importações de consultas ou recebíveis legados.';

-- A referência legada comprova disponibilidade, não inventa execução, data ou ator.
create view internal_proesc.class_history_feed as
select h.id::text, h.class_id, h.operation, h.status, h.source, h.occurred_at, h.records, h.summary
from internal_proesc.class_history h
union all
select 'legacy:' || t.id::text, t.id, 'IMPORTACAO_HISTORICO', 'CONCLUIDO', 'LEGADO',
  null::timestamptz, count(c.id)::integer,
  'Histórico anterior disponível; conferência com Proesc pendente.'
from public.turmas t
join public.matriculas m on m.turma_id = t.id
join public.contas_receber c on c.matricula_id = m.id
where t.codigo = 'ENF-T42-INT-MAT'
  and c.origem_pagamento = 'SISTEMA_ANTERIOR' and c.gateway_provider is null
  and c.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and not exists (select 1 from internal_proesc.class_history h where h.class_id = t.id
    and h.source = 'LEGADO' and h.operation = 'IMPORTACAO_HISTORICO' and h.status = 'CONCLUIDO')
group by t.id;
revoke all on internal_proesc.class_history_feed from public, anon, authenticated;
comment on view internal_proesc.class_history_feed is
  'Referência legada sem data separada dos eventos registrados; não contém alunos ou parcelas individuais.';

create function public.proesc_class_history_service(
  p_action text, p_actor_id uuid, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor jsonb;
  v_permissions jsonb;
  v_offset integer;
  v_class_id uuid;
  v_request_id uuid;
  v_payload jsonb;
  v_occurred_at timestamptz;
  v_event internal_proesc.class_history;
  v_result jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'
       is distinct from 'service_role' then
    raise exception 'Acesso Proesc nao autorizado.' using errcode = '42501';
  end if;
  select to_jsonb(u), case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
      then p.permissoes else u.permissoes end
    into v_actor, v_permissions
    from public.usuarios_sistema u
    left join public.perfis_acesso p on p.id = u.perfil_acesso_id
    where u.id = p_actor_id and lower(u.status) in ('ativo', 'active')
      and lower(u.perfil) = 'gestor';
  -- Autorizar antes de procurar request_id, inclusive em replay.
  if v_actor is null or v_permissions->'allPolos' is distinct from 'true'::jsonb
     or not coalesce(v_permissions->'modules' @> '["configuracoes"]'::jsonb, false)
     or (jsonb_typeof(v_actor->'polo_ids') = 'array' and v_actor->'polo_ids' <> '[]'::jsonb)
     or btrim(coalesce(v_actor->>'context', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Gestor global ativo autorizado em Configuracoes obrigatorio.' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Parametros do historico invalidos.' using errcode = '22023';
  end if;

  if p_action in ('list', 'events') then
    if p_payload ? 'offset' and (jsonb_typeof(p_payload->'offset') <> 'number'
       or (p_payload->>'offset') !~ '^[0-9]{1,6}$') then
      raise exception 'Pagina do historico invalida.' using errcode = '22023';
    end if;
    v_offset := coalesce((p_payload->>'offset')::integer, 0);
    if v_offset > 100000 then
      raise exception 'Pagina do historico invalida.' using errcode = '22023';
    end if;
  end if;

  if p_action = 'list' then
    with latest as (
      select distinct on (h.class_id) h.class_id, h.status, h.operation, h.source,
        h.occurred_at, h.records,
        count(*) over (partition by h.class_id) as events_count
      from internal_proesc.class_history_feed h
      order by h.class_id, h.occurred_at desc nulls last, h.id desc
    ), classes as (
      select l.*, t.codigo, t.nome from latest l join public.turmas t on t.id = l.class_id
      order by l.occurred_at desc nulls last, l.class_id
      limit 20 offset v_offset
    )
    select jsonb_build_object(
      'totalClasses', (select count(*) from latest),
      'classes', coalesce(jsonb_agg(jsonb_build_object(
        'classId', class_id, 'classCode', codigo, 'className', nome,
        'status', status, 'operation', operation, 'source', source,
        'lastEventAt', occurred_at, 'eventsCount', events_count, 'records', records
      ) order by occurred_at desc nulls last, class_id), '[]'::jsonb)) into v_result from classes;
    return v_result;
  elsif p_action = 'events' then
    v_class_id := (p_payload->>'classId')::uuid;
    if v_class_id is null then
      raise exception 'Turma obrigatoria.' using errcode = '22023';
    end if;
    select jsonb_build_object(
      'totalEvents', (select count(*) from internal_proesc.class_history_feed where class_id = v_class_id),
      'events', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'operation', operation, 'status', status, 'source', source,
        'occurredAt', occurred_at, 'records', records, 'summary', summary
      ) order by occurred_at desc nulls last, id desc), '[]'::jsonb)) into v_result
    from (select * from internal_proesc.class_history_feed where class_id = v_class_id
      order by occurred_at desc nulls last, id desc limit 20 offset v_offset) h;
    return v_result;
  elsif p_action = 'record' then
    -- Esta ação nunca é encaminhada pela Edge do gestor. Somente operação interna.
    if exists (select 1 from jsonb_object_keys(p_payload) as fields(key)
      where key not in ('requestId', 'classId', 'operation', 'status', 'source', 'occurredAt', 'records', 'summary')) then
      raise exception 'Campo de historico nao permitido.' using errcode = '22023';
    end if;
    v_request_id := (p_payload->>'requestId')::uuid;
    v_class_id := (p_payload->>'classId')::uuid;
    if v_request_id is null or v_class_id is null
       or jsonb_typeof(p_payload->'records') is distinct from 'number'
       or (p_payload->>'records') !~ '^[0-9]{1,9}$'
       or jsonb_typeof(p_payload->'summary') is distinct from 'string'
       or length(btrim(p_payload->>'summary')) not between 1 and 500
       or coalesce(p_payload->>'operation', '') not in
          ('CONSULTA', 'IMPORTACAO', 'IMPORTACAO_HISTORICO', 'SINCRONIZACAO')
       or coalesce(p_payload->>'status', '') not in ('EM_ANDAMENTO', 'CONCLUIDO', 'PARCIAL', 'FALHOU')
       or coalesce(p_payload->>'source', '') not in ('PROESC_API', 'LEGADO') then
      raise exception 'Evento de historico invalido.' using errcode = '22023';
    end if;
    v_occurred_at := (p_payload->>'occurredAt')::timestamptz;
    if v_occurred_at is not null and not isfinite(v_occurred_at) then
      raise exception 'Data do evento invalida.' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('classId', v_class_id,
      'operation', p_payload->>'operation', 'status', p_payload->>'status',
      'source', p_payload->>'source', 'occurredAt', v_occurred_at,
      'records', (p_payload->>'records')::integer, 'summary', btrim(p_payload->>'summary'));
    perform pg_advisory_xact_lock(hashtextextended('proesc:history:' || v_request_id::text, 0));
    select * into v_event from internal_proesc.class_history where request_id = v_request_id;
    if found then
      if v_event.recorded_by is distinct from p_actor_id or v_event.request_payload is distinct from v_payload then
        raise exception 'Identificador ja utilizado para outro evento.' using errcode = '22023';
      end if;
    else
      insert into internal_proesc.class_history
        (request_id, request_payload, class_id, operation, status, source, occurred_at, records, summary, recorded_by)
      values (v_request_id, v_payload, v_class_id, p_payload->>'operation', p_payload->>'status',
        p_payload->>'source', coalesce(v_occurred_at, now()), (p_payload->>'records')::integer,
        btrim(p_payload->>'summary'), p_actor_id)
      returning * into v_event;
    end if;
    return jsonb_build_object('id', v_event.id, 'operation', v_event.operation,
      'status', v_event.status, 'source', v_event.source, 'occurredAt', v_event.occurred_at,
      'records', v_event.records, 'summary', v_event.summary);
  end if;
  raise exception 'Acao de historico invalida.' using errcode = '22023';
end;
$$;
revoke all on function public.proesc_class_history_service(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.proesc_class_history_service(text, uuid, jsonb) to service_role;
comment on function public.proesc_class_history_service(text, uuid, jsonb) is
  'Histórico agregado e eventos sem dados pessoais; record exclusivo de execução interna. list/events não acessam token nem modificam financeiro.';

-- Sem seed: recebíveis T42-LEG são somente referência legada; consultas não viram importações.
commit;
