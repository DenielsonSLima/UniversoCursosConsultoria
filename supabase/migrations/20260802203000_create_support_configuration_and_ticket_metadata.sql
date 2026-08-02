create table if not exists public.comunicacao_atendimento_config (
  id uuid primary key default gen_random_uuid(),
  polo_id uuid not null unique references public.polos(id) on delete cascade,
  status_modo text not null default 'automatico'
    check (status_modo in ('automatico', 'online', 'offline')),
  permite_chat_publico boolean not null default true,
  permite_chat_app boolean not null default true,
  permite_novo_chamado boolean not null default true,
  solicitar_notificacao_resposta boolean not null default true,
  tempo_medio_resposta_minutos integer not null default 120
    check (tempo_medio_resposta_minutos between 1 and 10080),
  mensagem_online text not null default 'Olá! Nossa equipe está online e responderá o mais rápido possível.',
  mensagem_offline text not null default 'Não temos atendentes online neste momento. Deixe sua mensagem e retornaremos o mais rápido possível.',
  texto_notificacao_optin text not null default 'Ative as notificações para ser avisado quando sua solicitação for respondida.',
  horarios jsonb not null default '{"1":{"ativo":true,"inicio":"08:00","fim":"18:00"},"2":{"ativo":true,"inicio":"08:00","fim":"18:00"},"3":{"ativo":true,"inicio":"08:00","fim":"18:00"},"4":{"ativo":true,"inicio":"08:00","fim":"18:00"},"5":{"ativo":true,"inicio":"08:00","fim":"18:00"},"6":{"ativo":false,"inicio":"08:00","fim":"12:00"},"0":{"ativo":false,"inicio":"08:00","fim":"12:00"}}'::jsonb,
  updated_by uuid references public.usuarios_sistema(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_atendimento_config_horarios_object
    check (jsonb_typeof(horarios) = 'object')
);

create table if not exists public.comunicacao_atendentes_polos (
  id uuid primary key default gen_random_uuid(),
  polo_id uuid not null references public.polos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios_sistema(id) on delete cascade,
  setor text not null default 'atendimento_geral'
    check (setor in ('todos', 'pedagogico_coordenacao', 'financeiro', 'comercial_matriculas', 'secretaria', 'atendimento_geral')),
  ativo boolean not null default true,
  prioridade smallint not null default 100 check (prioridade between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (polo_id, usuario_id, setor)
);

alter table public.comunicacao_chats
  alter column remetente_id drop not null;

alter table public.comunicacao_chats
  drop constraint if exists comunicacao_chats_remetente_tipo_check;

alter table public.comunicacao_chats
  add constraint comunicacao_chats_remetente_tipo_check
  check (remetente_tipo in ('Aluno', 'Professor', 'Visitante'));

alter table public.comunicacao_chats
  add column if not exists origem text not null default 'app'
    check (origem in ('app', 'portal', 'publico')),
  add column if not exists polo_id uuid references public.polos(id) on delete set null,
  add column if not exists setor text,
  add column if not exists atendente_id uuid references public.usuarios_sistema(id) on delete set null,
  add column if not exists assunto text,
  add column if not exists protocolo text,
  add column if not exists primeira_resposta_em timestamptz,
  add column if not exists encerrado_em timestamptz,
  add column if not exists notificar_resposta boolean not null default false,
  add column if not exists public_access_hash text,
  add column if not exists public_access_expires_at timestamptz;

create unique index if not exists comunicacao_chats_protocolo_uidx
  on public.comunicacao_chats (protocolo) where protocolo is not null;
create unique index if not exists comunicacao_chats_public_access_hash_uidx
  on public.comunicacao_chats (public_access_hash) where public_access_hash is not null;
create index if not exists comunicacao_chats_fila_idx
  on public.comunicacao_chats (polo_id, status, setor, ultima_data desc);
create index if not exists comunicacao_atendentes_polos_fila_idx
  on public.comunicacao_atendentes_polos (polo_id, ativo, setor, prioridade);

alter table public.comunicacao_atendimento_config enable row level security;
alter table public.comunicacao_atendentes_polos enable row level security;

drop policy if exists comunicacao_atendimento_config_select on public.comunicacao_atendimento_config;
create policy comunicacao_atendimento_config_select
on public.comunicacao_atendimento_config for select to authenticated
using (public.is_gestor_for_polo(polo_id) or public.is_gestor_global());

drop policy if exists comunicacao_atendimento_config_write on public.comunicacao_atendimento_config;
create policy comunicacao_atendimento_config_write
on public.comunicacao_atendimento_config for all to authenticated
using (public.is_gestor_for_polo(polo_id) or public.is_gestor_global())
with check (public.is_gestor_for_polo(polo_id) or public.is_gestor_global());

drop policy if exists comunicacao_atendentes_polos_select on public.comunicacao_atendentes_polos;
create policy comunicacao_atendentes_polos_select
on public.comunicacao_atendentes_polos for select to authenticated
using (public.is_gestor_for_polo(polo_id) or public.is_gestor_global());

drop policy if exists comunicacao_atendentes_polos_write on public.comunicacao_atendentes_polos;
create policy comunicacao_atendentes_polos_write
on public.comunicacao_atendentes_polos for all to authenticated
using (public.is_gestor_for_polo(polo_id) or public.is_gestor_global())
with check (public.is_gestor_for_polo(polo_id) or public.is_gestor_global());

grant select, insert, update, delete on public.comunicacao_atendimento_config to authenticated;
grant select, insert, update, delete on public.comunicacao_atendentes_polos to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comunicacao_atendimento_config'
  ) then
    alter publication supabase_realtime add table public.comunicacao_atendimento_config;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comunicacao_atendentes_polos'
  ) then
    alter publication supabase_realtime add table public.comunicacao_atendentes_polos;
  end if;
end $$;

