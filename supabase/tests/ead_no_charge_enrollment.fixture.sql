-- Synthetic identity, calendar and scope primitives only. Product RPCs and
-- academic/financial guards are loaded from their versioned SQL sources.
create table auth.users(id uuid primary key);
create table public.perfis_acesso(id uuid primary key,permissoes jsonb);
create table public.usuarios_sistema(id uuid primary key,auth_user_id uuid,perfil text,status text,
  perfil_acesso_id uuid,personalizar_permissoes boolean,permissoes jsonb);
alter table test_caixa.access_state add column identity_allowed boolean default true;
create function public.is_active_status(text) returns boolean language sql as
  $$ select lower(btrim($1)) in ('ativo','active') $$;
create or replace function public.gestor_effective_permissions() returns jsonb language sql stable as $$
  select case when u.perfil_acesso_id is not null and not coalesce(u.personalizar_permissoes,false)
    and p.id is not null then coalesce(p.permissoes,'{}'::jsonb) else coalesce(u.permissoes,'{}'::jsonb) end
  from public.usuarios_sistema u left join public.perfis_acesso p on p.id=u.perfil_acesso_id
  where u.auth_user_id=auth.uid() and public.is_active_status(u.status) limit 1
$$;
create or replace function public.gestor_has_module(text) returns boolean language sql stable as $$
  select coalesce((select identity_allowed from test_caixa.access_state),false)
    and coalesce(public.gestor_effective_permissions()->'modules','[]'::jsonb) ? $1
$$;
create function public.can_write_turma(uuid) returns boolean language sql stable as
  $$ select scoped_allowed from test_caixa.access_state $$;
create function public.sync_aluno_polo_scope(uuid,uuid) returns void language sql as $$ select $$;
create function internal_proesc.is_enrollment_bootstrap_claim(uuid) returns boolean language sql as $$select false$$;
create table internal_proesc.class_scopes(turma_id uuid,batch_id uuid);
create table public.turmas_plano_financeiro_unico(turma_id uuid);
alter table public.turmas add column status text default 'EM_ANDAMENTO',add column data_inicio date,
  add column vagas_totais integer default 100;
alter table public.cursos add column area text,add column valor numeric default 129.9,
  add column asaas_payment_link_url text,add column ead_config jsonb;
alter table public.matriculas add column fluxo_operacional text,
  add column data_primeiro_vencimento_financeiro date;
alter table public.ead_aluno_progresso alter column id set default gen_random_uuid();
create unique index ead_aluno_progresso_unique on public.ead_aluno_progresso(aluno_id,curso_id);
create table public.certificados_academicos(id uuid primary key,matricula_id uuid,status text);
create table public.financial_payment_events(id uuid primary key,source_kind text,source_id uuid,
  payment_cents bigint,reversed_at timestamptz);
