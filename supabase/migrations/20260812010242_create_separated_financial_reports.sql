BEGIN;

-- A Central de Relatórios recebe somente invalidações leves dos fatos
-- financeiros já autorizados para o seu escopo. As linhas continuam sendo
-- entregues exclusivamente pela RPC abaixo.
DROP POLICY IF EXISTS finance_realtime_events_select
  ON public.finance_realtime_events;
CREATE POLICY finance_realtime_events_select
  ON public.finance_realtime_events
  FOR SELECT
  TO authenticated
  USING (
    (
      aluno_id IS NOT NULL
      AND aluno_id = public.current_aluno_id()
    )
    OR (
      (
        (polo_id IS NULL AND public.is_gestor_global())
        OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
      )
      AND (
        public.gestor_has_module('caixa')
        OR public.gestor_has_module('relatorios')
        OR public.gestor_has_financeiro_tab('resumo')
        OR public.gestor_has_financeiro_tab('receber')
        OR public.gestor_has_financeiro_tab('despesas')
        OR public.gestor_has_financeiro_tab('outros-debitos')
        OR public.gestor_has_financeiro_tab('outros-creditos')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
        OR public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
    )
  );

-- Contrato único para os cinco relatórios da Central de Relatórios:
-- * EXTRATO_CONTA: movimentos físicos de uma conta e seus saldos;
-- * ENTRADAS / SAIDAS: fluxo de caixa efetivamente realizado;
-- * RECEITAS / DESPESAS: competência operacional, sem principal de empréstimo.
-- O React apenas envia filtros e apresenta este payload canônico.
CREATE OR REPLACE FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  p_polo_id uuid DEFAULT NULL,
  p_tipo text DEFAULT 'ENTRADAS',
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_conta_bancaria_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_status text DEFAULT 'ATIVOS',
  p_busca text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_inicio date := p_data_inicio;
  v_fim date := p_data_fim;
  v_categoria text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_status text := upper(btrim(coalesce(p_status, 'ATIVOS')));
  v_busca text := nullif(left(btrim(coalesce(p_busca, '')), 160), '');
  v_limite constant integer := 1000;
  v_escopo text := 'Consolidado';
  v_contas jsonb := '[]'::jsonb;
  v_categorias jsonb := '[]'::jsonb;
  v_movimentos jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_valor_previsto numeric := 0;
  v_valor_realizado numeric := 0;
  v_valor_aberto numeric := 0;
  v_total_entradas numeric := 0;
  v_total_saidas numeric := 0;
  v_movimentos_sem_conta integer := 0;
  v_conta_rotulo text;
  v_conta_data_saldo date;
  v_conta_acesso_desde date;
  v_conta_saldo_inicial numeric := 0;
  v_conta_compartilhada boolean := false;
  v_saldo_disponivel boolean := false;
  v_saldo_abertura numeric;
  v_saldo_fechamento numeric;
  v_saldo_observacao text;
  v_mensagem text;
BEGIN
  IF v_tipo NOT IN ('EXTRATO_CONTA', 'ENTRADAS', 'SAIDAS', 'RECEITAS', 'DESPESAS') THEN
    RAISE EXCEPTION 'Tipo de relatório financeiro inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_conta_bancaria_id IS NOT NULL AND v_tipo IN ('RECEITAS', 'DESPESAS') THEN
    RAISE EXCEPTION 'Filtro por conta é aplicável somente ao extrato e ao fluxo de caixa.'
      USING ERRCODE = '22023';
  END IF;

  IF v_inicio IS NULL OR v_fim IS NULL OR v_fim < v_inicio THEN
    RAISE EXCEPTION 'Informe um período válido para o relatório.' USING ERRCODE = '22023';
  END IF;

  IF v_fim - v_inicio > 731 THEN
    RAISE EXCEPTION 'O período máximo do relatório financeiro é de 24 meses.' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN (
    'ATIVOS', 'TODOS', 'PAGO', 'PENDENTE', 'VENCIDO', 'SUSPENSO',
    'CANCELADO', 'ESTORNADO', 'DEVOLVIDO'
  ) THEN
    RAISE EXCEPTION 'Situação de relatório financeiro inválida.' USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.is_gestor_global()
         AND public.gestor_has_module('relatorios')
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.is_gestor_for_polo(p_polo_id)
         AND public.gestor_has_module('relatorios')
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos relatórios financeiros.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    SELECT polo.nome
    INTO v_escopo
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Polo do relatório não encontrado.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', conta.id,
      'banco', conta.banco,
      'titular', conta.titular,
      'agencia', conta.agencia,
      'conta', conta.numero_conta,
      'natureza', conta.natureza,
      'polo', conta.polo,
      'compartilhada', conta.compartilhada,
      'ativa', conta.ativa,
      'rotulo', conta.rotulo
    )
    ORDER BY conta.rotulo
  ), '[]'::jsonb)
  INTO v_contas
  FROM (
    SELECT
      cb.id,
      coalesce(cb.banco, '') AS banco,
      coalesce(cb.titular, '') AS titular,
      coalesce(cb.agencia, '') AS agencia,
      coalesce(cb.conta, '') AS numero_conta,
      coalesce(cb.natureza, 'BANCARIA') AS natureza,
      coalesce(polo.nome, 'Sem polo') AS polo,
      cb.ativo,
      (
        SELECT count(*) > 1
        FROM public.contas_bancarias_polos acesso
        WHERE acesso.conta_bancaria_id = cb.id
          AND acesso.created_at::date <= v_fim
      ) AS compartilhada,
      coalesce(
        nullif(concat_ws(' · ', nullif(cb.banco, ''), nullif(cb.agencia, ''), nullif(cb.conta, '')), ''),
        nullif(cb.codigo_interno, ''),
        'Conta bancária'
      ) AS rotulo
    FROM public.contas_bancarias cb
    LEFT JOIN public.polos polo ON polo.id = cb.polo_id
    WHERE (
      p_polo_id IS NULL
      OR cb.polo_id = p_polo_id
      OR EXISTS (
        SELECT 1
        FROM public.contas_bancarias_polos acesso
        WHERE acesso.conta_bancaria_id = cb.id
          AND acesso.polo_id = p_polo_id
          AND acesso.created_at::date <= v_fim
      )
    )
  ) conta;

  -- A tela precisa carregar a lista de contas antes de uma conta ser
  -- escolhida. Não há extrato sem conta porque não há saldo honesto a exibir.
  IF v_tipo = 'EXTRATO_CONTA' AND p_conta_bancaria_id IS NULL THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object(
        'tipo', v_tipo,
        'data_referencia', 'PAGAMENTO',
        'data_inicio', to_char(v_inicio, 'YYYY-MM-DD'),
        'data_fim', to_char(v_fim, 'YYYY-MM-DD'),
        'escopo', v_escopo,
        'conta_selecionada_id', NULL,
        'conta_selecionada', NULL
      ),
      'contas', v_contas,
      'categorias', '[]'::jsonb,
      'resumo', jsonb_build_object(
        'total_lancamentos', 0,
        'valor_previsto', 0,
        'valor_realizado', 0,
        'valor_em_aberto', 0,
        'total_entradas', 0,
        'total_saidas', 0,
        'saldo_abertura', NULL,
        'saldo_fechamento', NULL,
        'saldo_disponivel', false,
        'saldo_observacao', NULL
      ),
      'movimentos', '[]'::jsonb,
      'completo', true,
      'limite', v_limite,
      'mensagem', 'Selecione uma conta bancária ou caixa interno para gerar o extrato.'
    );
  END IF;

  IF p_conta_bancaria_id IS NOT NULL THEN
    SELECT
      coalesce(
        nullif(concat_ws(' · ', nullif(cb.banco, ''), nullif(cb.agencia, ''), nullif(cb.conta, '')), ''),
        nullif(cb.codigo_interno, ''),
        'Conta bancária'
      ),
      cb.data_saldo,
      coalesce(cb.saldo_inicial, 0),
      (
        SELECT count(*) > 1
        FROM public.contas_bancarias_polos acesso
        WHERE acesso.conta_bancaria_id = cb.id
          AND acesso.created_at::date <= v_fim
      ),
      CASE
        WHEN p_polo_id IS NULL OR cb.polo_id = p_polo_id THEN NULL::date
        ELSE (
          SELECT min(acesso.created_at::date)
          FROM public.contas_bancarias_polos acesso
          WHERE acesso.conta_bancaria_id = cb.id
            AND acesso.polo_id = p_polo_id
        )
      END
    INTO
      v_conta_rotulo,
      v_conta_data_saldo,
      v_conta_saldo_inicial,
      v_conta_compartilhada,
      v_conta_acesso_desde
    FROM public.contas_bancarias cb
    WHERE cb.id = p_conta_bancaria_id
      AND (
        p_polo_id IS NULL
        OR cb.polo_id = p_polo_id
        OR EXISTS (
          SELECT 1
          FROM public.contas_bancarias_polos acesso
          WHERE acesso.conta_bancaria_id = cb.id
            AND acesso.polo_id = p_polo_id
            AND acesso.created_at::date <= v_fim
        )
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A conta selecionada não está disponível neste escopo.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Conta compartilhada em um polo pode listar movimentos atribuídos ao polo,
  -- mas não pode exibir um saldo físico que também contém fatos de outros polos.
  v_saldo_disponivel := v_tipo = 'EXTRATO_CONTA'
    AND v_conta_data_saldo IS NOT NULL
    AND v_conta_data_saldo <= v_inicio
    AND (v_conta_acesso_desde IS NULL OR v_conta_acesso_desde <= v_inicio)
    AND (p_polo_id IS NULL OR NOT v_conta_compartilhada);

  IF v_tipo = 'EXTRATO_CONTA' AND NOT v_saldo_disponivel THEN
    IF v_conta_acesso_desde IS NOT NULL AND v_conta_acesso_desde > v_inicio THEN
      v_saldo_observacao := 'O vínculo deste polo com a conta começou após o início do período. Movimentos anteriores ao vínculo e os saldos foram ocultados.';
    ELSIF v_conta_data_saldo IS NULL OR v_conta_data_saldo > v_inicio THEN
      v_saldo_observacao := 'Não há uma base de saldo comprovadamente anterior ao início do período; os movimentos continuam disponíveis, mas os saldos foram ocultados.';
    ELSE
      v_saldo_observacao := 'A conta é compartilhada entre polos. Este extrato mostra somente os movimentos deste escopo e não apresenta saldo físico para não misturar operações de outros polos.';
    END IF;
  END IF;

  IF v_saldo_disponivel THEN
    WITH movimentos_conta AS (
      SELECT
        coalesce(recebimento.data_pagamento, recebimento.created_at::date) AS data,
        coalesce(
          CASE
            WHEN recebimento.manual_settlement_id IS NOT NULL
                 AND recebimento.manual_settlement_reversed_at IS NULL
              THEN recebimento.manual_settlement_received_cents::numeric / 100
          END,
          recebimento.valor_pago,
          recebimento.valor,
          0
        )::numeric AS delta
      FROM public.contas_receber recebimento
      WHERE recebimento.status = 'PAGO'
        AND recebimento.conta_bancaria_id = p_conta_bancaria_id
        AND coalesce(recebimento.data_pagamento, recebimento.created_at::date) >= v_conta_data_saldo

      UNION ALL

      SELECT
        coalesce(pagamento.data_pagamento, pagamento.created_at::date),
        -coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric
      FROM public.contas_pagar pagamento
      WHERE pagamento.status = 'PAGO'
        AND pagamento.despesa_lancamento_id IS NULL
        AND pagamento.conta_bancaria_id = p_conta_bancaria_id
        AND coalesce(pagamento.data_pagamento, pagamento.created_at::date) >= v_conta_data_saldo

      UNION ALL

      SELECT
        coalesce(despesa.data_pagamento, despesa.created_at::date),
        -coalesce(despesa.valor_pago, despesa.valor, 0)::numeric
      FROM public.despesas_lancamentos despesa
      WHERE despesa.status = 'PAGO'
        AND despesa.conta_bancaria_id = p_conta_bancaria_id
        AND coalesce(despesa.data_pagamento, despesa.created_at::date) >= v_conta_data_saldo

      UNION ALL

      SELECT transferencia.data_transferencia, -coalesce(transferencia.valor, 0)::numeric
      FROM public.transferencias_contas transferencia
      WHERE transferencia.tipo = 'FISICA'
        AND transferencia.conta_origem_id = p_conta_bancaria_id
        AND transferencia.data_transferencia >= v_conta_data_saldo

      UNION ALL

      SELECT transferencia.data_transferencia, coalesce(transferencia.valor, 0)::numeric
      FROM public.transferencias_contas transferencia
      WHERE transferencia.tipo = 'FISICA'
        AND transferencia.conta_destino_id = p_conta_bancaria_id
        AND transferencia.data_transferencia >= v_conta_data_saldo
    )
    SELECT
      round(v_conta_saldo_inicial + coalesce(sum(delta) FILTER (WHERE data < v_inicio), 0), 2),
      round(v_conta_saldo_inicial + coalesce(sum(delta) FILTER (WHERE data <= v_fim), 0), 2)
    INTO v_saldo_abertura, v_saldo_fechamento
    FROM movimentos_conta;
  END IF;

  WITH movimentos_base AS (
    -- Entradas realizadas: recebimentos operacionais e crédito de empréstimo.
    SELECT
      'RECEBIMENTO:' || recebimento.id::text AS id,
      coalesce(recebimento.data_pagamento, recebimento.created_at::date) AS data,
      'ENTRADA'::text AS direcao,
      CASE WHEN emprestimo.id IS NULL THEN 'RECEBIMENTO' ELSE 'FINANCIAMENTO' END AS classificacao,
      'CONTAS_RECEBER'::text AS origem,
      coalesce(nullif(recebimento.descricao, ''), 'Recebimento') AS descricao,
      coalesce(nullif(cliente.nome, ''), 'Sem cliente informado') AS contraparte,
      coalesce(recebimento.categoria_financeira_id::text, nullif(recebimento.categoria, ''), 'RECEBIMENTOS') AS categoria_chave,
      coalesce(nullif(categoria.nome, ''), nullif(recebimento.categoria, ''), 'Recebimentos') AS categoria,
      'PAGO'::text AS status,
      recebimento.conta_bancaria_id AS conta_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ) AS conta,
      coalesce(polo.nome, 'Sem polo') AS polo,
      coalesce(
        CASE
          WHEN recebimento.manual_settlement_id IS NOT NULL
               AND recebimento.manual_settlement_reversed_at IS NULL
            THEN recebimento.manual_settlement_received_cents::numeric / 100
        END,
        recebimento.valor_pago,
        recebimento.valor,
        0
      )::numeric AS valor,
      coalesce(
        CASE
          WHEN recebimento.manual_settlement_id IS NOT NULL
               AND recebimento.manual_settlement_reversed_at IS NULL
            THEN recebimento.manual_settlement_received_cents::numeric / 100
        END,
        recebimento.valor_pago,
        recebimento.valor,
        0
      )::numeric AS valor_previsto,
      coalesce(
        CASE
          WHEN recebimento.manual_settlement_id IS NOT NULL
               AND recebimento.manual_settlement_reversed_at IS NULL
            THEN recebimento.manual_settlement_received_cents::numeric / 100
        END,
        recebimento.valor_pago,
        recebimento.valor,
        0
      )::numeric AS valor_realizado,
      coalesce(
        CASE
          WHEN recebimento.manual_settlement_id IS NOT NULL
               AND recebimento.manual_settlement_reversed_at IS NULL
            THEN recebimento.manual_settlement_received_cents::numeric / 100
        END,
        recebimento.valor_pago,
        recebimento.valor,
        0
      )::numeric AS saldo_delta
    FROM public.contas_receber recebimento
    LEFT JOIN public.emprestimos_financeiros emprestimo
      ON emprestimo.conta_receber_id = recebimento.id
    LEFT JOIN public.parceiros cliente ON cliente.id = recebimento.cliente_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = recebimento.categoria_financeira_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = recebimento.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = recebimento.polo_id
    WHERE v_tipo IN ('EXTRATO_CONTA', 'ENTRADAS')
      AND recebimento.status = 'PAGO'
      AND coalesce(recebimento.data_pagamento, recebimento.created_at::date) BETWEEN v_inicio AND v_fim
      AND (v_conta_acesso_desde IS NULL OR coalesce(recebimento.data_pagamento, recebimento.created_at::date) >= v_conta_acesso_desde)
      AND (p_polo_id IS NULL OR recebimento.polo_id = p_polo_id)
      AND (p_conta_bancaria_id IS NULL OR recebimento.conta_bancaria_id = p_conta_bancaria_id)

    UNION ALL

    -- Saídas realizadas de contas a pagar não espelhadas por uma despesa.
    SELECT
      'PAGAMENTO:' || pagamento.id::text,
      coalesce(pagamento.data_pagamento, pagamento.created_at::date),
      'SAIDA'::text,
      CASE WHEN pagamento.emprestimo_parcela_id IS NULL THEN 'PAGAMENTO' ELSE 'FINANCIAMENTO' END,
      'CONTAS_PAGAR'::text,
      coalesce(nullif(pagamento.descricao, ''), 'Pagamento'),
      coalesce(nullif(fornecedor.nome, ''), 'Sem fornecedor informado'),
      coalesce(nullif(pagamento.categoria, ''), 'PAGAMENTOS'),
      coalesce(nullif(pagamento.categoria, ''), 'Pagamentos'),
      'PAGO'::text,
      pagamento.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
      -coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric
    FROM public.contas_pagar pagamento
    LEFT JOIN public.parceiros fornecedor ON fornecedor.id = pagamento.fornecedor_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = pagamento.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = pagamento.polo_id
    WHERE v_tipo IN ('EXTRATO_CONTA', 'SAIDAS')
      AND pagamento.status = 'PAGO'
      AND pagamento.despesa_lancamento_id IS NULL
      AND coalesce(pagamento.data_pagamento, pagamento.created_at::date) BETWEEN v_inicio AND v_fim
      AND (v_conta_acesso_desde IS NULL OR coalesce(pagamento.data_pagamento, pagamento.created_at::date) >= v_conta_acesso_desde)
      AND (p_polo_id IS NULL OR pagamento.polo_id = p_polo_id)
      AND (p_conta_bancaria_id IS NULL OR pagamento.conta_bancaria_id = p_conta_bancaria_id)

    UNION ALL

    -- Despesas possuem entidade própria; nunca duplicam contas_pagar ligadas.
    SELECT
      'DESPESA:' || despesa.id::text,
      coalesce(despesa.data_pagamento, despesa.created_at::date),
      'SAIDA'::text,
      'DESPESA'::text,
      'DESPESAS_LANCAMENTOS'::text,
      coalesce(nullif(despesa.descricao, ''), 'Despesa'),
      coalesce(nullif(fornecedor.nome, ''), 'Sem fornecedor informado'),
      coalesce(despesa.categoria_financeira_id::text, nullif(despesa.tipo, ''), 'DESPESAS'),
      coalesce(nullif(categoria.nome, ''), nullif(despesa.tipo, ''), 'Despesas'),
      'PAGO'::text,
      despesa.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
      -coalesce(despesa.valor_pago, despesa.valor, 0)::numeric
    FROM public.despesas_lancamentos despesa
    LEFT JOIN public.parceiros fornecedor ON fornecedor.id = despesa.fornecedor_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = despesa.categoria_financeira_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = despesa.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = despesa.polo_id
    WHERE v_tipo IN ('EXTRATO_CONTA', 'SAIDAS')
      AND despesa.status = 'PAGO'
      AND coalesce(despesa.data_pagamento, despesa.created_at::date) BETWEEN v_inicio AND v_fim
      AND (v_conta_acesso_desde IS NULL OR coalesce(despesa.data_pagamento, despesa.created_at::date) >= v_conta_acesso_desde)
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)
      AND (p_conta_bancaria_id IS NULL OR despesa.conta_bancaria_id = p_conta_bancaria_id)

    UNION ALL

    -- Transferência física é entrada no destino; rateio interno nunca altera o extrato físico.
    SELECT
      'TRANSFERENCIA_ENTRADA:' || transferencia.id::text,
      transferencia.data_transferencia,
      'ENTRADA'::text,
      'TRANSFERENCIA'::text,
      'TRANSFERENCIAS_CONTAS'::text,
      coalesce(nullif(transferencia.observacao, ''), 'Transferência recebida'),
      coalesce(
        nullif(concat_ws(' · ', nullif(origem.banco, ''), nullif(origem.agencia, ''), nullif(origem.conta, '')), ''),
        nullif(origem.codigo_interno, ''),
        'Conta de origem'
      ),
      'TRANSFERENCIA'::text,
      'Transferência física'::text,
      'PAGO'::text,
      transferencia.conta_destino_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(destino.banco, ''), nullif(destino.agencia, ''), nullif(destino.conta, '')), ''),
        nullif(destino.codigo_interno, ''),
        'Conta de destino'
      ),
      coalesce(polo_destino.nome, 'Sem polo'),
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric
    FROM public.transferencias_contas transferencia
    LEFT JOIN public.contas_bancarias origem ON origem.id = transferencia.conta_origem_id
    LEFT JOIN public.contas_bancarias destino ON destino.id = transferencia.conta_destino_id
    LEFT JOIN public.polos polo_destino ON polo_destino.id = transferencia.polo_destino_id
    WHERE v_tipo IN ('EXTRATO_CONTA', 'ENTRADAS')
      AND transferencia.tipo = 'FISICA'
      AND transferencia.data_transferencia BETWEEN v_inicio AND v_fim
      AND (v_conta_acesso_desde IS NULL OR transferencia.data_transferencia >= v_conta_acesso_desde)
      AND (p_polo_id IS NULL OR transferencia.polo_destino_id = p_polo_id)
      AND (p_conta_bancaria_id IS NULL OR transferencia.conta_destino_id = p_conta_bancaria_id)

    UNION ALL

    -- Transferência física é saída na origem; rateio interno não entra no caixa.
    SELECT
      'TRANSFERENCIA_SAIDA:' || transferencia.id::text,
      transferencia.data_transferencia,
      'SAIDA'::text,
      'TRANSFERENCIA'::text,
      'TRANSFERENCIAS_CONTAS'::text,
      coalesce(nullif(transferencia.observacao, ''), 'Transferência enviada'),
      coalesce(
        nullif(concat_ws(' · ', nullif(destino.banco, ''), nullif(destino.agencia, ''), nullif(destino.conta, '')), ''),
        nullif(destino.codigo_interno, ''),
        'Conta de destino'
      ),
      'TRANSFERENCIA'::text,
      'Transferência física'::text,
      'PAGO'::text,
      transferencia.conta_origem_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(origem.banco, ''), nullif(origem.agencia, ''), nullif(origem.conta, '')), ''),
        nullif(origem.codigo_interno, ''),
        'Conta de origem'
      ),
      coalesce(polo_origem.nome, 'Sem polo'),
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
      -coalesce(transferencia.valor, 0)::numeric
    FROM public.transferencias_contas transferencia
    LEFT JOIN public.contas_bancarias origem ON origem.id = transferencia.conta_origem_id
    LEFT JOIN public.contas_bancarias destino ON destino.id = transferencia.conta_destino_id
    LEFT JOIN public.polos polo_origem ON polo_origem.id = transferencia.polo_id
    WHERE v_tipo IN ('EXTRATO_CONTA', 'SAIDAS')
      AND transferencia.tipo = 'FISICA'
      AND transferencia.data_transferencia BETWEEN v_inicio AND v_fim
      AND (v_conta_acesso_desde IS NULL OR transferencia.data_transferencia >= v_conta_acesso_desde)
      AND (p_polo_id IS NULL OR transferencia.polo_id = p_polo_id)
      AND (p_conta_bancaria_id IS NULL OR transferencia.conta_origem_id = p_conta_bancaria_id)

    UNION ALL

    -- Receita é competência operacional. Crédito de empréstimo não é receita.
    SELECT
      'RECEITA:' || recebimento.id::text,
      recebimento.data_vencimento,
      'ENTRADA'::text,
      'RECEITA'::text,
      'CONTAS_RECEBER'::text,
      coalesce(nullif(recebimento.descricao, ''), 'Receita'),
      coalesce(nullif(cliente.nome, ''), 'Sem cliente informado'),
      coalesce(recebimento.categoria_financeira_id::text, nullif(recebimento.categoria, ''), 'RECEITAS'),
      coalesce(nullif(categoria.nome, ''), nullif(recebimento.categoria, ''), 'Receitas'),
      coalesce(recebimento.status, 'PENDENTE'),
      recebimento.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(recebimento.valor, 0)::numeric,
      coalesce(recebimento.valor, 0)::numeric,
      CASE
        WHEN recebimento.status = 'PAGO' THEN coalesce(
          CASE
            WHEN recebimento.manual_settlement_id IS NOT NULL
                 AND recebimento.manual_settlement_reversed_at IS NULL
              THEN recebimento.manual_settlement_received_cents::numeric / 100
          END,
          recebimento.valor_pago,
          recebimento.valor,
          0
        )::numeric
        ELSE 0::numeric
      END,
      0::numeric
    FROM public.contas_receber recebimento
    LEFT JOIN public.parceiros cliente ON cliente.id = recebimento.cliente_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = recebimento.categoria_financeira_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = recebimento.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = recebimento.polo_id
    WHERE v_tipo = 'RECEITAS'
      AND recebimento.data_vencimento BETWEEN v_inicio AND v_fim
      AND upper(coalesce(recebimento.categoria, 'MENSALIDADE')) = 'MENSALIDADE'
      AND NOT EXISTS (
        SELECT 1
        FROM public.emprestimos_financeiros emprestimo
        WHERE emprestimo.conta_receber_id = recebimento.id
      )
      AND (p_polo_id IS NULL OR recebimento.polo_id = p_polo_id)

    UNION ALL

    -- Despesas operacionais diretas; empréstimos são tratados separadamente pelos encargos.
    SELECT
      'DESPESA_CONTA:' || pagamento.id::text,
      pagamento.data_vencimento,
      'SAIDA'::text,
      'DESPESA'::text,
      'CONTAS_PAGAR'::text,
      coalesce(nullif(pagamento.descricao, ''), 'Despesa'),
      coalesce(nullif(fornecedor.nome, ''), 'Sem fornecedor informado'),
      coalesce(nullif(pagamento.categoria, ''), 'DESPESAS'),
      coalesce(nullif(pagamento.categoria, ''), 'Despesas'),
      coalesce(pagamento.status, 'PENDENTE'),
      pagamento.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(pagamento.valor, 0)::numeric,
      coalesce(pagamento.valor, 0)::numeric,
      CASE WHEN pagamento.status = 'PAGO' THEN coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric ELSE 0::numeric END,
      0::numeric
    FROM public.contas_pagar pagamento
    LEFT JOIN public.parceiros fornecedor ON fornecedor.id = pagamento.fornecedor_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = pagamento.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = pagamento.polo_id
    WHERE v_tipo = 'DESPESAS'
      AND pagamento.data_vencimento BETWEEN v_inicio AND v_fim
      AND pagamento.despesa_lancamento_id IS NULL
      AND pagamento.emprestimo_parcela_id IS NULL
      AND coalesce(pagamento.categoria, '') <> 'EMPRESTIMO'
      AND coalesce(pagamento.categoria, '') <> 'ADIANTAMENTO_CEDIDO'
      AND (p_polo_id IS NULL OR pagamento.polo_id = p_polo_id)

    UNION ALL

    -- Lançamentos de despesa com categoria financeira própria.
    SELECT
      'DESPESA_OPERACIONAL:' || despesa.id::text,
      despesa.data_vencimento,
      'SAIDA'::text,
      'DESPESA'::text,
      'DESPESAS_LANCAMENTOS'::text,
      coalesce(nullif(despesa.descricao, ''), 'Despesa'),
      coalesce(nullif(fornecedor.nome, ''), 'Sem fornecedor informado'),
      coalesce(despesa.categoria_financeira_id::text, nullif(despesa.tipo, ''), 'DESPESAS'),
      coalesce(nullif(categoria.nome, ''), nullif(despesa.tipo, ''), 'Despesas'),
      coalesce(despesa.status, 'PENDENTE'),
      despesa.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(despesa.valor, 0)::numeric,
      coalesce(despesa.valor, 0)::numeric,
      CASE WHEN despesa.status = 'PAGO' THEN coalesce(despesa.valor_pago, despesa.valor, 0)::numeric ELSE 0::numeric END,
      0::numeric
    FROM public.despesas_lancamentos despesa
    LEFT JOIN public.parceiros fornecedor ON fornecedor.id = despesa.fornecedor_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = despesa.categoria_financeira_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = despesa.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = despesa.polo_id
    WHERE v_tipo = 'DESPESAS'
      AND despesa.data_vencimento BETWEEN v_inicio AND v_fim
      AND coalesce(despesa.rateio_modo, 'SEM_RATEIO') = 'SEM_RATEIO'
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)

    UNION ALL

    -- Em despesa rateada, todos os escopos usam somente as parcelas
    -- econômicas. Assim, a Matriz não soma o título físico inteiro junto com
    -- as alocações e o consolidado fecha uma única vez.
    SELECT
      'DESPESA_RATEIO:' || rateio.id::text,
      despesa.data_vencimento,
      'SAIDA'::text,
      'DESPESA_RATEADA'::text,
      'DESPESAS_LANCAMENTOS_RATEIOS'::text,
      coalesce(nullif(despesa.descricao, ''), 'Despesa rateada'),
      coalesce(nullif(fornecedor.nome, ''), 'Sem fornecedor informado'),
      coalesce(despesa.categoria_financeira_id::text, nullif(despesa.tipo, ''), 'DESPESAS'),
      coalesce(nullif(categoria.nome, ''), nullif(despesa.tipo, ''), 'Despesas'),
      coalesce(rateio.status, 'PENDENTE'),
      NULL::uuid,
      'Rateio econômico'::text,
      coalesce(polo_rateio.nome, 'Sem polo'),
      coalesce(rateio.valor_total, 0)::numeric,
      coalesce(rateio.valor_total, 0)::numeric,
      CASE WHEN rateio.status = 'PAGO' THEN coalesce(rateio.valor_total, 0)::numeric ELSE 0::numeric END,
      0::numeric
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa ON despesa.id = rateio.despesa_lancamento_id
    LEFT JOIN public.parceiros fornecedor ON fornecedor.id = despesa.fornecedor_id
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = despesa.categoria_financeira_id
    LEFT JOIN public.polos polo_rateio ON polo_rateio.id = rateio.polo_id
    WHERE v_tipo = 'DESPESAS'
      AND despesa.data_vencimento BETWEEN v_inicio AND v_fim
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)

    UNION ALL

    -- Em empréstimos rateados, a despesa financeira pertence economicamente
    -- aos polos do rateio; o título e a baixa física seguem apenas na Matriz.
    SELECT
      'ENCARGOS_EMPRESTIMO_RATEIO:' || rateio.emprestimo_parcela_id::text || ':' || rateio.polo_id::text,
      parcela.data_vencimento,
      'SAIDA'::text,
      'ENCARGOS_FINANCIAMENTO'::text,
      'EMPRESTIMO_PARCELA_RATEIO'::text,
      coalesce(nullif(pagamento.descricao, ''), 'Encargos de empréstimo'),
      coalesce(nullif(emprestimo.credor_nome, ''), 'Credor não informado'),
      'ENCARGOS_FINANCIAMENTO'::text,
      'Encargos de financiamento'::text,
      coalesce(rateio.status, 'PENDENTE'),
      pagamento.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo_rateio.nome, 'Sem polo'),
      coalesce(rateio.valor_encargos, 0)::numeric,
      coalesce(rateio.valor_encargos, 0)::numeric,
      CASE WHEN rateio.status = 'PAGO' THEN coalesce(rateio.valor_encargos, 0)::numeric ELSE 0::numeric END,
      0::numeric
    FROM public.emprestimo_parcela_rateios rateio
    JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    LEFT JOIN public.contas_pagar pagamento ON pagamento.emprestimo_parcela_id = parcela.id
    LEFT JOIN public.contas_bancarias conta ON conta.id = pagamento.conta_bancaria_id
    LEFT JOIN public.polos polo_rateio ON polo_rateio.id = rateio.polo_id
    WHERE v_tipo = 'DESPESAS'
      AND emprestimo.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND parcela.data_vencimento BETWEEN v_inicio AND v_fim
      AND coalesce(rateio.valor_encargos, 0) > 0
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)

    UNION ALL

    -- Em SEM_RATEIO, o encargo é econômico e físico no polo responsável.
    SELECT
      'ENCARGOS_EMPRESTIMO:' || pagamento.id::text,
      parcela.data_vencimento,
      'SAIDA'::text,
      'ENCARGOS_FINANCIAMENTO'::text,
      'CONTAS_PAGAR'::text,
      coalesce(nullif(pagamento.descricao, ''), 'Encargos de empréstimo'),
      coalesce(nullif(emprestimo.credor_nome, ''), 'Credor não informado'),
      'ENCARGOS_FINANCIAMENTO'::text,
      'Encargos de financiamento'::text,
      coalesce(parcela.status, 'PENDENTE'),
      pagamento.conta_bancaria_id,
      coalesce(
        nullif(concat_ws(' · ', nullif(conta.banco, ''), nullif(conta.agencia, ''), nullif(conta.conta, '')), ''),
        nullif(conta.codigo_interno, ''),
        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(parcela.valor_encargos, 0)::numeric,
      coalesce(parcela.valor_encargos, 0)::numeric,
      CASE
        WHEN parcela.status = 'PAGO' THEN least(
          coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
          coalesce(parcela.valor_encargos, 0)::numeric
        )
        ELSE 0::numeric
      END,
      0::numeric
    FROM public.contas_pagar pagamento
    JOIN public.emprestimo_parcelas parcela ON parcela.id = pagamento.emprestimo_parcela_id
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = pagamento.conta_bancaria_id
    LEFT JOIN public.polos polo ON polo.id = emprestimo.polo_matriz_id
    WHERE v_tipo = 'DESPESAS'
      AND coalesce(emprestimo.rateio_modo, 'SEM_RATEIO') = 'SEM_RATEIO'
      AND parcela.data_vencimento BETWEEN v_inicio AND v_fim
      AND coalesce(parcela.valor_encargos, 0) > 0
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
  ), movimentos_com_saldo AS (
    SELECT
      movimento.*,
      CASE
        WHEN v_saldo_disponivel THEN round(
          v_saldo_abertura
          + sum(movimento.saldo_delta) OVER (
            ORDER BY movimento.data ASC, movimento.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ),
          2
        )
        ELSE NULL::numeric
      END AS saldo_apos
    FROM movimentos_base movimento
  ), movimentos_filtrados AS (
    SELECT movimento.*
    FROM movimentos_com_saldo movimento
    WHERE (v_categoria IS NULL OR movimento.categoria_chave = v_categoria)
      AND (
        v_status = 'TODOS'
        OR movimento.status = v_status
        OR (
          v_status = 'ATIVOS'
          AND movimento.status NOT IN ('CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO')
        )
      )
      AND (
        v_busca IS NULL
        OR lower(concat_ws(' ', movimento.descricao, movimento.contraparte, movimento.categoria, movimento.conta, movimento.polo, movimento.classificacao))
          LIKE '%' || lower(v_busca) || '%'
      )
  ), ordenados AS (
    SELECT
      movimento.*,
      row_number() OVER (ORDER BY movimento.data DESC, movimento.id DESC) AS sequencia
    FROM movimentos_filtrados movimento
  ), categorias_disponiveis AS (
    SELECT DISTINCT categoria_chave, categoria
    FROM movimentos_base
    WHERE categoria_chave <> ''
  )
  SELECT
    count(*)::integer,
    coalesce(sum(valor_previsto), 0),
    coalesce(sum(valor_realizado), 0),
    coalesce(sum(
      CASE
        WHEN status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
          THEN greatest(valor_previsto - valor_realizado, 0)
        ELSE 0
      END
    ), 0),
    coalesce(sum(valor) FILTER (WHERE direcao = 'ENTRADA'), 0),
    coalesce(sum(valor) FILTER (WHERE direcao = 'SAIDA'), 0),
    (count(*) FILTER (WHERE conta_id IS NULL))::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'data', to_char(data, 'YYYY-MM-DD'),
        'direcao', direcao,
        'classificacao', classificacao,
        'origem', origem,
        'descricao', descricao,
        'contraparte', contraparte,
        'categoria_chave', categoria_chave,
        'categoria', categoria,
        'status', status,
        'conta_id', conta_id,
        'conta', conta,
        'polo', polo,
        'valor', round(valor, 2),
        'valor_previsto', round(valor_previsto, 2),
        'valor_realizado', round(valor_realizado, 2),
        'saldo_apos', saldo_apos
      )
      ORDER BY data DESC, id DESC
    ) FILTER (WHERE sequencia <= v_limite), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('chave', categoria_chave, 'rotulo', categoria)
        ORDER BY categoria
      )
      FROM categorias_disponiveis
    ), '[]'::jsonb)
  INTO
    v_total,
    v_valor_previsto,
    v_valor_realizado,
    v_valor_aberto,
    v_total_entradas,
    v_total_saidas,
    v_movimentos_sem_conta,
    v_movimentos,
    v_categorias
  FROM ordenados;

  IF v_total > v_limite THEN
    v_mensagem := 'A prévia foi limitada a ' || v_limite::text || ' lançamentos. Reduza o período ou aplique filtros antes de gerar o PDF.';
  END IF;

  IF v_tipo IN ('ENTRADAS', 'SAIDAS') AND v_movimentos_sem_conta > 0 THEN
    v_mensagem := concat_ws(
      ' ',
      v_mensagem,
      'Há ' || v_movimentos_sem_conta::text || ' movimento(s) sem conta bancária definida. Eles permanecem no fluxo para auditoria, mas não conciliam com extratos por conta.'
    );
  END IF;

  IF v_tipo = 'EXTRATO_CONTA' AND (v_categoria IS NOT NULL OR v_busca IS NOT NULL) THEN
    v_saldo_observacao := concat_ws(
      ' ',
      v_saldo_observacao,
      'Os saldos consideram todos os movimentos físicos da conta no período; entradas e saídas resumem apenas as linhas filtradas por categoria ou busca.'
    );
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'tipo', v_tipo,
      'data_referencia', CASE WHEN v_tipo IN ('RECEITAS', 'DESPESAS') THEN 'VENCIMENTO' ELSE 'PAGAMENTO' END,
      'data_inicio', to_char(v_inicio, 'YYYY-MM-DD'),
      'data_fim', to_char(v_fim, 'YYYY-MM-DD'),
      'escopo', v_escopo,
      'conta_selecionada_id', p_conta_bancaria_id,
      'conta_selecionada', v_conta_rotulo
    ),
    'contas', v_contas,
    'categorias', v_categorias,
    'resumo', jsonb_build_object(
      'total_lancamentos', v_total,
      'valor_previsto', round(v_valor_previsto, 2),
      'valor_realizado', round(v_valor_realizado, 2),
      'valor_em_aberto', round(v_valor_aberto, 2),
      'total_entradas', round(v_total_entradas, 2),
      'total_saidas', round(v_total_saidas, 2),
      'saldo_abertura', CASE WHEN v_saldo_disponivel THEN v_saldo_abertura ELSE NULL END,
      'saldo_fechamento', CASE WHEN v_saldo_disponivel THEN v_saldo_fechamento ELSE NULL END,
      'saldo_disponivel', v_saldo_disponivel,
      'saldo_observacao', v_saldo_observacao
    ),
    'movimentos', v_movimentos,
    'completo', v_total <= v_limite,
    'limite', v_limite,
    'mensagem', v_mensagem
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) IS 'Contrato canônico dos relatórios separados de extrato por conta, entradas, saídas, receitas e despesas da Central de Relatórios.';

NOTIFY pgrst, 'reload schema';

COMMIT;
