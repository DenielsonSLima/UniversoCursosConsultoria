-- Terceira aba visual do editor: carimbo de assinatura aplicado à última
-- página do PDF original. Não cria página 3, não habilita envelopes e mantém
-- o documento global bloqueado até aprovação jurídica.

BEGIN;

CREATE TABLE public.assinatura_eletronica_politica_carimbo_assets (
  politica_id uuid PRIMARY KEY
    REFERENCES public.assinatura_eletronica_politicas(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_modelo_assets(id) ON DELETE RESTRICT,
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[0-9a-f]{64}$'),
  asset_snapshot jsonb NOT NULL CHECK (jsonb_typeof(asset_snapshot) = 'object'),
  vinculada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assinatura_eletronica_politica_carimbo_assets_asset_idx
  ON public.assinatura_eletronica_politica_carimbo_assets (asset_id, politica_id);

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_politica_carimbo_asset_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'O vínculo versionado da imagem do carimbo é imutável.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER assinatura_eletronica_politica_carimbo_assets_no_update_delete
  BEFORE UPDATE OR DELETE ON public.assinatura_eletronica_politica_carimbo_assets
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_politica_carimbo_asset_imutavel();

ALTER TABLE public.assinatura_eletronica_politica_carimbo_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assinatura_eletronica_politica_carimbo_assets_client_deny
  ON public.assinatura_eletronica_politica_carimbo_assets
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.assinatura_eletronica_politica_carimbo_assets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_referenciado(
  p_asset_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS marca
    WHERE marca.asset_id = p_asset_id
  ) OR EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_carimbo_assets AS carimbo
    WHERE carimbo.asset_id = p_asset_id
  );
$function$;

-- Defesa em profundidade: nenhuma rotina de lifecycle pode marcar ou apagar
-- um ativo que já faça parte de uma versão de marca-d'água ou carimbo.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_asset_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('app.assinatura_modelo_asset_lifecycle', true) = OLD.id::text THEN
    IF public.assinatura_eletronica_modelo_asset_referenciado(OLD.id) THEN
      RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REFERENCIADO' USING ERRCODE = '23503';
    END IF;
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
  RAISE EXCEPTION 'Assets de modelos visuais são imutáveis.'
    USING ERRCODE = '55000';
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
  IF NOT v_service_role
     AND (v_actor IS NULL OR NOT public.assinatura_eletronica_autoriza_configuracao(NULL))
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
  IF public.assinatura_eletronica_modelo_asset_referenciado(v_asset.id) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REFERENCIADO' USING ERRCODE = '23503';
  END IF;

  IF v_asset.status = 'PRONTO' THEN
    PERFORM pg_catalog.set_config('app.assinatura_modelo_asset_lifecycle', v_asset.id::text, true);
    UPDATE public.assinatura_eletronica_modelo_assets AS asset
    SET status = 'LIMPEZA_PENDENTE'
    WHERE asset.id = v_asset.id;
  END IF;

  RETURN jsonb_build_object('assetId', v_asset.id, 'authorized', true);
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
  IF public.assinatura_eletronica_modelo_asset_referenciado(v_asset.id) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_REFERENCIADO' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects AS objeto
    WHERE objeto.bucket_id = v_asset.bucket_id AND objeto.name = v_asset.storage_path
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_STORAGE_NOT_CLEAN' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.set_config('app.assinatura_modelo_asset_lifecycle', v_asset.id::text, true);
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
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'ASSINATURA_MODELO_ASSET_RECONCILIACAO_LIMITE_INVALIDO'
      USING ERRCODE = '22023';
  END IF;

  WITH expiradas AS (
    SELECT reserva.id
    FROM public.assinatura_eletronica_modelo_asset_reservas AS reserva
    WHERE reserva.expira_em <= v_agora
      AND NOT EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_modelo_assets AS asset
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
      SELECT 1 FROM public.assinatura_eletronica_modelo_assets AS asset
      WHERE asset.reserva_id = reserva.id
    );
  GET DIAGNOSTICS v_reservas_expiradas = ROW_COUNT;

  FOR v_asset IN
    SELECT asset.*
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.status = 'PRONTO'
      AND asset.created_at <= v_agora - interval '24 hours'
      AND NOT public.assinatura_eletronica_modelo_asset_referenciado(asset.id)
    ORDER BY asset.created_at
    LIMIT p_limite
    FOR UPDATE OF asset SKIP LOCKED
  LOOP
    PERFORM pg_catalog.set_config('app.assinatura_modelo_asset_lifecycle', v_asset.id::text, true);
    UPDATE public.assinatura_eletronica_modelo_assets AS asset
    SET status = 'LIMPEZA_PENDENTE'
    WHERE asset.id = v_asset.id
      AND asset.status = 'PRONTO'
      AND NOT public.assinatura_eletronica_modelo_asset_referenciado(asset.id);
    IF FOUND THEN
      v_assets_marcados := v_assets_marcados + 1;
    END IF;
  END LOOP;

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
      AND NOT public.assinatura_eletronica_modelo_asset_referenciado(asset.id)

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
        SELECT 1 FROM public.assinatura_eletronica_modelo_assets AS asset
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
      ) ORDER BY reivindicado.prioridade, reivindicado.created_at
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

-- Conserva os validadores v2 para compatibilidade de leitura, sem expô-los.
ALTER FUNCTION public.assinatura_eletronica_editor_padrao()
  RENAME TO assinatura_eletronica_editor_padrao_v2_legacy;
ALTER FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  RENAME TO assinatura_eletronica_normalizar_editor_v2_legacy;
ALTER FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  RENAME TO assinatura_eletronica_salvar_configuracao_v2_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_set(
    public.assinatura_eletronica_editor_padrao_v2_legacy(),
    '{schemaVersion}',
    '3'::jsonb,
    true
  ) || jsonb_build_object(
    'signatureStamp', jsonb_build_object(
      'enabled', false,
      'canonicalLabel', 'Documento assinado eletronicamente',
      'assetId', NULL,
      'layout', 'HORIZONTAL',
      'slots', jsonb_build_array(
        jsonb_build_object(
          'role', 'PROFESSOR',
          'pageTarget', 'LAST_PAGE',
          'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
          'xBp', 9000,
          'yBp', 69000,
          'widthBp', 38000,
          'heightBp', 10500
        ),
        jsonb_build_object(
          'role', 'COORDENADOR',
          'pageTarget', 'LAST_PAGE',
          'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
          'xBp', 53000,
          'yBp', 69000,
          'widthBp', 38000,
          'heightBp', 10500
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
  v_legacy_editor jsonb;
  v_normalized jsonb;
  v_stamp jsonb;
  v_normalized_stamp jsonb;
  v_slot jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_role text;
  v_asset_id text;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
  v_first jsonb;
  v_second jsonb;
  v_index integer;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;
  IF jsonb_typeof(p_editor) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_editor -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_editor ->> 'schemaVersion') !~ '^[123]$'
  THEN
    RAISE EXCEPTION 'O editor deve usar o schema 1, 2 ou 3.' USING ERRCODE = '22023';
  END IF;
  v_schema := (p_editor ->> 'schemaVersion')::integer;

  IF v_schema IN (1, 2) THEN
    v_normalized := public.assinatura_eletronica_normalizar_editor_v2_legacy(p_editor);
    RETURN jsonb_set(v_normalized, '{schemaVersion}', '3'::jsonb, true)
      || jsonb_build_object(
        'signatureStamp', public.assinatura_eletronica_editor_padrao() -> 'signatureStamp'
      );
  END IF;

  IF (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_editor) AS entry(key))
       IS DISTINCT FROM ARRAY['pages', 'schemaVersion', 'signatureStamp']::text[]
  THEN
    RAISE EXCEPTION 'O editor v3 não corresponde ao contrato autorizado.' USING ERRCODE = '22023';
  END IF;

  v_stamp := p_editor -> 'signatureStamp';
  IF jsonb_typeof(v_stamp) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_stamp) AS entry(key))
        IS DISTINCT FROM ARRAY['assetId', 'canonicalLabel', 'enabled', 'layout', 'slots']::text[]
     OR jsonb_typeof(v_stamp -> 'enabled') IS DISTINCT FROM 'boolean'
     OR (v_stamp ->> 'enabled')::boolean IS DISTINCT FROM false
     OR jsonb_typeof(v_stamp -> 'canonicalLabel') IS DISTINCT FROM 'string'
     OR v_stamp ->> 'canonicalLabel' <> 'Documento assinado eletronicamente'
     OR jsonb_typeof(v_stamp -> 'layout') IS DISTINCT FROM 'string'
     OR v_stamp ->> 'layout' NOT IN ('HORIZONTAL', 'COMPACT')
     OR jsonb_typeof(v_stamp -> 'slots') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_stamp -> 'slots') <> 2
     OR jsonb_typeof(v_stamp -> 'assetId') NOT IN ('null', 'string')
  THEN
    RAISE EXCEPTION 'A configuração do carimbo não corresponde ao contrato autorizado.'
      USING ERRCODE = '22023';
  END IF;

  v_asset_id := CASE
    WHEN jsonb_typeof(v_stamp -> 'assetId') = 'string' THEN lower(btrim(v_stamp ->> 'assetId'))
    ELSE NULL
  END;
  IF v_asset_id IS NOT NULL
     AND v_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'A imagem própria do carimbo exige um ativo autorizado.' USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 0..1 LOOP
    v_slot := v_stamp -> 'slots' -> v_index;
    v_role := CASE v_index WHEN 0 THEN 'PROFESSOR' ELSE 'COORDENADOR' END;
    IF jsonb_typeof(v_slot) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(v_slot) AS entry(key))
          IS DISTINCT FROM ARRAY['coordinateSpace', 'heightBp', 'pageTarget', 'role', 'widthBp', 'xBp', 'yBp']::text[]
       OR jsonb_typeof(v_slot -> 'role') IS DISTINCT FROM 'string'
       OR v_slot ->> 'role' <> v_role
       OR jsonb_typeof(v_slot -> 'pageTarget') IS DISTINCT FROM 'string'
       OR v_slot ->> 'pageTarget' <> 'LAST_PAGE'
       OR jsonb_typeof(v_slot -> 'coordinateSpace') IS DISTINCT FROM 'string'
       OR v_slot ->> 'coordinateSpace' <> 'PAGE_TOP_LEFT_BP_V1'
       OR jsonb_typeof(v_slot -> 'xBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'yBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'widthBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'heightBp') IS DISTINCT FROM 'number'
       OR v_slot ->> 'xBp' !~ '^[0-9]+$'
       OR v_slot ->> 'yBp' !~ '^[0-9]+$'
       OR v_slot ->> 'widthBp' !~ '^[0-9]+$'
       OR v_slot ->> 'heightBp' !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'O posicionamento do carimbo de % não corresponde ao contrato.', lower(v_role)
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_x := (v_slot ->> 'xBp')::integer;
      v_y := (v_slot ->> 'yBp')::integer;
      v_width := (v_slot ->> 'widthBp')::integer;
      v_height := (v_slot ->> 'heightBp')::integer;
    EXCEPTION WHEN numeric_value_out_of_range THEN
      RAISE EXCEPTION 'As coordenadas do carimbo de % excederam o intervalo.', lower(v_role)
        USING ERRCODE = '22023';
    END;
    IF v_width NOT BETWEEN 24000 AND 90000
       OR v_height NOT BETWEEN 7000 AND 25000
       OR v_x NOT BETWEEN 0 AND 100000 - v_width
       OR v_y NOT BETWEEN 0 AND 100000 - v_height
    THEN
      RAISE EXCEPTION 'O posicionamento do carimbo de % está fora da página original.', lower(v_role)
        USING ERRCODE = '22023';
    END IF;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'role', v_role,
      'pageTarget', 'LAST_PAGE',
      'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
      'xBp', v_x,
      'yBp', v_y,
      'widthBp', v_width,
      'heightBp', v_height
    ));
  END LOOP;

  v_first := v_slots -> 0;
  v_second := v_slots -> 1;
  IF (v_first ->> 'xBp')::integer < (v_second ->> 'xBp')::integer + (v_second ->> 'widthBp')::integer
     AND (v_first ->> 'xBp')::integer + (v_first ->> 'widthBp')::integer > (v_second ->> 'xBp')::integer
     AND (v_first ->> 'yBp')::integer < (v_second ->> 'yBp')::integer + (v_second ->> 'heightBp')::integer
     AND (v_first ->> 'yBp')::integer + (v_first ->> 'heightBp')::integer > (v_second ->> 'yBp')::integer
  THEN
    RAISE EXCEPTION 'Os carimbos de professor e coordenador não podem se sobrepor.'
      USING ERRCODE = '22023';
  END IF;

  v_legacy_editor := (p_editor - 'signatureStamp')
    || jsonb_build_object('schemaVersion', 2);
  v_normalized := public.assinatura_eletronica_normalizar_editor_v2_legacy(v_legacy_editor);
  v_normalized_stamp := jsonb_build_object(
    'enabled', false,
    'canonicalLabel', 'Documento assinado eletronicamente',
    'assetId', CASE WHEN v_asset_id IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_asset_id) END,
    'layout', v_stamp ->> 'layout',
    'slots', v_slots
  );
  RETURN jsonb_set(v_normalized, '{schemaVersion}', '3'::jsonb, true)
    || jsonb_build_object('signatureStamp', v_normalized_stamp);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_apresentar_configuracao(
  p_registro public.assinatura_eletronica_politicas
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'polo_id', (p_registro).polo_id,
    'version', (p_registro).versao,
    'enabled', (p_registro).habilitada,
    'legal_status_label', public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico),
    'previewIdentity', public.assinatura_eletronica_preview_identidade_matriz(),
    'certificate', jsonb_build_object(
      'statusLabel', coalesce(
        (p_registro).certificado ->> 'statusLabel',
        public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico)
      ),
      'description', coalesce(
        (p_registro).certificado ->> 'description',
        CASE
          WHEN (p_registro).habilitada THEN
            'A configuração exige cadeia de evidências e autenticação reforçada; a execução conclusiva ainda não está liberada nesta fundação.'
          ELSE
            'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
        END
      )
    ),
    'policy', jsonb_build_object(
      'documentType', coalesce((p_registro).politica ->> 'documentType', (p_registro).documento),
      'name', coalesce((p_registro).politica ->> 'name', 'Modelo de comprovante de assinatura'),
      'versionLabel', 'Versão ' || (p_registro).versao::text,
      'confirmationMessage', coalesce(
        (p_registro).politica ->> 'confirmationMessage',
        'A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.'
      ),
      'receiptTitle', coalesce((p_registro).politica ->> 'receiptTitle', 'Comprovante de Assinatura Eletrônica'),
      'receiptMessage', coalesce(
        (p_registro).politica ->> 'receiptMessage',
        'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.'
      ),
      'receiptFields', CASE
        WHEN jsonb_typeof((p_registro).politica -> 'receiptFields') = 'array'
          THEN (p_registro).politica -> 'receiptFields'
        ELSE jsonb_build_array(
          jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
          jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
          jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
          jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
        )
      END,
      'editor', CASE
        WHEN jsonb_typeof((p_registro).politica -> 'editor') = 'object'
          THEN public.assinatura_eletronica_normalizar_editor((p_registro).politica -> 'editor')
        ELSE public.assinatura_eletronica_editor_padrao()
      END
    )
  );
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
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_expected_version integer;
  v_editor jsonb;
  v_legacy_editor jsonb;
  v_legacy_config jsonb;
  v_stamp_asset_id uuid;
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_snapshot jsonb := 'null'::jsonb;
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  -- A autorização precede qualquer lookup de request, política ou asset.
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para configurar assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;
  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;
  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_configuracao) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(entry.key ORDER BY entry.key) FROM jsonb_object_keys(p_configuracao) AS entry(key))
        IS DISTINCT FROM ARRAY['confirmationMessage', 'editor', 'expectedVersion', 'name', 'receiptMessage', 'receiptTitle']::text[]
     OR jsonb_typeof(p_configuracao -> 'expectedVersion') IS DISTINCT FROM 'number'
     OR (p_configuracao ->> 'expectedVersion') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'Configuração de assinatura inválida.' USING ERRCODE = '22023';
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

  -- Serializa replays antes de delegar ao saver v2, evitando que duas chamadas
  -- concorrentes vejam a versão intermediária sem o snapshot do carimbo.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura-carimbo-request:' || v_request_id::text, 0)
  );

  IF jsonb_typeof(v_editor -> 'signatureStamp' -> 'assetId') = 'string' THEN
    v_stamp_asset_id := (v_editor -> 'signatureStamp' ->> 'assetId')::uuid;
    SELECT asset.*
    INTO v_stamp_asset
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.id = v_stamp_asset_id
      AND asset.status = 'PRONTO'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A imagem própria do carimbo não existe ou não está disponível.'
        USING ERRCODE = '23503';
    END IF;
    v_stamp_snapshot := jsonb_build_object(
      'assetId', v_stamp_asset.id,
      'sha256', v_stamp_asset.sha256,
      'mimeType', v_stamp_asset.mime_type,
      'sizeBytes', v_stamp_asset.tamanho_bytes,
      'width', v_stamp_asset.largura,
      'height', v_stamp_asset.altura
    );
  END IF;

  SELECT politica.*
  INTO v_replay
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id;

  IF FOUND THEN
    IF v_replay.polo_id IS NOT NULL
       OR v_replay.documento IS DISTINCT FROM 'MODELO_PADRAO'
       OR v_replay.versao IS DISTINCT FROM v_expected_version + 1
       OR v_replay.habilitada IS DISTINCT FROM false
       OR v_replay.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'
       OR v_replay.politica ->> 'name' IS DISTINCT FROM btrim(p_configuracao ->> 'name')
       OR v_replay.politica ->> 'confirmationMessage' IS DISTINCT FROM btrim(p_configuracao ->> 'confirmationMessage')
       OR v_replay.politica ->> 'receiptTitle' IS DISTINCT FROM btrim(p_configuracao ->> 'receiptTitle')
       OR v_replay.politica ->> 'receiptMessage' IS DISTINCT FROM btrim(p_configuracao ->> 'receiptMessage')
       OR v_replay.politica -> 'editor' IS DISTINCT FROM v_editor
       OR v_replay.politica -> 'signatureStampAssetSnapshot' IS DISTINCT FROM v_stamp_snapshot
    THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;
    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  v_legacy_editor := (v_editor - 'signatureStamp')
    || jsonb_build_object('schemaVersion', 2);
  v_legacy_config := jsonb_set(p_configuracao, '{editor}', v_legacy_editor, true);

  PERFORM public.assinatura_eletronica_salvar_configuracao_v2_legacy(
    p_polo_id,
    v_documento,
    v_legacy_config,
    v_request_id
  );

  SELECT politica.*
  INTO v_resultado
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_resultado.habilitada IS DISTINCT FROM false
     OR v_resultado.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'
  THEN
    RAISE EXCEPTION 'A versão visual do carimbo não preservou o bloqueio jurídico.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET politica = jsonb_set(politica.politica, '{editor}', v_editor, true)
    || jsonb_build_object('signatureStampAssetSnapshot', v_stamp_snapshot)
  WHERE politica.id = v_resultado.id
  RETURNING * INTO v_resultado;

  IF v_stamp_asset_id IS NOT NULL THEN
    INSERT INTO public.assinatura_eletronica_politica_carimbo_assets (
      politica_id,
      asset_id,
      asset_sha256,
      asset_snapshot
    ) VALUES (
      v_resultado.id,
      v_stamp_asset.id,
      v_stamp_asset.sha256,
      v_stamp_snapshot
    );
  END IF;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_politica_carimbo_asset_imutavel()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_asset_referenciado(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao_v2_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor_v2_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao_v2_legacy(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_apresentar_configuracao(public.assinatura_eletronica_politicas)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  TO authenticated, service_role;

COMMIT;
