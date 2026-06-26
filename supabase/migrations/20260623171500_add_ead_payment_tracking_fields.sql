ALTER TABLE public.inscricoes_online
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.ead_activate_matricula_on_paid_inscricao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  IF NEW.matricula_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.modalidade
    INTO v_modalidade
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
   WHERE m.id = NEW.matricula_id;

  IF v_modalidade IS NULL OR v_modalidade <> 'EAD' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO') THEN
    UPDATE public.matriculas
      SET status = 'PENDENTE',
          updated_at = NOW()
    WHERE id = NEW.matricula_id
      AND status NOT IN ('PENDENTE', 'ATIVO', 'CONCLUIDO');
    RETURN NEW;
  END IF;

  IF NEW.status IN ('CANCELADO', 'VENCIDO', 'ERRO') THEN
    UPDATE public.matriculas
      SET status = 'CANCELADO',
          updated_at = NOW()
    WHERE id = NEW.matricula_id
      AND status IN ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO', 'VENCIDO', 'TRANCADO', 'DESISTENTE', 'TRANSFERIDO');
    RETURN NEW;
  END IF;

  IF NEW.status <> 'PAGO' THEN
    RETURN NEW;
  END IF;

  UPDATE public.matriculas
    SET status = 'ATIVO'
  WHERE id = NEW.matricula_id
    AND status IN ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO', 'VENCIDO');

  UPDATE public.inscricoes_online
  SET confirmado_em = COALESCE(confirmado_em, NOW())
  WHERE id = NEW.id
    AND confirmado_em IS NULL;

  PERFORM public.gerar_cobranca_matricula(NEW.matricula_id);

  UPDATE public.contas_receber
  SET
    status = 'PAGO',
    valor_pago = COALESCE(NEW.valor, valor_pago),
    data_pagamento = COALESCE(NEW.pago_em::DATE, CURRENT_DATE),
    forma_pagamento = COALESCE(NEW.forma_pagamento, forma_pagamento, 'ASAAS'),
    origem_pagamento = COALESCE(origem_pagamento, 'ASAAS'),
    asaas_payment_id = COALESCE(NULLIF(NEW.asaas_payment_id, ''), asaas_payment_id),
    asaas_status = COALESCE(UPPER(NEW.status), asaas_status),
    asaas_synced_at = NOW(),
    asaas_last_error = NULL,
    updated_at = NOW()
  WHERE matricula_id = NEW.matricula_id
    AND tipo_lancamento = 'MATRICULA';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ead_liberar_matricula(p_matricula_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula record;
  v_curso_id uuid;
BEGIN
  UPDATE public.matriculas
  SET status = 'ATIVO'
  WHERE id = p_matricula_id
  RETURNING * INTO v_matricula;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada';
  END IF;

  SELECT t.curso_id
    INTO v_curso_id
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = v_matricula.turma_id
      AND c.modalidade = 'EAD';

  IF v_curso_id IS NULL THEN
    RAISE EXCEPTION 'Matricula nao pertence a turma EAD';
  END IF;

  UPDATE public.inscricoes_online
  SET status = 'PAGO',
      erro = null,
      pago_em = COALESCE(pago_em, NOW()),
      confirmado_em = COALESCE(confirmado_em, NOW()),
      forma_pagamento = COALESCE(forma_pagamento, 'MANUAL'),
      updated_at = now()
  WHERE matricula_id = p_matricula_id
    AND status IN ('AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO');

  PERFORM public.ead_get_aluno_progress(v_matricula.aluno_id, v_curso_id);

  RETURN jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
END;
$$;
