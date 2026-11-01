-- Ambiente descartável: apenas identidades e dados sintéticos.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA internal_academic;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role', true), '')
$$;
CREATE FUNCTION public.gestor_effective_permissions() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.permissions', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE FUNCTION public.is_gestor() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.active', true), '')::boolean, false)
$$;
CREATE FUNCTION public.is_gestor_global() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.global', true), '')::boolean, false)
$$;
CREATE FUNCTION public.gestor_allowed_polo_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.polos', true), '')::uuid[], '{}'::uuid[])
$$;
CREATE FUNCTION public.current_aluno_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.aluno', true), '')::uuid
$$;
CREATE FUNCTION public.current_professor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid
$$;
CREATE FUNCTION public.gestor_has_module(p_module text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_gestor() AND (
    (public.gestor_effective_permissions()->'modules') ? p_module
    OR (p_module='inicio' AND (public.gestor_effective_permissions()->'modules') ? 'dashboard')
  )
$$;
CREATE FUNCTION public.gestor_has_any_module(p_modules text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(p_modules) m WHERE public.gestor_has_module(m))
$$;
CREATE FUNCTION public.gestor_has_tab(p_module text, p_tab text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.gestor_has_module(p_module) AND CASE
    WHEN jsonb_typeof(public.gestor_effective_permissions()->'tabs'->p_module)='array'
      THEN (public.gestor_effective_permissions()->'tabs'->p_module) ? p_tab
    ELSE true
  END
$$;
CREATE FUNCTION public.is_gestor_for_polo(p_polo uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_gestor() AND (public.is_gestor_global() OR p_polo=ANY(public.gestor_allowed_polo_ids()))
$$;
CREATE FUNCTION public.gestor_has_all_polos() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_gestor() AND public.is_gestor_global()
$$;
CREATE FUNCTION public.gestor_has_dashboard_widget(p_widget text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.gestor_has_module('inicio') AND coalesce(
    (public.gestor_effective_permissions()->'dashboardWidgets') ? p_widget, false)
$$;
CREATE FUNCTION internal_academic.resolve_responsavel(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT auth.uid()
$$;

CREATE TABLE public.parceiros(
  id uuid PRIMARY KEY, tipo text, nome text, status text,
  polo_id uuid, polo_ids uuid[], created_at timestamptz,
  pcd_tipo text, raca_cor text, cpf_cnpj text, chave_pix text
);
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.parceiros TO authenticated;
CREATE TABLE public.aluno_vacinas(
  id uuid PRIMARY KEY, aluno_id uuid, curso_id uuid, matricula_id uuid, turma_id uuid,
  vacina_codigo text, vacina_nome text, dose_numero integer, dose_label text,
  data_aplicacao date, lote text, local_aplicacao text, observacao text,
  arquivo_url text, status text, origem text, validado_por uuid, validado_em timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.aluno_vacinas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aluno_vacinas TO authenticated;
CREATE TABLE storage.objects(id uuid PRIMARY KEY, bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
CREATE TABLE public.cursos(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.turmas(id uuid PRIMARY KEY, curso_id uuid, nome text);
CREATE TABLE public.matriculas(id uuid PRIMARY KEY, aluno_id uuid, turma_id uuid, status text, data_matricula date);
CREATE TABLE public.contas_receber(
  id uuid PRIMARY KEY, cliente_id uuid, polo_id uuid, valor numeric, valor_pago numeric,
  status text, data_pagamento date, data_vencimento date, descricao text, created_at timestamptz
);
CREATE TABLE public.contas_pagar(
  id uuid PRIMARY KEY, polo_id uuid, valor numeric, valor_pago numeric,
  status text, data_pagamento date, data_vencimento date
);
