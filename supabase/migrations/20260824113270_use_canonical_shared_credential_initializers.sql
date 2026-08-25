-- Os initializers passam a consumir a prova canonica somente depois que a
-- serializacao e as revalidacoes 13260 ja estao instaladas.

BEGIN;

CREATE OR REPLACE FUNCTION public.inicializar_primeiro_acesso_institucional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_eh_institucional boolean;
  v_identidade_existente_liberada boolean := false;
  v_exclude_partner_id uuid := NULL;
  v_senha_alterada_em timestamptz;
  v_auth_convidado_em timestamptz;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id
     AND NEW.primeiro_acesso_institucional_pendente IS NOT DISTINCT FROM
       OLD.primeiro_acesso_institucional_pendente
     AND NEW.senha_institucional_criada_em IS NOT DISTINCT FROM
       OLD.senha_institucional_criada_em
     AND NEW.acesso_institucional_origem IS NOT DISTINCT FROM
       OLD.acesso_institucional_origem
     AND NEW.primeiro_acesso_institucional_operacao_id IS NOT DISTINCT FROM
       OLD.primeiro_acesso_institucional_operacao_id THEN
    IF TG_TABLE_NAME <> 'parceiros' THEN
      RETURN NEW;
    ELSIF upper(coalesce(NEW.tipo, '')) = upper(coalesce(OLD.tipo, '')) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'usuarios_sistema' THEN
    v_eh_institucional := true;
  ELSE
    v_eh_institucional := upper(coalesce(NEW.tipo, '')) = 'PROFESSOR';
    v_exclude_partner_id := NEW.id;
  END IF;

  IF NOT v_eh_institucional OR NEW.auth_user_id IS NULL THEN
    IF TG_TABLE_NAME = 'usuarios_sistema' THEN
      NEW.primeiro_acesso_institucional_pendente := true;
      NEW.acesso_institucional_origem := 'CONVITE';
    ELSE
      NEW.primeiro_acesso_institucional_pendente := false;
      NEW.acesso_institucional_origem := 'NAO_INSTITUCIONAL';
    END IF;
    NEW.senha_institucional_criada_em := NULL;
    NEW.primeiro_acesso_institucional_operacao_id := NULL;
    RETURN NEW;
  END IF;

  SELECT usuario.invited_at, evento.senha_alterada_em
  INTO v_auth_convidado_em, v_senha_alterada_em
  FROM auth.users AS usuario
  LEFT JOIN public.portal_identidade_institucional_senha_eventos AS evento
    ON evento.auth_user_id = usuario.id
  WHERE usuario.id = NEW.auth_user_id;

  IF NOT FOUND THEN
    NEW.primeiro_acesso_institucional_pendente := true;
    NEW.senha_institucional_criada_em := NULL;
    NEW.acesso_institucional_origem := 'CONVITE';
    RETURN NEW;
  END IF;

  v_identidade_existente_liberada :=
    public.portal_identidade_credencial_compartilhada_liberada(
      NEW.auth_user_id,
      v_exclude_partner_id,
      NULL
    );

  IF NEW.acesso_institucional_origem = 'IDENTIDADE_EXISTENTE'
     AND v_identidade_existente_liberada THEN
    NEW.primeiro_acesso_institucional_pendente := false;
    NEW.senha_institucional_criada_em := NULL;
    NEW.primeiro_acesso_institucional_operacao_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.acesso_institucional_origem = 'SENHA_CRIADA'
     AND v_senha_alterada_em IS NOT NULL
     AND NEW.senha_institucional_criada_em IS NOT DISTINCT FROM
       v_senha_alterada_em
     AND (
       v_auth_convidado_em IS NULL
       OR v_senha_alterada_em >= v_auth_convidado_em
     ) THEN
    NEW.primeiro_acesso_institucional_pendente := false;
    RETURN NEW;
  END IF;

  IF NEW.acesso_institucional_origem = 'CONVITE'
     AND NEW.primeiro_acesso_institucional_operacao_id IS NOT NULL
     AND v_auth_convidado_em IS NOT NULL
     AND v_senha_alterada_em >= v_auth_convidado_em THEN
    NEW.primeiro_acesso_institucional_pendente := false;
    NEW.senha_institucional_criada_em := v_senha_alterada_em;
    NEW.acesso_institucional_origem := 'SENHA_CRIADA';
    RETURN NEW;
  END IF;

  NEW.primeiro_acesso_institucional_pendente := true;
  NEW.senha_institucional_criada_em := NULL;
  NEW.acesso_institucional_origem := 'CONVITE';
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.inicializar_primeiro_acesso_institucional()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inicializar_acesso_responsavel_ao_vincular_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_email text;
  v_credencial_propagada_em timestamptz :=
    pg_catalog.statement_timestamp();
  v_credencial_liberada boolean := false;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id THEN
    RETURN NEW;
  END IF;

  NEW.email_validado_gestor_em := NULL;
  NEW.troca_senha_obrigatoria := true;
  NEW.senha_temporaria_pendente := false;
  NEW.senha_temporaria_emitida_em := NULL;
  NEW.senha_atualizada_em := NULL;
  NEW.senha_temporaria_emissao_id := NULL;
  NEW.senha_temporaria_emissao_iniciada_em := NULL;
  NEW.senha_temporaria_emissao_senha_alterada_em := NULL;
  NEW.senha_temporaria_emissoes_revogadas := ARRAY[]::uuid[];
  NEW.aceitou_termos_uso := false;
  NEW.aceitou_termos_uso_em := NULL;
  NEW.termos_uso_versao := NULL;

  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lower(nullif(btrim(usuario_auth.email), ''))
  INTO v_auth_email
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = NEW.auth_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'RESPONSAVEL_AUTH_USUARIO_INEXISTENTE';
  END IF;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  v_credencial_liberada :=
    public.portal_identidade_credencial_compartilhada_liberada(
      NEW.auth_user_id,
      NULL,
      NEW.id
    );
  IF v_credencial_liberada THEN
    NEW.troca_senha_obrigatoria := false;
    -- Este instante registra a propagacao da prova entre perfis. updated_at do
    -- Auth tambem muda por metadata e nao representa uma troca real de senha.
    NEW.senha_atualizada_em := v_credencial_propagada_em;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.inicializar_acesso_responsavel_ao_vincular_auth()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
