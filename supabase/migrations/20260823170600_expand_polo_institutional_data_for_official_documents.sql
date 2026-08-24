-- Amplia de forma retrocompativel a identidade institucional usada pelos
-- documentos oficiais, preservando todas as chaves publicadas anteriormente.

CREATE OR REPLACE FUNCTION public.get_dados_institucionais_polo(p_polo_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'poloId', p.id,
    'poloNome', p.nome,
    'razaoSocial', COALESCE(
      NULLIF(pg_catalog.btrim(e.razao_social), ''),
      NULLIF(pg_catalog.btrim(e.nome_fantasia), ''),
      p.nome
    ),
    'cnpj', COALESCE(
      NULLIF(pg_catalog.btrim(p.cnpj), ''),
      NULLIF(pg_catalog.btrim(e.cnpj), '')
    ),
    'telefone', COALESCE(
      NULLIF(pg_catalog.btrim(p.telefone), ''),
      NULLIF(pg_catalog.btrim(e.telefone), '')
    ),
    'endereco', COALESCE(
      NULLIF(pg_catalog.btrim(p.endereco), ''),
      NULLIF(pg_catalog.btrim(e.endereco), '')
    ),
    'numero', COALESCE(
      NULLIF(pg_catalog.btrim(p.numero), ''),
      NULLIF(pg_catalog.btrim(e.numero), '')
    ),
    'complemento', COALESCE(
      NULLIF(pg_catalog.btrim(p.complemento), ''),
      NULLIF(pg_catalog.btrim(e.complemento), '')
    ),
    'bairro', COALESCE(
      NULLIF(pg_catalog.btrim(p.bairro), ''),
      NULLIF(pg_catalog.btrim(e.bairro), '')
    ),
    'cidade', COALESCE(
      NULLIF(pg_catalog.btrim(p.cidade), ''),
      NULLIF(pg_catalog.btrim(e.cidade), '')
    ),
    'estado', COALESCE(
      NULLIF(pg_catalog.btrim(p.estado), ''),
      NULLIF(pg_catalog.btrim(e.uf), '')
    ),
    'cep', COALESCE(
      NULLIF(pg_catalog.btrim(p.cep), ''),
      NULLIF(pg_catalog.btrim(e.cep), '')
    ),
    'is_matriz', COALESCE(p.is_matriz, false),
    'logo_url', COALESCE(
      NULLIF(pg_catalog.btrim(p.logo_url), ''),
      NULLIF(pg_catalog.btrim(e.logo_url), '')
    ),
    'watermark_url', COALESCE(
      NULLIF(pg_catalog.btrim(p.watermark_url), ''),
      NULLIF(pg_catalog.btrim(e.watermark_url), '')
    )
  )
  FROM public.polos p
  LEFT JOIN public.empresas e ON e.id = p.company_id
  WHERE p.id = p_polo_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_dados_institucionais_polo(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dados_institucionais_polo(uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_institucionais_polo(uuid) IS
  'Identidade institucional canonica do polo para documentos oficiais e portais.';
