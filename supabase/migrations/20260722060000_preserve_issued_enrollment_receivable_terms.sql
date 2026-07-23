BEGIN;

-- A cobranca inicial pode ser chamada novamente pelos fluxos legados de
-- matricula. Depois que existe identidade/tentativa remota, valor, vencimento e
-- status formam um snapshot imutavel; mudancas na matricula valem somente para
-- novos recebiveis, nunca para o titulo ja emitido.
CREATE OR REPLACE FUNCTION public.gerar_cobranca_matricula(
  p_matricula_id uuid
)
RETURNS public.contas_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_item jsonb;
  v_conta public.contas_receber%ROWTYPE;
  v_origem_id text;
  v_descricao text;
  v_valor numeric;
  v_vencimento date;
  v_flags record;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuracao financeira da matricula nao encontrada.';
  END IF;

  IF v_flags.gerar_cobranca_inicial = FALSE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada para a matricula.';
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(
    COALESCE(v_turma.cronograma_financeiro, '[]'::jsonb)
  ) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
  LIMIT 1;

  v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), 'matricula');
  v_descricao := COALESCE(NULLIF(v_item->>'label', ''), 'Matricula Inicial');
  v_valor := COALESCE(
    v_matricula.valor_matricula_individual,
    NULLIF(v_item->>'valor', '')::numeric,
    v_turma.valor_matricula,
    0
  );

  IF v_valor <= 0 THEN
    RETURN NULL;
  END IF;

  v_vencimento := COALESCE(
    v_matricula.data_primeiro_vencimento_financeiro,
    NULLIF(v_item->>'dataVencimento', '')::date,
    v_matricula.data_matricula::date,
    CURRENT_DATE
  );

  INSERT INTO public.contas_receber (
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento,
    parcela_numero, origem_cronograma_id
  ) VALUES (
    v_turma.polo_id,
    v_descricao || ' - ' || v_turma.nome,
    v_valor,
    v_vencimento,
    CASE WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
    'MENSALIDADE',
    v_matricula.aluno_id,
    v_matricula.id,
    v_matricula.turma_id,
    'MATRICULA',
    0,
    v_origem_id
  )
  ON CONFLICT (matricula_id, origem_cronograma_id)
    WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
  DO UPDATE SET
    polo_id = EXCLUDED.polo_id,
    cliente_id = EXCLUDED.cliente_id,
    turma_id = EXCLUDED.turma_id,
    valor = CASE
      WHEN public.contas_receber.status = 'PAGO'
        OR public.contas_receber.gateway_payment_id IS NOT NULL
        OR public.contas_receber.gateway_payment_link_id IS NOT NULL
        OR public.contas_receber.gateway_boleto_nosso_numero IS NOT NULL
        OR public.contas_receber.asaas_payment_id IS NOT NULL
        OR public.contas_receber.asaas_payment_link_id IS NOT NULL
        OR public.contas_receber.nosso_numero_asaas IS NOT NULL
        OR public.contas_receber.gateway_creation_token IS NOT NULL
        OR UPPER(COALESCE(public.contas_receber.gateway_status, '')) = 'CREATING'
        OR UPPER(COALESCE(public.contas_receber.asaas_status, '')) = 'CREATING'
        THEN public.contas_receber.valor
      ELSE EXCLUDED.valor
    END,
    data_vencimento = CASE
      WHEN public.contas_receber.status = 'PAGO'
        OR public.contas_receber.gateway_payment_id IS NOT NULL
        OR public.contas_receber.gateway_payment_link_id IS NOT NULL
        OR public.contas_receber.gateway_boleto_nosso_numero IS NOT NULL
        OR public.contas_receber.asaas_payment_id IS NOT NULL
        OR public.contas_receber.asaas_payment_link_id IS NOT NULL
        OR public.contas_receber.nosso_numero_asaas IS NOT NULL
        OR public.contas_receber.gateway_creation_token IS NOT NULL
        OR UPPER(COALESCE(public.contas_receber.gateway_status, '')) = 'CREATING'
        OR UPPER(COALESCE(public.contas_receber.asaas_status, '')) = 'CREATING'
        THEN public.contas_receber.data_vencimento
      ELSE EXCLUDED.data_vencimento
    END,
    status = CASE
      WHEN public.contas_receber.status = 'PAGO'
        OR public.contas_receber.gateway_payment_id IS NOT NULL
        OR public.contas_receber.gateway_payment_link_id IS NOT NULL
        OR public.contas_receber.gateway_boleto_nosso_numero IS NOT NULL
        OR public.contas_receber.asaas_payment_id IS NOT NULL
        OR public.contas_receber.asaas_payment_link_id IS NOT NULL
        OR public.contas_receber.nosso_numero_asaas IS NOT NULL
        OR public.contas_receber.gateway_creation_token IS NOT NULL
        OR UPPER(COALESCE(public.contas_receber.gateway_status, '')) = 'CREATING'
        OR UPPER(COALESCE(public.contas_receber.asaas_status, '')) = 'CREATING'
        THEN public.contas_receber.status
      ELSE EXCLUDED.status
    END
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_cobranca_matricula(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid)
  TO service_role;

COMMENT ON FUNCTION public.gerar_cobranca_matricula(uuid) IS
  'Gera cobranca inicial positiva e preserva os termos de qualquer titulo remoto ja emitido ou em criacao.';

COMMIT;
