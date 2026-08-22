-- Convites de Gestor/Professor não concedem acesso antes da criação da senha.
-- A liberação é persistida e só nasce de password_changed ou de uma identidade
-- preexistente cuja prova esteja em outro perfil interno já liberado.

BEGIN;

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS primeiro_acesso_institucional_pendente boolean,
  ADD COLUMN IF NOT EXISTS senha_institucional_criada_em timestamptz,
  ADD COLUMN IF NOT EXISTS acesso_institucional_origem text,
  ADD COLUMN IF NOT EXISTS primeiro_acesso_institucional_operacao_id uuid;

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS primeiro_acesso_institucional_pendente boolean,
  ADD COLUMN IF NOT EXISTS senha_institucional_criada_em timestamptz,
  ADD COLUMN IF NOT EXISTS acesso_institucional_origem text,
  ADD COLUMN IF NOT EXISTS primeiro_acesso_institucional_operacao_id uuid;

-- O ledger não é exposto pela API. Seu único escritor é o trigger de Auth;
-- assim, encrypted_password preenchido no convite nunca equivale à senha criada.
CREATE TABLE IF NOT EXISTS public.portal_identidade_institucional_senha_eventos (
  auth_user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  senha_alterada_em timestamptz NOT NULL
);

ALTER TABLE public.portal_identidade_institucional_senha_eventos
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_identidade_institucional_senha_eventos
  FROM PUBLIC, anon, authenticated, service_role;

-- Perfis anteriores à barreira são compatíveis por uma origem explícita.
UPDATE public.usuarios_sistema
SET
  primeiro_acesso_institucional_pendente = false,
  senha_institucional_criada_em = NULL,
  acesso_institucional_origem = 'LEGADO',
  primeiro_acesso_institucional_operacao_id = NULL;

UPDATE public.parceiros
SET
  primeiro_acesso_institucional_pendente = false,
  senha_institucional_criada_em = NULL,
  acesso_institucional_origem = CASE
    WHEN upper(coalesce(tipo, '')) = 'PROFESSOR' THEN 'LEGADO'
    ELSE 'NAO_INSTITUCIONAL'
  END,
  primeiro_acesso_institucional_operacao_id = NULL;

ALTER TABLE public.usuarios_sistema
  ALTER COLUMN primeiro_acesso_institucional_pendente SET DEFAULT true,
  ALTER COLUMN primeiro_acesso_institucional_pendente SET NOT NULL,
  ALTER COLUMN acesso_institucional_origem SET DEFAULT 'CONVITE',
  ALTER COLUMN acesso_institucional_origem SET NOT NULL,
  ADD CONSTRAINT usuarios_sistema_acesso_institucional_estado_check CHECK (
    (acesso_institucional_origem = 'CONVITE'
      AND primeiro_acesso_institucional_pendente
      AND senha_institucional_criada_em IS NULL)
    OR (acesso_institucional_origem = 'SENHA_CRIADA'
      AND NOT primeiro_acesso_institucional_pendente
      AND senha_institucional_criada_em IS NOT NULL)
    OR (acesso_institucional_origem IN ('LEGADO', 'IDENTIDADE_EXISTENTE')
      AND NOT primeiro_acesso_institucional_pendente)
  );

ALTER TABLE public.parceiros
  ALTER COLUMN primeiro_acesso_institucional_pendente SET DEFAULT false,
  ALTER COLUMN primeiro_acesso_institucional_pendente SET NOT NULL,
  ALTER COLUMN acesso_institucional_origem SET DEFAULT 'NAO_INSTITUCIONAL',
  ALTER COLUMN acesso_institucional_origem SET NOT NULL,
  ADD CONSTRAINT parceiros_acesso_institucional_estado_check CHECK (
    (acesso_institucional_origem = 'CONVITE'
      AND primeiro_acesso_institucional_pendente
      AND senha_institucional_criada_em IS NULL)
    OR (acesso_institucional_origem = 'SENHA_CRIADA'
      AND NOT primeiro_acesso_institucional_pendente
      AND senha_institucional_criada_em IS NOT NULL)
    OR (acesso_institucional_origem IN (
        'LEGADO', 'IDENTIDADE_EXISTENTE', 'NAO_INSTITUCIONAL'
      ) AND NOT primeiro_acesso_institucional_pendente)
  );

CREATE OR REPLACE FUNCTION public.inicializar_primeiro_acesso_institucional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_eh_institucional boolean;
  v_identidade_existente_liberada boolean := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor_existente
    WHERE gestor_existente.auth_user_id = NEW.auth_user_id
      AND coalesce(public.is_active_status(gestor_existente.status), false)
      AND NOT gestor_existente.primeiro_acesso_institucional_pendente
      AND gestor_existente.acesso_institucional_origem IN (
        'LEGADO', 'IDENTIDADE_EXISTENTE', 'SENHA_CRIADA'
      )
      AND (
        TG_TABLE_NAME <> 'usuarios_sistema'
        OR gestor_existente.id IS DISTINCT FROM NEW.id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro_existente
    WHERE parceiro_existente.auth_user_id = NEW.auth_user_id
      AND coalesce(public.is_active_status(parceiro_existente.status), false)
      AND (
        TG_TABLE_NAME <> 'parceiros'
        OR parceiro_existente.id IS DISTINCT FROM NEW.id
      )
      AND (
        (
          upper(coalesce(parceiro_existente.tipo, '')) = 'PROFESSOR'
          AND NOT parceiro_existente.primeiro_acesso_institucional_pendente
          AND parceiro_existente.acesso_institucional_origem IN (
            'LEGADO', 'IDENTIDADE_EXISTENTE', 'SENHA_CRIADA'
          )
        )
        OR (
          upper(coalesce(parceiro_existente.tipo, '')) <> 'PROFESSOR'
          AND NOT coalesce(
            parceiro_existente.troca_senha_obrigatoria, false
          )
          AND NOT (
            coalesce(parceiro_existente.senha_temporaria_pendente, false)
            AND (
              parceiro_existente.senha_temporaria_emitida_em IS NULL
              OR parceiro_existente.senha_atualizada_em IS NULL
              OR parceiro_existente.senha_atualizada_em <=
                parceiro_existente.senha_temporaria_emitida_em
            )
          )
        )
      )
  ) INTO v_identidade_existente_liberada;

  IF NEW.acesso_institucional_origem = 'IDENTIDADE_EXISTENTE'
     AND v_identidade_existente_liberada THEN
    NEW.primeiro_acesso_institucional_pendente := false;
    NEW.senha_institucional_criada_em := NULL;
    NEW.primeiro_acesso_institucional_operacao_id := NULL;
    RETURN NEW;
  END IF;

  -- Esta igualdade só pode ser produzida pelo trigger do ledger de Auth.
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

  -- Cobre a corrida em que password_changed ocorreu entre o convite e o
  -- vínculo interno. operation_id é escrito pela Edge, e o tempo vem do Auth.
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

CREATE OR REPLACE FUNCTION public.proteger_estado_primeiro_acesso_institucional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (
      TG_TABLE_NAME = 'usuarios_sistema'
      AND (
        NEW.acesso_institucional_origem <> 'CONVITE'
        OR NOT NEW.primeiro_acesso_institucional_pendente
        OR NEW.senha_institucional_criada_em IS NOT NULL
        OR NEW.primeiro_acesso_institucional_operacao_id IS NOT NULL
      )
    ) OR (
      TG_TABLE_NAME = 'parceiros'
      AND (
        NEW.acesso_institucional_origem <> 'NAO_INSTITUCIONAL'
        OR NEW.primeiro_acesso_institucional_pendente
        OR NEW.senha_institucional_criada_em IS NOT NULL
        OR NEW.primeiro_acesso_institucional_operacao_id IS NOT NULL
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'PRIMEIRO_ACESSO_INSTITUCIONAL_ESTADO_PROTEGIDO';
    END IF;
  ELSIF NEW.primeiro_acesso_institucional_pendente IS DISTINCT FROM
          OLD.primeiro_acesso_institucional_pendente
     OR NEW.senha_institucional_criada_em IS DISTINCT FROM
          OLD.senha_institucional_criada_em
     OR NEW.acesso_institucional_origem IS DISTINCT FROM
          OLD.acesso_institucional_origem
     OR NEW.primeiro_acesso_institucional_operacao_id IS DISTINCT FROM
          OLD.primeiro_acesso_institucional_operacao_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRIMEIRO_ACESSO_INSTITUCIONAL_ESTADO_PROTEGIDO';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a05_proteger_estado_primeiro_acesso_institucional
  ON public.usuarios_sistema;
CREATE TRIGGER a05_proteger_estado_primeiro_acesso_institucional
BEFORE INSERT OR UPDATE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.proteger_estado_primeiro_acesso_institucional();

DROP TRIGGER IF EXISTS a05_proteger_estado_primeiro_acesso_institucional
  ON public.parceiros;
CREATE TRIGGER a05_proteger_estado_primeiro_acesso_institucional
BEFORE INSERT OR UPDATE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.proteger_estado_primeiro_acesso_institucional();

DROP TRIGGER IF EXISTS zz10_inicializar_primeiro_acesso_institucional
  ON public.usuarios_sistema;
CREATE TRIGGER zz10_inicializar_primeiro_acesso_institucional
BEFORE INSERT OR UPDATE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.inicializar_primeiro_acesso_institucional();

DROP TRIGGER IF EXISTS zz10_inicializar_primeiro_acesso_institucional
  ON public.parceiros;
CREATE TRIGGER zz10_inicializar_primeiro_acesso_institucional
BEFORE INSERT OR UPDATE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.inicializar_primeiro_acesso_institucional();

REVOKE ALL ON FUNCTION public.inicializar_primeiro_acesso_institucional()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.proteger_estado_primeiro_acesso_institucional()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_primeiro_acesso_institucional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_senha_criada_em timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF OLD.encrypted_password IS NOT DISTINCT FROM NEW.encrypted_password
     OR coalesce(NEW.encrypted_password, '') = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.portal_identidade_institucional_senha_eventos (
    auth_user_id,
    senha_alterada_em
  ) VALUES (NEW.id, v_senha_criada_em)
  ON CONFLICT (auth_user_id) DO UPDATE
  SET senha_alterada_em = EXCLUDED.senha_alterada_em;

  UPDATE public.usuarios_sistema AS gestor
  SET
    primeiro_acesso_institucional_pendente = false,
    senha_institucional_criada_em = v_senha_criada_em,
    acesso_institucional_origem = 'SENHA_CRIADA'
  WHERE gestor.auth_user_id = NEW.id
    AND (
      gestor.primeiro_acesso_institucional_pendente
      OR gestor.acesso_institucional_origem = 'CONVITE'
    );

  UPDATE public.parceiros AS professor
  SET
    primeiro_acesso_institucional_pendente = false,
    senha_institucional_criada_em = v_senha_criada_em,
    acesso_institucional_origem = 'SENHA_CRIADA'
  WHERE professor.auth_user_id = NEW.id
    AND upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
    AND (
      professor.primeiro_acesso_institucional_pendente
      OR professor.acesso_institucional_origem = 'CONVITE'
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz20_sincronizar_primeiro_acesso_institucional
  ON auth.users;
CREATE TRIGGER zz20_sincronizar_primeiro_acesso_institucional
AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_primeiro_acesso_institucional();

REVOKE ALL ON FUNCTION public.sincronizar_primeiro_acesso_institucional()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_identidade_institucional_acesso_liberado(
  p_auth_user_id uuid,
  p_perfil text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE upper(btrim(coalesce(p_perfil, '')))
    WHEN 'GESTOR' THEN EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.auth_user_id = p_auth_user_id
        AND coalesce(public.is_active_status(gestor.status), false)
        AND NOT gestor.primeiro_acesso_institucional_pendente
        AND (
          gestor.acesso_institucional_origem IN (
            'LEGADO', 'IDENTIDADE_EXISTENTE'
          )
          OR (
            gestor.acesso_institucional_origem = 'SENHA_CRIADA'
            AND gestor.senha_institucional_criada_em IS NOT NULL
          )
        )
    )
    WHEN 'PROFESSOR' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      WHERE professor.auth_user_id = p_auth_user_id
        AND upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
        AND coalesce(public.is_active_status(professor.status), false)
        AND NOT professor.primeiro_acesso_institucional_pendente
        AND (
          professor.acesso_institucional_origem IN (
            'LEGADO', 'IDENTIDADE_EXISTENTE'
          )
          OR (
            professor.acesso_institucional_origem = 'SENHA_CRIADA'
            AND professor.senha_institucional_criada_em IS NOT NULL
          )
        )
    )
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_identidade_institucional_acesso_liberado(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.portal_identidade_institucional_acesso_liberado(uuid, text)
  TO service_role;

COMMIT;
