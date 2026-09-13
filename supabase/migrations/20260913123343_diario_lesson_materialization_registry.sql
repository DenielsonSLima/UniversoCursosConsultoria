-- Materialized lessons keep a permanent link to the immutable documentary source.
create table internal_academic.diario_aulas_materializacao_requests (
  request_id uuid primary key,
  importacao_id uuid not null unique references internal_academic.diario_importacoes(id),
  preview_sha256 text not null check (preview_sha256 ~ '^[a-f0-9]{64}$'),
  plano jsonb not null check (jsonb_typeof(plano) = 'object'),
  status text not null check (status in ('EXECUTING','DONE')),
  response jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (request_id, importacao_id)
);

create table internal_academic.diario_aulas_materializadas (
  importacao_id uuid not null,
  aula_historica_id uuid primary key,
  aula_id uuid not null unique references public.aulas_turma(id),
  request_id uuid not null,
  data_documental date not null,
  carga_documental numeric not null check (carga_documental > 0),
  carga_ajustada numeric(5,2) not null check (carga_ajustada > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (aula_historica_id, importacao_id)
    references internal_academic.diario_aulas_importadas(id, importacao_id),
  foreign key (request_id, importacao_id)
    references internal_academic.diario_aulas_materializacao_requests(request_id, importacao_id)
);
create index diario_aulas_materializadas_importacao
  on internal_academic.diario_aulas_materializadas(importacao_id);

alter table internal_academic.diario_aulas_materializacao_requests enable row level security;
alter table internal_academic.diario_aulas_materializadas enable row level security;
revoke all on internal_academic.diario_aulas_materializacao_requests,
  internal_academic.diario_aulas_materializadas from public, anon, authenticated, service_role;
