-- O acesso assistido é um fallback para aluno sem acesso à caixa postal.
-- O estado abaixo é persistido no cadastro antes de tocar no Auth: nunca
-- depende da ordem interna de updates de senha e metadata em auth.users.

BEGIN;

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS email_validado_gestor_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emitida_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissao_id uuid,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissao_iniciada_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissoes_revogadas uuid[]
    NOT NULL DEFAULT ARRAY[]::uuid[];

-- Os novos campos de credencial/validação seguem a mesma barreira dos demais
-- campos de acesso: navegador não pode alterá-los por update direto.
CREATE OR REPLACE FUNCTION public.protect_student_access_control_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_client_direct boolean := current_user IN ('anon', 'authenticated');
  v_gestor_parceiros boolean := false;
BEGIN
  IF NOT v_client_direct THEN
    RETURN NEW;
  END IF;

  IF current_user = 'authenticated' THEN
    v_gestor_parceiros := coalesce(
      public.gestor_has_module('parceiros'),
      false
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF upper(coalesce(NEW.tipo, '')) IN ('ALUNO', 'PROFESSOR')
       AND NOT v_gestor_parceiros THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'PARCEIRO_IDENTIDADE_CRIACAO_EXIGE_FLUXO_AUTORIZADO';
    END IF;

    IF NEW.auth_user_id IS NOT NULL
       OR NEW.auth_login_email IS NOT NULL
       OR NEW.matricula_acesso IS NOT NULL
       OR coalesce(NEW.troca_senha_obrigatoria, false)
       OR coalesce(NEW.acesso_status, 'sem_acesso') <> 'sem_acesso'
       OR NEW.acesso_erro IS NOT NULL
       OR NEW.convite_enviado_em IS NOT NULL
       OR NEW.acesso_ativado_em IS NOT NULL
       OR coalesce(NEW.aceitou_termos_uso, false)
       OR NEW.aceitou_termos_uso_em IS NOT NULL
       OR NEW.termos_uso_versao IS NOT NULL
       OR NEW.email_validado_gestor_em IS NOT NULL
       OR coalesce(NEW.senha_temporaria_pendente, false)
       OR NEW.senha_temporaria_emitida_em IS NOT NULL
       OR NEW.senha_atualizada_em IS NOT NULL
       OR NEW.senha_temporaria_emissao_id IS NOT NULL
       OR NEW.senha_temporaria_emissao_iniciada_em IS NOT NULL
       OR coalesce(
         pg_catalog.cardinality(NEW.senha_temporaria_emissoes_revogadas),
         0
       ) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'PARCEIRO_CAMPOS_SENSIVEIS_EXIGEM_FLUXO_AUTORIZADO';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.auth_login_email IS DISTINCT FROM OLD.auth_login_email
     OR NEW.matricula_acesso IS DISTINCT FROM OLD.matricula_acesso
     OR NEW.troca_senha_obrigatoria IS DISTINCT FROM OLD.troca_senha_obrigatoria
     OR NEW.acesso_status IS DISTINCT FROM OLD.acesso_status
     OR NEW.acesso_erro IS DISTINCT FROM OLD.acesso_erro
     OR NEW.convite_enviado_em IS DISTINCT FROM OLD.convite_enviado_em
     OR NEW.acesso_ativado_em IS DISTINCT FROM OLD.acesso_ativado_em
     OR NEW.aceitou_termos_uso IS DISTINCT FROM OLD.aceitou_termos_uso
     OR NEW.aceitou_termos_uso_em IS DISTINCT FROM OLD.aceitou_termos_uso_em
     OR NEW.termos_uso_versao IS DISTINCT FROM OLD.termos_uso_versao
     OR (
       NEW.email_validado_gestor_em IS DISTINCT FROM OLD.email_validado_gestor_em
       AND NOT (
         NEW.email_validado_gestor_em IS NULL
         AND (
           lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM
             lower(btrim(coalesce(OLD.email, '')))
           OR lower(btrim(coalesce(NEW.auth_login_email, ''))) IS DISTINCT FROM
             lower(btrim(coalesce(OLD.auth_login_email, '')))
         )
       )
     )
     OR NEW.senha_temporaria_pendente IS DISTINCT FROM OLD.senha_temporaria_pendente
     OR NEW.senha_temporaria_emitida_em IS DISTINCT FROM OLD.senha_temporaria_emitida_em
     OR NEW.senha_atualizada_em IS DISTINCT FROM OLD.senha_atualizada_em
     OR NEW.senha_temporaria_emissao_id IS DISTINCT FROM OLD.senha_temporaria_emissao_id
     OR NEW.senha_temporaria_emissao_iniciada_em IS DISTINCT FROM OLD.senha_temporaria_emissao_iniciada_em
     OR NEW.senha_temporaria_emissoes_revogadas IS DISTINCT FROM OLD.senha_temporaria_emissoes_revogadas THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PARCEIRO_CAMPOS_SENSIVEIS_EXIGEM_FLUXO_AUTORIZADO';
  END IF;

  IF NOT v_gestor_parceiros AND (
    NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.cpf_cnpj IS DISTINCT FROM OLD.cpf_cnpj
    OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
    OR NEW.polo_ids IS DISTINCT FROM OLD.polo_ids
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PARCEIRO_ESCOPO_IDENTIDADE_EXIGE_GESTOR';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_student_access_control_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_student_access_control_fields()
  TO service_role;

-- Uma validação administrativa é específica para a identidade de acesso que
-- foi conferida. Ao trocar e-mail ou login canônico, ela não pode sobreviver.
CREATE OR REPLACE FUNCTION public.clear_manager_email_validation_on_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM
       lower(btrim(coalesce(OLD.email, '')))
     OR lower(btrim(coalesce(NEW.auth_login_email, ''))) IS DISTINCT FROM
       lower(btrim(coalesce(OLD.auth_login_email, ''))) THEN
    NEW.email_validado_gestor_em := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a10_clear_manager_email_validation_on_identity_change
  ON public.parceiros;
CREATE TRIGGER a10_clear_manager_email_validation_on_identity_change
BEFORE UPDATE OF email, auth_login_email ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.clear_manager_email_validation_on_identity_change();

REVOKE ALL ON FUNCTION public.clear_manager_email_validation_on_identity_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_manager_email_validation_on_identity_change()
  TO service_role;

-- A validação administrativa não confirma o Auth isoladamente. Ela só prova
-- que o gestor conferiu o canal; a confirmação do Auth acontece junto com a
-- senha temporária, já protegida pela reserva abaixo.
CREATE OR REPLACE FUNCTION public.portal_validar_email_aluno_por_gestor(
  p_partner_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_aluno public.parceiros%ROWTYPE;
  v_gestor_id uuid;
  v_gestor_nome text;
  v_gestor_email text;
  v_termos_versao_vigente text := public.portal_identidade_termos_versao_vigente();
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_INVALIDO';
  END IF;

  IF v_aluno.acesso_status = 'ativo'
     AND coalesce(v_aluno.troca_senha_obrigatoria, false) = false
     AND coalesce(v_aluno.aceitou_termos_uso, false) = true
     AND v_aluno.termos_uso_versao = v_termos_versao_vigente
     AND NOT (
       coalesce(v_aluno.senha_temporaria_pendente, false)
       AND (
         v_aluno.senha_temporaria_emitida_em IS NULL
         OR v_aluno.senha_atualizada_em IS NULL
         OR v_aluno.senha_atualizada_em <= v_aluno.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  -- É idempotente: uma nova tentativa não apaga a evidência já gravada para
  -- a mesma identidade de e-mail. A troca de e-mail/login limpa esse campo
  -- no trigger acima e permite uma nova validação.
  IF v_aluno.email_validado_gestor_em IS NULL THEN
    SELECT gestor.id, gestor.nome, gestor.email
      INTO v_gestor_id, v_gestor_nome, v_gestor_email
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = p_actor_auth_user_id
      AND coalesce(public.is_active_status(gestor.status), false)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
    END IF;

    UPDATE public.parceiros AS aluno
    SET
      email_validado_gestor_em = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.statement_timestamp()
    WHERE aluno.id = p_partner_id;

    -- A confirmação de titularidade só é considerada concluída se o registro
    -- de auditoria fizer parte da mesma transação.
    INSERT INTO public.sistema_eventos (
      actor_id,
      actor_nome,
      actor_email,
      actor_tipo,
      pessoa_id,
      pessoa_nome,
      pessoa_tipo,
      polo_id,
      modulo,
      entidade,
      entidade_id,
      acao,
      descricao,
      origem,
      detalhes
    )
    VALUES (
      v_gestor_id,
      v_gestor_nome,
      v_gestor_email,
      'Gestor',
      v_aluno.id,
      v_aluno.nome,
      'Aluno',
      v_aluno.polo_id,
      'Parceiros',
      'parceiros',
      v_aluno.id::text,
      'Validou e-mail para acesso assistido',
      'Registrou a validação administrativa da titularidade do e-mail de acesso do aluno.',
      'Aplicativo',
      pg_catalog.jsonb_build_object(
        'confirmationMethod',
        'manager_validated_contact'
      )
    );
  END IF;

  RETURN true;
END;
$function$;

-- A reserva serializa emissões por aluno. Não há takeover automático: uma
-- chamada Auth antiga não pode sobrescrever uma senha recém emitida.
CREATE OR REPLACE FUNCTION public.portal_reservar_emissao_senha_temporaria(
  p_partner_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_contexto jsonb;
  v_termos_versao_vigente text := public.portal_identidade_termos_versao_vigente();
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF p_partner_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PARAMETROS_INVALIDOS';
  END IF;

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND OR upper(coalesce(v_aluno.tipo, '')) <> 'ALUNO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_INVALIDO';
  END IF;

  IF v_aluno.acesso_status = 'ativo'
     AND coalesce(v_aluno.troca_senha_obrigatoria, false) = false
     AND coalesce(v_aluno.aceitou_termos_uso, false) = true
     AND v_aluno.termos_uso_versao = v_termos_versao_vigente
     AND NOT (
       coalesce(v_aluno.senha_temporaria_pendente, false)
       AND (
         v_aluno.senha_temporaria_emitida_em IS NULL
         OR v_aluno.senha_atualizada_em IS NULL
         OR v_aluno.senha_atualizada_em <= v_aluno.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  IF v_aluno.senha_temporaria_emissao_id IS NOT NULL THEN
    -- Uma emissão revogada conserva o ID com inicio nulo enquanto o Edge
    -- limpa o marcador no Auth. Nesse estado, nem o mesmo ID é reutilizável.
    RETURN v_aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL
      AND v_aluno.senha_temporaria_emissao_id = p_emissao_id;
  END IF;

  UPDATE public.parceiros AS aluno
  SET
    troca_senha_obrigatoria = true,
    acesso_status = 'pendente',
    acesso_erro = NULL,
    acesso_ativado_em = NULL,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    senha_atualizada_em = NULL,
    senha_temporaria_emissao_id = p_emissao_id,
    senha_temporaria_emissao_iniciada_em = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.statement_timestamp()
  WHERE aluno.id = p_partner_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_concluir_emissao_senha_temporaria(
  p_partner_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_contexto jsonb;
  v_auth_issue_id text;
  v_gestor_id uuid;
  v_gestor_nome text;
  v_gestor_email text;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  SELECT nullif(
    auth_user.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  )
    INTO v_auth_issue_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_aluno.auth_user_id;

  IF NOT FOUND
     OR v_aluno.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     OR v_aluno.senha_temporaria_emissao_iniciada_em IS NULL
     OR p_emissao_id = ANY(
       coalesce(
         v_aluno.senha_temporaria_emissoes_revogadas,
         ARRAY[]::uuid[]
       )
     )
     OR v_aluno.senha_atualizada_em IS NULL
     OR v_aluno.senha_atualizada_em < v_aluno.senha_temporaria_emissao_iniciada_em
     OR v_auth_issue_id IS DISTINCT FROM p_emissao_id::text THEN
    RETURN false;
  END IF;

  SELECT gestor.id, gestor.nome, gestor.email
    INTO v_gestor_id, v_gestor_nome, v_gestor_email
  FROM public.usuarios_sistema AS gestor
  WHERE gestor.auth_user_id = p_actor_auth_user_id
    AND coalesce(public.is_active_status(gestor.status), false)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;

  UPDATE public.parceiros AS aluno
  SET
    troca_senha_obrigatoria = true,
    acesso_status = 'pendente',
    acesso_erro = NULL,
    acesso_ativado_em = NULL,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = pg_catalog.clock_timestamp(),
    -- A emissão concluída também entra em limpeza: antes de outra emissão,
    -- retiramos seu marcador técnico do Auth e preservamos o UUID revogado
    -- contra qualquer retry tardio da chamada anterior.
    senha_temporaria_emissao_iniciada_em = NULL,
    senha_temporaria_emissoes_revogadas = pg_catalog.array_append(
      pg_catalog.array_remove(
        coalesce(
          aluno.senha_temporaria_emissoes_revogadas,
          ARRAY[]::uuid[]
        ),
        p_emissao_id
      ),
      p_emissao_id
    ),
    updated_at = pg_catalog.statement_timestamp()
  WHERE aluno.id = p_partner_id;

  -- Não devolvemos a senha até que o fato da emissão esteja persistido. Se a
  -- auditoria falhar, esta transação reverte a conclusão e a reserva segue
  -- disponível para reconciliação segura, sem expor o segredo.
  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
    actor_tipo,
    pessoa_id,
    pessoa_nome,
    pessoa_tipo,
    polo_id,
    modulo,
    entidade,
    entidade_id,
    acao,
    descricao,
    origem,
    detalhes
  )
  VALUES (
    v_gestor_id,
    v_gestor_nome,
    v_gestor_email,
    'Gestor',
    v_aluno.id,
    v_aluno.nome,
    'Aluno',
    v_aluno.polo_id,
    'Parceiros',
    'parceiros',
    v_aluno.id::text,
    'Emitiu senha temporária',
    'Emitiu uma senha temporária para o aluno concluir o primeiro acesso.',
    'Aplicativo',
    pg_catalog.jsonb_build_object(
      'delivery',
      'manager_assisted',
      'firstAccessRequired',
      true
    )
  );

  RETURN true;
END;
$function$;

-- Antes de enviar uma senha ao Auth, uma falha do marcador pode ser revogada
-- com segurança. A lista de UUIDs não expira automaticamente: ela impede uma
-- chamada de metadata atrasada de sobreviver à limpeza.
CREATE OR REPLACE FUNCTION public.portal_cancelar_emissao_senha_temporaria(
  p_partner_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_contexto jsonb;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_aluno.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     -- Uma emissão concluída já está em limpeza e não pode ter o timestamp
     -- de emissão apagado por um cancelamento concorrente/tardio.
     OR v_aluno.senha_temporaria_emissao_iniciada_em IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.parceiros AS aluno
  SET
    troca_senha_obrigatoria = true,
    acesso_status = 'pendente',
    acesso_erro = NULL,
    acesso_ativado_em = NULL,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    -- O ID permanece como trava de limpeza até o Edge retirar o mesmo
    -- marcador do Auth e a RPC abaixo confirmar essa leitura no banco.
    senha_temporaria_emissao_iniciada_em = NULL,
    senha_temporaria_emissoes_revogadas = pg_catalog.array_append(
      pg_catalog.array_remove(
        coalesce(
          aluno.senha_temporaria_emissoes_revogadas,
          ARRAY[]::uuid[]
        ),
        p_emissao_id
      ),
      p_emissao_id
    ),
    updated_at = pg_catalog.statement_timestamp()
  WHERE aluno.id = p_partner_id;

  RETURN true;
END;
$function$;

-- Uma emissão concluída ou revogada só libera uma nova reserva depois que o
-- Edge removeu o marcador correlato de auth.users. Esta checagem final no
-- banco elimina a corrida entre limpeza do Auth e uma nova senha temporária.
CREATE OR REPLACE FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria(
  p_partner_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_contexto jsonb;
  v_auth_issue_id text;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_aluno.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     OR v_aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL
     OR NOT (
       p_emissao_id = ANY(
         coalesce(
           v_aluno.senha_temporaria_emissoes_revogadas,
           ARRAY[]::uuid[]
         )
       )
     ) THEN
    RETURN false;
  END IF;

  SELECT nullif(
    auth_user.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  )
    INTO v_auth_issue_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_aluno.auth_user_id;

  -- A reserva só é liberada se não restar nenhum marcador. Um UUID diferente
  -- também indica estado inesperado e deve ser revisado, nunca sobrescrito.
  IF NOT FOUND OR v_auth_issue_id IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.parceiros AS aluno
  SET
    senha_temporaria_emissao_id = NULL,
    senha_temporaria_emissao_iniciada_em = NULL,
    updated_at = pg_catalog.statement_timestamp()
  WHERE aluno.id = p_partner_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_validar_email_aluno_por_gestor(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_reservar_emissao_senha_temporaria(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_concluir_emissao_senha_temporaria(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_cancelar_emissao_senha_temporaria(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_validar_email_aluno_por_gestor(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_reservar_emissao_senha_temporaria(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_concluir_emissao_senha_temporaria(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_cancelar_emissao_senha_temporaria(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_identidade_termos_versao_vigente()
  TO service_role;

-- O marcador técnico no Auth não libera o aluno; ele apenas cerca uma chamada
-- atrasada. Depois de revogar uma emissão, qualquer troca de senha ou de
-- marcador que tente reutilizar aquele UUID falha na transação de auth.users.
CREATE OR REPLACE FUNCTION public.rejeitar_emissao_senha_temporaria_revogada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_issue_text text;
  v_previous_issue_text text;
  v_issue_id uuid;
  v_aluno public.parceiros%ROWTYPE;
  v_password_changed boolean;
  v_marker_changed boolean;
BEGIN
  v_password_changed := NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password;
  v_issue_text := lower(nullif(
    NEW.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ));
  v_previous_issue_text := lower(nullif(
    OLD.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ));
  v_marker_changed := v_issue_text IS DISTINCT FROM v_previous_issue_text;

  IF NOT v_password_changed AND NOT v_marker_changed THEN
    RETURN NEW;
  END IF;

  -- Serializa com reservar/cancelar/concluir: se uma chamada Auth antiga já
  -- estiver em curso, o cancelamento aguarda; se a revogação vier antes, este
  -- trigger relê a versão bloqueada e recusa a escrita atrasada.
  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.auth_user_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Enquanto há uma emissão ativa, toda mudança de senha precisa trazer o
  -- marcador da própria reserva. Isso falha fechado se o Auth separar senha
  -- e metadata e tentar gravar a senha antes do marcador correlato.
  IF v_aluno.senha_temporaria_emissao_id IS NOT NULL
     AND v_aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL THEN
    IF v_issue_text IS NULL
       OR v_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_issue_text::uuid IS DISTINCT FROM v_aluno.senha_temporaria_emissao_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_MARCADOR_DIVERGENTE';
    END IF;
  END IF;

  -- Em limpeza, só aceitamos retirar o marcador sem trocar a senha. Uma
  -- chamada tardia não pode reutilizar o UUID nem alterar credenciais.
  IF v_aluno.senha_temporaria_emissao_id IS NOT NULL
     AND v_aluno.senha_temporaria_emissao_iniciada_em IS NULL THEN
    IF v_password_changed OR v_issue_text IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_LIMPEZA_PENDENTE';
    END IF;
    RETURN NEW;
  END IF;

  IF v_issue_text IS NULL
     OR v_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  v_issue_id := v_issue_text::uuid;
  IF v_issue_id = ANY(
    coalesce(
      v_aluno.senha_temporaria_emissoes_revogadas,
      ARRAY[]::uuid[]
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_REVOGADA';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a10_rejeitar_emissao_senha_temporaria_revogada
  ON auth.users;
CREATE TRIGGER a10_rejeitar_emissao_senha_temporaria_revogada
BEFORE UPDATE OF encrypted_password, raw_app_meta_data
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.rejeitar_emissao_senha_temporaria_revogada();

REVOKE ALL ON FUNCTION public.rejeitar_emissao_senha_temporaria_revogada()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_emissao_senha_temporaria_revogada()
  TO service_role;

-- O trigger preserva o comportamento do convite normal ao reagir também à
-- confirmação de e-mail. Para senha temporária, a reserva persistida mantém
-- a trava ativa até a troca posterior da senha pelo aluno.
CREATE OR REPLACE FUNCTION public.sync_aluno_password_reset_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated_count integer := 0;
  v_fallback_id uuid;
  v_email_normalizado text;
  v_password_changed boolean := false;
  v_email_confirmation_changed boolean := false;
  v_password_updated_at timestamptz;
BEGIN
  v_password_changed := TG_OP <> 'UPDATE'
    OR OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password;
  v_email_confirmation_changed := TG_OP <> 'UPDATE'
    OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at
    OR OLD.confirmed_at IS DISTINCT FROM NEW.confirmed_at;
  v_password_updated_at := CASE
    WHEN v_password_changed THEN pg_catalog.clock_timestamp()
    ELSE NULL
  END;

  IF coalesce(NEW.encrypted_password, '') = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_password_changed
     AND NOT v_email_confirmation_changed THEN
    RETURN NEW;
  END IF;

  UPDATE public.parceiros AS parceiro
  SET
    senha_atualizada_em = CASE
      WHEN v_password_changed THEN v_password_updated_at
      ELSE parceiro.senha_atualizada_em
    END,
    troca_senha_obrigatoria = CASE
      WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
        AND (
          parceiro.senha_temporaria_emitida_em IS NULL
          OR NOT v_password_changed
          OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
        )
        ) THEN true
      ELSE false
    END,
    acesso_status = CASE
      WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
        AND (
          parceiro.senha_temporaria_emitida_em IS NULL
          OR NOT v_password_changed
          OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
        )
        ) THEN 'pendente'
      ELSE 'ativo'
    END,
    acesso_erro = NULL,
    acesso_ativado_em = CASE
      WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
        AND (
          parceiro.senha_temporaria_emitida_em IS NULL
          OR NOT v_password_changed
          OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
        )
        ) THEN NULL
      ELSE coalesce(
        parceiro.acesso_ativado_em,
        NEW.email_confirmed_at,
        NEW.confirmed_at,
        pg_catalog.clock_timestamp()
      )
    END,
    updated_at = pg_catalog.statement_timestamp()
  WHERE parceiro.tipo = 'Aluno'
    AND parceiro.auth_user_id = NEW.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count > 0 OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_email_normalizado := lower(btrim(NEW.email));

  SELECT min(parceiro.id)
    INTO v_fallback_id
  FROM public.parceiros AS parceiro
  WHERE parceiro.tipo = 'Aluno'
    AND parceiro.auth_user_id IS NULL
    AND lower(
      btrim(
        coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        )
      )
    ) = v_email_normalizado
  HAVING count(*) = 1;

  IF v_fallback_id IS NOT NULL THEN
    UPDATE public.parceiros AS parceiro
    SET
      auth_user_id = NEW.id,
      senha_atualizada_em = CASE
        WHEN v_password_changed THEN v_password_updated_at
        ELSE parceiro.senha_atualizada_em
      END,
      troca_senha_obrigatoria = CASE
        WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
          ) THEN true
        ELSE false
      END,
      acesso_status = CASE
        WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
          ) THEN 'pendente'
        ELSE 'ativo'
      END,
      acesso_erro = NULL,
      acesso_ativado_em = CASE
        WHEN coalesce(NEW.email_confirmed_at, NEW.confirmed_at) IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
          ) THEN NULL
        ELSE coalesce(
          parceiro.acesso_ativado_em,
          NEW.email_confirmed_at,
          NEW.confirmed_at,
          pg_catalog.clock_timestamp()
        )
      END,
      updated_at = pg_catalog.statement_timestamp()
    WHERE parceiro.id = v_fallback_id
      AND parceiro.auth_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_aluno_password_reset_completion ON auth.users;
CREATE TRIGGER trg_sync_aluno_password_reset_completion
AFTER UPDATE OF encrypted_password, email_confirmed_at
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_aluno_password_reset_completion();

REVOKE ALL ON FUNCTION public.sync_aluno_password_reset_completion()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_aluno_password_reset_completion()
  TO service_role;

-- Aceitar termos continua impossível com a senha provisória, mesmo que um
-- estado legado tenha removido a flag antes da troca de senha do aluno.
CREATE OR REPLACE FUNCTION public.portal_finalizar_primeiro_acesso(
  p_context_id uuid,
  p_aceitar_termos boolean,
  p_termos_versao text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
  v_payload_sha256 text;
  v_replay jsonb;
  v_aluno public.parceiros%ROWTYPE;
  v_aceite_em timestamptz;
  v_resultado jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  IF p_context_id IS NULL OR p_request_id IS NULL
     OR nullif(btrim(coalesce(p_termos_versao, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_PARAMETROS_INVALIDOS';
  END IF;

  IF p_aceitar_termos IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_TERMOS_NAO_ACEITOS';
  END IF;

  IF btrim(p_termos_versao) IS DISTINCT FROM v_termos_versao_vigente THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_TERMOS_VERSAO_DIVERGENTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_context_id
      AND aluno.auth_user_id = v_actor
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'contextId', p_context_id,
      'aceitarTermos', true,
      'termosVersao', v_termos_versao_vigente
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'PRIMEIRO_ACESSO_FINALIZAR',
    v_payload_sha256
  );

  SELECT aluno.*
    INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_context_id
    AND aluno.auth_user_id = v_actor
    AND upper(aluno.tipo) = 'ALUNO'
    AND coalesce(public.is_active_status(aluno.status), false)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  IF coalesce(v_aluno.troca_senha_obrigatoria, false)
     OR (
       coalesce(v_aluno.senha_temporaria_pendente, false)
       AND (
         v_aluno.senha_temporaria_emitida_em IS NULL
         OR v_aluno.senha_atualizada_em IS NULL
         OR v_aluno.senha_atualizada_em <= v_aluno.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA';
  END IF;

  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF coalesce(v_aluno.aceitou_termos_uso, false)
     AND v_aluno.aceitou_termos_uso_em IS NOT NULL
     AND v_aluno.termos_uso_versao = v_termos_versao_vigente THEN
    v_aceite_em := v_aluno.aceitou_termos_uso_em;

    UPDATE public.parceiros AS aluno
    SET
      senha_temporaria_pendente = false,
      senha_temporaria_emissao_id = NULL,
      senha_temporaria_emissao_iniciada_em = NULL,
      updated_at = pg_catalog.statement_timestamp()
    WHERE aluno.id = p_context_id;
  ELSE
    v_aceite_em := pg_catalog.clock_timestamp();

    UPDATE public.parceiros AS aluno
    SET
      aceitou_termos_uso = true,
      aceitou_termos_uso_em = v_aceite_em,
      termos_uso_versao = v_termos_versao_vigente,
      senha_temporaria_pendente = false,
      senha_temporaria_emissao_id = NULL,
      senha_temporaria_emissao_iniciada_em = NULL,
      updated_at = pg_catalog.statement_timestamp()
    WHERE aluno.id = p_context_id;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'contextId', p_context_id,
    'firstAccess', pg_catalog.jsonb_build_object(
      'acceptedTermsAt', v_aceite_em,
      'acceptedTermsVersion', v_termos_versao_vigente,
      'requiresPasswordReset', false
    )
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'PRIMEIRO_ACESSO_FINALIZAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

-- O perfil público precisa refletir a mesma barreira da RLS e da finalização;
-- assim, uma flag legada isolada não faz a tela tratar senha temporária como
-- concluída antes da troca real.
CREATE OR REPLACE FUNCTION public.portal_listar_perfis()
RETURNS TABLE (
  role text,
  "contextId" uuid,
  label text,
  "homeRoute" text,
  capabilities text[],
  "poloIds" uuid[],
  "allPolos" boolean,
  "requiresPoloSelection" boolean,
  scopes jsonb,
  "firstAccess" jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  RETURN QUERY
  WITH perfis AS (
    SELECT
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN 'ALUNO'
        ELSE 'PROFESSOR'
      END AS role,
      parceiro.id AS context_id,
      parceiro.nome AS label,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN '/aluno'
        ELSE '/professor'
      END AS home_route,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN ARRAY['PORTAL_ALUNO']::text[]
        ELSE ARRAY['PORTAL_PROFESSOR']::text[]
      END AS capabilities,
      coalesce(escopo.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
      false AS all_polos,
      jsonb_build_array() AS scopes,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN pg_catalog.jsonb_build_object(
          'acceptedTermsAt', CASE
            WHEN coalesce(parceiro.aceitou_termos_uso, false)
              AND parceiro.termos_uso_versao =
                public.portal_identidade_termos_versao_vigente()
              THEN parceiro.aceitou_termos_uso_em
            ELSE NULL
          END,
          'acceptedTermsVersion', CASE
            WHEN coalesce(parceiro.aceitou_termos_uso, false)
              AND parceiro.termos_uso_versao =
                public.portal_identidade_termos_versao_vigente()
              THEN parceiro.termos_uso_versao
            ELSE NULL
          END,
          'requiresPasswordReset', (
            coalesce(parceiro.troca_senha_obrigatoria, false)
            OR (
              coalesce(parceiro.senha_temporaria_pendente, false)
              AND (
                parceiro.senha_temporaria_emitida_em IS NULL
                OR parceiro.senha_atualizada_em IS NULL
                OR parceiro.senha_atualizada_em <= parceiro.senha_temporaria_emitida_em
              )
            )
          )
        )
        ELSE NULL::jsonb
      END AS first_access,
      CASE upper(parceiro.tipo)
        WHEN 'ALUNO' THEN 20
        ELSE 30
      END AS prioridade
    FROM public.parceiros AS parceiro
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT DISTINCT polo_escopo.polo_id
        FROM pg_catalog.unnest(
          coalesce(parceiro.polo_ids, ARRAY[]::uuid[])
          || CASE
            WHEN parceiro.polo_id IS NULL THEN ARRAY[]::uuid[]
            ELSE ARRAY[parceiro.polo_id]
          END
        ) AS polo_escopo(polo_id)
        WHERE polo_escopo.polo_id IS NOT NULL
        ORDER BY polo_escopo.polo_id
      ) AS polo_ids
    ) AS escopo
    WHERE parceiro.auth_user_id = v_actor
      AND upper(parceiro.tipo) IN ('ALUNO', 'PROFESSOR')
      AND coalesce(public.is_active_status(parceiro.status), false)

    UNION ALL

    SELECT
      'RESPONSAVEL_LEGAL'::text,
      responsavel.id,
      responsavel.nome,
      '/responsavel'::text,
      ARRAY['PORTAL_RESPONSAVEL_LEGAL', 'LISTAR_DEPENDENTES']::text[],
      coalesce(escopo.polo_ids, ARRAY[]::uuid[]),
      false,
      jsonb_build_array(),
      NULL::jsonb,
      40
    FROM public.responsaveis_legais AS responsavel
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT DISTINCT polo_escopo.polo_id
        FROM public.responsaveis_legais_alunos AS vinculo
        JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
        CROSS JOIN LATERAL pg_catalog.unnest(
          coalesce(aluno.polo_ids, ARRAY[]::uuid[])
          || CASE
            WHEN aluno.polo_id IS NULL THEN ARRAY[]::uuid[]
            ELSE ARRAY[aluno.polo_id]
          END
        ) AS polo_escopo(polo_id)
        WHERE vinculo.responsavel_legal_id = responsavel.id
          AND vinculo.status = 'VERIFICADO'
          AND vinculo.vigente_de <= statement_timestamp()
          AND (
            vinculo.vigente_ate IS NULL
            OR vinculo.vigente_ate > statement_timestamp()
          )
          AND upper(aluno.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno.status), false)
          AND polo_escopo.polo_id IS NOT NULL
        ORDER BY polo_escopo.polo_id
      ) AS polo_ids
    ) AS escopo
    WHERE responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
      AND EXISTS (
        SELECT 1
        FROM public.responsaveis_legais_alunos AS vinculo_ativo
        JOIN public.parceiros AS aluno_ativo
          ON aluno_ativo.id = vinculo_ativo.aluno_id
        WHERE vinculo_ativo.responsavel_legal_id = responsavel.id
          AND vinculo_ativo.status = 'VERIFICADO'
          AND vinculo_ativo.vigente_de <= statement_timestamp()
          AND (
            vinculo_ativo.vigente_ate IS NULL
            OR vinculo_ativo.vigente_ate > statement_timestamp()
          )
          AND upper(aluno_ativo.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno_ativo.status), false)
      )

    UNION ALL

    SELECT
      'COORDENADOR'::text,
      professor.id,
      'Coordenação · ' || professor.nome,
      '/coordenador'::text,
      ARRAY[
        'PORTAL_COORDENADOR',
        'LISTAR_ATRIBUICOES',
        'ASSINATURAS_VISUALIZAR'
      ]::text[],
      escopo.polo_ids,
      false,
      escopo.scopes,
      NULL::jsonb,
      50
    FROM public.parceiros AS professor
    CROSS JOIN LATERAL (
      SELECT
        ARRAY(
          SELECT DISTINCT coordenacao_polo.polo_id
          FROM public.professores_coordenacoes AS coordenacao_polo
          JOIN public.cursos AS curso_polo
            ON curso_polo.id = coordenacao_polo.curso_id
          JOIN public.polos AS polo_ativo
            ON polo_ativo.id = coordenacao_polo.polo_id
          WHERE coordenacao_polo.professor_id = professor.id
            AND coordenacao_polo.status = 'ATIVA'
            AND (
              professor.polo_id = coordenacao_polo.polo_id
              OR coordenacao_polo.polo_id = ANY(
                coalesce(professor.polo_ids, ARRAY[]::uuid[])
              )
            )
            AND coalesce(public.is_active_status(curso_polo.status), false)
            AND coalesce(public.is_active_status(polo_ativo.status), false)
            AND coordenacao_polo.vigente_de <= statement_timestamp()
            AND (
              coordenacao_polo.vigente_ate IS NULL
              OR coordenacao_polo.vigente_ate > statement_timestamp()
            )
          ORDER BY coordenacao_polo.polo_id
        ) AS polo_ids,
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'coordenacaoId', coordenacao.id,
                'cursoId', curso.id,
                'cursoNome', curso.nome,
                'poloId', polo.id,
                'poloNome', polo.nome,
                'vigenteDe', coordenacao.vigente_de,
                'vigenteAte', coordenacao.vigente_ate
              )
              ORDER BY curso.nome, polo.nome, coordenacao.id
            )
            FROM public.professores_coordenacoes AS coordenacao
            JOIN public.cursos AS curso ON curso.id = coordenacao.curso_id
            JOIN public.polos AS polo ON polo.id = coordenacao.polo_id
            WHERE coordenacao.professor_id = professor.id
              AND coordenacao.status = 'ATIVA'
              AND (
                professor.polo_id = coordenacao.polo_id
                OR coordenacao.polo_id = ANY(
                  coalesce(professor.polo_ids, ARRAY[]::uuid[])
                )
              )
              AND coalesce(public.is_active_status(curso.status), false)
              AND coalesce(public.is_active_status(polo.status), false)
              AND coordenacao.vigente_de <= statement_timestamp()
              AND (
                coordenacao.vigente_ate IS NULL
                OR coordenacao.vigente_ate > statement_timestamp()
              )
          ),
          jsonb_build_array()
        ) AS scopes
    ) AS escopo
    WHERE professor.auth_user_id = v_actor
      AND upper(professor.tipo) = 'PROFESSOR'
      AND coalesce(public.is_active_status(professor.status), false)
      AND pg_catalog.cardinality(escopo.polo_ids) > 0

    UNION ALL

    SELECT
      'GESTOR'::text,
      gestor.id,
      gestor.nome,
      '/gestor'::text,
      ARRAY['PORTAL_GESTOR']::text[],
      ARRAY(
        SELECT polo_permitido.valor::uuid
        FROM pg_catalog.jsonb_array_elements_text(
          coalesce(
            gestor_escopo.valor -> 'poloIds',
            pg_catalog.jsonb_build_array()
          )
        ) AS polo_permitido(valor)
        ORDER BY polo_permitido.valor
      ),
      coalesce((gestor_escopo.valor ->> 'allPolos')::boolean, false),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'kind', 'GESTOR_PERMISSIONS',
          'permissions', coalesce(
            gestor_escopo.valor -> 'permissions',
            '{}'::jsonb
          )
        )
      ),
      NULL::jsonb,
      10
    FROM public.usuarios_sistema AS gestor
    CROSS JOIN LATERAL (
      SELECT public.portal_identidade_gestor_escopo_atual() AS valor
    ) AS gestor_escopo
    WHERE gestor.auth_user_id = v_actor
      AND coalesce(public.is_active_status(gestor.status), false)
      AND coalesce(public.is_gestor(), false)
  )
  SELECT
    perfil.role,
    perfil.context_id,
    perfil.label,
    perfil.home_route,
    perfil.capabilities,
    perfil.polo_ids,
    perfil.all_polos,
    pg_catalog.cardinality(perfil.polo_ids) > 1,
    perfil.scopes,
    perfil.first_access
  FROM perfis AS perfil
  ORDER BY perfil.prioridade, perfil.label, perfil.context_id;
END;
$function$;

-- A barreira também vale para toda RLS/RPC baseada na identidade do aluno,
-- evitando que o navegador contorne a página de primeiro acesso.
CREATE OR REPLACE FUNCTION public.current_aluno_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT parceiro.id
  FROM public.parceiros AS parceiro
  WHERE parceiro.auth_user_id = auth.uid()
    AND parceiro.tipo = 'Aluno'
    AND public.is_active_status(parceiro.status)
    AND coalesce(parceiro.troca_senha_obrigatoria, false) = false
    AND NOT (
      coalesce(parceiro.senha_temporaria_pendente, false)
      AND (
        parceiro.senha_temporaria_emitida_em IS NULL
        OR parceiro.senha_atualizada_em IS NULL
        OR parceiro.senha_atualizada_em <= parceiro.senha_temporaria_emitida_em
      )
    )
    AND coalesce(parceiro.aceitou_termos_uso, false) = true
    AND parceiro.termos_uso_versao =
      public.portal_identidade_termos_versao_vigente()
  ORDER BY parceiro.created_at DESC NULLS LAST
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.current_aluno_id()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_aluno_id()
  TO authenticated, service_role;

COMMIT;
