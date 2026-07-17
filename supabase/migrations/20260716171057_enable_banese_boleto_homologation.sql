-- Habilita a homologacao de boletos Banese sem alterar rotas de producao.
-- Pix fica apontado para o Banese, mas desabilitado ate o banco fornecer o
-- contrato/credencial especifico que nao consta no pacote de homologacao.

BEGIN;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_boleto_linha_digitavel TEXT,
  ADD COLUMN IF NOT EXISTS gateway_boleto_codigo_barras TEXT,
  ADD COLUMN IF NOT EXISTS gateway_boleto_nosso_numero TEXT;

ALTER TABLE public.payment_gateway_transactions
  ADD COLUMN IF NOT EXISTS bank_slip_digitable_line TEXT,
  ADD COLUMN IF NOT EXISTS bank_slip_barcode TEXT,
  ADD COLUMN IF NOT EXISTS bank_slip_our_number TEXT;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_boleto_linha_digitavel_check,
  ADD CONSTRAINT contas_receber_gateway_boleto_linha_digitavel_check
    CHECK (
      gateway_boleto_linha_digitavel IS NULL
      OR gateway_boleto_linha_digitavel ~ '^[0-9]{47}$'
    ),
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_boleto_codigo_barras_check,
  ADD CONSTRAINT contas_receber_gateway_boleto_codigo_barras_check
    CHECK (
      gateway_boleto_codigo_barras IS NULL
      OR gateway_boleto_codigo_barras ~ '^[0-9]{44}$'
    ),
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_boleto_nosso_numero_check,
  ADD CONSTRAINT contas_receber_gateway_boleto_nosso_numero_check
    CHECK (
      gateway_boleto_nosso_numero IS NULL
      OR gateway_boleto_nosso_numero ~ '^[0-9]{9}$'
    );

CREATE TABLE IF NOT EXISTS public.banese_boleto_sequences (
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  convenio TEXT NOT NULL CHECK (convenio ~ '^[0-9]+$'),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number BETWEEN 0 AND 99999999),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, convenio)
);

ALTER TABLE public.banese_boleto_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.banese_boleto_sequences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.banese_boleto_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.next_banese_nosso_numero(
  p_environment TEXT,
  p_convenio TEXT,
  p_agencia TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number BIGINT;
  v_base TEXT;
  v_sum INTEGER := 0;
  v_position INTEGER;
  v_weight INTEGER := 2;
  v_remainder INTEGER;
  v_digit INTEGER;
BEGIN
  IF p_environment NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'Ambiente Banese invalido.';
  END IF;
  IF p_convenio IS NULL OR p_convenio !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Convenio Banese invalido.';
  END IF;
  IF p_agencia IS NULL OR p_agencia !~ '^[0-9]{3}$' OR p_agencia = '000' THEN
    RAISE EXCEPTION 'Agencia Banese invalida.';
  END IF;

  INSERT INTO public.banese_boleto_sequences AS sequence_row (
    environment,
    convenio,
    last_number,
    updated_at
  )
  VALUES (p_environment, p_convenio, 1, now())
  ON CONFLICT (environment, convenio) DO UPDATE
  SET last_number = sequence_row.last_number + 1,
      updated_at = now()
  WHERE sequence_row.last_number < 99999999
  RETURNING last_number INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'A sequencia de Nosso Numero Banese foi esgotada.';
  END IF;

  v_base := p_agencia || lpad(v_number::TEXT, 8, '0');
  FOR v_position IN REVERSE length(v_base)..1 LOOP
    v_sum := v_sum + substring(v_base FROM v_position FOR 1)::INTEGER * v_weight;
    v_weight := CASE WHEN v_weight = 9 THEN 2 ELSE v_weight + 1 END;
  END LOOP;

  v_remainder := mod(v_sum, 11);
  v_digit := CASE WHEN v_remainder IN (0, 1) THEN 0 ELSE 11 - v_remainder END;

  RETURN lpad(v_number::TEXT, 8, '0') || v_digit::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.next_banese_nosso_numero(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_banese_nosso_numero(TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.banese_boleto_sequences IS
  'Sequencia atomica por convenio/ambiente para Nosso Numero Banese.';
COMMENT ON FUNCTION public.next_banese_nosso_numero(TEXT, TEXT, TEXT) IS
  'Reserva Nosso Numero de 8 digitos e calcula o DV modulo 11 usando a agencia beneficiaria.';

UPDATE public.payment_gateway_providers
SET name = 'Banese',
    description = 'Boletos em homologacao Banese; Pix aguarda contrato tecnico especifico do banco.',
    supports_pix = TRUE,
    supports_boleto = TRUE,
    supports_credit_card = FALSE,
    requires_polling = TRUE,
    has_public_api = TRUE,
    active = TRUE,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'intended_role', 'pix_boleto',
      'checkout_blocked', FALSE,
      'homologation_only', TRUE,
      'boleto_homologation_enabled', TRUE,
      'pix_homologation_enabled', FALSE,
      'pix_block_reason', 'O pacote recebido possui somente OAuth e manual de boletos; faltam CrtAccessToken, convenio/chave Pix e contrato SAB Guias.'
    ),
    updated_at = now()
WHERE code = 'banese_card';

UPDATE public.payment_gateway_credentials
SET label = 'Banese Homologacao',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'baneseConvenio', '15528',
      'baneseBoletoConvenio', '15528',
      'baneseAgencia', '033',
      'baneseContaDisplay', '03/100649-0',
      'baneseCodigoEspecie', 21,
      'quantidadeDiasBaixaDevolucao', 30,
      'banesePixHomologacaoDisponivel', FALSE,
      'notes', 'Homologacao Banese: gerar 10 boletos com vencimento futuro e valores variados acima de R$ 10,00.'
    ),
    updated_at = now()
WHERE provider_code = 'banese_card'
  AND environment = 'sandbox';

UPDATE public.payment_gateway_routes AS route
SET provider_code = 'banese_card',
    credential_id = credential.id,
    enabled = route.payment_method = 'BOLETO',
    notes = CASE
      WHEN route.payment_method = 'BOLETO'
        THEN 'Homologacao Banese ativa para os 10 boletos exigidos pelo banco.'
      ELSE 'Rota reservada ao Banese e bloqueada: o banco nao forneceu o contrato/credencial Pix no pacote recebido.'
    END,
    updated_at = now()
FROM public.payment_gateway_credentials AS credential
WHERE route.modalidade IN ('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO')
  AND route.payment_method IN ('PIX', 'BOLETO')
  AND route.environment = 'sandbox'
  AND credential.provider_code = 'banese_card'
  AND credential.environment = 'sandbox';

COMMIT;
