-- Serializa mudancas no estado da credencial compartilhada e revalida a prova
-- depois dos inicializadores. Nenhum trigger tenta impor ordem de row locks
-- depois que o proprio alvo ja foi travado pelo comando.

BEGIN;

CREATE OR REPLACE FUNCTION
  public.portal_identidade_serializar_credencial_compartilhada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_auth_user_id uuid;
  v_new_auth_user_id uuid;
  v_primeiro uuid;
  v_segundo uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_auth_user_id := OLD.auth_user_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_auth_user_id := NEW.auth_user_id;
  END IF;

  IF v_old_auth_user_id IS NOT NULL
     AND v_new_auth_user_id IS NOT NULL
     AND v_old_auth_user_id IS DISTINCT FROM v_new_auth_user_id THEN
    IF v_old_auth_user_id::text < v_new_auth_user_id::text THEN
      v_primeiro := v_old_auth_user_id;
      v_segundo := v_new_auth_user_id;
    ELSE
      v_primeiro := v_new_auth_user_id;
      v_segundo := v_old_auth_user_id;
    END IF;
  ELSE
    v_primeiro := coalesce(v_new_auth_user_id, v_old_auth_user_id);
  END IF;

  IF v_primeiro IS NOT NULL AND NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_primeiro::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;
  IF v_segundo IS NOT NULL AND NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_segundo::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_identidade_serializar_credencial_compartilhada()
  FROM PUBLIC, anon, authenticated, service_role;

-- a04 pega somente a advisory da credencial. Como a linha alvo ja foi travada
-- pelo executor, concorrencia falha com 40001 em vez de esperar e formar ciclo.
DROP TRIGGER IF EXISTS a04_guardar_promocao_credencial_compartilhada
  ON public.parceiros;
DROP TRIGGER IF EXISTS a04_serializar_credencial_compartilhada
  ON public.parceiros;
CREATE TRIGGER a04_serializar_credencial_compartilhada
BEFORE INSERT OR DELETE OR UPDATE OF
  auth_user_id, tipo, status, acesso_status, troca_senha_obrigatoria,
  senha_temporaria_pendente, senha_temporaria_emitida_em, senha_atualizada_em,
  primeiro_acesso_institucional_pendente, acesso_institucional_origem,
  senha_institucional_criada_em
ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION
  public.portal_identidade_serializar_credencial_compartilhada();

DROP TRIGGER IF EXISTS a04_guardar_promocao_credencial_compartilhada
  ON public.usuarios_sistema;
DROP TRIGGER IF EXISTS a04_serializar_credencial_compartilhada
  ON public.usuarios_sistema;
CREATE TRIGGER a04_serializar_credencial_compartilhada
BEFORE INSERT OR DELETE OR UPDATE OF
  auth_user_id, status, primeiro_acesso_institucional_pendente,
  acesso_institucional_origem, senha_institucional_criada_em
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION
  public.portal_identidade_serializar_credencial_compartilhada();

DROP TRIGGER IF EXISTS a04_guardar_promocao_credencial_compartilhada
  ON public.responsaveis_legais;
DROP TRIGGER IF EXISTS a04_serializar_credencial_compartilhada
  ON public.responsaveis_legais;
CREATE TRIGGER a04_serializar_credencial_compartilhada
BEFORE INSERT OR DELETE OR UPDATE OF
  auth_user_id, status, troca_senha_obrigatoria, senha_temporaria_pendente,
  senha_temporaria_emitida_em, senha_atualizada_em
ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION
  public.portal_identidade_serializar_credencial_compartilhada();

CREATE OR REPLACE FUNCTION public.portal_identidade_guardar_promocao_credencial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_promocao boolean := false;
  v_tem_outro_perfil boolean := false;
  v_conclusao_credencial boolean := false;
  v_credencial_liberada boolean := false;
BEGIN
  IF NEW.auth_user_id IS NULL
     OR upper(btrim(coalesce(NEW.tipo, ''))) <> 'ALUNO' THEN
    RETURN NEW;
  END IF;

  v_promocao := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    v_promocao := OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id
      OR OLD.tipo IS DISTINCT FROM NEW.tipo
      OR (
        lower(btrim(coalesce(NEW.acesso_status, ''))) = 'ativo'
        AND NOT coalesce(NEW.troca_senha_obrigatoria, false)
        AND (
          lower(btrim(coalesce(OLD.acesso_status, ''))) <> 'ativo'
          OR coalesce(OLD.troca_senha_obrigatoria, false)
        )
      );
  END IF;

  IF NOT v_promocao
     OR lower(btrim(coalesce(NEW.acesso_status, ''))) <> 'ativo'
     OR coalesce(NEW.troca_senha_obrigatoria, false) THEN
    RETURN NEW;
  END IF;

  -- A fonte compartilhada prova a senha global, mas o novo Aluno tambem deve
  -- registrar localmente essa propagacao e nao pode carregar fence temporaria.
  IF NEW.senha_atualizada_em IS NULL
     OR NEW.senha_temporaria_emissao_id IS NOT NULL
     OR NEW.senha_temporaria_emissao_iniciada_em IS NOT NULL
     OR NEW.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
     OR (
       coalesce(NEW.senha_temporaria_pendente, false)
       AND (
         NEW.senha_temporaria_emitida_em IS NULL
         OR NEW.senha_atualizada_em <= NEW.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_ALUNO_CREDENCIAL_LOCAL_INCOMPLETA';
  END IF;

  v_conclusao_credencial := pg_catalog.pg_trigger_depth() > 1
    AND pg_catalog.current_setting(
      'app.portal_credential_completion_auth_user_id',
      true
    ) = NEW.auth_user_id::text;
  IF v_conclusao_credencial THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = NEW.auth_user_id
      AND parceiro.id IS DISTINCT FROM NEW.id
  ) OR EXISTS (
    SELECT 1 FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = NEW.auth_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = NEW.auth_user_id
  ) INTO v_tem_outro_perfil;

  IF v_tem_outro_perfil THEN
    v_credencial_liberada :=
      public.portal_identidade_credencial_compartilhada_liberada(
        NEW.auth_user_id,
        NEW.id,
        NULL
      );
    IF NOT v_credencial_liberada THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_identidade_guardar_promocao_credencial()
  FROM PUBLIC, anon, authenticated, service_role;

-- O inicializador institucional legado calcula a prova no mesmo UPDATE. Este
-- trigger posterior aplica a regra conservadora da RPC quando existe mais de
-- um perfil e evita que uma unica fonte pronta masque outra fonte pendente.
CREATE OR REPLACE FUNCTION public.portal_identidade_revalidar_promocao_institucional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_eh_institucional boolean := false;
  v_novo_vinculo boolean := false;
  v_credencial_liberada boolean := false;
  v_exclude_partner_id uuid := NULL;
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'usuarios_sistema' THEN
    v_eh_institucional := true;
  ELSE
    v_eh_institucional := upper(btrim(coalesce(NEW.tipo, ''))) = 'PROFESSOR';
    v_exclude_partner_id := NEW.id;
  END IF;

  IF NOT v_eh_institucional THEN
    RETURN NEW;
  END IF;

  v_novo_vinculo := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    v_novo_vinculo := OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id;
    IF TG_TABLE_NAME = 'parceiros' THEN
      v_novo_vinculo := v_novo_vinculo OR OLD.tipo IS DISTINCT FROM NEW.tipo;
    END IF;
  END IF;

  IF NOT v_novo_vinculo
     OR NEW.primeiro_acesso_institucional_pendente
     OR NEW.acesso_institucional_origem <> 'IDENTIDADE_EXISTENTE' THEN
    RETURN NEW;
  END IF;

  v_credencial_liberada :=
    public.portal_identidade_credencial_compartilhada_liberada(
      NEW.auth_user_id,
      v_exclude_partner_id,
      NULL
    );

  IF NOT v_credencial_liberada THEN
    NEW.primeiro_acesso_institucional_pendente := true;
    NEW.senha_institucional_criada_em := NULL;
    NEW.acesso_institucional_origem := 'CONVITE';
    NEW.primeiro_acesso_institucional_operacao_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_identidade_revalidar_promocao_institucional()
  FROM PUBLIC, anon, authenticated, service_role;

-- zz20 executa depois do inicializador institucional zz10, enquanto as linhas
-- e a advisory temporaria adquiridas por a04 continuam presas a transacao.
DROP TRIGGER IF EXISTS zz20_revalidar_promocao_institucional
  ON public.parceiros;
CREATE TRIGGER zz20_revalidar_promocao_institucional
BEFORE INSERT OR UPDATE OF auth_user_id, tipo
ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_revalidar_promocao_institucional();

DROP TRIGGER IF EXISTS zz20_revalidar_promocao_institucional
  ON public.usuarios_sistema;
CREATE TRIGGER zz20_revalidar_promocao_institucional
BEFORE INSERT OR UPDATE OF auth_user_id
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_revalidar_promocao_institucional();

-- zz30 observa o estado final produzido pelos inicializadores anteriores.
DROP TRIGGER IF EXISTS zz30_guardar_promocao_credencial_compartilhada
  ON public.parceiros;
CREATE TRIGGER zz30_guardar_promocao_credencial_compartilhada
BEFORE INSERT OR UPDATE OF
  auth_user_id, tipo, acesso_status, troca_senha_obrigatoria
ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_guardar_promocao_credencial();

-- Durante o rollout, esta revalidacao tambem neutraliza o initializer legado
-- do Responsavel antes que a versao canonica 13270 seja publicada.
CREATE OR REPLACE FUNCTION
  public.portal_identidade_revalidar_promocao_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_novo_vinculo boolean := false;
  v_promocao boolean := false;
  v_tem_outro_perfil boolean := false;
  v_conclusao_credencial boolean := false;
  v_credencial_liberada boolean := false;
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_novo_vinculo := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    v_novo_vinculo := OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id;
  END IF;

  -- Estado pronto e uma prova positiva somente quando todos os marcadores de
  -- primeiro acesso concordam. Mudancas laterais em linha ja pronta nao sao
  -- uma nova promocao.
  IF NEW.status IS DISTINCT FROM 'ATIVO'
     OR NEW.senha_atualizada_em IS NULL
     OR coalesce(NEW.troca_senha_obrigatoria, false)
     OR (
       coalesce(NEW.senha_temporaria_pendente, false)
       AND (
         NEW.senha_temporaria_emitida_em IS NULL
         OR NEW.senha_atualizada_em <= NEW.senha_temporaria_emitida_em
       )
     ) THEN
    RETURN NEW;
  END IF;

  v_promocao := v_novo_vinculo;
  IF TG_OP = 'UPDATE' AND NOT v_novo_vinculo THEN
    v_promocao := OLD.status IS DISTINCT FROM 'ATIVO'
      OR OLD.senha_atualizada_em IS NULL
      OR coalesce(OLD.troca_senha_obrigatoria, false)
      OR (
        coalesce(OLD.senha_temporaria_pendente, false)
        AND (
          OLD.senha_temporaria_emitida_em IS NULL
          OR OLD.senha_atualizada_em IS NULL
          OR OLD.senha_atualizada_em <= OLD.senha_temporaria_emitida_em
        )
      );
  END IF;
  IF NOT v_promocao THEN
    RETURN NEW;
  END IF;

  v_conclusao_credencial := pg_catalog.pg_trigger_depth() > 1
    AND pg_catalog.current_setting(
      'app.portal_credential_completion_auth_user_id',
      true
    ) = NEW.auth_user_id::text;
  IF v_conclusao_credencial THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = NEW.auth_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = NEW.auth_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.responsaveis_legais AS outro_responsavel
    WHERE outro_responsavel.auth_user_id = NEW.auth_user_id
      AND outro_responsavel.id IS DISTINCT FROM NEW.id
  ) INTO v_tem_outro_perfil;

  IF NOT v_novo_vinculo AND NOT v_tem_outro_perfil THEN
    RETURN NEW;
  END IF;

  v_credencial_liberada :=
    public.portal_identidade_credencial_compartilhada_liberada(
      NEW.auth_user_id,
      NULL,
      NEW.id
    );
  IF NOT v_credencial_liberada THEN
    NEW.troca_senha_obrigatoria := true;
    NEW.senha_atualizada_em := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_identidade_revalidar_promocao_responsavel()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz30_revalidar_promocao_responsavel
  ON public.responsaveis_legais;
CREATE TRIGGER zz30_revalidar_promocao_responsavel
BEFORE INSERT OR UPDATE OF
  auth_user_id, status, troca_senha_obrigatoria, senha_temporaria_pendente,
  senha_temporaria_emitida_em, senha_atualizada_em
ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION
  public.portal_identidade_revalidar_promocao_responsavel();

COMMIT;
