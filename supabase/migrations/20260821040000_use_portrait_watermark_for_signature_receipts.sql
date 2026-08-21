-- O comprovante de assinatura eletrônica é A4 retrato. A fonte oficial dele
-- é a marca retrato já configurada no polo, não watermark_landscape_<polo_id>.
-- Snapshots emitidos antes desta migration continuam imutáveis.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_marca_landscape_apresentacao_valida(jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MARCA_RETRATO_CONTRATO_BASE_AUSENTE';
  END IF;
END;
$migration$;

-- O formato do descritor permanece único. Esta função nomeia a origem correta
-- para o comprovante retrato, sem aceitar defaults ou uma fonte alternativa.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_marca_retrato_apresentacao_valida(
  p_watermark jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT coalesce(
    public.assinatura_eletronica_marca_landscape_apresentacao_valida(p_watermark),
    false
  );
$function$;

-- O nome da função é preservado porque o trigger já aplicado depende dele.
-- A implementação, porém, passa a congelar somente os quatro campos retrato
-- da unidade que emite o Diário.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_polo public.polos%ROWTYPE;
  v_watermark jsonb;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;

  SELECT pole.*
  INTO v_polo
  FROM public.polos AS pole
  WHERE pole.id = NEW.polo_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MARCA_RETRATO_INDISPONIVEL';
  END IF;

  v_watermark := pg_catalog.jsonb_build_object(
    'url', v_polo.watermark_url,
    'opacity', v_polo.watermark_opacity,
    'scale', v_polo.watermark_scale,
    'rotate', v_polo.watermark_rotate
  );

  IF NOT public.assinatura_eletronica_marca_retrato_apresentacao_valida(
       v_watermark
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MARCA_RETRATO_APRESENTACAO_INDISPONIVEL';
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
      MESSAGE = 'ASSINATURA_DIARIO_SNAPSHOT_MARCA_RETRATO_INVALIDO';
  END IF;
  NEW.academico_snapshot_sha256 :=
    public.assinatura_eletronica_sha256_json(NEW.documento_snapshot);
  RETURN NEW;
END;
$function$;

-- A prévia deve transportar o mesmo modelo retrato que um novo envelope vai
-- congelar. Não consulta documentos_templates nem watermark_landscape_*.
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
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false);
  IF v_matrix_count <> 1 THEN
    RAISE EXCEPTION
      'A previa exige uma matriz ativa; foram encontradas %.',
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
    pole.watermark_url,
    pole.watermark_opacity,
    pole.watermark_scale,
    pole.watermark_rotate
  INTO v_brand
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false);

  IF coalesce(v_brand.name, '') = '' THEN
    RAISE EXCEPTION 'A matriz ativa nao possui nome institucional para a previa.'
      USING ERRCODE = '22023';
  END IF;
  v_logo_url := v_brand.logo_url;
  v_watermark := pg_catalog.jsonb_build_object(
    'url', v_brand.watermark_url,
    'opacity', v_brand.watermark_opacity,
    'scale', v_brand.watermark_scale,
    'rotate', v_brand.watermark_rotate
  );
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
  IF NOT public.assinatura_eletronica_marca_retrato_apresentacao_valida(
       v_watermark
     )
  THEN
    RAISE EXCEPTION 'A marca retrato da matriz nao usa o modelo oficial completo.'
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

REVOKE ALL ON FUNCTION public.assinatura_eletronica_marca_retrato_apresentacao_valida(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_preview_identidade_matriz()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
