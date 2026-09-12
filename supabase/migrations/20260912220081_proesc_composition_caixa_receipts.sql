begin;

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_recebimentos_core(p_polo_id uuid, p_inicio date, p_fim date)
 RETURNS TABLE(id uuid, data_pagamento date, data_vencimento date, descricao text, pagador text, polo text, curso text, modalidade text, turma text, parcela_numero integer, total_parcelas integer, forma_pagamento text, conta text, valor_base numeric, juros numeric, multa numeric, acrescimo numeric, desconto numeric, diferenca_nao_discriminada numeric, composicao_status text, valor_recebido numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    cr.id,
    cr.data_pagamento,
    cr.data_vencimento,
    coalesce(nullif(trim(cr.descricao), ''), 'Recebimento') AS descricao,
    coalesce(nullif(trim(pagador.nome), ''), 'Pagador não identificado') AS pagador,
    CASE
      WHEN movimento_polo.id IS NULL THEN 'A CLASSIFICAR'
      ELSE concat_ws(
        ' · ',
        nullif(trim(movimento_polo.nome), ''),
        nullif(concat_ws('/', movimento_polo.cidade, movimento_polo.estado), '/')
      )
    END AS polo,
    coalesce(nullif(trim(curso.nome), ''), 'Curso não informado') AS curso,
    coalesce(nullif(trim(curso.modalidade), ''), 'OUTROS') AS modalidade,
    coalesce(
      nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
      'Turma não informada'
    ) AS turma,
    cr.parcela_numero,
    CASE
      WHEN cr.parcela_numero IS NULL THEN NULL
      WHEN coalesce(cr.gateway_installments, 0) > 1 THEN cr.gateway_installments
      WHEN coalesce(turma.qtd_parcelas, 0) > 0 THEN turma.qtd_parcelas
      ELSE NULL
    END AS total_parcelas,
    coalesce(
      nullif(
        trim(
          CASE
            WHEN upper(trim(coalesce(cr.gateway_settlement_channel, ''))) IN (
              'NAO_IDENTIFICADO',
              'NÃO IDENTIFICADO',
              'UNKNOWN'
            ) THEN NULL
            ELSE cr.gateway_settlement_channel
          END
        ),
        ''
      ),
      nullif(trim(cr.gateway_payment_method), ''),
      nullif(trim(cr.forma_pagamento), ''),
      'Não informada'
    ) AS forma_pagamento,
    CASE
      WHEN cb.id IS NULL THEN 'Conta não informada'
      ELSE concat_ws(
        ' · ',
        nullif(trim(cb.banco), ''),
        nullif(concat('Ag. ', cb.agencia), 'Ag. '),
        nullif(concat('Conta ', cb.conta), 'Conta ')
      )
    END AS conta,
    comp.valor_base,
    comp.juros,
    comp.multa,
    comp.acrescimo,
    comp.desconto,
    comp.diferenca_nao_discriminada,
    comp.composicao_status,
    comp.valor_recebido
  FROM public.contas_receber cr
  LEFT JOIN public.matriculas matricula
    ON matricula.id = cr.matricula_id
  LEFT JOIN public.parceiros pagador
    ON pagador.id = coalesce(cr.cliente_id, matricula.aluno_id)
  LEFT JOIN public.turmas turma
    ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  LEFT JOIN public.polos movimento_polo
    ON movimento_polo.id = cr.polo_id
  LEFT JOIN public.contas_bancarias cb
    ON cb.id = cr.conta_bancaria_id
  CROSS JOIN LATERAL public.resolve_integrated_receivable_financial_composition(
      cr.id,
    cr.valor,
    cr.valor_pago,
    cr.data_vencimento,
    cr.data_pagamento,
    cr.gateway_financial_terms,
    cr.manual_settlement_id,
    cr.manual_settlement_reversed_at,
    cr.manual_settlement_principal_cents,
    cr.manual_settlement_interest_cents,
    cr.manual_settlement_penalty_cents,
    cr.manual_settlement_addition_cents,
    cr.manual_settlement_discount_cents,
    cr.manual_settlement_received_cents
  ) comp
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= p_inicio
    AND cr.data_pagamento < p_fim
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.emprestimos_financeiros emprestimo
      WHERE emprestimo.conta_receber_id = cr.id
    )
  ORDER BY cr.data_pagamento, movimento_polo.nome, pagador.nome, cr.id;
$function$;

commit;

