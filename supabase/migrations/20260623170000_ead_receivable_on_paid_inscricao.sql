-- Ajuste para fluxo EAD: gerar lançamento de matrícula no pagamento online e manter valor alinhado ao curso.

CREATE OR REPLACE FUNCTION public.gerar_cobranca_matricula(
  p_matricula_id UUID
)
RETURNS public.contas_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_item JSONB;
  v_conta public.contas_receber%ROWTYPE;
  v_origem_id TEXT;
  v_descricao TEXT;
  v_valor NUMERIC;
  v_vencimento DATE;
  v_modalidade TEXT;
  v_valor_curso NUMERIC;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;

  SELECT modalidade, valor
    INTO v_modalidade, v_valor_curso
    FROM public.cursos
   WHERE id = v_turma.curso_id;

  SELECT item INTO v_item
  FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
  LIMIT 1;

  v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), 'matricula');
  v_descricao := COALESCE(NULLIF(v_item->>'label', ''), 'Matrícula Inicial');
  v_valor := COALESCE(
    NULLIF(v_item->>'valor', '')::NUMERIC,
    CASE
      WHEN v_modalidade = 'EAD' AND COALESCE(v_valor_curso, 0) > 0 THEN v_valor_curso
      ELSE v_turma.valor_matricula
    END,
    0
  );
  v_vencimento := COALESCE(
    NULLIF(v_item->>'dataVencimento', '')::DATE,
    v_matricula.data_matricula::DATE,
    CURRENT_DATE
  );

  INSERT INTO public.contas_receber (
    polo_id,
    descricao,
    valor,
    data_vencimento,
    status,
    categoria,
    cliente_id,
    matricula_id,
    turma_id,
    tipo_lancamento,
    parcela_numero,
    origem_cronograma_id
  ) VALUES (
    v_turma.polo_id,
    v_descricao || ' - ' || v_turma.nome,
    v_valor,
    v_vencimento,
    'PENDENTE',
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
    turma_id = EXCLUDED.turma_id
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

CREATE OR REPLACE FUNCTION public.ead_activate_matricula_on_paid_inscricao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  IF new.status <> 'PAGO' OR new.matricula_id IS NULL THEN
    RETURN new;
  END IF;

  UPDATE public.matriculas
    SET status = 'ATIVO'
  WHERE id = new.matricula_id
    AND status = 'PENDENTE';

  SELECT c.modalidade
    INTO v_modalidade
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
   WHERE m.id = new.matricula_id;

  IF v_modalidade IS NULL OR v_modalidade <> 'EAD' THEN
    RETURN new;
  END IF;

  -- Garante o recebível da matrícula e o registra como pago para o fluxo online EAD.
  PERFORM public.gerar_cobranca_matricula(new.matricula_id);

  UPDATE public.contas_receber
  SET
    status = 'PAGO',
    valor_pago = COALESCE(new.valor, valor_pago),
    data_pagamento = COALESCE(new.pago_em::DATE, CURRENT_DATE),
    forma_pagamento = COALESCE(forma_pagamento, 'ASAAS'),
    origem_pagamento = COALESCE(origem_pagamento, 'ASAAS'),
    asaas_payment_id = COALESCE(NULLIF(new.asaas_payment_id, ''), asaas_payment_id),
    asaas_status = COALESCE(UPPER(new.status), asaas_status),
    asaas_synced_at = NOW(),
    asaas_last_error = NULL,
    updated_at = NOW()
  WHERE matricula_id = new.matricula_id
    AND tipo_lancamento = 'MATRICULA';

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_ead_activate_matricula_on_paid_inscricao ON public.inscricoes_online;
CREATE TRIGGER trg_ead_activate_matricula_on_paid_inscricao
AFTER INSERT OR UPDATE OF status ON public.inscricoes_online
FOR EACH ROW EXECUTE FUNCTION public.ead_activate_matricula_on_paid_inscricao();
