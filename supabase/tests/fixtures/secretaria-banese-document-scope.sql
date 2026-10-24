-- Ephemeral PostgreSQL fixture. No production records, credentials or network.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.jwt.role', true), '')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.jwt.uid', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('email', current_setting('test.jwt.email', true))
$$;
CREATE FUNCTION extensions.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT $1
$$;
-- Preserve production helpers' nullable result when there is no gestor.
CREATE FUNCTION public.is_gestor() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.gestor', true), '')::boolean
$$;
CREATE FUNCTION public.is_gestor_global() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.global', true), '')::boolean
$$;
CREATE FUNCTION public.gestor_allowed_polo_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.polos', true), '')::uuid[]
$$;
CREATE FUNCTION public.is_gestor_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_gestor_global() OR (
    public.is_gestor() AND $1 = ANY(public.gestor_allowed_polo_ids())
  )
$$;
CREATE FUNCTION public.gestor_has_tab(text, text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.tab', true), '')::boolean
$$;
CREATE FUNCTION public.gestor_has_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.tab', true), '')::boolean
$$;
CREATE TABLE public.usuarios_sistema(email text, status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY, nome text, cpf_cnpj text);
CREATE TABLE public.cursos(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.turmas(
  id uuid PRIMARY KEY, nome text, codigo text, curso_id uuid, polo_id uuid
);
CREATE TABLE public.matriculas(id uuid PRIMARY KEY, data_matricula date);
CREATE TABLE public.contas_receber(
  id uuid PRIMARY KEY, cliente_id uuid, matricula_id uuid, turma_id uuid,
  polo_id uuid, valor numeric, data_vencimento date, parcela_numero integer,
  gateway_provider text, tipo_lancamento text, status text
);
-- SECURITY DEFINER is exercised: the callers have no table grants.
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
