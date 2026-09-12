-- Proesc: preparação privada para conferência. Não altera recebíveis ou matrículas.
begin;

create schema if not exists internal_proesc;
revoke all on schema internal_proesc from public, anon, authenticated;

create table internal_proesc.connection (
  id boolean primary key default true check (id),
  secret_id uuid not null references vault.secrets(id),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.usuarios_sistema(id)
);
create table internal_proesc.consultations (
  id uuid primary key default gen_random_uuid(),
  resource text not null check (resource in ('people', 'invoices')),
  filters jsonb not null,
  revision uuid not null,
  cursor jsonb,
  status text not null default 'running' check (status in ('running', 'complete')),
  pages integer not null default 0,
  records integer not null default 0,
  created_by uuid not null references public.usuarios_sistema(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table internal_proesc.pages (
  consultation_id uuid not null references internal_proesc.consultations(id),
  position integer not null,
  request_cursor jsonb not null,
  result jsonb not null,
  consulted_at timestamptz not null default now(),
  primary key (consultation_id, position)
);
alter table internal_proesc.connection enable row level security;
alter table internal_proesc.consultations enable row level security;
alter table internal_proesc.pages enable row level security;
revoke all on all tables in schema internal_proesc from public, anon, authenticated;

-- RPC exclusiva da Edge Function: autenticação e escopo do gestor ocorrem antes da chamada.
create function public.proesc_workspace_service(
  p_action text, p_actor_id uuid, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_connection internal_proesc.connection;
  v_run internal_proesc.consultations;
  v_secret uuid;
  v_token text;
  v_id uuid;
  v_result jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'
       is distinct from 'service_role' then
    raise exception 'Acesso Proesc nao autorizado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.usuarios_sistema
    where id = p_actor_id and lower(status) in ('ativo', 'active') and lower(perfil) = 'gestor') then
    raise exception 'Gestor ativo obrigatorio.' using errcode = '42501';
  end if;

  if p_action in ('save_token', 'remove_token') then
    perform pg_advisory_xact_lock(hashtextextended('proesc:connection', 0));
  end if;
  select * into v_connection from internal_proesc.connection where id;

  if p_action = 'save_token' then
    v_token := btrim(p_payload->>'token');
    if v_token is null or length(v_token) < 12 or length(v_token) > 8192
       or v_token ~ '[[:space:][:cntrl:]]' then
      raise exception 'Token Proesc invalido.';
    end if;
    if v_connection.secret_id is null then
      v_secret := vault.create_secret(v_token, 'universo_proesc_readonly_token', 'Proesc: consulta de legado');
      insert into internal_proesc.connection(secret_id, updated_by) values (v_secret, p_actor_id);
    else
      perform vault.update_secret(v_connection.secret_id, v_token);
      update internal_proesc.connection set revision = gen_random_uuid(), updated_at = now(), updated_by = p_actor_id where id;
    end if;
    return jsonb_build_object('configured', true);
  elsif p_action = 'remove_token' then
    delete from internal_proesc.connection where id;
    delete from vault.secrets where id = v_connection.secret_id;
    return jsonb_build_object('configured', false);
  elsif p_action = 'status' then
    return jsonb_build_object('configured', v_connection.secret_id is not null,
      'updatedAt', v_connection.updated_at,
      'totalConsultations', (select count(*) from internal_proesc.consultations),
      'consultations', coalesce((select jsonb_agg(to_jsonb(r) - 'revision' - 'created_by')
        from (select * from internal_proesc.consultations order by created_at desc, id desc
          limit 20 offset greatest(0, least(coalesce((p_payload->>'offset')::integer, 0), 100000))) r), '[]'::jsonb));
  elsif p_action = 'history_t42' then
    select jsonb_build_object('classCode', 'ENF-T42-INT-MAT', 'students',
      coalesce(jsonb_agg(jsonb_build_object('enrollmentId', m.id, 'studentName', a.nome,
        'status', m.status, 'receivables', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'description', c.descricao,
            'dueDate', c.data_vencimento, 'amount', c.valor, 'paidAmount', c.valor_pago,
            'paymentDate', c.data_pagamento, 'status', c.status,
            'legacyId', c.origem_cronograma_id) order by c.data_vencimento, c.id)
          from public.contas_receber c where c.matricula_id = m.id
            and c.origem_pagamento = 'SISTEMA_ANTERIOR'
            and c.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and c.gateway_provider is null
        ), '[]'::jsonb)) order by a.nome, m.id), '[]'::jsonb)) into v_result
    from public.matriculas m join public.parceiros a on a.id = m.aluno_id
    join public.turmas t on t.id = m.turma_id where t.codigo = 'ENF-T42-INT-MAT';
    return v_result;
  elsif p_action = 'start' then
    if v_connection.secret_id is null then raise exception 'Cadastre o token Proesc.'; end if;
    insert into internal_proesc.consultations(resource, filters, revision, cursor, created_by)
      values (p_payload->>'resource', p_payload->'filters', v_connection.revision,
        p_payload->'cursor', p_actor_id) returning * into v_run;
    return to_jsonb(v_run) - 'revision' - 'created_by';
  elsif p_action = 'token' then
    if v_connection.secret_id is null then raise exception 'Cadastre o token Proesc.'; end if;
    select decrypted_secret into v_token from vault.decrypted_secrets where id = v_connection.secret_id;
    return jsonb_build_object('token', v_token, 'revision', v_connection.revision);
  end if;

  v_id := (p_payload->>'id')::uuid;
  select * into v_run from internal_proesc.consultations where id = v_id for update;
  if not found then raise exception 'Consulta nao encontrada.'; end if;
  if p_action = 'context' then
    if v_connection.revision is distinct from v_run.revision then
      raise exception 'Token alterado. Inicie uma nova consulta.';
    end if;
    return to_jsonb(v_run);
  elsif p_action = 'page' then
    select result into v_result from internal_proesc.pages
      where consultation_id = v_id and position = (p_payload->>'position')::integer;
    return jsonb_build_object('run', to_jsonb(v_run) - 'revision' - 'created_by', 'page', v_result);
  elsif p_action = 'commit_page' then
    if v_connection.revision is distinct from v_run.revision
       or p_payload->>'revision' is distinct from v_run.revision::text then
      raise exception 'Token alterado. Inicie uma nova consulta.';
    end if;
    -- Compare-and-swap: chamadas concorrentes ou repetidas nunca duplicam páginas.
    if v_run.status <> 'running' or v_run.cursor is distinct from p_payload->'cursor'
       or v_run.pages <> (p_payload->>'expectedPages')::integer then
      raise exception 'Consulta atualizada por outra requisicao. Atualize a tela.';
    end if;
    insert into internal_proesc.pages(consultation_id, position, request_cursor, result)
      values (v_id, v_run.pages + 1, v_run.cursor, p_payload->'result');
    update internal_proesc.consultations set
      pages = pages + 1,
      records = records + jsonb_array_length(p_payload->'result'->'records'),
      cursor = nullif(p_payload->'nextCursor', 'null'::jsonb),
      status = case when nullif(p_payload->'nextCursor', 'null'::jsonb) is null then 'complete' else 'running' end,
      updated_at = now()
      where id = v_id returning * into v_run;
    return to_jsonb(v_run) - 'revision' - 'created_by';
  end if;
  raise exception 'Acao Proesc invalida.';
end;
$$;
revoke all on function public.proesc_workspace_service(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.proesc_workspace_service(text, uuid, jsonb) to service_role;
comment on function public.proesc_workspace_service(text, uuid, jsonb) is
  'Uso interno da Edge Proesc autenticada. Token nunca retornado ao frontend. Consultas não alteram financeiro.';

commit;
