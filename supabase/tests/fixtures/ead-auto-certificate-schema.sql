-- Dependências mínimas isoladas. Prova, conclusão, emissor e finalizador reais
-- são carregados pelo teste; auth e configuração do ambiente são controlados.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA internal_academic;
CREATE SCHEMA extensions;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(nullif(current_setting('test.auth_role', true), ''), 'authenticated')
$$;
CREATE FUNCTION public.current_aluno_id() RETURNS uuid LANGUAGE sql AS $$
  SELECT nullif(current_setting('test.aluno_id', true), '')::uuid
$$;
CREATE FUNCTION public.can_manage_secretaria_document(text, uuid) RETURNS boolean
LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.gestor', true), '') = 'true' $$;
CREATE FUNCTION public.is_gestor_global() RETURNS boolean LANGUAGE sql AS $$
  SELECT public.can_manage_secretaria_document(NULL, NULL)
$$;
CREATE FUNCTION public.is_gestor_for_polo(uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.is_gestor_global()
$$;
CREATE FUNCTION internal_academic.resolve_responsavel(uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$ SELECT '99999999-9999-4999-8999-999999999999'::uuid $$;
CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$
  SELECT substring(decode(md5(random()::text), 'hex') from 1 for $1)
$$;

CREATE TABLE public.parceiros (
  id uuid PRIMARY KEY, nome text, cpf_cnpj text, tipo_documento text, rg text,
  orgao_emissor text, rg_uf_emissao text, rg_data_emissao date,
  data_nascimento date, foto_url text, instituicao_origem text,
  cidade text, uf text, ano_conclusao_ensino_medio text
);
CREATE TABLE public.polos (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.cursos (
  id uuid PRIMARY KEY, nome text, modalidade text, ead_config jsonb,
  carga_horaria numeric, updated_at timestamptz DEFAULT '2026-01-01'
);
CREATE TABLE public.turmas (id uuid PRIMARY KEY, nome text, codigo text, curso_id uuid, polo_id uuid);
CREATE TABLE public.matriculas (
  id uuid PRIMARY KEY, aluno_id uuid, turma_id uuid, status text,
  data_matricula timestamptz DEFAULT now()
);
CREATE TABLE public.ead_aluno_progresso (
  aluno_id uuid, curso_id uuid, progress jsonb,
  started_at timestamptz DEFAULT now(), PRIMARY KEY (aluno_id, curso_id)
);
CREATE TABLE internal_academic.ead_assessment_answer_keys (
  course_id uuid PRIMARY KEY, activity_answers jsonb DEFAULT '{}', quiz_answers jsonb DEFAULT '{}'
);
CREATE TABLE public.certificados_academicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), matricula_id uuid UNIQUE,
  aluno_id uuid, turma_id uuid, curso_id uuid, polo_id uuid, modalidade text,
  status text DEFAULT 'PENDENTE', data_inscricao timestamptz, data_conclusao date DEFAULT current_date,
  nota_final numeric, certificado_numero text, pagina_livro text, livro_registro text,
  validacao_sistec text, ensino_medio_estabelecimento text, ensino_medio_localidade_uf text,
  ensino_medio_ano_conclusao text, codigo_validacao text UNIQUE, emitido_em timestamptz,
  emitido_por uuid, metadados jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.documentos_validacao_politicas (
  documento text PRIMARY KEY, prefixo text, escopo_identidade text DEFAULT 'MATRICULA',
  validade_dias integer, validacao_publica boolean DEFAULT true
);
CREATE TABLE public.documentos_validacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identidade text UNIQUE, codigo text UNIQUE,
  documento text, matricula_id uuid, aluno_id uuid, polo_id uuid, periodo_referencia text,
  referencia_externa text, validade_ate timestamptz, emitido_por uuid,
  validacao_publica boolean, dados_emissao jsonb DEFAULT '{}', status text DEFAULT 'ATIVO',
  emitido_em timestamptz DEFAULT now(), ultima_emissao_em timestamptz DEFAULT now(),
  quantidade_emissoes integer DEFAULT 1, updated_at timestamptz DEFAULT now()
);
INSERT INTO public.documentos_validacao_politicas(documento,prefixo) VALUES
  ('certificado_ead','CERT-EAD'), ('certificado_tecnico','CERT-TEC'),
  ('certificado_livre','CERT-LIV'), ('certificado_especializacao','CERT-ESP');

CREATE FUNCTION public.ead_config_required_video_count(jsonb) RETURNS integer LANGUAGE sql AS $$
  SELECT CASE WHEN nullif($1->>'videoPrincipalUrl','') IS NULL THEN 0 ELSE 1 END
$$;
CREATE FUNCTION public.ead_jsonb_toggle_text(jsonb, text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN coalesce($1,'[]'::jsonb) ? $2 THEN $1 - $2
    ELSE coalesce($1,'[]'::jsonb) || to_jsonb($2) END
$$;
-- A fixture já contém respostas privadas. A validação estrutural do cofre
-- tem suíte própria; aqui o núcleo real continua calculando a nota no SQL.
CREATE FUNCTION internal_academic.ead_restore_assessment_answers(jsonb, jsonb, jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT $1 $$;
CREATE FUNCTION internal_academic.ead_collect_assessment_answer_keys(jsonb, jsonb, jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION internal_academic.student_card_identity_snapshot(text,text,text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
