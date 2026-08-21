-- Contratos Edge explicitos, sem depender do truncamento silencioso de
-- identificadores do PostgreSQL, e gates server-side para retry seguro.

BEGIN;

-- Falha cedo se o lote anterior nao estiver presente com os nomes que o
-- catalogo realmente persistiu (NAMEDATALEN = 64, maximo de 63 bytes).
DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_internal_registrar_original_publicar_segu(uuid,uuid,uuid,text,text,bigint,text,text,jsonb,jsonb,jsonb,jsonb,uuid)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_internal_iniciar_finalizacao_diario_segur(uuid,uuid,uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(uuid,uuid,uuid,text,text,bigint,text,text,text,bigint,text,uuid)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_RPC_BASE_INDISPONIVEL';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_publicar_original_diario(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_tamanho_bytes bigint,
  p_sha256 text,
  p_document_snapshot_sha256 text,
  p_pdf_asset_manifest jsonb,
  p_semantic_manifest jsonb,
  p_frozen_signature_target jsonb,
  p_geometry_snapshot jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN public.assinatura_eletronica_internal_registrar_original_publicar_segu(
    p_envelope_id => p_envelope_id,
    p_actor_auth_user_id => p_actor_auth_user_id,
    p_auth_session_id => p_auth_session_id,
    p_bucket_id => p_bucket_id,
    p_storage_path => p_storage_path,
    p_tamanho_bytes => p_tamanho_bytes,
    p_sha256 => p_sha256,
    p_document_snapshot_sha256 => p_document_snapshot_sha256,
    p_pdf_asset_manifest => p_pdf_asset_manifest,
    p_semantic_manifest => p_semantic_manifest,
    p_frozen_signature_target => p_frozen_signature_target,
    p_geometry_snapshot => p_geometry_snapshot,
    p_request_id => p_request_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
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
BEGIN
  RETURN public.assinatura_eletronica_internal_iniciar_finalizacao_diario_segur(
    p_envelope_id => p_envelope_id,
    p_actor_auth_user_id => p_actor_auth_user_id,
    p_auth_session_id => p_auth_session_id,
    p_request_id => p_request_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_finalizar_artefatos_diario(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_final_bucket_id text,
  p_final_storage_path text,
  p_final_tamanho_bytes bigint,
  p_final_sha256 text,
  p_receipt_bucket_id text,
  p_receipt_storage_path text,
  p_receipt_tamanho_bytes bigint,
  p_receipt_sha256 text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(
    p_envelope_id => p_envelope_id,
    p_actor_auth_user_id => p_actor_auth_user_id,
    p_auth_session_id => p_auth_session_id,
    p_final_bucket_id => p_final_bucket_id,
    p_final_storage_path => p_final_storage_path,
    p_final_tamanho_bytes => p_final_tamanho_bytes,
    p_final_sha256 => p_final_sha256,
    p_receipt_bucket_id => p_receipt_bucket_id,
    p_receipt_storage_path => p_receipt_storage_path,
    p_receipt_tamanho_bytes => p_receipt_tamanho_bytes,
    p_receipt_sha256 => p_receipt_sha256,
    p_request_id => p_request_id
  );
END;
$function$;

-- Segredo exclusivo do marcador de convite. A migration nunca le nem devolve
-- o valor; cria somente quando ausente e falha fechada diante de duplicidade.
DO $migration$
DECLARE
  v_secret_count integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
    INTO v_secret_count
  FROM vault.secrets AS segredo
  WHERE segredo.name = 'portal_invite_reconciliation_hmac_secret';

  IF v_secret_count = 0 THEN
    PERFORM vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'portal_invite_reconciliation_hmac_secret',
      'HMAC exclusivo para reconciliacao de convites de responsavel legal'
    );
  ELSIF v_secret_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_SECRET_DUPLICADO';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_secret_count
  FROM vault.secrets AS segredo
  WHERE segredo.name = 'portal_invite_reconciliation_hmac_secret';

  IF v_secret_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_SECRET_INDISPONIVEL';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.portal_identidade_assinar_convite_responsavel(
  p_current_actor_auth_user_id uuid,
  p_original_actor_auth_user_id uuid,
  p_request_id uuid,
  p_responsavel_legal_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_preparacao jsonb;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_canonical_email text;
  v_secret_count integer;
  v_secret text;
  v_payload text;
BEGIN
  IF p_current_actor_auth_user_id IS NULL
     OR p_original_actor_auth_user_id IS NULL
     OR p_request_id IS NULL
     OR p_responsavel_legal_id IS NULL
     OR char_length(v_email) NOT BETWEEN 5 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_PAYLOAD_INVALIDO';
  END IF;

  -- O ator corrente autoriza cada tentativa. O ator original integra somente
  -- o payload assinado, permitindo retry por outro gestor sem herdar poder.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_current_actor_auth_user_id
  );
  IF v_preparacao ->> 'responsavelLegalId'
       IS DISTINCT FROM p_responsavel_legal_id::text
     OR NOT coalesce((v_preparacao ->> 'eligible')::boolean, false)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_RESPONSAVEL_INELEGIVEL';
  END IF;

  v_canonical_email := lower(btrim(coalesce(v_preparacao ->> 'email', '')));
  IF v_email IS DISTINCT FROM v_canonical_email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_EMAIL_DIVERGENTE';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    max(nullif(btrim(segredo.decrypted_secret), ''))
  INTO v_secret_count, v_secret
  FROM vault.decrypted_secrets AS segredo
  WHERE segredo.name = 'portal_invite_reconciliation_hmac_secret';

  IF v_secret_count <> 1
     OR v_secret IS NULL
     OR pg_catalog.octet_length(v_secret) < 32
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_SECRET_INDISPONIVEL';
  END IF;

  v_payload := 'v1' || E'\n'
    || p_original_actor_auth_user_id::text || E'\n'
    || p_request_id::text || E'\n'
    || p_responsavel_legal_id::text || E'\n'
    || v_email;

  RETURN pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_payload, 'UTF8'),
      pg_catalog.convert_to(v_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
END;
$function$;

-- Resolve o envelope atual no servidor. Envelope vivo tem prioridade; sem
-- um vivo, devolve a versao terminal mais recente da mesma origem.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_obter_envelope_diario_atual(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_perfil text,
  p_context_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_polo_id uuid;
  v_envelope_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  IF p_turma_id IS NULL
     OR p_disciplina_id IS NULL
     OR p_context_id IS NULL
     OR v_perfil <> 'GESTOR'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_ENVELOPE_ATUAL_PARAMETROS_INVALIDOS';
  END IF;

  SELECT turma.polo_id
    INTO v_polo_id
  FROM public.turmas AS turma
  JOIN public.turmas_disciplinas AS vinculo
    ON vinculo.turma_id = turma.id
   AND vinculo.disciplina_id = p_disciplina_id
  WHERE turma.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'ASSINATURA_DIARIO_NAO_ENCONTRADO';
  END IF;

  IF NOT coalesce(
    public.assinatura_eletronica_gestor_pode_gerir_diario(
      v_actor,
      p_context_id,
      p_turma_id,
      v_polo_id
    ),
    false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_DIARIO_GESTAO_NAO_AUTORIZADA';
  END IF;

  SELECT envelope.id
    INTO v_envelope_id
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.origem_tipo = 'DIARIO'
    AND envelope.turma_id = p_turma_id
    AND envelope.disciplina_id = p_disciplina_id
  ORDER BY
    CASE
      WHEN envelope.status IN (
        'RASCUNHO', 'PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO'
      ) THEN 0
      ELSE 1
    END,
    envelope.origem_versao DESC,
    envelope.updated_at DESC,
    envelope.id DESC
  LIMIT 1;

  IF v_envelope_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.assinatura_eletronica_obter_envelope(
    v_envelope_id,
    v_perfil,
    p_context_id
  );
END;
$function$;

-- Os nomes truncados e os overloads legados continuam existindo apenas como
-- implementacao interna do owner; nenhum papel de API pode chama-los.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_segu(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_segur(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_dia(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar(
  uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar(
  uuid, text, text, bigint, text, text, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_publicar_original_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_finalizar_artefatos_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_assinar_convite_responsavel(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_envelope_diario_atual(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_rpc_publicar_original_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_rpc_finalizar_artefatos_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_identidade_assinar_convite_responsavel(
  uuid, uuid, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_envelope_diario_atual(
  uuid, uuid, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.assinatura_eletronica_rpc_publicar_original_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) IS 'Alias service_role explicito para publicar o PDF original do Diario, sem truncamento de identificador.';
COMMENT ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) IS 'Alias service_role explicito para iniciar a finalizacao do Diario.';
COMMENT ON FUNCTION public.assinatura_eletronica_rpc_finalizar_artefatos_diario(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) IS 'Alias service_role explicito para registrar os artefatos finais do Diario.';
COMMENT ON FUNCTION public.portal_identidade_assinar_convite_responsavel(
  uuid, uuid, uuid, uuid, text
) IS 'Gera somente HMAC hex do convite apos revalidar o gestor atual, o responsavel e o e-mail canonico.';
COMMENT ON FUNCTION public.assinatura_eletronica_obter_envelope_diario_atual(
  uuid, uuid, text, uuid
) IS 'Retorna ao Gestor autorizado o envelope vivo ou terminal mais recente do Diario, no shape canonico.';

COMMIT;
