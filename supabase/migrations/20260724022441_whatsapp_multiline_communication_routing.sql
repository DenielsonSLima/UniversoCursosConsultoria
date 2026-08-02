-- Comunicação WhatsApp realmente isolada por número, com roteamento por
-- instituição/polo/setor e autorização aplicada no banco.

ALTER TABLE public.whatsapp_conexoes
  ADD COLUMN IF NOT EXISTS business_profile_cache JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_synced_at TIMESTAMPTZ;

UPDATE public.whatsapp_conexoes
SET
  app_secret = NULL,
  verify_token = NULL,
  updated_at = now()
WHERE app_secret IS NOT NULL OR verify_token IS NOT NULL;

ALTER TABLE public.whatsapp_conexoes
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_instituicao_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_status_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_connection_mode_check;

ALTER TABLE public.whatsapp_conexoes
  ADD CONSTRAINT whatsapp_conexoes_instituicao_check
    CHECK (instituicao IN ('universo', 'anhanguera', 'unopar')),
  ADD CONSTRAINT whatsapp_conexoes_status_check
    CHECK (status IN ('ativo', 'inativo')),
  ADD CONSTRAINT whatsapp_conexoes_connection_mode_check
    CHECK (connection_mode IN ('cloud_api', 'coexistence'));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conexoes_phone_number_id_unique
  ON public.whatsapp_conexoes (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conexoes_default_unique
  ON public.whatsapp_conexoes ((is_default))
  WHERE is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conexoes_matriz_financeira_unique
  ON public.whatsapp_conexoes ((is_matriz_financeira))
  WHERE is_matriz_financeira = true;

DROP POLICY IF EXISTS whatsapp_conexoes_all ON public.whatsapp_conexoes;
DROP POLICY IF EXISTS portal_whatsapp_conexoes_read ON public.whatsapp_conexoes;
DROP POLICY IF EXISTS portal_whatsapp_conexoes_write_global ON public.whatsapp_conexoes;

CREATE POLICY portal_whatsapp_conexoes_read
  ON public.whatsapp_conexoes
  FOR SELECT
  TO authenticated
  USING (public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'));

CREATE POLICY portal_whatsapp_conexoes_write_global
  ON public.whatsapp_conexoes
  FOR ALL
  TO authenticated
  USING (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  )
  WITH CHECK (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  );

DO $$
DECLARE
  v_default_connection UUID;
BEGIN
  SELECT id
  INTO v_default_connection
  FROM public.whatsapp_conexoes
  ORDER BY is_default DESC NULLS LAST, created_at
  LIMIT 1;

  IF v_default_connection IS NULL THEN
    RAISE EXCEPTION 'É necessário cadastrar ao menos uma conexão WhatsApp.';
  END IF;

  UPDATE public.whatsapp_conversas
  SET conexao_id = v_default_connection
  WHERE conexao_id IS NULL;
END;
$$;

ALTER TABLE public.whatsapp_conversas
  ALTER COLUMN conexao_id SET NOT NULL,
  ALTER COLUMN setor SET NOT NULL,
  ALTER COLUMN instituicao SET NOT NULL,
  ALTER COLUMN status_atendimento SET NOT NULL;

ALTER TABLE public.whatsapp_conversas
  DROP CONSTRAINT IF EXISTS whatsapp_conversas_telefone_unique,
  DROP CONSTRAINT IF EXISTS whatsapp_conversas_setor_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conversas_instituicao_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conversas_status_atendimento_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conversas_csat_score_check;

DROP INDEX IF EXISTS public.whatsapp_conversas_telefone_unique;

ALTER TABLE public.whatsapp_conversas
  ADD CONSTRAINT whatsapp_conversas_setor_check
    CHECK (
      setor IN (
        'pedagogico_coordenacao',
        'financeiro',
        'comercial_matriculas',
        'secretaria',
        'atendimento_geral'
      )
    ),
  ADD CONSTRAINT whatsapp_conversas_instituicao_check
    CHECK (instituicao IN ('universo', 'anhanguera', 'unopar')),
  ADD CONSTRAINT whatsapp_conversas_status_atendimento_check
    CHECK (
      status_atendimento IN (
        'bot_triagem',
        'pendente_setor',
        'em_atendimento',
        'redirecionado_externo',
        'solucionada',
        'aguardando_avaliacao'
      )
    ),
  ADD CONSTRAINT whatsapp_conversas_csat_score_check
    CHECK (csat_score IS NULL OR csat_score BETWEEN 1 AND 5),
  ADD CONSTRAINT whatsapp_conversas_conexao_telefone_unique
    UNIQUE (conexao_id, telefone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_conexao_ultima_data
  ON public.whatsapp_conversas (conexao_id, ultima_data DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_routing
  ON public.whatsapp_conversas
    (conexao_id, polo_id, setor, status_atendimento, ultima_data DESC);

ALTER TABLE public.whatsapp_flow_settings
  ADD COLUMN IF NOT EXISTS conexao_id UUID
    REFERENCES public.whatsapp_conexoes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'institutional',
  ADD COLUMN IF NOT EXISTS routing_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_flow_settings
  DROP CONSTRAINT IF EXISTS whatsapp_flow_settings_flow_type_check;

ALTER TABLE public.whatsapp_flow_settings
  ADD CONSTRAINT whatsapp_flow_settings_flow_type_check
    CHECK (flow_type IN ('universo_main', 'institutional'));

DO $$
DECLARE
  v_default_connection UUID;
BEGIN
  SELECT id
  INTO v_default_connection
  FROM public.whatsapp_conexoes
  ORDER BY is_default DESC NULLS LAST, created_at
  LIMIT 1;

  UPDATE public.whatsapp_flow_settings
  SET
    conexao_id = v_default_connection,
    scope = 'connection:' || v_default_connection::text,
    flow_type = 'universo_main',
    menu_message =
      E'Olá! Sou o *Uni*, assistente virtual da *Universo Cursos e Consultoria*.\nComo posso ajudar?\n\n1️⃣ Já sou aluno\n2️⃣ Quero me matricular\n3️⃣ Financeiro\n4️⃣ Cursos disponíveis\n5️⃣ Falar com atendente',
    fallback_message =
      E'Não consegui entender sua resposta. Envie o número de uma das opções apresentadas.'
  WHERE conexao_id IS NULL;

  INSERT INTO public.whatsapp_flow_settings (
    scope,
    conexao_id,
    flow_type,
    enabled,
    menu_message,
    welcome_message,
    fallback_message,
    handoff_message
  )
  SELECT
    'connection:' || connection.id::text,
    connection.id,
    CASE
      WHEN connection.is_default THEN 'universo_main'
      ELSE 'institutional'
    END,
    false,
    CASE
      WHEN connection.is_default THEN
        E'Olá! Sou o *Uni*, assistente virtual da *Universo Cursos e Consultoria*.\nComo posso ajudar?\n\n1️⃣ Já sou aluno\n2️⃣ Quero me matricular\n3️⃣ Financeiro\n4️⃣ Cursos disponíveis\n5️⃣ Falar com atendente'
      ELSE
        E'Olá! Você está falando com o atendimento desta instituição.\n\n1️⃣ Boleto ou link de pagamento\n2️⃣ PIX Copia e Cola\n3️⃣ Declaração para IRPF\n4️⃣ Falar com atendente'
    END,
    E'Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.',
    E'Não consegui entender sua resposta. Envie o número de uma das opções apresentadas.',
    E'Certo. Seu atendimento foi encaminhado para a equipe responsável. Em breve alguém continuará por aqui.'
  FROM public.whatsapp_conexoes connection
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_flow_settings settings
    WHERE settings.conexao_id = connection.id
  );
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_flow_settings_conexao_unique
  ON public.whatsapp_flow_settings (conexao_id);

ALTER TABLE public.whatsapp_flow_settings
  ALTER COLUMN conexao_id SET NOT NULL;

DROP POLICY IF EXISTS portal_whatsapp_flow_settings_gestor
  ON public.whatsapp_flow_settings;
DROP POLICY IF EXISTS portal_whatsapp_flow_settings_read
  ON public.whatsapp_flow_settings;
DROP POLICY IF EXISTS portal_whatsapp_flow_settings_write_global
  ON public.whatsapp_flow_settings;

CREATE POLICY portal_whatsapp_flow_settings_read
  ON public.whatsapp_flow_settings
  FOR SELECT
  TO authenticated
  USING (public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'));

CREATE POLICY portal_whatsapp_flow_settings_write_global
  ON public.whatsapp_flow_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  )
  WITH CHECK (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  );

CREATE OR REPLACE FUNCTION public.whatsapp_close_stale_handoffs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed INTEGER := 0;
BEGIN
  WITH due AS (
    SELECT conversa.id
    FROM public.whatsapp_conversas conversa
    JOIN public.whatsapp_flow_sessions session
      ON session.conversa_id = conversa.id
    JOIN public.whatsapp_flow_settings settings
      ON settings.conexao_id = conversa.conexao_id
    WHERE settings.enabled = true
      AND settings.auto_close_enabled = true
      AND conversa.status = 'aberta'
      AND (
        session.handoff_required = true
        OR session.status = 'handoff'
      )
      AND conversa.ultima_data
        <= now() - make_interval(hours => settings.auto_close_hours)
    FOR UPDATE OF conversa SKIP LOCKED
  ),
  closed AS (
    UPDATE public.whatsapp_conversas conversa
    SET
      status = 'arquivada',
      unread_count = 0,
      closed_at = now(),
      closed_reason = 'inactivity',
      updated_at = now()
    FROM due
    WHERE conversa.id = due.id
    RETURNING conversa.id
  )
  UPDATE public.whatsapp_flow_sessions session
  SET
    status = 'closed',
    handoff_required = false,
    data = COALESCE(session.data, '{}'::jsonb) || jsonb_build_object(
      'closedReason',
      'inactivity',
      'closedAt',
      now()
    ),
    updated_at = now()
  FROM closed
  WHERE session.conversa_id = closed.id;

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_close_stale_handoffs()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_close_stale_handoffs()
  TO service_role;

ALTER TABLE public.usuarios_sistema
  DROP CONSTRAINT IF EXISTS usuarios_sistema_setor_comunicacao_check;

ALTER TABLE public.usuarios_sistema
  ADD CONSTRAINT usuarios_sistema_setor_comunicacao_check
    CHECK (
      setor_comunicacao IS NULL
      OR setor_comunicacao IN (
        'todos',
        'pedagogico_coordenacao',
        'financeiro',
        'comercial_matriculas',
        'secretaria',
        'atendimento_geral'
      )
    );

CREATE OR REPLACE FUNCTION public.whatsapp_gestor_can_access(
  p_setor TEXT,
  p_polo_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')
    AND EXISTS (
      SELECT 1
      FROM public.usuarios_sistema usuario
      WHERE lower(usuario.email) = public.auth_email()
        AND public.is_active_status(usuario.status)
        AND (
          COALESCE(usuario.pode_visualizar_todos_setores, false)
          OR (
            (
              usuario.polo_comunicacao_id IS NULL
              OR usuario.polo_comunicacao_id = p_polo_id
            )
            AND (
              COALESCE(usuario.setor_comunicacao, 'todos') = 'todos'
              OR usuario.setor_comunicacao = COALESCE(
                p_setor,
                'atendimento_geral'
              )
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.whatsapp_gestor_can_access(TEXT, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_gestor_can_access(TEXT, UUID)
  TO authenticated, service_role;

DROP POLICY IF EXISTS portal_whatsapp_conversas_gestor
  ON public.whatsapp_conversas;
DROP POLICY IF EXISTS portal_whatsapp_conversas_scoped_gestor
  ON public.whatsapp_conversas;
CREATE POLICY portal_whatsapp_conversas_scoped_gestor
  ON public.whatsapp_conversas
  FOR ALL
  TO authenticated
  USING (public.whatsapp_gestor_can_access(setor, polo_id))
  WITH CHECK (public.whatsapp_gestor_can_access(setor, polo_id));

DROP POLICY IF EXISTS portal_whatsapp_mensagens_gestor
  ON public.whatsapp_mensagens;
DROP POLICY IF EXISTS portal_whatsapp_mensagens_scoped_gestor
  ON public.whatsapp_mensagens;
CREATE POLICY portal_whatsapp_mensagens_scoped_gestor
  ON public.whatsapp_mensagens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversas conversa
      WHERE conversa.id = whatsapp_mensagens.conversa_id
        AND public.whatsapp_gestor_can_access(
          conversa.setor,
          conversa.polo_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversas conversa
      WHERE conversa.id = whatsapp_mensagens.conversa_id
        AND public.whatsapp_gestor_can_access(
          conversa.setor,
          conversa.polo_id
        )
    )
  );

DROP POLICY IF EXISTS portal_whatsapp_flow_sessions_gestor
  ON public.whatsapp_flow_sessions;
DROP POLICY IF EXISTS portal_whatsapp_flow_sessions_scoped_gestor
  ON public.whatsapp_flow_sessions;
CREATE POLICY portal_whatsapp_flow_sessions_scoped_gestor
  ON public.whatsapp_flow_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversas conversa
      WHERE conversa.id = whatsapp_flow_sessions.conversa_id
        AND public.whatsapp_gestor_can_access(
          conversa.setor,
          conversa.polo_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversas conversa
      WHERE conversa.id = whatsapp_flow_sessions.conversa_id
        AND public.whatsapp_gestor_can_access(
          conversa.setor,
          conversa.polo_id
        )
    )
  );

DROP POLICY IF EXISTS portal_whatsapp_flow_events_gestor_read
  ON public.whatsapp_flow_events;
DROP POLICY IF EXISTS portal_whatsapp_flow_events_scoped_gestor_read
  ON public.whatsapp_flow_events;
CREATE POLICY portal_whatsapp_flow_events_scoped_gestor_read
  ON public.whatsapp_flow_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversas conversa
      WHERE conversa.id = whatsapp_flow_events.conversa_id
        AND public.whatsapp_gestor_can_access(
          conversa.setor,
          conversa.polo_id
        )
    )
  );

CREATE OR REPLACE FUNCTION public.whatsapp_get_connection_secret(
  p_connection_id UUID,
  p_secret_kind TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
  v_secret_name TEXT;
BEGIN
  IF p_secret_kind NOT IN ('access_token', 'app_secret', 'verify_token') THEN
    RAISE EXCEPTION 'Tipo de segredo WhatsApp não permitido.';
  END IF;

  v_secret_name :=
    'whatsapp_connection_'
    || replace(p_connection_id::text, '-', '')
    || '_'
    || p_secret_kind;

  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = v_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_set_connection_secret(
  p_connection_id UUID,
  p_secret_kind TEXT,
  p_secret_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_secret_name TEXT;
BEGIN
  IF p_secret_kind NOT IN ('access_token', 'app_secret', 'verify_token') THEN
    RAISE EXCEPTION 'Tipo de segredo WhatsApp não permitido.';
  END IF;
  IF NULLIF(btrim(p_secret_value), '') IS NULL THEN
    RAISE EXCEPTION 'O segredo WhatsApp não pode ficar vazio.';
  END IF;

  v_secret_name :=
    'whatsapp_connection_'
    || replace(p_connection_id::text, '-', '')
    || '_'
    || p_secret_kind;

  SELECT id
  INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret_value,
      v_secret_name,
      'Segredo isolado por conexão WhatsApp'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      v_secret_name,
      'Segredo isolado por conexão WhatsApp'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_get_connection_secret(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_set_connection_secret(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_get_connection_secret(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_set_connection_secret(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON COLUMN public.whatsapp_conexoes.app_secret IS
  'Legado: segredo real fica no Vault, isolado por conexao.';
COMMENT ON COLUMN public.whatsapp_conexoes.verify_token IS
  'Legado: segredo real fica no Vault, isolado por conexao.';
