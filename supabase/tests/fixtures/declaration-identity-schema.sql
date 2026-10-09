-- Synthetic dependency boundaries for the production migration (no real records).
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema extensions;
create schema internal_academic;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
create function extensions.unaccent(value text) returns text language sql immutable as $$ select value $$;
create function extensions.gen_random_bytes(length integer) returns bytea language sql volatile as $$
  select decode(substring(md5(random()::text), 1, length * 2), 'hex')
$$;
create function public.is_gestor_for_polo(polo uuid) returns boolean language sql stable as $$
  select coalesce(polo::text = current_setting('test.allowed_polo', true), false)
$$;
create function public.gestor_has_tab(module text, tab text) returns boolean language sql stable as $$
  select coalesce(current_setting('test.allowed_tab', true) = 'true', false)
$$;
create function public.gestor_effective_permissions() returns jsonb language sql stable as $$
  select '{}'::jsonb
$$;
create function public.repaginar_render_contrato_v3(document jsonb, version text) returns jsonb language sql immutable as $$
  select document
$$;
create function internal_academic.student_card_identity_snapshot(type text, rg text, cpf text)
  returns jsonb language sql immutable as $$ select jsonb_build_object('cardIdentity', true) $$;

create table public.parceiros (
  id uuid primary key, nome text, cpf_cnpj text, rg text, tipo_documento text,
  orgao_emissor text, rg_uf_emissao text, rg_data_emissao date,
  data_nascimento date, foto_url text, sexo text, nacionalidade text, naturalidade text,
  titulo_eleitor text, reservista text, nome_mae text, nome_pai text,
  escola_ensino_medio text, ano_conclusao_ensino_medio integer
);
create table public.polos (id uuid primary key, nome text);
create table public.cursos (id uuid primary key, nome text);
create table public.turmas (
  id uuid primary key, nome text, codigo text, curso_id uuid, polo_id uuid
);
create table public.matriculas (
  id uuid primary key, aluno_id uuid, turma_id uuid, status text, data_matricula timestamptz
);
create table public.documentos_validacao_politicas (
  documento text primary key, escopo_identidade text, prefixo text,
  validade_dias integer, validacao_publica boolean
);
create table public.documentos_validacao (
  id uuid primary key default gen_random_uuid(), identidade text unique, codigo text unique,
  documento text, matricula_id uuid, aluno_id uuid, polo_id uuid, periodo_referencia text,
  referencia_externa text, validade_ate timestamptz, emitido_por uuid,
  validacao_publica boolean, dados_emissao jsonb not null default '{}',
  emitido_em timestamptz default now(), ultima_emissao_em timestamptz default now(),
  status text default 'ATIVO', quantidade_emissoes integer default 1, updated_at timestamptz default now()
);

insert into public.polos values
  ('10000000-0000-0000-0000-000000000001', 'Polo sintético A'),
  ('10000000-0000-0000-0000-000000000002', 'Polo sintético B');
insert into public.cursos values ('20000000-0000-0000-0000-000000000001', 'Curso sintético');
insert into public.turmas values
  ('30000000-0000-0000-0000-000000000001', 'Turma A', 'TESTE-A', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'Turma B', 'TESTE-B', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
insert into public.parceiros (id, nome, cpf_cnpj, rg, tipo_documento, orgao_emissor, rg_uf_emissao, rg_data_emissao) values
  ('40000000-0000-0000-0000-000000000001', 'ALUNO SINTETICO RG', '12345678909', '1.234.567-X', 'RG (ANTIGO)', 'SSP', 'SE', '2020-01-24'),
  ('40000000-0000-0000-0000-000000000002', 'ALUNO SINTETICO CIN', '98765432100', null, 'CIN', null, null, null),
  ('40000000-0000-0000-0000-000000000003', 'ALUNO SINTETICO LEGADO', '00000000000', null, 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', null, null, null);
insert into public.matriculas values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'ATIVO', '2026-01-01'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'ATIVO', '2026-01-01'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'ATIVO', '2026-01-01');
insert into public.documentos_validacao_politicas values
  ('declaracao_matricula', 'MATRICULA', 'TEST-MAT', 30, true),
  ('declaracao_frequencia', 'MATRICULA', 'TEST-FREQ', 30, true),
  ('declaracao_irpf', 'ANUAL', 'TEST-IRPF', 30, true),
  ('carteirinha', 'MATRICULA', 'TEST-CARD', 30, true);
