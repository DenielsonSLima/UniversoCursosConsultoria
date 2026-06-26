-- Corrige matrículas EAD que permanecem em status de pagamento pendente mesmo com pagamento já confirmado.

DO $$
DECLARE
  v_item RECORD;
  v_fixed_count INTEGER := 0;
BEGIN
  FOR v_item IN
    SELECT
      m.id AS matricula_id,
      m.aluno_id,
      t.curso_id
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE c.modalidade = 'EAD'
      AND m.status IN ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO')
      AND (
        EXISTS (
          SELECT 1
          FROM public.inscricoes_online io
          WHERE io.matricula_id = m.id
            AND io.status = 'PAGO'
        )
        OR EXISTS (
          SELECT 1
          FROM public.contas_receber cr
          WHERE cr.matricula_id = m.id
            AND cr.tipo_lancamento = 'MATRICULA'
            AND cr.status = 'PAGO'
        )
      )
  LOOP
    UPDATE public.matriculas
      SET status = 'ATIVO',
          updated_at = NOW()
    WHERE id = v_item.matricula_id;

    UPDATE public.inscricoes_online
      SET
        status = 'PAGO',
        erro = NULL,
        pago_em = COALESCE(pago_em, NOW()),
        confirmado_em = COALESCE(confirmado_em, NOW()),
        forma_pagamento = COALESCE(forma_pagamento, 'MANUAL'),
        updated_at = NOW()
    WHERE matricula_id = v_item.matricula_id
      AND status IN ('AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO');

    PERFORM public.gerar_cobranca_matricula(v_item.matricula_id);
    PERFORM public.ead_get_aluno_progress(v_item.aluno_id, v_item.curso_id);

    v_fixed_count := v_fixed_count + 1;
  END LOOP;

  RAISE NOTICE 'Matrículas EAD ajustadas: %', v_fixed_count;
END $$;
