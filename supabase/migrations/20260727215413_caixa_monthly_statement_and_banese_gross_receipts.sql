-- Caixa mensal canônico:
-- - receitas entram pelo valor efetivamente pago (bruto);
-- - tarifas bancárias confirmadas são despesas separadas;
-- - conta compartilhada é somada uma vez no consolidado e rateada por polo;
-- - percentuais, escalas e resultados são calculados exclusivamente no banco.

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS despesa_lancamento_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contas_pagar_despesa_lancamento_fkey'
      AND conrelid = 'public.contas_pagar'::regclass
  ) THEN
    ALTER TABLE public.contas_pagar
      ADD CONSTRAINT contas_pagar_despesa_lancamento_fkey
      FOREIGN KEY (despesa_lancamento_id)
      REFERENCES public.despesas_lancamentos(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS contas_pagar_despesa_lancamento_uidx
  ON public.contas_pagar (despesa_lancamento_id)
  WHERE despesa_lancamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contas_receber_pago_polo_data_idx
  ON public.contas_receber (polo_id, data_pagamento)
  WHERE status = 'PAGO';

CREATE INDEX IF NOT EXISTS contas_receber_aberto_polo_vencimento_idx
  ON public.contas_receber (polo_id, data_vencimento)
  WHERE status IN ('PENDENTE', 'VENCIDO');

CREATE INDEX IF NOT EXISTS contas_pagar_pago_polo_data_idx
  ON public.contas_pagar (polo_id, data_pagamento)
  WHERE status = 'PAGO';

CREATE INDEX IF NOT EXISTS contas_pagar_aberto_polo_vencimento_idx
  ON public.contas_pagar (polo_id, data_vencimento)
  WHERE status IN ('PENDENTE', 'VENCIDO');

CREATE INDEX IF NOT EXISTS despesas_pago_polo_data_idx
  ON public.despesas_lancamentos (polo_id, data_pagamento)
  WHERE status = 'PAGO';

CREATE INDEX IF NOT EXISTS despesas_aberto_polo_vencimento_idx
  ON public.despesas_lancamentos (polo_id, data_vencimento)
  WHERE status IN ('PENDENTE', 'VENCIDO');

-- A única cobrança Banese preservada recebeu indevidamente a estimativa fixa
-- do Asaas. O próprio retorno bancário confirma o pagamento bruto e não
-- informa tarifa. Remover os campos derivados faz o histórico refletir a
-- evidência bancária sem inventar desconto.
UPDATE public.contas_receber
SET
  asaas_fee_value = NULL,
  asaas_net_value = NULL,
  gateway_fee_value = NULL,
  gateway_net_value = NULL,
  updated_at = now()
WHERE lower(coalesce(gateway_provider, '')) = 'banese_card'
  AND (
    asaas_fee_value IS NOT NULL
    OR asaas_net_value IS NOT NULL
    OR gateway_fee_value IS NOT NULL
    OR gateway_net_value IS NOT NULL
  );

-- Saldo físico: receita bruta recebida menos despesas efetivamente pagas.
-- Uma tarifa só reduz o saldo quando existir como despesa confirmada.
CREATE OR REPLACE FUNCTION public.get_contas_bancarias_saldos()
RETURNS TABLE (
  id uuid,
  banco text,
  titular text,
  agencia text,
  conta text,
  tipo text,
  natureza text,
  codigo_interno text,
  system_managed boolean,
  polo_id uuid,
  polo_name text,
  polo_nome text,
  polo_cnpj text,
  polo_cidade text,
  polo_uf text,
  polos_uso uuid[],
  saldo_inicial numeric,
  recebido numeric,
  pago numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  saldo_atual numeric,
  ativo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recebidos AS MATERIALIZED (
    SELECT
      cb.id AS conta_id,
      sum(coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      )) AS total
    FROM public.contas_bancarias cb
    JOIN public.contas_receber cr
      ON cr.conta_bancaria_id = cb.id
     AND cr.status = 'PAGO'
     AND (
       cb.data_saldo IS NULL
       OR coalesce(cr.data_pagamento, cr.created_at::date) >= cb.data_saldo
     )
    GROUP BY cb.id
  ),
  pagos AS MATERIALIZED (
    SELECT source.conta_id, sum(source.valor) AS total
    FROM (
      SELECT
        cp.conta_bancaria_id AS conta_id,
        coalesce(cp.valor_pago, cp.valor, 0) AS valor
      FROM public.contas_pagar cp
      JOIN public.contas_bancarias cb ON cb.id = cp.conta_bancaria_id
      WHERE cp.status = 'PAGO'
        AND cp.despesa_lancamento_id IS NULL
        AND (
          cb.data_saldo IS NULL
          OR coalesce(cp.data_pagamento, cp.created_at::date) >= cb.data_saldo
        )

      UNION ALL

      SELECT
        dl.conta_bancaria_id,
        coalesce(dl.valor_pago, dl.valor, 0)
      FROM public.despesas_lancamentos dl
      JOIN public.contas_bancarias cb ON cb.id = dl.conta_bancaria_id
      WHERE dl.status = 'PAGO'
        AND (
          cb.data_saldo IS NULL
          OR coalesce(dl.data_pagamento, dl.created_at::date) >= cb.data_saldo
        )
    ) source
    WHERE source.conta_id IS NOT NULL
    GROUP BY source.conta_id
  ),
  entradas AS MATERIALIZED (
    SELECT
      tc.conta_destino_id AS conta_id,
      sum(coalesce(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_destino_id
    WHERE tc.tipo = 'FISICA'
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
    GROUP BY tc.conta_destino_id
  ),
  saidas AS MATERIALIZED (
    SELECT
      tc.conta_origem_id AS conta_id,
      sum(coalesce(tc.valor, 0)) AS total
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_origem_id
    WHERE tc.tipo = 'FISICA'
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
    GROUP BY tc.conta_origem_id
  ),
  acessos AS MATERIALIZED (
    SELECT
      conta_bancaria_id,
      array_agg(polo_id ORDER BY polo_id) AS polos
    FROM public.contas_bancarias_polos
    GROUP BY conta_bancaria_id
  )
  SELECT
    cb.id,
    cb.banco,
    cb.titular,
    cb.agencia,
    cb.conta,
    cb.tipo,
    cb.natureza,
    cb.codigo_interno,
    cb.system_managed,
    cb.polo_id,
    coalesce(p.nome, '') AS polo_name,
    coalesce(p.nome, '') AS polo_nome,
    coalesce(p.cnpj, '') AS polo_cnpj,
    coalesce(p.cidade, '') AS polo_cidade,
    coalesce(p.estado, '') AS polo_uf,
    coalesce(acessos.polos, ARRAY[]::uuid[]) AS polos_uso,
    coalesce(cb.saldo_inicial, 0) AS saldo_inicial,
    coalesce(recebidos.total, 0) AS recebido,
    coalesce(pagos.total, 0) AS pago,
    coalesce(entradas.total, 0) AS transferencias_entrada,
    coalesce(saidas.total, 0) AS transferencias_saida,
    (
      coalesce(cb.saldo_inicial, 0)
      + coalesce(recebidos.total, 0)
      - coalesce(pagos.total, 0)
      + coalesce(entradas.total, 0)
      - coalesce(saidas.total, 0)
    ) AS saldo_atual,
    cb.ativo
  FROM public.contas_bancarias cb
  LEFT JOIN public.polos p ON p.id = cb.polo_id
  LEFT JOIN recebidos ON recebidos.conta_id = cb.id
  LEFT JOIN pagos ON pagos.conta_id = cb.id
  LEFT JOIN entradas ON entradas.conta_id = cb.id
  LEFT JOIN saidas ON saidas.conta_id = cb.id
  LEFT JOIN acessos ON acessos.conta_bancaria_id = cb.id
  WHERE public.can_access_conta_bancaria(cb.id)
  ORDER BY coalesce(p.nome, ''), cb.natureza DESC, cb.banco, cb.conta;
$$;

-- Posição gerencial: a mesma conta física pode ser compartilhada, mas cada
-- movimento mantém o polo de origem. RATEIO movimenta somente posições;
-- transferência FISICA também movimenta as contas.
CREATE OR REPLACE FUNCTION public.get_contas_bancarias_posicoes_polos_secure()
RETURNS TABLE (
  conta_bancaria_id uuid,
  polo_id uuid,
  entradas numeric,
  saidas numeric,
  saldo_gerencial numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH movimentos AS (
    SELECT
      cb.id AS conta_id,
      CASE
        WHEN (
          SELECT count(*)
          FROM public.contas_bancarias_polos acesso
          WHERE acesso.conta_bancaria_id = cb.id
        ) > 1 THEN NULL::uuid
        ELSE cb.polo_id
      END AS movimento_polo_id,
      coalesce(cb.saldo_inicial, 0)::numeric AS entrada,
      0::numeric AS saida
    FROM public.contas_bancarias cb
    WHERE public.can_access_conta_bancaria(cb.id)

    UNION ALL

    SELECT
      cr.conta_bancaria_id,
      cr.polo_id,
      coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      ),
      0::numeric
    FROM public.contas_receber cr
    JOIN public.contas_bancarias cb ON cb.id = cr.conta_bancaria_id
    WHERE cr.status = 'PAGO'
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(cr.data_pagamento, cr.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      cp.conta_bancaria_id,
      cp.polo_id,
      0::numeric,
      coalesce(cp.valor_pago, cp.valor, 0)
    FROM public.contas_pagar cp
    JOIN public.contas_bancarias cb ON cb.id = cp.conta_bancaria_id
    WHERE cp.status = 'PAGO'
      AND cp.despesa_lancamento_id IS NULL
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(cp.data_pagamento, cp.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      dl.conta_bancaria_id,
      dl.polo_id,
      0::numeric,
      coalesce(dl.valor_pago, dl.valor, 0)
    FROM public.despesas_lancamentos dl
    JOIN public.contas_bancarias cb ON cb.id = dl.conta_bancaria_id
    WHERE dl.status = 'PAGO'
      AND public.can_access_conta_bancaria(cb.id)
      AND (
        cb.data_saldo IS NULL
        OR coalesce(dl.data_pagamento, dl.created_at::date) >= cb.data_saldo
      )

    UNION ALL

    SELECT
      tc.conta_origem_id,
      tc.polo_id,
      0::numeric,
      tc.valor
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_origem_id
    WHERE public.can_access_conta_bancaria(cb.id)
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)

    UNION ALL

    SELECT
      tc.conta_destino_id,
      tc.polo_destino_id,
      tc.valor,
      0::numeric
    FROM public.transferencias_contas tc
    JOIN public.contas_bancarias cb ON cb.id = tc.conta_destino_id
    WHERE public.can_access_conta_bancaria(cb.id)
      AND (cb.data_saldo IS NULL OR tc.data_transferencia >= cb.data_saldo)
  )
  SELECT
    movimento.conta_id,
    movimento.movimento_polo_id,
    sum(movimento.entrada),
    sum(movimento.saida),
    sum(movimento.entrada) - sum(movimento.saida)
  FROM movimentos movimento
  GROUP BY movimento.conta_id, movimento.movimento_polo_id;
$$;

CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date;
  v_fim date;
  v_historico_inicio date;
  v_scope_label text;
  v_contas jsonb := '[]'::jsonb;
  v_receitas_modalidades jsonb := '[]'::jsonb;
  v_despesas_categorias jsonb := '[]'::jsonb;
  v_serie_mensal jsonb := '[]'::jsonb;
  v_saldo_total numeric := 0;
  v_saldo_bancario numeric := 0;
  v_caixa_local numeric := 0;
  v_compartilhado_total numeric := 0;
  v_posicao_compartilhada numeric := 0;
  v_saldo_nao_atribuido numeric := 0;
  v_entradas numeric := 0;
  v_saidas numeric := 0;
  v_tarifas_confirmadas numeric := 0;
  v_recebimentos integer := 0;
  v_pagamentos integer := 0;
  v_a_receber numeric := 0;
  v_receber_vencido numeric := 0;
  v_a_pagar numeric := 0;
  v_pagar_vencido numeric := 0;
  v_sem_polo_quantidade integer := 0;
  v_sem_polo_valor numeric := 0;
  v_sem_conta_quantidade integer := 0;
  v_sem_data_quantidade integer := 0;
  v_sem_modalidade_quantidade integer := 0;
  v_ultima_atualizacao timestamptz;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(
           ARRAY['caixa', 'financeiro'],
           p_polo_id
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a competência do Caixa.'
      USING ERRCODE = '22023';
  END IF;

  IF p_meses_historico IS NULL
     OR p_meses_historico < 1
     OR p_meses_historico > 12 THEN
    RAISE EXCEPTION 'O histórico do Caixa deve conter entre 1 e 12 meses.'
      USING ERRCODE = '22023';
  END IF;

  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim := (v_inicio + interval '1 month')::date;
  v_historico_inicio :=
    (v_inicio - ((p_meses_historico - 1) * interval '1 month'))::date;

  IF p_polo_id IS NULL THEN
    v_scope_label := 'Resultado geral';
  ELSE
    SELECT concat_ws(
      ' · ',
      polo.nome,
      concat_ws(
        '/',
        nullif(initcap(lower(trim(polo.cidade))), ''),
        upper(coalesce(nullif(trim(polo.estado), ''), 'SE'))
      )
    )
    INTO v_scope_label
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF v_scope_label IS NULL THEN
      RAISE EXCEPTION 'Polo não localizado para a prestação de contas.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH posicoes AS MATERIALIZED (
    SELECT posicao.*
    FROM public.get_contas_bancarias_posicoes_polos_secure() posicao
  ),
  saldos AS MATERIALIZED (
    SELECT
      saldo.*,
      greatest(cardinality(saldo.polos_uso), 1) AS unidades_uso,
      cardinality(saldo.polos_uso) > 1 AS compartilhada,
      coalesce((
        SELECT posicao.saldo_gerencial
        FROM posicoes posicao
        WHERE posicao.conta_bancaria_id = saldo.id
          AND posicao.polo_id = p_polo_id
      ), 0) AS posicao_polo,
      CASE
        WHEN p_polo_id IS NULL THEN saldo.saldo_atual
        ELSE coalesce((
          SELECT posicao.saldo_gerencial
          FROM posicoes posicao
          WHERE posicao.conta_bancaria_id = saldo.id
            AND posicao.polo_id = p_polo_id
        ), 0)
      END AS valor_exibido
    FROM public.get_contas_bancarias_saldos() saldo
    WHERE (saldo.ativo = true OR saldo.saldo_atual <> 0)
      AND (
        p_polo_id IS NULL
        OR p_polo_id = saldo.polo_id
        OR p_polo_id = ANY(saldo.polos_uso)
      )
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', saldos.id,
        'banco', saldos.banco,
        'agencia', saldos.agencia,
        'conta', saldos.conta,
        'titular', saldos.titular,
        'cidade_uf', concat_ws(
          '/',
          nullif(initcap(lower(trim(saldos.polo_cidade))), ''),
          upper(coalesce(nullif(trim(saldos.polo_uf), ''), 'SE'))
        ),
        'natureza', saldos.natureza,
        'compartilhada', saldos.compartilhada,
        'unidades_uso', saldos.unidades_uso,
        'valor_exibido', saldos.valor_exibido,
        'tipo_valor_exibido', CASE
          WHEN p_polo_id IS NOT NULL AND saldos.compartilhada
            THEN 'POSICAO_POLO'
          ELSE 'SALDO_CONTA'
        END,
        'saldo_total_registrado', saldos.saldo_atual,
        'posicao_gerencial_escopo', CASE
          WHEN p_polo_id IS NULL THEN saldos.saldo_atual
          ELSE saldos.posicao_polo
        END,
        'ativo', saldos.ativo,
        'codigo_interno', saldos.codigo_interno
      )
      ORDER BY
        CASE WHEN saldos.natureza = 'BANCARIA' THEN 0 ELSE 1 END,
        saldos.banco,
        saldos.conta
    ), '[]'::jsonb),
    coalesce(sum(saldos.valor_exibido), 0),
    coalesce(sum(saldos.valor_exibido)
      FILTER (WHERE saldos.natureza = 'BANCARIA'), 0),
    coalesce(sum(saldos.valor_exibido)
      FILTER (WHERE saldos.natureza = 'CAIXA_INTERNO'), 0),
    coalesce(sum(saldos.saldo_atual)
      FILTER (WHERE saldos.compartilhada), 0),
    coalesce(sum(
      CASE
        WHEN saldos.compartilhada THEN
          CASE
            WHEN p_polo_id IS NULL THEN saldos.saldo_atual
            ELSE saldos.posicao_polo
          END
        ELSE 0
      END
    ), 0)
  INTO
    v_contas,
    v_saldo_total,
    v_saldo_bancario,
    v_caixa_local,
    v_compartilhado_total,
    v_posicao_compartilhada
  FROM saldos;

  SELECT coalesce(sum(posicao.saldo_gerencial), 0)
  INTO v_saldo_nao_atribuido
  FROM public.get_contas_bancarias_posicoes_polos_secure() posicao
  JOIN public.contas_bancarias conta
    ON conta.id = posicao.conta_bancaria_id
  WHERE posicao.polo_id IS NULL
    AND (
      SELECT count(*)
      FROM public.contas_bancarias_polos acesso
      WHERE acesso.conta_bancaria_id = conta.id
    ) > 1;

  WITH catalogo(codigo, rotulo, ordem) AS (
    VALUES
      ('EAD'::text, 'Cursos EAD'::text, 1),
      ('LIVRE'::text, 'Cursos livres'::text, 2),
      ('TECNICO'::text, 'Cursos técnicos'::text, 3),
      ('ESPECIALIZACAO'::text, 'Especialização'::text, 4),
      ('SUPERIOR'::text, 'Ensino superior'::text, 5),
      ('OUTROS_CREDITOS'::text, 'Outros créditos'::text, 6),
      ('A_CLASSIFICAR'::text, 'A classificar'::text, 7)
  ),
  recebiveis_classificados AS MATERIALIZED (
    SELECT
      cr.id,
      cr.polo_id,
      cr.conta_bancaria_id,
      cr.status,
      cr.data_pagamento,
      cr.updated_at,
      coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      ) AS valor_recebido,
      CASE
        WHEN upper(coalesce(curso.modalidade, '')) IN (
          'EAD', 'LIVRE', 'TECNICO', 'ESPECIALIZACAO', 'SUPERIOR'
        ) THEN upper(curso.modalidade)
        WHEN upper(coalesce(cr.categoria, '')) = 'OUTROS_CREDITOS'
          THEN 'OUTROS_CREDITOS'
        ELSE 'A_CLASSIFICAR'
      END AS modalidade
    FROM public.contas_receber cr
    LEFT JOIN public.matriculas matricula ON matricula.id = cr.matricula_id
    LEFT JOIN public.turmas turma
      ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
  ),
  receitas_mes AS MATERIALIZED (
    SELECT recebivel.*
    FROM recebiveis_classificados recebivel
    WHERE recebivel.status = 'PAGO'
      AND recebivel.data_pagamento >= v_inicio
      AND recebivel.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR recebivel.polo_id = p_polo_id)
  ),
  total AS (
    SELECT
      coalesce(sum(valor_recebido), 0) AS valor,
      count(*)::integer AS quantidade
    FROM receitas_mes
  ),
  agrupado AS (
    SELECT
      catalogo.codigo,
      catalogo.rotulo,
      catalogo.ordem,
      coalesce(sum(receita.valor_recebido), 0) AS valor,
      count(receita.id)::integer AS quantidade
    FROM catalogo
    LEFT JOIN receitas_mes receita ON receita.modalidade = catalogo.codigo
    GROUP BY catalogo.codigo, catalogo.rotulo, catalogo.ordem
  )
  SELECT
    total.valor,
    total.quantidade,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'codigo', agrupado.codigo,
        'rotulo', agrupado.rotulo,
        'valor', agrupado.valor,
        'quantidade', agrupado.quantidade,
        'percentual', CASE
          WHEN total.valor = 0 THEN 0
          ELSE round((agrupado.valor / total.valor) * 100, 2)
        END
      )
      ORDER BY agrupado.ordem
    ), '[]'::jsonb)
  INTO v_entradas, v_recebimentos, v_receitas_modalidades
  FROM agrupado
  CROSS JOIN total
  GROUP BY total.valor, total.quantidade;

  WITH catalogo(codigo, rotulo, ordem) AS (
    VALUES
      ('ADMINISTRATIVAS'::text, 'Administrativas'::text, 1),
      ('OPERACIONAIS'::text, 'Operacionais'::text, 2),
      ('PESSOAL'::text, 'Pessoal'::text, 3),
      ('FORNECEDORES'::text, 'Fornecedores'::text, 4),
      ('TAXAS_BANCARIAS'::text, 'Tarifas bancárias'::text, 5),
      ('OUTRAS_DESPESAS'::text, 'Outras despesas'::text, 6)
  ),
  debitos AS MATERIALIZED (
    SELECT
      cp.id,
      cp.polo_id,
      cp.conta_bancaria_id,
      cp.status,
      cp.data_pagamento,
      cp.data_vencimento,
      cp.updated_at,
      coalesce(cp.valor_pago, cp.valor, 0) AS valor,
      CASE
        WHEN upper(coalesce(cp.categoria, '')) = 'DESPESA_ADMINISTRATIVA'
          THEN 'ADMINISTRATIVAS'
        WHEN upper(coalesce(cp.categoria, '')) = 'DESPESA_VARIAVEL'
          THEN 'OPERACIONAIS'
        WHEN upper(coalesce(cp.categoria, '')) IN (
          'PESSOAL', 'PROFESSOR', 'FOLHA'
        ) THEN 'PESSOAL'
        WHEN cp.fornecedor_id IS NOT NULL THEN 'FORNECEDORES'
        ELSE 'OUTRAS_DESPESAS'
      END AS categoria_codigo
    FROM public.contas_pagar cp
    WHERE cp.despesa_lancamento_id IS NULL

    UNION ALL

    SELECT
      dl.id,
      dl.polo_id,
      dl.conta_bancaria_id,
      dl.status,
      dl.data_pagamento,
      dl.data_vencimento,
      dl.updated_at,
      coalesce(dl.valor_pago, dl.valor, 0),
      CASE
        WHEN lower(coalesce(categoria.nome, '')) LIKE '%taxa%banc%'
          OR lower(coalesce(categoria.nome, '')) LIKE '%tarifa%banc%'
          THEN 'TAXAS_BANCARIAS'
        WHEN lower(coalesce(categoria.nome, '')) LIKE '%pessoal%'
          OR lower(coalesce(categoria.nome, '')) LIKE '%folha%'
          OR lower(coalesce(categoria.nome, '')) LIKE '%professor%'
          THEN 'PESSOAL'
        WHEN lower(coalesce(categoria.nome, '')) LIKE '%fornecedor%'
          THEN 'FORNECEDORES'
        WHEN upper(dl.tipo) = 'DESPESA_FIXA' THEN 'ADMINISTRATIVAS'
        WHEN upper(dl.tipo) = 'DESPESA_VARIAVEL' THEN 'OPERACIONAIS'
        ELSE 'OUTRAS_DESPESAS'
      END
    FROM public.despesas_lancamentos dl
    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = dl.categoria_financeira_id
  ),
  debitos_mes AS MATERIALIZED (
    SELECT debito.*
    FROM debitos debito
    WHERE debito.status = 'PAGO'
      AND debito.data_pagamento >= v_inicio
      AND debito.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR debito.polo_id = p_polo_id)
  ),
  total AS (
    SELECT
      coalesce(sum(valor), 0) AS valor,
      count(*)::integer AS quantidade,
      coalesce(sum(valor) FILTER (
        WHERE categoria_codigo = 'TAXAS_BANCARIAS'
      ), 0) AS tarifas
    FROM debitos_mes
  ),
  agrupado AS (
    SELECT
      catalogo.codigo,
      catalogo.rotulo,
      catalogo.ordem,
      coalesce(sum(debito.valor), 0) AS valor,
      count(debito.id)::integer AS quantidade
    FROM catalogo
    LEFT JOIN debitos_mes debito
      ON debito.categoria_codigo = catalogo.codigo
    GROUP BY catalogo.codigo, catalogo.rotulo, catalogo.ordem
  )
  SELECT
    total.valor,
    total.quantidade,
    total.tarifas,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'codigo', agrupado.codigo,
        'rotulo', agrupado.rotulo,
        'valor', agrupado.valor,
        'quantidade', agrupado.quantidade,
        'percentual', CASE
          WHEN total.valor = 0 THEN 0
          ELSE round((agrupado.valor / total.valor) * 100, 2)
        END
      )
      ORDER BY agrupado.ordem
    ), '[]'::jsonb)
  INTO
    v_saidas,
    v_pagamentos,
    v_tarifas_confirmadas,
    v_despesas_categorias
  FROM agrupado
  CROSS JOIN total
  GROUP BY total.valor, total.quantidade, total.tarifas;

  SELECT
    coalesce(sum(cr.valor), 0),
    coalesce(sum(cr.valor) FILTER (
      WHERE cr.data_vencimento < CURRENT_DATE
    ), 0)
  INTO v_a_receber, v_receber_vencido
  FROM public.contas_receber cr
  WHERE cr.status IN ('PENDENTE', 'VENCIDO')
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

  WITH abertos AS (
    SELECT cp.valor, cp.data_vencimento
    FROM public.contas_pagar cp
    WHERE cp.status IN ('PENDENTE', 'VENCIDO')
      AND cp.despesa_lancamento_id IS NULL
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    SELECT dl.valor, dl.data_vencimento
    FROM public.despesas_lancamentos dl
    WHERE dl.status IN ('PENDENTE', 'VENCIDO')
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  )
  SELECT
    coalesce(sum(valor), 0),
    coalesce(sum(valor) FILTER (
      WHERE data_vencimento < CURRENT_DATE
    ), 0)
  INTO v_a_pagar, v_pagar_vencido
  FROM abertos;

  WITH meses AS (
    SELECT
      indice,
      (
        v_historico_inicio
        + (indice * interval '1 month')
      )::date AS inicio
    FROM generate_series(0, p_meses_historico - 1) indice
  ),
  receitas AS (
    SELECT
      date_trunc('month', cr.data_pagamento)::date AS inicio,
      sum(coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      )) AS valor
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento >= v_historico_inicio
      AND cr.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    GROUP BY date_trunc('month', cr.data_pagamento)::date
  ),
  despesas AS (
    SELECT fonte.inicio, sum(fonte.valor) AS valor
    FROM (
      SELECT
        date_trunc('month', cp.data_pagamento)::date AS inicio,
        sum(coalesce(cp.valor_pago, cp.valor, 0)) AS valor
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND cp.despesa_lancamento_id IS NULL
        AND cp.data_pagamento >= v_historico_inicio
        AND cp.data_pagamento < v_fim
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
      GROUP BY date_trunc('month', cp.data_pagamento)::date

      UNION ALL

      SELECT
        date_trunc('month', dl.data_pagamento)::date,
        sum(coalesce(dl.valor_pago, dl.valor, 0))
      FROM public.despesas_lancamentos dl
      WHERE dl.status = 'PAGO'
        AND dl.data_pagamento >= v_historico_inicio
        AND dl.data_pagamento < v_fim
        AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
      GROUP BY date_trunc('month', dl.data_pagamento)::date
    ) fonte
    GROUP BY fonte.inicio
  ),
  base AS (
    SELECT
      mes.indice,
      mes.inicio,
      coalesce(receita.valor, 0) AS entradas,
      coalesce(despesa.valor, 0) AS saidas
    FROM meses mes
    LEFT JOIN receitas receita ON receita.inicio = mes.inicio
    LEFT JOIN despesas despesa ON despesa.inicio = mes.inicio
  ),
  escala AS (
    SELECT greatest(
      coalesce(max(entradas), 0),
      coalesce(max(saidas), 0)
    ) AS maximo
    FROM base
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'competencia', to_char(base.inicio, 'YYYY-MM-DD'),
      'rotulo', (
        CASE extract(month FROM base.inicio)::integer
          WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev'
          WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
          WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun'
          WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
          WHEN 9 THEN 'Set' WHEN 10 THEN 'Out'
          WHEN 11 THEN 'Nov' ELSE 'Dez'
        END
      ) || '/' || to_char(base.inicio, 'YYYY'),
      'entradas', base.entradas,
      'saidas', base.saidas,
      'resultado', base.entradas - base.saidas,
      'resultado_status', CASE
        WHEN base.entradas - base.saidas > 0 THEN 'POSITIVO'
        WHEN base.entradas - base.saidas < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'entradas_escala_percentual', CASE
        WHEN escala.maximo = 0 THEN 0
        ELSE round((base.entradas / escala.maximo) * 100, 2)
      END,
      'saidas_escala_percentual', CASE
        WHEN escala.maximo = 0 THEN 0
        ELSE round((base.saidas / escala.maximo) * 100, 2)
      END
    )
    ORDER BY base.indice
  ), '[]'::jsonb)
  INTO v_serie_mensal
  FROM base
  CROSS JOIN escala;

  WITH classificados AS (
    SELECT
      cr.id,
      cr.polo_id,
      cr.conta_bancaria_id,
      cr.data_pagamento,
      cr.updated_at,
      cr.gateway_settlement_recorded_at,
      coalesce(
        CASE
          WHEN cr.manual_settlement_id IS NOT NULL
               AND cr.manual_settlement_reversed_at IS NULL
            THEN cr.manual_settlement_received_cents::numeric / 100.0
          ELSE NULL
        END,
        cr.valor_pago,
        cr.valor,
        0
      ) AS valor_recebido,
      curso.modalidade
    FROM public.contas_receber cr
    LEFT JOIN public.matriculas matricula ON matricula.id = cr.matricula_id
    LEFT JOIN public.turmas turma
      ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento >= v_inicio
      AND cr.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
  )
  SELECT
    count(*) FILTER (WHERE polo_id IS NULL)::integer,
    coalesce(sum(valor_recebido) FILTER (WHERE polo_id IS NULL), 0),
    count(*) FILTER (WHERE conta_bancaria_id IS NULL)::integer,
    count(*) FILTER (WHERE data_pagamento IS NULL)::integer,
    count(*) FILTER (WHERE modalidade IS NULL)::integer,
    max(coalesce(gateway_settlement_recorded_at, updated_at))
  INTO
    v_sem_polo_quantidade,
    v_sem_polo_valor,
    v_sem_conta_quantidade,
    v_sem_data_quantidade,
    v_sem_modalidade_quantidade,
    v_ultima_atualizacao
  FROM classificados;

  SELECT greatest(
    coalesce(v_ultima_atualizacao, '-infinity'::timestamptz),
    coalesce((
      SELECT max(cp.updated_at)
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND cp.despesa_lancamento_id IS NULL
        AND cp.data_pagamento >= v_inicio
        AND cp.data_pagamento < v_fim
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    ), '-infinity'::timestamptz),
    coalesce((
      SELECT max(dl.updated_at)
      FROM public.despesas_lancamentos dl
      WHERE dl.status = 'PAGO'
        AND dl.data_pagamento >= v_inicio
        AND dl.data_pagamento < v_fim
        AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
    ), '-infinity'::timestamptz)
  )
  INTO v_ultima_atualizacao;

  IF v_ultima_atualizacao = '-infinity'::timestamptz THEN
    v_ultima_atualizacao := NULL;
  END IF;

  RETURN jsonb_build_object(
    'versao', 2,
    'meta', jsonb_build_object(
      'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
      'periodo_inicio', to_char(v_inicio, 'YYYY-MM-DD'),
      'periodo_fim_exclusivo', to_char(v_fim, 'YYYY-MM-DD'),
      'gerado_em', now(),
      'escopo_tipo', CASE
        WHEN p_polo_id IS NULL THEN 'GLOBAL'
        ELSE 'POLO'
      END,
      'polo_id', p_polo_id,
      'escopo_rotulo', v_scope_label,
      'fonte_saldo', 'CONTABIL_SISTEMA',
      'extrato_bancario_disponivel', false
    ),
    'saldos_hoje', jsonb_build_object(
      'registrado_total', v_saldo_total,
      'bancario_registrado', v_saldo_bancario,
      'caixa_local', v_caixa_local,
      'compartilhado_total', v_compartilhado_total,
      'posicao_compartilhada_escopo', v_posicao_compartilhada,
      'nao_atribuido', v_saldo_nao_atribuido
    ),
    'resumo_competencia', jsonb_build_object(
      'entradas_recebidas_brutas', v_entradas,
      'tarifas_bancarias_confirmadas', v_tarifas_confirmadas,
      'saidas_pagas', v_saidas,
      'resultado', v_entradas - v_saidas,
      'resultado_status', CASE
        WHEN v_entradas - v_saidas > 0 THEN 'POSITIVO'
        WHEN v_entradas - v_saidas < 0 THEN 'NEGATIVO'
        ELSE 'NEUTRO'
      END,
      'quantidade_recebimentos', v_recebimentos,
      'quantidade_pagamentos', v_pagamentos
    ),
    'compromissos', jsonb_build_object(
      'a_receber', v_a_receber,
      'receber_vencido', v_receber_vencido,
      'a_pagar', v_a_pagar,
      'pagar_vencido', v_pagar_vencido
    ),
    'receitas_por_modalidade', v_receitas_modalidades,
    'despesas_por_categoria', v_despesas_categorias,
    'serie_mensal', v_serie_mensal,
    'contas', v_contas,
    'classificacao', jsonb_build_object(
      'quantidade_sem_polo', v_sem_polo_quantidade,
      'valor_sem_polo', v_sem_polo_valor
    ),
    'conciliacao', jsonb_build_object(
      'recebimentos_conciliados', v_recebimentos,
      'pagamentos_conciliados', v_pagamentos,
      'pendentes', v_sem_polo_quantidade + v_sem_conta_quantidade,
      'ultima_atualizacao', v_ultima_atualizacao
    ),
    'qualidade_dados', jsonb_build_object(
      'movimentos_sem_polo', v_sem_polo_quantidade,
      'pagamentos_sem_conta', v_sem_conta_quantidade,
      'pagamentos_sem_data', v_sem_data_quantidade,
      'receitas_sem_modalidade', v_sem_modalidade_quantidade,
      'tarifas_estimadas_ignoradas', 0
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) TO service_role;

COMMENT ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) IS
  'Prestação mensal canônica do Caixa; entrega totais, percentuais e escalas prontos para renderização.';
