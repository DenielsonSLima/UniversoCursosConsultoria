BEGIN;

-- ---------------------------------------------------------------------------
-- Contas financeiras: natureza, identidade estável e polos autorizados.
-- polo_id continua sendo o polo titular; o uso por outros polos fica na junção.
-- ---------------------------------------------------------------------------

ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS codigo_interno text,
  ADD COLUMN IF NOT EXISTS natureza text NOT NULL DEFAULT 'BANCARIA',
  ADD COLUMN IF NOT EXISTS system_managed boolean NOT NULL DEFAULT false;

-- O cálculo canônico de saldo, criado adiante, já precisa distinguir
-- transferências físicas de simples rateios internos entre polos.
ALTER TABLE public.transferencias_contas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'FISICA';

ALTER TABLE public.contas_bancarias
  DROP CONSTRAINT IF EXISTS contas_bancarias_natureza_check;

ALTER TABLE public.contas_bancarias
  ADD CONSTRAINT contas_bancarias_natureza_check
  CHECK (natureza IN ('BANCARIA', 'CAIXA_INTERNO'));

CREATE UNIQUE INDEX IF NOT EXISTS contas_bancarias_codigo_interno_uidx
  ON public.contas_bancarias (codigo_interno)
  WHERE codigo_interno IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contas_bancarias_caixa_por_polo_uidx
  ON public.contas_bancarias (polo_id)
  WHERE natureza = 'CAIXA_INTERNO';

DROP INDEX IF EXISTS public.contas_bancarias_identidade_bancaria_uidx;

-- Uma conta física existe uma única vez. O acesso por várias unidades é
-- representado em contas_bancarias_polos, nunca duplicando o registro/saldo.
CREATE UNIQUE INDEX contas_bancarias_identidade_bancaria_uidx
  ON public.contas_bancarias (
    lower(trim(banco)),
    upper(regexp_replace(agencia, '[^[:alnum:]]', '', 'g')),
    upper(regexp_replace(conta, '[^[:alnum:]]', '', 'g'))
  )
  WHERE natureza = 'BANCARIA';

CREATE TABLE IF NOT EXISTS public.contas_bancarias_polos (
  conta_bancaria_id uuid NOT NULL
    REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  polo_id uuid NOT NULL
    REFERENCES public.polos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_bancaria_id, polo_id)
);

CREATE INDEX IF NOT EXISTS contas_bancarias_polos_polo_idx
  ON public.contas_bancarias_polos (polo_id, conta_bancaria_id);

INSERT INTO public.contas_bancarias_polos (conta_bancaria_id, polo_id)
SELECT id, polo_id
FROM public.contas_bancarias
WHERE polo_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_bank_account_owner_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.polo_id IS NOT NULL THEN
    INSERT INTO public.contas_bancarias_polos (conta_bancaria_id, polo_id)
    VALUES (NEW.id, NEW.polo_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_bank_account_owner_access_trigger
  ON public.contas_bancarias;

CREATE TRIGGER ensure_bank_account_owner_access_trigger
AFTER INSERT OR UPDATE OF polo_id
ON public.contas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.ensure_bank_account_owner_access();

CREATE OR REPLACE FUNCTION public.conta_bancaria_disponivel_no_polo(
  p_conta_bancaria_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contas_bancarias cb
    JOIN public.contas_bancarias_polos acesso
      ON acesso.conta_bancaria_id = cb.id
    JOIN public.polos polo
      ON polo.id = acesso.polo_id
     AND lower(polo.status) = 'ativo'
    WHERE cb.id = p_conta_bancaria_id
      AND cb.ativo = true
      AND acesso.polo_id = p_polo_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_conta_bancaria(
  p_conta_bancaria_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_global_module(
    ARRAY['financeiro', 'caixa', 'configuracoes']
  )
  OR EXISTS (
    SELECT 1
    FROM public.contas_bancarias_polos acesso
    WHERE acesso.conta_bancaria_id = p_conta_bancaria_id
      AND public.gestor_has_any_module_for_polo(
        ARRAY['financeiro', 'caixa', 'configuracoes'],
        acesso.polo_id
      )
  );
$$;

ALTER TABLE public.contas_bancarias_polos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_contas_bancarias_polos_read
  ON public.contas_bancarias_polos;
CREATE POLICY portal_contas_bancarias_polos_read
  ON public.contas_bancarias_polos
  FOR SELECT
  TO authenticated
  USING (public.can_access_conta_bancaria(conta_bancaria_id));

DROP POLICY IF EXISTS portal_contas_bancarias_polos_global_insert
  ON public.contas_bancarias_polos;
CREATE POLICY portal_contas_bancarias_polos_global_insert
  ON public.contas_bancarias_polos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.gestor_has_any_global_module(
      ARRAY['financeiro', 'caixa', 'configuracoes']
    )
  );

DROP POLICY IF EXISTS portal_contas_bancarias_polos_global_delete
  ON public.contas_bancarias_polos;
CREATE POLICY portal_contas_bancarias_polos_global_delete
  ON public.contas_bancarias_polos
  FOR DELETE
  TO authenticated
  USING (
    public.gestor_has_any_global_module(
      ARRAY['financeiro', 'caixa', 'configuracoes']
    )
  );

DROP POLICY IF EXISTS portal_contas_bancarias_gestor_read
  ON public.contas_bancarias;
CREATE POLICY portal_contas_bancarias_gestor_read
  ON public.contas_bancarias
  FOR SELECT
  TO authenticated
  USING (public.can_access_conta_bancaria(id));

REVOKE ALL ON TABLE public.contas_bancarias_polos FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.contas_bancarias_polos TO authenticated;
GRANT ALL ON TABLE public.contas_bancarias_polos TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contas_bancarias_polos'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.contas_bancarias_polos;
  END IF;
END
$$;

ALTER TABLE public.contas_bancarias REPLICA IDENTITY FULL;
ALTER TABLE public.contas_bancarias_polos REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Cadastro atômico da conta e dos polos em que ela pode ser movimentada.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.salvar_conta_bancaria_secure(
  p_polo_id uuid,
  p_banco text,
  p_titular text,
  p_agencia text,
  p_conta text,
  p_tipo text,
  p_polos_uso uuid[],
  p_ativo boolean DEFAULT true,
  p_conta_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_natureza text;
  v_banco text;
  v_titular text;
  v_agencia text;
  v_conta text;
  v_tipo text;
  v_cnpj text;
  v_polo_nome text;
  v_polo_is_matriz boolean;
  v_polos uuid[];
  v_system_managed boolean := false;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.gestor_has_any_global_module(
       ARRAY['financeiro', 'caixa', 'configuracoes']
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao cadastro de contas.'
      USING ERRCODE = '42501';
  END IF;

  SELECT nome, cnpj, is_matriz
  INTO v_polo_nome, v_cnpj, v_polo_is_matriz
  FROM public.polos
  WHERE id = p_polo_id
    AND lower(status) = 'ativo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Polo titular inválido ou inativo.';
  END IF;

  v_natureza := CASE
    WHEN upper(trim(coalesce(p_tipo, ''))) IN ('CAIXA', 'CAIXA INTERNO')
      THEN 'CAIXA_INTERNO'
    ELSE 'BANCARIA'
  END;

  IF v_natureza = 'CAIXA_INTERNO' THEN
    v_banco := 'CAIXA DA UNIDADE';
    v_titular := coalesce(nullif(trim(p_titular), ''), v_polo_nome);
    v_agencia := 'CAIXA';
    v_conta := 'CX-' || substring(
      regexp_replace(coalesce(v_cnpj, ''), '\D', '', 'g')
      FROM 9 FOR 4
    );
    v_tipo := 'Caixa';
    v_polos := ARRAY[p_polo_id];
  ELSE
    v_banco := nullif(trim(p_banco), '');
    v_titular := nullif(trim(p_titular), '');
    v_agencia := nullif(trim(p_agencia), '');
    v_conta := nullif(trim(p_conta), '');
    v_tipo := nullif(trim(p_tipo), '');
    v_polos := ARRAY(
      SELECT DISTINCT value
      FROM unnest(coalesce(p_polos_uso, ARRAY[]::uuid[]) || p_polo_id) value
      WHERE value IS NOT NULL
    );

    IF v_banco IS NULL OR v_titular IS NULL OR v_agencia IS NULL
       OR v_conta IS NULL OR v_tipo IS NULL THEN
      RAISE EXCEPTION 'Preencha banco, titular, agência, conta e tipo.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_polos) polo_uso
    LEFT JOIN public.polos p ON p.id = polo_uso
    WHERE p.id IS NULL OR lower(p.status) <> 'ativo'
  ) THEN
    RAISE EXCEPTION 'A lista de polos autorizados contém uma unidade inválida.';
  END IF;

  IF NOT coalesce(v_polo_is_matriz, false)
     AND EXISTS (
       SELECT 1
       FROM unnest(v_polos) polo_uso
       WHERE polo_uso <> p_polo_id
     ) THEN
    RAISE EXCEPTION
      'Somente a Matriz pode compartilhar uma conta com outros polos.';
  END IF;

  IF p_conta_id IS NULL THEN
    INSERT INTO public.contas_bancarias (
      polo_id,
      banco,
      titular,
      agencia,
      conta,
      tipo,
      saldo_inicial,
      data_saldo,
      ativo,
      codigo_interno,
      natureza,
      system_managed,
      updated_at
    )
    VALUES (
      p_polo_id,
      v_banco,
      v_titular,
      v_agencia,
      v_conta,
      v_tipo,
      0,
      CURRENT_DATE,
      coalesce(p_ativo, true),
      CASE
        WHEN v_natureza = 'CAIXA_INTERNO'
          THEN 'CAIXA:' || p_polo_id::text
        ELSE NULL
      END,
      v_natureza,
      false,
      now()
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT system_managed
    INTO v_system_managed
    FROM public.contas_bancarias
    WHERE id = p_conta_id;

    IF v_system_managed THEN
      RAISE EXCEPTION
        'Esta conta é gerenciada automaticamente pela integração bancária.';
    END IF;

    UPDATE public.contas_bancarias
    SET polo_id = p_polo_id,
        banco = v_banco,
        titular = v_titular,
        agencia = v_agencia,
        conta = v_conta,
        tipo = v_tipo,
        ativo = coalesce(p_ativo, ativo),
        codigo_interno = CASE
          WHEN v_natureza = 'CAIXA_INTERNO'
            THEN 'CAIXA:' || p_polo_id::text
          ELSE codigo_interno
        END,
        natureza = v_natureza,
        updated_at = now()
    WHERE id = p_conta_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conta bancária não encontrada.';
    END IF;
  END IF;

  DELETE FROM public.contas_bancarias_polos
  WHERE conta_bancaria_id = v_id;

  INSERT INTO public.contas_bancarias_polos (conta_bancaria_id, polo_id)
  SELECT v_id, polo_uso
  FROM unnest(v_polos) polo_uso
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Contas Caixa individuais e conta Banese da matriz, compartilhada.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_polo record;
  v_banese_id uuid;
  v_banese_data date;
BEGIN
  FOR v_polo IN
    SELECT id, nome, cnpj
    FROM public.polos
    WHERE lower(status) = 'ativo'
  LOOP
    INSERT INTO public.contas_bancarias (
      polo_id,
      banco,
      titular,
      agencia,
      conta,
      tipo,
      saldo_inicial,
      data_saldo,
      ativo,
      codigo_interno,
      natureza,
      system_managed,
      updated_at
    )
    VALUES (
      v_polo.id,
      'CAIXA DA UNIDADE',
      v_polo.nome,
      'CAIXA',
      'CX-' || substring(
        regexp_replace(coalesce(v_polo.cnpj, ''), '\D', '', 'g')
        FROM 9 FOR 4
      ),
      'Caixa',
      0,
      CURRENT_DATE,
      true,
      'CAIXA:' || v_polo.id::text,
      'CAIXA_INTERNO',
      true,
      now()
    )
    ON CONFLICT (codigo_interno) WHERE codigo_interno IS NOT NULL
    DO UPDATE SET
      banco = EXCLUDED.banco,
      titular = EXCLUDED.titular,
      agencia = EXCLUDED.agencia,
      conta = EXCLUDED.conta,
      tipo = EXCLUDED.tipo,
      natureza = EXCLUDED.natureza,
      system_managed = true,
      ativo = true,
      updated_at = now();
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_providers provider
    JOIN public.payment_gateway_credentials credential
      ON credential.provider_code = provider.code
     AND credential.environment = 'production'
     AND credential.configured = true
     AND upper(coalesce(credential.last_test_status, '')) = 'OK'
    JOIN public.payment_gateway_routes route
      ON route.provider_code = provider.code
     AND route.environment = credential.environment
     AND route.credential_id = credential.id
     AND route.enabled = true
    JOIN public.payment_gateway_issuer_config issuer
      ON issuer.active = true
     AND issuer.issuer_polo_id =
       '44444444-4444-4444-4444-444444444444'::uuid
    WHERE provider.code = 'banese_card'
      AND provider.active = true
  ) THEN
    RETURN;
  END IF;

  SELECT min(coalesce(data_pagamento, created_at::date))
  INTO v_banese_data
  FROM public.contas_receber
  WHERE gateway_provider = 'banese_card'
    AND gateway_environment = 'production';

  INSERT INTO public.contas_bancarias (
    polo_id,
    banco,
    titular,
    agencia,
    conta,
    tipo,
    saldo_inicial,
    data_saldo,
    ativo,
    codigo_interno,
    natureza,
    system_managed,
    updated_at
  )
  VALUES (
    '44444444-4444-4444-4444-444444444444',
    'BANESE',
    'UNIVERSO CURSOS E CONSULTORIA LTDA',
    '033',
    '03/100649-0',
    'Corrente',
    0,
    coalesce(v_banese_data, CURRENT_DATE),
    true,
    'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444',
    'BANCARIA',
    true,
    now()
  )
  ON CONFLICT (codigo_interno) WHERE codigo_interno IS NOT NULL
  DO UPDATE SET
    polo_id = EXCLUDED.polo_id,
    banco = EXCLUDED.banco,
    titular = EXCLUDED.titular,
    agencia = EXCLUDED.agencia,
    conta = EXCLUDED.conta,
    tipo = EXCLUDED.tipo,
      natureza = EXCLUDED.natureza,
      ativo = true,
      system_managed = true,
    data_saldo = LEAST(
      coalesce(public.contas_bancarias.data_saldo, EXCLUDED.data_saldo),
      EXCLUDED.data_saldo
    ),
    updated_at = now()
  RETURNING id INTO v_banese_id;

  INSERT INTO public.contas_bancarias_polos (conta_bancaria_id, polo_id)
  SELECT v_banese_id, id
  FROM public.polos
  WHERE lower(status) = 'ativo'
  ON CONFLICT DO NOTHING;
END
$$;

ALTER TABLE public.payment_gateway_issuer_config
  ADD COLUMN IF NOT EXISTS settlement_account_id uuid
  REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.payment_gateway_settlement_accounts (
  provider_code text NOT NULL
    REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  environment text NOT NULL
    CHECK (environment IN ('sandbox', 'production')),
  issuer_polo_id uuid NOT NULL
    REFERENCES public.polos(id) ON DELETE RESTRICT,
  conta_bancaria_id uuid NOT NULL
    REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_code, environment, issuer_polo_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE public.payment_gateway_settlement_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_gateway_settlement_accounts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payment_gateway_settlement_accounts TO service_role;

CREATE OR REPLACE FUNCTION public.sync_banese_settlement_account_secure()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready boolean;
  v_issuer_id uuid;
  v_account_id uuid;
  v_data_saldo date;
  v_codigo constant text :=
    'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444';
BEGIN
  SELECT issuer.issuer_polo_id,
         EXISTS (
           SELECT 1
           FROM public.payment_gateway_providers provider
           JOIN public.payment_gateway_credentials credential
             ON credential.provider_code = provider.code
            AND credential.environment = 'production'
            AND credential.configured = true
            AND upper(coalesce(credential.last_test_status, '')) = 'OK'
           JOIN public.payment_gateway_routes route
             ON route.provider_code = provider.code
            AND route.environment = credential.environment
            AND route.credential_id = credential.id
            AND route.enabled = true
           WHERE provider.code = 'banese_card'
             AND provider.active = true
             AND EXISTS (
               SELECT 1
               FROM public.payment_gateway_runtime_config runtime
               WHERE runtime.id = true
                 AND runtime.enabled = true
                 AND runtime.active_environment = 'production'
             )
         )
  INTO v_issuer_id, v_ready
  FROM public.payment_gateway_issuer_config issuer
  WHERE issuer.active = true
    AND issuer.issuer_polo_id =
      '44444444-4444-4444-4444-444444444444'::uuid
  LIMIT 1;

  IF v_issuer_id IS NULL OR coalesce(v_ready, false) = false THEN
    UPDATE public.payment_gateway_settlement_accounts
    SET active = false,
        effective_to = coalesce(effective_to, CURRENT_DATE),
        updated_at = now()
    WHERE provider_code = 'banese_card'
      AND environment = 'production';

    -- A conta é canônica da integração: ao desligar o runtime, ela permanece
    -- no histórico, mas deixa de aceitar novas movimentações.
    UPDATE public.contas_bancarias
    SET ativo = false,
        updated_at = now()
    WHERE codigo_interno = v_codigo
      AND system_managed = true
      AND ativo = true;

    RETURN NULL;
  END IF;

  SELECT min(coalesce(data_pagamento, created_at::date))
  INTO v_data_saldo
  FROM public.contas_receber
  WHERE gateway_provider = 'banese_card'
    AND gateway_environment = 'production';

  INSERT INTO public.contas_bancarias (
    polo_id,
    banco,
    titular,
    agencia,
    conta,
    tipo,
    saldo_inicial,
    data_saldo,
    ativo,
    codigo_interno,
    natureza,
    system_managed,
    updated_at
  )
  VALUES (
    v_issuer_id,
    'BANESE',
    'UNIVERSO CURSOS E CONSULTORIA LTDA',
    '033',
    '03/100649-0',
    'Corrente',
    0,
    coalesce(v_data_saldo, CURRENT_DATE),
    true,
    v_codigo,
    'BANCARIA',
    true,
    now()
  )
  ON CONFLICT (codigo_interno) WHERE codigo_interno IS NOT NULL
  DO UPDATE SET
    polo_id = EXCLUDED.polo_id,
    banco = EXCLUDED.banco,
    titular = EXCLUDED.titular,
    agencia = EXCLUDED.agencia,
    conta = EXCLUDED.conta,
    tipo = EXCLUDED.tipo,
    natureza = 'BANCARIA',
    system_managed = true,
    ativo = true,
    data_saldo = LEAST(
      coalesce(public.contas_bancarias.data_saldo, EXCLUDED.data_saldo),
      EXCLUDED.data_saldo
    ),
    updated_at = now()
  RETURNING id INTO v_account_id;

  DELETE FROM public.contas_bancarias_polos
  WHERE conta_bancaria_id = v_account_id;

  INSERT INTO public.contas_bancarias_polos (conta_bancaria_id, polo_id)
  SELECT v_account_id, id
  FROM public.polos
  WHERE lower(status) = 'ativo'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_gateway_settlement_accounts (
    provider_code,
    environment,
    issuer_polo_id,
    conta_bancaria_id,
    active,
    effective_from,
    effective_to,
    updated_at
  )
  VALUES (
    'banese_card',
    'production',
    v_issuer_id,
    v_account_id,
    true,
    coalesce(v_data_saldo, CURRENT_DATE),
    NULL,
    now()
  )
  ON CONFLICT (provider_code, environment, issuer_polo_id)
  DO UPDATE SET
    conta_bancaria_id = EXCLUDED.conta_bancaria_id,
    active = true,
    effective_from = LEAST(
      public.payment_gateway_settlement_accounts.effective_from,
      EXCLUDED.effective_from
    ),
    effective_to = NULL,
    updated_at = now();

  UPDATE public.payment_gateway_issuer_config
  SET settlement_account_id = v_account_id,
      updated_at = now()
  WHERE issuer_polo_id = v_issuer_id;

  -- Também cobre a ativação posterior à migration e respostas de pagamento
  -- que tenham chegado enquanto a conta de liquidação ainda não estava pronta.
  UPDATE public.contas_receber
  SET conta_bancaria_id = v_account_id,
      updated_at = now()
  WHERE status = 'PAGO'
    AND conta_bancaria_id IS NULL
    AND gateway_provider = 'banese_card'
    AND gateway_environment = 'production'
    AND coalesce(
      gateway_payment_id,
      gateway_boleto_nosso_numero
    ) IS NOT NULL;

  RETURN v_account_id;
END;
$$;

SELECT public.sync_banese_settlement_account_secure();

CREATE OR REPLACE FUNCTION public.sync_banese_settlement_account_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_banese_settlement_account_secure();
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_banese_from_credentials_trigger
  ON public.payment_gateway_credentials;
CREATE TRIGGER sync_banese_from_credentials_trigger
AFTER INSERT OR UPDATE OF
  configured,
  last_test_status,
  provider_code,
  environment
ON public.payment_gateway_credentials
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_credentials_delete_trigger
  ON public.payment_gateway_credentials;
CREATE TRIGGER sync_banese_from_credentials_delete_trigger
AFTER DELETE ON public.payment_gateway_credentials
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_routes_trigger
  ON public.payment_gateway_routes;
CREATE TRIGGER sync_banese_from_routes_trigger
AFTER INSERT OR UPDATE OF
  enabled,
  provider_code,
  environment
ON public.payment_gateway_routes
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_routes_delete_trigger
  ON public.payment_gateway_routes;
CREATE TRIGGER sync_banese_from_routes_delete_trigger
AFTER DELETE ON public.payment_gateway_routes
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_runtime_trigger
  ON public.payment_gateway_runtime_config;
CREATE TRIGGER sync_banese_from_runtime_trigger
AFTER INSERT OR UPDATE OF enabled, active_environment
ON public.payment_gateway_runtime_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_runtime_delete_trigger
  ON public.payment_gateway_runtime_config;
CREATE TRIGGER sync_banese_from_runtime_delete_trigger
AFTER DELETE ON public.payment_gateway_runtime_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_provider_trigger
  ON public.payment_gateway_providers;
CREATE TRIGGER sync_banese_from_provider_trigger
AFTER UPDATE OF active
ON public.payment_gateway_providers
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_issuer_trigger
  ON public.payment_gateway_issuer_config;
CREATE TRIGGER sync_banese_from_issuer_trigger
AFTER INSERT OR UPDATE OF active, issuer_polo_id
ON public.payment_gateway_issuer_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_issuer_delete_trigger
  ON public.payment_gateway_issuer_config;
CREATE TRIGGER sync_banese_from_issuer_delete_trigger
AFTER DELETE ON public.payment_gateway_issuer_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

DROP TRIGGER IF EXISTS sync_banese_from_polos_trigger
  ON public.polos;
CREATE TRIGGER sync_banese_from_polos_trigger
AFTER INSERT OR UPDATE OF status
ON public.polos
FOR EACH ROW
EXECUTE FUNCTION public.sync_banese_settlement_account_trigger();

CREATE OR REPLACE FUNCTION public.assign_gateway_settlement_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF NEW.status = 'PAGO'
     AND NEW.conta_bancaria_id IS NULL
     AND NEW.gateway_provider = 'banese_card'
     AND NEW.gateway_environment = 'production'
     AND coalesce(
       NEW.gateway_payment_id,
       NEW.gateway_boleto_nosso_numero
     ) IS NOT NULL THEN
    SELECT settlement.conta_bancaria_id
    INTO v_account_id
    FROM public.payment_gateway_settlement_accounts settlement
    JOIN public.contas_bancarias cb
      ON cb.id = settlement.conta_bancaria_id
     AND cb.ativo = true
    WHERE settlement.provider_code = 'banese_card'
      AND settlement.environment = 'production'
      AND settlement.active = true
      AND settlement.effective_from <=
        coalesce(NEW.data_pagamento, CURRENT_DATE)
      AND (
        settlement.effective_to IS NULL
        OR settlement.effective_to >= coalesce(NEW.data_pagamento, CURRENT_DATE)
      )
    LIMIT 1;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION
        'A conta de liquidação Banese não está configurada ou está inativa.';
    END IF;

    IF NEW.polo_id IS NOT NULL
       AND NOT public.conta_bancaria_disponivel_no_polo(
         v_account_id,
         NEW.polo_id
       ) THEN
      RAISE EXCEPTION
        'A conta Banese não está autorizada para o polo da cobrança.';
    END IF;

    NEW.conta_bancaria_id := v_account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_gateway_settlement_account_trigger
  ON public.contas_receber;

CREATE TRIGGER assign_gateway_settlement_account_trigger
BEFORE INSERT OR UPDATE OF
  status,
  conta_bancaria_id,
  gateway_provider,
  gateway_environment,
  gateway_payment_id,
  gateway_boleto_nosso_numero
ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.assign_gateway_settlement_account();

UPDATE public.contas_receber
SET conta_bancaria_id = (
      SELECT id
      FROM public.contas_bancarias
      WHERE codigo_interno =
        'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444'
    ),
    updated_at = now()
WHERE status = 'PAGO'
  AND conta_bancaria_id IS NULL
  AND gateway_provider = 'banese_card'
  AND gateway_environment = 'production'
  AND coalesce(gateway_payment_id, gateway_boleto_nosso_numero) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_paid_financial_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'PAGO' THEN
    RAISE EXCEPTION
      'Um lançamento pago não pode ser excluído. Use o fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'PAGO'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago
       OR NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
       OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
     ) THEN
    RAISE EXCEPTION
      'Dados contábeis de um lançamento pago só podem mudar pelo fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_paid_contas_receber_trigger
  ON public.contas_receber;
CREATE TRIGGER protect_paid_contas_receber_trigger
BEFORE UPDATE OR DELETE ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.protect_paid_financial_history();

DROP TRIGGER IF EXISTS protect_paid_contas_pagar_trigger
  ON public.contas_pagar;
CREATE TRIGGER protect_paid_contas_pagar_trigger
BEFORE UPDATE OR DELETE ON public.contas_pagar
FOR EACH ROW
EXECUTE FUNCTION public.protect_paid_financial_history();

-- Não permita perder rastreabilidade de uma conta já movimentada.
CREATE OR REPLACE FUNCTION public.prevent_used_bank_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.system_managed
     OR coalesce(OLD.saldo_inicial, 0) <> 0
     OR EXISTS (
    SELECT 1 FROM public.contas_receber WHERE conta_bancaria_id = OLD.id
    UNION ALL
    SELECT 1 FROM public.contas_pagar WHERE conta_bancaria_id = OLD.id
    UNION ALL
    SELECT 1 FROM public.despesas_lancamentos WHERE conta_bancaria_id = OLD.id
    UNION ALL
    SELECT 1 FROM public.transferencias_contas
      WHERE conta_origem_id = OLD.id OR conta_destino_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Esta conta possui movimentações. Inative-a para preservar o histórico.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_used_bank_account_delete_trigger
  ON public.contas_bancarias;

CREATE TRIGGER prevent_used_bank_account_delete_trigger
BEFORE DELETE ON public.contas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.prevent_used_bank_account_delete();

CREATE OR REPLACE FUNCTION public.definir_status_conta_bancaria_secure(
  p_conta_id uuid,
  p_ativo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.gestor_has_any_global_module(
       ARRAY['financeiro', 'caixa', 'configuracoes']
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao cadastro de contas.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.contas_bancarias
  SET ativo = p_ativo,
      updated_at = now()
  WHERE id = p_conta_id
    AND system_managed = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Conta não encontrada ou gerenciada automaticamente pela integração.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_conta_bancaria_secure(
  p_conta_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.gestor_has_any_global_module(
       ARRAY['financeiro', 'caixa', 'configuracoes']
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao cadastro de contas.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contas_bancarias
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Saldo canônico: respeita data_saldo, despesas e compartilhamento.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_contas_bancarias_saldos();

CREATE FUNCTION public.get_contas_bancarias_saldos()
RETURNS TABLE (
  id uuid,
  banco text,
  titular text,
  agencia text,
  conta text,
  tipo text,
  natureza text,
  codigo_interno text,
  system_managed boolean,
  polo_id uuid,
  polo_name text,
  polo_nome text,
  polo_cnpj text,
  polo_cidade text,
  polo_uf text,
  polos_uso uuid[],
  saldo_inicial numeric,
  recebido numeric,
  pago numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  saldo_atual numeric,
  ativo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recebidos AS MATERIALIZED (
    SELECT cb.id AS conta_id,
           sum(coalesce(
             cr.gateway_net_value,
             cr.asaas_net_value,
             cr.valor_pago,
             cr.valor,
             0
           )) AS total
    FROM public.contas_bancarias cb
    JOIN public.contas_receber cr
      ON cr.conta_bancaria_id = cb.id
     AND cr.status = 'PAGO'
     AND (
       cb.data_saldo IS NULL
       OR coalesce(cr.data_pagamento, cr.created_at::date) >= cb.data_saldo
     )
    GROUP BY cb.id
  ),
  pagos AS MATERIALIZED (
    SELECT source.conta_id, sum(source.valor) AS total
    FROM (
      SELECT cp.conta_bancaria_id AS conta_id,
             coalesce(cp.valor_pago, cp.valor, 0) AS valor
      FROM public.contas_pagar cp
      JOIN public.contas_bancarias cb ON cb.id = cp.conta_bancaria_id
      WHERE cp.status = 'PAGO'
        AND (
          cb.data_saldo IS NULL
          OR coalesce(cp.data_pagamento, cp.created_at::date) >= cb.data_saldo
        )
      UNION ALL
      SELECT dl.conta_bancaria_id,
             coalesce(dl.valor_pago, dl.valor, 0)
      FROM public.despesas_lancamentos dl
      JOIN public.contas_bancarias cb ON cb.id = dl.conta_bancaria_id
      WHERE dl.status = 'PAGO'
        AND (
          cb.data_saldo IS NULL
          OR coalesce(dl.data_pagamento, dl.created_at::date) >= cb.data_saldo
        )
    ) source
    WHERE source.conta_id IS NOT NULL
    GROUP BY source.conta_id
  ),
  entradas AS MATERIALIZED (
    SELECT tc.conta_destino_id AS conta_id, sum(coalesce(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_destino_id
    WHERE tc.tipo = 'FISICA'
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
    GROUP BY tc.conta_destino_id
  ),
  saidas AS MATERIALIZED (
    SELECT tc.conta_origem_id AS conta_id, sum(coalesce(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_origem_id
    WHERE tc.tipo = 'FISICA'
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
    GROUP BY tc.conta_origem_id
  ),
  acessos AS MATERIALIZED (
    SELECT conta_bancaria_id, array_agg(polo_id ORDER BY polo_id) AS polos
    FROM public.contas_bancarias_polos
    GROUP BY conta_bancaria_id
  )
  SELECT
    cb.id,
    cb.banco,
    cb.titular,
    cb.agencia,
    cb.conta,
    cb.tipo,
    cb.natureza,
    cb.codigo_interno,
    cb.system_managed,
    cb.polo_id,
    coalesce(p.nome, '') AS polo_name,
    coalesce(p.nome, '') AS polo_nome,
    coalesce(p.cnpj, '') AS polo_cnpj,
    coalesce(p.cidade, '') AS polo_cidade,
    coalesce(p.estado, '') AS polo_uf,
    coalesce(acessos.polos, ARRAY[]::uuid[]) AS polos_uso,
    coalesce(cb.saldo_inicial, 0) AS saldo_inicial,
    coalesce(recebidos.total, 0) AS recebido,
    coalesce(pagos.total, 0) AS pago,
    coalesce(entradas.total, 0) AS transferencias_entrada,
    coalesce(saidas.total, 0) AS transferencias_saida,
    (
      coalesce(cb.saldo_inicial, 0)
      + coalesce(recebidos.total, 0)
      - coalesce(pagos.total, 0)
      + coalesce(entradas.total, 0)
      - coalesce(saidas.total, 0)
    ) AS saldo_atual,
    cb.ativo
  FROM public.contas_bancarias cb
  LEFT JOIN public.polos p ON p.id = cb.polo_id
  LEFT JOIN recebidos ON recebidos.conta_id = cb.id
  LEFT JOIN pagos ON pagos.conta_id = cb.id
  LEFT JOIN entradas ON entradas.conta_id = cb.id
  LEFT JOIN saidas ON saidas.conta_id = cb.id
  LEFT JOIN acessos ON acessos.conta_bancaria_id = cb.id
  WHERE public.can_access_conta_bancaria(cb.id)
  ORDER BY coalesce(p.nome, ''), cb.natureza DESC, cb.banco, cb.conta;
$$;

CREATE INDEX IF NOT EXISTS contas_receber_pago_conta_polo_data_idx
  ON public.contas_receber (conta_bancaria_id, polo_id, data_pagamento)
  WHERE status = 'PAGO' AND conta_bancaria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contas_pagar_pago_conta_polo_data_idx
  ON public.contas_pagar (conta_bancaria_id, polo_id, data_pagamento)
  WHERE status = 'PAGO' AND conta_bancaria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS despesas_pago_conta_polo_data_idx
  ON public.despesas_lancamentos (conta_bancaria_id, polo_id, data_pagamento)
  WHERE status = 'PAGO' AND conta_bancaria_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.atualizar_saldo_inicial_conta_secure(
  p_conta_id uuid,
  p_saldo_inicial numeric,
  p_data_saldo date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.gestor_has_any_global_module(
       ARRAY['financeiro', 'caixa', 'configuracoes']
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao saldo inicial.'
      USING ERRCODE = '42501';
  END IF;

  IF p_saldo_inicial IS NULL OR p_data_saldo IS NULL THEN
    RAISE EXCEPTION 'Informe saldo inicial e data de corte.';
  END IF;

  UPDATE public.contas_bancarias
  SET saldo_inicial = round(p_saldo_inicial, 2),
      data_saldo = p_data_saldo,
      updated_at = now()
  WHERE id = p_conta_id
    AND (system_managed = false OR natureza = 'CAIXA_INTERNO')
    AND public.can_access_conta_bancaria(id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.contas_receber
      WHERE conta_bancaria_id = p_conta_id
      UNION ALL
      SELECT 1
      FROM public.contas_pagar
      WHERE conta_bancaria_id = p_conta_id
      UNION ALL
      SELECT 1
      FROM public.despesas_lancamentos
      WHERE conta_bancaria_id = p_conta_id
      UNION ALL
      SELECT 1
      FROM public.transferencias_contas
      WHERE conta_origem_id = p_conta_id
         OR conta_destino_id = p_conta_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'O saldo inicial só pode ser definido antes da primeira movimentação.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Despesas: criação/parcelamento e baixa somente por RPC transacional.
-- ---------------------------------------------------------------------------

ALTER TABLE public.despesas_lancamentos
  ADD COLUMN IF NOT EXISTS data_lancamento date,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS baixa_request_id uuid;

UPDATE public.despesas_lancamentos
SET data_lancamento = created_at::date
WHERE data_lancamento IS NULL;

ALTER TABLE public.despesas_lancamentos
  ALTER COLUMN data_lancamento SET DEFAULT CURRENT_DATE,
  ALTER COLUMN data_lancamento SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS despesas_request_parcela_uidx
  ON public.despesas_lancamentos (request_id, parcela_numero)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS despesas_baixa_request_uidx
  ON public.despesas_lancamentos (baixa_request_id)
  WHERE baixa_request_id IS NOT NULL;

ALTER TABLE public.despesas_lancamentos
  DROP CONSTRAINT IF EXISTS despesas_tipo_check,
  DROP CONSTRAINT IF EXISTS despesas_status_check,
  DROP CONSTRAINT IF EXISTS despesas_parcelas_check,
  DROP CONSTRAINT IF EXISTS despesas_pagamento_completo_check;

ALTER TABLE public.despesas_lancamentos
  ADD CONSTRAINT despesas_tipo_check
    CHECK (tipo IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')),
  ADD CONSTRAINT despesas_status_check
    CHECK (status IN ('PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO')),
  ADD CONSTRAINT despesas_parcelas_check
    CHECK (
      parcela_numero >= 1
      AND total_parcelas >= 1
      AND parcela_numero <= total_parcelas
    ),
  ADD CONSTRAINT despesas_pagamento_completo_check
    CHECK (
      status <> 'PAGO'
      OR (
        conta_bancaria_id IS NOT NULL
        AND data_pagamento IS NOT NULL
        AND forma_pagamento IS NOT NULL
        AND valor_pago IS NOT NULL
      )
    ) NOT VALID;

CREATE OR REPLACE FUNCTION public.criar_despesa_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor_base numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_total_parcelas integer DEFAULT 1,
  p_intervalo_quantidade integer DEFAULT 1,
  p_intervalo_unidade text DEFAULT 'MESES',
  p_baixa_imediata boolean DEFAULT false,
  p_forma_pagamento text DEFAULT NULL,
  p_conta_bancaria_id uuid DEFAULT NULL,
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_tamanho bigint DEFAULT NULL
)
RETURNS SETOF public.despesas_lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcela integer;
  v_vencimento date;
  v_grupo uuid;
  v_total integer := greatest(1, coalesce(p_total_parcelas, 1));
  v_intervalo integer := greatest(1, coalesce(p_intervalo_quantidade, 1));
  v_unidade text := upper(trim(coalesce(p_intervalo_unidade, 'MESES')));
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND (
         (
           p_tipo = 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('outros-debitos')
         )
         OR (
           p_tipo <> 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('despesas')
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para lançar despesas neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.despesas_lancamentos existente
      WHERE existente.request_id = p_request_id
        AND existente.parcela_numero = 1
        AND (
          existente.polo_id IS DISTINCT FROM p_polo_id
          OR existente.tipo IS DISTINCT FROM p_tipo
          OR regexp_replace(
               existente.descricao,
               ' \([0-9]+/[0-9]+\)$',
               ''
             ) IS DISTINCT FROM trim(p_descricao)
          OR existente.valor_base IS DISTINCT FROM round(p_valor_base, 2)
          OR existente.juros_valor IS DISTINCT FROM
            round(coalesce(p_juros_valor, 0), 2)
          OR existente.multa_valor IS DISTINCT FROM
            round(coalesce(p_multa_valor, 0), 2)
          OR existente.desconto_valor IS DISTINCT FROM
            round(coalesce(p_desconto_valor, 0), 2)
          OR existente.data_lancamento IS DISTINCT FROM
            coalesce(p_data_lancamento, CURRENT_DATE)
          OR existente.data_vencimento IS DISTINCT FROM p_data_vencimento
          OR existente.categoria_financeira_id IS DISTINCT FROM
            p_categoria_financeira_id
          OR existente.fornecedor_id IS DISTINCT FROM p_fornecedor_id
          OR existente.observacao IS DISTINCT FROM
            nullif(trim(coalesce(p_observacao, '')), '')
          OR existente.turma_id IS DISTINCT FROM p_turma_id
          OR existente.total_parcelas IS DISTINCT FROM v_total
          OR existente.status IS DISTINCT FROM
            CASE WHEN p_baixa_imediata THEN 'PAGO' ELSE 'PENDENTE' END
          OR existente.forma_pagamento IS DISTINCT FROM
            CASE
              WHEN p_baixa_imediata
                THEN upper(trim(p_forma_pagamento))
              ELSE NULL
            END
          OR existente.conta_bancaria_id IS DISTINCT FROM
            CASE WHEN p_baixa_imediata
              THEN p_conta_bancaria_id
              ELSE NULL
            END
          OR existente.anexo_bucket IS DISTINCT FROM p_anexo_bucket
          OR existente.anexo_path IS DISTINCT FROM p_anexo_path
          OR existente.anexo_nome IS DISTINCT FROM p_anexo_nome
          OR existente.anexo_mime IS DISTINCT FROM p_anexo_mime
          OR existente.anexo_tamanho IS DISTINCT FROM p_anexo_tamanho
          OR (
            v_total > 1
            AND (
              SELECT segunda.data_vencimento
              FROM public.despesas_lancamentos segunda
              WHERE segunda.request_id = p_request_id
                AND segunda.parcela_numero = 2
            ) IS DISTINCT FROM CASE v_unidade
              WHEN 'DIAS' THEN p_data_vencimento + v_intervalo
              WHEN 'SEMANAS' THEN p_data_vencimento + (v_intervalo * 7)
              ELSE (
                p_data_vencimento::timestamp
                + make_interval(months => v_intervalo)
              )::date
            END
          )
        )
    ) THEN
      RAISE EXCEPTION
        'A chave de idempotência já foi usada com dados diferentes.';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
    ORDER BY parcela_numero;
    RETURN;
  END IF;

  IF p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO') THEN
    RAISE EXCEPTION 'Tipo de despesa inválido.';
  END IF;
  IF nullif(trim(p_descricao), '') IS NULL THEN
    RAISE EXCEPTION 'A descrição da despesa é obrigatória.';
  END IF;
  IF p_valor_base IS NULL OR p_valor_base <= 0 THEN
    RAISE EXCEPTION 'O valor-base deve ser maior que zero.';
  END IF;
  IF v_total > 60 THEN
    RAISE EXCEPTION 'O parcelamento deve conter no máximo 60 parcelas.';
  END IF;
  IF v_unidade NOT IN ('DIAS', 'SEMANAS', 'MESES') THEN
    RAISE EXCEPTION 'A unidade do intervalo deve ser dias, semanas ou meses.';
  END IF;

  IF p_baixa_imediata AND (
    p_conta_bancaria_id IS NULL
    OR nullif(trim(p_forma_pagamento), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Informe a conta e a forma de pagamento para dar baixa.';
  END IF;

  IF p_baixa_imediata
     AND NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_bancaria_id,
       p_polo_id
     ) THEN
    RAISE EXCEPTION 'A conta selecionada não está ativa ou disponível neste polo.';
  END IF;

  v_grupo := CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END;

  FOR v_parcela IN 1..v_total LOOP
    v_vencimento := CASE v_unidade
      WHEN 'DIAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo)
      WHEN 'SEMANAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo * 7)
      ELSE (
        p_data_vencimento::timestamp
        + make_interval(months => (v_parcela - 1) * v_intervalo)
      )::date
    END;

    INSERT INTO public.despesas_lancamentos (
      polo_id,
      tipo,
      descricao,
      valor_base,
      valor,
      juros_valor,
      multa_valor,
      desconto_valor,
      data_lancamento,
      data_vencimento,
      data_pagamento,
      valor_pago,
      status,
      categoria_financeira_id,
      fornecedor_id,
      forma_pagamento,
      conta_bancaria_id,
      parcela_numero,
      total_parcelas,
      grupo_parcelas_id,
      observacao,
      turma_id,
      anexo_bucket,
      anexo_path,
      anexo_nome,
      anexo_mime,
      anexo_tamanho,
      request_id
    )
    VALUES (
      p_polo_id,
      p_tipo,
      CASE
        WHEN v_total > 1
          THEN trim(p_descricao) || ' (' || v_parcela || '/' || v_total || ')'
        ELSE trim(p_descricao)
      END,
      round(p_valor_base, 2),
      round(p_valor_base, 2),
      round(coalesce(p_juros_valor, 0), 2),
      round(coalesce(p_multa_valor, 0), 2),
      round(coalesce(p_desconto_valor, 0), 2),
      coalesce(p_data_lancamento, CURRENT_DATE),
      v_vencimento,
      CASE WHEN p_baixa_imediata
        THEN coalesce(p_data_lancamento, CURRENT_DATE)
        ELSE NULL
      END,
      NULL,
      CASE WHEN p_baixa_imediata THEN 'PAGO' ELSE 'PENDENTE' END,
      p_categoria_financeira_id,
      p_fornecedor_id,
      CASE WHEN p_baixa_imediata THEN upper(trim(p_forma_pagamento)) ELSE NULL END,
      CASE WHEN p_baixa_imediata THEN p_conta_bancaria_id ELSE NULL END,
      v_parcela,
      v_total,
      v_grupo,
      nullif(trim(p_observacao), ''),
      p_turma_id,
      p_anexo_bucket,
      p_anexo_path,
      p_anexo_nome,
      p_anexo_mime,
      p_anexo_tamanho,
      p_request_id
    );
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
  ORDER BY parcela_numero;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_despesa_secure(
  p_despesa_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0
)
RETURNS public.despesas_lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despesa public.despesas_lancamentos%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(v_despesa.polo_id)
       AND (
         (
           v_despesa.tipo = 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('outros-debitos')
         )
         OR (
           v_despesa.tipo <> 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('despesas')
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para baixar esta despesa.'
      USING ERRCODE = '42501';
  END IF;

  IF v_despesa.status = 'PAGO' AND v_despesa.baixa_request_id = p_request_id THEN
    IF v_despesa.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id
       OR v_despesa.data_pagamento IS DISTINCT FROM
         coalesce(p_data_pagamento, CURRENT_DATE)
       OR v_despesa.forma_pagamento IS DISTINCT FROM
         upper(trim(p_forma_pagamento))
       OR v_despesa.juros_valor IS DISTINCT FROM
         round(coalesce(p_juros_valor, 0), 2)
       OR v_despesa.multa_valor IS DISTINCT FROM
         round(coalesce(p_multa_valor, 0), 2)
       OR v_despesa.desconto_valor IS DISTINCT FROM
         round(coalesce(p_desconto_valor, 0), 2) THEN
      RAISE EXCEPTION
        'A chave de idempotência da baixa já foi usada com dados diferentes.';
    END IF;
    RETURN v_despesa;
  END IF;
  IF v_despesa.status = 'PAGO' THEN
    RAISE EXCEPTION 'Esta despesa já foi paga.';
  END IF;
  IF v_despesa.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Uma despesa cancelada não pode ser baixada.';
  END IF;
  IF p_conta_bancaria_id IS NULL
     OR nullif(trim(coalesce(p_forma_pagamento, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a conta e a forma de pagamento.';
  END IF;

  IF NOT public.conta_bancaria_disponivel_no_polo(
    p_conta_bancaria_id,
    v_despesa.polo_id
  ) THEN
    RAISE EXCEPTION 'A conta selecionada não está ativa ou disponível neste polo.';
  END IF;

  UPDATE public.despesas_lancamentos
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      forma_pagamento = upper(trim(p_forma_pagamento)),
      juros_valor = round(coalesce(p_juros_valor, 0), 2),
      multa_valor = round(coalesce(p_multa_valor, 0), 2),
      desconto_valor = round(coalesce(p_desconto_valor, 0), 2),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = p_despesa_id
  RETURNING * INTO v_despesa;

  RETURN v_despesa;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_despesa_secure(
  p_despesa_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despesa public.despesas_lancamentos%rowtype;
BEGIN
  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;
  IF auth.role() <> 'service_role'
     AND NOT public.is_financeiro_for_polo(v_despesa.polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cancelar esta despesa.'
      USING ERRCODE = '42501';
  END IF;
  IF v_despesa.status = 'PAGO' THEN
    RAISE EXCEPTION
      'Despesa paga não pode ser cancelada por este fluxo.';
  END IF;
  IF v_despesa.status = 'CANCELADO' THEN
    RETURN;
  END IF;

  UPDATE public.despesas_lancamentos
  SET status = 'CANCELADO',
      observacao = concat_ws(
        E'\n',
        nullif(observacao, ''),
        CASE
          WHEN nullif(trim(coalesce(p_motivo, '')), '') IS NOT NULL
            THEN 'Cancelamento: ' || trim(p_motivo)
        END
      ),
      updated_at = now()
  WHERE id = p_despesa_id;
END;
$$;

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS baixa_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS contas_pagar_baixa_request_uidx
  ON public.contas_pagar (baixa_request_id)
  WHERE baixa_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar_secure(
  p_conta_pagar_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text
)
RETURNS public.contas_pagar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.contas_pagar%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  SELECT *
  INTO v_conta
  FROM public.contas_pagar
  WHERE id = p_conta_pagar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada.';
  END IF;
  IF auth.role() <> 'service_role'
     AND NOT public.is_financeiro_for_polo(v_conta.polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para baixar esta conta.'
      USING ERRCODE = '42501';
  END IF;

  IF v_conta.status = 'PAGO'
     AND v_conta.baixa_request_id = p_request_id THEN
    IF v_conta.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id
       OR v_conta.data_pagamento IS DISTINCT FROM
         coalesce(p_data_pagamento, CURRENT_DATE)
       OR v_conta.forma_pagamento IS DISTINCT FROM
         upper(trim(p_forma_pagamento)) THEN
      RAISE EXCEPTION
        'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_conta;
  END IF;
  IF v_conta.status = 'PAGO' THEN
    RAISE EXCEPTION 'Esta conta a pagar já foi baixada.';
  END IF;
  IF v_conta.status IN ('CANCELADO', 'ESTORNADO') THEN
    RAISE EXCEPTION 'Este lançamento não pode ser baixado.';
  END IF;
  IF p_conta_bancaria_id IS NULL
     OR nullif(trim(coalesce(p_forma_pagamento, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a conta e a forma de pagamento.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(
    p_conta_bancaria_id,
    v_conta.polo_id
  ) THEN
    RAISE EXCEPTION 'A conta não está ativa ou disponível neste polo.';
  END IF;

  UPDATE public.contas_pagar
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      forma_pagamento = upper(trim(p_forma_pagamento)),
      valor_pago = round(valor, 2),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = p_conta_pagar_id
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

-- ---------------------------------------------------------------------------
-- Transferências físicas preservam a unidade de origem e a de destino.
-- Em conta compartilhada, os polos não podem ser inferidos pelo titular.
-- ---------------------------------------------------------------------------

ALTER TABLE public.transferencias_contas
  ADD COLUMN IF NOT EXISTS polo_destino_id uuid
    REFERENCES public.polos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'FISICA',
  ADD COLUMN IF NOT EXISTS request_id uuid;

ALTER TABLE public.transferencias_contas
  DROP CONSTRAINT IF EXISTS transferencias_contas_tipo_check;
ALTER TABLE public.transferencias_contas
  DROP CONSTRAINT IF EXISTS transferencias_contas_contas_diferentes;

ALTER TABLE public.transferencias_contas
  ADD CONSTRAINT transferencias_contas_tipo_check
  CHECK (
    (
      tipo = 'FISICA'
      AND conta_origem_id <> conta_destino_id
    )
    OR (
      tipo = 'RATEIO_INTERNO'
      AND conta_origem_id = conta_destino_id
      AND polo_id <> polo_destino_id
    )
  );

UPDATE public.transferencias_contas transferencia
SET polo_destino_id = conta.polo_id
FROM public.contas_bancarias conta
WHERE conta.id = transferencia.conta_destino_id
  AND transferencia.polo_destino_id IS NULL;

ALTER TABLE public.transferencias_contas
  ALTER COLUMN polo_destino_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS transferencias_contas_polo_destino_idx
  ON public.transferencias_contas (polo_destino_id, data_transferencia);

CREATE UNIQUE INDEX IF NOT EXISTS transferencias_contas_request_uidx
  ON public.transferencias_contas (request_id)
  WHERE request_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.registrar_transferencia_conta(
  uuid, uuid, uuid, uuid, numeric, date, text
);

CREATE OR REPLACE FUNCTION public.registrar_transferencia_conta(
  p_polo_origem_id uuid,
  p_conta_origem_id uuid,
  p_polo_destino_id uuid,
  p_conta_destino_id uuid,
  p_valor numeric,
  p_data_transferencia date,
  p_observacao text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transferencia_id uuid;
  v_tipo text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da transferência é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  SELECT id
  INTO v_transferencia_id
  FROM public.transferencias_contas existente
  WHERE existente.request_id = p_request_id;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.transferencias_contas existente
      WHERE existente.request_id = p_request_id
        AND (
          existente.polo_id IS DISTINCT FROM p_polo_origem_id
          OR existente.polo_destino_id IS DISTINCT FROM p_polo_destino_id
          OR existente.conta_origem_id IS DISTINCT FROM p_conta_origem_id
          OR existente.conta_destino_id IS DISTINCT FROM p_conta_destino_id
          OR existente.valor IS DISTINCT FROM round(p_valor, 2)
          OR existente.data_transferencia IS DISTINCT FROM
            coalesce(p_data_transferencia, CURRENT_DATE)
          OR existente.observacao IS DISTINCT FROM
            nullif(trim(coalesce(p_observacao, '')), '')
        )
    ) THEN
      RAISE EXCEPTION
        'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_transferencia_id;
  END IF;

  IF p_polo_origem_id IS NULL OR p_polo_destino_id IS NULL THEN
    RAISE EXCEPTION 'Informe os polos de origem e destino.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor de transferência maior que zero.';
  END IF;
  IF p_conta_origem_id IS NULL OR p_conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Informe as contas de origem e destino.';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id
     AND p_polo_origem_id = p_polo_destino_id THEN
    RAISE EXCEPTION
      'No rateio interno, os polos de origem e destino devem ser diferentes.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_origem_id, p_polo_origem_id
     )
     OR NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_destino_id, p_polo_destino_id
     ) THEN
    RAISE EXCEPTION 'Uma das contas não está disponível no polo informado.';
  END IF;
  IF auth.role() <> 'service_role'
     AND (
       NOT public.is_gestor_for_polo(p_polo_origem_id)
       OR NOT public.is_gestor_for_polo(p_polo_destino_id)
       OR NOT (
         public.gestor_has_module('caixa')
         OR public.gestor_has_financeiro_tab('transferencias')
       )
     ) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar esta transferência.'
      USING ERRCODE = '42501';
  END IF;

  v_tipo := CASE
    WHEN p_conta_origem_id = p_conta_destino_id
      THEN 'RATEIO_INTERNO'
    ELSE 'FISICA'
  END;

  INSERT INTO public.transferencias_contas (
    polo_id,
    polo_destino_id,
    conta_origem_id,
    conta_destino_id,
    tipo,
    request_id,
    valor,
    data_transferencia,
    observacao
  )
  VALUES (
    p_polo_origem_id,
    p_polo_destino_id,
    p_conta_origem_id,
    p_conta_destino_id,
    v_tipo,
    p_request_id,
    round(p_valor, 2),
    coalesce(p_data_transferencia, CURRENT_DATE),
    nullif(trim(coalesce(p_observacao, '')), '')
  )
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_transferencia_conta(
  p_transferencia_id uuid,
  p_polo_origem_id uuid,
  p_conta_origem_id uuid,
  p_polo_destino_id uuid,
  p_conta_destino_id uuid,
  p_valor numeric,
  p_data_transferencia date,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual public.transferencias_contas%rowtype;
  v_tipo text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION
      'Transferências contabilizadas são imutáveis. Registre uma transferência inversa para corrigir.';
  END IF;

  SELECT *
  INTO v_atual
  FROM public.transferencias_contas
  WHERE id = p_transferencia_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada.';
  END IF;
  IF auth.role() <> 'service_role'
     AND (
       NOT public.is_gestor_for_polo(v_atual.polo_id)
       OR NOT public.is_gestor_for_polo(v_atual.polo_destino_id)
       OR NOT public.is_gestor_for_polo(p_polo_origem_id)
       OR NOT public.is_gestor_for_polo(p_polo_destino_id)
       OR NOT (
         public.gestor_has_module('caixa')
         OR public.gestor_has_financeiro_tab('transferencias')
       )
     ) THEN
    RAISE EXCEPTION 'Você não tem permissão para editar esta transferência.'
      USING ERRCODE = '42501';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor de transferência maior que zero.';
  END IF;
  IF p_conta_origem_id IS NULL OR p_conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Informe as contas de origem e destino.';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id
     AND p_polo_origem_id = p_polo_destino_id THEN
    RAISE EXCEPTION
      'No rateio interno, os polos de origem e destino devem ser diferentes.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_origem_id, p_polo_origem_id
     )
     OR NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_destino_id, p_polo_destino_id
     ) THEN
    RAISE EXCEPTION 'Uma das contas não está disponível no polo informado.';
  END IF;

  v_tipo := CASE
    WHEN p_conta_origem_id = p_conta_destino_id
      THEN 'RATEIO_INTERNO'
    ELSE 'FISICA'
  END;

  UPDATE public.transferencias_contas
  SET polo_id = p_polo_origem_id,
      polo_destino_id = p_polo_destino_id,
      conta_origem_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      tipo = v_tipo,
      valor = round(p_valor, 2),
      data_transferencia = coalesce(p_data_transferencia, CURRENT_DATE),
      observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      updated_at = now()
  WHERE id = p_transferencia_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_transferencia_conta(
  p_transferencia_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION
      'Transferências contabilizadas não podem ser excluídas. Registre uma transferência inversa.';
  END IF;

  DELETE FROM public.transferencias_contas
  WHERE id = p_transferencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_transferencias_contas(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_mes_atual boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  polo_origem_id uuid,
  polo_origem_nome text,
  polo_origem_cnpj text,
  polo_origem_cidade text,
  polo_origem_uf text,
  conta_origem_id uuid,
  conta_origem_banco text,
  conta_origem_titular text,
  conta_origem_agencia text,
  conta_origem_conta text,
  polo_destino_id uuid,
  polo_destino_nome text,
  polo_destino_cnpj text,
  polo_destino_cidade text,
  polo_destino_uf text,
  conta_destino_id uuid,
  conta_destino_banco text,
  conta_destino_titular text,
  conta_destino_agencia text,
  conta_destino_conta text,
  valor numeric,
  data_transferencia date,
  observacao text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tc.id,
    tc.polo_id,
    coalesce(po.nome, ''),
    coalesce(po.cnpj, ''),
    coalesce(po.cidade, ''),
    coalesce(po.estado, ''),
    origem.id,
    origem.banco,
    origem.titular,
    origem.agencia,
    origem.conta,
    tc.polo_destino_id,
    coalesce(pd.nome, ''),
    coalesce(pd.cnpj, ''),
    coalesce(pd.cidade, ''),
    coalesce(pd.estado, ''),
    destino.id,
    destino.banco,
    destino.titular,
    destino.agencia,
    destino.conta,
    tc.valor,
    tc.data_transferencia,
    tc.observacao,
    tc.created_at,
    tc.updated_at
  FROM public.transferencias_contas tc
  JOIN public.contas_bancarias origem ON origem.id = tc.conta_origem_id
  JOIN public.contas_bancarias destino ON destino.id = tc.conta_destino_id
  LEFT JOIN public.polos po ON po.id = tc.polo_id
  LEFT JOIN public.polos pd ON pd.id = tc.polo_destino_id
  WHERE (
      p_polo_id IS NULL
      OR tc.polo_id = p_polo_id
      OR tc.polo_destino_id = p_polo_id
    )
    AND (p_conta_origem_id IS NULL OR origem.id = p_conta_origem_id)
    AND (p_conta_destino_id IS NULL OR destino.id = p_conta_destino_id)
    AND public.is_gestor_for_polo(tc.polo_id)
    AND public.is_gestor_for_polo(tc.polo_destino_id)
    AND (
      auth.role() = 'service_role'
      OR public.gestor_has_module('caixa')
      OR public.gestor_has_financeiro_tab('transferencias')
    )
    AND (p_data_inicio IS NULL OR tc.data_transferencia >= p_data_inicio)
    AND (p_data_fim IS NULL OR tc.data_transferencia <= p_data_fim)
    AND (
      p_mes_atual = false
      OR tc.data_transferencia >= date_trunc('month', CURRENT_DATE)::date
         AND tc.data_transferencia <
           (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
    )
    AND (
      nullif(trim(coalesce(p_search, '')), '') IS NULL
      OR tc.observacao ILIKE '%' || trim(p_search) || '%'
      OR origem.banco ILIKE '%' || trim(p_search) || '%'
      OR destino.banco ILIKE '%' || trim(p_search) || '%'
      OR po.nome ILIKE '%' || trim(p_search) || '%'
      OR pd.nome ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY tc.data_transferencia DESC, tc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_contas_bancarias_posicoes_polos_secure()
RETURNS TABLE (
  conta_bancaria_id uuid,
  polo_id uuid,
  entradas numeric,
  saidas numeric,
  saldo_gerencial numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH movimentos AS (
    SELECT
      cb.id AS conta_id,
      CASE
        WHEN (
          SELECT count(*)
          FROM public.contas_bancarias_polos acesso
          WHERE acesso.conta_bancaria_id = cb.id
        ) > 1 THEN NULL::uuid
        ELSE cb.polo_id
      END AS movimento_polo_id,
      coalesce(cb.saldo_inicial, 0)::numeric AS entrada,
      0::numeric AS saida
    FROM public.contas_bancarias cb
    WHERE public.can_access_conta_bancaria(cb.id)

    UNION ALL

    SELECT
      cr.conta_bancaria_id,
      cr.polo_id,
      coalesce(
        cr.gateway_net_value,
        cr.asaas_net_value,
        cr.valor_pago,
        cr.valor,
        0
      ),
      0::numeric
    FROM public.contas_receber cr
    JOIN public.contas_bancarias cb ON cb.id = cr.conta_bancaria_id
    WHERE cr.status = 'PAGO'
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(cr.data_pagamento, cr.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      cp.conta_bancaria_id,
      cp.polo_id,
      0::numeric,
      coalesce(cp.valor_pago, cp.valor, 0)
    FROM public.contas_pagar cp
    JOIN public.contas_bancarias cb ON cb.id = cp.conta_bancaria_id
    WHERE cp.status = 'PAGO'
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(cp.data_pagamento, cp.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      dl.conta_bancaria_id,
      dl.polo_id,
      0::numeric,
      coalesce(dl.valor_pago, dl.valor, 0)
    FROM public.despesas_lancamentos dl
    JOIN public.contas_bancarias cb ON cb.id = dl.conta_bancaria_id
    WHERE dl.status = 'PAGO'
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(dl.data_pagamento, dl.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      tc.conta_origem_id,
      tc.polo_id,
      0::numeric,
      tc.valor
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_origem_id
    WHERE public.can_access_conta_bancaria(cb.id)
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)

    UNION ALL

    SELECT
      tc.conta_destino_id,
      tc.polo_destino_id,
      tc.valor,
      0::numeric
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_destino_id
    WHERE public.can_access_conta_bancaria(cb.id)
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
  )
  SELECT
    movimento.conta_id,
    movimento.movimento_polo_id,
    sum(movimento.entrada),
    sum(movimento.saida),
    sum(movimento.entrada) - sum(movimento.saida)
  FROM movimentos movimento
  GROUP BY movimento.conta_id, movimento.movimento_polo_id;
$$;

CREATE OR REPLACE FUNCTION public.get_contas_bancarias_para_polo_secure(
  p_polo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_polo_id IS NULL
     OR (
       auth.role() <> 'service_role'
       AND NOT public.gestor_has_any_module_for_polo(
         ARRAY['financeiro', 'caixa'],
         p_polo_id
       )
     ) THEN
    RAISE EXCEPTION 'Acesso às contas fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    to_jsonb(saldo)
    || jsonb_build_object(
      'compartilhada', cardinality(saldo.polos_uso) > 1,
      'saldo_contabil_conta', saldo.saldo_atual,
      'saldo_gerencial_polo', coalesce(posicao.saldo_gerencial, 0)
    )
    ORDER BY saldo.natureza DESC, saldo.banco, saldo.conta
  ), '[]'::jsonb)
  INTO v_result
  FROM public.get_contas_bancarias_saldos() saldo
  LEFT JOIN public.get_contas_bancarias_posicoes_polos_secure() posicao
    ON posicao.conta_bancaria_id = saldo.id
   AND posicao.polo_id = p_polo_id
  WHERE saldo.ativo = true
    AND p_polo_id = ANY(saldo.polos_uso);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard Caixa: contas ativas, compartilhamento e todas as despesas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_caixa_dashboard_secure(
  p_polo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_principal_polo_id constant uuid :=
    '44444444-4444-4444-4444-444444444444';
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(
           ARRAY['caixa', 'financeiro'],
           p_polo_id
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH account_positions AS MATERIALIZED (
    SELECT posicao.*
    FROM public.get_contas_bancarias_posicoes_polos_secure() posicao
  ),
  account_balances AS MATERIALIZED (
    SELECT
      saldo.*,
      cardinality(saldo.polos_uso) > 1 AS compartilhada,
      coalesce((
        SELECT posicao.saldo_gerencial
        FROM account_positions posicao
        WHERE posicao.conta_bancaria_id = saldo.id
          AND posicao.polo_id = p_polo_id
      ), 0) AS saldo_gerencial_polo,
      CASE
        WHEN p_polo_id IS NULL THEN saldo.saldo_atual
        ELSE coalesce((
          SELECT posicao.saldo_gerencial
          FROM account_positions posicao
          WHERE posicao.conta_bancaria_id = saldo.id
            AND posicao.polo_id = p_polo_id
        ), 0)
      END AS saldo_exibido
    FROM public.get_contas_bancarias_saldos() saldo
    WHERE (saldo.ativo = true OR saldo.saldo_atual <> 0)
      AND (
        p_polo_id IS NULL
        OR p_polo_id = ANY(saldo.polos_uso)
      )
  ),
  receivables_open AS MATERIALIZED (
    SELECT cr.categoria, cr.valor, cr.status, cr.data_vencimento
    FROM public.contas_receber cr
    WHERE cr.status IN ('PENDENTE', 'VENCIDO')
      AND (
        p_polo_id IS NULL
        OR cr.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND cr.polo_id IS NULL)
      )
  ),
  payables_open AS MATERIALIZED (
    SELECT cp.categoria, cp.valor
    FROM public.contas_pagar cp
    WHERE cp.status IN ('PENDENTE', 'VENCIDO')
      AND (
        p_polo_id IS NULL
        OR cp.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND cp.polo_id IS NULL)
      )
    UNION ALL
    SELECT
      CASE dl.tipo
        WHEN 'DESPESA_VARIAVEL' THEN 'DESPESA_VARIAVEL'
        WHEN 'DESPESA_FIXA' THEN 'DESPESA_ADMINISTRATIVA'
        ELSE 'OUTRAS_DESPESAS'
      END,
      dl.valor
    FROM public.despesas_lancamentos dl
    WHERE dl.status IN ('PENDENTE', 'VENCIDO')
      AND (
        p_polo_id IS NULL
        OR dl.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND dl.polo_id IS NULL)
      )
  ),
  months AS (
    SELECT
      idx,
      (
        date_trunc('month', CURRENT_DATE)
        - ((2 - idx) * interval '1 month')
      )::date AS month_start
    FROM generate_series(0, 2) idx
  ),
  paid_receivables AS MATERIALIZED (
    SELECT
      date_trunc('month', cr.data_pagamento)::date AS month_start,
      sum(coalesce(
        cr.gateway_net_value,
        cr.asaas_net_value,
        cr.valor_pago,
        cr.valor,
        0
      )) AS total
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento >= (
        date_trunc('month', CURRENT_DATE) - interval '2 months'
      )::date
      AND cr.data_pagamento < (
        date_trunc('month', CURRENT_DATE) + interval '1 month'
      )::date
      AND (
        p_polo_id IS NULL
        OR cr.polo_id = p_polo_id
        OR (p_polo_id = v_principal_polo_id AND cr.polo_id IS NULL)
      )
    GROUP BY date_trunc('month', cr.data_pagamento)::date
  ),
  paid_debits AS MATERIALIZED (
    SELECT source.month_start, sum(source.total) AS total
    FROM (
      SELECT
        date_trunc('month', cp.data_pagamento)::date AS month_start,
        sum(coalesce(cp.valor_pago, cp.valor, 0)) AS total
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND cp.data_pagamento >= (
          date_trunc('month', CURRENT_DATE) - interval '2 months'
        )::date
        AND cp.data_pagamento < (
          date_trunc('month', CURRENT_DATE) + interval '1 month'
        )::date
        AND (
          p_polo_id IS NULL
          OR cp.polo_id = p_polo_id
          OR (p_polo_id = v_principal_polo_id AND cp.polo_id IS NULL)
        )
      GROUP BY date_trunc('month', cp.data_pagamento)::date
      UNION ALL
      SELECT
        date_trunc('month', dl.data_pagamento)::date,
        sum(coalesce(dl.valor_pago, dl.valor, 0))
      FROM public.despesas_lancamentos dl
      WHERE dl.status = 'PAGO'
        AND dl.data_pagamento >= (
          date_trunc('month', CURRENT_DATE) - interval '2 months'
        )::date
        AND dl.data_pagamento < (
          date_trunc('month', CURRENT_DATE) + interval '1 month'
        )::date
        AND (
          p_polo_id IS NULL
          OR dl.polo_id = p_polo_id
          OR (p_polo_id = v_principal_polo_id AND dl.polo_id IS NULL)
        )
      GROUP BY date_trunc('month', dl.data_pagamento)::date
    ) source
    GROUP BY source.month_start
  ),
  monthly_flow AS (
    SELECT
      m.idx,
      to_char(m.month_start, 'MM') AS mes,
      extract(year FROM m.month_start)::integer AS ano,
      CASE extract(month FROM m.month_start)::integer
        WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro'
        WHEN 3 THEN 'Março' WHEN 4 THEN 'Abril'
        WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho'
        WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto'
        WHEN 9 THEN 'Setembro' WHEN 10 THEN 'Outubro'
        WHEN 11 THEN 'Novembro' ELSE 'Dezembro'
      END AS mes_nome,
      coalesce(pr.total, 0) AS creditos,
      coalesce(pd.total, 0) AS debitos
    FROM months m
    LEFT JOIN paid_receivables pr ON pr.month_start = m.month_start
    LEFT JOIN paid_debits pd ON pd.month_start = m.month_start
  )
  SELECT jsonb_build_object(
    'saldo_total_contas',
      coalesce((SELECT sum(saldo_exibido) FROM account_balances), 0),
    'saldo_contabil_compartilhado',
      coalesce((
        SELECT sum(saldo_atual)
        FROM account_balances
        WHERE codigo_interno =
          'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444'
      ), 0),
    'saldo_gerencial_distribuido',
      CASE WHEN p_polo_id IS NULL THEN coalesce((
        SELECT sum(posicao.saldo_gerencial)
        FROM account_positions posicao
        WHERE posicao.polo_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.contas_bancarias banese
            WHERE banese.id = posicao.conta_bancaria_id
              AND banese.codigo_interno =
                'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444'
          )
      ), 0) ELSE 0 END,
    'saldo_nao_atribuido',
      CASE WHEN p_polo_id IS NULL THEN coalesce((
        SELECT sum(posicao.saldo_gerencial)
        FROM account_positions posicao
        WHERE posicao.polo_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.contas_bancarias banese
            WHERE banese.id = posicao.conta_bancaria_id
              AND banese.codigo_interno =
                'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444'
          )
      ), 0) ELSE 0 END,
    'posicoes_polos',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'polo_id', polo.id,
            'polo_nome', polo.nome,
            'polo_cidade', polo.cidade,
            'polo_uf', polo.estado,
            'polo_ativo', lower(polo.status) = 'ativo',
            'saldo_gerencial', coalesce(posicao.saldo_gerencial, 0)
          )
          ORDER BY polo.is_matriz DESC, polo.nome
        )
        FROM public.polos polo
        LEFT JOIN (
          SELECT polo_id, sum(saldo_gerencial) AS saldo_gerencial
          FROM account_positions
          WHERE polo_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.contas_bancarias banese
              WHERE banese.id = account_positions.conta_bancaria_id
                AND banese.codigo_interno =
                  'SETTLEMENT:banese_card:production:44444444-4444-4444-4444-444444444444'
            )
          GROUP BY polo_id
        ) posicao ON posicao.polo_id = polo.id
        WHERE (
            lower(polo.status) = 'ativo'
            OR coalesce(posicao.saldo_gerencial, 0) <> 0
          )
          AND (p_polo_id IS NULL OR polo.id = p_polo_id)
      ), '[]'::jsonb),
    'saldos_individuais',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ab.id,
            'banco', ab.banco,
            'agencia', ab.agencia,
            'conta', ab.conta,
            'titular', ab.titular,
            'natureza', ab.natureza,
            'codigo_interno', ab.codigo_interno,
            'system_managed', ab.system_managed,
            'saldo_atual', ab.saldo_exibido,
            'saldo_contabil_conta', ab.saldo_atual,
            'saldo_gerencial_polo', ab.saldo_gerencial_polo,
            'compartilhada', ab.compartilhada,
            'ativo', ab.ativo,
            'polo_nome', ab.polo_nome,
            'polo_id', ab.polo_id,
            'polo_cidade', ab.polo_cidade,
            'polo_uf', ab.polo_uf,
            'polos_uso', ab.polos_uso
          )
          ORDER BY ab.polo_nome, ab.natureza DESC, ab.banco, ab.conta
        )
        FROM account_balances ab
      ), '[]'::jsonb),
    'total_receber',
      coalesce((SELECT sum(valor) FROM receivables_open), 0),
    'receber_por_tipo',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('categoria', categoria, 'valor', valor)
          ORDER BY categoria
        )
        FROM (
          SELECT categoria, sum(valor) AS valor
          FROM (
            VALUES
              ('MENSALIDADE'::text, 0::numeric),
              ('OUTROS_CREDITOS'::text, 0::numeric),
              ('ADIANTAMENTO_TOMADO'::text, 0::numeric)
            UNION ALL
            SELECT coalesce(categoria, 'OUTROS_CREDITOS'), coalesce(valor, 0)
            FROM receivables_open
          ) values_by_category(categoria, valor)
          GROUP BY categoria
        ) grouped
      ), '[]'::jsonb),
    'total_pagar',
      coalesce((SELECT sum(valor) FROM payables_open), 0),
    'pagar_por_tipo',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('categoria', categoria, 'valor', valor)
          ORDER BY categoria
        )
        FROM (
          SELECT categoria, sum(valor) AS valor
          FROM (
            VALUES
              ('DESPESA_VARIAVEL'::text, 0::numeric),
              ('DESPESA_ADMINISTRATIVA'::text, 0::numeric),
              ('OUTRAS_DESPESAS'::text, 0::numeric),
              ('ADIANTAMENTO_CEDIDO'::text, 0::numeric)
            UNION ALL
            SELECT coalesce(categoria, 'OUTRAS_DESPESAS'), coalesce(valor, 0)
            FROM payables_open
          ) values_by_category(categoria, valor)
          GROUP BY categoria
        ) grouped
      ), '[]'::jsonb),
    'mensalidades_em_atraso',
      jsonb_build_object(
        'quantidade', (
          SELECT count(*)
          FROM receivables_open
          WHERE categoria = 'MENSALIDADE'
            AND (
              status = 'VENCIDO'
              OR (status = 'PENDENTE' AND data_vencimento < CURRENT_DATE)
            )
        ),
        'valor_total', coalesce((
          SELECT sum(valor)
          FROM receivables_open
          WHERE categoria = 'MENSALIDADE'
            AND (
              status = 'VENCIDO'
              OR (status = 'PENDENTE' AND data_vencimento < CURRENT_DATE)
            )
        ), 0)
      ),
    'fluxo_3_meses',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'mes', mes,
            'ano', ano,
            'mes_nome', mes_nome,
            'creditos', creditos,
            'debitos', debitos
          )
          ORDER BY idx
        )
        FROM monthly_flow
      ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Resumos legados passam a reconhecer despesas_lancamentos.
CREATE OR REPLACE FUNCTION public.get_financeiro_summary(
  p_polo_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT '1970-01-01',
  p_data_fim date DEFAULT '2999-12-31'
)
RETURNS TABLE (
  total_recebido numeric,
  total_a_receber numeric,
  total_pago numeric,
  total_a_pagar numeric,
  saldo_caixa numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH access_check AS (
    SELECT (
      auth.role() = 'service_role'
      OR (
        p_polo_id IS NULL
        AND public.gestor_has_any_global_module(
          ARRAY['financeiro', 'caixa']
        )
      )
      OR (
        p_polo_id IS NOT NULL
        AND public.gestor_has_any_module_for_polo(
          ARRAY['financeiro', 'caixa'],
          p_polo_id
        )
      )
    ) AS allowed
  )
  SELECT
    coalesce((
      SELECT sum(coalesce(cr.valor_pago, cr.valor, 0))
      FROM public.contas_receber cr
      WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
        AND cr.status = 'PAGO'
        AND cr.data_pagamento BETWEEN p_data_inicio AND p_data_fim
    ), 0),
    coalesce((
      SELECT sum(cr.valor)
      FROM public.contas_receber cr
      WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
        AND cr.status IN ('PENDENTE', 'VENCIDO')
        AND cr.data_vencimento BETWEEN p_data_inicio AND p_data_fim
    ), 0),
    coalesce((
      SELECT sum(valor)
      FROM (
        SELECT coalesce(cp.valor_pago, cp.valor, 0) AS valor
        FROM public.contas_pagar cp
        WHERE (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
          AND cp.status = 'PAGO'
          AND cp.data_pagamento BETWEEN p_data_inicio AND p_data_fim
        UNION ALL
        SELECT coalesce(dl.valor_pago, dl.valor, 0)
        FROM public.despesas_lancamentos dl
        WHERE (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
          AND dl.status = 'PAGO'
          AND dl.data_pagamento BETWEEN p_data_inicio AND p_data_fim
      ) paid
    ), 0),
    coalesce((
      SELECT sum(valor)
      FROM (
        SELECT cp.valor
        FROM public.contas_pagar cp
        WHERE (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
          AND cp.status IN ('PENDENTE', 'VENCIDO')
          AND cp.data_vencimento BETWEEN p_data_inicio AND p_data_fim
        UNION ALL
        SELECT dl.valor
        FROM public.despesas_lancamentos dl
        WHERE (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
          AND dl.status IN ('PENDENTE', 'VENCIDO')
          AND dl.data_vencimento BETWEEN p_data_inicio AND p_data_fim
      ) pending
    ), 0),
    CASE
      WHEN p_polo_id IS NULL THEN coalesce((
        SELECT sum(saldo.saldo_atual)
        FROM public.get_contas_bancarias_saldos() saldo
      ), 0)
      ELSE coalesce((
        SELECT sum(posicao.saldo_gerencial)
        FROM public.get_contas_bancarias_posicoes_polos_secure() posicao
        WHERE posicao.polo_id = p_polo_id
      ), 0)
    END
  FROM access_check
  WHERE allowed;
$$;

CREATE OR REPLACE FUNCTION public.get_fluxo_consolidado_3_meses(
  p_polo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  mes text,
  ano integer,
  mes_nome text,
  creditos numeric,
  debitos numeric,
  atraso_receber numeric,
  atraso_pagar numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH months AS (
    SELECT (
      date_trunc('month', CURRENT_DATE)
      - ((2 - idx) * interval '1 month')
    )::date AS month_start
    FROM generate_series(0, 2) idx
  ),
  overdue_receivable AS (
    SELECT coalesce(sum(valor), 0) AS total
    FROM public.contas_receber
    WHERE (p_polo_id IS NULL OR polo_id = p_polo_id)
      AND status IN ('PENDENTE', 'VENCIDO')
      AND data_vencimento < CURRENT_DATE
  ),
  overdue_payable AS (
    SELECT coalesce(sum(valor), 0) AS total
    FROM (
      SELECT valor
      FROM public.contas_pagar
      WHERE (p_polo_id IS NULL OR polo_id = p_polo_id)
        AND status IN ('PENDENTE', 'VENCIDO')
        AND data_vencimento < CURRENT_DATE
      UNION ALL
      SELECT valor
      FROM public.despesas_lancamentos
      WHERE (p_polo_id IS NULL OR polo_id = p_polo_id)
        AND status IN ('PENDENTE', 'VENCIDO')
        AND data_vencimento < CURRENT_DATE
    ) payable
  )
  SELECT
    to_char(m.month_start, 'MM'),
    extract(year FROM m.month_start)::integer,
    CASE extract(month FROM m.month_start)::integer
      WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro'
      WHEN 3 THEN 'Março' WHEN 4 THEN 'Abril'
      WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho'
      WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto'
      WHEN 9 THEN 'Setembro' WHEN 10 THEN 'Outubro'
      WHEN 11 THEN 'Novembro' ELSE 'Dezembro'
    END,
    coalesce((
      SELECT sum(coalesce(
        cr.gateway_net_value,
        cr.asaas_net_value,
        cr.valor_pago,
        cr.valor,
        0
      ))
      FROM public.contas_receber cr
      WHERE (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
        AND cr.status = 'PAGO'
        AND cr.data_pagamento >= m.month_start
        AND cr.data_pagamento < (m.month_start + interval '1 month')::date
    ), 0),
    coalesce((
      SELECT sum(valor)
      FROM (
        SELECT coalesce(cp.valor_pago, cp.valor, 0) AS valor
        FROM public.contas_pagar cp
        WHERE (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
          AND cp.status = 'PAGO'
          AND cp.data_pagamento >= m.month_start
          AND cp.data_pagamento < (m.month_start + interval '1 month')::date
        UNION ALL
        SELECT coalesce(dl.valor_pago, dl.valor, 0)
        FROM public.despesas_lancamentos dl
        WHERE (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
          AND dl.status = 'PAGO'
          AND dl.data_pagamento >= m.month_start
          AND dl.data_pagamento < (m.month_start + interval '1 month')::date
      ) paid
    ), 0),
    overdue_receivable.total,
    overdue_payable.total
  FROM months m
  CROSS JOIN overdue_receivable
  CROSS JOIN overdue_payable
  ORDER BY m.month_start;
$$;

-- O resumo não deve somar cancelados no total previsto.
CREATE OR REPLACE FUNCTION public.get_despesas_summary(
  p_tipo text,
  p_polo_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_value numeric,
  paid_value numeric,
  pending_value numeric,
  vencidos_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_due_start date;
  v_due_end date;
BEGIN
  IF p_status_scope = 'mes_atual' THEN
    v_due_start := date_trunc('month', CURRENT_DATE)::date;
    v_due_end := (
      date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'
    )::date;
  ELSE
    v_due_start := p_due_start;
    v_due_end := p_due_end;
  END IF;

  RETURN QUERY
  SELECT
    coalesce(sum(d.valor) FILTER (
      WHERE d.status <> 'CANCELADO'
    ), 0)::numeric(15, 2),
    coalesce(sum(coalesce(d.valor_pago, d.valor)) FILTER (
      WHERE d.status = 'PAGO'
    ), 0)::numeric(15, 2),
    coalesce(sum(d.valor) FILTER (
      WHERE d.status IN ('PENDENTE', 'VENCIDO')
    ), 0)::numeric(15, 2),
    count(*) FILTER (
      WHERE d.status = 'VENCIDO'
         OR (d.status = 'PENDENTE' AND d.data_vencimento < CURRENT_DATE)
    )
  FROM public.despesas_lancamentos d
  LEFT JOIN public.categorias_financeiras c
    ON c.id = d.categoria_financeira_id
  LEFT JOIN public.parceiros parceiro
    ON parceiro.id = d.fornecedor_id
  LEFT JOIN public.polos polo
    ON polo.id = d.polo_id
  WHERE d.tipo = p_tipo
    AND (p_polo_id IS NULL OR d.polo_id = p_polo_id)
    AND (p_categoria_id IS NULL OR d.categoria_financeira_id = p_categoria_id)
    AND (p_turma_id IS NULL OR d.turma_id = p_turma_id)
    AND (v_due_start IS NULL OR d.data_vencimento >= v_due_start)
    AND (v_due_end IS NULL OR d.data_vencimento <= v_due_end)
    AND (
      p_status_scope <> 'em_aberto'
      OR d.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      nullif(trim(p_search), '') IS NULL
      OR d.descricao ILIKE '%' || p_search || '%'
      OR c.nome ILIKE '%' || p_search || '%'
      OR parceiro.nome ILIKE '%' || p_search || '%'
      OR polo.nome ILIKE '%' || p_search || '%'
    );
END;
$$;

-- Escritas financeiras passam exclusivamente pelas RPCs.
DROP POLICY IF EXISTS portal_contas_bancarias_global_insert
  ON public.contas_bancarias;
DROP POLICY IF EXISTS portal_contas_bancarias_global_update
  ON public.contas_bancarias;
DROP POLICY IF EXISTS portal_contas_bancarias_global_delete
  ON public.contas_bancarias;

DROP POLICY IF EXISTS portal_despesas_lancamentos_gestor_insert
  ON public.despesas_lancamentos;
DROP POLICY IF EXISTS portal_despesas_lancamentos_gestor_update
  ON public.despesas_lancamentos;
DROP POLICY IF EXISTS portal_despesas_lancamentos_gestor_delete
  ON public.despesas_lancamentos;

DROP POLICY IF EXISTS portal_transferencias_contas_access
  ON public.transferencias_contas;
DROP POLICY IF EXISTS portal_transferencias_contas_select
  ON public.transferencias_contas;
CREATE POLICY portal_transferencias_contas_select
  ON public.transferencias_contas
  FOR SELECT
  TO authenticated
  USING (
    public.is_gestor_for_polo(polo_id)
    AND public.is_gestor_for_polo(polo_destino_id)
    AND (
      public.gestor_has_module('caixa')
      OR public.gestor_has_financeiro_tab('transferencias')
    )
  );

DROP POLICY IF EXISTS portal_contas_bancarias_polos_global_insert
  ON public.contas_bancarias_polos;
DROP POLICY IF EXISTS portal_contas_bancarias_polos_global_delete
  ON public.contas_bancarias_polos;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.contas_bancarias
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.contas_bancarias_polos
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.despesas_lancamentos
  FROM authenticated;
REVOKE UPDATE ON TABLE public.contas_pagar
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.transferencias_contas
  FROM authenticated;

REVOKE ALL ON FUNCTION public.ensure_bank_account_owner_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conta_bancaria_disponivel_no_polo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_conta_bancaria(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_conta_bancaria_secure(uuid, text, text, text, text, text, uuid[], boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_status_conta_bancaria_secure(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_conta_bancaria_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_saldo_inicial_conta_secure(uuid, numeric, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_banese_settlement_account_secure() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_banese_settlement_account_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_gateway_settlement_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_used_bank_account_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_paid_financial_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_contas_bancarias_saldos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_contas_bancarias_posicoes_polos_secure() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_contas_bancarias_posicoes_polos_secure() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_contas_bancarias_para_polo_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_despesa_secure(uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, boolean, text, uuid, text, text, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.baixar_despesa_secure(uuid, uuid, uuid, date, text, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_despesa_secure(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.baixar_conta_pagar_secure(uuid, uuid, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_transferencia_conta(uuid, uuid, uuid, uuid, numeric, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.editar_transferencia_conta(uuid, uuid, uuid, uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_transferencia_conta(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_transferencias_contas(uuid, text, uuid, uuid, date, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_caixa_dashboard_secure(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_financeiro_summary(uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.conta_bancaria_disponivel_no_polo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_conta_bancaria(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_conta_bancaria_secure(uuid, text, text, text, text, text, uuid[], boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_status_conta_bancaria_secure(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_conta_bancaria_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_saldo_inicial_conta_secure(uuid, numeric, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contas_bancarias_saldos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contas_bancarias_posicoes_polos_secure() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_contas_bancarias_para_polo_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_secure(uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, boolean, text, uuid, text, text, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.baixar_despesa_secure(uuid, uuid, uuid, date, text, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_despesa_secure(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.baixar_conta_pagar_secure(uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia_conta(uuid, uuid, uuid, uuid, numeric, date, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.editar_transferencia_conta(uuid, uuid, uuid, uuid, uuid, numeric, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_transferencia_conta(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_transferencias_contas(uuid, text, uuid, uuid, date, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_dashboard_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_financeiro_summary(uuid, date, date) TO authenticated, service_role;

COMMENT ON COLUMN public.contas_bancarias.polo_id IS
  'Polo titular da conta. Polos autorizados a usar ficam em contas_bancarias_polos.';
COMMENT ON COLUMN public.contas_bancarias.natureza IS
  'BANCARIA para banco real; CAIXA_INTERNO para caixa físico da unidade.';
COMMENT ON COLUMN public.contas_bancarias.data_saldo IS
  'Data inicial do saldo: movimentos anteriores não compõem o saldo atual.';
COMMENT ON FUNCTION public.criar_despesa_secure(uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, boolean, text, uuid, text, text, text, text, bigint) IS
  'Cria despesas e parcelas de forma atômica/idempotente; valor final é calculado pelo trigger canônico.';
COMMENT ON FUNCTION public.baixar_despesa_secure(uuid, uuid, uuid, date, text, numeric, numeric, numeric) IS
  'Baixa uma despesa com lock, idempotência e validação da conta disponível no polo.';

COMMIT;
