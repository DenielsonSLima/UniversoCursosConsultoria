begin;

-- A permissão multicanal é explícita. Não herda o comportamento permissivo
-- legado de gestor_has_tab quando o array de abas não existe.
create or replace function public.gestor_has_explicit_tab(p_module text, p_tab text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.gestor_has_module(p_module)
    and jsonb_typeof(public.gestor_effective_permissions() -> 'tabs' -> p_module) = 'array'
    and exists (
      select 1
      from jsonb_array_elements_text(
        public.gestor_effective_permissions() -> 'tabs' -> p_module
      ) allowed(value)
      where allowed.value = p_tab
    );
$$;

create or replace function public.gestor_can_manage_automation_drafts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.is_gestor_global()
      and public.gestor_has_explicit_tab('comunicacao', 'comunicacao-automacoes')
    );
$$;

revoke execute on function public.gestor_has_explicit_tab(text, text) from public, anon;
grant execute on function public.gestor_has_explicit_tab(text, text) to authenticated, service_role;
revoke execute on function public.gestor_can_manage_automation_drafts() from public, anon;
grant execute on function public.gestor_can_manage_automation_drafts() to authenticated, service_role;

-- Backfill restrito: somente perfis administrativos globais que já possuem
-- Comunicação, WhatsApp e Configurações. Perfis operacionais não ganham acesso.
update public.perfis_acesso p
set permissoes = jsonb_set(
  p.permissoes,
  '{tabs,comunicacao}',
  coalesce((
    select jsonb_agg(distinct tab_id order by tab_id)
    from (
      select jsonb_array_elements_text(p.permissoes -> 'tabs' -> 'comunicacao') tab_id
      union all
      select 'comunicacao-automacoes'
    ) tabs
  ), '[]'::jsonb),
  true
)
where coalesce(p.permissoes ->> 'allPolos', 'false') = 'true'
  and p.permissoes -> 'modules' ? 'comunicacao'
  and p.permissoes -> 'modules' ? 'configuracoes'
  and jsonb_typeof(p.permissoes -> 'tabs' -> 'comunicacao') = 'array'
  and p.permissoes -> 'tabs' -> 'comunicacao' ? 'comunicacao-whatsapp'
  and not (p.permissoes -> 'tabs' -> 'comunicacao' ? 'comunicacao-automacoes');

update public.usuarios_sistema u
set permissoes = jsonb_set(
  u.permissoes,
  '{tabs,comunicacao}',
  coalesce((
    select jsonb_agg(distinct tab_id order by tab_id)
    from (
      select jsonb_array_elements_text(u.permissoes -> 'tabs' -> 'comunicacao') tab_id
      union all
      select 'comunicacao-automacoes'
    ) tabs
  ), '[]'::jsonb),
  true
)
where u.personalizar_permissoes = true
  and coalesce(u.permissoes ->> 'allPolos', 'false') = 'true'
  and u.permissoes -> 'modules' ? 'comunicacao'
  and u.permissoes -> 'modules' ? 'configuracoes'
  and jsonb_typeof(u.permissoes -> 'tabs' -> 'comunicacao') = 'array'
  and u.permissoes -> 'tabs' -> 'comunicacao' ? 'comunicacao-whatsapp'
  and not (u.permissoes -> 'tabs' -> 'comunicacao' ? 'comunicacao-automacoes');

alter table public.comunicacao_automacoes
  add column if not exists versao_publicada integer,
  add column if not exists execution_enabled boolean not null default false;

alter table public.comunicacao_automacoes
  drop constraint if exists comunicacao_automacoes_versao_publicada_check;
alter table public.comunicacao_automacoes
  add constraint comunicacao_automacoes_versao_publicada_check
  check (versao_publicada is null or (versao_publicada > 0 and versao_publicada <= versao_atual));

alter table public.comunicacao_automacoes
  drop constraint if exists comunicacao_automacoes_execution_check;
alter table public.comunicacao_automacoes
  add constraint comunicacao_automacoes_execution_check
  check (execution_enabled = false or (status = 'publicada' and versao_publicada is not null));

create table if not exists public.comunicacao_automacao_acoes (
  id bigint generated always as identity primary key,
  automacao_id uuid not null references public.comunicacao_automacoes(id) on delete restrict,
  request_id uuid not null unique,
  acao text not null,
  actor_id uuid,
  versao_anterior integer,
  versao_nova integer,
  motivo text not null,
  origem text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comunicacao_automacao_acoes_acao_check check (acao in ('SAVE_DRAFT', 'PUBLISH', 'PAUSE', 'RESUME', 'ARCHIVE', 'ROLLBACK')),
  constraint comunicacao_automacao_acoes_motivo_check check (length(btrim(motivo)) between 3 and 500),
  constraint comunicacao_automacao_acoes_origem_check check (origem in ('web', 'migration', 'system')),
  constraint comunicacao_automacao_acoes_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_comunicacao_automacao_acoes_automation_created
  on public.comunicacao_automacao_acoes (automacao_id, created_at desc);

alter table public.comunicacao_automacao_acoes enable row level security;
revoke all on public.comunicacao_automacao_acoes from public, anon, authenticated;
grant select, insert on public.comunicacao_automacao_acoes to service_role;
grant usage, select on sequence public.comunicacao_automacao_acoes_id_seq to service_role;

drop policy if exists comunicacao_automacoes_global_read on public.comunicacao_automacoes;
drop policy if exists comunicacao_automacao_canais_global_read on public.comunicacao_automacao_canais;
drop policy if exists comunicacao_automacao_rotas_global_read on public.comunicacao_automacao_rotas;
drop policy if exists comunicacao_automacao_versoes_global_read on public.comunicacao_automacao_versoes;
drop policy if exists comunicacao_automacao_auditoria_global_read on public.comunicacao_automacao_auditoria;

create policy comunicacao_automacoes_explicit_global_read
on public.comunicacao_automacoes for select to authenticated
using ((select public.gestor_can_manage_automation_drafts()));
create policy comunicacao_automacao_canais_explicit_global_read
on public.comunicacao_automacao_canais for select to authenticated
using ((select public.gestor_can_manage_automation_drafts()));
create policy comunicacao_automacao_rotas_explicit_global_read
on public.comunicacao_automacao_rotas for select to authenticated
using ((select public.gestor_can_manage_automation_drafts()));
create policy comunicacao_automacao_versoes_explicit_global_read
on public.comunicacao_automacao_versoes for select to authenticated
using ((select public.gestor_can_manage_automation_drafts()));
create policy comunicacao_automacao_auditoria_explicit_global_read
on public.comunicacao_automacao_auditoria for select to authenticated
using ((select public.gestor_can_manage_automation_drafts()));

-- A aplicação passa a ler um snapshot atômico via RPC. Escrita direta segue revogada.
revoke select on public.comunicacao_automacoes from authenticated;
revoke select on public.comunicacao_automacao_canais from authenticated;
revoke select on public.comunicacao_automacao_rotas from authenticated;
revoke select on public.comunicacao_automacao_versoes from authenticated;
revoke select on public.comunicacao_automacao_auditoria from authenticated;

create or replace function public.comunicacao_automacoes_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.gestor_can_manage_automation_drafts() then
    raise exception 'Acesso não autorizado às automações multicanal.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'createdAt'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', a.id,
      'key', a.chave,
      'name', a.nome,
      'description', a.descricao,
      'event', a.evento,
      'category', a.categoria,
      'purpose', a.finalidade,
      'status', a.status,
      'enrollmentStatuses', a.matricula_status,
      'trigger', a.gatilho,
      'timezone', a.timezone,
      'currentVersion', a.versao_atual,
      'publishedVersion', a.versao_publicada,
      'executionEnabled', a.execution_enabled,
      'legacySource', a.origem_legada,
      'updatedAt', a.updated_at,
      'createdAt', a.created_at,
      'channels', coalesce((
        select jsonb_agg(jsonb_build_object(
          'channel', c.canal,
          'titleTemplate', c.titulo_template,
          'bodyTemplate', c.corpo_template,
          'deepLink', c.deep_link,
          'settings', c.configuracao
        ) order by c.canal)
        from public.comunicacao_automacao_canais c
        where c.automacao_id = a.id
      ), '[]'::jsonb),
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modality', r.modalidade,
          'channel', r.canal,
          'enabled', r.habilitada,
          'mode', r.modo_entrega,
          'priority', r.prioridade,
          'fallbackAfterMinutes', r.fallback_apos_minutos,
          'fallbackCondition', r.fallback_condicao
        ) order by r.modalidade, r.canal)
        from public.comunicacao_automacao_rotas r
        where r.automacao_id = a.id
      ), '[]'::jsonb)
    ) item
    from public.comunicacao_automacoes a
  ) snapshot;

  return v_result;
end;
$$;

revoke execute on function public.comunicacao_automacoes_listar() from public, anon;
grant execute on function public.comunicacao_automacoes_listar() to authenticated, service_role;

create or replace function public.comunicacao_automacao_salvar_rascunho(
  p_automacao_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_reason text,
  p_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_automation public.comunicacao_automacoes%rowtype;
  v_new_version integer;
  v_name text;
  v_description text;
  v_enrollment_statuses text[];
  v_trigger jsonb;
  v_channels jsonb;
  v_routes jsonb;
  v_snapshot jsonb;
begin
  if not public.gestor_can_manage_automation_drafts() then
    raise exception 'Acesso não autorizado para editar automações.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id é obrigatório.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Informe um motivo entre 3 e 500 caracteres.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Rascunho inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.comunicacao_automacao_acoes where request_id = p_request_id) then
    select jsonb_build_object('id', automacao_id, 'version', versao_nova, 'requestId', request_id, 'replayed', true)
    into v_snapshot
    from public.comunicacao_automacao_acoes
    where request_id = p_request_id;
    return v_snapshot;
  end if;

  select * into v_automation
  from public.comunicacao_automacoes
  where id = p_automacao_id
  for update;
  if not found then
    raise exception 'Automação não encontrada.' using errcode = 'P0002';
  end if;
  if v_automation.status <> 'rascunho' or v_automation.execution_enabled then
    raise exception 'Somente automações em rascunho e sem execução podem ser editadas.' using errcode = '55000';
  end if;
  if p_expected_version is distinct from v_automation.versao_atual then
    raise exception 'A automação foi atualizada por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
  end if;

  v_name := nullif(btrim(p_draft ->> 'name'), '');
  v_description := nullif(btrim(p_draft ->> 'description'), '');
  v_trigger := p_draft -> 'trigger';
  v_channels := p_draft -> 'channels';
  v_routes := p_draft -> 'routes';

  if length(coalesce(v_name, '')) not between 3 and 120 then
    raise exception 'Nome inválido.' using errcode = '22023';
  end if;
  if v_description is not null and length(v_description) > 500 then
    raise exception 'Descrição muito longa.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_draft -> 'enrollmentStatuses') <> 'array' then
    raise exception 'Status de matrícula inválidos.' using errcode = '22023';
  end if;
  select array_agg(distinct value order by value) into v_enrollment_statuses
  from jsonb_array_elements_text(p_draft -> 'enrollmentStatuses') status(value);
  if cardinality(v_enrollment_statuses) = 0
    or not (v_enrollment_statuses <@ array['ATIVO', 'CONCLUIDO', 'TRANCADO', 'CANCELADO', 'DESISTENTE']::text[]) then
    raise exception 'Status de matrícula inválidos.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_trigger) <> 'object' or v_trigger ->> 'event' <> v_automation.evento then
    raise exception 'Gatilho incompatível com o evento.' using errcode = '22023';
  end if;
  if v_automation.evento = 'payment_due' and not (
    case when (v_trigger ->> 'daysBefore') ~ '^\d+$'
      then (v_trigger ->> 'daysBefore')::integer between 0 and 90
      else false
    end
    and (v_trigger ->> 'sendTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'Gatilho de vencimento inválido.' using errcode = '22023'; end if;
  if v_automation.evento = 'payment_received' and not (
    case when (v_trigger ->> 'delayMinutes') ~ '^\d+$'
      then (v_trigger ->> 'delayMinutes')::integer between 0 and 10080
      else false
    end
  ) then raise exception 'Gatilho de recebimento inválido.' using errcode = '22023'; end if;
  if v_automation.evento = 'payment_overdue' and not (
    case when (v_trigger ->> 'daysAfter') ~ '^\d+$'
      then (v_trigger ->> 'daysAfter')::integer between 0 and 365
      else false
    end
    and (v_trigger ->> 'sendTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'Gatilho de atraso inválido.' using errcode = '22023'; end if;
  if v_automation.evento = 'multiple_overdue' and not (
    case when (v_trigger ->> 'minimumInstallments') ~ '^\d+$'
      then (v_trigger ->> 'minimumInstallments')::integer between 2 and 99
      else false
    end
    and (v_trigger ->> 'sendTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'Gatilho de múltiplos atrasos inválido.' using errcode = '22023'; end if;
  if v_automation.evento = 'birthday' and not (
    (v_trigger ->> 'sendTime') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then raise exception 'Gatilho de aniversário inválido.' using errcode = '22023'; end if;

  if jsonb_typeof(v_channels) <> 'array'
    or jsonb_array_length(v_channels) <> 3
    or (select count(distinct item ->> 'channel') from jsonb_array_elements(v_channels) item) <> 3 then
    raise exception 'Informe exatamente os três canais.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_channels) item
    where item ->> 'channel' not in ('app_message', 'push', 'whatsapp')
      or length(btrim(coalesce(item ->> 'bodyTemplate', ''))) not between 1 and 8000
      or (item ? 'titleTemplate' and item ->> 'titleTemplate' is not null and length(btrim(item ->> 'titleTemplate')) not between 1 and 120)
      or (
        item ->> 'channel' in ('app_message', 'push')
        and coalesce(item ->> 'deepLink', '') !~ '^/aluno(?:/|$)'
      )
      or jsonb_typeof(coalesce(item -> 'settings', '{}'::jsonb)) <> 'object'
      or (item ->> 'channel' = 'push' and (
        coalesce(item -> 'settings' ->> 'privacy', '') <> 'private'
        or coalesce(item ->> 'titleTemplate', '') ~ '\{\{'
        or coalesce(item ->> 'bodyTemplate', '') ~ '\{\{'
      ))
  ) then raise exception 'Configuração de canal inválida.' using errcode = '22023'; end if;

  if jsonb_typeof(v_routes) <> 'array'
    or jsonb_array_length(v_routes) <> 15
    or (select count(distinct (item ->> 'modality', item ->> 'channel')) from jsonb_array_elements(v_routes) item) <> 15 then
    raise exception 'A matriz deve conter 15 combinações únicas de modalidade e canal.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_routes) item
    where item ->> 'modality' not in ('TECNICO', 'EAD', 'LIVRE', 'ESPECIALIZACAO', 'SUPERIOR')
      or item ->> 'channel' not in ('app_message', 'push', 'whatsapp')
      or jsonb_typeof(item -> 'enabled') <> 'boolean'
      or item ->> 'mode' not in ('parallel', 'fallback')
      or not (item ? 'fallbackAfterMinutes' and item ? 'fallbackCondition')
      or not (case when coalesce(item ->> 'priority', '') ~ '^\d+$'
        then (item ->> 'priority')::integer between 1 and 10
        else false
      end)
      or (item ->> 'mode' = 'parallel' and (item -> 'fallbackAfterMinutes' is distinct from 'null'::jsonb or item -> 'fallbackCondition' is distinct from 'null'::jsonb))
      or (item ->> 'mode' = 'fallback' and (
        not (case when coalesce(item ->> 'priority', '') ~ '^\d+$'
          then (item ->> 'priority')::integer between 2 and 10
          else false
        end)
        or not (case when coalesce(item ->> 'fallbackAfterMinutes', '') ~ '^\d+$'
          then (item ->> 'fallbackAfterMinutes')::integer between 1 and 10080
          else false
        end)
        or item ->> 'fallbackCondition' not in ('no_device', 'delivery_failed', 'unread')
      ))
  ) then raise exception 'Matriz de rotas inválida.' using errcode = '22023'; end if;

  v_new_version := v_automation.versao_atual + 1;
  update public.comunicacao_automacoes
  set nome = v_name,
      descricao = v_description,
      matricula_status = v_enrollment_statuses,
      gatilho = v_trigger,
      versao_atual = v_new_version,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_automation.id;

  insert into public.comunicacao_automacao_canais (
    automacao_id, canal, titulo_template, corpo_template, deep_link, configuracao
  )
  select v_automation.id,
         item ->> 'channel',
         nullif(btrim(item ->> 'titleTemplate'), ''),
         btrim(item ->> 'bodyTemplate'),
         nullif(btrim(item ->> 'deepLink'), ''),
         case item ->> 'channel'
           when 'push' then jsonb_build_object('privacy', 'private')
           when 'whatsapp' then jsonb_build_object(
             'category', case when item -> 'settings' ->> 'category' = 'marketing' then 'marketing' else 'utility' end,
             'metaTemplateName', nullif(btrim(item -> 'settings' ->> 'metaTemplateName'), ''),
             'metaTemplateLanguage', coalesce(nullif(btrim(item -> 'settings' ->> 'metaTemplateLanguage'), ''), 'pt_BR')
           )
           else '{}'::jsonb
         end
  from jsonb_array_elements(v_channels) item
  on conflict (automacao_id, canal) do update
  set titulo_template = excluded.titulo_template,
      corpo_template = excluded.corpo_template,
      deep_link = excluded.deep_link,
      configuracao = excluded.configuracao,
      updated_at = now();

  insert into public.comunicacao_automacao_rotas (
    automacao_id, modalidade, canal, habilitada, modo_entrega, prioridade,
    fallback_apos_minutos, fallback_condicao
  )
  select v_automation.id,
         item ->> 'modality',
         item ->> 'channel',
         (item ->> 'enabled')::boolean,
         item ->> 'mode',
         (item ->> 'priority')::smallint,
         case when item ->> 'mode' = 'fallback' then (item ->> 'fallbackAfterMinutes')::integer else null end,
         case when item ->> 'mode' = 'fallback' then item ->> 'fallbackCondition' else null end
  from jsonb_array_elements(v_routes) item
  on conflict (automacao_id, modalidade, canal) do update
  set habilitada = excluded.habilitada,
      modo_entrega = excluded.modo_entrega,
      prioridade = excluded.prioridade,
      fallback_apos_minutos = excluded.fallback_apos_minutos,
      fallback_condicao = excluded.fallback_condicao,
      updated_at = now();

  select jsonb_build_object(
    'automation', to_jsonb(a),
    'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.canal) from public.comunicacao_automacao_canais c where c.automacao_id = a.id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(to_jsonb(r) order by r.modalidade, r.canal) from public.comunicacao_automacao_rotas r where r.automacao_id = a.id), '[]'::jsonb)
  ) into v_snapshot
  from public.comunicacao_automacoes a
  where a.id = v_automation.id;

  insert into public.comunicacao_automacao_versoes (
    automacao_id, versao, snapshot, motivo, created_by
  ) values (
    v_automation.id, v_new_version, v_snapshot, btrim(p_reason), auth.uid()
  );

  insert into public.comunicacao_automacao_acoes (
    automacao_id, request_id, acao, actor_id, versao_anterior, versao_nova, motivo, metadata
  ) values (
    v_automation.id, p_request_id, 'SAVE_DRAFT', auth.uid(), v_automation.versao_atual,
    v_new_version, btrim(p_reason), jsonb_build_object('status', 'rascunho')
  );

  return jsonb_build_object(
    'id', v_automation.id,
    'version', v_new_version,
    'requestId', p_request_id,
    'status', 'rascunho',
    'executionEnabled', false
  );
end;
$$;

revoke execute on function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb) from public, anon;
grant execute on function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb) to authenticated, service_role;

commit;
