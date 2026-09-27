CREATE OR REPLACE FUNCTION internal_contas.get_caixa_workspace_v2_company_core(
  p_company_id uuid,
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone('America/Maceio', pg_catalog.now())::date,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_hoje date := pg_catalog.timezone('America/Maceio', pg_catalog.now())::date;
  v_competencia date := pg_catalog.date_trunc(
    'month', coalesce(p_competencia, pg_catalog.timezone(
      'America/Maceio', pg_catalog.now())::date)
  )::date;
  v_fim date; v_data_corte date;
  v_meses_historico integer := coalesce(p_meses_historico, 6);
  v_gerado_em timestamptz := pg_catalog.statement_timestamp();
  v_snapshot_id text := 'caixa-v2-' || pg_catalog.md5(
    pg_catalog.concat_ws('|', v_gerado_em::text, p_company_id::text,
      p_polo_id::text, p_competencia::text, p_meses_historico::text)
  );
  v_historico_completo boolean;
  v_fontes_pagar jsonb := '[
    {"fonte":"public.contas_pagar","finalidade":"TITULOS_LEGADOS"},
    {"fonte":"public.despesas_lancamentos","finalidade":"DESPESAS"},
    {"fonte":"public.despesas_lancamentos_rateios","finalidade":"RATEIO_ECONOMICO"}
  ]'::jsonb;
  v_indisponivel jsonb := pg_catalog.jsonb_build_object(
    'disponivel', false,
    'completo', false,
    'motivo', 'ETAPA_POSTERIOR',
    'observacao', 'Seção reservada para uma etapa posterior do contrato v2.',
    'dados', NULL
  );
  v_resultado jsonb;
BEGIN
  IF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.polos company_polo
    WHERE company_polo.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'A empresa informada não possui polos cadastrados.'
      USING ERRCODE = '22023';
  END IF;
  v_fim := (v_competencia + interval '1 month')::date;
  v_data_corte := least(v_hoje, v_fim - 1);
  v_historico_completo := v_competencia =
    pg_catalog.date_trunc('month', v_hoje)::date;
  IF v_competencia > pg_catalog.date_trunc('month', v_hoje)::date THEN
    RAISE EXCEPTION 'A competência do workspace do Caixa não pode estar em mês futuro.'
      USING ERRCODE = '22023';
  END IF;
  IF v_meses_historico < 1 OR v_meses_historico > 12 THEN
    RAISE EXCEPTION 'O histórico do workspace do Caixa deve ter entre 1 e 12 meses.'
      USING ERRCODE = '22023';
  END IF;
  IF p_polo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.polos polo
    WHERE polo.id = p_polo_id
      AND polo.company_id = p_company_id
      AND polo.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'O polo informado não está ativo.'
      USING ERRCODE = '22023';
  END IF;
  WITH obrigacoes AS MATERIALIZED (
    -- Títulos legados sem vínculo com Despesas ou Financiamento.
    SELECT
      'CONTA_PAGAR:' || conta.id::text AS chave_linha,
      'CONTA_PAGAR:' || conta.id::text AS chave_titulo,
      conta.polo_id,
      pg_catalog.round(coalesce(conta.valor, 0), 2) AS valor_programado,
      pg_catalog.round(coalesce(conta.valor_pago, 0), 2) AS valor_pago,
      conta.data_vencimento,
      conta.data_pagamento,
      conta.status,
      conta.created_at::date AS data_registro,
      conta.status = 'PAGO' AND conta.valor_pago IS NULL
        AS pagamento_sem_valor
    FROM public.contas_pagar conta
    WHERE conta.despesa_lancamento_id IS NULL
      AND conta.emprestimo_parcela_id IS NULL
      AND conta.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR conta.polo_id = p_polo_id)
      AND EXISTS (
        SELECT 1 FROM public.polos source_polo
        WHERE source_polo.id = conta.polo_id
          AND source_polo.company_id = p_company_id
      )
    UNION ALL
    -- Despesa econômica própria do polo, sem rateio.
    SELECT
      'DESPESA:' || despesa.id::text,
      'DESPESA:' || despesa.id::text,
      despesa.polo_id,
      pg_catalog.round(coalesce(despesa.valor, 0), 2),
      pg_catalog.round(coalesce(despesa.valor_pago, 0), 2),
      despesa.data_vencimento,
      despesa.data_pagamento,
      despesa.status,
      despesa.created_at::date,
      despesa.status = 'PAGO' AND despesa.valor_pago IS NULL
    FROM public.despesas_lancamentos despesa
    WHERE despesa.rateio_modo = 'SEM_RATEIO'
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)
      AND EXISTS (
        SELECT 1 FROM public.polos source_polo
        WHERE source_polo.id = despesa.polo_id
          AND source_polo.company_id = p_company_id
      )
    UNION ALL
    -- A fração econômica substitui o título físico da Matriz no polo rateado.
    SELECT
      'RATEIO:' || rateio.id::text,
      'DESPESA:' || despesa.id::text,
      rateio.polo_id,
      pg_catalog.round(coalesce(rateio.valor_total, 0), 2),
      pg_catalog.round(CASE
        WHEN rateio.status = 'PAGO' THEN coalesce(rateio.valor_total, 0)
        ELSE 0
      END, 2),
      despesa.data_vencimento,
      rateio.data_pagamento,
      rateio.status,
      greatest(despesa.created_at::date, rateio.created_at::date),
      rateio.status = 'PAGO' AND rateio.valor_total IS NULL
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa
      ON despesa.id = rateio.despesa_lancamento_id
    JOIN public.polos parent_polo ON parent_polo.id = despesa.polo_id
      AND parent_polo.company_id = p_company_id
    JOIN public.polos source_polo ON source_polo.id = rateio.polo_id
      AND source_polo.company_id = p_company_id
    WHERE despesa.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND rateio.status <> 'CANCELADO'
      AND rateio.company_id = p_company_id
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)
  ),
  base AS MATERIALIZED (
    SELECT
      obrigacao.*,
      greatest(obrigacao.valor_programado - CASE
        WHEN obrigacao.status IN ('PENDENTE', 'VENCIDO')
          THEN obrigacao.valor_pago ELSE 0 END, 0) AS saldo_aberto,
      (
        obrigacao.data_registro <= v_data_corte
        AND (
          obrigacao.status IN ('PENDENTE', 'VENCIDO', 'ESTORNADO')
          OR (
            obrigacao.status = 'PAGO'
            AND obrigacao.data_pagamento > v_data_corte
          )
        )
      ) AS aberta_no_corte,
      (
        obrigacao.status = 'PAGO'
        AND obrigacao.data_pagamento IS NOT NULL
        AND obrigacao.data_pagamento <= v_data_corte
      ) AS paga_no_corte,
      (
        obrigacao.data_registro <= v_hoje
        AND (
          obrigacao.status IN ('PENDENTE', 'VENCIDO', 'ESTORNADO')
          OR (
            obrigacao.status = 'PAGO'
            AND obrigacao.data_pagamento > v_hoje
          )
        )
      ) AS aberta_hoje
    FROM obrigacoes obrigacao
    WHERE obrigacao.data_vencimento IS NOT NULL
      AND obrigacao.data_registro IS NOT NULL
  ),
  titulos AS MATERIALIZED (
    SELECT
      chave_titulo,
      pg_catalog.bool_and(paga_no_corte) AS totalmente_pago_no_corte,
      max(data_pagamento) FILTER (WHERE paga_no_corte) AS data_quitacao
    FROM base
    WHERE data_registro <= v_data_corte
    GROUP BY chave_titulo
  ),
  metricas AS MATERIALIZED (
    SELECT
      coalesce(sum(valor_programado) FILTER (
        WHERE data_registro <= v_data_corte
          AND data_vencimento >= v_competencia
          AND data_vencimento < v_fim
      ), 0)::numeric AS contas_valor,
      count(DISTINCT chave_titulo) FILTER (
        WHERE data_registro <= v_data_corte
          AND data_vencimento >= v_competencia
          AND data_vencimento < v_fim
      )::integer AS contas_quantidade,
      coalesce(sum(valor_pago) FILTER (
        WHERE paga_no_corte
          AND data_pagamento >= v_competencia
          AND data_pagamento < v_fim
      ), 0)::numeric AS pagas_valor,
      (
        SELECT count(*)::integer
        FROM titulos titulo
        WHERE titulo.totalmente_pago_no_corte
          AND titulo.data_quitacao >= v_competencia
          AND titulo.data_quitacao < v_fim
      ) AS pagas_quantidade,
      coalesce(sum(saldo_aberto) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento > v_data_corte
          AND data_vencimento < v_fim
      ), 0)::numeric AS a_vencer_valor,
      count(DISTINCT chave_titulo) FILTER (
        WHERE aberta_no_corte
          AND data_vencimento > v_data_corte
          AND data_vencimento < v_fim
      )::integer AS a_vencer_quantidade,
      coalesce(sum(saldo_aberto) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      ), 0)::numeric AS atraso_valor,
      count(DISTINCT chave_titulo) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      )::integer AS atraso_quantidade,
      min(data_vencimento) FILTER (
        WHERE aberta_no_corte AND data_vencimento < v_data_corte
      ) AS atraso_data_mais_antiga
    FROM base
  ),
  dias AS MATERIALIZED (
    SELECT (v_hoje + serie.indice)::date AS data
    FROM pg_catalog.generate_series(0, 7) AS serie(indice)
  ),
  agenda_por_dia AS MATERIALIZED (
    SELECT
      dia.data,
      coalesce(sum(base.saldo_aberto) FILTER (
        WHERE base.aberta_hoje
      ), 0)::numeric AS valor,
      count(DISTINCT base.chave_titulo) FILTER (
        WHERE base.aberta_hoje
      )::integer AS quantidade
    FROM dias dia
    LEFT JOIN base ON base.data_vencimento = dia.data
    GROUP BY dia.data
  ),
  agenda_dias AS MATERIALIZED (
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'data', pg_catalog.to_char(item.data, 'YYYY-MM-DD'),
          'valor', pg_catalog.round(item.valor, 2)::text,
          'quantidade', item.quantidade
        )
        ORDER BY item.data
      ),
      '[]'::jsonb
    ) AS itens
    FROM agenda_por_dia item
  ),
  agenda_metricas AS MATERIALIZED (
    SELECT
      coalesce(sum(valor) FILTER (WHERE data = v_hoje), 0)::numeric
        AS hoje_valor,
      coalesce(sum(quantidade) FILTER (WHERE data = v_hoje), 0)::integer
        AS hoje_quantidade,
      coalesce(sum(valor) FILTER (
        WHERE data > v_hoje AND data <= v_hoje + 7
      ), 0)::numeric AS sete_dias_valor,
      coalesce(sum(quantidade) FILTER (
        WHERE data > v_hoje AND data <= v_hoje + 7
      ), 0)::integer AS sete_dias_quantidade
    FROM agenda_por_dia
  ),
  qualidade AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE data_vencimento IS NULL)::integer
        AS obrigacoes_sem_vencimento,
      count(*) FILTER (WHERE data_registro IS NULL)::integer
        AS obrigacoes_sem_data_registro,
      count(*) FILTER (
        WHERE status = 'PAGO' AND data_pagamento IS NULL
      )::integer AS pagamentos_sem_data,
      count(*) FILTER (WHERE pagamento_sem_valor)::integer
        AS pagamentos_sem_valor,
      count(*) FILTER (
        WHERE status <> 'PAGO' AND valor_pago > 0
      )::integer AS pagamentos_parciais_sem_estado
    FROM obrigacoes
  ),
  estado_contrato AS MATERIALIZED (
    SELECT
      qualidade.*,
      qualidade.obrigacoes_sem_vencimento = 0
        AND qualidade.obrigacoes_sem_data_registro = 0
        AND qualidade.pagamentos_sem_data = 0
        AND qualidade.pagamentos_sem_valor = 0
        AND qualidade.pagamentos_parciais_sem_estado = 0
        AS qualidade_completa,
      '[]'::jsonb
        || CASE WHEN qualidade.obrigacoes_sem_vencimento > 0
          THEN '["OBRIGACOES_SEM_VENCIMENTO"]'::jsonb
          ELSE '[]'::jsonb END
        || CASE WHEN qualidade.obrigacoes_sem_data_registro > 0
          THEN '["OBRIGACOES_SEM_DATA_REGISTRO"]'::jsonb
          ELSE '[]'::jsonb END
        || CASE WHEN qualidade.pagamentos_sem_data > 0
          THEN '["PAGAMENTOS_SEM_DATA"]'::jsonb
          ELSE '[]'::jsonb END
        || CASE WHEN qualidade.pagamentos_sem_valor > 0
          THEN '["PAGAMENTOS_SEM_VALOR"]'::jsonb
          ELSE '[]'::jsonb END
        || CASE WHEN qualidade.pagamentos_parciais_sem_estado > 0
          THEN '["PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO"]'::jsonb
          ELSE '[]'::jsonb END AS motivos_qualidade
    FROM qualidade
  )
  SELECT pg_catalog.jsonb_build_object(
    'versao', 2,
    'meta', pg_catalog.jsonb_build_object(
      'competencia', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
      'periodo_inicio', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
      'periodo_fim_exclusivo', pg_catalog.to_char(v_fim, 'YYYY-MM-DD'),
      'data_corte', pg_catalog.to_char(v_data_corte, 'YYYY-MM-DD'),
      'data_institucional', pg_catalog.to_char(v_hoje, 'YYYY-MM-DD'),
      'timezone', 'America/Maceio',
      'snapshot_id', v_snapshot_id,
      'gerado_em', pg_catalog.to_char(
        pg_catalog.timezone('America/Maceio', v_gerado_em),
        'YYYY-MM-DD"T"HH24:MI:SS'
      ) || '-03:00',
      'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
      'empresa_id', p_company_id,
      'polo_id', p_polo_id,
      'meses_historico', v_meses_historico,
      'criterio_posicao', 'POSICAO_REEXPRESSA_NO_CORTE',
      'criterio_historico', 'POSICAO_REEXPRESSA_NO_CORTE',
      'criterio_realizado', 'PAGAMENTO_EFETIVO_ATE_CORTE'
    ),
    'regras', pg_catalog.jsonb_build_object(
      'compromissos_abertos_impactam_realizado', false,
      'compromissos_abertos_impactam_posicoes', false,
      'rateio_economico_duplica_baixa_fisica', false,
      'moeda', 'DECIMAL_TEXT_2'
    ),
    'secoes', pg_catalog.jsonb_build_object(
      'resumo_executivo', v_indisponivel,
      'compromissos', pg_catalog.jsonb_build_object(
        'disponivel', true,
        'completo', false,
        'motivo', 'SUBSECOES_EM_ETAPA_POSTERIOR',
        'observacao',
          'Contas a pagar e agenda estão disponíveis; recebíveis e inadimplência ainda não.',
        'dados', pg_catalog.jsonb_build_object(
          'fontes_consideradas', v_fontes_pagar,
          'fontes_indisponiveis', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'fonte', 'CONTAS_A_RECEBER_CANONICA', 'motivo', 'ETAPA_POSTERIOR'
            ),
            pg_catalog.jsonb_build_object(
              'fonte', 'INADIMPLENCIA_CANONICA', 'motivo', 'ETAPA_POSTERIOR'
            )
          ),
          'contas_a_pagar', pg_catalog.jsonb_build_object(
            'disponivel', true,
            'completo', v_historico_completo
              AND estado_contrato.qualidade_completa,
            'motivo', CASE
              WHEN v_historico_completo AND estado_contrato.qualidade_completa
                THEN NULL
              ELSE 'DADOS_INCOMPLETOS'
            END,
            'observacao',
              'Pagamentos parciais são preservados por fração de rateio; quantidade paga exige quitação integral do título.',
            'dados', pg_catalog.jsonb_build_object(
              'fontes_consideradas', v_fontes_pagar,
              'fontes_indisponiveis', CASE WHEN v_historico_completo
                THEN '[]'::jsonb
                ELSE pg_catalog.jsonb_build_array(
                  pg_catalog.jsonb_build_object(
                    'fonte', 'VIGENCIA_HISTORICA_CANCELAMENTOS_EXCLUSOES',
                    'motivo', 'FONTE_NAO_BITEMPORAL'
                  )
                )
              END,
              'motivos_incompletude', estado_contrato.motivos_qualidade
                || CASE WHEN NOT v_historico_completo
                  THEN '["CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA"]'::jsonb
                  ELSE '[]'::jsonb END,
              'criterio', 'POSICAO_REEXPRESSA_NO_CORTE',
              'unidade_quantidade', 'TITULO_FISICO_SEM_DUPLICACAO',
              'contas_competencia', pg_catalog.jsonb_build_object(
                'valor', pg_catalog.round(metricas.contas_valor, 2)::text,
                'quantidade', metricas.contas_quantidade
              ),
              'pagas_competencia', pg_catalog.jsonb_build_object(
                'valor', pg_catalog.round(metricas.pagas_valor, 2)::text,
                'quantidade', metricas.pagas_quantidade,
                'criterio_quantidade', 'TITULO_TOTALMENTE_PAGO_NO_CORTE'
              ),
              'a_vencer_competencia', pg_catalog.jsonb_build_object(
                'valor', pg_catalog.round(metricas.a_vencer_valor, 2)::text,
                'quantidade', metricas.a_vencer_quantidade
              ),
              'em_atraso', pg_catalog.jsonb_build_object(
                'valor', pg_catalog.round(metricas.atraso_valor, 2)::text,
                'quantidade', metricas.atraso_quantidade,
                'data_mais_antiga', CASE
                  WHEN metricas.atraso_data_mais_antiga IS NULL THEN NULL
                  ELSE pg_catalog.to_char(
                    metricas.atraso_data_mais_antiga, 'YYYY-MM-DD'
                  )
                END
              )
            )
          ),
          'contas_a_receber', v_indisponivel,
          'inadimplencia', v_indisponivel,
          'agenda_financeira', pg_catalog.jsonb_build_object(
            'disponivel', true,
            'completo', estado_contrato.qualidade_completa,
            'motivo', CASE WHEN estado_contrato.qualidade_completa
              THEN NULL ELSE 'DADOS_INCOMPLETOS' END,
            'observacao',
              'Agenda operacional ancorada na data institucional, independente da competência consultada.',
            'dados', pg_catalog.jsonb_build_object(
              'fontes_consideradas', v_fontes_pagar,
              'fontes_indisponiveis', '[]'::jsonb,
              'motivos_incompletude', estado_contrato.motivos_qualidade,
              'unidade_quantidade', 'TITULO_FISICO_SEM_DUPLICACAO',
              'hoje', pg_catalog.jsonb_build_object(
                'data', pg_catalog.to_char(v_hoje, 'YYYY-MM-DD'),
                'valor', pg_catalog.round(agenda_metricas.hoje_valor, 2)::text,
                'quantidade', agenda_metricas.hoje_quantidade
              ),
              'proximos_sete_dias', pg_catalog.jsonb_build_object(
                'periodo_inicio', pg_catalog.to_char(v_hoje + 1, 'YYYY-MM-DD'),
                'periodo_fim_exclusivo', pg_catalog.to_char(
                  v_hoje + 8, 'YYYY-MM-DD'
                ),
                'valor', pg_catalog.round(
                  agenda_metricas.sete_dias_valor, 2
                )::text,
                'quantidade', agenda_metricas.sete_dias_quantidade
              ),
              'dias', agenda_dias.itens
            )
          )
        )
      ),
      'fluxo', v_indisponivel,
      'cobertura', v_indisponivel,
      'posicoes', v_indisponivel,
      'operacoes', v_indisponivel,
      'qualidade_dados', pg_catalog.jsonb_build_object(
        'disponivel', true,
        'completo', estado_contrato.qualidade_completa,
        'motivo', CASE WHEN estado_contrato.qualidade_completa
          THEN NULL ELSE 'DADOS_INCOMPLETOS' END,
        'observacao',
          'A completude mede somente as fontes de contas a pagar disponíveis nesta etapa.',
        'dados', pg_catalog.jsonb_build_object(
          'fontes_consideradas', v_fontes_pagar,
          'fontes_indisponiveis', '[]'::jsonb,
          'motivos_incompletude', estado_contrato.motivos_qualidade,
          'historico_contas_pagar_completo', v_historico_completo,
          'obrigacoes_sem_vencimento',
            estado_contrato.obrigacoes_sem_vencimento,
          'obrigacoes_sem_data_registro',
            estado_contrato.obrigacoes_sem_data_registro,
          'pagamentos_sem_data', estado_contrato.pagamentos_sem_data,
          'pagamentos_sem_valor', estado_contrato.pagamentos_sem_valor,
          'pagamentos_parciais_sem_estado',
            estado_contrato.pagamentos_parciais_sem_estado
        )
      )
    )
  )
  INTO v_resultado
  FROM metricas
  CROSS JOIN agenda_dias
  CROSS JOIN agenda_metricas
  CROSS JOIN estado_contrato;
  RETURN v_resultado;
END;
$function$;
