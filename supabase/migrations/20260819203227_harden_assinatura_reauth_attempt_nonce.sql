-- Separa a tentativa física de senha da operação lógica de assinatura.
--
-- request_id continua identificando o ticket/confirmacao idempotente. Cada
-- invocacao REAUTHENTICATE recebe da Edge um attempt_id novo, persistido antes
-- de qualquer chamada ao provedor de senha e contado na janela duravel.

BEGIN;

ALTER TABLE public.assinatura_eletronica_reauth_tentativas
  ADD COLUMN attempt_id uuid,
  ADD COLUMN consumido_em timestamptz,
  ADD COLUMN desafio_id uuid
    REFERENCES public.assinatura_eletronica_desafios(id) ON DELETE RESTRICT;

UPDATE public.assinatura_eletronica_reauth_tentativas
SET attempt_id = id
WHERE attempt_id IS NULL;

ALTER TABLE public.assinatura_eletronica_reauth_tentativas
  ALTER COLUMN attempt_id SET NOT NULL,
  DROP CONSTRAINT assinatura_eletronica_reauth_tentativas_request_key,
  ADD CONSTRAINT assinatura_eletronica_reauth_tentativas_attempt_key
    UNIQUE (attempt_id),
  ADD CONSTRAINT assinatura_eletronica_reauth_tentativas_consumo_shape
    CHECK (
      (consumido_em IS NULL AND desafio_id IS NULL)
      OR (consumido_em IS NOT NULL AND desafio_id IS NOT NULL)
    );

CREATE INDEX assinatura_eletronica_reauth_tentativas_request_audit_idx
  ON public.assinatura_eletronica_reauth_tentativas
    (actor_auth_user_id, request_id, created_at DESC, id DESC);

ALTER TABLE public.assinatura_eletronica_reauth_tentativas
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.assinatura_eletronica_reauth_tentativas
  FROM PUBLIC, anon, authenticated, service_role;

-- O overload anterior fica fechado para que nenhum cliente privilegiado
-- continue usando request_id como tentativa fisica. A implementacao nova usa
-- attempt_id como chave do replay interno, depois de revalidar autorizacao.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_actor_scope text;
  v_attempt_payload_sha256 text;
  v_logical_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_logical public.assinatura_eletronica_operacoes%ROWTYPE;
  v_attempt public.assinatura_eletronica_reauth_tentativas%ROWTYPE;
  v_count integer;
  v_retry_after integer;
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL OR p_attempt_id IS NULL
     OR p_attempt_id IS NOT DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_ID_INVALIDO';
  END IF;

  -- Autorizacao corrente sempre precede qualquer replay de attempt_id.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id, p_auth_session_id
  );
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id, p_participante_id, p_perfil, p_context_id,
    p_actor_auth_user_id, 'PREPARAR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;
  v_logical_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'profile', upper(btrim(p_perfil)),
      'contextId', p_context_id,
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id
    )
  );
  v_attempt_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'attemptId', p_attempt_id,
      'requestId', p_request_id,
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'profile', upper(btrim(p_perfil)),
      'contextId', p_context_id,
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id
    )
  );

  -- Um lock por ator fecha a corrida entre attempt_ids concorrentes: nunca
  -- podem entrar mais de cinco linhas na mesma janela de quinze minutos.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:reauth:rate:' || p_actor_auth_user_id::text,
      0
    )
  );

  SELECT tentativa.* INTO v_attempt
  FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
  WHERE tentativa.attempt_id = p_attempt_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_attempt.auth_session_id IS DISTINCT FROM p_auth_session_id
       OR v_attempt.envelope_id IS DISTINCT FROM p_envelope_id
       OR v_attempt.participante_id IS DISTINCT FROM p_participante_id
       OR v_attempt.request_id IS DISTINCT FROM p_request_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_BINDING_DIVERGENTE';
    END IF;

    SELECT operacao.* INTO v_replay
    FROM public.assinatura_eletronica_operacoes AS operacao
    WHERE operacao.actor_scope = v_actor_scope
      AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
      AND operacao.request_id = p_attempt_id;
    IF NOT FOUND
       OR v_replay.payload_sha256 IS DISTINCT FROM v_attempt_payload_sha256
       OR v_replay.resultado ->> 'attemptId' IS DISTINCT FROM p_attempt_id::text
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_REPLAY_DIVERGENTE';
    END IF;

    -- O preflight e idempotente apenas enquanto a identidade de senha que ele
    -- congelou continuar sendo a identidade corrente. Nunca devolvemos email
    -- ou habilitacao de senha cacheados depois de uma troca/desabilitacao.
    IF jsonb_typeof(v_replay.resultado -> 'email') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_scope -> 'email') IS DISTINCT FROM 'string'
       OR nullif(lower(btrim(v_replay.resultado ->> 'email')), '') IS NULL
       OR nullif(lower(btrim(v_scope ->> 'email')), '') IS NULL
       OR lower(btrim(v_replay.resultado ->> 'email'))
          IS DISTINCT FROM lower(btrim(v_scope ->> 'email'))
       OR v_replay.resultado -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb
       OR v_scope -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_REAUTH_CREDENCIAL_CORRENTE_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
  WHERE tentativa.actor_auth_user_id = p_actor_auth_user_id
    AND tentativa.created_at > statement_timestamp() - interval '15 minutes';
  IF v_count >= 5 THEN
    SELECT greatest(1, ceil(extract(epoch FROM (
      min(tentativa.created_at) + interval '15 minutes' - statement_timestamp()
    )))::integer)
    INTO v_retry_after
    FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
    WHERE tentativa.actor_auth_user_id = p_actor_auth_user_id
      AND tentativa.created_at > statement_timestamp() - interval '15 minutes';
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_RATE_LIMITED',
      DETAIL = jsonb_build_object(
        'retryAfterSeconds', coalesce(v_retry_after, 900)
      )::text;
  END IF;

  INSERT INTO public.assinatura_eletronica_reauth_tentativas (
    actor_auth_user_id,
    auth_session_id,
    envelope_id,
    participante_id,
    request_id,
    attempt_id
  ) VALUES (
    p_actor_auth_user_id,
    p_auth_session_id,
    p_envelope_id,
    p_participante_id,
    p_request_id,
    p_attempt_id
  );

  v_resultado := jsonb_build_object(
    'attemptId', p_attempt_id,
    'email', v_scope ->> 'email',
    'passwordEnabled', (v_scope ->> 'passwordEnabled')::boolean,
    'rateLimit', jsonb_build_object(
      'remaining', greatest(0, 4 - v_count),
      'resetAt', statement_timestamp() + interval '15 minutes'
    )
  );

  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope,
    actor_auth_user_id,
    operacao,
    request_id,
    payload_sha256,
    resultado
  ) VALUES (
    v_actor_scope,
    p_actor_auth_user_id,
    'PREPARAR_REAUTENTICACAO',
    p_attempt_id,
    v_attempt_payload_sha256,
    v_resultado
  );

  -- Marcador logico exigido pelo registrador original. Ele nao participa do
  -- limitador; a linha por attempt_id acima e a unica unidade contabilizada.
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope,
    actor_auth_user_id,
    operacao,
    request_id,
    payload_sha256,
    resultado
  ) VALUES (
    v_actor_scope,
    p_actor_auth_user_id,
    'PREPARAR_REAUTENTICACAO',
    p_request_id,
    v_logical_payload_sha256,
    jsonb_build_object('logicalRequestId', p_request_id)
  )
  ON CONFLICT (actor_scope, operacao, request_id) DO NOTHING;

  SELECT operacao.* INTO v_logical
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF NOT FOUND
     OR v_logical.payload_sha256 IS DISTINCT FROM v_logical_payload_sha256
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
  END IF;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    p_envelope_id,
    p_participante_id,
    'REAUTENTICACAO_PREPARADA',
    p_actor_auth_user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'attemptId', p_attempt_id,
      'sessionBound', true
    )
  );
  RETURN v_resultado;
END;
$function$;

-- O registrador anterior conserva toda a validacao de evidencia, emissao HMAC
-- e persistencia do desafio. Ele fica sem grant externo e so e chamado pelo
-- overload abaixo depois do consumo atomico do attempt_id correspondente.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_reautenticado_em timestamptz,
  p_evidencia jsonb,
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_actor_scope text;
  v_attempt_payload_sha256 text;
  v_attempt public.assinatura_eletronica_reauth_tentativas%ROWTYPE;
  v_preflight public.assinatura_eletronica_operacoes%ROWTYPE;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_resultado jsonb;
  v_challenge_id uuid;
  v_chaves_invalidas text;
  v_authenticated_at timestamptz;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL OR p_attempt_id IS NULL
     OR p_attempt_id IS NOT DISTINCT FROM p_request_id
     OR p_reautenticado_em IS NULL
     OR p_evidencia IS NULL
     OR jsonb_typeof(p_evidencia) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_OU_EVIDENCIA_INVALIDA';
  END IF;

  -- Sessao, perfil, participante, ordem e politica sao revalidados antes de
  -- qualquer consulta ao replay logico.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id, p_auth_session_id
  );
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id, p_participante_id, p_perfil, p_context_id,
    p_actor_auth_user_id, 'REGISTRAR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT string_agg(chave, ', ' ORDER BY chave) INTO v_chaves_invalidas
  FROM jsonb_object_keys(p_evidencia) AS chaves(chave)
  WHERE chave NOT IN ('provider', 'authenticatedAt', 'ipHash', 'userAgentHash');
  BEGIN
    v_authenticated_at := nullif(
      p_evidencia ->> 'authenticatedAt', ''
    )::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_EVIDENCIA_INVALIDA';
  END;
  IF v_chaves_invalidas IS NOT NULL
     OR jsonb_typeof(p_evidencia -> 'provider') <> 'string'
     OR p_evidencia ->> 'provider' <> 'SUPABASE_PASSWORD'
     OR jsonb_typeof(p_evidencia -> 'authenticatedAt') <> 'string'
     OR v_authenticated_at IS NULL
     OR v_authenticated_at IS DISTINCT FROM p_reautenticado_em
     OR p_reautenticado_em < statement_timestamp() - interval '120 seconds'
     OR p_reautenticado_em > statement_timestamp() + interval '30 seconds'
     OR (
       coalesce(p_evidencia -> 'ipHash', 'null'::jsonb) <> 'null'::jsonb
       AND (
         jsonb_typeof(p_evidencia -> 'ipHash') <> 'string'
         OR p_evidencia ->> 'ipHash' !~ '^[0-9a-f]{64}$'
       )
     )
     OR (
       coalesce(p_evidencia -> 'userAgentHash', 'null'::jsonb) <> 'null'::jsonb
       AND (
         jsonb_typeof(p_evidencia -> 'userAgentHash') <> 'string'
         OR p_evidencia ->> 'userAgentHash' !~ '^[0-9a-f]{64}$'
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_EVIDENCIA_INVALIDA';
  END IF;

  v_attempt_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'attemptId', p_attempt_id,
      'requestId', p_request_id,
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'profile', upper(btrim(p_perfil)),
      'contextId', p_context_id,
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:reauth:registrar:' || p_actor_auth_user_id::text
        || ':' || p_request_id::text,
      0
    )
  );

  SELECT tentativa.* INTO v_attempt
  FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
  WHERE tentativa.attempt_id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_NAO_PREPARADO';
  END IF;
  IF v_attempt.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
     OR v_attempt.auth_session_id IS DISTINCT FROM p_auth_session_id
     OR v_attempt.envelope_id IS DISTINCT FROM p_envelope_id
     OR v_attempt.participante_id IS DISTINCT FROM p_participante_id
     OR v_attempt.request_id IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_BINDING_DIVERGENTE';
  END IF;

  SELECT operacao.* INTO v_preflight
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
    AND operacao.request_id = p_attempt_id;
  IF NOT FOUND
     OR v_preflight.payload_sha256 IS DISTINCT FROM v_attempt_payload_sha256
     OR v_preflight.resultado ->> 'attemptId' IS DISTINCT FROM p_attempt_id::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_PREFLIGHT_INVALIDO';
  END IF;

  -- Fecha a janela entre o password grant e o registro: tanto a primeira
  -- emissao quanto um replay logico exigem a mesma identidade de senha ativa
  -- que foi congelada no preflight deste attempt_id.
  IF jsonb_typeof(v_preflight.resultado -> 'email') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_scope -> 'email') IS DISTINCT FROM 'string'
     OR nullif(lower(btrim(v_preflight.resultado ->> 'email')), '') IS NULL
     OR nullif(lower(btrim(v_scope ->> 'email')), '') IS NULL
     OR lower(btrim(v_preflight.resultado ->> 'email'))
        IS DISTINCT FROM lower(btrim(v_scope ->> 'email'))
     OR v_preflight.resultado -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb
     OR v_scope -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_CREDENCIAL_CORRENTE_DIVERGENTE';
  END IF;

  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'REGISTRAR_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_desafios AS desafio
      WHERE desafio.id::text = v_replay.resultado ->> 'challengeId'
        AND desafio.envelope_id = p_envelope_id
        AND desafio.participante_id = p_participante_id
        AND desafio.metodo = 'SENHA_REAUTENTICADA'
        AND desafio.estado IN ('VERIFICADO', 'CONSUMIDO')
        AND desafio.actor_auth_user_id = p_actor_auth_user_id
        AND desafio.auth_session_id = p_auth_session_id
        AND desafio.perfil = upper(btrim(p_perfil))
        AND desafio.contexto_id = p_context_id
        AND desafio.request_id = p_request_id
        AND v_replay.resultado ->> 'envelopeId' = p_envelope_id::text
        AND v_replay.resultado ->> 'participantId' = p_participante_id::text
        AND v_replay.resultado ->> 'profile' = upper(btrim(p_perfil))
        AND v_replay.resultado ->> 'contextId' = p_context_id::text
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_REPLAY_BINDING_DIVERGENTE';
    END IF;

    BEGIN
      v_challenge_id := (v_replay.resultado ->> 'challengeId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_REPLAY_BINDING_DIVERGENTE';
    END;

    IF v_attempt.consumido_em IS NULL THEN
      UPDATE public.assinatura_eletronica_reauth_tentativas AS tentativa
      SET consumido_em = statement_timestamp(),
          desafio_id = v_challenge_id
      WHERE tentativa.id = v_attempt.id;
    ELSIF v_attempt.desafio_id IS DISTINCT FROM v_challenge_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_JA_CONSUMIDO';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF v_attempt.consumido_em IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_JA_CONSUMIDO';
  END IF;

  v_resultado := public.assinatura_eletronica_internal_registrar_reautenticacao(
    p_envelope_id,
    p_participante_id,
    p_perfil,
    p_context_id,
    p_actor_auth_user_id,
    p_auth_session_id,
    p_reautenticado_em,
    p_evidencia,
    p_request_id
  );

  BEGIN
    v_challenge_id := (v_resultado ->> 'challengeId')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_REGISTRO_INCONSISTENTE';
  END;
  IF NOT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_desafios AS desafio
    WHERE desafio.id = v_challenge_id
      AND desafio.envelope_id = p_envelope_id
      AND desafio.participante_id = p_participante_id
      AND desafio.metodo = 'SENHA_REAUTENTICADA'
      AND desafio.estado = 'VERIFICADO'
      AND desafio.actor_auth_user_id = p_actor_auth_user_id
      AND desafio.auth_session_id = p_auth_session_id
      AND desafio.perfil = upper(btrim(p_perfil))
      AND desafio.contexto_id = p_context_id
      AND desafio.request_id = p_request_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_REGISTRO_INCONSISTENTE';
  END IF;

  UPDATE public.assinatura_eletronica_reauth_tentativas AS tentativa
  SET consumido_em = statement_timestamp(),
      desafio_id = v_challenge_id
  WHERE tentativa.id = v_attempt.id
    AND tentativa.consumido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_JA_CONSUMIDO';
  END IF;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid, uuid
) TO service_role;

COMMIT;
