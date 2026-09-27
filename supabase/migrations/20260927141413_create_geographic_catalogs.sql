-- Catálogos geográficos oficiais usados nos cadastros de alunos e parceiros.
--
-- Estratégia de rollback lógico:
-- - os textos legados nacionalidade/naturalidade continuam canônicos durante
--   a transição e nunca dependem dos novos vínculos opcionais;
-- - remover o frontend novo basta para voltar a gravar somente os textos;
-- - o default histórico de documento não é restaurado, pois atribuía CIN a
--   registros sem escolha explícita e podia reclassificar RGs antigos.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.catalogo_municipios_ibge (
  codigo_ibge bigint PRIMARY KEY,
  nome text NOT NULL,
  uf text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_municipios_ibge_codigo_chk
    CHECK (codigo_ibge BETWEEN 1000000 AND 9999999),
  CONSTRAINT catalogo_municipios_ibge_nome_chk
    CHECK (nullif(btrim(nome), '') IS NOT NULL),
  CONSTRAINT catalogo_municipios_ibge_uf_chk
    CHECK (uf ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS catalogo_municipios_ibge_ativos_nome_idx
  ON public.catalogo_municipios_ibge (ativo, nome, uf);

ALTER TABLE public.catalogo_municipios_ibge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogo_municipios_ibge_leitura_publica
  ON public.catalogo_municipios_ibge;
CREATE POLICY catalogo_municipios_ibge_leitura_publica
  ON public.catalogo_municipios_ibge
  FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

REVOKE ALL ON TABLE public.catalogo_municipios_ibge
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.catalogo_municipios_ibge
  TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.catalogo_paises_nacionalidades (
  codigo_iso3 text PRIMARY KEY,
  codigo_iso2 text NOT NULL,
  codigo_m49 integer NOT NULL,
  pais text NOT NULL,
  nacionalidade text,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_paises_codigo_iso3_chk
    CHECK (codigo_iso3 ~ '^[A-Z]{3}$'),
  CONSTRAINT catalogo_paises_codigo_iso2_chk
    CHECK (codigo_iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT catalogo_paises_codigo_m49_chk
    CHECK (codigo_m49 BETWEEN 1 AND 999),
  CONSTRAINT catalogo_paises_pais_chk
    CHECK (nullif(btrim(pais), '') IS NOT NULL),
  CONSTRAINT catalogo_paises_nacionalidade_chk
    CHECK (nacionalidade IS NULL OR nullif(btrim(nacionalidade), '') IS NOT NULL),
  CONSTRAINT catalogo_paises_codigo_iso2_uidx UNIQUE (codigo_iso2),
  CONSTRAINT catalogo_paises_codigo_m49_uidx UNIQUE (codigo_m49)
);

CREATE INDEX IF NOT EXISTS catalogo_paises_ativos_pais_idx
  ON public.catalogo_paises_nacionalidades (ativo, pais);

ALTER TABLE public.catalogo_paises_nacionalidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogo_paises_nacionalidades_leitura_publica
  ON public.catalogo_paises_nacionalidades;
CREATE POLICY catalogo_paises_nacionalidades_leitura_publica
  ON public.catalogo_paises_nacionalidades
  FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

REVOKE ALL ON TABLE public.catalogo_paises_nacionalidades
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.catalogo_paises_nacionalidades
  TO anon, authenticated, service_role;

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS naturalidade_codigo_ibge bigint,
  ADD COLUMN IF NOT EXISTS naturalidade_uf text,
  ADD COLUMN IF NOT EXISTS nacionalidade_codigo_iso3 text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'parceiros_naturalidade_codigo_ibge_fkey'
      AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_naturalidade_codigo_ibge_fkey
      FOREIGN KEY (naturalidade_codigo_ibge)
      REFERENCES public.catalogo_municipios_ibge(codigo_ibge)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'parceiros_nacionalidade_codigo_iso3_fkey'
      AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_nacionalidade_codigo_iso3_fkey
      FOREIGN KEY (nacionalidade_codigo_iso3)
      REFERENCES public.catalogo_paises_nacionalidades(codigo_iso3)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'parceiros_naturalidade_uf_chk'
      AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_naturalidade_uf_chk
      CHECK (naturalidade_uf IS NULL OR naturalidade_uf ~ '^[A-Z]{2}$')
      NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.parceiros
  VALIDATE CONSTRAINT parceiros_naturalidade_uf_chk;

-- Remove somente a inferência futura. Os registros existentes são preservados
-- porque muitos números legados ainda precisam de revisão humana entre RG/CIN.
ALTER TABLE public.parceiros
  ALTER COLUMN tipo_documento DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS parceiros_tipo_documento_check;

ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_tipo_documento_check
  CHECK (
    tipo_documento IS NULL
    OR tipo_documento IN (
      'CARTEIRA DE IDENTIDADE NACIONAL',
      'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
      'CNH',
      'PASSAPORTE',
      'CARTEIRA PROFISSIONAL',
      'RG (ANTIGO)'
    )
  ) NOT VALID;

ALTER TABLE public.parceiros
  VALIDATE CONSTRAINT parceiros_tipo_documento_check;

CREATE OR REPLACE FUNCTION public.buscar_municipios_ibge(
  p_busca text,
  p_limite integer DEFAULT 20
)
RETURNS TABLE (
  codigo_ibge bigint,
  nome text,
  uf text,
  rotulo text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH parametros AS (
    SELECT
      pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(COALESCE(p_busca, '')))) AS busca,
      LEAST(GREATEST(COALESCE(p_limite, 20), 1), 30) AS limite
  )
  SELECT
    municipio.codigo_ibge,
    municipio.nome,
    municipio.uf,
    municipio.nome || '/' || municipio.uf AS rotulo
  FROM public.catalogo_municipios_ibge municipio
  CROSS JOIN parametros
  WHERE municipio.ativo = true
    AND pg_catalog.length(parametros.busca) >= 2
    AND (
      pg_catalog.lower(extensions.unaccent(municipio.nome)) LIKE '%' || parametros.busca || '%'
      OR pg_catalog.lower(municipio.uf) = parametros.busca
      OR pg_catalog.lower(extensions.unaccent(municipio.nome || ' ' || municipio.uf))
        LIKE '%' || parametros.busca || '%'
    )
  ORDER BY
    CASE
      WHEN pg_catalog.lower(extensions.unaccent(municipio.nome)) LIKE parametros.busca || '%'
        THEN 0
      ELSE 1
    END,
    municipio.nome,
    municipio.uf
  LIMIT (SELECT limite FROM parametros);
$function$;

CREATE OR REPLACE FUNCTION public.buscar_paises_nacionalidades(
  p_busca text,
  p_limite integer DEFAULT 20
)
RETURNS TABLE (
  codigo_iso3 text,
  pais text,
  nacionalidade text,
  rotulo text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH parametros AS (
    SELECT
      pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(COALESCE(p_busca, '')))) AS busca,
      LEAST(GREATEST(COALESCE(p_limite, 20), 1), 30) AS limite
  )
  SELECT
    item.codigo_iso3,
    item.pais,
    item.nacionalidade,
    CASE
      WHEN pg_catalog.lower(item.pais) = pg_catalog.lower(item.nacionalidade)
        THEN item.pais
      ELSE item.nacionalidade || ' — ' || item.pais
    END AS rotulo
  FROM public.catalogo_paises_nacionalidades item
  CROSS JOIN parametros
  WHERE item.ativo = true
    AND item.nacionalidade IS NOT NULL
    AND pg_catalog.length(parametros.busca) >= 2
    AND (
      pg_catalog.lower(extensions.unaccent(item.pais)) LIKE '%' || parametros.busca || '%'
      OR pg_catalog.lower(extensions.unaccent(item.nacionalidade)) LIKE '%' || parametros.busca || '%'
      OR pg_catalog.lower(item.codigo_iso3) = parametros.busca
    )
  ORDER BY
    CASE
      WHEN pg_catalog.lower(extensions.unaccent(item.nacionalidade)) LIKE parametros.busca || '%'
        THEN 0
      WHEN pg_catalog.lower(extensions.unaccent(item.pais)) LIKE parametros.busca || '%'
        THEN 1
      ELSE 2
    END,
    item.nacionalidade,
    item.pais
  LIMIT (SELECT limite FROM parametros);
$function$;

REVOKE ALL ON FUNCTION public.buscar_municipios_ibge(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buscar_municipios_ibge(text, integer)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.buscar_paises_nacionalidades(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buscar_paises_nacionalidades(text, integer)
  TO anon, authenticated, service_role;

COMMENT ON TABLE public.catalogo_municipios_ibge IS
  'Municípios oficiais do IBGE para sugestão de naturalidade; texto livre permanece permitido em parceiros.naturalidade.';
COMMENT ON TABLE public.catalogo_paises_nacionalidades IS
  'Países ISO/IBGE; somente gentílicos curados alimentam sugestões de nacionalidade, sem substituir texto livre.';
COMMENT ON COLUMN public.parceiros.naturalidade_codigo_ibge IS
  'Vínculo opcional ao município IBGE; deve ficar nulo quando a certidão exigir localidade histórica ou texto livre.';
COMMIT;
