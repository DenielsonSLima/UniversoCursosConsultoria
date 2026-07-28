-- Versão registrada pelo Supabase MCP: 20260728052859.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tipos_parceria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ativo',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipos_parceria_nome_not_blank CHECK (btrim(nome) <> ''),
  CONSTRAINT tipos_parceria_status_check CHECK (status IN ('ativo', 'inativo'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tipos_parceria_nome_unique_ci
  ON public.tipos_parceria (lower(btrim(nome)));

ALTER TABLE public.tipos_parceria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_categorias_gestor_read ON public.categorias;
CREATE POLICY portal_categorias_gestor_read
  ON public.categorias
  FOR SELECT
  TO authenticated
  USING (public.gestor_has_any_module(ARRAY['parceiros', 'cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_categorias_global_insert ON public.categorias;
CREATE POLICY portal_categorias_global_insert
  ON public.categorias
  FOR INSERT
  TO authenticated
  WITH CHECK (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_categorias_global_update ON public.categorias;
CREATE POLICY portal_categorias_global_update
  ON public.categorias
  FOR UPDATE
  TO authenticated
  USING (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]))
  WITH CHECK (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_categorias_global_delete ON public.categorias;
CREATE POLICY portal_categorias_global_delete
  ON public.categorias
  FOR DELETE
  TO authenticated
  USING (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_tipos_parceria_gestor_read ON public.tipos_parceria;
CREATE POLICY portal_tipos_parceria_gestor_read
  ON public.tipos_parceria
  FOR SELECT
  TO authenticated
  USING (public.gestor_has_any_module(ARRAY['parceiros', 'cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_tipos_parceria_global_insert ON public.tipos_parceria;
CREATE POLICY portal_tipos_parceria_global_insert
  ON public.tipos_parceria
  FOR INSERT
  TO authenticated
  WITH CHECK (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_tipos_parceria_global_update ON public.tipos_parceria;
CREATE POLICY portal_tipos_parceria_global_update
  ON public.tipos_parceria
  FOR UPDATE
  TO authenticated
  USING (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]))
  WITH CHECK (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

DROP POLICY IF EXISTS portal_tipos_parceria_global_delete ON public.tipos_parceria;
CREATE POLICY portal_tipos_parceria_global_delete
  ON public.tipos_parceria
  FOR DELETE
  TO authenticated
  USING (public.gestor_has_any_global_module(ARRAY['cadastros', 'configuracoes']::text[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_parceria TO authenticated;

INSERT INTO public.tipos_parceria (nome, descricao, status)
SELECT seed.nome, seed.descricao, 'ativo'
FROM (
  VALUES
    ('CONVÊNIO DE ESTÁGIO', 'Convênio para concessão de estágio'),
    ('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 'Prestação contratual de serviços'),
    ('FACULDADE PARCEIRA / AFILIADO', 'Instituição de ensino parceira ou afiliada'),
    ('PREFEITURA / ÓRGÃO PÚBLICO', 'Parceria com entidade da administração pública'),
    ('ONG / ASSOCIAÇÃO', 'Parceria com organização social ou associação'),
    ('SINDICATO', 'Parceria com entidade sindical'),
    ('FORNECEDOR', 'Fornecedor de produtos ou serviços'),
    ('EMPRESA PRIVADA', 'Parceria institucional com empresa privada')
) AS seed(nome, descricao)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tipos_parceria existente
  WHERE lower(btrim(existente.nome)) = lower(btrim(seed.nome))
);

INSERT INTO public.tipos_parceria (nome, descricao, status)
SELECT DISTINCT btrim(parceiro.tipo_convenio), 'Tipo preservado de cadastro existente', 'ativo'
FROM public.parceiros parceiro
WHERE lower(parceiro.tipo) = 'pj'
  AND nullif(btrim(parceiro.tipo_convenio), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tipos_parceria existente
    WHERE lower(btrim(existente.nome)) = lower(btrim(parceiro.tipo_convenio))
  );

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS categoria_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_parceria_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parceiros_categoria_id_fkey'
      AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_categoria_id_fkey
      FOREIGN KEY (categoria_id)
      REFERENCES public.categorias(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parceiros_tipo_parceria_id_fkey'
      AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_tipo_parceria_id_fkey
      FOREIGN KEY (tipo_parceria_id)
      REFERENCES public.tipos_parceria(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS parceiros_categoria_id_idx
  ON public.parceiros (categoria_id)
  WHERE categoria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS parceiros_tipo_parceria_id_idx
  ON public.parceiros (tipo_parceria_id)
  WHERE tipo_parceria_id IS NOT NULL;

UPDATE public.parceiros parceiro
SET tipo_parceria_id = tipo.id
FROM public.tipos_parceria tipo
WHERE lower(parceiro.tipo) = 'pj'
  AND parceiro.tipo_parceria_id IS NULL
  AND nullif(btrim(parceiro.tipo_convenio), '') IS NOT NULL
  AND lower(btrim(tipo.nome)) = lower(btrim(parceiro.tipo_convenio));

COMMENT ON COLUMN public.parceiros.categoria_id IS
  'Categoria empresarial/cadastral da pessoa jurídica. O texto legado tipo_pj é mantido por compatibilidade.';

COMMENT ON COLUMN public.parceiros.tipo_parceria_id IS
  'Tipo canônico do vínculo/convênio. O texto legado tipo_convenio é mantido por compatibilidade.';

CREATE OR REPLACE FUNCTION public.sistema_evento_modulo(p_table_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_table_name
    WHEN 'usuarios_sistema' THEN 'Configurações'
    WHEN 'polos' THEN 'Configurações'
    WHEN 'empresas' THEN 'Configurações'
    WHEN 'categorias' THEN 'Configurações'
    WHEN 'tipos_parceria' THEN 'Configurações'
    WHEN 'categorias_financeiras' THEN 'Configurações'
    WHEN 'contas_bancarias' THEN 'Configurações'
    WHEN 'regras_cobranca' THEN 'Configurações'
    WHEN 'taxas_pagamento' THEN 'Configurações'
    WHEN 'templates_mensagens' THEN 'Configurações'
    WHEN 'mensageria_config' THEN 'Configurações'
    WHEN 'asaas_config' THEN 'Configurações'
    WHEN 'documentos_templates' THEN 'Configurações'
    WHEN 'parceiros' THEN 'Parceiros'
    WHEN 'cursos' THEN 'Cadastros'
    WHEN 'disciplinas' THEN 'Cadastros'
    WHEN 'turmas' THEN 'Gestão Acadêmica'
    WHEN 'matriculas' THEN 'Gestão Acadêmica'
    WHEN 'matricula_movimentacoes' THEN 'Gestão Acadêmica'
    WHEN 'contas_receber' THEN 'Financeiro'
    WHEN 'contas_pagar' THEN 'Financeiro'
    WHEN 'despesas_lancamentos' THEN 'Financeiro'
    WHEN 'transferencias_contas' THEN 'Caixa'
    WHEN 'secretaria_solicitacoes' THEN 'Secretaria'
    WHEN 'certificados_academicos' THEN 'Secretaria'
    WHEN 'documentos_validacao' THEN 'Secretaria'
    WHEN 'biblioteca_documentos' THEN 'Biblioteca'
    WHEN 'biblioteca_pastas' THEN 'Biblioteca'
    WHEN 'comunicacao_chats' THEN 'Comunicação'
    WHEN 'comunicacao_mensagens' THEN 'Comunicação'
    ELSE 'Sistema'
  END;
$$;

DROP TRIGGER IF EXISTS trg_sistema_eventos_audit ON public.tipos_parceria;
CREATE TRIGGER trg_sistema_eventos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.tipos_parceria
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_sistema_evento_trigger();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tipos_parceria'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tipos_parceria;
  END IF;
END $$;

COMMIT;
