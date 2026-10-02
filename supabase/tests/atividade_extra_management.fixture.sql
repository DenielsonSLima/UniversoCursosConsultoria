-- Synthetic, isolated database. Never run this fixture against a remote project.
create role anon;
create role authenticated;
create role service_role;
create schema auth;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '');
$$;
create function public.current_professor_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.professor', true), '')::uuid;
$$;
create function public.current_aluno_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.aluno', true), '')::uuid;
$$;
create function public.can_write_turma(p_turma_id uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('test.gestor', true) = 'true', false)
    and p_turma_id::text = current_setting('test.scope_turma', true);
$$;
create function public.can_operate_turma_academics(p_turma_id uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('test.academics', true) = 'true', false)
    and p_turma_id::text = current_setting('test.scope_turma', true);
$$;

create table public.cursos (id uuid primary key, modalidade text not null);
create table public.turmas (
  id uuid primary key, curso_id uuid references public.cursos, status text not null
);
create table public.modulos (
  id uuid primary key, curso_id uuid references public.cursos,
  nome text default 'Módulo sintético', created_at timestamptz default now()
);
create table public.disciplinas (
  id uuid primary key, modulo_id uuid references public.modulos,
  nome text default 'Disciplina sintética', carga_horaria numeric not null,
  created_at timestamptz default now()
);
create table public.periodos_letivos (id uuid primary key, status text, ordem integer default 1);
create table public.turmas_disciplinas (
  turma_id uuid references public.turmas, disciplina_id uuid references public.disciplinas,
  periodo_letivo_id uuid references public.periodos_letivos, professor_id uuid,
  professor_nome text, concluida boolean default false, primary key (turma_id, disciplina_id)
);
create table public.aulas_turma (
  id uuid primary key default gen_random_uuid(), turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, carga_horaria numeric not null
);
create table public.turma_disciplina_carga_excecoes (
  turma_id uuid references public.turmas, disciplina_id uuid references public.disciplinas,
  limite_autorizado numeric not null, primary key (turma_id,disciplina_id)
);
create table public.matriculas (id uuid primary key, turma_id uuid, aluno_id uuid, status text);
create table public.atividades_extra_classe (
  id uuid primary key default gen_random_uuid(), turma_id uuid not null references public.turmas,
  disciplina_id uuid not null references public.disciplinas, titulo text not null,
  tema text, tipo_resposta text not null default 'TEXTO', texto text, video_url text,
  perguntas jsonb not null default '[]', carga_horaria_compensacao numeric not null
    check (carga_horaria_compensacao > 0), prazo_entrega date,
  status text not null default 'PUBLICADA' check (status in ('RASCUNHO','PUBLICADA','ARQUIVADA')),
  criado_por_tipo text, criado_por_id uuid, criado_por_auth_id uuid,
  atualizado_por_auth_id uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.atividade_extra_classe_respostas (
  id uuid primary key default gen_random_uuid(), atividade_id uuid not null references public.atividades_extra_classe,
  aluno_id uuid not null, status text not null default 'ENTREGUE', resposta_texto text,
  respostas jsonb default '[]', anexo_url text, nota numeric, feedback text,
  entregue_em timestamptz, entregue_por_auth_id uuid, corrigido_em timestamptz,
  corrigido_por_auth_id uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);

create function public.is_professor_assigned_disciplina_open(p_turma uuid, p_disciplina uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.turmas_disciplinas td
    join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    where td.turma_id = p_turma and td.disciplina_id = p_disciplina
      and td.professor_id = public.current_professor_id()
      and pl.status in ('ABERTO','EM_FECHAMENTO'));
$$;
create function public.is_professor_assigned_turma(p_turma uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.turmas_disciplinas td where td.turma_id = p_turma
    and td.professor_id = public.current_professor_id());
$$;
create function public.can_student_read_atividade_extra(p_turma uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.matriculas m where m.turma_id = p_turma
    and m.aluno_id = public.current_aluno_id() and m.status = 'ATIVO');
$$;
create function public.can_access_atividade_extra_turma(p_turma uuid)
returns boolean language sql stable as $$
  select public.can_operate_turma_academics(p_turma) or public.is_professor_assigned_turma(p_turma)
    or public.can_student_read_atividade_extra(p_turma);
$$;

grant usage on schema public, auth to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public, auth to authenticated, service_role;
alter table public.atividades_extra_classe enable row level security;
alter table public.atividade_extra_classe_respostas enable row level security;
create policy fixture_activity_read on public.atividades_extra_classe for select to authenticated
  using (public.can_operate_turma_academics(turma_id) or public.is_professor_assigned_turma(turma_id)
    or (status = 'PUBLICADA' and public.can_student_read_atividade_extra(turma_id)));
create policy fixture_response_read on public.atividade_extra_classe_respostas for select to authenticated
  using (aluno_id = public.current_aluno_id() or exists (
    select 1 from public.atividades_extra_classe ae where ae.id = atividade_id
      and (public.can_operate_turma_academics(ae.turma_id) or public.is_professor_assigned_turma(ae.turma_id))));
