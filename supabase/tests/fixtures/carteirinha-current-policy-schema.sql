-- Isolated, synthetic tables required by the actual public-validator migration.
create role anon;
create role authenticated;
create role service_role;
create schema storage;
create schema internal_academic;

create table public.parceiros (
  id uuid primary key, nome text, cpf_cnpj text, data_nascimento date,
  nome_mae text, foto_url text, status text
);
create table public.empresas (
  id uuid primary key, razao_social text, nome_fantasia text, cnpj text
);
create table public.polos (
  id uuid primary key, nome text, cnpj text, company_id uuid
);
create table public.cursos (id uuid primary key, nome text);
create table public.turmas (
  id uuid primary key, nome text, codigo text, data_previsao_termino date,
  curso_id uuid, polo_id uuid
);
create table public.matriculas (
  id uuid primary key, aluno_id uuid, turma_id uuid, status text,
  data_matricula timestamptz
);
create table public.documentos_validacao_politicas (
  documento text primary key, campos_publicos text[], consulta_publica_ativa boolean,
  exige_vinculo_ativo boolean, validacao_publica boolean, versao integer
);
create table public.documentos_validacao (
  id uuid primary key, documento text, codigo text, status text, validacao_publica boolean,
  politica_versao_emissao integer, campos_publicos_emissao text[], dados_publicos_snapshot jsonb,
  matricula_id uuid, aluno_id uuid, polo_id uuid, validade_ate timestamptz,
  dados_emissao jsonb, emitido_em timestamptz, ultima_emissao_em timestamptz,
  periodo_referencia text, quantidade_emissoes integer
);
create table public.documentos_validacao_preceptores (
  codigo text, status text, validacao_publica boolean, politica_versao_emissao integer,
  campos_publicos_emissao text[], dados_publicos_snapshot jsonb, professor_id uuid,
  validade_ate timestamptz
);
create table public.assinatura_eletronica_envelopes (
  id uuid primary key, status text, documento_snapshot jsonb, finalizado_em timestamptz,
  documento_final_sha256 text, documento text, origem_tipo text
);
create table public.assinatura_eletronica_artefatos (
  envelope_id uuid, classe text, sha256 text, bucket_id text, storage_path text
);
create table storage.objects (bucket_id text, name text);

-- The enrollment formatter is external to this change; retain only its boundary.
create function public.formatar_matricula_validacao(uuid, timestamptz, uuid)
  returns text language sql immutable as $$ select 'UNIV-TEST1234'::text $$;
create function public.validar_documento_por_codigo(text) returns jsonb
  language sql stable security definer set search_path = '' as $$ select null::jsonb $$;
revoke all on function public.validar_documento_por_codigo(text) from public;
grant execute on function public.validar_documento_por_codigo(text) to anon, authenticated, service_role;

insert into public.parceiros values (
  '40000000-0000-0000-0000-000000000001', 'ALUNO SINTETICO ATUAL', '98765432100',
  '2000-05-10', 'MARIA SINTETICA ATUAL', 'https://example.invalid/student-photo.png', 'ATIVO'
);
insert into public.empresas values (
  '60000000-0000-0000-0000-000000000001', 'Instituição sintética', 'Escola sintética', '12345678000195'
);
insert into public.polos values (
  '10000000-0000-0000-0000-000000000001', 'Polo sintético', '12345678000195',
  '60000000-0000-0000-0000-000000000001'
);
insert into public.cursos values ('20000000-0000-0000-0000-000000000001', 'Curso sintético');
insert into public.turmas values (
  '30000000-0000-0000-0000-000000000001', 'Turma atual', 'TESTE-A', '2099-12-31',
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'
);
insert into public.matriculas values (
  '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', 'ATIVO', '2026-01-01T12:00:00Z'
);
