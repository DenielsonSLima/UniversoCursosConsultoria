-- Historical documents are evidence, not permission to edit operational records.
create table internal_academic.diario_importacoes (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id),
  disciplina_id uuid not null references public.disciplinas(id),
  professor_id uuid not null references public.parceiros(id),
  source_sha256 text not null unique check (source_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_name text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  carga_oficial numeric not null check (carga_oficial > 0),
  carga_aulas_oficial numeric not null check (carga_aulas_oficial >= 0),
  carga_aulas_documental numeric,
  horas_estado text not null check (horas_estado in ('CONFERIDO','EM_CONFERENCIA')),
  created_at timestamptz not null default clock_timestamp(),
  unique (turma_id, disciplina_id),
  unique (id, turma_id, disciplina_id),
  foreign key (turma_id, disciplina_id)
    references public.turmas_disciplinas(turma_id, disciplina_id)
);

create table internal_academic.diario_aulas_importadas (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references internal_academic.diario_importacoes(id),
  source_key text not null,
  ordem integer not null,
  data_aula date,
  carga_horaria numeric check (carga_horaria > 0),
  conteudo text,
  pratica text,
  data_estado text not null check (data_estado in ('CONFERIDO','EM_CONFERENCIA')),
  horas_estado text not null check (horas_estado in ('CONFERIDO','EM_CONFERENCIA')),
  fonte jsonb not null,
  unique (importacao_id, source_key),
  unique (id, importacao_id)
);

create table internal_academic.diario_resultados_importados (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null,
  turma_id uuid not null,
  disciplina_id uuid not null,
  aluno_id uuid not null references public.parceiros(id),
  matricula_id uuid not null,
  source_person_key text not null,
  ativo boolean not null default true,
  notas_estado text not null check (notas_estado in ('CONFERIDO','EM_CONFERENCIA')),
  frequencia_estado text not null check (frequencia_estado in ('CONFERIDO','EM_CONFERENCIA')),
  media_parcial numeric check (media_parcial between 0 and 10),
  media_final numeric check (media_final between 0 and 10),
  nota_rec numeric check (nota_rec between 0 and 10),
  frequencia_percent numeric check (frequencia_percent between 0 and 100),
  total_faltas integer check (total_faltas >= 0),
  aulas_registradas integer check (aulas_registradas >= 0),
  frequencias_lancadas integer check (frequencias_lancadas >= 0),
  resultado_documental text,
  origem text not null default 'DOCX_HISTORICO' check (origem = 'DOCX_HISTORICO'),
  fonte jsonb not null,
  row_fingerprint text not null check (row_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (importacao_id, turma_id, disciplina_id)
    references internal_academic.diario_importacoes(id, turma_id, disciplina_id),
  foreign key (matricula_id, turma_id, aluno_id)
    references public.matriculas(id, turma_id, aluno_id),
  unique (importacao_id, source_person_key),
  unique (id, importacao_id)
);
create unique index diario_resultados_importados_active_identity
  on internal_academic.diario_resultados_importados(turma_id, disciplina_id, aluno_id)
  where ativo;
create index diario_resultados_importados_enrollment
  on internal_academic.diario_resultados_importados(matricula_id, disciplina_id) where ativo;

create table internal_academic.diario_frequencias_importadas (
  importacao_id uuid not null,
  resultado_id uuid not null,
  aula_id uuid not null,
  status char(1) check (status in ('P','F','J')),
  estado text not null check (estado in ('CONFERIDO','EM_CONFERENCIA')),
  fonte jsonb not null,
  primary key (resultado_id, aula_id),
  foreign key (resultado_id, importacao_id)
    references internal_academic.diario_resultados_importados(id, importacao_id),
  foreign key (aula_id, importacao_id)
    references internal_academic.diario_aulas_importadas(id, importacao_id)
);

alter table internal_academic.diario_importacoes enable row level security;
alter table internal_academic.diario_aulas_importadas enable row level security;
alter table internal_academic.diario_resultados_importados enable row level security;
alter table internal_academic.diario_frequencias_importadas enable row level security;
revoke all on internal_academic.diario_importacoes,
  internal_academic.diario_aulas_importadas,
  internal_academic.diario_resultados_importados,
  internal_academic.diario_frequencias_importadas from public, anon, authenticated, service_role;

create function internal_academic.diario_historical_field_confirmed(p_field jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_field #>> '{review,state}' in ('CONFIRMED','CONFERIDO')
    and jsonb_typeof(p_field -> 'sourceRefs') = 'array'
    and jsonb_array_length(p_field -> 'sourceRefs') > 0, false);
$$;

create function internal_academic.diario_historical_number(p_field jsonb, p_max numeric)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v_value numeric;
begin
  if not internal_academic.diario_historical_field_confirmed(p_field)
    or jsonb_typeof(p_field -> 'value') <> 'number' then return null; end if;
  v_value := (p_field ->> 'value')::numeric;
  if v_value < 0 or v_value > p_max then return null; end if;
  return v_value;
end;
$$;
revoke all on function internal_academic.diario_historical_field_confirmed(jsonb),
  internal_academic.diario_historical_number(jsonb,numeric) from public, anon, authenticated, service_role;
