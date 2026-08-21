-- Fase A da identidade multiperfil do portal.
--
-- Esta migration cria somente a fundação de Responsável Legal e da atribuição
-- de Coordenador a um Professor. Ela não altera nem habilita envelopes,
-- participantes, desafios ou assinaturas eletrônicas.

BEGIN;

-- A identidade Auth permanece globalmente única em Parceiros. Os perfis de
-- Responsável e Gestor vivem em tabelas próprias e não exigem afrouxar essa
-- invariável: um mesmo UID nunca representa Aluno e Professor simultaneamente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiros_auth_user_id
  ON public.parceiros (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Escritas diretas do navegador continuam disponíveis para os campos comuns
-- que a manutenção de Parceiros precisa editar, porém identidade, acesso e
-- aceite jurídico só podem mudar por rotinas SECURITY DEFINER auditadas. A
-- função é SECURITY INVOKER de propósito: dentro de uma RPC autorizada o
-- current_user é o dono da função; numa chamada PostgREST direta ele é o papel
-- authenticated/anon e a proteção permanece ativa.
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
       OR NEW.termos_uso_versao IS NOT NULL THEN
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
     OR NEW.termos_uso_versao IS DISTINCT FROM OLD.termos_uso_versao THEN
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

-- O linker legado não transforma mais um INSERT direto do navegador em
-- vínculo Auth implícito. RPCs SECURITY DEFINER, triggers internos e Service
-- Role ainda podem criar o vínculo, mantendo o cadastro público existente.
CREATE OR REPLACE FUNCTION public.link_parceiro_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_login_email text;
  v_session_auth_user_id uuid := auth.uid();
BEGIN
  IF NEW.auth_user_id IS NOT NULL
     OR NEW.tipo NOT IN ('Aluno', 'Professor')
     OR current_user IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  v_login_email := coalesce(
    nullif(btrim(NEW.auth_login_email), ''),
    nullif(btrim(NEW.email), '')
  );
  IF v_login_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT auth_user.id
    INTO NEW.auth_user_id
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(v_login_email)
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR auth_user.id = v_session_auth_user_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.parceiros AS parceiro_vinculado
      WHERE parceiro_vinculado.id <> NEW.id
        AND parceiro_vinculado.auth_user_id = auth_user.id
    )
  LIMIT 1;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_student_access_control_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_parceiro_auth_identity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_student_access_control_fields()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.link_parceiro_auth_identity()
  TO service_role;

CREATE TABLE public.responsaveis_legais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf_normalizado text,
  email text,
  telefone text,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'ATIVO', 'BLOQUEADO', 'INATIVO')),
  identidade_verificada_em timestamptz,
  identidade_verificada_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  identidade_verificacao_metodo text
    CHECK (
      identidade_verificacao_metodo IS NULL
      OR identidade_verificacao_metodo IN ('DOCUMENTO_CONFERIDO', 'PRESENCIAL')
    ),
  identidade_verificacao_referencia text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responsaveis_legais_nome_valido
    CHECK (char_length(btrim(nome)) BETWEEN 2 AND 160),
  CONSTRAINT responsaveis_legais_cpf_normalizado
    CHECK (
      cpf_normalizado IS NULL
      OR (
        cpf_normalizado ~ '^[0-9]{11}$'
        AND public.is_valid_cpf(cpf_normalizado)
      )
    ),
  CONSTRAINT responsaveis_legais_email_normalizado
    CHECK (
      email IS NULL
      OR (
        email = lower(btrim(email))
        AND char_length(email) BETWEEN 5 AND 254
        AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT responsaveis_legais_telefone_normalizado
    CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,15}$'),
  CONSTRAINT responsaveis_legais_verificacao_coerente
    CHECK (
      (
        identidade_verificada_em IS NULL
        AND identidade_verificada_por IS NULL
        AND identidade_verificacao_metodo IS NULL
        AND identidade_verificacao_referencia IS NULL
      )
      OR (
        identidade_verificada_em IS NOT NULL
        AND identidade_verificada_por IS NOT NULL
        AND identidade_verificacao_metodo IS NOT NULL
        AND identidade_verificacao_referencia IS NOT NULL
        AND identidade_verificacao_referencia = btrim(identidade_verificacao_referencia)
        AND char_length(identidade_verificacao_referencia) BETWEEN 3 AND 120
      )
    ),
  CONSTRAINT responsaveis_legais_ativo_verificado
    CHECK (
      status <> 'ATIVO'
      OR (
        cpf_normalizado IS NOT NULL
        AND email IS NOT NULL
        AND identidade_verificada_em IS NOT NULL
        AND identidade_verificada_por IS NOT NULL
        AND identidade_verificacao_metodo IS NOT NULL
        AND identidade_verificacao_referencia IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX responsaveis_legais_cpf_key
  ON public.responsaveis_legais (cpf_normalizado)
  WHERE cpf_normalizado IS NOT NULL;

CREATE INDEX responsaveis_legais_status_created_idx
  ON public.responsaveis_legais (status, created_at DESC, id DESC);

CREATE INDEX responsaveis_legais_nome_lower_idx
  ON public.responsaveis_legais (lower(nome));

CREATE TABLE public.responsaveis_legais_alunos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsavel_legal_id uuid NOT NULL
    REFERENCES public.responsaveis_legais(id) ON DELETE RESTRICT,
  aluno_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  parentesco text NOT NULL
    CHECK (parentesco IN ('MAE', 'PAI', 'TUTOR', 'GUARDIAO_JUDICIAL', 'OUTRO')),
  descricao_outro text,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'VERIFICADO', 'REVOGADO', 'EXPIRADO')),
  vigente_de timestamptz NOT NULL DEFAULT now(),
  vigente_ate timestamptz,
  verificado_em timestamptz,
  verificado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  verificacao_metodo text
    CHECK (
      verificacao_metodo IS NULL
      OR verificacao_metodo IN (
        'DOCUMENTO_CONFERIDO',
        'DECISAO_JUDICIAL',
        'PRESENCIAL'
      )
    ),
  verificacao_referencia text,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  motivo_revogacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responsaveis_legais_alunos_periodo_valido
    CHECK (vigente_ate IS NULL OR vigente_ate > vigente_de),
  CONSTRAINT responsaveis_legais_alunos_outro_descrito
    CHECK (
      (parentesco = 'OUTRO' AND char_length(btrim(coalesce(descricao_outro, ''))) BETWEEN 2 AND 120)
      OR (parentesco <> 'OUTRO' AND descricao_outro IS NULL)
    ),
  CONSTRAINT responsaveis_legais_alunos_verificacao_coerente
    CHECK (
      (
        verificado_em IS NULL
        AND verificado_por IS NULL
        AND verificacao_metodo IS NULL
        AND verificacao_referencia IS NULL
      )
      OR (
        verificado_em IS NOT NULL
        AND verificado_por IS NOT NULL
        AND verificacao_metodo IS NOT NULL
        AND verificacao_referencia IS NOT NULL
        AND verificacao_referencia = btrim(verificacao_referencia)
        AND char_length(verificacao_referencia) BETWEEN 3 AND 120
      )
    ),
  CONSTRAINT responsaveis_legais_alunos_status_verificado
    CHECK (
      status <> 'VERIFICADO'
      OR (
        verificado_em IS NOT NULL
        AND verificado_por IS NOT NULL
        AND verificacao_metodo IS NOT NULL
        AND verificacao_referencia IS NOT NULL
      )
    ),
  CONSTRAINT responsaveis_legais_alunos_revogacao_coerente
    CHECK (
      (
        status <> 'REVOGADO'
        AND revogado_em IS NULL
        AND revogado_por IS NULL
        AND motivo_revogacao IS NULL
      )
      OR (
        status = 'REVOGADO'
        AND revogado_em IS NOT NULL
        AND revogado_por IS NOT NULL
        AND char_length(btrim(coalesce(motivo_revogacao, ''))) BETWEEN 5 AND 500
      )
    )
);

CREATE UNIQUE INDEX responsaveis_legais_alunos_aberto_key
  ON public.responsaveis_legais_alunos (responsavel_legal_id, aluno_id)
  WHERE status IN ('PENDENTE', 'VERIFICADO');

CREATE INDEX responsaveis_legais_alunos_responsavel_lookup_idx
  ON public.responsaveis_legais_alunos
  (responsavel_legal_id, status, vigente_de, vigente_ate, aluno_id);

CREATE INDEX responsaveis_legais_alunos_aluno_lookup_idx
  ON public.responsaveis_legais_alunos
  (aluno_id, status, responsavel_legal_id);

CREATE TABLE public.professores_coordenacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ATIVA'
    CHECK (status IN ('ATIVA', 'REVOGADA', 'EXPIRADA')),
  vigente_de timestamptz NOT NULL DEFAULT now(),
  vigente_ate timestamptz,
  observacao text,
  concedida_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  revogada_em timestamptz,
  revogada_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  motivo_revogacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professores_coordenacoes_periodo_valido
    CHECK (vigente_ate IS NULL OR vigente_ate > vigente_de),
  CONSTRAINT professores_coordenacoes_observacao_valida
    CHECK (observacao IS NULL OR char_length(btrim(observacao)) BETWEEN 2 AND 500),
  CONSTRAINT professores_coordenacoes_revogacao_coerente
    CHECK (
      (
        status <> 'REVOGADA'
        AND revogada_em IS NULL
        AND revogada_por IS NULL
        AND motivo_revogacao IS NULL
      )
      OR (
        status = 'REVOGADA'
        AND revogada_em IS NOT NULL
        AND revogada_por IS NOT NULL
        AND char_length(btrim(coalesce(motivo_revogacao, ''))) BETWEEN 5 AND 500
      )
    )
);

CREATE UNIQUE INDEX professores_coordenacoes_ativa_escopo_key
  ON public.professores_coordenacoes (curso_id, polo_id)
  WHERE status = 'ATIVA';

CREATE INDEX professores_coordenacoes_professor_lookup_idx
  ON public.professores_coordenacoes
  (professor_id, status, vigente_de, vigente_ate, curso_id, polo_id);

CREATE INDEX professores_coordenacoes_scope_lookup_idx
  ON public.professores_coordenacoes
  (curso_id, polo_id, status, vigente_de, vigente_ate);

CREATE TABLE public.portal_identidade_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  operacao text NOT NULL CHECK (operacao IN (
    'RESPONSAVEL_SALVAR',
    'RESPONSAVEL_VINCULAR_ALUNO',
    'RESPONSAVEL_REVOGAR_VINCULO',
    'RESPONSAVEL_ACESSO_VINCULAR',
    'COORDENACAO_SALVAR',
    'COORDENACAO_REVOGAR',
    'PRIMEIRO_ACESSO_FINALIZAR',
    'ALUNO_CHECKOUT_GARANTIR'
  )),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL CHECK (jsonb_typeof(resultado) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX portal_identidade_operacoes_actor_request_key
  ON public.portal_identidade_operacoes (actor_auth_user_id, request_id)
  WHERE actor_auth_user_id IS NOT NULL;

CREATE INDEX portal_identidade_operacoes_created_idx
  ON public.portal_identidade_operacoes (created_at DESC);

ALTER TABLE public.responsaveis_legais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis_legais_alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professores_coordenacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_identidade_operacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY responsaveis_legais_client_deny
  ON public.responsaveis_legais
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY responsaveis_legais_alunos_client_deny
  ON public.responsaveis_legais_alunos
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY professores_coordenacoes_client_deny
  ON public.professores_coordenacoes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY portal_identidade_operacoes_client_deny
  ON public.portal_identidade_operacoes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.responsaveis_legais
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.responsaveis_legais_alunos
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.professores_coordenacoes
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.portal_identidade_operacoes
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_identidade_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_operacoes_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'PORTAL_IDENTIDADE_OPERACAO_IMUTAVEL';
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_validar_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno_tipo text;
  v_responsavel_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.responsavel_legal_id IS DISTINCT FROM OLD.responsavel_legal_id
    OR NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_IMUTAVEL';
  END IF;

  -- Uma prova verificada nunca pode ser reescrita. A única transição aceita
  -- preserva integralmente o vínculo e a prova, acrescentando a revogação.
  -- Qualquer novo parentesco/período/prova exige revogar e criar outra linha.
  IF TG_OP = 'UPDATE' AND OLD.status = 'VERIFICADO' AND (
    NEW.status NOT IN ('VERIFICADO', 'REVOGADO')
    OR NEW.parentesco IS DISTINCT FROM OLD.parentesco
    OR NEW.descricao_outro IS DISTINCT FROM OLD.descricao_outro
    OR NEW.vigente_de IS DISTINCT FROM OLD.vigente_de
    OR NEW.vigente_ate IS DISTINCT FROM OLD.vigente_ate
    OR NEW.verificado_em IS DISTINCT FROM OLD.verificado_em
    OR NEW.verificado_por IS DISTINCT FROM OLD.verificado_por
    OR NEW.verificacao_metodo IS DISTINCT FROM OLD.verificacao_metodo
    OR NEW.verificacao_referencia IS DISTINCT FROM OLD.verificacao_referencia
    OR (
      NEW.status = 'VERIFICADO'
      AND NEW.atualizado_por IS DISTINCT FROM OLD.atualizado_por
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_VERIFICADO_IMUTAVEL_USE_REVOGACAO';
  END IF;

  SELECT upper(parceiro.tipo)
    INTO v_aluno_tipo
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = NEW.aluno_id;

  IF v_aluno_tipo IS DISTINCT FROM 'ALUNO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_ALUNO_INVALIDO';
  END IF;

  SELECT responsavel.status
    INTO v_responsavel_status
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = NEW.responsavel_legal_id;

  IF v_responsavel_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PORTAL_IDENTIDADE_RESPONSAVEL_INEXISTENTE';
  END IF;

  IF NEW.status = 'VERIFICADO' AND v_responsavel_status <> 'ATIVO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_RESPONSAVEL_NAO_ATIVO';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_validar_coordenacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_professor_tipo text;
  v_professor_status text;
  v_professor_pertence_ao_polo boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.professor_id IS DISTINCT FROM OLD.professor_id
    OR NEW.curso_id IS DISTINCT FROM OLD.curso_id
    OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
    OR NEW.concedida_por IS DISTINCT FROM OLD.concedida_por
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_COORDENACAO_ESCOPO_IMUTAVEL';
  END IF;

  SELECT
    upper(parceiro.tipo),
    parceiro.status,
    parceiro.polo_id = NEW.polo_id
      OR NEW.polo_id = ANY(coalesce(parceiro.polo_ids, ARRAY[]::uuid[]))
    INTO
      v_professor_tipo,
      v_professor_status,
      v_professor_pertence_ao_polo
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = NEW.professor_id;

  IF v_professor_tipo IS DISTINCT FROM 'PROFESSOR'
     OR (
       NEW.status = 'ATIVA'
       AND NOT coalesce(public.is_active_status(v_professor_status), false)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_PROFESSOR_INVALIDO';
  END IF;

  IF NEW.status = 'ATIVA'
     AND NOT coalesce(v_professor_pertence_ao_polo, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_PROFESSOR_FORA_DO_POLO';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER responsaveis_legais_touch_updated_at
BEFORE UPDATE ON public.responsaveis_legais
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_touch_updated_at();

CREATE TRIGGER responsaveis_legais_alunos_touch_updated_at
BEFORE UPDATE ON public.responsaveis_legais_alunos
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_touch_updated_at();

CREATE TRIGGER responsaveis_legais_alunos_validate
BEFORE INSERT OR UPDATE ON public.responsaveis_legais_alunos
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_validar_vinculo();

CREATE TRIGGER professores_coordenacoes_touch_updated_at
BEFORE UPDATE ON public.professores_coordenacoes
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_touch_updated_at();

CREATE TRIGGER professores_coordenacoes_validate
BEFORE INSERT OR UPDATE ON public.professores_coordenacoes
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_validar_coordenacao();

CREATE TRIGGER portal_identidade_operacoes_no_mutation
BEFORE UPDATE OR DELETE ON public.portal_identidade_operacoes
FOR EACH ROW EXECUTE FUNCTION public.portal_identidade_operacoes_append_only();

CREATE OR REPLACE FUNCTION public.portal_identidade_autorizar_gestor()
RETURNS uuid
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

  IF NOT coalesce(public.gestor_has_module('parceiros'), false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_PARCEIROS_OBRIGATORIO';
  END IF;

  RETURN v_actor;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_gestor_escopo_atual()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH base AS (
    SELECT
      usuario.context,
      coalesce(usuario.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
      coalesce(usuario.permissoes, '{}'::jsonb) AS permissoes_usuario,
      CASE
        WHEN usuario.perfil_acesso_id IS NOT NULL
          AND NOT coalesce(usuario.personalizar_permissoes, false)
          AND perfil.id IS NOT NULL
          THEN coalesce(perfil.permissoes, '{}'::jsonb)
        ELSE coalesce(usuario.permissoes, '{}'::jsonb)
      END AS permissoes_base
    FROM public.usuarios_sistema AS usuario
    LEFT JOIN public.perfis_acesso AS perfil
      ON perfil.id = usuario.perfil_acesso_id
    WHERE usuario.auth_user_id = auth.uid()
      AND public.is_active_status(usuario.status)
    LIMIT 1
  ), efetivo AS (
    SELECT
      base.context,
      base.polo_ids,
      pg_catalog.jsonb_set(
        base.permissoes_base,
        '{allPolos}',
        pg_catalog.to_jsonb(
          CASE
            WHEN pg_catalog.jsonb_typeof(
              base.permissoes_usuario -> 'allPolos'
            ) = 'boolean'
              THEN (base.permissoes_usuario ->> 'allPolos')::boolean
            ELSE false
          END
        ),
        true
      ) AS permissoes
    FROM base
  )
  SELECT pg_catalog.jsonb_build_object(
    'allPolos',
      coalesce((efetivo.permissoes ->> 'allPolos')::boolean, false)
      AND pg_catalog.cardinality(efetivo.polo_ids) = 0
      AND (
        nullif(lower(btrim(coalesce(efetivo.context, ''))), '') IS NULL
        OR lower(btrim(efetivo.context)) = 'global'
        OR (
          efetivo.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (
            SELECT 1
            FROM public.polos AS matriz
            WHERE matriz.id = efetivo.context::uuid
              AND coalesce(matriz.is_matriz, false)
              AND coalesce(public.is_active_status(matriz.status), false)
          )
        )
      ),
    'poloIds',
      CASE
        WHEN pg_catalog.cardinality(efetivo.polo_ids) > 0
          THEN pg_catalog.to_jsonb(efetivo.polo_ids)
        WHEN efetivo.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN pg_catalog.jsonb_build_array(efetivo.context::uuid)
        ELSE pg_catalog.jsonb_build_array()
      END,
    'permissions', efetivo.permissoes
  )
  FROM efetivo;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_aluno_no_escopo_gestor(
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(
      (
        public.portal_identidade_gestor_escopo_atual() ->> 'allPolos'
      )::boolean,
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.id = p_aluno_id
        AND upper(aluno.tipo) = 'ALUNO'
        AND (
          EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              coalesce(
                public.portal_identidade_gestor_escopo_atual() -> 'poloIds',
                pg_catalog.jsonb_build_array()
              )
            ) AS polo_permitido(valor)
            WHERE polo_permitido.valor::uuid = aluno.polo_id
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(coalesce(aluno.polo_ids, ARRAY[]::uuid[]))
              AS aluno_polo(polo_id)
            JOIN LATERAL pg_catalog.jsonb_array_elements_text(
              coalesce(
                public.portal_identidade_gestor_escopo_atual() -> 'poloIds',
                pg_catalog.jsonb_build_array()
              )
            ) AS polo_permitido(valor) ON true
            WHERE aluno_polo.polo_id = polo_permitido.valor::uuid
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_gestor_pode_gerir_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(
    (
      public.portal_identidade_gestor_escopo_atual() ->> 'allPolos'
    )::boolean,
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_validar_escopo_solicitado(
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_escopo jsonb;
  v_all_polos boolean;
BEGIN
  v_actor := public.portal_identidade_autorizar_gestor();

  IF p_polo_id IS NULL OR p_include_global IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_ESCOPO_EXPLICITO_OBRIGATORIO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.polos AS polo
    WHERE polo.id = p_polo_id
      AND coalesce(public.is_active_status(polo.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_IDENTIDADE_POLO_NAO_AUTORIZADO';
  END IF;

  v_escopo := public.portal_identidade_gestor_escopo_atual();
  v_all_polos := coalesce((v_escopo ->> 'allPolos')::boolean, false);

  IF NOT v_all_polos AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements_text(
      coalesce(v_escopo -> 'poloIds', pg_catalog.jsonb_build_array())
    ) AS polo_permitido(valor)
    WHERE polo_permitido.valor::uuid = p_polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_IDENTIDADE_POLO_NAO_AUTORIZADO';
  END IF;

  IF p_include_global AND NOT v_all_polos THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_IDENTIDADE_GLOBAL_NAO_AUTORIZADO';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'actorAuthUserId', v_actor,
    'poloId', p_polo_id,
    'includeGlobal', p_include_global,
    'allPolos', v_all_polos
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_aluno_no_polo(
  p_aluno_id uuid,
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
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_aluno_id
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
      AND (
        aluno.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(aluno.polo_ids, ARRAY[]::uuid[]))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_responsavel_no_escopo_solicitado(
  p_responsavel_legal_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.responsaveis_legais_alunos AS vinculo
          WHERE vinculo.responsavel_legal_id = responsavel.id
            AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
            AND vinculo.vigente_de <= statement_timestamp()
            AND (
              vinculo.vigente_ate IS NULL
              OR vinculo.vigente_ate > statement_timestamp()
            )
            AND public.portal_identidade_aluno_no_polo(
              vinculo.aluno_id,
              p_polo_id
            )
        )
        OR (
          p_include_global
          AND responsavel.criado_por = auth.uid()
          AND NOT EXISTS (
            SELECT 1
            FROM public.responsaveis_legais_alunos AS qualquer_vinculo
            WHERE qualquer_vinculo.responsavel_legal_id = responsavel.id
              AND qualquer_vinculo.status IN ('PENDENTE', 'VERIFICADO')
              AND qualquer_vinculo.vigente_de <= statement_timestamp()
              AND (
                qualquer_vinculo.vigente_ate IS NULL
                OR qualquer_vinculo.vigente_ate > statement_timestamp()
              )
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_responsavel_polos_afetados(
  p_responsavel_legal_id uuid,
  p_polo_id uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT ARRAY(
    SELECT DISTINCT escopo.polo_id
    FROM (
      SELECT p_polo_id AS polo_id
      UNION ALL
      SELECT aluno.polo_id
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
      UNION ALL
      SELECT aluno_polo.polo_id
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      CROSS JOIN LATERAL pg_catalog.unnest(
        coalesce(aluno.polo_ids, ARRAY[]::uuid[])
      ) AS aluno_polo(polo_id)
      WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
    ) AS escopo
    WHERE escopo.polo_id IS NOT NULL
    ORDER BY escopo.polo_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_responsavel_no_escopo_gestor(
  p_responsavel_legal_id uuid,
  p_permitir_rascunho_sem_vinculo boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id
      AND (
        coalesce(
          (
            public.portal_identidade_gestor_escopo_atual() ->> 'allPolos'
          )::boolean,
          false
        )
        OR EXISTS (
          SELECT 1
          FROM public.responsaveis_legais_alunos AS vinculo
          WHERE vinculo.responsavel_legal_id = responsavel.id
            AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
            AND vinculo.vigente_de <= statement_timestamp()
            AND (
              vinculo.vigente_ate IS NULL
              OR vinculo.vigente_ate > statement_timestamp()
            )
            AND public.portal_identidade_aluno_no_escopo_gestor(vinculo.aluno_id)
        )
        OR (
          p_permitir_rascunho_sem_vinculo
          AND responsavel.criado_por = auth.uid()
          AND NOT EXISTS (
            SELECT 1
            FROM public.responsaveis_legais_alunos AS qualquer_vinculo
            WHERE qualquer_vinculo.responsavel_legal_id = responsavel.id
              AND qualquer_vinculo.status IN ('PENDENTE', 'VERIFICADO')
              AND qualquer_vinculo.vigente_de <= statement_timestamp()
              AND (
                qualquer_vinculo.vigente_ate IS NULL
                OR qualquer_vinculo.vigente_ate > statement_timestamp()
              )
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_professor_no_escopo_gestor(
  p_professor_id uuid,
  p_polo_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros AS professor
    WHERE professor.id = p_professor_id
      AND upper(professor.tipo) = 'PROFESSOR'
      AND (
        p_polo_id IS NULL
        OR professor.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
      )
      AND (
        coalesce(
          (
            public.portal_identidade_gestor_escopo_atual() ->> 'allPolos'
          )::boolean,
          false
        )
        OR (
          p_polo_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              coalesce(
                public.portal_identidade_gestor_escopo_atual() -> 'poloIds',
                pg_catalog.jsonb_build_array()
              )
            ) AS polo_permitido(valor)
            WHERE polo_permitido.valor::uuid = p_polo_id
          )
        )
        OR (
          p_polo_id IS NULL
          AND (
            EXISTS (
              SELECT 1
              FROM pg_catalog.jsonb_array_elements_text(
                coalesce(
                  public.portal_identidade_gestor_escopo_atual() -> 'poloIds',
                  pg_catalog.jsonb_build_array()
                )
              ) AS polo_permitido(valor)
              WHERE polo_permitido.valor::uuid = professor.polo_id
            )
            OR EXISTS (
              SELECT 1
              FROM pg_catalog.unnest(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
                AS professor_polo(polo_id)
              JOIN LATERAL pg_catalog.jsonb_array_elements_text(
                coalesce(
                  public.portal_identidade_gestor_escopo_atual() -> 'poloIds',
                  pg_catalog.jsonb_build_array()
                )
              ) AS polo_permitido(valor) ON true
              WHERE professor_polo.polo_id = polo_permitido.valor::uuid
            )
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_actor_gestor_contexto(
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH base AS (
    SELECT
      usuario.auth_user_id,
      usuario.context,
      coalesce(usuario.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
      CASE
        WHEN usuario.perfil_acesso_id IS NOT NULL
          AND NOT coalesce(usuario.personalizar_permissoes, false)
          AND perfil.id IS NOT NULL
          THEN coalesce(perfil.permissoes, '{}'::jsonb)
        ELSE coalesce(usuario.permissoes, '{}'::jsonb)
      END AS permissoes_base,
      coalesce(usuario.permissoes, '{}'::jsonb) AS permissoes_usuario,
      coalesce(
        usuario.restricao_horario,
        CASE
          WHEN usuario.perfil_acesso_id IS NOT NULL
            THEN perfil.restricao_horario
          ELSE NULL
        END,
        '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb
      ) AS horario
    FROM public.usuarios_sistema AS usuario
    LEFT JOIN public.perfis_acesso AS perfil
      ON perfil.id = usuario.perfil_acesso_id
    WHERE usuario.auth_user_id = p_actor_auth_user_id
      AND public.is_active_status(usuario.status)
    LIMIT 1
  ), efetivo AS (
    SELECT
      base.*,
      pg_catalog.jsonb_set(
        base.permissoes_base,
        '{allPolos}',
        pg_catalog.to_jsonb(
          CASE
              WHEN pg_catalog.jsonb_typeof(base.permissoes_usuario -> 'allPolos') = 'boolean'
              THEN (base.permissoes_usuario ->> 'allPolos')::boolean
            ELSE false
          END
        ),
        true
      ) AS permissoes,
      pg_catalog.date_part(
        'dow',
        statement_timestamp() AT TIME ZONE 'America/Maceio'
      )::integer AS dia_atual,
      pg_catalog.to_char(
        statement_timestamp() AT TIME ZONE 'America/Maceio',
        'HH24:MI'
      ) AS hora_atual
    FROM base
  ), autorizado AS (
    SELECT
      efetivo.*,
      CASE
        WHEN pg_catalog.jsonb_typeof(efetivo.horario -> 'ativo') <> 'boolean'
          THEN false
        WHEN NOT (efetivo.horario ->> 'ativo')::boolean THEN true
        WHEN pg_catalog.jsonb_typeof(efetivo.horario -> 'dias') <> 'array'
          THEN false
        WHEN (efetivo.horario ->> 'horario_inicio')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
        WHEN (efetivo.horario ->> 'horario_fim')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
        WHEN (efetivo.horario ->> 'horario_inicio') =
          (efetivo.horario ->> 'horario_fim') THEN false
        WHEN (efetivo.horario ->> 'horario_inicio') <
          (efetivo.horario ->> 'horario_fim') THEN
          efetivo.hora_atual BETWEEN
            (efetivo.horario ->> 'horario_inicio')
            AND (efetivo.horario ->> 'horario_fim')
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(efetivo.horario -> 'dias')
              AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer = efetivo.dia_atual
          )
        WHEN efetivo.hora_atual >= (efetivo.horario ->> 'horario_inicio') THEN
          EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(efetivo.horario -> 'dias')
              AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer = efetivo.dia_atual
          )
        WHEN efetivo.hora_atual <= (efetivo.horario ->> 'horario_fim') THEN
          EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(efetivo.horario -> 'dias')
              AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer = ((efetivo.dia_atual + 6) % 7)
          )
        ELSE false
      END AS horario_permitido
    FROM efetivo
  )
  SELECT pg_catalog.jsonb_build_object(
    'actorAuthUserId', autorizado.auth_user_id,
    'allPolos',
      coalesce((autorizado.permissoes ->> 'allPolos')::boolean, false)
      AND pg_catalog.cardinality(autorizado.polo_ids) = 0
      AND (
        nullif(lower(btrim(coalesce(autorizado.context, ''))), '') IS NULL
        OR lower(btrim(autorizado.context)) = 'global'
        OR (
          autorizado.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (
            SELECT 1
            FROM public.polos AS matriz
            WHERE matriz.id = autorizado.context::uuid
              AND coalesce(matriz.is_matriz, false)
              AND coalesce(public.is_active_status(matriz.status), false)
          )
        )
      ),
    'poloIds',
      CASE
        WHEN pg_catalog.cardinality(autorizado.polo_ids) > 0
          THEN pg_catalog.to_jsonb(autorizado.polo_ids)
        WHEN autorizado.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN pg_catalog.jsonb_build_array(autorizado.context::uuid)
        ELSE pg_catalog.jsonb_build_array()
      END
  )
  FROM autorizado
  WHERE autorizado.horario_permitido
    AND pg_catalog.jsonb_typeof(autorizado.permissoes -> 'modules') = 'array'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(autorizado.permissoes -> 'modules')
        AS modulo(valor)
      WHERE modulo.valor = 'parceiros'
    );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_exigir_service_role_actor(
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_OBRIGATORIO';
  END IF;

  IF p_actor_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ACTOR_AUTH_USER_ID_OBRIGATORIO';
  END IF;

  v_contexto := public.portal_identidade_actor_gestor_contexto(
    p_actor_auth_user_id
  );

  IF v_contexto IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;

  RETURN v_contexto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_actor_pode_gerir_aluno(
  p_contexto jsonb,
  p_aluno_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce((p_contexto ->> 'allPolos')::boolean, false)
    OR EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.id = p_aluno_id
        AND upper(aluno.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
        AND (
          EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              coalesce(p_contexto -> 'poloIds', pg_catalog.jsonb_build_array())
            ) AS polo_permitido(valor)
            WHERE polo_permitido.valor::uuid = aluno.polo_id
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(coalesce(aluno.polo_ids, ARRAY[]::uuid[]))
              AS aluno_polo(polo_id)
            JOIN LATERAL pg_catalog.jsonb_array_elements_text(
              coalesce(p_contexto -> 'poloIds', pg_catalog.jsonb_build_array())
            ) AS polo_permitido(valor) ON true
            WHERE aluno_polo.polo_id = polo_permitido.valor::uuid
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_validar_chaves_json(
  p_dados jsonb,
  p_chaves_permitidas text[]
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_chaves_invalidas text;
BEGIN
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_DADOS_INVALIDOS';
  END IF;

  SELECT pg_catalog.string_agg(chave, ', ' ORDER BY chave)
    INTO v_chaves_invalidas
  FROM pg_catalog.jsonb_object_keys(p_dados) AS chaves(chave)
  WHERE NOT (chave = ANY(p_chaves_permitidas));

  IF v_chaves_invalidas IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CHAVES_INVALIDAS: ' || v_chaves_invalidas;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_payload_sha256(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_cursor_hmac_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT nullif(segredo.decrypted_secret, '')
    INTO v_secret
  FROM vault.decrypted_secrets AS segredo
  WHERE segredo.name = 'portal_identity_cursor_hmac_secret'
  LIMIT 1;

  IF v_secret IS NULL OR pg_catalog.octet_length(v_secret) < 32 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_IDENTIDADE_CONFIGURACAO_SEGURA_INDISPONIVEL';
  END IF;

  RETURN v_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_cursor_codificar(
  p_created_at timestamptz,
  p_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_payload text := pg_catalog.jsonb_build_object(
    'createdAt', pg_catalog.to_char(
      p_created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'id', p_id
  )::text;
  v_secret text := public.portal_identidade_cursor_hmac_secret();
  v_envelope text;
BEGIN
  v_envelope := pg_catalog.jsonb_build_object(
    'payload', pg_catalog.replace(
      pg_catalog.encode(
        pg_catalog.convert_to(v_payload, 'UTF8'),
        'base64'
      ),
      E'\n',
      ''
    ),
    'signature', pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(v_payload, 'UTF8'),
        pg_catalog.convert_to(v_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  )::text;

  RETURN pg_catalog.replace(
    pg_catalog.encode(
      pg_catalog.convert_to(v_envelope, 'UTF8'),
      'base64'
    ),
    E'\n',
    ''
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_cursor_decodificar(
  p_cursor text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_envelope jsonb;
  v_payload text;
  v_signature bytea;
  v_expected_signature bytea;
  v_secret text;
  v_cursor jsonb;
BEGIN
  IF char_length(p_cursor) NOT BETWEEN 8 AND 512 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CURSOR_INVALIDO';
  END IF;

  v_secret := public.portal_identidade_cursor_hmac_secret();
  v_envelope := pg_catalog.convert_from(
    pg_catalog.decode(p_cursor, 'base64'),
    'UTF8'
  )::jsonb;

  PERFORM public.portal_identidade_validar_chaves_json(
    v_envelope,
    ARRAY['payload', 'signature']::text[]
  );

  IF nullif(v_envelope ->> 'payload', '') IS NULL
     OR nullif(v_envelope ->> 'signature', '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CURSOR_INVALIDO';
  END IF;

  v_payload := pg_catalog.convert_from(
    pg_catalog.decode(v_envelope ->> 'payload', 'base64'),
    'UTF8'
  );
  v_signature := pg_catalog.decode(v_envelope ->> 'signature', 'hex');
  v_expected_signature := extensions.hmac(
    pg_catalog.convert_to(v_payload, 'UTF8'),
    pg_catalog.convert_to(v_secret, 'UTF8'),
    'sha256'
  );

  IF v_signature IS DISTINCT FROM v_expected_signature THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CURSOR_INVALIDO';
  END IF;

  v_cursor := v_payload::jsonb;

  PERFORM public.portal_identidade_validar_chaves_json(
    v_cursor,
    ARRAY['createdAt', 'id']::text[]
  );

  IF nullif(v_cursor ->> 'createdAt', '') IS NULL
     OR nullif(v_cursor ->> 'id', '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CURSOR_INVALIDO';
  END IF;

  -- Os casts validam formato e intervalo antes que o cursor alcance a query.
  PERFORM (v_cursor ->> 'createdAt')::timestamptz;
  PERFORM (v_cursor ->> 'id')::uuid;

  RETURN v_cursor;
EXCEPTION
  WHEN SQLSTATE '55000' THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_CURSOR_INVALIDO';
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_termos_versao_vigente()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT '2026-08-05'::text;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_obter_replay(
  p_actor uuid,
  p_request_id uuid,
  p_operacao text,
  p_payload_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_operacao public.portal_identidade_operacoes%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT operacao.*
    INTO v_operacao
  FROM public.portal_identidade_operacoes AS operacao
  WHERE operacao.actor_auth_user_id = p_actor
    AND operacao.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_operacao.operacao IS DISTINCT FROM p_operacao
     OR v_operacao.payload_sha256 IS DISTINCT FROM p_payload_sha256 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_REQUEST_REPLAY_DIVERGENTE';
  END IF;

  RETURN v_operacao.resultado || jsonb_build_object('replayed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_registrar_operacao(
  p_actor uuid,
  p_request_id uuid,
  p_operacao text,
  p_payload_sha256 text,
  p_resultado jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.portal_identidade_operacoes (
    actor_auth_user_id,
    request_id,
    operacao,
    payload_sha256,
    resultado
  ) VALUES (
    p_actor,
    p_request_id,
    p_operacao,
    p_payload_sha256,
    p_resultado
  );

  RETURN p_resultado || jsonb_build_object('replayed', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_garantir_perfil_aluno_checkout(
  p_source_context_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_auth_email text;
  v_source_role text;
  v_source_name text;
  v_source_email text;
  v_source_cpf text;
  v_source_phone text;
  v_source_birth_date date;
  v_source_polo_id uuid;
  v_source_polo_ids uuid[] := ARRAY[]::uuid[];
  v_parceiro_vinculado public.parceiros%ROWTYPE;
  v_aluno public.parceiros%ROWTYPE;
  v_payload_sha256 text;
  v_replay jsonb;
  v_resultado jsonb;
  v_created boolean := false;
  v_linked boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  IF p_source_context_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ALUNO_CHECKOUT_PARAMETROS_INVALIDOS';
  END IF;

  SELECT lower(btrim(auth_user.email))
    INTO v_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_actor;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_AUTH_EMAIL_OBRIGATORIO';
  END IF;

  -- A origem é autorizada e bloqueada antes de qualquer consulta ao ledger.
  SELECT
    upper(parceiro.tipo),
    parceiro.nome,
    lower(btrim(coalesce(
      nullif(parceiro.auth_login_email, ''),
      nullif(parceiro.email, '')
    ))),
    pg_catalog.regexp_replace(coalesce(parceiro.cpf_cnpj, ''), '\\D', '', 'g'),
    parceiro.telefone,
    parceiro.data_nascimento,
    parceiro.polo_id,
    coalesce(parceiro.polo_ids, ARRAY[]::uuid[])
  INTO
    v_source_role,
    v_source_name,
    v_source_email,
    v_source_cpf,
    v_source_phone,
    v_source_birth_date,
    v_source_polo_id,
    v_source_polo_ids
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = p_source_context_id
    AND parceiro.auth_user_id = v_actor
    AND upper(parceiro.tipo) IN ('ALUNO', 'PROFESSOR')
    AND coalesce(public.is_active_status(parceiro.status), false)
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT
      'GESTOR'::text,
      gestor.nome,
      lower(btrim(gestor.email)),
      pg_catalog.regexp_replace(coalesce(gestor.cpf, ''), '\\D', '', 'g'),
      gestor.telefone,
      NULL::date,
      NULL::uuid,
      ARRAY[]::uuid[]
    INTO
      v_source_role,
      v_source_name,
      v_source_email,
      v_source_cpf,
      v_source_phone,
      v_source_birth_date,
      v_source_polo_id,
      v_source_polo_ids
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.id = p_source_context_id
      AND gestor.auth_user_id = v_actor
      AND coalesce(public.is_active_status(gestor.status), false)
    FOR UPDATE;
  END IF;

  IF v_source_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  IF v_source_email IS DISTINCT FROM v_auth_email THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_EMAIL_CANONICO_DIVERGENTE';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('aluno-checkout:' || v_actor::text, 0)
  );

  -- A unicidade global de Parceiros é revalidada sob o lock do ator antes do
  -- replay. Um Aluno existente pode ser reutilizado; qualquer outro papel de
  -- parceiro, especialmente Professor, fecha o fluxo sem criar segundo perfil.
  SELECT parceiro_uid.*
    INTO v_parceiro_vinculado
  FROM public.parceiros AS parceiro_uid
  WHERE parceiro_uid.auth_user_id = v_actor
  FOR UPDATE;

  IF FOUND THEN
    IF upper(v_parceiro_vinculado.tipo) <> 'ALUNO' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR';
    END IF;

    IF NOT coalesce(
      public.is_active_status(v_parceiro_vinculado.status),
      false
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ALUNO_CHECKOUT_PERFIL_INATIVO';
    END IF;

    v_aluno := v_parceiro_vinculado;
  END IF;

  IF v_aluno.id IS NULL
     AND v_source_role <> 'ALUNO'
     AND NOT coalesce(public.is_valid_cpf(v_source_cpf), false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ALUNO_CHECKOUT_CPF_ORIGEM_OBRIGATORIO';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'sourceContextId', p_source_context_id,
      'sourceRole', v_source_role
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'ALUNO_CHECKOUT_GARANTIR',
    v_payload_sha256
  );

  IF v_replay IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno_replay
      WHERE aluno_replay.id = (v_replay ->> 'alunoId')::uuid
        AND aluno_replay.auth_user_id = v_actor
        AND upper(aluno_replay.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno_replay.status), false)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ALUNO_CHECKOUT_REPLAY_CONTEXTO_INVALIDO';
    END IF;
    RETURN v_replay;
  END IF;

  IF v_aluno.id IS NULL THEN
    SELECT aluno.*
      INTO v_aluno
    FROM public.parceiros AS aluno
    WHERE upper(aluno.tipo) = 'ALUNO'
      AND pg_catalog.regexp_replace(
        coalesce(aluno.cpf_cnpj, ''),
        '\\D',
        '',
        'g'
      ) = v_source_cpf
    FOR UPDATE;

    IF FOUND THEN
      IF NOT coalesce(public.is_active_status(v_aluno.status), false) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'ALUNO_CHECKOUT_PERFIL_INATIVO';
      END IF;

      IF v_aluno.auth_user_id IS NOT NULL
         AND v_aluno.auth_user_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'ALUNO_CHECKOUT_CPF_JA_VINCULADO';
      END IF;

      IF lower(btrim(coalesce(
        nullif(v_aluno.auth_login_email, ''),
        nullif(v_aluno.email, '')
      ))) IS DISTINCT FROM v_auth_email THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'ALUNO_CHECKOUT_IDENTIDADE_DIVERGENTE';
      END IF;

      UPDATE public.parceiros AS aluno
      SET
        auth_user_id = v_actor,
        auth_login_email = v_auth_email,
        troca_senha_obrigatoria = false,
        acesso_status = 'ativo',
        acesso_erro = NULL,
        acesso_ativado_em = coalesce(
          aluno.acesso_ativado_em,
          pg_catalog.clock_timestamp()
        ),
        updated_at = pg_catalog.statement_timestamp()
      WHERE aluno.id = v_aluno.id
      RETURNING aluno.* INTO v_aluno;

      v_linked := true;
    ELSE
      INSERT INTO public.parceiros (
        tipo,
        nome,
        cpf_cnpj,
        email,
        telefone,
        data_nascimento,
        polo_id,
        polo_ids,
        status,
        observacao,
        auth_user_id,
        auth_login_email,
        troca_senha_obrigatoria,
        acesso_status,
        acesso_erro,
        acesso_ativado_em
      ) VALUES (
        'Aluno',
        coalesce(nullif(btrim(v_source_name), ''), v_auth_email),
        v_source_cpf,
        v_auth_email,
        v_source_phone,
        v_source_birth_date,
        v_source_polo_id,
        v_source_polo_ids,
        'ATIVO',
        'Perfil de Aluno vinculado pelo fluxo autenticado de checkout.',
        v_actor,
        v_auth_email,
        false,
        'ativo',
        NULL,
        pg_catalog.clock_timestamp()
      )
      RETURNING * INTO v_aluno;

      v_created := true;
      v_linked := true;
    END IF;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'alunoId', v_aluno.id,
    'contextId', v_aluno.id,
    'created', v_created,
    'linked', v_linked
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'ALUNO_CHECKOUT_GARANTIR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

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

  -- Autoriza o contexto antes de consultar o ledger idempotente.
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

  -- A senha é alterada exclusivamente pelo Supabase Auth. O trigger canônico
  -- do Auth precisa ter confirmado a mudança antes desta operação de termos.
  IF coalesce(v_aluno.troca_senha_obrigatoria, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA';
  END IF;

  -- Replay não contorna uma eventual reativação do primeiro acesso: o
  -- contexto e o estado atual da senha foram revalidados sob lock.
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF coalesce(v_aluno.aceitou_termos_uso, false)
     AND v_aluno.aceitou_termos_uso_em IS NOT NULL
     AND v_aluno.termos_uso_versao = v_termos_versao_vigente THEN
    v_aceite_em := v_aluno.aceitou_termos_uso_em;
  ELSE
    v_aceite_em := pg_catalog.clock_timestamp();

    UPDATE public.parceiros AS aluno
    SET
      aceitou_termos_uso = true,
      aceitou_termos_uso_em = v_aceite_em,
      termos_uso_versao = v_termos_versao_vigente,
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
          'requiresPasswordReset', coalesce(
            parceiro.troca_senha_obrigatoria,
            false
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
        SELECT DISTINCT polo_id
        FROM pg_catalog.unnest(
          coalesce(parceiro.polo_ids, ARRAY[]::uuid[])
          || CASE
            WHEN parceiro.polo_id IS NULL THEN ARRAY[]::uuid[]
            ELSE ARRAY[parceiro.polo_id]
          END
        ) AS polo_escopo(polo_id)
        WHERE polo_id IS NOT NULL
        ORDER BY polo_id
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
        SELECT DISTINCT polo_id
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
          AND (vinculo.vigente_ate IS NULL OR vinculo.vigente_ate > statement_timestamp())
          AND upper(aluno.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno.status), false)
          AND polo_id IS NOT NULL
        ORDER BY polo_id
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

CREATE OR REPLACE FUNCTION public.responsavel_legal_listar_dependentes(
  p_responsavel_legal_id uuid
)
RETURNS TABLE (
  "vinculoId" uuid,
  "alunoId" uuid,
  nome text,
  parentesco text,
  "poloIds" uuid[],
  "vigenteDe" timestamptz,
  "vigenteAte" timestamptz
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

  IF p_responsavel_legal_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id
      AND responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERFIL_RESPONSAVEL_NAO_AUTORIZADO';
  END IF;

  RETURN QUERY
  SELECT
    vinculo.id,
    aluno.id,
    aluno.nome,
    vinculo.parentesco,
    ARRAY(
      SELECT DISTINCT polo_id
      FROM pg_catalog.unnest(
        coalesce(aluno.polo_ids, ARRAY[]::uuid[])
        || CASE
          WHEN aluno.polo_id IS NULL THEN ARRAY[]::uuid[]
          ELSE ARRAY[aluno.polo_id]
        END
      ) AS polo_escopo(polo_id)
      WHERE polo_id IS NOT NULL
      ORDER BY polo_id
    ),
    vinculo.vigente_de,
    vinculo.vigente_ate
  FROM public.responsaveis_legais_alunos AS vinculo
  JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
  WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
    AND vinculo.status = 'VERIFICADO'
    AND vinculo.vigente_de <= statement_timestamp()
    AND (vinculo.vigente_ate IS NULL OR vinculo.vigente_ate > statement_timestamp())
    AND upper(aluno.tipo) = 'ALUNO'
    AND coalesce(public.is_active_status(aluno.status), false)
  ORDER BY aluno.nome, aluno.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.coordenador_listar_atribuicoes(
  p_professor_id uuid,
  p_polo_id uuid
)
RETURNS TABLE (
  "coordenacaoId" uuid,
  "cursoId" uuid,
  "cursoNome" text,
  "poloId" uuid,
  "poloNome" text,
  "vigenteDe" timestamptz,
  "vigenteAte" timestamptz
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

  IF p_professor_id IS NULL OR p_polo_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS professor
    WHERE professor.id = p_professor_id
      AND professor.auth_user_id = v_actor
      AND upper(professor.tipo) = 'PROFESSOR'
      AND coalesce(public.is_active_status(professor.status), false)
      AND (
        professor.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
      )
      AND EXISTS (
        SELECT 1
        FROM public.polos AS polo_autorizado
        WHERE polo_autorizado.id = p_polo_id
          AND coalesce(
            public.is_active_status(polo_autorizado.status),
            false
          )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERFIL_COORDENADOR_NAO_AUTORIZADO';
  END IF;

  RETURN QUERY
  SELECT
    coordenacao.id,
    curso.id,
    curso.nome,
    polo.id,
    polo.nome,
    coordenacao.vigente_de,
    coordenacao.vigente_ate
  FROM public.professores_coordenacoes AS coordenacao
  JOIN public.parceiros AS professor
    ON professor.id = coordenacao.professor_id
  JOIN public.cursos AS curso ON curso.id = coordenacao.curso_id
  JOIN public.polos AS polo ON polo.id = coordenacao.polo_id
  WHERE coordenacao.professor_id = p_professor_id
    AND coordenacao.polo_id = p_polo_id
    AND coordenacao.status = 'ATIVA'
    AND (
      professor.polo_id = coordenacao.polo_id
      OR coordenacao.polo_id = ANY(
        coalesce(professor.polo_ids, ARRAY[]::uuid[])
      )
    )
    AND upper(professor.tipo) = 'PROFESSOR'
    AND coalesce(public.is_active_status(professor.status), false)
    AND coalesce(public.is_active_status(curso.status), false)
    AND coalesce(public.is_active_status(polo.status), false)
    AND coordenacao.vigente_de <= statement_timestamp()
    AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
  ORDER BY curso.nome, polo.nome, coordenacao.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsaveis_legais_listar(
  p_polo_id uuid,
  p_include_global boolean,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 100));
  v_busca text := nullif(lower(btrim(coalesce(p_busca, ''))), '');
  v_busca_digitos text := nullif(
    pg_catalog.regexp_replace(coalesce(p_busca, ''), '\\D', '', 'g'),
    ''
  );
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_escopo_solicitado jsonb;
  v_pode_gerir_global boolean;
  v_cursor jsonb;
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
  v_items jsonb;
  v_next_cursor text;
  v_ultimo_created_at timestamptz;
  v_ultimo_id uuid;
  v_total_carregado integer := 0;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF v_status IS NOT NULL
     AND v_status NOT IN ('PENDENTE', 'ATIVO', 'BLOQUEADO', 'INATIVO') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_STATUS_INVALIDO';
  END IF;

  IF nullif(btrim(coalesce(p_cursor, '')), '') IS NOT NULL THEN
    v_cursor := public.portal_identidade_cursor_decodificar(p_cursor);
    v_cursor_created_at := (v_cursor ->> 'createdAt')::timestamptz;
    v_cursor_id := (v_cursor ->> 'id')::uuid;
  END IF;

  WITH pagina_base AS (
    SELECT
      responsavel.id,
      responsavel.nome,
      responsavel.cpf_normalizado AS cpf,
      responsavel.email,
      responsavel.telefone,
      responsavel.status,
      responsavel.auth_user_id,
      responsavel.identidade_verificada_em IS NOT NULL AS identidade_verificada,
      bloqueio.motivo IS NULL AS elegivel,
      bloqueio.motivo AS bloqueio_acesso,
      dependentes.total AS dependentes_ativos,
      responsavel.created_at,
      responsavel.updated_at
    FROM public.responsaveis_legais AS responsavel
    CROSS JOIN LATERAL (
      SELECT count(*)::bigint AS total
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = responsavel.id
        AND vinculo.status = 'VERIFICADO'
        AND vinculo.vigente_de <= statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > statement_timestamp()
        )
        AND upper(aluno.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
        AND public.portal_identidade_aluno_no_polo(aluno.id, p_polo_id)
    ) AS dependentes
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN responsavel.status <> 'ATIVO' THEN 'STATUS_NAO_ATIVO'
        WHEN responsavel.cpf_normalizado IS NULL THEN 'CPF_OBRIGATORIO'
        WHEN responsavel.email IS NULL THEN 'EMAIL_OBRIGATORIO'
        WHEN responsavel.identidade_verificada_em IS NULL
          THEN 'IDENTIDADE_NAO_VERIFICADA'
        WHEN dependentes.total = 0
          THEN 'VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO'
        ELSE NULL
      END AS motivo
    ) AS bloqueio
    WHERE public.portal_identidade_responsavel_no_escopo_solicitado(
        responsavel.id,
        p_polo_id,
        p_include_global
      )
      AND (v_status IS NULL OR responsavel.status = v_status)
      AND (
        v_busca IS NULL
        OR lower(responsavel.nome) LIKE '%' || v_busca || '%'
        OR (
          v_busca_digitos IS NOT NULL
          AND coalesce(responsavel.cpf_normalizado, '') LIKE
            '%' || v_busca_digitos || '%'
        )
        OR lower(coalesce(responsavel.email, '')) LIKE '%' || v_busca || '%'
      )
      AND (
        v_cursor_created_at IS NULL
        OR (responsavel.created_at, responsavel.id) <
          (v_cursor_created_at, v_cursor_id)
      )
    ORDER BY responsavel.created_at DESC, responsavel.id DESC
    LIMIT v_limite + 1
  ), selecionados AS (
    SELECT *
    FROM pagina_base AS pagina
    ORDER BY pagina.created_at DESC, pagina.id DESC
    LIMIT v_limite
  ), agregado AS (
    SELECT
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', item.id,
            'nome', item.nome,
            'cpf', item.cpf,
            'email', item.email,
            'telefone', item.telefone,
            'status', item.status,
            'authUserId', item.auth_user_id,
            'identidadeVerificada', item.identidade_verificada,
            'eligible', item.elegivel,
            'accessBlockReason', item.bloqueio_acesso,
            'dependentesAtivos', item.dependentes_ativos,
            'canManageGlobal', v_pode_gerir_global,
            'canVerify', v_pode_gerir_global,
            'createdAt', item.created_at,
            'updatedAt', item.updated_at
          ) ORDER BY item.created_at DESC, item.id DESC
        ),
        pg_catalog.jsonb_build_array()
      ) AS items,
      (pg_catalog.array_agg(
        item.created_at ORDER BY item.created_at DESC, item.id DESC
      ))[v_limite] AS ultimo_created_at,
      (pg_catalog.array_agg(
        item.id ORDER BY item.created_at DESC, item.id DESC
      ))[v_limite] AS ultimo_id
    FROM selecionados AS item
  )
  SELECT
    agregado.items,
    agregado.ultimo_created_at,
    agregado.ultimo_id,
    (SELECT count(*)::integer FROM pagina_base)
  INTO
    v_items,
    v_ultimo_created_at,
    v_ultimo_id,
    v_total_carregado
  FROM agregado;

  IF v_total_carregado > v_limite
     AND v_ultimo_created_at IS NOT NULL
     AND v_ultimo_id IS NOT NULL THEN
    v_next_cursor := public.portal_identidade_cursor_codificar(
      v_ultimo_created_at,
      v_ultimo_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'items', coalesce(v_items, pg_catalog.jsonb_build_array()),
    'nextCursor', v_next_cursor,
    'canManageGlobal', v_pode_gerir_global,
    'canVerify', v_pode_gerir_global,
    'canCreate', p_include_global AND v_pode_gerir_global
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_alunos_opcoes_vinculo(
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_escopo_solicitado jsonb;
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );

  SELECT pg_catalog.jsonb_build_object(
    'items',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', aluno.id,
          'nome', aluno.nome
        ) ORDER BY aluno.nome, aluno.id
      ),
      pg_catalog.jsonb_build_array()
    )
  )
  INTO v_resultado
  FROM public.parceiros AS aluno
  WHERE upper(aluno.tipo) = 'ALUNO'
    AND coalesce(public.is_active_status(aluno.status), false)
    AND public.portal_identidade_aluno_no_polo(aluno.id, p_polo_id);

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_obter(
  p_responsavel_legal_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_resultado jsonb;
  v_escopo_solicitado jsonb;
  v_pode_gerir_global boolean;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF p_responsavel_legal_id IS NULL
     OR NOT public.portal_identidade_responsavel_no_escopo_solicitado(
       p_responsavel_legal_id,
       p_polo_id,
       p_include_global
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', responsavel.id,
    'nome', responsavel.nome,
    'cpf', responsavel.cpf_normalizado,
    'email', responsavel.email,
    'telefone', responsavel.telefone,
    'status', responsavel.status,
    'authUserId', responsavel.auth_user_id,
    'identidadeVerificada', responsavel.identidade_verificada_em IS NOT NULL,
    'identidadeVerificadaEm', responsavel.identidade_verificada_em,
    'identidadeVerificacaoMetodo', CASE
      WHEN v_pode_gerir_global THEN responsavel.identidade_verificacao_metodo
      ELSE NULL
    END,
    'identidadeVerificacaoReferencia', CASE
      WHEN v_pode_gerir_global THEN responsavel.identidade_verificacao_referencia
      ELSE NULL
    END,
    'eligible', bloqueio.motivo IS NULL,
    'accessBlockReason', bloqueio.motivo,
    'canManageGlobal', v_pode_gerir_global,
    'canVerify', v_pode_gerir_global,
    'dependentesAtivos', vinculos.total_ativos,
    'vinculos', coalesce(vinculos.itens, pg_catalog.jsonb_build_array()),
    'createdAt', responsavel.created_at,
    'updatedAt', responsavel.updated_at
  )
    INTO v_resultado
  FROM public.responsaveis_legais AS responsavel
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (
        WHERE vinculo.status = 'VERIFICADO'
          AND vinculo.vigente_de <= statement_timestamp()
          AND (
            vinculo.vigente_ate IS NULL
            OR vinculo.vigente_ate > statement_timestamp()
          )
          AND upper(aluno.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno.status), false)
      )::bigint AS total_ativos,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', vinculo.id,
          'alunoId', aluno.id,
          'alunoNome', aluno.nome,
          'parentesco', vinculo.parentesco,
          'descricaoOutro', vinculo.descricao_outro,
          'status', vinculo.status,
          'verificadoEm', vinculo.verificado_em,
          'verificacaoMetodo', CASE
            WHEN v_pode_gerir_global THEN vinculo.verificacao_metodo
            ELSE NULL
          END,
          'verificacaoReferencia', CASE
            WHEN v_pode_gerir_global THEN vinculo.verificacao_referencia
            ELSE NULL
          END,
          'canVerify', v_pode_gerir_global,
          'vigenteDe', vinculo.vigente_de,
          'vigenteAte', vinculo.vigente_ate,
          'createdAt', vinculo.created_at,
          'updatedAt', vinculo.updated_at
        ) ORDER BY vinculo.created_at, vinculo.id
      ) AS itens
    FROM public.responsaveis_legais_alunos AS vinculo
    JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
    WHERE vinculo.responsavel_legal_id = responsavel.id
      AND public.portal_identidade_aluno_no_polo(aluno.id, p_polo_id)
  ) AS vinculos
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN responsavel.status <> 'ATIVO' THEN 'STATUS_NAO_ATIVO'
      WHEN responsavel.cpf_normalizado IS NULL THEN 'CPF_OBRIGATORIO'
      WHEN responsavel.email IS NULL THEN 'EMAIL_OBRIGATORIO'
      WHEN responsavel.identidade_verificada_em IS NULL
        THEN 'IDENTIDADE_NAO_VERIFICADA'
      WHEN vinculos.total_ativos = 0
        THEN 'VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO'
      ELSE NULL
    END AS motivo
  ) AS bloqueio
  WHERE responsavel.id = p_responsavel_legal_id;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
  END IF;

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_salvar(
  p_responsavel_legal_id uuid,
  p_dados jsonb,
  p_request_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_payload_sha256 text;
  v_replay jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_nome text;
  v_cpf text;
  v_email text;
  v_telefone text;
  v_status text;
  v_verificacao_metodo text;
  v_verificacao_referencia text;
  v_identidade_alterada boolean := false;
  v_ativacao_explicita boolean := false;
  v_escopo_solicitado jsonb;
  v_pode_gerir_global boolean;
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  v_actor := (v_escopo_solicitado ->> 'actorAuthUserId')::uuid;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'REQUEST_ID_OBRIGATORIO';
  END IF;

  PERFORM public.portal_identidade_validar_chaves_json(
    p_dados,
    ARRAY[
      'nome',
      'cpf',
      'email',
      'telefone',
      'status',
      'verificacaoMetodo',
      'verificacaoReferencia'
    ]::text[]
  );

  IF p_responsavel_legal_id IS NULL
     AND NOT (p_include_global AND v_pode_gerir_global) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_CRIACAO_GLOBAL_OBRIGATORIA';
  END IF;

  IF p_responsavel_legal_id IS NOT NULL
     AND NOT public.portal_identidade_responsavel_no_escopo_solicitado(
       p_responsavel_legal_id,
       p_polo_id,
       p_include_global
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
  END IF;

  IF p_responsavel_legal_id IS NOT NULL THEN
    SELECT responsavel.*
      INTO v_responsavel
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
    END IF;
  END IF;

  IF NOT v_pode_gerir_global THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(p_dados) AS chave(valor)
      WHERE chave.valor <> ALL(ARRAY['nome', 'status']::text[])
    ) OR (
      p_dados ? 'status'
      AND upper(btrim(coalesce(p_dados ->> 'status', ''))) <> 'PENDENTE'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
    END IF;

    IF p_responsavel_legal_id IS NOT NULL AND (
      v_responsavel.criado_por IS DISTINCT FROM v_actor
      OR v_responsavel.status <> 'PENDENTE'
      OR v_responsavel.auth_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'GESTOR_LOCAL_APENAS_RASCUNHO_PROPRIO';
    END IF;
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'responsavelLegalId', p_responsavel_legal_id,
      'dados', p_dados,
      'poloId', p_polo_id,
      'includeGlobal', p_include_global
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'RESPONSAVEL_SALVAR',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF p_responsavel_legal_id IS NOT NULL THEN
    SELECT responsavel.*
      INTO v_responsavel
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_responsavel_legal_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
    END IF;

    IF NOT public.portal_identidade_responsavel_no_escopo_solicitado(
      p_responsavel_legal_id,
      p_polo_id,
      p_include_global
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
    END IF;

    IF NOT v_pode_gerir_global AND (
      v_responsavel.criado_por IS DISTINCT FROM v_actor
      OR v_responsavel.status <> 'PENDENTE'
      OR v_responsavel.auth_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'GESTOR_LOCAL_APENAS_RASCUNHO_PROPRIO';
    END IF;
  END IF;

  -- O replay já serializou o request e, quando existe, a linha do responsável
  -- já está bloqueada. A autorização humana e o escopo são refeitos agora.
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  IF (v_escopo_solicitado ->> 'actorAuthUserId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOR_GESTOR_ALTERADO_DURANTE_OPERACAO';
  END IF;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF p_responsavel_legal_id IS NOT NULL
     AND NOT public.portal_identidade_responsavel_no_escopo_solicitado(
       p_responsavel_legal_id,
       p_polo_id,
       p_include_global
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
  END IF;

  IF NOT v_pode_gerir_global AND (
    EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(p_dados) AS chave(valor)
      WHERE chave.valor <> ALL(ARRAY['nome', 'status']::text[])
    )
    OR (
      p_dados ? 'status'
      AND upper(btrim(coalesce(p_dados ->> 'status', ''))) <> 'PENDENTE'
    )
    OR (
      p_responsavel_legal_id IS NOT NULL
      AND (
        v_responsavel.criado_por IS DISTINCT FROM v_actor
        OR v_responsavel.status <> 'PENDENTE'
        OR v_responsavel.auth_user_id IS NOT NULL
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_LOCAL_APENAS_RASCUNHO_PROPRIO';
  END IF;

  v_nome := btrim(coalesce(p_dados ->> 'nome', v_responsavel.nome));
  v_cpf := CASE
    WHEN p_dados ? 'cpf' THEN nullif(
      pg_catalog.regexp_replace(coalesce(p_dados ->> 'cpf', ''), '\\D', '', 'g'),
      ''
    )
    ELSE v_responsavel.cpf_normalizado
  END;
  v_email := CASE
    WHEN p_dados ? 'email' THEN nullif(lower(btrim(p_dados ->> 'email')), '')
    ELSE v_responsavel.email
  END;
  v_telefone := CASE
    WHEN p_dados ? 'telefone' THEN nullif(
      pg_catalog.regexp_replace(
        coalesce(p_dados ->> 'telefone', ''),
        '\\D',
        '',
        'g'
      ),
      ''
    )
    ELSE v_responsavel.telefone
  END;
  v_status := upper(btrim(coalesce(
    p_dados ->> 'status',
    v_responsavel.status,
    'PENDENTE'
  )));
  v_verificacao_metodo := CASE
    WHEN p_dados ? 'verificacaoMetodo'
      THEN nullif(upper(btrim(p_dados ->> 'verificacaoMetodo')), '')
    ELSE v_responsavel.identidade_verificacao_metodo
  END;
  v_verificacao_referencia := CASE
    WHEN p_dados ? 'verificacaoReferencia'
      THEN nullif(btrim(p_dados ->> 'verificacaoReferencia'), '')
    ELSE v_responsavel.identidade_verificacao_referencia
  END;
  v_identidade_alterada := p_responsavel_legal_id IS NOT NULL AND (
    v_cpf IS DISTINCT FROM v_responsavel.cpf_normalizado
    OR v_email IS DISTINCT FROM v_responsavel.email
  );
  v_ativacao_explicita := p_dados ? 'status'
    AND upper(btrim(coalesce(p_dados ->> 'status', ''))) = 'ATIVO';

  IF v_ativacao_explicita AND (
    NOT v_pode_gerir_global
    OR NOT (p_dados ? 'verificacaoMetodo')
    OR NOT (p_dados ? 'verificacaoReferencia')
    OR v_verificacao_metodo NOT IN ('DOCUMENTO_CONFERIDO', 'PRESENCIAL')
    OR char_length(coalesce(v_verificacao_referencia, '')) NOT BETWEEN 3 AND 120
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_ATIVACAO_EXIGE_VERIFICACAO_GLOBAL';
  END IF;

  IF NOT v_ativacao_explicita AND (
    p_dados ? 'verificacaoMetodo'
    OR p_dados ? 'verificacaoReferencia'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_VERIFICACAO_EXIGE_ATIVACAO_EXPLICITA';
  END IF;

  IF v_responsavel.auth_user_id IS NOT NULL AND v_identidade_alterada THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_IDENTIDADE_VINCULADA_IMUTAVEL';
  END IF;

  IF v_identidade_alterada AND NOT v_ativacao_explicita
     AND v_status = 'ATIVO' THEN
    v_status := 'PENDENTE';
  END IF;

  IF v_nome IS NULL OR char_length(v_nome) < 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_NOME_OBRIGATORIO';
  END IF;

  IF v_status NOT IN ('PENDENTE', 'ATIVO', 'BLOQUEADO', 'INATIVO') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_STATUS_INVALIDO';
  END IF;

  IF p_responsavel_legal_id IS NULL THEN
    INSERT INTO public.responsaveis_legais (
      nome,
      cpf_normalizado,
      email,
      telefone,
      status,
      identidade_verificada_em,
      identidade_verificada_por,
      identidade_verificacao_metodo,
      identidade_verificacao_referencia,
      criado_por,
      atualizado_por
    ) VALUES (
      v_nome,
      v_cpf,
      v_email,
      v_telefone,
      v_status,
      CASE WHEN v_status = 'ATIVO' THEN statement_timestamp() ELSE NULL END,
      CASE WHEN v_status = 'ATIVO' THEN v_actor ELSE NULL END,
      CASE WHEN v_status = 'ATIVO' THEN v_verificacao_metodo ELSE NULL END,
      CASE WHEN v_status = 'ATIVO' THEN v_verificacao_referencia ELSE NULL END,
      v_actor,
      v_actor
    )
    RETURNING * INTO v_responsavel;
  ELSE
    UPDATE public.responsaveis_legais
    SET
      nome = v_nome,
      cpf_normalizado = v_cpf,
      email = v_email,
      telefone = v_telefone,
      status = v_status,
      identidade_verificada_em = CASE
        WHEN v_ativacao_explicita THEN statement_timestamp()
        WHEN v_identidade_alterada THEN NULL
        ELSE identidade_verificada_em
      END,
      identidade_verificada_por = CASE
        WHEN v_ativacao_explicita THEN v_actor
        WHEN v_identidade_alterada THEN NULL
        ELSE identidade_verificada_por
      END,
      identidade_verificacao_metodo = CASE
        WHEN v_ativacao_explicita THEN v_verificacao_metodo
        WHEN v_identidade_alterada THEN NULL
        ELSE identidade_verificacao_metodo
      END,
      identidade_verificacao_referencia = CASE
        WHEN v_ativacao_explicita THEN v_verificacao_referencia
        WHEN v_identidade_alterada THEN NULL
        ELSE identidade_verificacao_referencia
      END,
      atualizado_por = v_actor
    WHERE id = p_responsavel_legal_id
    RETURNING * INTO v_responsavel;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'responsavelLegalId', v_responsavel.id,
    'status', v_responsavel.status,
    'authUserId', v_responsavel.auth_user_id,
    'affectedPoloIds', public.portal_identidade_responsavel_polos_afetados(
      v_responsavel.id,
      p_polo_id
    )
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'RESPONSAVEL_SALVAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_vincular_aluno(
  p_responsavel_legal_id uuid,
  p_aluno_id uuid,
  p_dados jsonb,
  p_request_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_payload_sha256 text;
  v_replay jsonb;
  v_vinculo public.responsaveis_legais_alunos%ROWTYPE;
  v_parentesco text;
  v_descricao_outro text;
  v_status text;
  v_vigente_de timestamptz;
  v_vigente_ate timestamptz;
  v_verificacao_metodo text;
  v_verificacao_referencia text;
  v_verificando boolean := false;
  v_escopo_solicitado jsonb;
  v_pode_gerir_global boolean;
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  v_actor := (v_escopo_solicitado ->> 'actorAuthUserId')::uuid;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF p_request_id IS NULL OR p_responsavel_legal_id IS NULL OR p_aluno_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_PARAMETROS_OBRIGATORIOS';
  END IF;

  PERFORM public.portal_identidade_validar_chaves_json(
    p_dados,
    ARRAY[
      'parentesco',
      'descricaoOutro',
      'status',
      'vigenteDe',
      'vigenteAte',
      'verificacaoMetodo',
      'verificacaoReferencia'
    ]::text[]
  );

  IF NOT public.portal_identidade_responsavel_no_escopo_solicitado(
      p_responsavel_legal_id,
      p_polo_id,
      p_include_global
    )
     OR NOT public.portal_identidade_aluno_no_polo(
       p_aluno_id,
       p_polo_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'VINCULO_FORA_DO_ESCOPO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_aluno_id
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_ALUNO_INVALIDO';
  END IF;

  SELECT vinculo.*
    INTO v_vinculo
  FROM public.responsaveis_legais_alunos AS vinculo
  WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
    AND vinculo.aluno_id = p_aluno_id
    AND vinculo.status IN ('PENDENTE', 'VERIFICADO');

  IF NOT v_pode_gerir_global AND (
    (p_dados ? 'status' AND upper(btrim(coalesce(p_dados ->> 'status', ''))) <> 'PENDENTE')
    OR p_dados ? 'verificacaoMetodo'
    OR p_dados ? 'verificacaoReferencia'
    OR v_vinculo.status = 'VERIFICADO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_VERIFICAR';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'responsavelLegalId', p_responsavel_legal_id,
      'alunoId', p_aluno_id,
      'dados', p_dados,
      'poloId', p_polo_id,
      'includeGlobal', p_include_global
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'RESPONSAVEL_VINCULAR_ALUNO',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'responsavel-aluno:' || p_responsavel_legal_id::text || ':' ||
        p_aluno_id::text,
      0
    )
  );

  SELECT vinculo.*
    INTO v_vinculo
  FROM public.responsaveis_legais_alunos AS vinculo
  WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
    AND vinculo.aluno_id = p_aluno_id
    AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
  FOR UPDATE;

  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  IF (v_escopo_solicitado ->> 'actorAuthUserId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOR_GESTOR_ALTERADO_DURANTE_OPERACAO';
  END IF;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF NOT public.portal_identidade_responsavel_no_escopo_solicitado(
      p_responsavel_legal_id,
      p_polo_id,
      p_include_global
    )
     OR NOT public.portal_identidade_aluno_no_polo(
       p_aluno_id,
       p_polo_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'VINCULO_FORA_DO_ESCOPO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_aluno_id
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_ALUNO_INVALIDO';
  END IF;

  IF NOT v_pode_gerir_global AND v_vinculo.status = 'VERIFICADO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_VERIFICAR';
  END IF;

  IF v_vinculo.status = 'VERIFICADO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_VERIFICADO_IMUTAVEL_USE_REVOGACAO';
  END IF;

  v_parentesco := upper(btrim(coalesce(
    p_dados ->> 'parentesco',
    v_vinculo.parentesco
  )));
  v_descricao_outro := CASE
    WHEN v_parentesco = 'OUTRO' THEN nullif(btrim(coalesce(
      p_dados ->> 'descricaoOutro',
      v_vinculo.descricao_outro
    )), '')
    ELSE NULL
  END;
  v_status := upper(btrim(coalesce(
    p_dados ->> 'status',
    v_vinculo.status,
    'PENDENTE'
  )));
  v_vigente_de := CASE
    WHEN p_dados ? 'vigenteDe'
      THEN (p_dados ->> 'vigenteDe')::timestamptz
    ELSE coalesce(v_vinculo.vigente_de, statement_timestamp())
  END;
  v_vigente_ate := CASE
    WHEN p_dados ? 'vigenteAte' AND nullif(p_dados ->> 'vigenteAte', '') IS NOT NULL
      THEN (p_dados ->> 'vigenteAte')::timestamptz
    WHEN p_dados ? 'vigenteAte' THEN NULL
    ELSE v_vinculo.vigente_ate
  END;
  v_verificacao_metodo := CASE
    WHEN p_dados ? 'verificacaoMetodo'
      THEN nullif(upper(btrim(p_dados ->> 'verificacaoMetodo')), '')
    ELSE v_vinculo.verificacao_metodo
  END;
  v_verificacao_referencia := CASE
    WHEN p_dados ? 'verificacaoReferencia'
      THEN nullif(btrim(p_dados ->> 'verificacaoReferencia'), '')
    ELSE v_vinculo.verificacao_referencia
  END;
  v_verificando := v_status = 'VERIFICADO'
    AND v_vinculo.status IS DISTINCT FROM 'VERIFICADO';

  IF (p_dados ? 'verificacaoMetodo') IS DISTINCT FROM
     (p_dados ? 'verificacaoReferencia') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_PROVA_METODO_E_REFERENCIA_OBRIGATORIOS';
  END IF;

  IF v_parentesco NOT IN ('MAE', 'PAI', 'TUTOR', 'GUARDIAO_JUDICIAL', 'OUTRO')
     OR v_status NOT IN ('PENDENTE', 'VERIFICADO') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_DADOS_INVALIDOS';
  END IF;

  IF v_vinculo.status = 'VERIFICADO' AND v_status <> 'VERIFICADO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_VERIFICADO_USA_REVOGACAO';
  END IF;

  IF v_status = 'VERIFICADO' AND (
    NOT v_pode_gerir_global
    OR (
      v_verificando
      AND (
        NOT (p_dados ? 'verificacaoMetodo')
        OR NOT (p_dados ? 'verificacaoReferencia')
      )
    )
    OR v_verificacao_metodo NOT IN (
      'DOCUMENTO_CONFERIDO',
      'DECISAO_JUDICIAL',
      'PRESENCIAL'
    )
    OR char_length(coalesce(v_verificacao_referencia, '')) NOT BETWEEN 3 AND 120
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'VINCULO_VERIFICADO_EXIGE_PROVA_GLOBAL';
  END IF;

  IF v_status <> 'VERIFICADO' AND (
    p_dados ? 'verificacaoMetodo'
    OR p_dados ? 'verificacaoReferencia'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_PROVA_EXIGE_STATUS_VERIFICADO';
  END IF;

  IF v_vinculo.id IS NULL THEN
    INSERT INTO public.responsaveis_legais_alunos (
      responsavel_legal_id,
      aluno_id,
      parentesco,
      descricao_outro,
      status,
      vigente_de,
      vigente_ate,
      verificado_em,
      verificado_por,
      verificacao_metodo,
      verificacao_referencia,
      criado_por,
      atualizado_por
    ) VALUES (
      p_responsavel_legal_id,
      p_aluno_id,
      v_parentesco,
      v_descricao_outro,
      v_status,
      v_vigente_de,
      v_vigente_ate,
      CASE WHEN v_status = 'VERIFICADO' THEN statement_timestamp() ELSE NULL END,
      CASE WHEN v_status = 'VERIFICADO' THEN v_actor ELSE NULL END,
      CASE WHEN v_status = 'VERIFICADO' THEN v_verificacao_metodo ELSE NULL END,
      CASE WHEN v_status = 'VERIFICADO' THEN v_verificacao_referencia ELSE NULL END,
      v_actor,
      v_actor
    )
    RETURNING * INTO v_vinculo;
  ELSE
    UPDATE public.responsaveis_legais_alunos
    SET
      parentesco = v_parentesco,
      descricao_outro = v_descricao_outro,
      status = v_status,
      vigente_de = v_vigente_de,
      vigente_ate = v_vigente_ate,
      verificado_em = CASE
        WHEN v_status = 'VERIFICADO'
          THEN coalesce(verificado_em, statement_timestamp())
        ELSE NULL
      END,
      verificado_por = CASE
        WHEN v_status = 'VERIFICADO' THEN coalesce(verificado_por, v_actor)
        ELSE NULL
      END,
      verificacao_metodo = CASE
        WHEN v_status = 'VERIFICADO' THEN v_verificacao_metodo
        ELSE NULL
      END,
      verificacao_referencia = CASE
        WHEN v_status = 'VERIFICADO' THEN v_verificacao_referencia
        ELSE NULL
      END,
      atualizado_por = v_actor
    WHERE id = v_vinculo.id
    RETURNING * INTO v_vinculo;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'vinculoId', v_vinculo.id,
    'responsavelLegalId', v_vinculo.responsavel_legal_id,
    'alunoId', v_vinculo.aluno_id,
    'status', v_vinculo.status,
    'affectedPoloIds', public.portal_identidade_responsavel_polos_afetados(
      v_vinculo.responsavel_legal_id,
      p_polo_id
    )
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'RESPONSAVEL_VINCULAR_ALUNO',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_revogar_vinculo(
  p_vinculo_id uuid,
  p_motivo text,
  p_request_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_payload_sha256 text;
  v_replay jsonb;
  v_vinculo public.responsaveis_legais_alunos%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_escopo_solicitado jsonb;
  v_pode_gerir_global boolean;
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  v_actor := (v_escopo_solicitado ->> 'actorAuthUserId')::uuid;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF p_request_id IS NULL OR p_vinculo_id IS NULL
     OR char_length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_REVOGACAO_INVALIDA';
  END IF;

  SELECT vinculo.*
    INTO v_vinculo
  FROM public.responsaveis_legais_alunos AS vinculo
  WHERE vinculo.id = p_vinculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'VINCULO_NAO_ENCONTRADO';
  END IF;

  IF NOT public.portal_identidade_aluno_no_polo(
    v_vinculo.aluno_id,
    p_polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'VINCULO_FORA_DO_ESCOPO';
  END IF;

  IF v_vinculo.status = 'VERIFICADO' AND NOT v_pode_gerir_global THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_REVOGAR_VERIFICADO';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'vinculoId', p_vinculo_id,
      'motivo', v_motivo,
      'poloId', p_polo_id,
      'includeGlobal', p_include_global
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'RESPONSAVEL_REVOGAR_VINCULO',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT vinculo.*
    INTO v_vinculo
  FROM public.responsaveis_legais_alunos AS vinculo
  WHERE vinculo.id = p_vinculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'VINCULO_NAO_ENCONTRADO';
  END IF;

  v_escopo_solicitado :=
    public.portal_identidade_validar_escopo_solicitado(
      p_polo_id,
      p_include_global
    );
  IF (v_escopo_solicitado ->> 'actorAuthUserId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOR_GESTOR_ALTERADO_DURANTE_OPERACAO';
  END IF;
  v_pode_gerir_global := coalesce(
    (v_escopo_solicitado ->> 'allPolos')::boolean,
    false
  );

  IF NOT public.portal_identidade_aluno_no_polo(
    v_vinculo.aluno_id,
    p_polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'VINCULO_FORA_DO_ESCOPO';
  END IF;

  IF v_vinculo.status = 'VERIFICADO' AND NOT v_pode_gerir_global THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_REVOGAR_VERIFICADO';
  END IF;

  IF v_vinculo.status NOT IN ('PENDENTE', 'VERIFICADO') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'VINCULO_NAO_REVOGAVEL';
  END IF;

  UPDATE public.responsaveis_legais_alunos
  SET
    status = 'REVOGADO',
    revogado_em = statement_timestamp(),
    revogado_por = v_actor,
    motivo_revogacao = v_motivo,
    atualizado_por = v_actor
  WHERE id = p_vinculo_id
  RETURNING * INTO v_vinculo;

  v_resultado := pg_catalog.jsonb_build_object(
    'vinculoId', v_vinculo.id,
    'status', v_vinculo.status,
    'revogadoEm', v_vinculo.revogado_em,
    'affectedPoloIds', public.portal_identidade_responsavel_polos_afetados(
      v_vinculo.responsavel_legal_id,
      p_polo_id
    )
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'RESPONSAVEL_REVOGAR_VINCULO',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.professores_coordenacoes_listar(
  p_polo_id uuid,
  p_include_global boolean,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 100));
  v_busca text := nullif(lower(btrim(coalesce(p_busca, ''))), '');
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_cursor jsonb;
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
  v_items jsonb;
  v_next_cursor text;
  v_ultimo_created_at timestamptz;
  v_ultimo_id uuid;
  v_total_carregado integer := 0;
BEGIN
  PERFORM public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );

  IF v_status IS NOT NULL
     AND v_status NOT IN ('ATIVA', 'REVOGADA', 'EXPIRADA') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_STATUS_INVALIDO';
  END IF;

  IF nullif(btrim(coalesce(p_cursor, '')), '') IS NOT NULL THEN
    v_cursor := public.portal_identidade_cursor_decodificar(p_cursor);
    v_cursor_created_at := (v_cursor ->> 'createdAt')::timestamptz;
    v_cursor_id := (v_cursor ->> 'id')::uuid;
  END IF;

  WITH pagina_base AS (
    SELECT
      coordenacao.id,
      professor.id AS professor_id,
      professor.nome AS professor_nome,
      curso.id AS curso_id,
      curso.nome AS curso_nome,
      polo.id AS polo_id,
      polo.nome AS polo_nome,
      estado.status_efetivo AS status,
      coordenacao.vigente_de,
      coordenacao.vigente_ate,
      coordenacao.observacao,
      coordenacao.created_at,
      coordenacao.updated_at
    FROM public.professores_coordenacoes AS coordenacao
    JOIN public.parceiros AS professor ON professor.id = coordenacao.professor_id
    JOIN public.cursos AS curso ON curso.id = coordenacao.curso_id
    JOIN public.polos AS polo ON polo.id = coordenacao.polo_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN coordenacao.status = 'ATIVA'
          AND coordenacao.vigente_ate IS NOT NULL
          AND coordenacao.vigente_ate <= statement_timestamp()
          THEN 'EXPIRADA'::text
        ELSE coordenacao.status
      END AS status_efetivo
    ) AS estado
    WHERE public.portal_identidade_professor_no_escopo_gestor(
        professor.id,
        polo.id
      )
      AND polo.id = p_polo_id
      AND (v_status IS NULL OR estado.status_efetivo = v_status)
      AND (
        v_busca IS NULL
        OR lower(professor.nome) LIKE '%' || v_busca || '%'
        OR lower(curso.nome) LIKE '%' || v_busca || '%'
        OR lower(polo.nome) LIKE '%' || v_busca || '%'
      )
      AND (
        v_cursor_created_at IS NULL
        OR (coordenacao.created_at, coordenacao.id) <
          (v_cursor_created_at, v_cursor_id)
      )
    ORDER BY coordenacao.created_at DESC, coordenacao.id DESC
    LIMIT v_limite + 1
  ), selecionados AS (
    SELECT *
    FROM pagina_base AS pagina
    ORDER BY pagina.created_at DESC, pagina.id DESC
    LIMIT v_limite
  ), agregado AS (
    SELECT
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', item.id,
            'professorId', item.professor_id,
            'professorNome', item.professor_nome,
            'cursoId', item.curso_id,
            'cursoNome', item.curso_nome,
            'poloId', item.polo_id,
            'poloNome', item.polo_nome,
            'status', item.status,
            'vigenteDe', item.vigente_de,
            'vigenteAte', item.vigente_ate,
            'observacao', item.observacao,
            'createdAt', item.created_at,
            'updatedAt', item.updated_at
          ) ORDER BY item.created_at DESC, item.id DESC
        ),
        pg_catalog.jsonb_build_array()
      ) AS items,
      (pg_catalog.array_agg(
        item.created_at ORDER BY item.created_at DESC, item.id DESC
      ))[v_limite] AS ultimo_created_at,
      (pg_catalog.array_agg(
        item.id ORDER BY item.created_at DESC, item.id DESC
      ))[v_limite] AS ultimo_id
    FROM selecionados AS item
  )
  SELECT
    agregado.items,
    agregado.ultimo_created_at,
    agregado.ultimo_id,
    (SELECT count(*)::integer FROM pagina_base)
  INTO
    v_items,
    v_ultimo_created_at,
    v_ultimo_id,
    v_total_carregado
  FROM agregado;

  IF v_total_carregado > v_limite
     AND v_ultimo_created_at IS NOT NULL
     AND v_ultimo_id IS NOT NULL THEN
    v_next_cursor := public.portal_identidade_cursor_codificar(
      v_ultimo_created_at,
      v_ultimo_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'items', coalesce(v_items, pg_catalog.jsonb_build_array()),
    'nextCursor', v_next_cursor
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.professores_coordenacoes_opcoes_cadastro(
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  PERFORM public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );

  WITH polos_autorizados AS (
    SELECT
      polo.id,
      polo.nome
    FROM public.polos AS polo
    WHERE coalesce(public.is_active_status(polo.status), false)
      AND polo.id = p_polo_id
  ), professores_base AS (
    SELECT
      professor.id,
      professor.nome,
      ARRAY(
        SELECT polo.id
        FROM polos_autorizados AS polo
        WHERE polo.id = professor.polo_id
          OR polo.id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
        ORDER BY polo.id
      ) AS polo_ids
    FROM public.parceiros AS professor
    WHERE upper(professor.tipo) = 'PROFESSOR'
      AND coalesce(public.is_active_status(professor.status), false)
  ), professores_autorizados AS (
    SELECT
      professor.id,
      professor.nome,
      professor.polo_ids
    FROM professores_base AS professor
    WHERE pg_catalog.cardinality(professor.polo_ids) > 0
  ), cursos_autorizados AS (
    SELECT
      curso.id,
      curso.nome
    FROM public.cursos AS curso
    WHERE coalesce(public.is_active_status(curso.status), false)
      AND EXISTS (SELECT 1 FROM polos_autorizados)
  )
  SELECT pg_catalog.jsonb_build_object(
    'professores', coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', professor.id,
            'nome', professor.nome,
            'poloIds', professor.polo_ids
          ) ORDER BY professor.nome, professor.id
        )
        FROM professores_autorizados AS professor
      ),
      pg_catalog.jsonb_build_array()
    ),
    'cursos', coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', curso.id,
            'nome', curso.nome
          ) ORDER BY curso.nome, curso.id
        )
        FROM cursos_autorizados AS curso
      ),
      pg_catalog.jsonb_build_array()
    ),
    'polos', coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', polo.id,
            'nome', polo.nome
          ) ORDER BY polo.nome, polo.id
        )
        FROM polos_autorizados AS polo
      ),
      pg_catalog.jsonb_build_array()
    )
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.professor_coordenacao_salvar(
  p_professor_coordenacao_id uuid,
  p_dados jsonb,
  p_request_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_escopo_solicitado jsonb;
  v_payload_sha256 text;
  v_replay jsonb;
  v_coordenacao public.professores_coordenacoes%ROWTYPE;
  v_professor_id uuid;
  v_curso_id uuid;
  v_polo_id uuid;
  v_vigente_de timestamptz;
  v_vigente_ate timestamptz;
  v_observacao text;
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado := public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );
  v_actor := (v_escopo_solicitado ->> 'actorAuthUserId')::uuid;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'REQUEST_ID_OBRIGATORIO';
  END IF;

  PERFORM public.portal_identidade_validar_chaves_json(
    p_dados,
    ARRAY[
      'professorId',
      'cursoId',
      'poloId',
      'vigenteDe',
      'vigenteAte',
      'observacao'
    ]::text[]
  );

  IF NOT coalesce(p_dados, '{}'::jsonb) ? 'poloId'
     OR nullif(p_dados ->> 'poloId', '') IS NULL
     OR (p_dados ->> 'poloId')::uuid IS DISTINCT FROM p_polo_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COORDENACAO_POLO_SELECIONADO_DIVERGENTE';
  END IF;

  IF p_professor_coordenacao_id IS NOT NULL THEN
    SELECT coordenacao.*
      INTO v_coordenacao
    FROM public.professores_coordenacoes AS coordenacao
    WHERE coordenacao.id = p_professor_coordenacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'COORDENACAO_NAO_ENCONTRADA';
    END IF;

    IF v_coordenacao.polo_id IS DISTINCT FROM p_polo_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
    END IF;

    IF NOT public.portal_identidade_professor_no_escopo_gestor(
      v_coordenacao.professor_id,
      v_coordenacao.polo_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
    END IF;
  END IF;

  v_professor_id := coalesce(
    nullif(p_dados ->> 'professorId', '')::uuid,
    v_coordenacao.professor_id
  );
  v_curso_id := coalesce(
    nullif(p_dados ->> 'cursoId', '')::uuid,
    v_coordenacao.curso_id
  );
  v_polo_id := coalesce(
    nullif(p_dados ->> 'poloId', '')::uuid,
    v_coordenacao.polo_id
  );

  IF v_professor_id IS NULL OR v_curso_id IS NULL OR v_polo_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COORDENACAO_ESCOPO_OBRIGATORIO';
  END IF;

  IF p_professor_coordenacao_id IS NOT NULL AND (
    v_professor_id IS DISTINCT FROM v_coordenacao.professor_id
    OR v_curso_id IS DISTINCT FROM v_coordenacao.curso_id
    OR v_polo_id IS DISTINCT FROM v_coordenacao.polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COORDENACAO_ESCOPO_IMUTAVEL';
  END IF;

  IF NOT public.portal_identidade_professor_no_escopo_gestor(
    v_professor_id,
    v_polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cursos AS curso
    WHERE curso.id = v_curso_id
      AND coalesce(public.is_active_status(curso.status), false)
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.polos AS polo
    WHERE polo.id = v_polo_id
      AND coalesce(public.is_active_status(polo.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'COORDENACAO_CURSO_OU_POLO_INVALIDO';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'professorCoordenacaoId', p_professor_coordenacao_id,
      'dados', p_dados,
      'poloId', p_polo_id,
      'includeGlobal', p_include_global
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'COORDENACAO_SALVAR',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'coordenacao:' || v_curso_id::text || ':' || v_polo_id::text,
      0
    )
  );

  IF p_professor_coordenacao_id IS NOT NULL THEN
    SELECT coordenacao.*
      INTO v_coordenacao
    FROM public.professores_coordenacoes AS coordenacao
    WHERE coordenacao.id = p_professor_coordenacao_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'COORDENACAO_NAO_ENCONTRADA';
    END IF;

    IF v_professor_id IS DISTINCT FROM v_coordenacao.professor_id
       OR v_curso_id IS DISTINCT FROM v_coordenacao.curso_id
       OR v_polo_id IS DISTINCT FROM v_coordenacao.polo_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'COORDENACAO_ESCOPO_ALTERADO_DURANTE_OPERACAO';
    END IF;

    IF v_coordenacao.status <> 'ATIVA' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'COORDENACAO_NAO_EDITAVEL';
    END IF;
  END IF;

  v_vigente_de := CASE
    WHEN p_dados ? 'vigenteDe'
      THEN (p_dados ->> 'vigenteDe')::timestamptz
    ELSE coalesce(v_coordenacao.vigente_de, statement_timestamp())
  END;
  v_vigente_ate := CASE
    WHEN p_dados ? 'vigenteAte' AND nullif(p_dados ->> 'vigenteAte', '') IS NOT NULL
      THEN (p_dados ->> 'vigenteAte')::timestamptz
    WHEN p_dados ? 'vigenteAte' THEN NULL
    ELSE v_coordenacao.vigente_ate
  END;
  v_observacao := CASE
    WHEN p_dados ? 'observacao'
      THEN nullif(btrim(p_dados ->> 'observacao'), '')
    ELSE v_coordenacao.observacao
  END;

  -- A autorização e o escopo são revalidados sob os locks imediatamente antes
  -- da primeira mutação para impedir TOCTOU entre o preflight e a gravação.
  v_escopo_solicitado := public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );
  IF (v_escopo_solicitado ->> 'actorAuthUserId')::uuid
     IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOR_GESTOR_ALTERADO_DURANTE_OPERACAO';
  END IF;

  IF NOT public.portal_identidade_professor_no_escopo_gestor(
    v_professor_id,
    v_polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cursos AS curso
    WHERE curso.id = v_curso_id
      AND coalesce(public.is_active_status(curso.status), false)
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.polos AS polo
    WHERE polo.id = v_polo_id
      AND coalesce(public.is_active_status(polo.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'COORDENACAO_CURSO_OU_POLO_INVALIDO';
  END IF;

  UPDATE public.professores_coordenacoes
  SET
    status = 'EXPIRADA',
    atualizado_por = v_actor
  WHERE curso_id = v_curso_id
    AND polo_id = v_polo_id
    AND status = 'ATIVA'
    AND vigente_ate IS NOT NULL
    AND vigente_ate <= statement_timestamp();

  IF p_professor_coordenacao_id IS NULL THEN
    INSERT INTO public.professores_coordenacoes (
      professor_id,
      curso_id,
      polo_id,
      status,
      vigente_de,
      vigente_ate,
      observacao,
      concedida_por,
      criado_por,
      atualizado_por
    ) VALUES (
      v_professor_id,
      v_curso_id,
      v_polo_id,
      'ATIVA',
      v_vigente_de,
      v_vigente_ate,
      v_observacao,
      v_actor,
      v_actor,
      v_actor
    )
    RETURNING * INTO v_coordenacao;
  ELSE
    UPDATE public.professores_coordenacoes
    SET
      vigente_de = v_vigente_de,
      vigente_ate = v_vigente_ate,
      observacao = v_observacao,
      atualizado_por = v_actor
    WHERE id = p_professor_coordenacao_id
    RETURNING * INTO v_coordenacao;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'professorCoordenacaoId', v_coordenacao.id,
    'professorId', v_coordenacao.professor_id,
    'cursoId', v_coordenacao.curso_id,
    'poloId', v_coordenacao.polo_id,
    'status', v_coordenacao.status
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'COORDENACAO_SALVAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.professor_coordenacao_revogar(
  p_professor_coordenacao_id uuid,
  p_motivo text,
  p_request_id uuid,
  p_polo_id uuid,
  p_include_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_escopo_solicitado jsonb;
  v_payload_sha256 text;
  v_replay jsonb;
  v_coordenacao public.professores_coordenacoes%ROWTYPE;
  v_professor_id uuid;
  v_curso_id uuid;
  v_polo_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_resultado jsonb;
BEGIN
  v_escopo_solicitado := public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );
  v_actor := (v_escopo_solicitado ->> 'actorAuthUserId')::uuid;

  IF p_request_id IS NULL OR p_professor_coordenacao_id IS NULL
     OR char_length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_REVOGACAO_INVALIDA';
  END IF;

  SELECT coordenacao.*
    INTO v_coordenacao
  FROM public.professores_coordenacoes AS coordenacao
  WHERE coordenacao.id = p_professor_coordenacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'COORDENACAO_NAO_ENCONTRADA';
  END IF;

  IF v_coordenacao.polo_id IS DISTINCT FROM p_polo_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
  END IF;

  IF NOT public.portal_identidade_professor_no_escopo_gestor(
    v_coordenacao.professor_id,
    v_coordenacao.polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
  END IF;

  v_professor_id := v_coordenacao.professor_id;
  v_curso_id := v_coordenacao.curso_id;
  v_polo_id := v_coordenacao.polo_id;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'professorCoordenacaoId', p_professor_coordenacao_id,
      'motivo', v_motivo,
      'poloId', p_polo_id,
      'includeGlobal', p_include_global
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'COORDENACAO_REVOGAR',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'coordenacao:' || v_curso_id::text || ':' || v_polo_id::text,
      0
    )
  );

  SELECT coordenacao.*
    INTO v_coordenacao
  FROM public.professores_coordenacoes AS coordenacao
  WHERE coordenacao.id = p_professor_coordenacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'COORDENACAO_NAO_ENCONTRADA';
  END IF;

  IF v_professor_id IS DISTINCT FROM v_coordenacao.professor_id
     OR v_curso_id IS DISTINCT FROM v_coordenacao.curso_id
     OR v_polo_id IS DISTINCT FROM v_coordenacao.polo_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'COORDENACAO_ESCOPO_ALTERADO_DURANTE_OPERACAO';
  END IF;

  -- Repete autorização e escopo sob os mesmos locks usados por salvar.
  v_escopo_solicitado := public.portal_identidade_validar_escopo_solicitado(
    p_polo_id,
    p_include_global
  );
  IF (v_escopo_solicitado ->> 'actorAuthUserId')::uuid
     IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOR_GESTOR_ALTERADO_DURANTE_OPERACAO';
  END IF;

  IF NOT public.portal_identidade_professor_no_escopo_gestor(
    v_coordenacao.professor_id,
    v_coordenacao.polo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COORDENACAO_FORA_DO_ESCOPO';
  END IF;

  IF v_coordenacao.status <> 'ATIVA' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COORDENACAO_NAO_REVOGAVEL';
  END IF;

  UPDATE public.professores_coordenacoes
  SET
    status = 'REVOGADA',
    revogada_em = statement_timestamp(),
    revogada_por = v_actor,
    motivo_revogacao = v_motivo,
    atualizado_por = v_actor
  WHERE id = p_professor_coordenacao_id
  RETURNING * INTO v_coordenacao;

  v_resultado := pg_catalog.jsonb_build_object(
    'professorCoordenacaoId', v_coordenacao.id,
    'poloId', v_coordenacao.polo_id,
    'status', v_coordenacao.status,
    'revogadaEm', v_coordenacao.revogada_em
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'COORDENACAO_REVOGAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_acesso_preparar(
  p_responsavel_legal_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_tem_vinculo_aberto boolean;
  v_tem_vinculo_gerenciavel boolean;
  v_tem_vinculo_verificado_ativo boolean;
  v_bloqueio text;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  IF p_responsavel_legal_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_LEGAL_ID_OBRIGATORIO';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
        AND vinculo.vigente_de <= statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > statement_timestamp()
        )
    ),
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
        AND vinculo.vigente_de <= statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > statement_timestamp()
        )
        AND upper(aluno.tipo) = 'ALUNO'
        AND public.portal_identidade_actor_pode_gerir_aluno(v_contexto, aluno.id)
    ),
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status = 'VERIFICADO'
        AND vinculo.vigente_de <= statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > statement_timestamp()
        )
        AND upper(aluno.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
        AND public.portal_identidade_actor_pode_gerir_aluno(v_contexto, aluno.id)
    )
  INTO
    v_tem_vinculo_aberto,
    v_tem_vinculo_gerenciavel,
    v_tem_vinculo_verificado_ativo;

  IF NOT (
    coalesce((v_contexto ->> 'allPolos')::boolean, false)
    OR v_tem_vinculo_gerenciavel
    OR (
      NOT v_tem_vinculo_aberto
      AND v_responsavel.criado_por = p_actor_auth_user_id
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
  END IF;

  v_bloqueio := CASE
    WHEN v_responsavel.status <> 'ATIVO' THEN 'STATUS_NAO_ATIVO'
    WHEN v_responsavel.cpf_normalizado IS NULL THEN 'CPF_OBRIGATORIO'
    WHEN v_responsavel.email IS NULL THEN 'EMAIL_OBRIGATORIO'
    WHEN v_responsavel.identidade_verificada_em IS NULL
      THEN 'IDENTIDADE_NAO_VERIFICADA'
    WHEN NOT v_tem_vinculo_verificado_ativo
      THEN 'VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO'
    ELSE NULL
  END;

  RETURN pg_catalog.jsonb_build_object(
    'responsavelLegalId', v_responsavel.id,
    'nome', v_responsavel.nome,
    'cpf', v_responsavel.cpf_normalizado,
    'email', v_responsavel.email,
    'status', v_responsavel.status,
    'authUserId', v_responsavel.auth_user_id,
    'eligible', v_bloqueio IS NULL,
    'accessBlockReason', v_bloqueio
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_legal_acesso_vincular(
  p_responsavel_legal_id uuid,
  p_auth_user_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_preparacao jsonb;
  v_payload_sha256 text;
  v_replay jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_email text;
  v_resultado jsonb;
BEGIN
  -- A autorização humana é revalidada antes de qualquer replay idempotente.
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF p_responsavel_legal_id IS NULL OR p_auth_user_id IS NULL
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_PARAMETROS_OBRIGATORIOS';
  END IF;

  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' ||
        coalesce(v_preparacao ->> 'accessBlockReason', 'REQUISITOS_INCOMPLETOS');
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'responsavelLegalId', p_responsavel_legal_id,
      'authUserId', p_auth_user_id
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    p_actor_auth_user_id,
    p_request_id,
    'RESPONSAVEL_ACESSO_VINCULAR',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('responsavel-auth:' || p_auth_user_id::text, 0)
  );

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
  END IF;

  -- Repete elegibilidade e escopo depois do lock para impedir TOCTOU.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' ||
        coalesce(v_preparacao ->> 'accessBlockReason', 'REQUISITOS_INCOMPLETOS');
  END IF;

  SELECT lower(btrim(usuario_auth.email))
    INTO v_auth_email
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = p_auth_user_id;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM v_responsavel.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS outro_responsavel
    WHERE outro_responsavel.auth_user_id = p_auth_user_id
      AND outro_responsavel.id <> v_responsavel.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'AUTH_USER_JA_VINCULADO_A_OUTRO_RESPONSAVEL';
  END IF;

  -- Se o Auth já tem outro papel, pelo menos uma identidade canônica ligada
  -- a ele precisa comprovar o mesmo CPF e e-mail. Registros secundários
  -- antigos não anulam uma correspondência válida; Auth sem perfil é convite novo.
  IF (
    EXISTS (
      SELECT 1 FROM public.parceiros AS parceiro_existente
      WHERE parceiro_existente.auth_user_id = p_auth_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.usuarios_sistema AS gestor_existente
      WHERE gestor_existente.auth_user_id = p_auth_user_id
    )
  ) AND NOT (
    EXISTS (
      SELECT 1
      FROM public.parceiros AS parceiro
      WHERE parceiro.auth_user_id = p_auth_user_id
        AND pg_catalog.regexp_replace(
          coalesce(parceiro.cpf_cnpj, ''),
          '\\D',
          '',
          'g'
        ) = v_responsavel.cpf_normalizado
        AND lower(btrim(coalesce(
          nullif(btrim(parceiro.auth_login_email), ''),
          nullif(btrim(parceiro.email), ''),
          ''
        ))) = v_responsavel.email
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.auth_user_id = p_auth_user_id
        AND pg_catalog.regexp_replace(
          coalesce(gestor.cpf, ''),
          '\\D',
          '',
          'g'
        ) = v_responsavel.cpf_normalizado
        AND lower(btrim(coalesce(gestor.email, ''))) = v_responsavel.email
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;

  IF v_responsavel.auth_user_id IS NOT NULL
     AND v_responsavel.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'RESPONSAVEL_ACESSO_JA_VINCULADO';
  END IF;

  IF v_responsavel.auth_user_id IS NULL THEN
    UPDATE public.responsaveis_legais
    SET
      auth_user_id = p_auth_user_id,
      atualizado_por = p_actor_auth_user_id
    WHERE id = p_responsavel_legal_id
    RETURNING * INTO v_responsavel;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'responsavelLegalId', v_responsavel.id,
    'authUserId', v_responsavel.auth_user_id,
    'linked', true
  );

  RETURN public.portal_identidade_registrar_operacao(
    p_actor_auth_user_id,
    p_request_id,
    'RESPONSAVEL_ACESSO_VINCULAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_identidade_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_operacoes_append_only()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_validar_vinculo()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_validar_coordenacao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_autorizar_gestor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_gestor_escopo_atual()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_gestor_pode_gerir_global()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_validar_escopo_solicitado(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_aluno_no_polo(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_responsavel_no_escopo_solicitado(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_responsavel_polos_afetados(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_aluno_no_escopo_gestor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_responsavel_no_escopo_gestor(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_professor_no_escopo_gestor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_actor_gestor_contexto(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_exigir_service_role_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_actor_pode_gerir_aluno(jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_validar_chaves_json(jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_payload_sha256(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_cursor_hmac_secret()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_cursor_codificar(timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_cursor_decodificar(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_termos_versao_vigente()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_obter_replay(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_registrar_operacao(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.portal_listar_perfis()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_alunos_opcoes_vinculo(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.coordenador_listar_atribuicoes(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsaveis_legais_listar(uuid, boolean, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_obter(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_salvar(uuid, jsonb, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_vincular_aluno(uuid, uuid, jsonb, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_revogar_vinculo(uuid, text, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.professores_coordenacoes_listar(uuid, boolean, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.professores_coordenacoes_opcoes_cadastro(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.professor_coordenacao_salvar(uuid, jsonb, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.professor_coordenacao_revogar(uuid, text, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.portal_listar_perfis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_alunos_opcoes_vinculo(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_listar_atribuicoes(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsaveis_legais_listar(uuid, boolean, text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_obter(uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_salvar(uuid, jsonb, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_vincular_aluno(uuid, uuid, jsonb, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_revogar_vinculo(uuid, text, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.professores_coordenacoes_listar(uuid, boolean, text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.professores_coordenacoes_opcoes_cadastro(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.professor_coordenacao_salvar(uuid, jsonb, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.professor_coordenacao_revogar(uuid, text, uuid, uuid, boolean)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid)
  TO service_role;

COMMENT ON TABLE public.responsaveis_legais IS
  'Identidade própria e mínima do responsável legal; não é um tipo de parceiro.';
COMMENT ON TABLE public.responsaveis_legais_alunos IS
  'Vínculo temporal N:N entre responsável legal e aluno, verificado por gestor autorizado.';
COMMENT ON TABLE public.professores_coordenacoes IS
  'Atribuição temporal de coordenação por curso e polo a um parceiro Professor.';
COMMENT ON FUNCTION public.professores_coordenacoes_opcoes_cadastro(uuid, boolean) IS
  'Opções ativas de coordenação limitadas ao polo explicitamente autorizado; includeGlobal nunca mistura outros polos.';
COMMENT ON FUNCTION public.portal_listar_perfis() IS
  'Lista contextos multipapel do Auth atual; Coordenador é contexto separado e fail-closed.';
COMMENT ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid) IS
  'Cria ou vincula o contexto Aluno ao Auth atual pelo contexto canônico autenticado; idempotente e sem manipular senha ou aceite jurídico.';
COMMENT ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid) IS
  'Aceita a versão canônica vigente dos termos após o Auth confirmar a troca de senha; idempotente por ator e requestId.';
COMMENT ON FUNCTION public.responsavel_legal_alunos_opcoes_vinculo(uuid, boolean) IS
  'Lista somente id e nome de Alunos ativos do polo explicitamente autorizado para vínculo com responsável legal.';
COMMENT ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid) IS
  'RPC interna service_role que revalida ator, escopo e elegibilidade antes da criação de acesso.';
COMMENT ON FUNCTION public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid) IS
  'RPC interna service_role que vincula Auth sob lock, com prova multipapel e idempotência.';

COMMIT;
