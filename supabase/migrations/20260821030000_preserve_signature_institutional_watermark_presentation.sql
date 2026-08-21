-- Preserva a apresentação do modelo institucional pronto no comprovante de
-- assinatura. O ativo e seus parâmetros são congelados juntos no snapshot;
-- snapshots anteriores seguem pelo caminho histórico sem serem reinterpretados.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_marca_landscape_data_uri_valida(text)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MARCA_LANDSCAPE_CONTRATO_BASE_AUSENTE';
  END IF;
END;
$migration$;

-- O conteúdo oficial de documentos_templates é a única representação aceita.
-- Não há defaults nem reconstrução visual no pipeline de assinatura.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_marca_landscape_apresentacao_valida(
  p_watermark jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_opacity numeric;
  v_scale integer;
BEGIN
  IF p_watermark IS NULL
     OR jsonb_typeof(p_watermark) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_watermark) AS entry(key)
     ) IS DISTINCT FROM ARRAY['opacity', 'rotate', 'scale', 'url']::text[]
     OR jsonb_typeof(p_watermark -> 'url') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_watermark -> 'opacity') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_watermark -> 'scale') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_watermark -> 'rotate') IS DISTINCT FROM 'boolean'
     OR p_watermark ->> 'scale' !~ '^[0-9]+$'
     OR NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
       p_watermark ->> 'url'
     )
  THEN
    RETURN false;
  END IF;

  v_opacity := (p_watermark ->> 'opacity')::numeric;
  v_scale := (p_watermark ->> 'scale')::integer;
  RETURN v_opacity BETWEEN 0 AND 1
    AND v_scale BETWEEN 10 AND 100
    AND v_scale % 5 = 0;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

-- O validador anterior conhece apenas as três chaves legadas da identidade.
-- O wrapper novo aceita a apresentação explícita, confere que ela é a mesma
-- marca congelada e a remove apenas na cópia delegada ao validador anterior.
ALTER FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
  RENAME TO assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_identity jsonb;
  v_watermark jsonb;
  v_normalized jsonb;
BEGIN
  v_identity := p_snapshot -> 'institutionalIdentity';
  IF jsonb_typeof(v_identity) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  v_watermark := v_identity -> 'watermark';
  -- A ausência distingue o documento histórico, que continua a delegar para
  -- o contrato aplicado anteriormente sem ganhar parâmetros atuais por acaso.
  IF v_watermark IS NULL THEN
    RETURN public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark(
      p_snapshot
    );
  END IF;

  IF NOT public.assinatura_eletronica_marca_landscape_apresentacao_valida(
       v_watermark
     )
     OR v_watermark ->> 'url' IS DISTINCT FROM
       p_snapshot #>> '{institutionalIdentity,watermarkUrl}'
     OR v_watermark ->> 'url' IS DISTINCT FROM
       p_snapshot #>> '{assetSources,watermarkUrl}'
  THEN
    RETURN false;
  END IF;

  v_normalized := pg_catalog.jsonb_set(
    p_snapshot,
    ARRAY['institutionalIdentity'],
    v_identity - 'watermark',
    false
  );
  RETURN public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark(
    v_normalized
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

-- A marca é materializada pelo trigger antes do hash/constraint do envelope.
-- Ela vem do template oficial do polo e não do formulário, cliente ou Edge.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_template public.documentos_templates%ROWTYPE;
  v_watermark jsonb;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;

  SELECT template.*
  INTO v_template
  FROM public.documentos_templates AS template
  WHERE template.id = 'watermark_landscape_' || NEW.polo_id::text
  FOR KEY SHARE;
  v_watermark := v_template.conteudo;

  IF NOT FOUND
     OR NOT public.assinatura_eletronica_marca_landscape_apresentacao_valida(
       v_watermark
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MARCA_LANDSCAPE_APRESENTACAO_INDISPONIVEL';
  END IF;

  NEW.documento_snapshot := pg_catalog.jsonb_set(
    NEW.documento_snapshot,
    ARRAY['institutionalIdentity', 'watermarkUrl'],
    v_watermark -> 'url',
    false
  );
  NEW.documento_snapshot := pg_catalog.jsonb_set(
    NEW.documento_snapshot,
    ARRAY['assetSources', 'watermarkUrl'],
    v_watermark -> 'url',
    false
  );
  NEW.documento_snapshot := pg_catalog.jsonb_set(
    NEW.documento_snapshot,
    ARRAY['institutionalIdentity', 'watermark'],
    v_watermark,
    true
  );
  IF NOT public.assinatura_eletronica_snapshot_academico_diario_valido(
    NEW.documento_snapshot
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_SNAPSHOT_MARCA_LANDSCAPE_INVALIDO';
  END IF;
  NEW.academico_snapshot_sha256 :=
    public.assinatura_eletronica_sha256_json(NEW.documento_snapshot);
  RETURN NEW;
END;
$function$;

-- A prévia visual recebe exatamente a mesma estrutura do modelo que será
-- congelada em um novo envelope. A URL isolada é proibida neste contrato.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_preview_identidade_matriz()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_matrix_count integer;
  v_brand record;
  v_logo_url text;
  v_watermark jsonb;
BEGIN
  SELECT count(*)
  INTO v_matrix_count
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  JOIN public.documentos_templates AS marca
    ON marca.id = 'watermark_landscape_' || pole.id::text
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false)
    AND jsonb_typeof(marca.conteudo) = 'object';
  IF v_matrix_count <> 1 THEN
    RAISE EXCEPTION
      'A previa exige uma matriz ativa com watermark_landscape_<polo_id>; foram encontradas %.',
      v_matrix_count
      USING ERRCODE = '55000';
  END IF;

  SELECT
    coalesce(nullif(btrim(pole.nome), ''), nullif(btrim(company.nome_fantasia), '')) AS name,
    coalesce(nullif(btrim(pole.cnpj), ''), nullif(btrim(company.cnpj), '')) AS cnpj,
    coalesce(nullif(btrim(pole.endereco), ''), nullif(btrim(company.endereco), '')) AS address,
    coalesce(nullif(btrim(pole.numero), ''), nullif(btrim(company.numero), '')) AS number,
    coalesce(nullif(btrim(pole.complemento), ''), nullif(btrim(company.complemento), '')) AS complement,
    coalesce(nullif(btrim(pole.bairro), ''), nullif(btrim(company.bairro), '')) AS neighborhood,
    coalesce(nullif(btrim(pole.cidade), ''), nullif(btrim(company.cidade), '')) AS city,
    coalesce(nullif(btrim(pole.estado), ''), nullif(btrim(company.uf), '')) AS state,
    coalesce(nullif(btrim(pole.cep), ''), nullif(btrim(company.cep), '')) AS postal_code,
    coalesce(nullif(btrim(pole.telefone), ''), nullif(btrim(company.telefone), '')) AS phone,
    coalesce(nullif(btrim(pole.logo_url), ''), nullif(btrim(company.logo_url), '')) AS logo_url,
    marca.conteudo AS watermark
  INTO v_brand
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  JOIN public.documentos_templates AS marca
    ON marca.id = 'watermark_landscape_' || pole.id::text
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false)
    AND jsonb_typeof(marca.conteudo) = 'object';

  IF coalesce(v_brand.name, '') = '' THEN
    RAISE EXCEPTION 'A matriz ativa nao possui nome institucional para a previa.'
      USING ERRCODE = '22023';
  END IF;
  v_logo_url := v_brand.logo_url;
  v_watermark := v_brand.watermark;
  IF v_logo_url IS NOT NULL
     AND (
       char_length(v_logo_url) > 16777216
       OR (
         v_logo_url !~* '^https://'
         AND v_logo_url !~* '^data:image/(png|jpe?g|webp);base64,'
       )
     )
  THEN
    RAISE EXCEPTION 'O logotipo da matriz nao usa uma origem autorizada.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.assinatura_eletronica_marca_landscape_apresentacao_valida(
       v_watermark
     )
  THEN
    RAISE EXCEPTION 'A marca landscape da matriz nao usa o modelo oficial completo.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'name', v_brand.name,
      'legalName', '',
      'cnpj', coalesce(v_brand.cnpj, ''),
      'address', coalesce(v_brand.address, ''),
      'number', coalesce(v_brand.number, ''),
      'complement', coalesce(v_brand.complement, ''),
      'neighborhood', coalesce(v_brand.neighborhood, ''),
      'city', coalesce(v_brand.city, ''),
      'state', coalesce(v_brand.state, ''),
      'postalCode', coalesce(v_brand.postal_code, ''),
      'phone', coalesce(v_brand.phone, ''),
      'email', 'universo.cursoseconsultoria@gmail.com',
      'isHeadquarters', true
    ),
    'logoUrl', v_logo_url,
    'watermark', v_watermark
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_marca_landscape_apresentacao_valida(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_preview_identidade_matriz()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
