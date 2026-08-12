BEGIN;

-- A visão de movimentação já é o contrato canônico da Central de Relatórios.
-- Esta evolução aproveita a mesma base, adicionando agregações calculadas
-- antes do limite da prévia. A transformação defensiva evita reescrever a
-- migration já aplicada em produção.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_relatorio_movimentacao_financeira_secure(uuid,text,date,date,uuid,text,text,text)'::regprocedure
  )
  INTO v_definition;

  IF v_definition IS NULL
     OR position('v_categorias jsonb := ''[]''::jsonb;' IN v_definition) = 0
     OR position('WHERE v_tipo = ''RECEITAS''' IN v_definition) = 0
     OR position('categorias_disponiveis AS' IN v_definition) = 0
     OR position('''categorias'', v_categorias' IN v_definition) = 0
     OR position('v_agregacoes jsonb' IN v_definition) > 0
     OR position('''CATEGORIAS''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Definição inesperada do relatório financeiro; evolução de resumos abortada.'
      USING ERRCODE = '55000';
  END IF;

  v_definition := replace(
    v_definition,
    $from$  v_categorias jsonb := '[]'::jsonb;
  v_movimentos jsonb := '[]'::jsonb;$from$,
    $to$  v_categorias jsonb := '[]'::jsonb;
  v_agregacoes jsonb := jsonb_build_object(
    'categorias', '[]'::jsonb,
    'classificacoes', '[]'::jsonb,
    'origens', '[]'::jsonb
  );
  v_movimentos jsonb := '[]'::jsonb;$to$
  );

  v_definition := replace(
    v_definition,
    $from$  IF v_tipo NOT IN ('EXTRATO_CONTA', 'ENTRADAS', 'SAIDAS', 'RECEITAS', 'DESPESAS') THEN$from$,
    $to$  IF v_tipo NOT IN ('EXTRATO_CONTA', 'ENTRADAS', 'SAIDAS', 'RECEITAS', 'DESPESAS', 'CATEGORIAS') THEN$to$
  );

  v_definition := replace(
    v_definition,
    $from$  IF p_conta_bancaria_id IS NOT NULL AND v_tipo IN ('RECEITAS', 'DESPESAS') THEN$from$,
    $to$  IF p_conta_bancaria_id IS NOT NULL AND v_tipo IN ('RECEITAS', 'DESPESAS', 'CATEGORIAS') THEN$to$
  );

  v_definition := replace(
    v_definition,
    $from$      'categorias', '[]'::jsonb,
      'resumo', jsonb_build_object($from$,
    $to$      'categorias', '[]'::jsonb,
      'agregacoes', v_agregacoes,
      'resumo', jsonb_build_object($to$
  );

  v_definition := replace(
    v_definition,
    $from$    WHERE v_tipo = 'RECEITAS'$from$,
    $to$    WHERE v_tipo IN ('RECEITAS', 'CATEGORIAS')$to$
  );

  v_definition := replace(
    v_definition,
    $from$    WHERE v_tipo = 'DESPESAS'$from$,
    $to$    WHERE v_tipo IN ('DESPESAS', 'CATEGORIAS')$to$
  );

  v_definition := replace(
    v_definition,
    $from$      'data_referencia', CASE WHEN v_tipo IN ('RECEITAS', 'DESPESAS') THEN 'VENCIMENTO' ELSE 'PAGAMENTO' END,$from$,
    $to$      'data_referencia', CASE WHEN v_tipo IN ('RECEITAS', 'DESPESAS', 'CATEGORIAS') THEN 'VENCIMENTO' ELSE 'PAGAMENTO' END,$to$
  );

  v_definition := replace(
    v_definition,
    $from$  ), categorias_disponiveis AS (
    SELECT DISTINCT categoria_chave, categoria
    FROM movimentos_base
    WHERE categoria_chave <> ''
  )
  SELECT$from$,
    $to$  ), categorias_disponiveis AS (
    SELECT DISTINCT categoria_chave, categoria
    FROM movimentos_base
    WHERE categoria_chave <> ''
  ), agregacoes_categorias AS (
    SELECT
      categoria_chave AS chave,
      categoria AS rotulo,
      count(*)::integer AS total_lancamentos,
      coalesce(sum(valor_previsto), 0)::numeric AS valor_previsto,
      coalesce(sum(valor_realizado), 0)::numeric AS valor_realizado,
      coalesce(sum(
        CASE
          WHEN status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
            THEN greatest(valor_previsto - valor_realizado, 0)
          ELSE 0
        END
      ), 0)::numeric AS valor_em_aberto,
      coalesce(sum(valor) FILTER (WHERE direcao = 'ENTRADA'), 0)::numeric AS total_entradas,
      coalesce(sum(valor) FILTER (WHERE direcao = 'SAIDA'), 0)::numeric AS total_saidas
    FROM movimentos_filtrados
    GROUP BY categoria_chave, categoria
  ), agregacoes_classificacoes AS (
    SELECT
      classificacao AS chave,
      classificacao AS rotulo,
      count(*)::integer AS total_lancamentos,
      coalesce(sum(valor_previsto), 0)::numeric AS valor_previsto,
      coalesce(sum(valor_realizado), 0)::numeric AS valor_realizado,
      coalesce(sum(
        CASE
          WHEN status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
            THEN greatest(valor_previsto - valor_realizado, 0)
          ELSE 0
        END
      ), 0)::numeric AS valor_em_aberto,
      coalesce(sum(valor) FILTER (WHERE direcao = 'ENTRADA'), 0)::numeric AS total_entradas,
      coalesce(sum(valor) FILTER (WHERE direcao = 'SAIDA'), 0)::numeric AS total_saidas
    FROM movimentos_filtrados
    GROUP BY classificacao
  ), agregacoes_origens AS (
    SELECT
      origem AS chave,
      origem AS rotulo,
      count(*)::integer AS total_lancamentos,
      coalesce(sum(valor_previsto), 0)::numeric AS valor_previsto,
      coalesce(sum(valor_realizado), 0)::numeric AS valor_realizado,
      coalesce(sum(
        CASE
          WHEN status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
            THEN greatest(valor_previsto - valor_realizado, 0)
          ELSE 0
        END
      ), 0)::numeric AS valor_em_aberto,
      coalesce(sum(valor) FILTER (WHERE direcao = 'ENTRADA'), 0)::numeric AS total_entradas,
      coalesce(sum(valor) FILTER (WHERE direcao = 'SAIDA'), 0)::numeric AS total_saidas
    FROM movimentos_filtrados
    GROUP BY origem
  )
  SELECT$to$
  );

  v_definition := replace(
    v_definition,
    $from$    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('chave', categoria_chave, 'rotulo', categoria)
        ORDER BY categoria
      )
      FROM categorias_disponiveis
    ), '[]'::jsonb)
  INTO$from$,
    $to$    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('chave', categoria_chave, 'rotulo', categoria)
        ORDER BY categoria
      )
      FROM categorias_disponiveis
    ), '[]'::jsonb),
    jsonb_build_object(
      'categorias', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'chave', chave,
            'rotulo', rotulo,
            'total_lancamentos', total_lancamentos,
            'valor_previsto', round(valor_previsto, 2),
            'valor_realizado', round(valor_realizado, 2),
            'valor_em_aberto', round(valor_em_aberto, 2),
            'total_entradas', round(total_entradas, 2),
            'total_saidas', round(total_saidas, 2)
          )
          ORDER BY rotulo
        )
        FROM agregacoes_categorias
      ), '[]'::jsonb),
      'classificacoes', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'chave', chave,
            'rotulo', rotulo,
            'total_lancamentos', total_lancamentos,
            'valor_previsto', round(valor_previsto, 2),
            'valor_realizado', round(valor_realizado, 2),
            'valor_em_aberto', round(valor_em_aberto, 2),
            'total_entradas', round(total_entradas, 2),
            'total_saidas', round(total_saidas, 2)
          )
          ORDER BY rotulo
        )
        FROM agregacoes_classificacoes
      ), '[]'::jsonb),
      'origens', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'chave', chave,
            'rotulo', rotulo,
            'total_lancamentos', total_lancamentos,
            'valor_previsto', round(valor_previsto, 2),
            'valor_realizado', round(valor_realizado, 2),
            'valor_em_aberto', round(valor_em_aberto, 2),
            'total_entradas', round(total_entradas, 2),
            'total_saidas', round(total_saidas, 2)
          )
          ORDER BY rotulo
        )
        FROM agregacoes_origens
      ), '[]'::jsonb)
    )
  INTO$to$
  );

  v_definition := replace(
    v_definition,
    $from$    v_movimentos,
    v_categorias
  FROM ordenados;$from$,
    $to$    v_movimentos,
    v_categorias,
    v_agregacoes
  FROM ordenados;$to$
  );

  v_definition := replace(
    v_definition,
    $from$    'categorias', v_categorias,
    'resumo', jsonb_build_object($from$,
    $to$    'categorias', v_categorias,
    'agregacoes', v_agregacoes,
    'resumo', jsonb_build_object($to$
  );

  IF position('v_agregacoes jsonb' IN v_definition) = 0
     OR position('''CATEGORIAS''' IN v_definition) = 0
     OR position('agregacoes_categorias AS' IN v_definition) = 0
     OR position('''agregacoes'', v_agregacoes' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Evolução do relatório financeiro não encontrou todos os pontos de extensão.'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_relatorio_fluxo_caixa_secure(
  p_polo_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inicio date := p_data_inicio;
  v_fim date := p_data_fim;
  v_escopo text := 'Consolidado';
  v_entradas jsonb;
  v_saidas jsonb;
  v_receitas jsonb;
  v_despesas jsonb;
  v_entradas_realizadas numeric := 0;
  v_saidas_realizadas numeric := 0;
  v_receitas_em_aberto numeric := 0;
  v_despesas_em_aberto numeric := 0;
  v_fluxo_realizado numeric := 0;
  v_fluxo_projetado numeric := 0;
BEGIN
  IF v_inicio IS NULL OR v_fim IS NULL OR v_fim < v_inicio THEN
    RAISE EXCEPTION 'Informe um período válido para o fluxo de caixa.' USING ERRCODE = '22023';
  END IF;

  IF v_fim - v_inicio > 731 THEN
    RAISE EXCEPTION 'O período máximo do fluxo de caixa é de 24 meses.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Acesso não autorizado ao fluxo de caixa.' USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    SELECT polo.nome INTO v_escopo
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Polo do relatório não encontrado.' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_entradas := public.get_relatorio_movimentacao_financeira_secure(
    p_polo_id, 'ENTRADAS', v_inicio, v_fim, NULL, NULL, 'ATIVOS', NULL
  );
  v_saidas := public.get_relatorio_movimentacao_financeira_secure(
    p_polo_id, 'SAIDAS', v_inicio, v_fim, NULL, NULL, 'ATIVOS', NULL
  );
  v_receitas := public.get_relatorio_movimentacao_financeira_secure(
    p_polo_id, 'RECEITAS', v_inicio, v_fim, NULL, NULL, 'ATIVOS', NULL
  );
  v_despesas := public.get_relatorio_movimentacao_financeira_secure(
    p_polo_id, 'DESPESAS', v_inicio, v_fim, NULL, NULL, 'ATIVOS', NULL
  );

  v_entradas_realizadas := coalesce((v_entradas #>> '{resumo,total_entradas}')::numeric, 0);
  v_saidas_realizadas := coalesce((v_saidas #>> '{resumo,total_saidas}')::numeric, 0);
  v_receitas_em_aberto := coalesce((v_receitas #>> '{resumo,valor_em_aberto}')::numeric, 0);
  v_despesas_em_aberto := coalesce((v_despesas #>> '{resumo,valor_em_aberto}')::numeric, 0);
  v_fluxo_realizado := v_entradas_realizadas - v_saidas_realizadas;
  v_fluxo_projetado := v_fluxo_realizado + v_receitas_em_aberto - v_despesas_em_aberto;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'data_inicio', to_char(v_inicio, 'YYYY-MM-DD'),
      'data_fim', to_char(v_fim, 'YYYY-MM-DD'),
      'escopo', v_escopo
    ),
    'resumo', jsonb_build_object(
      'entradas_realizadas', round(v_entradas_realizadas, 2),
      'saidas_realizadas', round(v_saidas_realizadas, 2),
      'receitas_em_aberto', round(v_receitas_em_aberto, 2),
      'despesas_em_aberto', round(v_despesas_em_aberto, 2),
      'fluxo_realizado', round(v_fluxo_realizado, 2),
      'fluxo_projetado', round(v_fluxo_projetado, 2)
    ),
    'linhas', jsonb_build_array(
      jsonb_build_object(
        'chave', 'ENTRADAS_REALIZADAS',
        'rotulo', 'Entradas de caixa realizadas',
        'tipo', 'REALIZADO',
        'valor', round(v_entradas_realizadas, 2)
      ),
      jsonb_build_object(
        'chave', 'SAIDAS_REALIZADAS',
        'rotulo', 'Saídas de caixa realizadas',
        'tipo', 'REALIZADO',
        'valor', round(v_saidas_realizadas, 2)
      ),
      jsonb_build_object(
        'chave', 'RECEITAS_EM_ABERTO',
        'rotulo', 'Receitas operacionais em aberto',
        'tipo', 'PROJECAO',
        'valor', round(v_receitas_em_aberto, 2)
      ),
      jsonb_build_object(
        'chave', 'DESPESAS_EM_ABERTO',
        'rotulo', 'Despesas operacionais em aberto',
        'tipo', 'PROJECAO',
        'valor', round(v_despesas_em_aberto, 2)
      ),
      jsonb_build_object(
        'chave', 'FLUXO_REALIZADO',
        'rotulo', 'Resultado de caixa realizado',
        'tipo', 'RESULTADO',
        'valor', round(v_fluxo_realizado, 2)
      ),
      jsonb_build_object(
        'chave', 'FLUXO_PROJETADO',
        'rotulo', 'Resultado de caixa projetado',
        'tipo', 'RESULTADO',
        'valor', round(v_fluxo_projetado, 2)
      )
    ),
    'mensagem', 'O fluxo projetado combina o caixa efetivado com receitas e despesas operacionais em aberto no período. Não representa saldo físico de conta bancária.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_relatorio_fluxo_caixa_secure(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relatorio_fluxo_caixa_secure(uuid, date, date)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_relatorio_inadimplencia_secure(
  p_polo_id uuid DEFAULT NULL,
  p_data_corte date DEFAULT NULL,
  p_min_dias_atraso integer DEFAULT 1,
  p_busca text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_corte date := coalesce(p_data_corte, timezone('America/Maceio', now())::date);
  v_dias_minimo integer := coalesce(p_min_dias_atraso, 1);
  v_busca text := nullif(left(btrim(coalesce(p_busca, '')), 160), '');
  v_escopo text := 'Consolidado';
  v_limite constant integer := 1000;
  v_total_titulos integer := 0;
  v_total_devedores integer := 0;
  v_valor_em_atraso numeric := 0;
  v_valor_faturado_vencido numeric := 0;
  v_faixas jsonb := '[]'::jsonb;
  v_devedores jsonb := '[]'::jsonb;
  v_mensagem text;
BEGIN
  IF v_dias_minimo < 1 OR v_dias_minimo > 3650 THEN
    RAISE EXCEPTION 'Informe um atraso mínimo entre 1 e 3650 dias.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Acesso não autorizado ao relatório de inadimplência.' USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    SELECT polo.nome INTO v_escopo
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Polo do relatório não encontrado.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT coalesce(sum(recebimento.valor), 0)::numeric
  INTO v_valor_faturado_vencido
  FROM public.contas_receber recebimento
  WHERE recebimento.data_vencimento < v_corte
    AND upper(coalesce(recebimento.categoria, 'MENSALIDADE')) = 'MENSALIDADE'
    AND upper(coalesce(recebimento.status, 'PENDENTE')) NOT IN (
      'CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.emprestimos_financeiros emprestimo
      WHERE emprestimo.conta_receber_id = recebimento.id
    )
    AND (p_polo_id IS NULL OR recebimento.polo_id = p_polo_id);

  WITH titulos_base AS (
    SELECT
      recebimento.id,
      recebimento.cliente_id,
      recebimento.data_vencimento,
      coalesce(nullif(recebimento.descricao, ''), 'Mensalidade') AS descricao,
      coalesce(aluno.nome, 'Aluno não informado') AS devedor,
      coalesce(nullif(aluno.responsavel_telefone, ''), nullif(aluno.telefone, ''), 'Contato não informado') AS contato,
      coalesce(nullif(curso.nome, ''), nullif(turma.nome, ''), 'Curso não informado') AS curso,
      coalesce(polo.nome, 'Sem polo') AS polo,
      greatest(
        coalesce(recebimento.valor, 0)
        - coalesce(
          CASE
            WHEN recebimento.manual_settlement_id IS NOT NULL
                 AND liquidacao_manual.payment_date <= v_corte
                 AND (
                   (recebimento.manual_settlement_reversed_at AT TIME ZONE 'America/Maceio')::date > v_corte
                 OR (
                     recebimento.manual_settlement_reversed_at IS NULL
                     AND upper(coalesce(recebimento.status, '')) = 'PAGO'
                   )
                 )
              THEN least(
                coalesce(recebimento.valor, 0),
                coalesce(liquidacao_manual.principal_cents, 0)::numeric / 100
              )
            WHEN recebimento.manual_settlement_id IS NULL
                 AND (
                   recebimento.data_pagamento <= v_corte
                   OR (
                     recebimento.data_pagamento IS NULL
                     AND upper(coalesce(recebimento.status, '')) = 'PAGO'
                   )
                 )
              THEN CASE
                WHEN upper(coalesce(recebimento.status, '')) = 'PAGO'
                  THEN coalesce(recebimento.valor, 0)
                ELSE least(
                  coalesce(recebimento.valor, 0),
                  coalesce(recebimento.valor_pago, 0)
                )
              END
          END,
          0
        ),
        0
      )::numeric AS valor_em_aberto,
      (v_corte - recebimento.data_vencimento)::integer AS dias_atraso
    FROM public.contas_receber recebimento
    LEFT JOIN public.receivable_manual_settlements liquidacao_manual
      ON liquidacao_manual.id = recebimento.manual_settlement_id
    LEFT JOIN public.parceiros aluno ON aluno.id = recebimento.cliente_id
    LEFT JOIN public.turmas turma ON turma.id = recebimento.turma_id
    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
    LEFT JOIN public.polos polo ON polo.id = recebimento.polo_id
    WHERE recebimento.data_vencimento < v_corte
      AND upper(coalesce(recebimento.categoria, 'MENSALIDADE')) = 'MENSALIDADE'
      AND upper(coalesce(recebimento.status, 'PENDENTE')) NOT IN (
        'CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.emprestimos_financeiros emprestimo
        WHERE emprestimo.conta_receber_id = recebimento.id
      )
      AND (p_polo_id IS NULL OR recebimento.polo_id = p_polo_id)
  ), titulos_filtrados AS (
    SELECT
      titulo.*,
      CASE
        WHEN titulo.dias_atraso <= 7 THEN '1_7'
        WHEN titulo.dias_atraso <= 30 THEN '8_30'
        WHEN titulo.dias_atraso <= 60 THEN '31_60'
        WHEN titulo.dias_atraso <= 90 THEN '61_90'
        ELSE 'MAIS_90'
      END AS faixa
    FROM titulos_base titulo
    WHERE titulo.valor_em_aberto > 0
      AND titulo.dias_atraso >= v_dias_minimo
      AND (
        v_busca IS NULL
        OR lower(concat_ws(' ', titulo.devedor, titulo.contato, titulo.curso, titulo.descricao, titulo.polo))
          LIKE '%' || lower(v_busca) || '%'
      )
  ), faixas(chave, rotulo, ordem) AS (
    VALUES
      ('1_7'::text, '1 a 7 dias'::text, 1),
      ('8_30'::text, '8 a 30 dias'::text, 2),
      ('31_60'::text, '31 a 60 dias'::text, 3),
      ('61_90'::text, '61 a 90 dias'::text, 4),
      ('MAIS_90'::text, 'Mais de 90 dias'::text, 5)
  ), grupos AS (
    SELECT
      faixa.chave,
      faixa.rotulo,
      faixa.ordem,
      count(titulo.id)::integer AS quantidade,
      coalesce(sum(titulo.valor_em_aberto), 0)::numeric AS valor_em_aberto
    FROM faixas faixa
    LEFT JOIN titulos_filtrados titulo ON titulo.faixa = faixa.chave
    GROUP BY faixa.chave, faixa.rotulo, faixa.ordem
  ), ordenados AS (
    SELECT
      titulo.*,
      row_number() OVER (
        ORDER BY titulo.dias_atraso DESC, titulo.data_vencimento ASC, titulo.id ASC
      ) AS sequencia
    FROM titulos_filtrados titulo
  )
  SELECT
    count(*)::integer,
    count(DISTINCT coalesce(cliente_id::text, id::text))::integer,
    coalesce(sum(valor_em_aberto), 0)::numeric,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'chave', chave,
          'rotulo', rotulo,
          'quantidade', quantidade,
          'valor_em_aberto', round(valor_em_aberto, 2)
        )
        ORDER BY ordem
      )
      FROM grupos
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'devedor', devedor,
        'contato', contato,
        'curso', curso,
        'polo', polo,
        'descricao', descricao,
        'data_vencimento', to_char(data_vencimento, 'YYYY-MM-DD'),
        'dias_atraso', dias_atraso,
        'faixa', faixa,
        'valor_em_aberto', round(valor_em_aberto, 2)
      )
      ORDER BY dias_atraso DESC, data_vencimento ASC, id ASC
    ) FILTER (WHERE sequencia <= v_limite), '[]'::jsonb)
  INTO
    v_total_titulos,
    v_total_devedores,
    v_valor_em_atraso,
    v_faixas,
    v_devedores
  FROM ordenados;

  IF v_total_titulos > v_limite THEN
    v_mensagem := 'A prévia foi limitada a ' || v_limite::text || ' títulos. Reduza o escopo ou use a busca antes de gerar o PDF.';
  END IF;

  v_mensagem := concat_ws(
    ' ',
    v_mensagem,
    'Para corte histórico, pagamentos posteriores à data de corte não reduzem o saldo. Títulos legados quitados sem data de pagamento são tratados como quitados.'
  );

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'data_corte', to_char(v_corte, 'YYYY-MM-DD'),
      'escopo', v_escopo,
      'min_dias_atraso', v_dias_minimo
    ),
    'resumo', jsonb_build_object(
      'quantidade_titulos', v_total_titulos,
      'quantidade_devedores', v_total_devedores,
      'valor_em_atraso', round(v_valor_em_atraso, 2),
      'valor_faturado_vencido', round(v_valor_faturado_vencido, 2),
      'percentual_inadimplencia', CASE
        WHEN v_dias_minimo = 1
             AND v_busca IS NULL
             AND v_valor_faturado_vencido > 0
          THEN round((v_valor_em_atraso / v_valor_faturado_vencido) * 100, 2)
        ELSE NULL
      END,
      'percentual_comparavel', v_dias_minimo = 1 AND v_busca IS NULL
    ),
    'faixas', v_faixas,
    'devedores', v_devedores,
    'completo', v_total_titulos <= v_limite,
    'limite', v_limite,
    'mensagem', v_mensagem
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_relatorio_inadimplencia_secure(uuid, date, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relatorio_inadimplencia_secure(uuid, date, integer, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) IS 'Contrato canônico dos relatórios de movimentação e dos resumos financeiros da Central de Relatórios.';

COMMENT ON FUNCTION public.get_relatorio_fluxo_caixa_secure(uuid, date, date)
  IS 'Fluxo de caixa realizado e projetado a partir dos contratos canônicos da Central de Relatórios.';

COMMENT ON FUNCTION public.get_relatorio_inadimplencia_secure(uuid, date, integer, text)
  IS 'Aging canônico de mensalidades vencidas em aberto para a Central de Relatórios.';

NOTIFY pgrst, 'reload schema';

COMMIT;
