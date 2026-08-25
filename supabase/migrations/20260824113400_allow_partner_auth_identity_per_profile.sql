-- Permite que uma identidade Auth represente um Aluno e um Professor,
-- preservando uma unica linha por tipo e a mesma identidade civil em todos
-- os papeis vinculados ao UID.

BEGIN;

-- Fecha a janela entre o preflight e a instalacao das constraints. Qualquer
-- escrita concorrente nas tres fontes canonicas aguarda o COMMIT deste lote.
LOCK TABLE
  public.usuarios_sistema,
  public.parceiros,
  public.responsaveis_legais
IN SHARE ROW EXCLUSIVE MODE;

-- O ambiente atual possui unicidade global. Este preflight tambem protege
-- ambientes divergentes antes de substituir o indice.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id IS NOT NULL
    GROUP BY parceiro.auth_user_id, upper(parceiro.tipo)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'PARCEIRO_AUTH_UID_TIPO_DUPLICADO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id IS NOT NULL
    GROUP BY parceiro.auth_user_id
    HAVING count(*) > 1
      AND (
        count(*) FILTER (WHERE upper(btrim(coalesce(parceiro.tipo, ''))) = 'ALUNO') <> 1
        OR count(*) FILTER (WHERE upper(btrim(coalesce(parceiro.tipo, ''))) = 'PROFESSOR') <> 1
        OR count(*) <> 2
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PARCEIRO_AUTH_UID_PAPEIS_NAO_SUPORTADOS';
  END IF;

  IF EXISTS (
    WITH identidades AS (
      SELECT
        parceiro.auth_user_id,
        nullif(
          pg_catalog.regexp_replace(
            coalesce(parceiro.cpf_cnpj, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ) AS cpf,
        lower(coalesce(
          nullif(btrim(parceiro.auth_login_email), ''),
          nullif(btrim(parceiro.email), '')
        )) AS email,
        upper(btrim(coalesce(parceiro.tipo, ''))) AS tipo_parceiro
      FROM public.parceiros AS parceiro
      WHERE parceiro.auth_user_id IS NOT NULL
      UNION ALL
      SELECT
        gestor.auth_user_id,
        nullif(
          pg_catalog.regexp_replace(
            coalesce(gestor.cpf, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ),
        lower(nullif(btrim(gestor.email), '')),
        NULL::text
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.auth_user_id IS NOT NULL
      UNION ALL
      SELECT
        responsavel.auth_user_id,
        nullif(
          pg_catalog.regexp_replace(
            coalesce(responsavel.cpf_normalizado, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ),
        lower(nullif(btrim(responsavel.email), '')),
        NULL::text
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.auth_user_id IS NOT NULL
    ), compartilhadas AS (
      SELECT identidade.auth_user_id
      FROM identidades AS identidade
      GROUP BY identidade.auth_user_id
      HAVING count(*) > 1
    )
    SELECT 1
    FROM identidades AS identidade
    JOIN compartilhadas AS compartilhada
      ON compartilhada.auth_user_id = identidade.auth_user_id
    JOIN auth.users AS auth_user
      ON auth_user.id = identidade.auth_user_id
    GROUP BY identidade.auth_user_id, auth_user.email
    HAVING
      pg_catalog.bool_or(
        identidade.cpf IS NULL
        OR NOT coalesce(public.is_valid_cpf(identidade.cpf), false)
      )
      OR pg_catalog.bool_or(identidade.email IS NULL)
      OR count(DISTINCT identidade.cpf) <> 1
      OR count(DISTINCT identidade.email) <> 1
      OR pg_catalog.bool_or(
        identidade.tipo_parceiro IS NOT NULL
        AND identidade.tipo_parceiro NOT IN ('ALUNO', 'PROFESSOR')
      )
      OR min(identidade.email) IS DISTINCT FROM
        lower(nullif(btrim(auth_user.email), ''))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;
END;
$preflight$;

DROP INDEX IF EXISTS public.uq_parceiros_auth_user_id;

CREATE UNIQUE INDEX uq_parceiros_auth_user_id_tipo
  ON public.parceiros (auth_user_id, upper(tipo))
  WHERE auth_user_id IS NOT NULL;

COMMENT ON INDEX public.uq_parceiros_auth_user_id_tipo IS
  'Permite um UID somente como Aluno e Professor, com uma linha por tipo.';

-- A validacao e adiada para enxergar o estado final de mudancas coordenadas
-- entre Auth, Gestor, Parceiro e Responsavel na mesma transacao.
CREATE OR REPLACE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid := (pg_catalog.to_jsonb(NEW) ->> 'id')::uuid;
  v_auth_user_id uuid;
  v_cpf text;
  v_email text;
  v_auth_email text;
  v_tem_outro_perfil boolean;
BEGIN
  IF TG_TABLE_NAME = 'parceiros' THEN
    SELECT
      parceiro.auth_user_id,
      nullif(
        pg_catalog.regexp_replace(
          coalesce(parceiro.cpf_cnpj, ''),
          '[^0-9]',
          '',
          'g'
        ),
        ''
      ),
      lower(coalesce(
        nullif(btrim(parceiro.auth_login_email), ''),
        nullif(btrim(parceiro.email), '')
      ))
    INTO v_auth_user_id, v_cpf, v_email
    FROM public.parceiros AS parceiro
    WHERE parceiro.id = v_id;
  ELSIF TG_TABLE_NAME = 'usuarios_sistema' THEN
    SELECT
      gestor.auth_user_id,
      nullif(
        pg_catalog.regexp_replace(
          coalesce(gestor.cpf, ''),
          '[^0-9]',
          '',
          'g'
        ),
        ''
      ),
      lower(nullif(btrim(gestor.email), ''))
    INTO v_auth_user_id, v_cpf, v_email
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.id = v_id;
  ELSIF TG_TABLE_NAME = 'responsaveis_legais' THEN
    SELECT
      responsavel.auth_user_id,
      nullif(
        pg_catalog.regexp_replace(
          coalesce(responsavel.cpf_normalizado, ''),
          '[^0-9]',
          '',
          'g'
        ),
        ''
      ),
      lower(nullif(btrim(responsavel.email), ''))
    INTO v_auth_user_id, v_cpf, v_email
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = v_id;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_IDENTIDADE_TABELA_NAO_SUPORTADA';
  END IF;

  IF NOT FOUND OR v_auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-auth-identity:' || v_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = v_auth_user_id
    GROUP BY parceiro.auth_user_id
    HAVING count(*) > 1
      AND (
        count(*) FILTER (WHERE upper(btrim(coalesce(parceiro.tipo, ''))) = 'ALUNO') <> 1
        OR count(*) FILTER (WHERE upper(btrim(coalesce(parceiro.tipo, ''))) = 'PROFESSOR') <> 1
        OR count(*) <> 2
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PARCEIRO_AUTH_UID_PAPEIS_NAO_SUPORTADOS';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.parceiros AS parceiro
      WHERE parceiro.auth_user_id = v_auth_user_id
        AND NOT (TG_TABLE_NAME = 'parceiros' AND parceiro.id = v_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.auth_user_id = v_auth_user_id
        AND NOT (TG_TABLE_NAME = 'usuarios_sistema' AND gestor.id = v_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.auth_user_id = v_auth_user_id
        AND NOT (
          TG_TABLE_NAME = 'responsaveis_legais'
          AND responsavel.id = v_id
        )
  )
  INTO v_tem_outro_perfil;

  IF v_tem_outro_perfil AND EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = v_auth_user_id
      AND upper(btrim(coalesce(parceiro.tipo, '')))
        NOT IN ('ALUNO', 'PROFESSOR')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PARCEIRO_AUTH_UID_PAPEIS_NAO_SUPORTADOS';
  END IF;

  -- Perfil unico continua aceitando o contrato legado. A identidade civil
  -- completa passa a ser obrigatoria somente quando o UID e compartilhado.
  IF NOT v_tem_outro_perfil THEN
    RETURN NEW;
  END IF;

  SELECT lower(nullif(btrim(auth_user.email), ''))
  INTO v_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_auth_user_id;

  IF v_cpf IS NULL
     OR NOT coalesce(public.is_valid_cpf(v_cpf), false)
     OR v_email IS NULL
     OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = v_auth_user_id
      AND NOT (TG_TABLE_NAME = 'parceiros' AND parceiro.id = v_id)
      AND (
        nullif(
          pg_catalog.regexp_replace(
            coalesce(parceiro.cpf_cnpj, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ) IS DISTINCT FROM v_cpf
        OR lower(coalesce(
          nullif(btrim(parceiro.auth_login_email), ''),
          nullif(btrim(parceiro.email), '')
        )) IS DISTINCT FROM v_email
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = v_auth_user_id
      AND NOT (TG_TABLE_NAME = 'usuarios_sistema' AND gestor.id = v_id)
      AND (
        nullif(
          pg_catalog.regexp_replace(
            coalesce(gestor.cpf, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ) IS DISTINCT FROM v_cpf
        OR lower(nullif(btrim(gestor.email), '')) IS DISTINCT FROM v_email
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = v_auth_user_id
      AND NOT (
        TG_TABLE_NAME = 'responsaveis_legais'
        AND responsavel.id = v_id
      )
      AND (
        nullif(
          pg_catalog.regexp_replace(
            coalesce(responsavel.cpf_normalizado, ''),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ) IS DISTINCT FROM v_cpf
        OR lower(nullif(btrim(responsavel.email), '')) IS DISTINCT FROM v_email
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_insert
  ON public.parceiros;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_insert
AFTER INSERT ON public.parceiros
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_update
  ON public.parceiros;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_update
AFTER UPDATE OF auth_user_id, tipo, cpf_cnpj, email, auth_login_email
ON public.parceiros
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_insert
  ON public.usuarios_sistema;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_insert
AFTER INSERT ON public.usuarios_sistema
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_update
  ON public.usuarios_sistema;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_update
AFTER UPDATE OF auth_user_id, cpf, email ON public.usuarios_sistema
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_insert
  ON public.responsaveis_legais;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_insert
AFTER INSERT ON public.responsaveis_legais
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

DROP TRIGGER IF EXISTS z90_portal_auth_consistencia_update
  ON public.responsaveis_legais;
CREATE CONSTRAINT TRIGGER z90_portal_auth_consistencia_update
AFTER UPDATE OF auth_user_id, cpf_normalizado, email
ON public.responsaveis_legais
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  public.portal_identidade_validar_consistencia_auth_compartilhado();

-- O linker implicito permanece conservador: esta migration nao o redefine.
-- Compartilhamento de UID exige um fluxo explicito que informe auth_user_id e
-- seja validado pelos constraint triggers acima.

COMMIT;
