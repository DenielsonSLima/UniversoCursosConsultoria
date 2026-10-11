-- Base mínima sintética para executar as RPCs e os triggers reais em PostgreSQL.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TYPE auth.one_time_token_type AS ENUM ('confirmation_token', 'recovery_token');
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
  invited_at timestamptz, encrypted_password text,
  confirmation_token text DEFAULT '', recovery_token text DEFAULT '',
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE auth.one_time_tokens (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id),
  token_type auth.one_time_token_type, token_hash text
);
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id));
CREATE TABLE public.polos (id uuid PRIMARY KEY, is_matriz boolean, status text);
CREATE TABLE public.perfis_acesso (
  id uuid PRIMARY KEY, permissoes jsonb, restricao_horario jsonb
);
CREATE TABLE public.usuarios_sistema (
  id uuid PRIMARY KEY, auth_user_id uuid, nome text, email text, cpf text,
  status text DEFAULT 'Ativo', context text DEFAULT 'global', polo_ids uuid[],
  perfil_acesso_id uuid, personalizar_permissoes boolean DEFAULT false,
  permissoes jsonb DEFAULT '{"allPolos":true,"modules":["parceiros"]}',
  restricao_horario jsonb,
  primeiro_acesso_institucional_pendente boolean DEFAULT true,
  senha_institucional_criada_em timestamptz, acesso_institucional_origem text DEFAULT 'CONVITE',
  primeiro_acesso_institucional_operacao_id uuid
);
CREATE TABLE public.parceiros (
  id uuid PRIMARY KEY, tipo text DEFAULT 'Aluno', nome text DEFAULT 'Pessoa sintética',
  status text DEFAULT 'Ativo', email text, cpf_cnpj text, polo_id uuid, polo_ids uuid[],
  auth_user_id uuid, auth_login_email text, acesso_status text DEFAULT 'pendente',
  acesso_erro text, acesso_ativado_em timestamptz, updated_at timestamptz DEFAULT now(),
  troca_senha_obrigatoria boolean DEFAULT true,
  email_validado_gestor_em timestamptz, senha_atualizada_em timestamptz,
  senha_temporaria_pendente boolean DEFAULT false, senha_temporaria_emitida_em timestamptz,
  senha_temporaria_emissao_id uuid, senha_temporaria_emissao_iniciada_em timestamptz,
  senha_temporaria_emissao_senha_alterada_em timestamptz,
  aceitou_termos_uso boolean DEFAULT false, aceitou_termos_uso_em timestamptz,
  termos_uso_versao text,
  primeiro_acesso_institucional_pendente boolean DEFAULT true,
  senha_institucional_criada_em timestamptz, acesso_institucional_origem text DEFAULT 'CONVITE',
  primeiro_acesso_institucional_operacao_id uuid
);
CREATE TABLE public.responsaveis_legais (
  id uuid PRIMARY KEY, auth_user_id uuid, cpf_normalizado text, email text,
  status text DEFAULT 'ATIVO', senha_atualizada_em timestamptz,
  troca_senha_obrigatoria boolean DEFAULT true,
  senha_temporaria_pendente boolean DEFAULT false, senha_temporaria_emitida_em timestamptz,
  senha_temporaria_emissao_id uuid, senha_temporaria_emissao_iniciada_em timestamptz,
  senha_temporaria_emissao_senha_alterada_em timestamptz
);
CREATE TABLE public.portal_identidade_institucional_senha_eventos (
  auth_user_id uuid PRIMARY KEY, senha_alterada_em timestamptz
);
CREATE TABLE public.sistema_eventos (
  actor_id uuid, actor_nome text, actor_email text, actor_tipo text,
  pessoa_id uuid, pessoa_nome text, pessoa_tipo text, polo_id uuid,
  modulo text, entidade text, entidade_id text, acao text,
  descricao text, origem text, detalhes jsonb
);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('role', current_setting('request.jwt.claim.role', true));
$$;
CREATE FUNCTION public.is_active_status(p_status text) RETURNS boolean LANGUAGE sql AS $$
  SELECT upper(coalesce(p_status, '')) IN ('ATIVO', 'ATIVA');
$$;
-- CPF sintético conhecido; esta dependência não participa da validação de senha.
CREATE FUNCTION public.is_valid_cpf(p_cpf text) RETURNS boolean LANGUAGE sql AS $$
  SELECT p_cpf = '52998224725';
$$;
-- Representa a antiga assinatura para conferir que o rollout a elimina.
CREATE FUNCTION public.portal_validar_email_aluno_por_gestor(uuid, uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT true; $$;
