begin;

create table if not exists public.comunicacao_automacao_requisicoes (
  request_id uuid primary key,
  automacao_id uuid not null references public.comunicacao_automacoes(id) on delete restrict,
  acao text not null,
  actor_id uuid,
  payload_hash text not null,
  resposta jsonb not null,
  created_at timestamptz not null default now(),
  constraint comunicacao_automacao_requisicoes_acao_check check (acao = 'SAVE_DRAFT'),
  constraint comunicacao_automacao_requisicoes_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint comunicacao_automacao_requisicoes_resposta_check check (jsonb_typeof(resposta) = 'object')
);

alter table public.comunicacao_automacao_requisicoes enable row level security;
drop policy if exists comunicacao_automacao_requisicoes_direct_deny
  on public.comunicacao_automacao_requisicoes;
create policy comunicacao_automacao_requisicoes_direct_deny
  on public.comunicacao_automacao_requisicoes
  as restrictive
  for all
  to public
  using (false)
  with check (false);
revoke all on public.comunicacao_automacao_requisicoes from public, anon, authenticated;
grant select, insert on public.comunicacao_automacao_requisicoes to service_role;

drop policy if exists comunicacao_automacao_acoes_direct_deny
  on public.comunicacao_automacao_acoes;
create policy comunicacao_automacao_acoes_direct_deny
  on public.comunicacao_automacao_acoes
  as restrictive
  for all
  to public
  using (false)
  with check (false);

alter table public.comunicacao_automacao_canais
  drop constraint if exists comunicacao_automacao_canais_app_required_check;
alter table public.comunicacao_automacao_canais
  add constraint comunicacao_automacao_canais_app_required_check
  check (
    canal = 'whatsapp'
    or (
      nullif(btrim(titulo_template), '') is not null
      and deep_link is not null
      and deep_link ~ '^/aluno(?:/|$)'
    )
  ) not valid;
alter table public.comunicacao_automacao_canais
  validate constraint comunicacao_automacao_canais_app_required_check;

alter table public.comunicacao_automacao_canais
  drop constraint if exists comunicacao_automacao_canais_push_private_check;
alter table public.comunicacao_automacao_canais
  add constraint comunicacao_automacao_canais_push_private_check
  check (
    canal <> 'push'
    or (
      configuracao ->> 'privacy' = 'private'
      and (coalesce(titulo_template, '') || ' ' || corpo_template) !~* '(\{\{|r\$|pagament|parcela|vencid|atras|valor)'
    )
  ) not valid;
alter table public.comunicacao_automacao_canais
  validate constraint comunicacao_automacao_canais_push_private_check;

alter table public.comunicacao_automacoes
  drop constraint if exists comunicacao_automacoes_versao_publicada_fk;
alter table public.comunicacao_automacoes
  add constraint comunicacao_automacoes_versao_publicada_fk
  foreign key (id, versao_publicada)
  references public.comunicacao_automacao_versoes(automacao_id, versao)
  on delete restrict;

create or replace function public.comunicacao_automacao_tokens_permitidos(
  p_event text,
  p_text text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    regexp_replace(coalesce(p_text, ''), '\{\{[a-z_]+\}\}', '', 'g') !~ '(\{\{|\}\})'
    and not exists (
      select 1
      from regexp_matches(coalesce(p_text, ''), '(\{\{[a-z_]+\}\})', 'g') token(found)
      where token.found[1] <> all (
        case p_event
          when 'payment_due' then array['{{nome_aluno}}','{{nome_curso}}','{{valor_fatura}}','{{data_vencimento}}','{{cpf_final}}','{{link_pagamento}}']::text[]
          when 'payment_received' then array['{{nome_aluno}}','{{nome_curso}}','{{valor_fatura}}','{{numero_mensalidade}}','{{cpf_final}}']::text[]
          when 'payment_overdue' then array['{{nome_aluno}}','{{nome_turma}}','{{valor_fatura}}','{{data_vencimento}}','{{cpf_final}}','{{link_pagamento}}']::text[]
          when 'multiple_overdue' then array['{{nome_aluno}}','{{nome_curso}}','{{nome_turma}}','{{quantidade_parcelas}}','{{valor_total_atrasado}}','{{cpf_final}}']::text[]
          when 'birthday' then array['{{nome_aluno}}','{{escola}}','{{frase_aniversario}}']::text[]
          else array[]::text[]
        end
      )
    );
$$;

revoke execute on function public.comunicacao_automacao_tokens_permitidos(text, text)
  from public, anon, authenticated;
grant execute on function public.comunicacao_automacao_tokens_permitidos(text, text)
  to service_role;

alter function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb)
  rename to comunicacao_automacao_salvar_rascunho_core;
revoke all on function public.comunicacao_automacao_salvar_rascunho_core(uuid, integer, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

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
  v_actor_id uuid := auth.uid();
  v_event text;
  v_purpose text;
  v_channels jsonb;
  v_payload_hash text;
  v_existing public.comunicacao_automacao_requisicoes%rowtype;
  v_response jsonb;
begin
  if not public.gestor_can_manage_automation_drafts() then
    raise exception 'Acesso não autorizado para editar automações.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id é obrigatório.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Rascunho inválido.' using errcode = '22023';
  end if;

  v_payload_hash := encode(digest(convert_to(jsonb_build_object(
    'action', 'SAVE_DRAFT',
    'automationId', p_automacao_id,
    'reason', btrim(coalesce(p_reason, '')),
    'draft', p_draft
  )::text, 'UTF8'), 'sha256'), 'hex');

  -- Serializa a mesma chave mesmo quando as requisições atingem automações
  -- diferentes, fechando a janela entre consulta e inserção idempotente.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select * into v_existing
  from public.comunicacao_automacao_requisicoes
  where request_id = p_request_id;
  if found then
    if v_existing.automacao_id <> p_automacao_id
      or v_existing.actor_id is distinct from v_actor_id
      or v_existing.payload_hash <> v_payload_hash then
      raise exception 'request_id já utilizado com outro conteúdo.' using errcode = '23505';
    end if;
    return v_existing.resposta || jsonb_build_object('replayed', true);
  end if;

  select evento, finalidade into v_event, v_purpose
  from public.comunicacao_automacoes
  where id = p_automacao_id;
  if not found then
    raise exception 'Automação não encontrada.' using errcode = 'P0002';
  end if;

  v_channels := p_draft -> 'channels';
  if jsonb_typeof(v_channels) <> 'array' then
    raise exception 'Configuração de canais inválida.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_channels) item
    where (
      item ->> 'channel' in ('app_message', 'push')
      and (
        nullif(btrim(item ->> 'titleTemplate'), '') is null
        or coalesce(item ->> 'deepLink', '') !~ '^/aluno(?:/|$)'
      )
    )
    or (
      item ->> 'channel' = 'push'
      and (
        item -> 'settings' ->> 'privacy' <> 'private'
        or (coalesce(item ->> 'titleTemplate', '') || ' ' || coalesce(item ->> 'bodyTemplate', '')) ~* '(\{\{|r\$|pagament|parcela|vencid|atras|valor)'
      )
    )
    or (
      item ->> 'channel' in ('app_message', 'whatsapp')
      and not public.comunicacao_automacao_tokens_permitidos(
        v_event,
        coalesce(item ->> 'titleTemplate', '') || ' ' || coalesce(item ->> 'bodyTemplate', '')
      )
    )
    or (
      item ->> 'channel' = 'whatsapp'
      and (
        coalesce(item -> 'settings' ->> 'category', '') <>
          case when v_purpose = 'marketing' then 'marketing' else 'utility' end
        or coalesce(item -> 'settings' ->> 'metaTemplateLanguage', 'pt_BR') !~ '^[a-z]{2}_[A-Z]{2}$'
        or (
          nullif(item -> 'settings' ->> 'metaTemplateName', '') is not null
          and item -> 'settings' ->> 'metaTemplateName' !~ '^[a-z0-9_]+$'
        )
      )
    )
  ) then
    raise exception 'Canal contém campos ausentes, dados privados ou variáveis não permitidas.' using errcode = '22023';
  end if;

  v_response := public.comunicacao_automacao_salvar_rascunho_core(
    p_automacao_id,
    p_expected_version,
    p_request_id,
    p_reason,
    p_draft
  );

  insert into public.comunicacao_automacao_requisicoes (
    request_id, automacao_id, acao, actor_id, payload_hash, resposta
  ) values (
    p_request_id, p_automacao_id, 'SAVE_DRAFT', v_actor_id, v_payload_hash, v_response
  );

  return v_response;
end;
$$;

revoke execute on function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb)
  from public, anon;
grant execute on function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb)
  to authenticated, service_role;

commit;
