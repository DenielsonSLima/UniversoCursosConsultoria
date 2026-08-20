-- Registra a intenção antes de cada upload do Diário e permite reconciliar,
-- depois de TTL, somente objetos privados sem referência canônica.
-- A remoção física continua exclusiva da Storage API na Edge Function.
BEGIN;

CREATE TABLE public.assinatura_eletronica_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  classe text NOT NULL CHECK (classe IN (
    'DOCUMENTO_ORIGINAL',
    'DOCUMENTO_FINAL',
    'COMPROVANTE_EVIDENCIA'
  )),
  actor_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  auth_session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  bucket_id text NOT NULL DEFAULT 'documentos-assinatura-eletronica',
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf'),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 52428800),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  estado text NOT NULL DEFAULT 'RESERVADO' CHECK (estado IN (
    'RESERVADO', 'EM_LIMPEZA', 'REGISTRADO', 'REMOVIDO', 'DIVERGENTE'
  )),
  reservado_em timestamptz NOT NULL DEFAULT statement_timestamp(),
  expira_em timestamptz NOT NULL,
  cleanup_lease_token uuid,
  cleanup_lease_expira_em timestamptz,
  cleanup_delete_authorized_em timestamptz,
  cleanup_tentativas integer NOT NULL DEFAULT 0 CHECK (cleanup_tentativas >= 0),
  cleanup_ultimo_resultado text CHECK (cleanup_ultimo_resultado IS NULL OR cleanup_ultimo_resultado IN (
    'AUSENTE', 'REMOVIDO', 'FALHA_TRANSITORIA', 'HASH_DIVERGENTE',
    'REFERENCIADO', 'ESTADO_DIVERGENTE'
  )),
  registrado_em timestamptz,
  removido_em timestamptz,
  divergente_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT assinatura_eletronica_upload_intents_unique_class
    UNIQUE (envelope_id, classe),
  CONSTRAINT assinatura_eletronica_upload_intents_unique_path
    UNIQUE (bucket_id, storage_path),
  CONSTRAINT assinatura_eletronica_upload_intents_bucket_check
    CHECK (bucket_id = 'documentos-assinatura-eletronica'),
  CONSTRAINT assinatura_eletronica_upload_intents_path_check
    CHECK (
      storage_path = 'envelopes/' || envelope_id::text || '/' || CASE classe
        WHEN 'DOCUMENTO_ORIGINAL' THEN 'documento-original.pdf'
        WHEN 'DOCUMENTO_FINAL' THEN 'documento-final.pdf'
        WHEN 'COMPROVANTE_EVIDENCIA' THEN 'comprovante-evidencia.pdf'
      END
    ),
  CONSTRAINT assinatura_eletronica_upload_intents_expiry_check
    CHECK (expira_em > reservado_em),
  CONSTRAINT assinatura_eletronica_upload_intents_lease_shape_check
    CHECK (
      (estado = 'EM_LIMPEZA') =
      (cleanup_lease_token IS NOT NULL AND cleanup_lease_expira_em IS NOT NULL)
    ),
  CONSTRAINT assinatura_eletronica_upload_intents_delete_fence_check
    CHECK (cleanup_delete_authorized_em IS NULL OR estado = 'EM_LIMPEZA'),
  CONSTRAINT assinatura_eletronica_upload_intents_terminal_shape_check
    CHECK (
      (estado = 'REGISTRADO') = (registrado_em IS NOT NULL)
      AND (estado = 'REMOVIDO') = (removido_em IS NOT NULL)
      AND (estado = 'DIVERGENTE') = (divergente_em IS NOT NULL)
    )
);

CREATE INDEX assinatura_eletronica_upload_intents_reconcile_idx
  ON public.assinatura_eletronica_upload_intents
    (expira_em, created_at, id)
  WHERE estado IN ('RESERVADO', 'EM_LIMPEZA');

ALTER TABLE public.assinatura_eletronica_upload_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY assinatura_eletronica_upload_intents_client_deny
  ON public.assinatura_eletronica_upload_intents
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.assinatura_eletronica_upload_intents
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_reservar_upload_diario(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid,
  p_classe text,
  p_bucket_id text,
  p_storage_path text,
  p_tamanho_bytes bigint,
  p_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_expected_path text;
  v_expected_operation text;
  v_actor_scope text;
  v_sha256 text := lower(btrim(coalesce(p_sha256, '')));
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
     OR p_classe NOT IN ('DOCUMENTO_ORIGINAL', 'DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')
     OR p_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_tamanho_bytes IS NULL OR p_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR v_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_PAYLOAD_INVALIDO';
  END IF;

  v_expected_path := 'envelopes/' || p_envelope_id::text || '/' || CASE p_classe
    WHEN 'DOCUMENTO_ORIGINAL' THEN 'documento-original.pdf'
    WHEN 'DOCUMENTO_FINAL' THEN 'documento-final.pdf'
    WHEN 'COMPROVANTE_EVIDENCIA' THEN 'comprovante-evidencia.pdf'
  END;
  IF p_storage_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_PATH_INVALIDO';
  END IF;

  IF p_classe = 'DOCUMENTO_ORIGINAL' THEN
    PERFORM public.assinatura_eletronica_autorizar_original_diario_seguro(
      p_envelope_id, p_actor_auth_user_id, p_auth_session_id
    );
    v_expected_operation := 'PREPARAR_ORIGINAL_DIARIO';
  ELSE
    PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
      p_envelope_id, p_actor_auth_user_id, p_auth_session_id
    );
    v_expected_operation := 'INICIAR_FINALIZACAO';
  END IF;
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND OR v_envelope.documento <> 'diario_classe'
     OR v_envelope.origem_tipo <> 'DIARIO'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_ENVELOPE_INVALIDO';
  END IF;

  -- A operação rica já foi autorizada e registrada antes da reserva. Assim, o
  -- service role não consegue inventar ator, sessão, request ou envelope.
  IF NOT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_operacoes AS operacao
    WHERE operacao.actor_scope = v_actor_scope
      AND operacao.actor_auth_user_id = p_actor_auth_user_id
      AND operacao.operacao = v_expected_operation
      AND operacao.request_id = p_request_id
      AND operacao.resultado ->> 'envelopeId' = p_envelope_id::text
  ) OR (
    p_classe = 'DOCUMENTO_ORIGINAL' AND v_envelope.status NOT IN ('RASCUNHO', 'PENDENTE')
  ) OR (
    p_classe <> 'DOCUMENTO_ORIGINAL' AND v_envelope.status NOT IN ('FINALIZANDO', 'ASSINADO')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_PREFLIGHT_INVALIDO';
  END IF;

  SELECT intent.* INTO v_intent
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.envelope_id = p_envelope_id
    AND intent.classe = p_classe
  FOR UPDATE;

  IF FOUND THEN
    IF v_intent.bucket_id IS DISTINCT FROM p_bucket_id
       OR v_intent.storage_path IS DISTINCT FROM p_storage_path
       OR v_intent.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes
       OR v_intent.sha256 IS DISTINCT FROM v_sha256
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    IF v_intent.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_intent.auth_session_id IS DISTINCT FROM p_auth_session_id
       OR v_intent.request_id IS DISTINCT FROM p_request_id
    THEN
      -- Rebind só existe depois que o objeto anterior foi comprovadamente
      -- removido. O hash/path/tamanho continuam imutáveis e o novo preflight já
      -- foi autorizado acima, evitando reciclar intenção ativa ou registrada.
      IF v_intent.estado <> 'REMOVIDO'
         OR EXISTS (
           SELECT 1 FROM storage.objects AS objeto
           WHERE objeto.bucket_id = v_intent.bucket_id
             AND objeto.name = v_intent.storage_path
         )
         OR EXISTS (
           SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
           WHERE artefato.envelope_id = v_intent.envelope_id
             AND artefato.classe = v_intent.classe
         )
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_IDEMPOTENCIA_DIVERGENTE';
      END IF;
    END IF;

    IF v_intent.estado = 'REGISTRADO' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
        WHERE artefato.envelope_id = p_envelope_id
          AND artefato.classe = p_classe
          AND artefato.bucket_id = p_bucket_id
          AND artefato.storage_path = p_storage_path
          AND artefato.tamanho_bytes = p_tamanho_bytes
          AND artefato.sha256 = v_sha256
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_REGISTRO_DIVERGENTE';
      END IF;
      RETURN jsonb_build_object('intentId', v_intent.id, 'state', 'REGISTERED');
    END IF;
    IF v_intent.estado = 'DIVERGENTE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_DIVERGENTE';
    END IF;
    -- Nunca reciclamos um path enquanto existe cleaner, mesmo com lease
    -- expirada. Sem delete condicional por ETag no Storage, um worker antigo
    -- poderia remover bytes de um retry mais novo. Somente o reconciliador
    -- troca token antes da autorização de delete.
    IF v_intent.estado = 'EM_LIMPEZA' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_EM_RECONCILIACAO';
    END IF;

    UPDATE public.assinatura_eletronica_upload_intents AS intent
    SET estado = 'RESERVADO',
        actor_auth_user_id = p_actor_auth_user_id,
        auth_session_id = p_auth_session_id,
        request_id = p_request_id,
        reservado_em = v_now,
        expira_em = v_now + interval '30 minutes',
        cleanup_lease_token = NULL,
        cleanup_lease_expira_em = NULL,
        cleanup_delete_authorized_em = NULL,
        cleanup_ultimo_resultado = CASE
          WHEN v_intent.estado = 'REMOVIDO' THEN 'REMOVIDO'
          ELSE v_intent.cleanup_ultimo_resultado
        END,
        registrado_em = NULL,
        removido_em = NULL,
        divergente_em = NULL,
        updated_at = v_now
    WHERE intent.id = v_intent.id
    RETURNING intent.* INTO v_intent;
  ELSE
    INSERT INTO public.assinatura_eletronica_upload_intents (
      envelope_id, classe, actor_auth_user_id, auth_session_id, request_id,
      bucket_id, storage_path, tamanho_bytes, sha256,
      reservado_em, expira_em
    ) VALUES (
      p_envelope_id, p_classe, p_actor_auth_user_id, p_auth_session_id, p_request_id,
      p_bucket_id, p_storage_path, p_tamanho_bytes, v_sha256,
      v_now, v_now + interval '30 minutes'
    ) RETURNING * INTO v_intent;
  END IF;

  RETURN jsonb_build_object(
    'intentId', v_intent.id,
    'state', 'RESERVED',
    'expiresAt', v_intent.expira_em
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_exigir_upload_intent_diario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope_documento text;
  v_envelope_origem_tipo text;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  SELECT envelope.documento, envelope.origem_tipo
  INTO v_envelope_documento, v_envelope_origem_tipo
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = NEW.envelope_id;

  IF v_envelope_documento IS DISTINCT FROM 'diario_classe'
     OR v_envelope_origem_tipo IS DISTINCT FROM 'DIARIO'
  THEN
    RETURN NEW;
  END IF;

  SELECT intent.* INTO v_intent
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.envelope_id = NEW.envelope_id
    AND intent.classe = NEW.classe
  FOR UPDATE;

  IF NOT FOUND
     OR v_intent.estado <> 'RESERVADO'
     OR v_intent.bucket_id IS DISTINCT FROM NEW.bucket_id
     OR v_intent.storage_path IS DISTINCT FROM NEW.storage_path
     OR v_intent.tamanho_bytes IS DISTINCT FROM NEW.tamanho_bytes
     OR v_intent.sha256 IS DISTINCT FROM NEW.sha256
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ARTEFATO_SEM_UPLOAD_INTENT_VALIDO';
  END IF;

  UPDATE public.assinatura_eletronica_upload_intents AS intent
  SET estado = 'REGISTRADO',
      cleanup_lease_token = NULL,
      cleanup_lease_expira_em = NULL,
      cleanup_delete_authorized_em = NULL,
      cleanup_ultimo_resultado = 'REFERENCIADO',
      registrado_em = v_now,
      removido_em = NULL,
      divergente_em = NULL,
      updated_at = v_now
  WHERE intent.id = v_intent.id;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER assinatura_eletronica_artefatos_05_require_upload_intent
  BEFORE INSERT ON public.assinatura_eletronica_artefatos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_exigir_upload_intent_diario();

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_claim_uploads_orfaos(
  p_limit integer DEFAULT 10
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate record;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_token uuid;
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_RECONCILIACAO_LIMITE_INVALIDO';
  END IF;

  FOR v_candidate IN
    SELECT intent.id, intent.envelope_id
    FROM public.assinatura_eletronica_upload_intents AS intent
    WHERE (
      intent.estado = 'RESERVADO' AND intent.expira_em <= v_now
    ) OR (
      intent.estado = 'EM_LIMPEZA'
      AND intent.cleanup_lease_expira_em <= v_now
      AND (
        intent.cleanup_delete_authorized_em IS NULL
        OR intent.cleanup_delete_authorized_em <= v_now - interval '15 minutes'
      )
    )
    ORDER BY intent.expira_em, intent.created_at, intent.id
    LIMIT p_limit
  LOOP
    -- A mesma ordem envelope -> intent é usada pela publicação canônica. Isso
    -- evita deadlock e impede claim concorrente ao INSERT do artefato.
    SELECT envelope.* INTO v_envelope
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.id = v_candidate.envelope_id
    FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT intent.* INTO v_intent
    FROM public.assinatura_eletronica_upload_intents AS intent
    WHERE intent.id = v_candidate.id
    FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR NOT (
      (v_intent.estado = 'RESERVADO' AND v_intent.expira_em <= v_now)
      OR (
        v_intent.estado = 'EM_LIMPEZA'
        AND v_intent.cleanup_lease_expira_em <= v_now
        AND (
          v_intent.cleanup_delete_authorized_em IS NULL
          OR v_intent.cleanup_delete_authorized_em <= v_now - interval '15 minutes'
        )
      )
    ) THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
      WHERE artefato.envelope_id = v_intent.envelope_id
        AND artefato.classe = v_intent.classe
        AND artefato.bucket_id = v_intent.bucket_id
        AND artefato.storage_path = v_intent.storage_path
        AND artefato.tamanho_bytes = v_intent.tamanho_bytes
        AND artefato.sha256 = v_intent.sha256
    ) THEN
      UPDATE public.assinatura_eletronica_upload_intents
      SET estado = 'REGISTRADO', registrado_em = v_now,
          cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
          cleanup_delete_authorized_em = NULL,
          cleanup_ultimo_resultado = 'REFERENCIADO', updated_at = v_now
      WHERE id = v_intent.id;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
      WHERE (artefato.envelope_id = v_intent.envelope_id AND artefato.classe = v_intent.classe)
         OR (artefato.bucket_id = v_intent.bucket_id AND artefato.storage_path = v_intent.storage_path)
    ) OR (
      v_intent.classe = 'DOCUMENTO_ORIGINAL' AND v_envelope.status <> 'RASCUNHO'
    ) OR (
      v_intent.classe <> 'DOCUMENTO_ORIGINAL' AND v_envelope.status <> 'FINALIZANDO'
    ) THEN
      UPDATE public.assinatura_eletronica_upload_intents
      SET estado = 'DIVERGENTE', divergente_em = v_now,
          cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
          cleanup_delete_authorized_em = NULL,
          cleanup_ultimo_resultado = CASE
            WHEN EXISTS (
              SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
              WHERE (artefato.envelope_id = v_intent.envelope_id AND artefato.classe = v_intent.classe)
                 OR (artefato.bucket_id = v_intent.bucket_id AND artefato.storage_path = v_intent.storage_path)
            ) THEN 'REFERENCIADO' ELSE 'ESTADO_DIVERGENTE' END,
          updated_at = v_now
      WHERE id = v_intent.id;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM storage.objects AS objeto
      WHERE objeto.bucket_id = v_intent.bucket_id
        AND objeto.name = v_intent.storage_path
    ) THEN
      UPDATE public.assinatura_eletronica_upload_intents
      SET estado = 'REMOVIDO', removido_em = v_now,
          cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
          cleanup_delete_authorized_em = NULL,
          cleanup_ultimo_resultado = 'AUSENTE', updated_at = v_now
      WHERE id = v_intent.id;
      CONTINUE;
    END IF;

    v_token := gen_random_uuid();
    UPDATE public.assinatura_eletronica_upload_intents
    SET estado = 'EM_LIMPEZA', cleanup_lease_token = v_token,
        cleanup_lease_expira_em = v_now + interval '5 minutes',
        cleanup_delete_authorized_em = NULL,
        cleanup_tentativas = cleanup_tentativas + 1,
        cleanup_ultimo_resultado = NULL,
        registrado_em = NULL, removido_em = NULL, divergente_em = NULL,
        updated_at = v_now
    WHERE id = v_intent.id;

    RETURN NEXT jsonb_build_object(
      'intentId', v_intent.id,
      'leaseToken', v_token,
      'leaseExpiresAt', v_now + interval '5 minutes',
      'envelopeId', v_intent.envelope_id,
      'class', v_intent.classe,
      'bucketId', v_intent.bucket_id,
      'storagePath', v_intent.storage_path,
      'byteSize', v_intent.tamanho_bytes,
      'sha256', v_intent.sha256
    );
  END LOOP;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_validar_claim_orfao(
  p_intent_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope_id uuid;
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  SELECT intent.envelope_id INTO v_envelope_id
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_NAO_ENCONTRADO';
  END IF;
  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = v_envelope_id
  FOR UPDATE;
  SELECT intent.* INTO v_intent
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id
  FOR UPDATE;

  IF v_intent.estado <> 'EM_LIMPEZA'
     OR v_intent.cleanup_lease_token IS DISTINCT FROM p_lease_token
     OR v_intent.cleanup_lease_expira_em <= v_now
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_RECONCILIACAO_LEASE_INVALIDO';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE artefato.envelope_id = v_intent.envelope_id
      AND artefato.classe = v_intent.classe
      AND artefato.bucket_id = v_intent.bucket_id
      AND artefato.storage_path = v_intent.storage_path
      AND artefato.tamanho_bytes = v_intent.tamanho_bytes
      AND artefato.sha256 = v_intent.sha256
  ) THEN
    UPDATE public.assinatura_eletronica_upload_intents
    SET estado = 'REGISTRADO', registrado_em = v_now,
        cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
        cleanup_delete_authorized_em = NULL,
        cleanup_ultimo_resultado = 'REFERENCIADO', updated_at = v_now
    WHERE id = v_intent.id;
    RETURN jsonb_build_object('deleteAllowed', false, 'reason', 'REGISTERED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE (artefato.envelope_id = v_intent.envelope_id AND artefato.classe = v_intent.classe)
       OR (artefato.bucket_id = v_intent.bucket_id AND artefato.storage_path = v_intent.storage_path)
  ) OR (
    v_intent.classe = 'DOCUMENTO_ORIGINAL' AND v_envelope.status <> 'RASCUNHO'
  ) OR (
    v_intent.classe <> 'DOCUMENTO_ORIGINAL' AND v_envelope.status <> 'FINALIZANDO'
  ) THEN
    UPDATE public.assinatura_eletronica_upload_intents
    SET estado = 'DIVERGENTE', divergente_em = v_now,
        cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
        cleanup_delete_authorized_em = NULL,
        cleanup_ultimo_resultado = 'REFERENCIADO', updated_at = v_now
    WHERE id = v_intent.id;
    RETURN jsonb_build_object('deleteAllowed', false, 'reason', 'REFERENCED_OR_STATE_CHANGED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS objeto
    WHERE objeto.bucket_id = v_intent.bucket_id
      AND objeto.name = v_intent.storage_path
  ) THEN
    UPDATE public.assinatura_eletronica_upload_intents
    SET estado = 'REMOVIDO', removido_em = v_now,
        cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
        cleanup_delete_authorized_em = NULL,
        cleanup_ultimo_resultado = 'AUSENTE', updated_at = v_now
    WHERE id = v_intent.id;
    RETURN jsonb_build_object('deleteAllowed', false, 'reason', 'ALREADY_ABSENT');
  END IF;

  -- Este timestamp funciona como fence de deleção. Um worker que recebeu
  -- autorização pode remover o objeto fora da transação; por isso a reserva
  -- permanece bloqueada e um novo claim só nasce após quarentena de 15 min,
  -- maior que a vida útil operacional da Edge. Revalidação idempotente não
  -- empurra a quarentena para frente.
  UPDATE public.assinatura_eletronica_upload_intents
  SET cleanup_delete_authorized_em = coalesce(cleanup_delete_authorized_em, v_now),
      updated_at = v_now
  WHERE id = v_intent.id;
  RETURN jsonb_build_object('deleteAllowed', true, 'reason', 'UNREFERENCED');
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_concluir_cleanup_upload(
  p_intent_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope_id uuid;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  SELECT intent.envelope_id INTO v_envelope_id
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_NAO_ENCONTRADO';
  END IF;
  PERFORM 1 FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = v_envelope_id FOR UPDATE;
  SELECT intent.* INTO v_intent
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id FOR UPDATE;
  IF v_intent.estado <> 'EM_LIMPEZA'
     OR v_intent.cleanup_lease_token IS DISTINCT FROM p_lease_token
     OR v_intent.cleanup_delete_authorized_em IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_RECONCILIACAO_LEASE_INVALIDO';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE (artefato.envelope_id = v_intent.envelope_id AND artefato.classe = v_intent.classe)
       OR (artefato.bucket_id = v_intent.bucket_id AND artefato.storage_path = v_intent.storage_path)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_RECONCILIACAO_ARTEFATO_REFERENCIADO';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects AS objeto
    WHERE objeto.bucket_id = v_intent.bucket_id AND objeto.name = v_intent.storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_RECONCILIACAO_STORAGE_AINDA_PRESENTE';
  END IF;
  UPDATE public.assinatura_eletronica_upload_intents
  SET estado = 'REMOVIDO', removido_em = v_now,
      cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
      cleanup_delete_authorized_em = NULL,
      cleanup_ultimo_resultado = 'REMOVIDO', updated_at = v_now
  WHERE id = v_intent.id;
  RETURN jsonb_build_object('state', 'REMOVED');
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_reportar_cleanup_upload(
  p_intent_id uuid,
  p_lease_token uuid,
  p_resultado text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope_id uuid;
  v_intent public.assinatura_eletronica_upload_intents%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_resultado IS NULL
     OR p_resultado NOT IN ('FALHA_TRANSITORIA', 'HASH_DIVERGENTE')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_RECONCILIACAO_RESULTADO_INVALIDO';
  END IF;
  SELECT intent.envelope_id INTO v_envelope_id
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_UPLOAD_INTENT_NAO_ENCONTRADO';
  END IF;
  PERFORM 1 FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = v_envelope_id FOR UPDATE;
  SELECT intent.* INTO v_intent
  FROM public.assinatura_eletronica_upload_intents AS intent
  WHERE intent.id = p_intent_id FOR UPDATE;
  IF v_intent.estado <> 'EM_LIMPEZA'
     OR v_intent.cleanup_lease_token IS DISTINCT FROM p_lease_token
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_RECONCILIACAO_LEASE_INVALIDO';
  END IF;

  IF p_resultado = 'HASH_DIVERGENTE' THEN
    UPDATE public.assinatura_eletronica_upload_intents
    SET estado = 'DIVERGENTE', divergente_em = v_now,
        cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
        cleanup_delete_authorized_em = NULL,
        cleanup_ultimo_resultado = 'HASH_DIVERGENTE', updated_at = v_now
    WHERE id = v_intent.id;
    RETURN jsonb_build_object('state', 'DIVERGENT');
  END IF;

  IF v_intent.cleanup_delete_authorized_em IS NOT NULL THEN
    -- Depois que um delete foi autorizado, timeout/erro da Storage API é
    -- ambíguo. Não voltamos a RESERVADO nem liberamos o path para novo upload.
    -- A intenção fica em quarentena e somente um novo claim após 15 minutos
    -- pode rotacionar o token e revalidar o mesmo órfão.
    UPDATE public.assinatura_eletronica_upload_intents
    SET cleanup_lease_expira_em = LEAST(cleanup_lease_expira_em, v_now),
        cleanup_ultimo_resultado = 'FALHA_TRANSITORIA',
        updated_at = v_now
    WHERE id = v_intent.id;
    RETURN jsonb_build_object('state', 'QUARANTINED');
  END IF;

  UPDATE public.assinatura_eletronica_upload_intents
  SET estado = 'RESERVADO', reservado_em = v_now,
      expira_em = v_now + interval '5 minutes',
      cleanup_lease_token = NULL, cleanup_lease_expira_em = NULL,
      cleanup_delete_authorized_em = NULL,
      cleanup_ultimo_resultado = 'FALHA_TRANSITORIA',
      registrado_em = NULL, removido_em = NULL, divergente_em = NULL,
      updated_at = v_now
  WHERE id = v_intent.id;
  RETURN jsonb_build_object('state', 'RETRY_PENDING');
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_reservar_upload_diario(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_claim_uploads_orfaos(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_validar_claim_orfao(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_concluir_cleanup_upload(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_reportar_cleanup_upload(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_reservar_upload_diario(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_claim_uploads_orfaos(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_validar_claim_orfao(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_concluir_cleanup_upload(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_reportar_cleanup_upload(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_exigir_upload_intent_diario()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
