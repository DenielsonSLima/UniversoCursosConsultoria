-- Marca-d'água personalizada e independente por página no modelo visual do
-- comprovante. Esta migration não altera o cabeçalho institucional, não
-- habilita documentos e não libera a criação ou assinatura de envelopes.

BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'assinatura-eletronica-modelo-assets',
  'assinatura-eletronica-modelo-assets',
  false,
  1048576,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.assinatura_eletronica_modelo_asset_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  criada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumida_em timestamptz,
  CONSTRAINT assinatura_eletronica_modelo_asset_reservas_request_unique
    UNIQUE (criada_por, request_id),
  CONSTRAINT assinatura_eletronica_modelo_asset_reservas_expiracao_check
    CHECK (expira_em > solicitada_em),
  CONSTRAINT assinatura_eletronica_modelo_asset_reservas_consumo_check
    CHECK (consumida_em IS NULL OR consumida_em >= solicitada_em)
);

CREATE INDEX assinatura_eletronica_modelo_asset_reservas_rate_idx
  ON public.assinatura_eletronica_modelo_asset_reservas (criada_por, solicitada_em DESC);

CREATE TABLE public.assinatura_eletronica_modelo_assets (
  id uuid PRIMARY KEY,
  reserva_id uuid NOT NULL UNIQUE
    REFERENCES public.assinatura_eletronica_modelo_asset_reservas(id) ON DELETE RESTRICT,
  bucket_id text NOT NULL DEFAULT 'assinatura-eletronica-modelo-assets',
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  tamanho_bytes integer NOT NULL,
  largura integer NOT NULL,
  altura integer NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'PRONTO',
  criada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_modelo_assets_bucket_check
    CHECK (bucket_id = 'assinatura-eletronica-modelo-assets'),
  CONSTRAINT assinatura_eletronica_modelo_assets_path_check
    CHECK (storage_path = 'global/' || id::text || '.png'),
  CONSTRAINT assinatura_eletronica_modelo_assets_mime_check
    CHECK (mime_type = 'image/png'),
  CONSTRAINT assinatura_eletronica_modelo_assets_size_check
    CHECK (tamanho_bytes BETWEEN 1 AND 1048576),
  CONSTRAINT assinatura_eletronica_modelo_assets_dimensions_check
    CHECK (
      largura BETWEEN 1 AND 4096
      AND altura BETWEEN 1 AND 4096
      AND largura::bigint * altura::bigint <= 12000000
    ),
  CONSTRAINT assinatura_eletronica_modelo_assets_sha256_check
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assinatura_eletronica_modelo_assets_status_check
    CHECK (status IN ('PRONTO', 'LIMPEZA_PENDENTE'))
);

CREATE TABLE public.assinatura_eletronica_politica_assets (
  politica_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_politicas(id) ON DELETE RESTRICT,
  pagina smallint NOT NULL CHECK (pagina IN (1, 2)),
  asset_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_modelo_assets(id) ON DELETE RESTRICT,
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[0-9a-f]{64}$'),
  asset_snapshot jsonb NOT NULL CHECK (jsonb_typeof(asset_snapshot) = 'object'),
  vinculada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (politica_id, pagina)
);

CREATE INDEX assinatura_eletronica_politica_assets_asset_idx
  ON public.assinatura_eletronica_politica_assets (asset_id, politica_id);

CREATE INDEX assinatura_eletronica_modelo_assets_sha256_idx
  ON public.assinatura_eletronica_modelo_assets (sha256);

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('app.assinatura_modelo_asset_lifecycle', true) = OLD.id::text THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'PRONTO'
       AND NEW.status = 'LIMPEZA_PENDENTE'
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.reserva_id IS NOT DISTINCT FROM OLD.reserva_id
       AND NEW.bucket_id IS NOT DISTINCT FROM OLD.bucket_id
       AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
       AND NEW.mime_type IS NOT DISTINCT FROM OLD.mime_type
       AND NEW.tamanho_bytes IS NOT DISTINCT FROM OLD.tamanho_bytes
       AND NEW.largura IS NOT DISTINCT FROM OLD.largura
       AND NEW.altura IS NOT DISTINCT FROM OLD.altura
       AND NEW.sha256 IS NOT DISTINCT FROM OLD.sha256
       AND NEW.criada_por IS NOT DISTINCT FROM OLD.criada_por
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Assets e vínculos de marca-d''água são imutáveis.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_politica_asset_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'O vínculo versionado da marca-d''água é imutável.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER assinatura_eletronica_modelo_assets_no_update_delete
  BEFORE UPDATE OR DELETE ON public.assinatura_eletronica_modelo_assets
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_modelo_asset_imutavel();

CREATE TRIGGER assinatura_eletronica_politica_assets_no_update_delete
  BEFORE UPDATE OR DELETE ON public.assinatura_eletronica_politica_assets
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_politica_asset_imutavel();

ALTER TABLE public.assinatura_eletronica_modelo_asset_reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_modelo_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_politica_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assinatura_eletronica_modelo_asset_reservas_client_deny
  ON public.assinatura_eletronica_modelo_asset_reservas
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_modelo_assets_client_deny
  ON public.assinatura_eletronica_modelo_assets
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_politica_assets_client_deny
  ON public.assinatura_eletronica_politica_assets
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_modelo_assets_storage_client_deny
  ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'assinatura-eletronica-modelo-assets')
  WITH CHECK (bucket_id <> 'assinatura-eletronica-modelo-assets');

REVOKE ALL ON TABLE public.assinatura_eletronica_modelo_asset_reservas
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_modelo_assets
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_politica_assets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_autorizar_acesso()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Esta RPC é deliberadamente chamada antes de qualquer leitura do corpo na
  -- Edge Function. Não consulta reservas, assets nem Storage antes da guarda.
  IF auth.uid() IS NULL
     OR NOT public.assinatura_eletronica_autoriza_configuracao(NULL)
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_reservar(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_reserva public.assinatura_eletronica_modelo_asset_reservas%ROWTYPE;
  v_recent_requests integer := 0;
  v_recent_assets integer := 0;
BEGIN
  -- Autoriza antes de consultar qualquer reserva ou asset.
  IF v_actor IS NULL
     OR NOT public.assinatura_eletronica_autoriza_configuracao(NULL)
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REQUEST_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura-modelo-asset:' || v_actor::text, 0)
  );

  SELECT reserva.*
  INTO v_reserva
  FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
  WHERE reserva.criada_por = v_actor
    AND reserva.request_id = p_request_id;

  IF FOUND THEN
    IF v_reserva.consumida_em IS NOT NULL THEN
      RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RESERVA_CONSUMIDA' USING ERRCODE = '55000';
    END IF;
    IF v_reserva.expira_em <= now() THEN
      RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RESERVA_EXPIRADA' USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object(
      'reservationId', v_reserva.id,
      'expiresAt', v_reserva.expira_em,
      'mimeType', 'image/png',
      'maxBytes', 1048576
    );
  END IF;

  SELECT count(*)::integer
  INTO v_recent_requests
  FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
  WHERE reserva.criada_por = v_actor
    AND reserva.solicitada_em >= now() - interval '10 minutes';

  IF v_recent_requests >= 10 THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RATE_LIMITED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO v_recent_assets
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.criada_por = v_actor
    AND asset.created_at >= now() - interval '30 days';

  IF v_recent_assets >= 100 THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.assinatura_eletronica_modelo_asset_reservas (
    request_id,
    criada_por
  ) VALUES (
    p_request_id,
    v_actor
  )
  RETURNING * INTO v_reserva;

  RETURN jsonb_build_object(
    'reservationId', v_reserva.id,
    'expiresAt', v_reserva.expira_em,
    'mimeType', 'image/png',
    'maxBytes', 1048576
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_registrar(
  p_reserva_id uuid,
  p_asset_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_tamanho_bytes integer,
  p_largura integer,
  p_altura integer,
  p_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reserva public.assinatura_eletronica_modelo_asset_reservas%ROWTYPE;
  v_existing_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_expected_path text;
  v_sha256 text := lower(btrim(coalesce(p_sha256, '')));
  v_storage_size bigint;
  v_storage_mime text;
BEGIN
  -- O papel de backend é verificado antes de qualquer lookup sensível.
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_reserva_id IS NULL OR p_asset_id IS NULL THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RESERVA_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_expected_path := 'global/' || p_asset_id::text || '.png';
  IF p_storage_path IS DISTINCT FROM v_expected_path
     OR p_mime_type IS DISTINCT FROM 'image/png'
     OR p_tamanho_bytes NOT BETWEEN 1 AND 1048576
     OR p_largura NOT BETWEEN 1 AND 4096
     OR p_altura NOT BETWEEN 1 AND 4096
     OR p_largura::bigint * p_altura::bigint > 12000000
     OR v_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_METADATA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT reserva.*
  INTO v_reserva
  FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
  WHERE reserva.id = p_reserva_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RESERVA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  IF v_reserva.consumida_em IS NOT NULL THEN
    SELECT asset.*
    INTO v_existing_asset
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.reserva_id = v_reserva.id;

    IF NOT FOUND
       OR v_existing_asset.id IS DISTINCT FROM p_asset_id
       OR v_existing_asset.storage_path IS DISTINCT FROM p_storage_path
       OR v_existing_asset.mime_type IS DISTINCT FROM p_mime_type
       OR v_existing_asset.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes
       OR v_existing_asset.largura IS DISTINCT FROM p_largura
       OR v_existing_asset.altura IS DISTINCT FROM p_altura
       OR v_existing_asset.sha256 IS DISTINCT FROM v_sha256
    THEN
      RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REPLAY_MISMATCH' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'id', v_existing_asset.id,
      'mimeType', v_existing_asset.mime_type,
      'sizeBytes', v_existing_asset.tamanho_bytes,
      'width', v_existing_asset.largura,
      'height', v_existing_asset.altura,
      'sha256', v_existing_asset.sha256,
      'replayed', true
    );
  END IF;

  IF v_reserva.expira_em <= now() THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RESERVA_EXPIRADA' USING ERRCODE = '22023';
  END IF;

  SELECT objeto.*
  INTO v_object
  FROM storage.objects AS objeto
  WHERE objeto.bucket_id = 'assinatura-eletronica-modelo-assets'
    AND objeto.name = p_storage_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_OBJECT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  BEGIN
    v_storage_size := nullif(v_object.metadata ->> 'size', '')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_storage_size := NULL;
  END;
  v_storage_mime := lower(coalesce(v_object.metadata ->> 'mimetype', ''));
  IF v_storage_size IS DISTINCT FROM p_tamanho_bytes::bigint
     OR v_storage_mime IS DISTINCT FROM 'image/png'
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_STORAGE_METADATA_MISMATCH' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.assinatura_eletronica_modelo_assets (
    id,
    reserva_id,
    bucket_id,
    storage_path,
    mime_type,
    tamanho_bytes,
    largura,
    altura,
    sha256,
    criada_por
  ) VALUES (
    p_asset_id,
    v_reserva.id,
    'assinatura-eletronica-modelo-assets',
    p_storage_path,
    'image/png',
    p_tamanho_bytes,
    p_largura,
    p_altura,
    v_sha256,
    v_reserva.criada_por
  );

  UPDATE public.assinatura_eletronica_modelo_asset_reservas AS reserva
  SET consumida_em = now()
  WHERE reserva.id = v_reserva.id;

  RETURN jsonb_build_object(
    'id', p_asset_id,
    'mimeType', 'image/png',
    'sizeBytes', p_tamanho_bytes,
    'width', p_largura,
    'height', p_altura,
    'sha256', v_sha256
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_resolver(
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
BEGIN
  -- Autoriza antes de revelar até mesmo a existência do identificador.
  IF auth.uid() IS NULL
     OR NOT public.assinatura_eletronica_autoriza_configuracao(NULL)
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.status = 'PRONTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_asset.id,
    'mimeType', v_asset.mime_type,
    'sizeBytes', v_asset.tamanho_bytes,
    'width', v_asset.largura,
    'height', v_asset.altura,
    'sha256', v_asset.sha256
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_resolver_storage(
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.status = 'PRONTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_asset.id,
    'bucketId', v_asset.bucket_id,
    'storagePath', v_asset.storage_path,
    'mimeType', v_asset.mime_type,
    'sizeBytes', v_asset.tamanho_bytes,
    'width', v_asset.largura,
    'height', v_asset.altura,
    'sha256', v_asset.sha256
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_resolver_storage(
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.status = 'LIMPEZA_PENDENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_CLEANUP_NOT_AUTHORIZED' USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'id', v_asset.id,
    'bucketId', v_asset.bucket_id,
    'storagePath', v_asset.storage_path,
    'mimeType', v_asset.mime_type,
    'sizeBytes', v_asset.tamanho_bytes,
    'width', v_asset.largura,
    'height', v_asset.altura,
    'sha256', v_asset.sha256
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_autorizar(
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_service_role boolean := coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role';
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
BEGIN
  -- A permissão global é conferida antes da existência ou autoria do asset.
  IF NOT v_service_role
     AND (
       v_actor IS NULL
       OR NOT public.assinatura_eletronica_autoriza_configuracao(NULL)
     )
  THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_service_role AND v_asset.criada_por IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_NOT_OWNER' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    WHERE vinculo.asset_id = v_asset.id
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REFERENCIADO' USING ERRCODE = '23503';
  END IF;

  IF v_asset.status = 'PRONTO' THEN
    PERFORM pg_catalog.set_config(
      'app.assinatura_modelo_asset_lifecycle',
      v_asset.id::text,
      true
    );
    UPDATE public.assinatura_eletronica_modelo_assets AS asset
    SET status = 'LIMPEZA_PENDENTE'
    WHERE asset.id = v_asset.id;
  END IF;

  RETURN jsonb_build_object(
    'assetId', v_asset.id,
    'authorized', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_finalizar(
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('assetId', p_asset_id, 'cleaned', true, 'replayed', true);
  END IF;
  IF v_asset.status <> 'LIMPEZA_PENDENTE' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_CLEANUP_NOT_AUTHORIZED' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    WHERE vinculo.asset_id = v_asset.id
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REFERENCIADO' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS objeto
    WHERE objeto.bucket_id = v_asset.bucket_id
      AND objeto.name = v_asset.storage_path
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_STORAGE_NOT_CLEAN' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.assinatura_modelo_asset_lifecycle',
    v_asset.id::text,
    true
  );
  DELETE FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = v_asset.id;

  RETURN jsonb_build_object('assetId', v_asset.id, 'cleaned', true, 'replayed', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_reconciliar_reivindicar(
  p_limite integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_agora timestamptz := now();
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_reservas_expiradas integer := 0;
  v_assets_marcados integer := 0;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  -- Somente o backend pode reivindicar trabalho de manutenção. A guarda vem
  -- antes de qualquer leitura de reservas, assets ou Storage.
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RECONCILIACAO_LIMITE_INVALIDO'
      USING ERRCODE = '22023';
  END IF;

  -- Reservas sem asset são efêmeras. SKIP LOCKED evita disputar com o
  -- registrar e a segunda checagem impede apagar uma reserva consumida.
  WITH expiradas AS (
    SELECT reserva.id
    FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
    WHERE reserva.expira_em <= v_agora
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_modelo_assets AS asset
        WHERE asset.reserva_id = reserva.id
    )
    ORDER BY reserva.expira_em
    LIMIT p_limite * 4
    FOR UPDATE OF reserva SKIP LOCKED
  )
  DELETE FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
  USING expiradas
  WHERE reserva.id = expiradas.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_modelo_assets AS asset
      WHERE asset.reserva_id = reserva.id
    );
  GET DIAGNOSTICS v_reservas_expiradas = ROW_COUNT;

  -- Um draft não salvo recebe 24 horas. Depois disso, se continuar sem FK
  -- versionada, entra no mesmo estado idempotente usado pelo cleanup manual.
  FOR v_asset IN
    SELECT asset.*
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.status = 'PRONTO'
      AND asset.created_at <= v_agora - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_politica_assets AS vinculo
        WHERE vinculo.asset_id = asset.id
    )
    ORDER BY asset.created_at
    LIMIT p_limite
    FOR UPDATE OF asset SKIP LOCKED
  LOOP
    PERFORM pg_catalog.set_config(
      'app.assinatura_modelo_asset_lifecycle',
      v_asset.id::text,
      true
    );
    UPDATE public.assinatura_eletronica_modelo_assets AS asset
    SET status = 'LIMPEZA_PENDENTE'
    WHERE asset.id = v_asset.id
      AND asset.status = 'PRONTO'
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_politica_assets AS vinculo
        WHERE vinculo.asset_id = asset.id
      );
    IF FOUND THEN
      v_assets_marcados := v_assets_marcados + 1;
    END IF;
  END LOOP;

  -- Objetos sem registro são resíduos possíveis de uma falha entre upload e
  -- registro. O TTL de uma hora exclui uploads em andamento. Assets vinculados
  -- nunca entram aqui e LIMPEZA_PENDENTE permanece reivindicável até convergir.
  WITH candidatos AS (
    SELECT
      0 AS prioridade,
      'ASSET'::text AS tipo,
      asset.id AS asset_id,
      asset.bucket_id,
      asset.storage_path,
      asset.created_at
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.status = 'LIMPEZA_PENDENTE'
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_politica_assets AS vinculo
        WHERE vinculo.asset_id = asset.id
      )

    UNION ALL

    SELECT
      1 AS prioridade,
      'ORPHAN_OBJECT'::text AS tipo,
      substring(objeto.name FROM 8 FOR 36)::uuid AS asset_id,
      objeto.bucket_id,
      objeto.name AS storage_path,
      objeto.created_at
    FROM storage.objects AS objeto
    WHERE objeto.bucket_id = 'assinatura-eletronica-modelo-assets'
      AND objeto.created_at <= v_agora - interval '1 hour'
      AND objeto.name ~ '^global/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_modelo_assets AS asset
        WHERE asset.storage_path = objeto.name
      )
  ), reivindicados AS (
    SELECT candidato.*
    FROM candidatos AS candidato
    ORDER BY candidato.prioridade, candidato.created_at
    LIMIT p_limite
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', reivindicado.tipo,
        'assetId', reivindicado.asset_id,
        'bucketId', reivindicado.bucket_id,
        'storagePath', reivindicado.storage_path
      )
      ORDER BY reivindicado.prioridade, reivindicado.created_at
    ),
    '[]'::jsonb
  )
  INTO v_itens
  FROM reivindicados AS reivindicado;

  RETURN jsonb_build_object(
    'expiredReservations', v_reservas_expiradas,
    'markedAssets', v_assets_marcados,
    'items', v_itens
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 2,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'page', 1,
        'template', 'EVIDENCE',
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      ),
      jsonb_build_object(
        'page', 2,
        'template', 'LEGAL_TEXTS',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', 'ownership',
            'title', 'DA PROPRIEDADE',
            'body', 'Defina aqui a identificação e a titularidade do serviço institucional de assinatura eletrônica.'
          ),
          jsonb_build_object(
            'id', 'consent',
            'title', 'DA RATIFICAÇÃO DO CONSENTIMENTO',
            'body', 'Descreva aqui o consentimento do signatário e sua vinculação ao documento, conforme a política jurídica aprovada.'
          ),
          jsonb_build_object(
            'id', 'terms_update',
            'title', 'DA ATUALIZAÇÃO DOS TERMOS DE USO',
            'body', 'Informe como alterações dos Termos de Uso e da Política de Privacidade serão comunicadas aos usuários.'
          ),
          jsonb_build_object(
            'id', 'contact',
            'title', 'COMO ENTRAR EM CONTATO',
            'body', 'Informe os canais oficiais para dúvidas sobre o documento e o tratamento de dados.'
          ),
          jsonb_build_object(
            'id', 'copies',
            'title', 'OBTENÇÃO DE CÓPIAS',
            'body', 'Explique como cada parte poderá consultar ou obter a cópia final do documento e do comprovante.'
          )
        ),
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_normalizar_editor(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_schema integer;
  v_page_1 jsonb;
  v_page_2 jsonb;
  v_watermark jsonb;
  v_watermarks jsonb[] := ARRAY[]::jsonb[];
  v_sections jsonb := '[]'::jsonb;
  v_section jsonb;
  v_expected_id text;
  v_source text;
  v_label text;
  v_asset_id text;
  v_title text;
  v_body text;
  v_total_body_length integer := 0;
  v_opacity numeric;
  v_scale integer;
  v_rotation integer;
  v_index integer;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;

  IF jsonb_typeof(p_editor) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_editor) AS entry(key))
        IS DISTINCT FROM ARRAY['pages', 'schemaVersion']::text[]
     OR jsonb_typeof(p_editor -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_editor ->> 'schemaVersion') !~ '^[12]$'
     OR jsonb_typeof(p_editor -> 'pages') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_editor -> 'pages') <> 2
  THEN
    RAISE EXCEPTION 'O editor deve usar o schema 1 ou 2 e conter exatamente duas páginas.'
      USING ERRCODE = '22023';
  END IF;
  v_schema := (p_editor ->> 'schemaVersion')::integer;
  v_page_1 := p_editor -> 'pages' -> 0;
  v_page_2 := p_editor -> 'pages' -> 1;

  IF jsonb_typeof(v_page_1) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_page_1) AS entry(key))
        IS DISTINCT FROM ARRAY['page', 'template', 'watermark']::text[]
     OR jsonb_typeof(v_page_1 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_1 ->> 'page' <> '1'
     OR v_page_1 ->> 'template' <> 'EVIDENCE'
  THEN
    RAISE EXCEPTION 'A página 1 deve usar o modelo canônico de evidências.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_page_2) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_page_2) AS entry(key))
        IS DISTINCT FROM ARRAY['page', 'sections', 'template', 'watermark']::text[]
     OR jsonb_typeof(v_page_2 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_2 ->> 'page' <> '2'
     OR v_page_2 ->> 'template' <> 'LEGAL_TEXTS'
     OR jsonb_typeof(v_page_2 -> 'sections') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_page_2 -> 'sections') <> 5
  THEN
    RAISE EXCEPTION 'A página 2 deve usar o modelo canônico com cinco blocos jurídicos.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 0..1 LOOP
    v_watermark := (p_editor -> 'pages' -> v_index) -> 'watermark';
    IF jsonb_typeof(v_watermark) IS DISTINCT FROM 'object'
       OR (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(v_watermark) AS entry(key)
       ) IS DISTINCT FROM (
         CASE v_schema
           WHEN 1 THEN ARRAY['enabled', 'label', 'opacity', 'rotationDegrees', 'scalePercent', 'source']::text[]
           ELSE ARRAY['assetId', 'enabled', 'label', 'opacity', 'rotationDegrees', 'scalePercent', 'source']::text[]
         END
       )
       OR jsonb_typeof(v_watermark -> 'enabled') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_watermark -> 'source') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_watermark -> 'opacity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_watermark -> 'scalePercent') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_watermark -> 'rotationDegrees') IS DISTINCT FROM 'number'
       OR (v_watermark ->> 'scalePercent') !~ '^[0-9]+$'
       OR (v_watermark ->> 'rotationDegrees') !~ '^-?[0-9]+$'
    THEN
      RAISE EXCEPTION 'A marca-d''água da página % não corresponde ao contrato autorizado.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_source := v_watermark ->> 'source';
    v_label := CASE
      WHEN jsonb_typeof(v_watermark -> 'label') = 'string' THEN btrim(v_watermark ->> 'label')
      ELSE NULL
    END;
    v_asset_id := CASE
      WHEN v_schema = 2 AND jsonb_typeof(v_watermark -> 'assetId') = 'string'
        THEN lower(btrim(v_watermark ->> 'assetId'))
      ELSE NULL
    END;
    v_opacity := (v_watermark ->> 'opacity')::numeric;
    v_scale := (v_watermark ->> 'scalePercent')::integer;
    v_rotation := (v_watermark ->> 'rotationDegrees')::integer;

    IF v_schema = 1 AND v_source = 'INSTITUTIONAL_BRAND' THEN
      -- Compatibilidade de leitura: o vínculo institucional antigo não é
      -- carregado para o contrato novo; converte para texto local seguro.
      v_source := 'TEXT';
      v_label := 'UNIVERSO';
      v_asset_id := NULL;
    END IF;

    IF v_source NOT IN ('TEXT', 'CUSTOM_ASSET')
       OR v_opacity < 0.03 OR v_opacity > 0.15
       OR v_scale < 20 OR v_scale > 65
       OR v_rotation NOT IN (-45, 0)
       OR (
         v_source = 'TEXT'
         AND (
           v_label IS NULL OR v_label = '' OR char_length(v_label) > 60
           OR v_label ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
           OR NOT public.assinatura_eletronica_texto_editor_seguro(v_label)
           OR (v_schema = 2 AND jsonb_typeof(v_watermark -> 'assetId') IS DISTINCT FROM 'null')
         )
       )
       OR (
         v_source = 'CUSTOM_ASSET'
         AND (
           v_schema <> 2
           OR v_rotation <> 0
           OR jsonb_typeof(v_watermark -> 'label') IS DISTINCT FROM 'null'
           OR jsonb_typeof(v_watermark -> 'assetId') IS DISTINCT FROM 'string'
           OR v_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         )
       )
    THEN
      RAISE EXCEPTION 'A marca-d''água da página % excedeu os limites autorizados.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_watermarks := array_append(v_watermarks, jsonb_build_object(
      'enabled', (v_watermark ->> 'enabled')::boolean,
      'source', v_source,
      'label', CASE WHEN v_source = 'TEXT' THEN to_jsonb(v_label) ELSE 'null'::jsonb END,
      'assetId', CASE WHEN v_source = 'CUSTOM_ASSET' THEN to_jsonb(v_asset_id) ELSE 'null'::jsonb END,
      'opacity', v_opacity,
      'scalePercent', v_scale,
      'rotationDegrees', v_rotation
    ));
  END LOOP;

  FOR v_index IN 0..4 LOOP
    v_section := v_page_2 -> 'sections' -> v_index;
    v_expected_id := CASE v_index
      WHEN 0 THEN 'ownership'
      WHEN 1 THEN 'consent'
      WHEN 2 THEN 'terms_update'
      WHEN 3 THEN 'contact'
      ELSE 'copies'
    END;

    IF jsonb_typeof(v_section) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_section) AS entry(key))
          IS DISTINCT FROM ARRAY['body', 'id', 'title']::text[]
       OR jsonb_typeof(v_section -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_section -> 'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_section -> 'body') IS DISTINCT FROM 'string'
       OR v_section ->> 'id' <> v_expected_id
    THEN
      RAISE EXCEPTION 'O bloco jurídico % não corresponde à ordem canônica.', v_index + 1
        USING ERRCODE = '22023';
    END IF;

    v_title := btrim(v_section ->> 'title');
    v_body := btrim(v_section ->> 'body');
    IF v_title = '' OR char_length(v_title) > 80
       OR v_body = '' OR char_length(v_body) > 260
       OR v_title ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
       OR v_body ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
       OR NOT public.assinatura_eletronica_texto_editor_seguro(v_title)
       OR NOT public.assinatura_eletronica_texto_editor_seguro(v_body)
    THEN
      RAISE EXCEPTION 'O bloco jurídico % excedeu o formato permitido.', v_index + 1
        USING ERRCODE = '22023';
    END IF;
    v_total_body_length := v_total_body_length + char_length(v_body);
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'id', v_expected_id,
      'title', v_title,
      'body', v_body
    ));
  END LOOP;

  IF v_total_body_length > 1000 THEN
    RAISE EXCEPTION 'O conjunto de textos jurídicos excedeu a área segura do comprovante.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'schemaVersion', 2,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'page', 1,
        'template', 'EVIDENCE',
        'watermark', v_watermarks[1]
      ),
      jsonb_build_object(
        'page', 2,
        'template', 'LEGAL_TEXTS',
        'sections', v_sections,
        'watermark', v_watermarks[2]
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_salvar_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO',
  p_configuracao jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_habilitada boolean := false;
  v_status_juridico text := 'PENDENTE_MATRIZ_JURIDICA';
  v_certificado jsonb;
  v_editor jsonb;
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_asset_id uuid;
  v_asset_snapshots jsonb := '{}'::jsonb;
  v_politica_core jsonb;
  v_politica_json jsonb;
  v_company_id uuid;
  v_versao integer;
  v_expected_version integer;
  v_current_version integer;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
  v_index integer;
BEGIN
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para configurar assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_documento = '' OR jsonb_typeof(p_configuracao) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configuração de assinatura inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;
  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_configuracao) AS entry(key))
       IS DISTINCT FROM ARRAY['confirmationMessage', 'editor', 'expectedVersion', 'name', 'receiptMessage', 'receiptTitle']::text[]
     OR jsonb_typeof(p_configuracao -> 'name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'confirmationMessage') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptTitle') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptMessage') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'expectedVersion') IS DISTINCT FROM 'number'
     OR (p_configuracao ->> 'expectedVersion') !~ '^[0-9]+$'
     OR btrim(p_configuracao ->> 'name') = ''
     OR btrim(p_configuracao ->> 'confirmationMessage') = ''
     OR btrim(p_configuracao ->> 'receiptTitle') = ''
     OR btrim(p_configuracao ->> 'receiptMessage') = ''
     OR char_length(p_configuracao ->> 'name') > 120
     OR char_length(p_configuracao ->> 'confirmationMessage') > 600
     OR char_length(p_configuracao ->> 'receiptTitle') > 120
     OR char_length(p_configuracao ->> 'receiptMessage') > 240
     OR p_configuracao ->> 'name' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'confirmationMessage' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'receiptTitle' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR p_configuracao ->> 'receiptMessage' ~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'name')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'confirmationMessage')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'receiptTitle')
     OR NOT public.assinatura_eletronica_texto_editor_seguro(p_configuracao ->> 'receiptMessage')
  THEN
    RAISE EXCEPTION 'Os quatro textos e o editor de duas páginas são obrigatórios e excederam o formato permitido.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_expected_version := (p_configuracao ->> 'expectedVersion')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'A versão-base do modelo excedeu o intervalo permitido.'
      USING ERRCODE = '22023';
  END;
  IF v_expected_version < 0 OR v_expected_version = 2147483647 THEN
    RAISE EXCEPTION 'A versão-base do modelo é inválida.' USING ERRCODE = '22023';
  END IF;

  v_editor := public.assinatura_eletronica_normalizar_editor(p_configuracao -> 'editor');

  -- Trava cada asset usado e congela metadados sem persistir bucket ou path.
  FOR v_index IN 0..1 LOOP
    IF v_editor -> 'pages' -> v_index -> 'watermark' ->> 'source' = 'CUSTOM_ASSET' THEN
      v_asset_id := (v_editor -> 'pages' -> v_index -> 'watermark' ->> 'assetId')::uuid;
      SELECT asset.*
      INTO v_asset
      FROM public.assinatura_eletronica_modelo_assets AS asset
      WHERE asset.id = v_asset_id
        AND asset.status = 'PRONTO'
      FOR KEY SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Marca-d''água personalizada inexistente na página %.', v_index + 1
          USING ERRCODE = '23503';
      END IF;

      v_asset_snapshots := v_asset_snapshots || jsonb_build_object(
        (v_index + 1)::text,
        jsonb_build_object(
          'assetId', v_asset.id,
          'sha256', v_asset.sha256,
          'mimeType', v_asset.mime_type,
          'sizeBytes', v_asset.tamanho_bytes,
          'width', v_asset.largura,
          'height', v_asset.altura
        )
      );
    END IF;
  END LOOP;

  v_certificado := jsonb_build_object(
    'metodo', 'BLOQUEADO',
    'cadeiaEvidencias', false,
    'statusLabel', 'Aguardando parecer jurídico',
    'description', 'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
  );
  v_politica_core := jsonb_build_object(
    'name', btrim(p_configuracao ->> 'name'),
    'confirmationMessage', btrim(p_configuracao ->> 'confirmationMessage'),
    'receiptTitle', btrim(p_configuracao ->> 'receiptTitle'),
    'receiptMessage', btrim(p_configuracao ->> 'receiptMessage'),
    'editor', v_editor,
    'watermarkAssetSnapshots', v_asset_snapshots
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura-eletronica-config:' || coalesce(p_polo_id::text, 'GLOBAL') || ':' || v_documento,
      0
    )
  );

  SELECT politica.*
  INTO v_replay
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id;

  IF FOUND THEN
    IF v_replay.polo_id IS DISTINCT FROM p_polo_id
       OR v_replay.documento IS DISTINCT FROM v_documento
       OR v_replay.versao IS DISTINCT FROM v_expected_version + 1
       OR v_replay.habilitada IS DISTINCT FROM v_habilitada
       OR v_replay.status_juridico IS DISTINCT FROM v_status_juridico
       OR v_replay.certificado IS DISTINCT FROM v_certificado
       OR (
         v_replay.politica
         - 'documentType'
         - 'versionLabel'
         - 'receiptFields'
         - 'signatarios'
       ) IS DISTINCT FROM v_politica_core
    THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;
    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  SELECT coalesce(max(politica.versao), 0)
  INTO v_current_version
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento;

  IF v_current_version IS DISTINCT FROM v_expected_version THEN
    RAISE EXCEPTION 'O modelo foi atualizado por outro usuário. Recarregue a versão atual antes de salvar.'
      USING ERRCODE = '40001';
  END IF;

  v_versao := v_current_version + 1;
  v_politica_json := v_politica_core || jsonb_build_object(
    'documentType', 'MODELO_PADRAO',
    'versionLabel', 'Versão ' || v_versao::text,
    'receiptFields', jsonb_build_array(
      jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
      jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
      jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
      jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
    ),
    'signatarios', jsonb_build_array()
  );

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET arquivada_em = now(),
      arquivada_por = auth.uid(),
      atualizada_por = auth.uid()
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento
    AND politica.arquivada_em IS NULL;

  INSERT INTO public.assinatura_eletronica_politicas (
    company_id,
    polo_id,
    documento,
    versao,
    habilitada,
    status_juridico,
    certificado,
    politica,
    request_id,
    criada_por,
    atualizada_por
  ) VALUES (
    v_company_id,
    p_polo_id,
    v_documento,
    v_versao,
    v_habilitada,
    v_status_juridico,
    v_certificado,
    v_politica_json,
    v_request_id,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_resultado;

  FOR v_index IN 0..1 LOOP
    IF v_editor -> 'pages' -> v_index -> 'watermark' ->> 'source' = 'CUSTOM_ASSET' THEN
      v_asset_id := (v_editor -> 'pages' -> v_index -> 'watermark' ->> 'assetId')::uuid;
      INSERT INTO public.assinatura_eletronica_politica_assets (
        politica_id,
        pagina,
        asset_id,
        asset_sha256,
        asset_snapshot
      )
      SELECT
        v_resultado.id,
        (v_index + 1)::smallint,
        asset.id,
        asset.sha256,
        v_asset_snapshots -> (v_index + 1)::text
      FROM public.assinatura_eletronica_modelo_assets AS asset
      WHERE asset.id = v_asset_id
        AND asset.status = 'PRONTO';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Marca-d''água personalizada deixou de existir durante o salvamento.'
          USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_imutavel()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_politica_asset_imutavel()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_autorizar_acesso()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_reservar(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_registrar(uuid, uuid, text, text, integer, integer, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_resolver(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_resolver_storage(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_autorizar(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_resolver_storage(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_finalizar(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_reconciliar_reivindicar(integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_reservar(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_autorizar_acesso()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_registrar(uuid, uuid, text, text, integer, integer, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_resolver(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_resolver_storage(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_autorizar(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_resolver_storage(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_cleanup_finalizar(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_modelo_asset_reconciliar_reivindicar(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  TO authenticated, service_role;

COMMIT;
