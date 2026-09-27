BEGIN;

CREATE OR REPLACE FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(
  p_company_id uuid,
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone(
    'America/Maceio', pg_catalog.now()
  )::date,
  p_filtro text DEFAULT 'COMPETENCIA',
  p_pagina integer DEFAULT 1,
  p_tamanho_pagina integer DEFAULT 20,
  p_snapshot_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_modulo_autorizado boolean;
  v_hoje date := pg_catalog.timezone(
    'America/Maceio', pg_catalog.now()
  )::date;
  v_competencia date := pg_catalog.date_trunc(
    'month', coalesce(
      p_competencia,
      pg_catalog.timezone('America/Maceio', pg_catalog.now())::date
    )
  )::date;
  v_fim date;
  v_data_corte date;
  v_filtro text := upper(btrim(coalesce(p_filtro, '')));
  v_pagina integer := coalesce(p_pagina, 1);
  v_tamanho integer := coalesce(p_tamanho_pagina, 20);
  v_offset bigint;
  v_total bigint;
  v_itens jsonb;
  v_snapshot_id text;
BEGIN
  IF NOT v_service_role THEN
    IF auth.uid() IS NULL OR NOT coalesce(public.is_gestor(), false) THEN
      RAISE EXCEPTION 'Identidade gestora válida é obrigatória para o drill-down do Caixa.'
        USING ERRCODE = '42501';
    END IF;

    v_modulo_autorizado := CASE
      WHEN p_polo_id IS NULL THEN
        -- allPolos/is_gestor_global é administrador global do sistema e pode
        -- escolher qualquer empresa; cada payload continua company-scoped.
        coalesce(public.gestor_has_any_global_module(ARRAY['caixa']), false)
        OR (
          coalesce(public.gestor_has_any_global_module(ARRAY['financeiro']), false)
          AND coalesce(public.gestor_has_effective_financeiro_tab('despesas'), false)
        )
      ELSE
        coalesce(
          public.gestor_has_any_module_for_polo(ARRAY['caixa'], p_polo_id),
          false
        )
        OR (
          coalesce(
            public.gestor_has_any_module_for_polo(
              ARRAY['financeiro'], p_polo_id
            ),
            false
          )
          AND coalesce(public.gestor_has_effective_financeiro_tab('despesas'), false)
        )
    END;

    IF NOT v_modulo_autorizado THEN
      RAISE EXCEPTION 'Módulo, aba ou polo fora do escopo autorizado do Caixa.'
        USING ERRCODE = '42501';
    END IF;

    IF p_company_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.polos authorized_polo
      WHERE authorized_polo.company_id = p_company_id
        AND authorized_polo.status = 'ativo'
        AND (p_polo_id IS NULL OR authorized_polo.id = p_polo_id)
    ) THEN
      RAISE EXCEPTION 'Empresa ou polo fora do escopo autorizado do Caixa.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.polos company_polo
    WHERE company_polo.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'A empresa informada não possui polos cadastrados.'
      USING ERRCODE = '22023';
  END IF;

  IF v_service_role AND p_polo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.polos requested_polo
    WHERE requested_polo.id = p_polo_id
      AND requested_polo.company_id = p_company_id
      AND requested_polo.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'O polo informado não está ativo na empresa solicitada.'
      USING ERRCODE = '22023';
  END IF;

  IF v_competencia > pg_catalog.date_trunc('month', v_hoje)::date THEN
    RAISE EXCEPTION 'A competência do drill-down não pode estar em mês futuro.'
      USING ERRCODE = '22023';
  END IF;

  IF v_filtro NOT IN (
    'ATRASADAS', 'HOJE', 'PROXIMOS_7_DIAS', 'COMPETENCIA',
    'PAGAS_COMPETENCIA', 'A_VENCER_COMPETENCIA'
  ) THEN
    RAISE EXCEPTION 'Filtro inválido para o drill-down de contas a pagar.'
      USING ERRCODE = '22023';
  END IF;

  IF v_pagina < 1 OR v_tamanho < 1 OR v_tamanho > 100 THEN
    RAISE EXCEPTION 'Página deve ser positiva e o tamanho deve estar entre 1 e 100.'
      USING ERRCODE = '22023';
  END IF;

  v_fim := (v_competencia + interval '1 month')::date;
  v_data_corte := least(v_hoje, v_fim - 1);
  v_offset := (v_pagina::bigint - 1) * v_tamanho;

  WITH obrigacoes AS MATERIALIZED (
    SELECT
      'CONTA_PAGAR:' || conta.id::text AS chave,
      'CONTA_PAGAR_LEGADA'::text AS fonte,
      conta.polo_id,
      polo.nome AS polo_nome,
      coalesce(
        nullif(btrim(conta.descricao), ''),
        'Conta a pagar sem descrição'
      ) AS descricao,
      conta.status,
      conta.data_vencimento,
      conta.data_pagamento,
      conta.created_at::date AS data_registro,
      pg_catalog.round(coalesce(conta.valor, 0), 2) AS valor_programado,
      pg_catalog.round(coalesce(conta.valor_pago, 0), 2) AS valor_pago
    FROM public.contas_pagar conta
    JOIN public.polos polo
      ON polo.id = conta.polo_id
     AND polo.company_id = p_company_id
    WHERE conta.despesa_lancamento_id IS NULL
      AND conta.emprestimo_parcela_id IS NULL
      AND conta.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR conta.polo_id = p_polo_id)

    UNION ALL

    SELECT
      'DESPESA:' || despesa.id::text,
      'DESPESA'::text,
      despesa.polo_id,
      polo.nome,
      coalesce(
        nullif(btrim(despesa.descricao), ''),
        'Despesa sem descrição'
      ),
      despesa.status,
      despesa.data_vencimento,
      despesa.data_pagamento,
      despesa.created_at::date,
      pg_catalog.round(coalesce(despesa.valor, 0), 2),
      pg_catalog.round(coalesce(despesa.valor_pago, 0), 2)
    FROM public.despesas_lancamentos despesa
    JOIN public.polos polo
      ON polo.id = despesa.polo_id
     AND polo.company_id = p_company_id
    WHERE despesa.rateio_modo = 'SEM_RATEIO'
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)

    UNION ALL

    SELECT
      'RATEIO:' || rateio.id::text,
      'RATEIO_ECONOMICO'::text,
      rateio.polo_id,
      polo.nome,
      coalesce(
        nullif(btrim(despesa.descricao), ''),
        'Rateio de despesa sem descrição'
      ),
      rateio.status,
      despesa.data_vencimento,
      rateio.data_pagamento,
      greatest(despesa.created_at::date, rateio.created_at::date),
      pg_catalog.round(coalesce(rateio.valor_total, 0), 2),
      pg_catalog.round(CASE
        WHEN rateio.status = 'PAGO' THEN coalesce(rateio.valor_total, 0)
        ELSE 0
      END, 2)
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa
      ON despesa.id = rateio.despesa_lancamento_id
    JOIN public.polos parent_polo
      ON parent_polo.id = despesa.polo_id
     AND parent_polo.company_id = p_company_id
    JOIN public.polos polo
      ON polo.id = rateio.polo_id
     AND polo.company_id = p_company_id
    WHERE rateio.company_id = p_company_id
      AND despesa.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND despesa.excluido_em IS NULL
      AND despesa.status <> 'CANCELADO'
      AND rateio.status <> 'CANCELADO'
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)
  ),
  base AS MATERIALIZED (
    SELECT
      obrigacao.*,
      greatest(obrigacao.valor_programado - CASE
        WHEN obrigacao.status IN ('PENDENTE', 'VENCIDO')
          THEN obrigacao.valor_pago ELSE 0 END, 0) AS saldo_aberto,
      obrigacao.data_registro <= v_data_corte AND (
        obrigacao.status IN ('PENDENTE', 'VENCIDO', 'ESTORNADO')
        OR (
          obrigacao.status = 'PAGO'
          AND obrigacao.data_pagamento > v_data_corte
        )
      ) AS aberta_no_corte,
      obrigacao.status = 'PAGO'
        AND obrigacao.data_pagamento IS NOT NULL
        AND obrigacao.data_pagamento <= v_data_corte AS paga_no_corte,
      obrigacao.data_registro <= v_hoje AND (
        obrigacao.status IN ('PENDENTE', 'VENCIDO', 'ESTORNADO')
        OR (
          obrigacao.status = 'PAGO'
          AND obrigacao.data_pagamento > v_hoje
        )
      ) AS aberta_hoje
    FROM obrigacoes obrigacao
    WHERE obrigacao.data_vencimento IS NOT NULL
      AND obrigacao.data_registro IS NOT NULL
  ),
  filtradas AS MATERIALIZED (
    SELECT
      base.*,
      CASE
        WHEN v_filtro IN ('HOJE', 'PROXIMOS_7_DIAS') THEN
          CASE
            WHEN aberta_hoje AND data_vencimento < v_hoje THEN 'VENCIDO'
            WHEN aberta_hoje THEN 'PENDENTE'
            ELSE status
          END
        ELSE CASE
          WHEN paga_no_corte THEN 'PAGO'
          WHEN aberta_no_corte AND data_vencimento < v_data_corte THEN 'VENCIDO'
          WHEN aberta_no_corte THEN 'PENDENTE'
          ELSE status
        END
      END AS status_contextual,
      CASE
        WHEN status IN ('PENDENTE', 'VENCIDO') THEN valor_pago
        WHEN status = 'PAGO' AND data_pagamento <= CASE
          WHEN v_filtro IN ('HOJE', 'PROXIMOS_7_DIAS') THEN v_hoje
          ELSE v_data_corte
        END THEN valor_pago
        ELSE 0
      END AS valor_pago_contextual,
      CASE WHEN data_pagamento <= CASE
        WHEN v_filtro IN ('HOJE', 'PROXIMOS_7_DIAS') THEN v_hoje
        ELSE v_data_corte
      END THEN data_pagamento ELSE NULL END AS data_pagamento_contextual
    FROM base
    WHERE CASE v_filtro
      WHEN 'ATRASADAS' THEN aberta_no_corte
        AND data_vencimento < v_data_corte
      WHEN 'HOJE' THEN aberta_hoje AND data_vencimento = v_hoje
      WHEN 'PROXIMOS_7_DIAS' THEN aberta_hoje
        AND data_vencimento > v_hoje
        AND data_vencimento <= v_hoje + 7
      WHEN 'COMPETENCIA' THEN data_registro <= v_data_corte
        AND data_vencimento >= v_competencia
        AND data_vencimento < v_fim
      WHEN 'PAGAS_COMPETENCIA' THEN paga_no_corte
        AND data_pagamento >= v_competencia
        AND data_pagamento < v_fim
      WHEN 'A_VENCER_COMPETENCIA' THEN aberta_no_corte
        AND data_vencimento > v_data_corte
        AND data_vencimento < v_fim
    END
  ),
  ordenadas AS MATERIALIZED (
    SELECT
      filtrada.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_filtro = 'PAGAS_COMPETENCIA'
            THEN data_pagamento END DESC NULLS LAST,
          data_vencimento ASC NULLS LAST,
          chave ASC
      ) AS posicao
    FROM filtradas filtrada
  )
  SELECT
    count(*)::bigint,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'chave', item.chave,
          'fonte', item.fonte,
          'polo', pg_catalog.jsonb_build_object(
            'id', item.polo_id,
            'nome', coalesce(nullif(btrim(item.polo_nome), ''), 'Polo sem nome')
          ),
          'descricao', item.descricao,
          'status', item.status_contextual,
          'datas', pg_catalog.jsonb_build_object(
            'vencimento', pg_catalog.to_char(item.data_vencimento, 'YYYY-MM-DD'),
            'pagamento', CASE WHEN item.data_pagamento_contextual IS NULL THEN NULL
              ELSE pg_catalog.to_char(
                item.data_pagamento_contextual, 'YYYY-MM-DD'
              ) END,
            'registro', pg_catalog.to_char(item.data_registro, 'YYYY-MM-DD')
          ),
          'valor_programado', pg_catalog.round(item.valor_programado, 2)::text,
          'valor_pago', pg_catalog.round(item.valor_pago_contextual, 2)::text,
          'saldo_aberto', pg_catalog.round(
            CASE WHEN item.paga_no_corte THEN 0 ELSE item.saldo_aberto END,
            2
          )::text
        ) ORDER BY item.posicao
      ) FILTER (
        WHERE item.posicao > v_offset
          AND item.posicao <= v_offset + v_tamanho
      ),
      '[]'::jsonb
    ),
    'caixa-v2-drilldown-' || pg_catalog.md5(coalesce(
      pg_catalog.string_agg(
        pg_catalog.jsonb_build_array(
          item.chave, item.fonte, item.polo_id, item.polo_nome,
          item.descricao, item.status_contextual, item.data_vencimento,
          item.data_pagamento_contextual, item.data_registro,
          item.valor_programado, item.valor_pago_contextual, item.saldo_aberto
        )::text,
        E'\n' ORDER BY item.posicao
      ),
      ''
    ))
  INTO v_total, v_itens, v_snapshot_id
  FROM ordenadas item;

  IF p_snapshot_id IS NOT NULL AND p_snapshot_id <> v_snapshot_id THEN
    RAISE EXCEPTION 'A lista de contas a pagar mudou; reinicie a paginação.'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'versao', 2,
    'meta', pg_catalog.jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'empresa_id', p_company_id,
      'polo_id', p_polo_id,
      'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
      'competencia', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
      'periodo_inicio', pg_catalog.to_char(v_competencia, 'YYYY-MM-DD'),
      'periodo_fim_exclusivo', pg_catalog.to_char(v_fim, 'YYYY-MM-DD'),
      'data_corte', pg_catalog.to_char(v_data_corte, 'YYYY-MM-DD'),
      'data_institucional', pg_catalog.to_char(v_hoje, 'YYYY-MM-DD'),
      'timezone', 'America/Maceio',
      'criterio', 'POSICAO_REEXPRESSA_NO_CORTE',
      'unidade_contagem', 'LINHA_ECONOMICA',
      'all_polos_admin_global_sistema', true
    ),
    'filtro', v_filtro,
    'paginacao', pg_catalog.jsonb_build_object(
      'pagina', v_pagina,
      'tamanho_pagina', v_tamanho,
      'total_itens', v_total,
      'total_paginas', CASE WHEN v_total = 0 THEN 0 ELSE
        pg_catalog.ceil(v_total::numeric / v_tamanho)::integer END,
      'tem_anterior', v_pagina > 1,
      'tem_proxima', v_offset + v_tamanho < v_total
    ),
    'itens', v_itens
  );
END;
$function$;

ALTER FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(
  uuid, uuid, date, text, integer, integer, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(
  uuid, uuid, date, text, integer, integer, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(
  uuid, uuid, date, text, integer, integer, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(
  uuid, uuid, date, text, integer, integer, text
) IS
  'Drill-down paginado do Caixa Workspace v2 por linha econômica. O snapshot da primeira página protege páginas seguintes contra deslocamento; allPolos permanece administrador global do sistema e o payload é company-scoped.';

NOTIFY pgrst, 'reload schema';

COMMIT;
