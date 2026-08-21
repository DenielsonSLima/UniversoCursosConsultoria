-- Termo canônico, aceite explícito, validação pública e acervo privado do
-- Diário de Classe assinado. Esta migration é deliberadamente fail-closed:
-- documentos futuros exigem uma migration de autorização própria.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Evidência persistida do termo aceito.
-- ---------------------------------------------------------------------------

ALTER TABLE public.assinatura_eletronica_participantes
  ADD COLUMN aceite_termo_sha256 text,
  ADD COLUMN aceite_termo_em timestamptz,
  ADD CONSTRAINT assinatura_eletronica_participantes_aceite_termo_shape
    CHECK (
      (
        aceite_termo_sha256 IS NULL
        AND aceite_termo_em IS NULL
      )
      OR
      (
        aceite_termo_sha256 IS NOT NULL
        AND aceite_termo_sha256 ~ '^[0-9a-f]{64}$'
        AND aceite_termo_em IS NOT NULL
        AND nullif(btrim(aceitou_versao_termo), '') IS NOT NULL
      )
    );

ALTER TABLE public.assinatura_eletronica_eventos
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_eventos_tipo_check,
  ADD CONSTRAINT assinatura_eletronica_eventos_tipo_check
    CHECK (tipo IN (
      'ENVELOPE_CRIADO',
      'PARTICIPANTE_ADICIONADO',
      'AGUARDANDO_VINCULO_SEGURO',
      'DOCUMENTO_ORIGINAL_CONGELADO',
      'ENVELOPE_PUBLICADO',
      'PARTICIPANTE_LIBERADO',
      'REAUTENTICACAO_PREPARADA',
      'DESAFIO_CRIADO',
      'DESAFIO_VERIFICADO',
      'LEITURA_CONFIRMADA',
      'ASSINATURA_CONCLUIDA',
      'FINALIZACAO_INICIADA',
      'DOCUMENTO_FINAL_REGISTRADO',
      'COMPROVANTE_REGISTRADO',
      'ENVELOPE_ASSINADO',
      'ASSINATURA_BLOQUEADA_FUNDACAO',
      'ENVELOPE_CANCELADO',
      'ENVELOPE_EXPIRADO',
      'ENVELOPE_SUBSTITUIDO'
    ));

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_texto_termo_fechado(
  p_texto text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT coalesce(
    nullif(btrim(p_texto), '') IS NOT NULL
    AND p_texto !~ '(\{\{|\}\}|\$\{|\[\[|\]\]|__[A-Z0-9_]+__)'
    AND lower(p_texto) !~ '(^|[^[:alnum:]_])(defina aqui|descreva aqui|informe como|informe os canais|explique como|preencha aqui|a definir)([^[:alnum:]_]|$)'
    AND p_texto !~* '(https?://|www\.|<[^>]*>|\[[^]]+\][[:space:]]*\()'
    AND public.assinatura_eletronica_texto_editor_seguro(p_texto),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_termo_canonico_diario(
  p_envelope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_editor jsonb;
  v_sections jsonb;
  v_base jsonb;
  v_section jsonb;
BEGIN
  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;

  IF NOT FOUND
     OR v_envelope.documento <> 'diario_classe'
     OR v_envelope.origem_tipo <> 'DIARIO'
     OR v_envelope.politica_versao < 1
     OR jsonb_typeof(v_envelope.politica_snapshot) IS DISTINCT FROM 'object'
     OR v_envelope.politica_snapshot ->> 'documentType'
        IS DISTINCT FROM 'diario_classe'
     OR jsonb_typeof(v_envelope.politica_snapshot -> 'editor')
        IS DISTINCT FROM 'object'
     OR NOT EXISTS (
       SELECT 1
       FROM public.assinatura_eletronica_politicas AS politica
       WHERE politica.id = v_envelope.politica_id
         AND politica.arquivada_em IS NULL
         AND politica.habilitada
         AND politica.status_juridico = 'APROVADA'
         AND politica.documento = 'diario_classe'
         AND politica.versao = v_envelope.politica_versao
         AND politica.politica = v_envelope.politica_snapshot
         AND politica.certificado = v_envelope.certificado_snapshot
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TERMO_POLITICA_NAO_DISPONIVEL';
  END IF;

  BEGIN
    v_editor := public.assinatura_eletronica_normalizar_editor(
      v_envelope.politica_snapshot -> 'editor'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_TERMO_SNAPSHOT_INVALIDO';
  END;

  v_sections := v_editor -> 'pages' -> 1 -> 'sections';
  IF v_editor IS DISTINCT FROM v_envelope.politica_snapshot -> 'editor'
     OR v_editor ->> 'schemaVersion' <> '3'
     OR jsonb_typeof(v_sections) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_sections) <> 5
     OR jsonb_typeof(v_envelope.politica_snapshot -> 'name')
        IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_envelope.politica_snapshot -> 'versionLabel')
        IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_envelope.politica_snapshot -> 'confirmationMessage')
        IS DISTINCT FROM 'string'
     OR char_length(btrim(v_envelope.politica_snapshot ->> 'name')) > 120
     OR char_length(btrim(v_envelope.politica_snapshot ->> 'versionLabel')) > 80
     OR char_length(btrim(v_envelope.politica_snapshot ->> 'confirmationMessage')) > 600
     OR NOT public.assinatura_eletronica_texto_termo_fechado(
       v_envelope.politica_snapshot ->> 'name'
     )
     OR NOT public.assinatura_eletronica_texto_termo_fechado(
       v_envelope.politica_snapshot ->> 'versionLabel'
     )
     OR NOT public.assinatura_eletronica_texto_termo_fechado(
       v_envelope.politica_snapshot ->> 'confirmationMessage'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_TERMO_SNAPSHOT_INVALIDO';
  END IF;

  FOR v_section IN
    SELECT value FROM jsonb_array_elements(v_sections)
  LOOP
    IF NOT public.assinatura_eletronica_texto_termo_fechado(
         v_section ->> 'title'
       )
       OR NOT public.assinatura_eletronica_texto_termo_fechado(
         v_section ->> 'body'
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_TERMO_CONTEM_PLACEHOLDER';
    END IF;
  END LOOP;

  v_base := jsonb_build_object(
    'termId', 'diario_classe:v' || v_envelope.politica_versao::text,
    'version', v_envelope.politica_versao,
    'versionLabel', btrim(v_envelope.politica_snapshot ->> 'versionLabel'),
    'title', btrim(v_envelope.politica_snapshot ->> 'name'),
    'confirmationMessage', btrim(
      v_envelope.politica_snapshot ->> 'confirmationMessage'
    ),
    'sections', v_sections
  );

  RETURN v_base || jsonb_build_object(
    'sha256', public.assinatura_eletronica_sha256_json(v_base)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_sessao_jwt_ativa(
  p_actor_auth_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_session_id uuid;
BEGIN
  IF p_actor_auth_user_id IS NULL
     OR auth.uid() IS DISTINCT FROM p_actor_auth_user_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA';
  END IF;
  BEGIN
    v_auth_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA';
  END;
  IF v_auth_session_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA';
  END IF;
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    v_auth_session_id
  );
  RETURN v_auth_session_id;
END;
$function$;

-- Os gates chamados por service_role não podem reutilizar helpers que
-- derivam o Gestor de auth.uid()/auth.role(). O ator é sempre o usuário
-- autenticado pela Edge e seu escopo corrente é recalculado explicitamente.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_gestor_actor_tem_escopo(
  p_actor_auth_user_id uuid,
  p_context_id uuid,
  p_polo_id uuid,
  p_modulo text,
  p_aba text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_modulo text := lower(btrim(coalesce(p_modulo, '')));
  v_aba text := nullif(lower(btrim(coalesce(p_aba, ''))), '');
  v_polo_ids uuid[];
  v_contexto_polo text;
  v_permissoes_usuario jsonb;
  v_permissoes_efetivas jsonb;
  v_restricao_horario jsonb;
  v_agora timestamp := statement_timestamp()
    AT TIME ZONE 'America/Maceio';
  v_dia integer;
  v_hora text;
  v_inicio text;
  v_fim text;
  v_agenda_permite boolean := false;
  v_todos_polos boolean := false;
  v_polo_permitido boolean := false;
BEGIN
  IF p_actor_auth_user_id IS NULL
     OR p_context_id IS NULL
     OR p_polo_id IS NULL
     OR (
       v_modulo = 'gestao'
       AND v_aba IS NOT NULL
     )
     OR (
       v_modulo = 'secretaria'
       AND v_aba IS DISTINCT FROM 'assinatura-eletronica'
     )
     OR v_modulo NOT IN ('gestao', 'secretaria')
  THEN
    RETURN false;
  END IF;

  SELECT
    gestor.polo_ids,
    gestor.context,
    coalesce(gestor.permissoes, '{}'::jsonb),
    CASE
      WHEN gestor.perfil_acesso_id IS NOT NULL
       AND NOT coalesce(gestor.personalizar_permissoes, false)
       AND perfil.id IS NOT NULL
      THEN coalesce(perfil.permissoes, '{}'::jsonb)
      ELSE coalesce(gestor.permissoes, '{}'::jsonb)
    END,
    coalesce(
      gestor.restricao_horario,
      CASE
        WHEN gestor.perfil_acesso_id IS NOT NULL
        THEN perfil.restricao_horario
        ELSE NULL
      END,
      '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb
    )
  INTO
    v_polo_ids,
    v_contexto_polo,
    v_permissoes_usuario,
    v_permissoes_efetivas,
    v_restricao_horario
  FROM public.usuarios_sistema AS gestor
  LEFT JOIN public.perfis_acesso AS perfil
    ON perfil.id = gestor.perfil_acesso_id
  WHERE gestor.id = p_context_id
    AND gestor.auth_user_id = p_actor_auth_user_id
    AND public.is_active_status(gestor.status)
  LIMIT 1;
  IF NOT FOUND
     OR jsonb_typeof(v_permissoes_efetivas) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_permissoes_efetivas -> 'modules')
        IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_restricao_horario) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_restricao_horario -> 'ativo')
        IS DISTINCT FROM 'boolean'
  THEN
    RETURN false;
  END IF;

  IF NOT (v_restricao_horario ->> 'ativo')::boolean THEN
    v_agenda_permite := true;
  ELSE
    v_inicio := v_restricao_horario ->> 'horario_inicio';
    v_fim := v_restricao_horario ->> 'horario_fim';
    IF jsonb_typeof(v_restricao_horario -> 'dias')
         IS DISTINCT FROM 'array'
    THEN
      RETURN false;
    END IF;
    IF coalesce(v_inicio, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR coalesce(v_fim, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR v_inicio = v_fim
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(
           v_restricao_horario -> 'dias'
         ) AS dia(valor)
         WHERE dia.valor !~ '^[0-6]$'
       )
    THEN
      RETURN false;
    END IF;
    v_dia := extract(dow FROM v_agora)::integer;
    v_hora := to_char(v_agora, 'HH24:MI');
    IF v_inicio < v_fim THEN
      v_agenda_permite := v_hora BETWEEN v_inicio AND v_fim
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            v_restricao_horario -> 'dias'
          ) AS dia(valor)
          WHERE dia.valor::integer = v_dia
        );
    ELSIF v_hora >= v_inicio THEN
      v_agenda_permite := EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          v_restricao_horario -> 'dias'
        ) AS dia(valor)
        WHERE dia.valor::integer = v_dia
      );
    ELSIF v_hora <= v_fim THEN
      v_agenda_permite := EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          v_restricao_horario -> 'dias'
        ) AS dia(valor)
        WHERE dia.valor::integer = ((v_dia + 6) % 7)
      );
    END IF;
  END IF;
  IF NOT v_agenda_permite THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      v_permissoes_efetivas -> 'modules'
    ) AS modulo(valor)
    WHERE modulo.valor = v_modulo
  ) THEN
    RETURN false;
  END IF;
  IF v_aba IS NOT NULL THEN
    IF jsonb_typeof(v_permissoes_efetivas -> 'tabs' -> v_modulo)
         IS DISTINCT FROM 'array'
    THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        v_permissoes_efetivas -> 'tabs' -> v_modulo
      ) AS aba(valor)
      WHERE aba.valor = v_aba
    ) THEN
      RETURN false;
    END IF;
  END IF;

  v_todos_polos := CASE
    WHEN jsonb_typeof(v_permissoes_usuario -> 'allPolos') = 'boolean'
    THEN (v_permissoes_usuario ->> 'allPolos')::boolean
      AND cardinality(coalesce(v_polo_ids, ARRAY[]::uuid[])) = 0
    ELSE false
  END;
  IF v_todos_polos THEN
    v_polo_permitido := true;
  ELSIF cardinality(coalesce(v_polo_ids, ARRAY[]::uuid[])) > 0 THEN
    v_polo_permitido := p_polo_id = ANY(v_polo_ids);
  ELSIF coalesce(v_contexto_polo, '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    v_polo_permitido := p_polo_id = v_contexto_polo::uuid;
  END IF;
  RETURN coalesce(v_polo_permitido, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_gestor_pode_gerir_diario(
  p_actor_auth_user_id uuid,
  p_context_id uuid,
  p_turma_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas AS turma
    WHERE turma.id = p_turma_id
      AND turma.polo_id = p_polo_id
  ) AND (
    public.assinatura_eletronica_gestor_actor_tem_escopo(
      p_actor_auth_user_id,
      p_context_id,
      p_polo_id,
      'gestao',
      NULL
    )
    OR public.assinatura_eletronica_gestor_actor_tem_escopo(
      p_actor_auth_user_id,
      p_context_id,
      p_polo_id,
      'secretaria',
      'assinatura-eletronica'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_gestor_actor_tem_escopo(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_gestor_pode_gerir_diario(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_obter_termo(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_auth_session_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  v_auth_session_id := public.assinatura_eletronica_sessao_jwt_ativa(v_actor);
  IF p_envelope_id IS NULL
     OR p_participante_id IS NULL
     OR p_context_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_TERMO_ESCOPO_INVALIDO';
  END IF;

  PERFORM public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id,
    p_participante_id,
    p_perfil,
    p_context_id,
    v_actor,
    'PREPARAR'
  );

  RETURN public.assinatura_eletronica_termo_canonico_diario(p_envelope_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_proteger_participante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.envelope_id IS DISTINCT FROM OLD.envelope_id
     OR NEW.papel IS DISTINCT FROM OLD.papel
     OR NEW.ordem IS DISTINCT FROM OLD.ordem
     OR NEW.obrigatorio IS DISTINCT FROM OLD.obrigatorio
     OR NEW.parceiro_id IS DISTINCT FROM OLD.parceiro_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.vinculo_verificado_em IS DISTINCT FROM OLD.vinculo_verificado_em
     OR NEW.contexto_tipo IS DISTINCT FROM OLD.contexto_tipo
     OR NEW.contexto_id IS DISTINCT FROM OLD.contexto_id
     OR NEW.responsavel_legal_id IS DISTINCT FROM OLD.responsavel_legal_id
     OR NEW.responsavel_aluno_vinculo_id IS DISTINCT FROM OLD.responsavel_aluno_vinculo_id
     OR NEW.coordenacao_id IS DISTINCT FROM OLD.coordenacao_id
     OR NEW.identidade_snapshot IS DISTINCT FROM OLD.identidade_snapshot
     OR NEW.vinculo_snapshot IS DISTINCT FROM OLD.vinculo_snapshot
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PARTICIPANTE_IDENTIDADE_IMUTAVEL';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'AGUARDANDO_ORDEM' AND NEW.status IN ('PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'PENDENTE' AND NEW.status IN ('DESAFIO_PENDENTE', 'RECUSADO', 'CANCELADO'))
    OR (OLD.status = 'DESAFIO_PENDENTE' AND NEW.status IN ('PENDENTE', 'ASSINADO', 'RECUSADO', 'CANCELADO'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TRANSICAO_PARTICIPANTE_INVALIDA';
  END IF;

  IF NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
     OR NEW.assinado_por_auth_user_id IS DISTINCT FROM OLD.assinado_por_auth_user_id
     OR NEW.aceitou_versao_termo IS DISTINCT FROM OLD.aceitou_versao_termo
     OR NEW.aceite_termo_sha256 IS DISTINCT FROM OLD.aceite_termo_sha256
     OR NEW.aceite_termo_em IS DISTINCT FROM OLD.aceite_termo_em
  THEN
    IF OLD.status <> 'DESAFIO_PENDENTE'
       OR NEW.status <> 'ASSINADO'
       OR NEW.assinado_em IS NULL
       OR NEW.assinado_por_auth_user_id IS NULL
       OR nullif(btrim(NEW.aceitou_versao_termo), '') IS NULL
       OR NEW.aceite_termo_sha256 IS NULL
       OR NEW.aceite_termo_sha256 !~ '^[0-9a-f]{64}$'
       OR NEW.aceite_termo_em IS DISTINCT FROM NEW.assinado_em
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_ACEITE_PARTICIPANTE_INVALIDO';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_texto_termo_fechado(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_termo_canonico_diario(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_sessao_jwt_ativa(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_termo(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_termo(
  uuid, uuid, text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Consentimento obrigatório ligado ao desafio, ticket e idempotência.
-- ---------------------------------------------------------------------------

-- O preflight antigo não recebia o termo e poderia iniciar a verificação de
-- senha antes de detectar consentimento divergente. Ele permanece fechado.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_consent jsonb,
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
  v_term jsonb;
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
  IF p_request_id IS NULL
     OR p_attempt_id IS NULL
     OR p_attempt_id IS NOT DISTINCT FROM p_request_id
     OR jsonb_typeof(p_consent) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_OU_CONSENTIMENTO_INVALIDO';
  END IF;

  -- Sessão, vínculo, ordem e política precedem consent, rate-limit e replay.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id,
    p_participante_id,
    p_perfil,
    p_context_id,
    p_actor_auth_user_id,
    'PREPARAR'
  );
  v_term := public.assinatura_eletronica_termo_canonico_diario(p_envelope_id);
  IF (
       SELECT array_agg(chave ORDER BY chave)
       FROM jsonb_object_keys(p_consent) AS chaves(chave)
     ) IS DISTINCT FROM ARRAY['accepted', 'sha256', 'termId']::text[]
     OR p_consent -> 'accepted' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(p_consent -> 'termId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_consent -> 'sha256') IS DISTINCT FROM 'string'
     OR p_consent ->> 'termId' IS DISTINCT FROM v_term ->> 'termId'
     OR p_consent ->> 'sha256' IS DISTINCT FROM v_term ->> 'sha256'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_CONSENTIMENTO_INVALIDO';
  END IF;

  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;
  v_logical_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'profile', upper(btrim(p_perfil)),
      'contextId', p_context_id,
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id,
      'consent', p_consent
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
      'authSessionId', p_auth_session_id,
      'consent', p_consent
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:reauth:rate:' || p_actor_auth_user_id::text,
      0
    )
  );
  SELECT tentativa.*
  INTO v_attempt
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

    SELECT operacao.*
    INTO v_replay
    FROM public.assinatura_eletronica_operacoes AS operacao
    WHERE operacao.actor_scope = v_actor_scope
      AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
      AND operacao.request_id = p_attempt_id;
    IF NOT FOUND
       OR v_replay.payload_sha256 IS DISTINCT FROM v_attempt_payload_sha256
       OR v_replay.resultado ->> 'attemptId'
          IS DISTINCT FROM p_attempt_id::text
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_REPLAY_DIVERGENTE';
    END IF;
    IF jsonb_typeof(v_replay.resultado -> 'email') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_scope -> 'email') IS DISTINCT FROM 'string'
       OR nullif(lower(btrim(v_replay.resultado ->> 'email')), '') IS NULL
       OR nullif(lower(btrim(v_scope ->> 'email')), '') IS NULL
       OR lower(btrim(v_replay.resultado ->> 'email'))
          IS DISTINCT FROM lower(btrim(v_scope ->> 'email'))
       OR v_replay.resultado -> 'passwordEnabled'
          IS DISTINCT FROM 'true'::jsonb
       OR v_scope -> 'passwordEnabled' IS DISTINCT FROM 'true'::jsonb
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_REAUTH_CREDENCIAL_CORRENTE_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
  WHERE tentativa.actor_auth_user_id = p_actor_auth_user_id
    AND tentativa.created_at > statement_timestamp() - interval '15 minutes';
  IF v_count >= 5 THEN
    SELECT greatest(1, ceil(extract(epoch FROM (
      min(tentativa.created_at) + interval '15 minutes'
        - statement_timestamp()
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

  SELECT operacao.*
  INTO v_logical
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
      'sessionBound', true,
      'termId', v_term ->> 'termId',
      'termSha256', v_term ->> 'sha256'
    )
  );
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, jsonb, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_decodificar_ticket(
  p_ticket text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope jsonb;
  v_payload text;
  v_signature bytea;
  v_expected bytea;
  v_claims jsonb;
BEGIN
  IF char_length(p_ticket) NOT BETWEEN 32 AND 4096 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_envelope := pg_catalog.convert_from(
    pg_catalog.decode(p_ticket, 'base64'),
    'UTF8'
  )::jsonb;
  IF jsonb_typeof(v_envelope) <> 'object'
     OR (
       SELECT array_agg(chave ORDER BY chave)
       FROM jsonb_object_keys(v_envelope) AS chaves(chave)
     ) IS DISTINCT FROM ARRAY['payload', 'signature']::text[]
     OR nullif(v_envelope ->> 'payload', '') IS NULL
     OR nullif(v_envelope ->> 'signature', '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_payload := pg_catalog.convert_from(
    pg_catalog.decode(v_envelope ->> 'payload', 'base64'),
    'UTF8'
  );
  v_signature := pg_catalog.decode(v_envelope ->> 'signature', 'hex');
  v_expected := extensions.hmac(
    pg_catalog.convert_to(v_payload, 'UTF8'),
    pg_catalog.convert_to(
      public.assinatura_eletronica_ticket_hmac_secret(),
      'UTF8'
    ),
    'sha256'
  );
  IF v_signature IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_claims := v_payload::jsonb;
  IF jsonb_typeof(v_claims) <> 'object'
     OR (
       SELECT array_agg(chave ORDER BY chave)
       FROM jsonb_object_keys(v_claims) AS chaves(chave)
     ) IS DISTINCT FROM ARRAY[
       'actorAuthUserId', 'authSessionId', 'challengeId', 'consent',
       'contextId', 'envelopeId', 'expiresAt', 'issuedAt', 'participantId',
       'participantOrder', 'participantRole', 'profile', 'requestId'
     ]::text[]
     OR jsonb_typeof(v_claims -> 'consent') IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(chave ORDER BY chave)
       FROM jsonb_object_keys(v_claims -> 'consent') AS chaves(chave)
     ) IS DISTINCT FROM ARRAY['accepted', 'sha256', 'termId']::text[]
     OR v_claims -> 'consent' -> 'accepted' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(v_claims -> 'consent' -> 'termId')
        IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_claims -> 'consent' -> 'sha256')
        IS DISTINCT FROM 'string'
     OR v_claims -> 'consent' ->> 'sha256' !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  RETURN v_claims;
EXCEPTION
  WHEN SQLSTATE '55000' THEN RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
END;
$function$;

-- O overload sem attempt_id permanece fechado e deixa de participar do fluxo.
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
  v_term jsonb;
  v_actor_scope text;
  v_attempt_payload_sha256 text;
  v_registration_payload_sha256 text;
  v_attempt public.assinatura_eletronica_reauth_tentativas%ROWTYPE;
  v_preflight public.assinatura_eletronica_operacoes%ROWTYPE;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_challenge_id uuid := gen_random_uuid();
  v_issued_at timestamptz := statement_timestamp();
  v_expires_at timestamptz := statement_timestamp() + interval '120 seconds';
  v_claims jsonb;
  v_ticket text;
  v_ticket_hmac text;
  v_resultado jsonb;
  v_chaves_invalidas text;
  v_authenticated_at timestamptz;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL
     OR p_attempt_id IS NULL
     OR p_attempt_id IS NOT DISTINCT FROM p_request_id
     OR p_reautenticado_em IS NULL
     OR jsonb_typeof(p_evidencia) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_ATTEMPT_OU_EVIDENCIA_INVALIDA';
  END IF;

  -- Autorização corrente sempre precede qualquer consulta de replay.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id,
    p_participante_id,
    p_perfil,
    p_context_id,
    p_actor_auth_user_id,
    'REGISTRAR'
  );
  v_term := public.assinatura_eletronica_termo_canonico_diario(p_envelope_id);
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT string_agg(chave, ', ' ORDER BY chave)
  INTO v_chaves_invalidas
  FROM jsonb_object_keys(p_evidencia) AS chaves(chave)
  WHERE chave NOT IN (
    'provider', 'authenticatedAt', 'ipHash', 'userAgentHash', 'consent'
  );
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
     OR NOT (p_evidencia ?& ARRAY['provider', 'authenticatedAt', 'consent']::text[])
     OR jsonb_typeof(p_evidencia -> 'provider') IS DISTINCT FROM 'string'
     OR p_evidencia ->> 'provider' <> 'SUPABASE_PASSWORD'
     OR jsonb_typeof(p_evidencia -> 'authenticatedAt') IS DISTINCT FROM 'string'
     OR v_authenticated_at IS NULL
     OR v_authenticated_at IS DISTINCT FROM p_reautenticado_em
     OR p_reautenticado_em < statement_timestamp() - interval '120 seconds'
     OR p_reautenticado_em > statement_timestamp() + interval '30 seconds'
     OR jsonb_typeof(p_evidencia -> 'consent') IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(chave ORDER BY chave)
       FROM jsonb_object_keys(p_evidencia -> 'consent') AS chaves(chave)
     ) IS DISTINCT FROM ARRAY['accepted', 'sha256', 'termId']::text[]
     OR p_evidencia -> 'consent' -> 'accepted' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(p_evidencia -> 'consent' -> 'termId')
        IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_evidencia -> 'consent' -> 'sha256')
        IS DISTINCT FROM 'string'
     OR p_evidencia -> 'consent' ->> 'termId'
        IS DISTINCT FROM v_term ->> 'termId'
     OR p_evidencia -> 'consent' ->> 'sha256'
        IS DISTINCT FROM v_term ->> 'sha256'
     OR (
       p_evidencia ? 'ipHash'
       AND (
         jsonb_typeof(p_evidencia -> 'ipHash') IS DISTINCT FROM 'string'
         OR p_evidencia ->> 'ipHash' !~ '^[0-9a-f]{64}$'
       )
     )
     OR (
       p_evidencia ? 'userAgentHash'
       AND (
         jsonb_typeof(p_evidencia -> 'userAgentHash') IS DISTINCT FROM 'string'
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
      'authSessionId', p_auth_session_id,
      'consent', p_evidencia -> 'consent'
    )
  );
  v_registration_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'profile', upper(btrim(p_perfil)),
      'contextId', p_context_id,
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id,
      'reauthenticatedAt', p_reautenticado_em,
      'evidence', p_evidencia
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:reauth:registrar:' || p_actor_auth_user_id::text
        || ':' || p_request_id::text,
      0
    )
  );

  SELECT tentativa.*
  INTO v_attempt
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

  SELECT operacao.*
  INTO v_preflight
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

  SELECT operacao.*
  INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'REGISTRAR_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_registration_payload_sha256
       OR NOT EXISTS (
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
           AND desafio.evidencia_snapshot = p_evidencia
           AND desafio.evidencia_hash =
             public.assinatura_eletronica_sha256_json(p_evidencia)
           AND v_replay.resultado ->> 'envelopeId' = p_envelope_id::text
           AND v_replay.resultado ->> 'participantId' = p_participante_id::text
           AND v_replay.resultado ->> 'profile' = upper(btrim(p_perfil))
           AND v_replay.resultado ->> 'contextId' = p_context_id::text
       )
    THEN
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

  v_claims := jsonb_build_object(
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'challengeId', v_challenge_id,
    'consent', p_evidencia -> 'consent',
    'contextId', p_context_id,
    'envelopeId', p_envelope_id,
    'expiresAt', v_expires_at,
    'issuedAt', v_issued_at,
    'participantId', p_participante_id,
    'participantOrder', (v_scope ->> 'participantOrder')::integer,
    'participantRole', v_scope ->> 'participantRole',
    'profile', upper(btrim(p_perfil)),
    'requestId', p_request_id
  );
  v_ticket_hmac := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_claims::text, 'UTF8'),
      pg_catalog.convert_to(
        public.assinatura_eletronica_ticket_hmac_secret(),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_ticket := public.assinatura_eletronica_codificar_ticket(v_claims);

  INSERT INTO public.assinatura_eletronica_desafios (
    id,
    envelope_id,
    participante_id,
    metodo,
    estado,
    segredo_hash,
    correlacao_provedor,
    tentativas,
    max_tentativas,
    expira_em,
    verificado_em,
    evidencia_hash,
    actor_auth_user_id,
    auth_session_id,
    perfil,
    contexto_id,
    request_id,
    evidencia_snapshot
  ) VALUES (
    v_challenge_id,
    p_envelope_id,
    p_participante_id,
    'SENHA_REAUTENTICADA',
    'VERIFICADO',
    v_ticket_hmac,
    'reauth:' || v_challenge_id::text,
    1,
    1,
    v_expires_at,
    v_issued_at,
    public.assinatura_eletronica_sha256_json(p_evidencia),
    p_actor_auth_user_id,
    p_auth_session_id,
    upper(btrim(p_perfil)),
    p_context_id,
    p_request_id,
    p_evidencia
  );

  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'DESAFIO_PENDENTE'
  WHERE participante.id = p_participante_id
    AND participante.status = 'PENDENTE';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_PARTICIPANTE_NAO_PENDENTE';
  END IF;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    p_envelope_id,
    p_participante_id,
    'DESAFIO_VERIFICADO',
    p_actor_auth_user_id,
    jsonb_build_object(
      'challengeId', v_challenge_id,
      'method', 'SENHA_REAUTENTICADA',
      'requestId', p_request_id,
      'expiresAt', v_expires_at,
      'termId', v_term ->> 'termId',
      'termSha256', v_term ->> 'sha256'
    )
  );

  v_resultado := jsonb_build_object(
    'ticket', v_ticket,
    'challengeId', v_challenge_id,
    'envelopeId', p_envelope_id,
    'participantId', p_participante_id,
    'participantRole', v_scope ->> 'participantRole',
    'participantOrder', (v_scope ->> 'participantOrder')::integer,
    'profile', upper(btrim(p_perfil)),
    'contextId', p_context_id,
    'issuedAt', v_issued_at,
    'expiresAt', v_expires_at
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
    'REGISTRAR_REAUTENTICACAO',
    p_request_id,
    v_registration_payload_sha256,
    v_resultado
  );

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

REVOKE ALL ON FUNCTION public.assinatura_eletronica_decodificar_ticket(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(
  p_ticket text,
  p_request_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claims jsonb;
  v_consent jsonb;
  v_scope jsonb;
  v_term jsonb;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_desafio public.assinatura_eletronica_desafios%ROWTYPE;
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_ticket_hmac text;
  v_signed_at timestamptz := statement_timestamp();
  v_next_participant_id uuid;
  v_next_participant_role text;
  v_requires_finalization boolean;
  v_resultado jsonb;
  v_chaves_invalidas text;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL
     OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL
     OR nullif(btrim(coalesce(p_ticket, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_INVALIDO';
  END IF;

  v_claims := public.assinatura_eletronica_decodificar_ticket(p_ticket);
  v_consent := v_claims -> 'consent';
  IF (v_claims ->> 'actorAuthUserId')::uuid
       IS DISTINCT FROM p_actor_auth_user_id
     OR (v_claims ->> 'authSessionId')::uuid
       IS DISTINCT FROM p_auth_session_id
     OR (v_claims ->> 'requestId')::uuid IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_NAO_PERTENCE_A_SESSAO';
  END IF;

  -- Sessão, perfil, contexto, vínculo, ordem e política são checados antes do
  -- ledger de replay. O ticket nunca mantém autorização revogada.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    (v_claims ->> 'envelopeId')::uuid,
    (v_claims ->> 'participantId')::uuid,
    v_claims ->> 'profile',
    (v_claims ->> 'contextId')::uuid,
    p_actor_auth_user_id,
    'CONSUMIR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:reauth:consumir:' || p_actor_auth_user_id::text
        || ':' || p_request_id::text,
      0
    )
  );

  SELECT desafio.*
  INTO v_desafio
  FROM public.assinatura_eletronica_desafios AS desafio
  WHERE desafio.id = (v_claims ->> 'challengeId')::uuid
  FOR UPDATE;
  IF NOT FOUND
     OR v_desafio.envelope_id IS DISTINCT FROM
       (v_claims ->> 'envelopeId')::uuid
     OR v_desafio.participante_id IS DISTINCT FROM
       (v_claims ->> 'participantId')::uuid
     OR v_desafio.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
     OR v_desafio.auth_session_id IS DISTINCT FROM p_auth_session_id
     OR v_desafio.perfil IS DISTINCT FROM v_claims ->> 'profile'
     OR v_desafio.contexto_id IS DISTINCT FROM
       (v_claims ->> 'contextId')::uuid
     OR v_desafio.request_id IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_REAUTH_DESAFIO_NAO_AUTORIZADO';
  END IF;

  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = v_desafio.envelope_id
  FOR UPDATE;
  SELECT participante.*
  INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.id = v_desafio.participante_id
    AND participante.envelope_id = v_desafio.envelope_id
  FOR UPDATE;
  IF v_envelope.id IS NULL OR v_participante.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_ESTADO_INVALIDO';
  END IF;

  -- O termo é recalculado a partir do snapshot congelado já sob lock do
  -- envelope. Nenhum campo fornecido pelo navegador escolhe o conteúdo legal.
  v_term := public.assinatura_eletronica_termo_canonico_diario(v_envelope.id);
  SELECT string_agg(chave, ', ' ORDER BY chave)
  INTO v_chaves_invalidas
  FROM jsonb_object_keys(v_desafio.evidencia_snapshot) AS chaves(chave)
  WHERE chave NOT IN (
    'provider', 'authenticatedAt', 'ipHash', 'userAgentHash', 'consent'
  );

  IF v_chaves_invalidas IS NOT NULL
     OR NOT (
       v_desafio.evidencia_snapshot
       ?& ARRAY['provider', 'authenticatedAt', 'consent']::text[]
     )
     OR v_desafio.evidencia_hash IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(v_desafio.evidencia_snapshot)
     OR v_desafio.evidencia_snapshot -> 'consent' IS DISTINCT FROM v_consent
     OR v_consent -> 'accepted' IS DISTINCT FROM 'true'::jsonb
     OR v_consent ->> 'termId' IS DISTINCT FROM v_term ->> 'termId'
     OR v_consent ->> 'sha256' IS DISTINCT FROM v_term ->> 'sha256'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_REAUTH_CONSENTIMENTO_INVALIDO';
  END IF;

  v_ticket_hmac := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_claims::text, 'UTF8'),
      pg_catalog.convert_to(
        public.assinatura_eletronica_ticket_hmac_secret(),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  IF v_desafio.segredo_hash IS DISTINCT FROM v_ticket_hmac
     OR v_claims ->> 'participantRole'
        IS DISTINCT FROM v_scope ->> 'participantRole'
     OR (v_claims ->> 'participantOrder')::integer
        IS DISTINCT FROM (v_scope ->> 'participantOrder')::integer
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'ticketSha256', public.assinatura_eletronica_sha256_json(
        jsonb_build_object('ticket', p_ticket)
      ),
      'actorAuthUserId', p_actor_auth_user_id,
      'authSessionId', p_auth_session_id
    )
  );
  SELECT operacao.*
  INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'CONSUMIR_TICKET_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256
       OR v_desafio.estado <> 'CONSUMIDO'
       OR v_participante.status <> 'ASSINADO'
       OR v_participante.assinado_por_auth_user_id
          IS DISTINCT FROM p_actor_auth_user_id
       OR v_participante.aceitou_versao_termo
          IS DISTINCT FROM v_term ->> 'termId'
       OR v_participante.aceite_termo_sha256
          IS DISTINCT FROM v_term ->> 'sha256'
       OR v_participante.aceite_termo_em
          IS DISTINCT FROM v_participante.assinado_em
       OR v_replay.resultado ->> 'envelopeId'
          IS DISTINCT FROM v_envelope.id::text
       OR v_replay.resultado ->> 'participantId'
          IS DISTINCT FROM v_participante.id::text
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_REAUTH_REPLAY_BINDING_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF v_desafio.estado = 'CONSUMIDO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_CONSUMIDO';
  END IF;
  IF v_desafio.estado <> 'VERIFICADO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;
  IF v_desafio.expira_em <= statement_timestamp()
     OR (v_claims ->> 'expiresAt')::timestamptz <= statement_timestamp()
     OR (v_claims ->> 'issuedAt')::timestamptz
        > statement_timestamp() + interval '30 seconds'
     OR (v_claims ->> 'expiresAt')::timestamptz IS DISTINCT FROM
        (v_claims ->> 'issuedAt')::timestamptz + interval '120 seconds'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_TICKET_EXPIRADO';
  END IF;
  IF v_participante.status <> 'DESAFIO_PENDENTE'
     OR (v_participante.ordem = 1 AND v_envelope.status <> 'PENDENTE')
     OR (v_participante.ordem = 2 AND v_envelope.status <> 'EM_ASSINATURA')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_ESTADO_INVALIDO';
  END IF;

  UPDATE public.assinatura_eletronica_desafios AS desafio
  SET estado = 'CONSUMIDO',
      consumido_em = v_signed_at
  WHERE desafio.id = v_desafio.id;

  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'ASSINADO',
      assinado_em = v_signed_at,
      assinado_por_auth_user_id = p_actor_auth_user_id,
      aceitou_versao_termo = v_term ->> 'termId',
      aceite_termo_sha256 = v_term ->> 'sha256',
      aceite_termo_em = v_signed_at
  WHERE participante.id = v_participante.id;

  IF v_participante.ordem = 1 THEN
    UPDATE public.assinatura_eletronica_participantes AS participante
    SET status = 'PENDENTE'
    WHERE participante.envelope_id = v_envelope.id
      AND participante.ordem = 2
      AND participante.papel = 'COORDENADOR'
      AND participante.status = 'AGUARDANDO_ORDEM'
    RETURNING participante.id, participante.papel
    INTO v_next_participant_id, v_next_participant_role;
    IF v_next_participant_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_PROXIMO_PARTICIPANTE_INDISPONIVEL';
    END IF;

    UPDATE public.assinatura_eletronica_envelopes AS envelope
    SET status = 'EM_ASSINATURA'
    WHERE envelope.id = v_envelope.id;
    v_requires_finalization := false;
  ELSE
    UPDATE public.assinatura_eletronica_envelopes AS envelope
    SET status = 'FINALIZANDO'
    WHERE envelope.id = v_envelope.id;
    v_next_participant_id := NULL;
    v_next_participant_role := NULL;
    v_requires_finalization := true;
  END IF;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id,
    v_participante.id,
    'LEITURA_CONFIRMADA',
    p_actor_auth_user_id,
    jsonb_build_object(
      'challengeId', v_desafio.id,
      'requestId', p_request_id,
      'termId', v_term ->> 'termId',
      'termVersion', (v_term ->> 'version')::integer,
      'termSha256', v_term ->> 'sha256',
      'acceptedAt', v_signed_at
    )
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id,
    v_participante.id,
    'ASSINATURA_CONCLUIDA',
    p_actor_auth_user_id,
    jsonb_build_object(
      'challengeId', v_desafio.id,
      'requestId', p_request_id,
      'role', v_participante.papel,
      'order', v_participante.ordem,
      'signedAt', v_signed_at,
      'authSessionBound', true,
      'termId', v_term ->> 'termId',
      'termVersion', (v_term ->> 'version')::integer,
      'termSha256', v_term ->> 'sha256'
    )
  );
  IF v_next_participant_id IS NOT NULL THEN
    PERFORM public.assinatura_eletronica_adicionar_evento(
      v_envelope.id,
      v_next_participant_id,
      'PARTICIPANTE_LIBERADO',
      p_actor_auth_user_id,
      jsonb_build_object('role', v_next_participant_role, 'order', 2)
    );
  END IF;

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'envelopeStatus', CASE
      WHEN v_requires_finalization THEN 'FINALIZANDO'
      ELSE 'EM_ASSINATURA'
    END,
    'participantId', v_participante.id,
    'participantRole', v_participante.papel,
    'participantOrder', v_participante.ordem,
    'participantStatus', 'ASSINADO',
    'signedAt', v_signed_at,
    'nextParticipantId', v_next_participant_id,
    'nextParticipantRole', v_next_participant_role,
    'requiresFinalization', v_requires_finalization
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
    'CONSUMIR_TICKET_REAUTENTICACAO',
    p_request_id,
    v_payload_sha256,
    v_resultado
  );
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(
  text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(
  text, uuid, uuid, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Validador público: preserva o registro legado e acrescenta apenas o
--    Diário finalizado, com PDF final íntegro. Pendentes não são enumeráveis.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_resultado jsonb;
  v_codigo text := upper(
    pg_catalog.regexp_replace(btrim(coalesce(p_codigo, '')), '\s+', '', 'g')
  );
BEGIN
  -- Ramo legado mantido literalmente compatível com o contrato público atual.
  SELECT jsonb_build_object(
    'type', dv.documento,
    'status', CASE
      WHEN dv.status = 'REVOGADO' THEN 'REVOKED'
      WHEN dv.validade_ate IS NOT NULL AND dv.validade_ate < now() THEN 'EXPIRED'
      WHEN pol.exige_vinculo_ativo
        AND upper(coalesce(m.status, '')) <> 'ATIVO' THEN 'REVOKED'
      ELSE 'ACTIVE'
    END,
    'code', dv.codigo,
    'issuedAt', dv.emitido_em,
    'lastIssuedAt', dv.ultima_emissao_em,
    'expiresAt', dv.validade_ate,
    'referencePeriod', dv.periodo_referencia,
    'issueCount', dv.quantidade_emissoes,
    'enrollmentId', dv.matricula_id,
    'studentName',
      pg_catalog.split_part(
        coalesce(aluno.nome, dv.dados_emissao ->> 'studentName', ''),
        ' ',
        1
      ) || CASE
        WHEN pg_catalog.strpos(
          coalesce(aluno.nome, dv.dados_emissao ->> 'studentName', ''),
          ' '
        ) > 0 THEN ' ' || pg_catalog.left(
          pg_catalog.split_part(
            coalesce(aluno.nome, dv.dados_emissao ->> 'studentName', ''),
            ' ',
            2
          ),
          1
        ) || '***'
        ELSE ''
      END,
    'studentCpf', '***.***.***-' || pg_catalog.right(
      pg_catalog.regexp_replace(
        coalesce(aluno.cpf_cnpj, dv.dados_emissao ->> 'studentCpf', ''),
        '\D',
        '',
        'g'
      ),
      2
    ),
    'studentBirthDate', '**/**/' || pg_catalog.left(
      coalesce(
        aluno.data_nascimento::text,
        dv.dados_emissao ->> 'studentBirthDate',
        ''
      ),
      4
    ),
    'maskedMotherName', CASE
      WHEN nullif(btrim(aluno.nome_mae), '') IS NULL THEN 'Não informado'
      ELSE pg_catalog.split_part(btrim(aluno.nome_mae), ' ', 1) || CASE
        WHEN pg_catalog.strpos(btrim(aluno.nome_mae), ' ') > 0
          THEN ' ' || pg_catalog.left(
            pg_catalog.split_part(btrim(aluno.nome_mae), ' ', 2),
            1
          ) || '***'
        ELSE ''
      END
    END,
    'maskedEnrollmentNumber', pg_catalog.left(
      public.formatar_matricula_validacao(
        dv.matricula_id,
        m.data_matricula,
        coalesce(dv.polo_id, turma.polo_id)
      ),
      greatest(
        2,
        pg_catalog.length(public.formatar_matricula_validacao(
          dv.matricula_id,
          m.data_matricula,
          coalesce(dv.polo_id, turma.polo_id)
        )) - 6
      )
    ) || '****' || pg_catalog.right(
      public.formatar_matricula_validacao(
        dv.matricula_id,
        m.data_matricula,
        coalesce(dv.polo_id, turma.polo_id)
      ),
      2
    ),
    'studentPhotoUrl', coalesce(
      aluno.foto_url,
      dv.dados_emissao ->> 'studentPhotoUrl'
    ),
    'courseName', coalesce(curso.nome, dv.dados_emissao ->> 'courseName'),
    'className', coalesce(
      turma.nome,
      turma.codigo,
      dv.dados_emissao ->> 'className'
    ),
    'institutionName', coalesce(
      empresa.razao_social,
      empresa.nome_fantasia,
      polo.nome,
      dv.dados_emissao ->> 'institutionName'
    ),
    'institutionCnpj', coalesce(
      nullif(polo.cnpj, ''),
      empresa.cnpj,
      'Não informado'
    ),
    'unitName', coalesce(polo.nome, dv.dados_emissao ->> 'unitName'),
    'enrollmentStatus', upper(
      coalesce(m.status, dv.dados_emissao ->> 'enrollmentStatus')
    ),
    'enrollmentDate', coalesce(
      m.data_matricula::text,
      dv.dados_emissao ->> 'enrollmentDate'
    )
  )
  INTO v_resultado
  FROM public.documentos_validacao AS dv
  LEFT JOIN public.matriculas AS m ON m.id = dv.matricula_id
  LEFT JOIN public.parceiros AS aluno ON aluno.id = dv.aluno_id
  LEFT JOIN public.turmas AS turma ON turma.id = m.turma_id
  LEFT JOIN public.cursos AS curso ON curso.id = turma.curso_id
  LEFT JOIN public.polos AS polo
    ON polo.id = coalesce(dv.polo_id, turma.polo_id)
  LEFT JOIN public.empresas AS empresa ON empresa.id = polo.company_id
  JOIN public.documentos_validacao_politicas AS pol
    ON pol.documento = dv.documento
  WHERE upper(dv.codigo) = upper(btrim(p_codigo))
  LIMIT 1;

  IF v_resultado IS NOT NULL THEN
    RETURN v_resultado;
  END IF;

  IF v_codigo !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'type', 'diario_classe',
    'status', CASE
      WHEN envelope.status = 'SUBSTITUIDO' THEN 'REVOKED'
      ELSE 'ACTIVE'
    END,
    'code', upper(envelope.id::text),
    'institutionName', envelope.documento_snapshot
      #>> '{institutionalIdentity,institution,name}',
    'issuedAt', envelope.finalizado_em,
    'visibleFields', jsonb_build_array('institutionName', 'issuedAt'),
    'schemaVersion', 2
  )
  INTO v_resultado
  FROM public.assinatura_eletronica_envelopes AS envelope
  JOIN public.assinatura_eletronica_artefatos AS artefato_final
    ON artefato_final.envelope_id = envelope.id
   AND artefato_final.classe = 'DOCUMENTO_FINAL'
   AND artefato_final.sha256 = envelope.documento_final_sha256
  JOIN storage.objects AS objeto_final
    ON objeto_final.bucket_id = artefato_final.bucket_id
   AND objeto_final.name = artefato_final.storage_path
  WHERE envelope.id::text = lower(v_codigo)
    AND envelope.documento = 'diario_classe'
    AND envelope.origem_tipo = 'DIARIO'
    AND envelope.status IN ('ASSINADO', 'SUBSTITUIDO')
    AND envelope.finalizado_em IS NOT NULL
    AND envelope.documento_final_sha256 ~ '^[0-9a-f]{64}$'
    AND upper(envelope.documento_snapshot ->> 'validationCode')
      = upper(envelope.id::text)
  LIMIT 1;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_documento_por_codigo(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Acervo do Gestor e autorização genérica de artefato privado.
-- ---------------------------------------------------------------------------

CREATE INDEX assinatura_eletronica_acervo_diario_idx
  ON public.assinatura_eletronica_envelopes (
    polo_id,
    documento,
    finalizado_em DESC,
    id DESC
  )
  WHERE documento = 'diario_classe'
    AND origem_tipo = 'DIARIO'
    AND status IN ('ASSINADO', 'SUBSTITUIDO')
    AND finalizado_em IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_acervo_gestor_autorizado(
  p_actor_auth_user_id uuid,
  p_context_id uuid,
  p_envelope_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.id = p_envelope_id
      AND envelope.documento = 'diario_classe'
      AND envelope.origem_tipo = 'DIARIO'
      AND public.assinatura_eletronica_gestor_actor_tem_escopo(
        p_actor_auth_user_id,
        p_context_id,
        envelope.polo_id,
        'secretaria',
        'assinatura-eletronica'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_actor_pode_acessar_artefato(
  p_actor_auth_user_id uuid,
  p_envelope_id uuid,
  p_classe text,
  p_perfil text,
  p_context_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_actor_auth_user_id IS NOT NULL
    AND p_context_id IS NOT NULL
    AND upper(btrim(coalesce(p_classe, ''))) IN (
      'DOCUMENTO_ORIGINAL',
      'DOCUMENTO_FINAL',
      'COMPROVANTE_EVIDENCIA'
    )
    AND upper(btrim(coalesce(p_perfil, ''))) IN (
      'GESTOR',
      'PROFESSOR',
      'COORDENADOR'
    )
    AND EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_envelopes AS envelope
      WHERE envelope.id = p_envelope_id
        AND envelope.documento = 'diario_classe'
        AND envelope.origem_tipo = 'DIARIO'
        AND (
          (
            upper(btrim(p_perfil)) = 'GESTOR'
            AND public.assinatura_eletronica_acervo_gestor_autorizado(
              p_actor_auth_user_id,
              p_context_id,
              envelope.id
            )
          )
          OR
          (
            upper(btrim(p_perfil)) IN ('PROFESSOR', 'COORDENADOR')
            AND upper(btrim(p_classe)) = 'DOCUMENTO_ORIGINAL'
            AND public.assinatura_eletronica_perfil_contexto_valido(
              p_actor_auth_user_id,
              upper(btrim(p_perfil)),
              p_context_id
            )
            AND EXISTS (
              SELECT 1
              FROM public.assinatura_eletronica_participantes AS participante
              WHERE participante.envelope_id = envelope.id
                AND participante.papel = upper(btrim(p_perfil))
                AND participante.contexto_tipo = upper(btrim(p_perfil))
                AND participante.contexto_id = p_context_id
                AND participante.auth_user_id = p_actor_auth_user_id
                AND (
                  (
                    upper(btrim(p_perfil)) = 'PROFESSOR'
                    AND EXISTS (
                      SELECT 1
                      FROM public.turmas_disciplinas AS vinculo
                      WHERE vinculo.turma_id = envelope.turma_id
                        AND vinculo.disciplina_id = envelope.disciplina_id
                        AND vinculo.professor_id = participante.parceiro_id
                        AND vinculo.bloqueio_diario = 'PROFESSOR'
                    )
                  )
                  OR
                  (
                    upper(btrim(p_perfil)) = 'COORDENADOR'
                    AND EXISTS (
                      SELECT 1
                      FROM public.professores_coordenacoes AS coordenacao
                      JOIN public.turmas AS turma
                        ON turma.id = envelope.turma_id
                      WHERE coordenacao.id = participante.coordenacao_id
                        AND coordenacao.professor_id = participante.parceiro_id
                        AND coordenacao.curso_id = turma.curso_id
                        AND coordenacao.polo_id = envelope.polo_id
                        AND coordenacao.status = 'ATIVA'
                        AND coordenacao.vigente_de <= statement_timestamp()
                        AND (
                          coordenacao.vigente_ate IS NULL
                          OR coordenacao.vigente_ate > statement_timestamp()
                        )
                    )
                  )
                )
            )
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_listar_acervo_gestor(
  p_context_id uuid,
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_status text DEFAULT 'TODOS',
  p_busca text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_finalizado_de timestamptz DEFAULT NULL,
  p_finalizado_ate timestamptz DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_cursor_finalizado_em timestamptz DEFAULT NULL,
  p_cursor_envelope_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_auth_session_id uuid;
  v_documento text := lower(btrim(coalesce(p_documento, 'diario_classe')));
  v_status text := upper(btrim(coalesce(p_status, 'TODOS')));
  v_busca text := nullif(
    pg_catalog.regexp_replace(
      btrim(coalesce(p_busca, '')),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_items jsonb;
  v_next jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  v_auth_session_id := public.assinatura_eletronica_sessao_jwt_ativa(v_actor);
  IF p_context_id IS NULL
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(
       v_actor,
       'GESTOR',
       p_context_id
     )
     OR NOT public.gestor_has_tab('secretaria', 'assinatura-eletronica')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ACERVO_NAO_AUTORIZADO';
  END IF;
  IF p_polo_id IS NOT NULL AND NOT public.is_gestor_for_polo(p_polo_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ACERVO_NAO_AUTORIZADO';
  END IF;
  IF v_documento <> 'diario_classe'
     OR v_status NOT IN ('TODOS', 'ASSINADO', 'SUBSTITUIDO')
     OR p_limite IS NULL
     OR p_limite NOT BETWEEN 1 AND 100
     OR ((p_cursor_finalizado_em IS NULL) <>
       (p_cursor_envelope_id IS NULL))
     OR (p_finalizado_de IS NOT NULL AND p_finalizado_ate IS NOT NULL
       AND p_finalizado_de >= p_finalizado_ate)
     OR char_length(coalesce(v_busca, '')) > 120
     OR coalesce(p_busca, '') ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_ACERVO_FILTRO_INVALIDO';
  END IF;

  WITH base AS (
    SELECT
      envelope.id,
      envelope.documento,
      envelope.titulo,
      envelope.origem_tipo,
      envelope.origem_versao,
      envelope.revisao_rotulo,
      envelope.status,
      envelope.polo_id,
      envelope.turma_id,
      envelope.disciplina_id,
      envelope.finalizado_em,
      envelope.documento_final_sha256,
      envelope.documento_snapshot,
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'role', participante.papel,
            'name', participante.identidade_snapshot ->> 'name',
            'signedAt', participante.assinado_em
          )
          ORDER BY participante.ordem
        )
        FROM public.assinatura_eletronica_participantes AS participante
        WHERE participante.envelope_id = envelope.id
          AND participante.papel IN ('PROFESSOR', 'COORDENADOR')
          AND participante.status = 'ASSINADO'
      ) AS signers
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.documento = 'diario_classe'
      AND envelope.origem_tipo = 'DIARIO'
      AND envelope.status IN ('ASSINADO', 'SUBSTITUIDO')
      AND envelope.finalizado_em IS NOT NULL
      AND envelope.documento_final_sha256 ~ '^[0-9a-f]{64}$'
      AND public.assinatura_eletronica_acervo_gestor_autorizado(
        v_actor,
        p_context_id,
        envelope.id
      )
      AND (p_polo_id IS NULL OR envelope.polo_id = p_polo_id)
      AND (p_turma_id IS NULL OR envelope.turma_id = p_turma_id)
      AND (v_status = 'TODOS' OR envelope.status = v_status)
      AND (
        p_finalizado_de IS NULL
        OR envelope.finalizado_em >= p_finalizado_de
      )
      AND (
        p_finalizado_ate IS NULL
        OR envelope.finalizado_em < p_finalizado_ate
      )
      AND (
        p_cursor_finalizado_em IS NULL
        OR (envelope.finalizado_em, envelope.id) <
          (p_cursor_finalizado_em, p_cursor_envelope_id)
      )
      AND (
        v_busca IS NULL
        OR pg_catalog.strpos(lower(envelope.titulo), lower(v_busca)) > 0
        OR pg_catalog.strpos(lower(envelope.id::text), lower(v_busca)) > 0
        OR pg_catalog.strpos(
          lower(envelope.documento_snapshot -> 'turma' ->> 'nome'),
          lower(v_busca)
        ) > 0
        OR pg_catalog.strpos(
          lower(envelope.documento_snapshot -> 'disciplina' ->> 'nome'),
          lower(v_busca)
        ) > 0
        OR EXISTS (
          SELECT 1
          FROM public.assinatura_eletronica_participantes AS participante_busca
          WHERE participante_busca.envelope_id = envelope.id
            AND participante_busca.papel IN ('PROFESSOR', 'COORDENADOR')
            AND pg_catalog.strpos(
              lower(participante_busca.identidade_snapshot ->> 'name'),
              lower(v_busca)
            ) > 0
        )
      )
      AND (
        SELECT count(*)
        FROM public.assinatura_eletronica_participantes AS participante_shape
        WHERE participante_shape.envelope_id = envelope.id
          AND participante_shape.papel IN ('PROFESSOR', 'COORDENADOR')
          AND participante_shape.status = 'ASSINADO'
          AND nullif(btrim(
            participante_shape.identidade_snapshot ->> 'name'
          ), '') IS NOT NULL
      ) = 2
      AND EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_artefatos AS artefato_final
        JOIN storage.objects AS objeto_final
          ON objeto_final.bucket_id = artefato_final.bucket_id
         AND objeto_final.name = artefato_final.storage_path
        WHERE artefato_final.envelope_id = envelope.id
          AND artefato_final.classe = 'DOCUMENTO_FINAL'
          AND artefato_final.sha256 = envelope.documento_final_sha256
      )
      AND EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_artefatos AS comprovante
        JOIN storage.objects AS objeto_comprovante
          ON objeto_comprovante.bucket_id = comprovante.bucket_id
         AND objeto_comprovante.name = comprovante.storage_path
        WHERE comprovante.envelope_id = envelope.id
          AND comprovante.classe = 'COMPROVANTE_EVIDENCIA'
      )
    ORDER BY envelope.finalizado_em DESC, envelope.id DESC
    LIMIT p_limite + 1
  ), pagina AS (
    SELECT *
    FROM base
    ORDER BY finalizado_em DESC, id DESC
    LIMIT p_limite
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'envelopeId', pagina.id,
        'documentType', pagina.documento,
        'title', pagina.titulo,
        'originType', pagina.origem_tipo,
        'originVersion', pagina.origem_versao,
        'revisionLabel', pagina.revisao_rotulo,
        'status', pagina.status,
        'poloId', pagina.polo_id,
        'finalizedAt', pagina.finalizado_em,
        'sha256', pagina.documento_final_sha256,
        'validationCode', upper(pagina.id::text),
        'turmaId', pagina.turma_id,
        'turmaNome', pagina.documento_snapshot -> 'turma' ->> 'nome',
        'disciplinaId', pagina.disciplina_id,
        'disciplinaNome', pagina.documento_snapshot
          -> 'disciplina' ->> 'nome',
        'signers', pagina.signers,
        'artifacts', jsonb_build_object('final', true, 'receipt', true)
      )
      ORDER BY pagina.finalizado_em DESC, pagina.id DESC
    ), '[]'::jsonb),
    CASE WHEN EXISTS (SELECT 1 FROM base OFFSET p_limite) THEN (
      SELECT jsonb_build_object(
        'finalizedAt', cursor_pagina.finalizado_em,
        'envelopeId', cursor_pagina.id
      )
      FROM pagina AS cursor_pagina
      ORDER BY cursor_pagina.finalizado_em ASC, cursor_pagina.id ASC
      LIMIT 1
    ) ELSE NULL END
  INTO v_items, v_next
  FROM pagina;

  RETURN jsonb_build_object('items', v_items, 'nextCursor', v_next);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_opcoes_acervo_gestor(
  p_context_id uuid,
  p_polo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_auth_session_id uuid;
  v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  v_auth_session_id := public.assinatura_eletronica_sessao_jwt_ativa(v_actor);
  IF p_context_id IS NULL
     OR p_polo_id IS NULL
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(
       v_actor,
       'GESTOR',
       p_context_id
     )
     OR NOT public.gestor_has_tab('secretaria', 'assinatura-eletronica')
     OR NOT public.is_gestor_for_polo(p_polo_id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ACERVO_NAO_AUTORIZADO';
  END IF;

  WITH ultima_turma AS (
    SELECT DISTINCT ON (envelope.turma_id)
      envelope.turma_id AS id,
      btrim(envelope.documento_snapshot -> 'turma' ->> 'nome') AS label
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.polo_id = p_polo_id
      AND envelope.documento = 'diario_classe'
      AND envelope.origem_tipo = 'DIARIO'
      AND envelope.status IN ('ASSINADO', 'SUBSTITUIDO')
      AND envelope.finalizado_em IS NOT NULL
      AND envelope.documento_final_sha256 ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof(envelope.documento_snapshot -> 'turma' -> 'nome')
        = 'string'
      AND nullif(btrim(
        envelope.documento_snapshot -> 'turma' ->> 'nome'
      ), '') IS NOT NULL
      AND char_length(btrim(
        envelope.documento_snapshot -> 'turma' ->> 'nome'
      )) <= 300
      AND public.assinatura_eletronica_acervo_gestor_autorizado(
        v_actor,
        p_context_id,
        envelope.id
      )
      AND (
        SELECT count(*)
        FROM public.assinatura_eletronica_participantes AS participante_shape
        WHERE participante_shape.envelope_id = envelope.id
          AND participante_shape.papel IN ('PROFESSOR', 'COORDENADOR')
          AND participante_shape.status = 'ASSINADO'
          AND nullif(btrim(
            participante_shape.identidade_snapshot ->> 'name'
          ), '') IS NOT NULL
      ) = 2
      AND EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_artefatos AS artefato_final
        JOIN storage.objects AS objeto_final
          ON objeto_final.bucket_id = artefato_final.bucket_id
         AND objeto_final.name = artefato_final.storage_path
        WHERE artefato_final.envelope_id = envelope.id
          AND artefato_final.classe = 'DOCUMENTO_FINAL'
          AND artefato_final.sha256 = envelope.documento_final_sha256
      )
      AND EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_artefatos AS comprovante
        JOIN storage.objects AS objeto_comprovante
          ON objeto_comprovante.bucket_id = comprovante.bucket_id
         AND objeto_comprovante.name = comprovante.storage_path
        WHERE comprovante.envelope_id = envelope.id
          AND comprovante.classe = 'COMPROVANTE_EVIDENCIA'
      )
    ORDER BY envelope.turma_id, envelope.finalizado_em DESC, envelope.id DESC
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('id', ultima_turma.id, 'label', ultima_turma.label)
    ORDER BY lower(ultima_turma.label), ultima_turma.id
  ), '[]'::jsonb)
  INTO v_items
  FROM ultima_turma;

  RETURN jsonb_build_object('items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_autorizar_artefato(
  p_envelope_id uuid,
  p_classe text,
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
  v_auth_session_id uuid;
  v_classe text := upper(btrim(coalesce(p_classe, '')));
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_artefato public.assinatura_eletronica_artefatos%ROWTYPE;
  v_file_name text;
  v_autorizado boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  v_auth_session_id := public.assinatura_eletronica_sessao_jwt_ativa(v_actor);
  IF p_envelope_id IS NULL
     OR p_context_id IS NULL
     OR v_perfil NOT IN ('GESTOR', 'PROFESSOR', 'COORDENADOR')
     OR v_classe NOT IN (
       'DOCUMENTO_ORIGINAL',
       'DOCUMENTO_FINAL',
       'COMPROVANTE_EVIDENCIA'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_ARTEFATO_ESCOPO_INVALIDO';
  END IF;

  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
    AND envelope.documento = 'diario_classe'
    AND envelope.origem_tipo = 'DIARIO';

  IF FOUND THEN
    v_autorizado :=
      public.assinatura_eletronica_actor_pode_acessar_artefato(
        v_actor,
        v_envelope.id,
        v_classe,
        v_perfil,
        p_context_id
      );
  END IF;

  IF NOT v_autorizado THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ARTEFATO_NAO_AUTORIZADO';
  END IF;
  IF v_classe IN ('DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')
     AND v_envelope.status NOT IN ('ASSINADO', 'SUBSTITUIDO')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ARTEFATO_INDISPONIVEL';
  END IF;

  SELECT artefato.*
  INTO v_artefato
  FROM public.assinatura_eletronica_artefatos AS artefato
  JOIN storage.objects AS objeto
    ON objeto.bucket_id = artefato.bucket_id
   AND objeto.name = artefato.storage_path
  WHERE artefato.envelope_id = v_envelope.id
    AND artefato.classe = v_classe;
  IF NOT FOUND
     OR (v_classe = 'DOCUMENTO_ORIGINAL'
       AND v_artefato.sha256 IS DISTINCT FROM
         v_envelope.documento_original_sha256)
     OR (v_classe = 'DOCUMENTO_FINAL'
       AND v_artefato.sha256 IS DISTINCT FROM
         v_envelope.documento_final_sha256)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ARTEFATO_INDISPONIVEL';
  END IF;

  v_file_name := CASE v_classe
    WHEN 'DOCUMENTO_ORIGINAL' THEN
      'diario-de-classe-original-' || v_envelope.id::text || '.pdf'
    WHEN 'DOCUMENTO_FINAL' THEN
      'diario-de-classe-assinado-' || v_envelope.id::text || '.pdf'
    ELSE 'comprovante-assinatura-' || v_envelope.id::text || '.pdf'
  END;

  RETURN jsonb_build_object(
    'envelopeId', v_envelope.id,
    'artifactId', v_artefato.id,
    'artifactClass', v_artefato.classe,
    'sha256', v_artefato.sha256,
    'byteSize', v_artefato.tamanho_bytes,
    'mimeType', v_artefato.mime_type,
    'fileName', v_file_name
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.assinatura_eletronica_internal_resolver_acervo(
  uuid
);

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_resolver_acervo(
  p_envelope_id uuid,
  p_classe text,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_classe text := upper(btrim(coalesce(p_classe, '')));
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_artefato public.assinatura_eletronica_artefatos%ROWTYPE;
  v_file_name text;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL
     OR p_context_id IS NULL
     OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL
     OR p_request_id IS NULL
     OR v_perfil NOT IN ('GESTOR', 'PROFESSOR', 'COORDENADOR')
     OR v_classe NOT IN (
       'DOCUMENTO_ORIGINAL',
       'DOCUMENTO_FINAL',
       'COMPROVANTE_EVIDENCIA'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_ARTEFATO_ESCOPO_INVALIDO';
  END IF;
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );

  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
    AND envelope.documento = 'diario_classe'
    AND envelope.origem_tipo = 'DIARIO';
  IF NOT FOUND
     OR NOT public.assinatura_eletronica_actor_pode_acessar_artefato(
       p_actor_auth_user_id,
       p_envelope_id,
       v_classe,
       v_perfil,
       p_context_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ARTEFATO_NAO_AUTORIZADO';
  END IF;
  IF v_classe IN ('DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')
     AND v_envelope.status NOT IN ('ASSINADO', 'SUBSTITUIDO')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ARTEFATO_INDISPONIVEL';
  END IF;

  SELECT artefato.*
  INTO v_artefato
  FROM public.assinatura_eletronica_artefatos AS artefato
  JOIN storage.objects AS objeto
    ON objeto.bucket_id = artefato.bucket_id
   AND objeto.name = artefato.storage_path
  WHERE artefato.envelope_id = v_envelope.id
    AND artefato.classe = v_classe;
  IF NOT FOUND
     OR (v_classe = 'DOCUMENTO_ORIGINAL'
       AND v_artefato.sha256 IS DISTINCT FROM
         v_envelope.documento_original_sha256)
     OR (v_classe = 'DOCUMENTO_FINAL'
       AND v_artefato.sha256 IS DISTINCT FROM
         v_envelope.documento_final_sha256)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'ASSINATURA_ARTEFATO_INDISPONIVEL';
  END IF;

  v_file_name := CASE v_classe
    WHEN 'DOCUMENTO_ORIGINAL' THEN
      'diario-de-classe-original-' || v_envelope.id::text || '.pdf'
    WHEN 'DOCUMENTO_FINAL' THEN
      'diario-de-classe-assinado-' || v_envelope.id::text || '.pdf'
    ELSE 'comprovante-assinatura-' || v_envelope.id::text || '.pdf'
  END;
  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'envelopeId', v_envelope.id,
    'artifactId', v_artefato.id,
    'artifactClass', v_artefato.classe,
    'sha256', v_artefato.sha256,
    'byteSize', v_artefato.tamanho_bytes,
    'mimeType', v_artefato.mime_type,
    'fileName', v_file_name,
    'bucketId', v_artefato.bucket_id,
    'storagePath', v_artefato.storage_path
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_acervo_gestor_autorizado(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_actor_pode_acessar_artefato(
  uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_listar_acervo_gestor(
  uuid, uuid, text, text, text, uuid, timestamptz, timestamptz,
  integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_opcoes_acervo_gestor(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autorizar_artefato(
  uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_resolver_acervo(
  uuid, text, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_listar_acervo_gestor(
  uuid, uuid, text, text, text, uuid, timestamptz, timestamptz,
  integer, timestamptz, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_opcoes_acervo_gestor(
  uuid, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_autorizar_artefato(
  uuid, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_resolver_acervo(
  uuid, text, text, uuid, uuid, uuid, uuid
) TO service_role;

COMMIT;
