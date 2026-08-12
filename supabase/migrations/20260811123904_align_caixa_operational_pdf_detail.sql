-- O resumo mensal do Caixa é operacional: créditos e parcelas de empréstimo
-- não participam do resultado. O detalhamento que alimenta o PDF deve usar o
-- mesmo recorte, caso contrário a barreira de conciliação recusa o documento.

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_recebimentos_core(
  p_polo_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS TABLE (
  id uuid,
  data_pagamento date,
  data_vencimento date,
  descricao text,
  pagador text,
  polo text,
  curso text,
  modalidade text,
  turma text,
  parcela_numero integer,
  total_parcelas integer,
  forma_pagamento text,
  conta text,
  valor_base numeric,
  juros numeric,
  multa numeric,
  acrescimo numeric,
  desconto numeric,
  diferenca_nao_discriminada numeric,
  composicao_status text,
  valor_recebido numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_principal_cents, 0)::numeric / 100
      ELSE coalesce(cr.valor, 0)
    END AS valor_base,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_interest_cents, 0)::numeric / 100
      WHEN coalesce(cr.valor_pago, cr.valor, 0) = coalesce(cr.valor, 0) THEN 0
      ELSE NULL
    END AS juros,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_penalty_cents, 0)::numeric / 100
      WHEN coalesce(cr.valor_pago, cr.valor, 0) = coalesce(cr.valor, 0) THEN 0
      ELSE NULL
    END AS multa,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_addition_cents, 0)::numeric / 100
      WHEN coalesce(cr.valor_pago, cr.valor, 0) = coalesce(cr.valor, 0) THEN 0
      ELSE NULL
    END AS acrescimo,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_discount_cents, 0)::numeric / 100
      WHEN coalesce(cr.valor_pago, cr.valor, 0) = coalesce(cr.valor, 0) THEN 0
      ELSE NULL
    END AS desconto,
    CASE
      WHEN cr.manual_settlement_id IS NULL
       AND coalesce(cr.valor_pago, cr.valor, 0) <> coalesce(cr.valor, 0)
      THEN coalesce(cr.valor_pago, cr.valor, 0) - coalesce(cr.valor, 0)
      ELSE 0
    END AS diferenca_nao_discriminada,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN 'COMPOSICAO_EXPLICITA'
      WHEN coalesce(cr.valor_pago, cr.valor, 0) = coalesce(cr.valor, 0)
      THEN 'SEM_DIFERENCA_FINANCEIRA'
      ELSE 'NAO_DISCRIMINADA_PELO_GATEWAY'
    END AS composicao_status,
    CASE
      WHEN cr.manual_settlement_id IS NOT NULL
       AND cr.manual_settlement_reversed_at IS NULL
      THEN coalesce(cr.manual_settlement_received_cents, 0)::numeric / 100
      ELSE coalesce(cr.valor_pago, cr.valor, 0)
    END AS valor_recebido
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

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_despesas_core(
  p_polo_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS TABLE (
  id uuid,
  origem text,
  data_pagamento date,
  data_vencimento date,
  descricao text,
  fornecedor text,
  categoria text,
  polo text,
  curso text,
  turma text,
  parcela_numero integer,
  total_parcelas integer,
  forma_pagamento text,
  conta text,
  valor_base numeric,
  juros numeric,
  multa numeric,
  acrescimo numeric,
  desconto numeric,
  diferenca_nao_discriminada numeric,
  composicao_status text,
  valor_pago numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH movimentos AS (
    SELECT
      cp.id,
      'CONTA_PAGAR'::text AS origem,
      cp.data_pagamento,
      cp.data_vencimento,
      cp.descricao,
      cp.fornecedor_id,
      cp.categoria,
      cp.polo_id,
      NULL::uuid AS turma_id,
      NULL::integer AS parcela_numero,
      NULL::integer AS total_parcelas,
      cp.forma_pagamento,
      cp.conta_bancaria_id,
      coalesce(cp.valor, 0)::numeric AS valor_base,
      NULL::numeric AS juros,
      NULL::numeric AS multa,
      NULL::numeric AS acrescimo,
      NULL::numeric AS desconto,
      coalesce(cp.valor_pago, cp.valor, 0)::numeric AS valor_pago
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.despesa_lancamento_id IS NULL
      AND cp.emprestimo_parcela_id IS NULL
      AND cp.data_pagamento >= p_inicio
      AND cp.data_pagamento < p_fim
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    SELECT
      dl.id,
      'DESPESA_LANCAMENTO'::text,
      dl.data_pagamento,
      dl.data_vencimento,
      dl.descricao,
      dl.fornecedor_id,
      categoria.nome,
      dl.polo_id,
      dl.turma_id,
      dl.parcela_numero,
      dl.total_parcelas,
      dl.forma_pagamento,
      dl.conta_bancaria_id,
      coalesce(dl.valor_base, dl.valor, 0)::numeric,
      coalesce(dl.juros_valor, 0)::numeric,
      coalesce(dl.multa_valor, 0)::numeric,
      0::numeric,
      coalesce(dl.desconto_valor, 0)::numeric,
      coalesce(dl.valor_pago, dl.valor, 0)::numeric
    FROM public.despesas_lancamentos dl
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = dl.categoria_financeira_id
    WHERE dl.status = 'PAGO'
      AND dl.data_pagamento >= p_inicio
      AND dl.data_pagamento < p_fim
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  )
  SELECT
    movimento.id,
    movimento.origem,
    movimento.data_pagamento,
    movimento.data_vencimento,
    coalesce(nullif(trim(movimento.descricao), ''), 'Despesa') AS descricao,
    coalesce(nullif(trim(fornecedor.nome), ''), 'Fornecedor não identificado') AS fornecedor,
    coalesce(nullif(trim(movimento.categoria), ''), 'Outras despesas') AS categoria,
    CASE
      WHEN movimento_polo.id IS NULL THEN 'A CLASSIFICAR'
      ELSE concat_ws(
        ' · ',
        nullif(trim(movimento_polo.nome), ''),
        nullif(concat_ws('/', movimento_polo.cidade, movimento_polo.estado), '/')
      )
    END AS polo,
    coalesce(nullif(trim(curso.nome), ''), 'Sem curso vinculado') AS curso,
    coalesce(
      nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
      'Sem turma vinculada'
    ) AS turma,
    movimento.parcela_numero,
    movimento.total_parcelas,
    coalesce(nullif(trim(movimento.forma_pagamento), ''), 'Não informada') AS forma_pagamento,
    CASE
      WHEN cb.id IS NULL THEN 'Conta não informada'
      ELSE concat_ws(
        ' · ',
        nullif(trim(cb.banco), ''),
        nullif(concat('Ag. ', cb.agencia), 'Ag. '),
        nullif(concat('Conta ', cb.conta), 'Conta ')
      )
    END AS conta,
    movimento.valor_base,
    CASE
      WHEN movimento.origem = 'DESPESA_LANCAMENTO' THEN movimento.juros
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS juros,
    CASE
      WHEN movimento.origem = 'DESPESA_LANCAMENTO' THEN movimento.multa
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS multa,
    CASE
      WHEN movimento.origem = 'DESPESA_LANCAMENTO' THEN movimento.acrescimo
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS acrescimo,
    CASE
      WHEN movimento.origem = 'DESPESA_LANCAMENTO' THEN movimento.desconto
      WHEN movimento.valor_pago = movimento.valor_base THEN 0
      ELSE NULL
    END AS desconto,
    CASE
      WHEN movimento.origem = 'CONTA_PAGAR'
       AND movimento.valor_pago <> movimento.valor_base
      THEN movimento.valor_pago - movimento.valor_base
      ELSE 0
    END AS diferenca_nao_discriminada,
    CASE
      WHEN movimento.origem = 'DESPESA_LANCAMENTO' THEN 'COMPOSICAO_EXPLICITA'
      WHEN movimento.valor_pago = movimento.valor_base THEN 'SEM_DIFERENCA_FINANCEIRA'
      ELSE 'NAO_DISCRIMINADA'
    END AS composicao_status,
    movimento.valor_pago
  FROM movimentos movimento
  LEFT JOIN public.parceiros fornecedor
    ON fornecedor.id = movimento.fornecedor_id
  LEFT JOIN public.polos movimento_polo
    ON movimento_polo.id = movimento.polo_id
  LEFT JOIN public.turmas turma
    ON turma.id = movimento.turma_id
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  LEFT JOIN public.contas_bancarias cb
    ON cb.id = movimento.conta_bancaria_id
  ORDER BY movimento.data_pagamento, movimento_polo.nome, fornecedor.nome, movimento.id;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid, date, date)
  TO service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date) IS
  'Detalhes operacionais do Caixa: exclui créditos vinculados a empréstimos.';
COMMENT ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid, date, date) IS
  'Detalhes operacionais do Caixa: exclui parcelas vinculadas a empréstimos.';
