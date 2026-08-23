-- Novos envelopes congelam duas marcas independentes: a landscape do Diario
-- permanece no documento e a portrait do comprovante ganha snapshot proprio.
-- Envelopes anteriores ficam com NULL e continuam no finalizador legado.

BEGIN;

ALTER TABLE public.assinatura_eletronica_envelopes
  ADD COLUMN IF NOT EXISTS comprovante_marca_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_comprovante_marca_v1_valida(
  p_snapshot jsonb,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
BEGIN
  RETURN coalesce(jsonb_typeof(p_snapshot) = 'object'
    AND (
      SELECT array_agg(entry.key ORDER BY entry.key)
      FROM jsonb_object_keys(p_snapshot) AS entry(key)
    ) = ARRAY[
      'opacity', 'poloId', 'rotate', 'scale', 'schemaVersion', 'source', 'url'
    ]::text[]
    AND p_snapshot -> 'schemaVersion' = '1'::jsonb
    AND p_snapshot ->> 'source' = 'POLO_PORTRAIT_WATERMARK_V1'
    AND p_snapshot ->> 'poloId' = p_polo_id::text
    AND public.assinatura_eletronica_marca_retrato_apresentacao_valida(
      jsonb_build_object(
        'url', p_snapshot -> 'url',
        'opacity', p_snapshot -> 'opacity',
        'scale', p_snapshot -> 'scale',
        'rotate', p_snapshot -> 'rotate'
      )
    ), false);
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_diario_completo_v1(
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
  v_raw jsonb := p_snapshot #> '{templateSource,raw}';
  v_cover jsonb;
  v_cover_ids text[];
  v_back_ids text[];
BEGIN
  IF jsonb_typeof(v_raw) <> 'object'
     OR NOT (v_raw ?& ARRAY[
       'capaUrl', 'contracapaUrl', 'rodape', 'imprimirInstrucoes',
       'capaCampos', 'imprimirValidacaoContracapa', 'mensagemValidacao',
       'qrCodeSize', 'contracapaCampos'
     ]::text[])
     OR jsonb_typeof(v_raw -> 'capaCampos') <> 'array'
     OR jsonb_array_length(v_raw -> 'capaCampos') <> 6
     OR jsonb_typeof(v_raw -> 'contracapaCampos') <> 'array'
     OR jsonb_array_length(v_raw -> 'contracapaCampos') < 11
     OR v_raw -> 'imprimirValidacaoContracapa' <> 'true'::jsonb
     OR jsonb_typeof(v_raw -> 'imprimirInstrucoes') <> 'boolean'
     OR jsonb_typeof(v_raw -> 'rodape') <> 'string'
     OR btrim(v_raw ->> 'rodape') = ''
     OR jsonb_typeof(v_raw -> 'mensagemValidacao') <> 'string'
     OR btrim(v_raw ->> 'mensagemValidacao') = ''
     OR jsonb_typeof(v_raw -> 'qrCodeSize') <> 'number'
     OR v_raw ->> 'qrCodeSize' !~ '^[0-9]+$'
     OR (v_raw ->> 'qrCodeSize')::integer NOT BETWEEN 16 AND 70
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw -> 'capaCampos') AS item(field)
    WHERE jsonb_typeof(field) <> 'object'
       OR jsonb_typeof(field -> 'id') <> 'string'
       OR jsonb_typeof(field -> 'label') <> 'string'
       OR jsonb_typeof(field -> 'x') <> 'number'
       OR jsonb_typeof(field -> 'y') <> 'number'
       OR jsonb_typeof(field -> 'width') <> 'number'
       OR jsonb_typeof(field -> 'fontSize') <> 'number'
       OR jsonb_typeof(field -> 'visible') <> 'boolean'
       OR jsonb_typeof(field -> 'color') <> 'string'
       OR jsonb_typeof(field -> 'bold') <> 'boolean'
  ) THEN
    RETURN false;
  END IF;
  SELECT array_agg(field ->> 'id' ORDER BY field ->> 'id')
  INTO v_cover_ids
  FROM jsonb_array_elements(v_raw -> 'capaCampos') AS item(field);
  IF v_cover_ids IS DISTINCT FROM ARRAY[
    'areaTematica', 'curso', 'disciplina', 'modulo', 'professor', 'turma'
  ]::text[] THEN
    RETURN false;
  END IF;

  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', field -> 'id', 'label', field -> 'label',
    'x', field -> 'x', 'y', field -> 'y', 'width', field -> 'width',
    'fontSize', field -> 'fontSize', 'visible', field -> 'visible',
    'color', field -> 'color', 'bold', field -> 'bold',
    'borderTop', field -> 'borderTop', 'align', field -> 'align'
  )) ORDER BY ordinality)
  INTO v_cover
  FROM jsonb_array_elements(v_raw -> 'capaCampos') WITH ORDINALITY
    AS item(field, ordinality);

  IF v_cover IS DISTINCT FROM p_snapshot #> '{template,capaCampos}'
     OR coalesce(
       to_jsonb(nullif(btrim(v_raw ->> 'capaUrl'), '')),
       'null'::jsonb
     )
        IS DISTINCT FROM p_snapshot #> '{template,capaUrl}'
     OR coalesce(
       to_jsonb(nullif(btrim(v_raw ->> 'contracapaUrl'), '')),
       'null'::jsonb
     )
        IS DISTINCT FROM p_snapshot #> '{template,contracapaUrl}'
     OR v_raw -> 'rodape' IS DISTINCT FROM p_snapshot #> '{template,rodape}'
     OR v_raw -> 'imprimirInstrucoes'
        IS DISTINCT FROM p_snapshot #> '{template,imprimirInstrucoes}'
     OR v_raw -> 'imprimirValidacaoContracapa'
        IS DISTINCT FROM p_snapshot #> '{template,imprimirValidacaoContracapa}'
     OR v_raw -> 'mensagemValidacao'
        IS DISTINCT FROM p_snapshot #> '{template,mensagemValidacao}'
     OR to_jsonb(least(50, greatest(16, (v_raw ->> 'qrCodeSize')::integer)))
        IS DISTINCT FROM p_snapshot #> '{template,qrCodeSize}'
     OR p_snapshot #> '{assetSources,coverUrl}'
        IS DISTINCT FROM p_snapshot #> '{template,capaUrl}'
     OR p_snapshot #> '{assetSources,backCoverUrl}'
        IS DISTINCT FROM p_snapshot #> '{template,contracapaUrl}'
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
    WHERE jsonb_typeof(field) <> 'object'
       OR jsonb_typeof(field -> 'id') <> 'string'
       OR btrim(field ->> 'id') = ''
       OR jsonb_typeof(field -> 'x') <> 'number'
       OR (field ->> 'x')::numeric NOT BETWEEN 0 AND 100
       OR jsonb_typeof(field -> 'y') <> 'number'
       OR (field ->> 'y')::numeric NOT BETWEEN 0 AND 100
       OR jsonb_typeof(field -> 'width') <> 'number'
       OR (field ->> 'width')::numeric NOT BETWEEN 1 AND 100
       OR jsonb_typeof(field -> 'fontSize') <> 'number'
       OR (field ->> 'fontSize')::numeric NOT BETWEEN 4 AND 24
       OR jsonb_typeof(field -> 'visible') <> 'boolean'
  ) THEN
    RETURN false;
  END IF;
  SELECT array_agg(DISTINCT field ->> 'id' ORDER BY field ->> 'id')
  INTO v_back_ids
  FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field);
  RETURN v_back_ids @> ARRAY[
    'contracapaTitulo', 'contracapaCurso', 'contracapaTurma',
    'contracapaDisciplina', 'contracapaModulo', 'contracapaProfessor',
    'contracapaRegulamento', 'contracapaAutenticacao', 'contracapaQrCode',
    'contracapaAssinaturaProfessor', 'contracapaAssinaturaCoordenador'
  ]::text[]
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'contracapaTitulo', 'contracapaCurso', 'contracapaTurma',
      'contracapaDisciplina', 'contracapaModulo', 'contracapaProfessor',
      'contracapaRegulamento', 'contracapaAutenticacao', 'contracapaQrCode',
      'contracapaAssinaturaProfessor', 'contracapaAssinaturaCoordenador'
    ]::text[]) AS required_id(id)
    WHERE (
      SELECT count(*)
      FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
      WHERE field ->> 'id' = required_id.id
        AND field -> 'visible' = 'true'::jsonb
    ) <> 1
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_landscape jsonb;
  v_portrait jsonb;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;
  IF NEW.comprovante_marca_snapshot IS NOT NULL
     OR NOT public.assinatura_eletronica_modelo_diario_completo_v1(
       NEW.documento_snapshot
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MODELO_CONFIGURADO_INCOMPLETO';
  END IF;

  SELECT template.conteudo
  INTO v_landscape
  FROM public.documentos_templates AS template
  WHERE template.id = 'watermark_landscape_' || NEW.polo_id::text
  FOR KEY SHARE;
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'source', 'POLO_PORTRAIT_WATERMARK_V1',
    'poloId', pole.id,
    'url', pole.watermark_url,
    'opacity', pole.watermark_opacity,
    'scale', pole.watermark_scale,
    'rotate', pole.watermark_rotate
  )
  INTO v_portrait
  FROM public.polos AS pole
  WHERE pole.id = NEW.polo_id
  FOR KEY SHARE;
  IF NOT public.assinatura_eletronica_marca_landscape_apresentacao_valida(
       v_landscape
     )
     OR NOT public.assinatura_eletronica_comprovante_marca_v1_valida(
       v_portrait,
       NEW.polo_id
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MARCAS_CONFIGURADAS_INDISPONIVEIS';
  END IF;

  NEW.documento_snapshot := jsonb_set(
    NEW.documento_snapshot, '{institutionalIdentity,watermarkUrl}',
    v_landscape -> 'url', false
  );
  NEW.documento_snapshot := jsonb_set(
    NEW.documento_snapshot, '{assetSources,watermarkUrl}',
    v_landscape -> 'url', false
  );
  NEW.documento_snapshot := jsonb_set(
    NEW.documento_snapshot, '{institutionalIdentity,watermark}',
    v_landscape, true
  );
  NEW.comprovante_marca_snapshot := v_portrait;
  IF NOT public.assinatura_eletronica_snapshot_academico_diario_valido(
       NEW.documento_snapshot
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_SNAPSHOT_LANDSCAPE_INVALIDO';
  END IF;
  NEW.academico_snapshot_sha256 :=
    public.assinatura_eletronica_sha256_json(NEW.documento_snapshot);
  RETURN NEW;
END;
$function$;

ALTER TABLE public.assinatura_eletronica_envelopes
  ADD CONSTRAINT assinatura_envelopes_comprovante_marca_v1_check
  CHECK (
    comprovante_marca_snapshot IS NULL
    OR public.assinatura_eletronica_comprovante_marca_v1_valida(
      comprovante_marca_snapshot,
      polo_id
    )
  ) NOT VALID;
ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_envelopes_comprovante_marca_v1_check;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_proteger_comprovante_marca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.comprovante_marca_snapshot
       IS DISTINCT FROM OLD.comprovante_marca_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_COMPROVANTE_MARCA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assinatura_envelopes_00_proteger_comprovante_marca
  ON public.assinatura_eletronica_envelopes;
CREATE TRIGGER assinatura_envelopes_00_proteger_comprovante_marca
  BEFORE UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_proteger_comprovante_marca();

ALTER FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) RENAME TO assinatura_eletronica_rpc_iniciar_finalizacao_diario_v5_legacy;

CREATE FUNCTION public.assinatura_eletronica_rpc_finalizacao_diario_v6_marcas(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_marca jsonb;
  v_polo_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  SELECT envelope.comprovante_marca_snapshot, envelope.polo_id
  INTO v_marca, v_polo_id
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR KEY SHARE;
  IF NOT FOUND
     OR NOT public.assinatura_eletronica_comprovante_marca_v1_valida(
       v_marca,
       v_polo_id
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_COMPROVANTE_MARCA_V6_INVALIDA';
  END IF;
  v_result := public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v5_legacy(
    p_envelope_id, p_actor_auth_user_id, p_auth_session_id, p_request_id
  );
  v_result := v_result || jsonb_build_object(
    'receiptWatermarkSnapshot', v_marca
  );
  RETURN jsonb_set(
    v_result,
    '{receiptAssetReferences,institutionalWatermark}',
    jsonb_build_object(
      'sourceKind', 'INLINE_DATA_URI',
      'sourceRef', 'receiptWatermarkSnapshot.url'
    ),
    false
  );
END;
$function$;

CREATE FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_marca jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  SELECT envelope.comprovante_marca_snapshot
  INTO v_marca
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR KEY SHARE;
  IF NOT FOUND OR v_marca IS NULL THEN
    RETURN public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v5_legacy(
      p_envelope_id, p_actor_auth_user_id, p_auth_session_id, p_request_id
    );
  END IF;
  RETURN public.assinatura_eletronica_rpc_finalizacao_diario_v6_marcas(
    p_envelope_id, p_actor_auth_user_id, p_auth_session_id, p_request_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_comprovante_marca_v1_valida(
  jsonb, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_diario_completo_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_comprovante_marca()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v5_legacy(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_finalizacao_diario_v6_marcas(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) TO service_role;

COMMIT;
