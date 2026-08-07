-- Endurece a prestação mensal detalhada do Caixa após a segunda revisão.
-- Mantém todos os cálculos financeiros no backend e limita a geração síncrona
-- a um volume que o navegador consegue transformar em PDF com segurança.

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
SET search_path = public
AS $$
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
  ORDER BY cr.data_pagamento, movimento_polo.nome, pagador.nome, cr.id;
$$;

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_statement jsonb;
  v_recebimentos jsonb;
  v_despesas jsonb;
  v_totais_recebimentos jsonb;
  v_totais_despesas jsonb;
  v_quantidade_recebimentos integer;
  v_quantidade_despesas integer;
  v_total_recebido numeric;
  v_total_pago numeric;
  v_polo public.polos%rowtype;
  v_logo_url text;
  v_landscape jsonb := '{}'::jsonb;
  v_limite_por_tabela constant integer := 300;
  v_limite_total constant integer := 300;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(ARRAY['caixa'], p_polo_id)
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao relatório detalhado do Caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_statement := public.get_caixa_prestacao_mensal_secure(
    p_polo_id,
    v_inicio,
    6
  );

  SELECT count(*)::integer
  INTO v_quantidade_recebimentos
  FROM public.get_caixa_relatorio_recebimentos_core(p_polo_id, v_inicio, v_fim);

  SELECT count(*)::integer
  INTO v_quantidade_despesas
  FROM public.get_caixa_relatorio_despesas_core(p_polo_id, v_inicio, v_fim);

  IF v_quantidade_recebimentos > v_limite_por_tabela
     OR v_quantidade_despesas > v_limite_por_tabela
     OR v_quantidade_recebimentos + v_quantidade_despesas > v_limite_total
  THEN
    RAISE EXCEPTION
      'O período possui % movimentos (% recebimentos e % despesas). O PDF síncrono aceita até % movimentos; selecione um polo ou período com menor volume.',
      v_quantidade_recebimentos + v_quantidade_despesas,
      v_quantidade_recebimentos,
      v_quantidade_despesas,
      v_limite_total
      USING ERRCODE = '54000';
  END IF;

  SELECT
    coalesce(
      jsonb_agg(
        to_jsonb(recebimento)
        || jsonb_build_object(
          'tipo_lancamento',
          coalesce(nullif(trim(origem.tipo_lancamento), ''), 'OUTRO')
        )
        ORDER BY recebimento.data_pagamento, recebimento.pagador, recebimento.id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(recebimento.valor_recebido), 0),
    jsonb_build_object(
      'valor_base', coalesce(sum(recebimento.valor_base), 0),
      'juros_identificados', coalesce(sum(recebimento.juros), 0),
      'multa_identificada', coalesce(sum(recebimento.multa), 0),
      'acrescimo_identificado', coalesce(sum(recebimento.acrescimo), 0),
      'desconto_identificado', coalesce(sum(recebimento.desconto), 0),
      'diferenca_nao_discriminada', coalesce(sum(recebimento.diferenca_nao_discriminada), 0),
      'valor_final', coalesce(sum(recebimento.valor_recebido), 0),
      'quantidade', count(*),
      'quantidade_nao_discriminada', count(*) FILTER (
        WHERE recebimento.composicao_status = 'NAO_DISCRIMINADA_PELO_GATEWAY'
      )
    )
  INTO v_recebimentos, v_total_recebido, v_totais_recebimentos
  FROM public.get_caixa_relatorio_recebimentos_core(
    p_polo_id,
    v_inicio,
    v_fim
  ) recebimento
  LEFT JOIN public.contas_receber origem
    ON origem.id = recebimento.id;

  SELECT
    coalesce(
      jsonb_agg(
        to_jsonb(despesa)
        ORDER BY despesa.data_pagamento, despesa.fornecedor, despesa.id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(despesa.valor_pago), 0),
    jsonb_build_object(
      'valor_base', coalesce(sum(despesa.valor_base), 0),
      'juros_identificados', coalesce(sum(despesa.juros), 0),
      'multa_identificada', coalesce(sum(despesa.multa), 0),
      'acrescimo_identificado', coalesce(sum(despesa.acrescimo), 0),
      'desconto_identificado', coalesce(sum(despesa.desconto), 0),
      'diferenca_nao_discriminada', coalesce(sum(despesa.diferenca_nao_discriminada), 0),
      'valor_final', coalesce(sum(despesa.valor_pago), 0),
      'quantidade', count(*),
      'quantidade_nao_discriminada', count(*) FILTER (
        WHERE despesa.composicao_status = 'NAO_DISCRIMINADA'
      )
    )
  INTO v_despesas, v_total_pago, v_totais_despesas
  FROM public.get_caixa_relatorio_despesas_core(p_polo_id, v_inicio, v_fim) despesa;

  IF abs(
    v_total_recebido
    - coalesce((v_statement #>> '{resumo_competencia,entradas_recebidas_brutas}')::numeric, 0)
  ) > 0.005
  OR abs(
    v_total_pago
    - coalesce((v_statement #>> '{resumo_competencia,saidas_pagas}')::numeric, 0)
  ) > 0.005
  OR v_quantidade_recebimentos
    <> coalesce((v_statement #>> '{resumo_competencia,quantidade_recebimentos}')::integer, 0)
  OR v_quantidade_despesas
    <> coalesce((v_statement #>> '{resumo_competencia,quantidade_pagamentos}')::integer, 0)
  THEN
    RAISE EXCEPTION 'Os detalhes não conferem com o resumo canônico do Caixa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_polo_id IS NULL THEN
    SELECT *
    INTO v_polo
    FROM public.polos
    ORDER BY is_matriz DESC, created_at, id
    LIMIT 1;
  ELSE
    SELECT *
    INTO v_polo
    FROM public.polos
    WHERE id = p_polo_id;
  END IF;

  SELECT coalesce(
    nullif(trim(v_polo.logo_url), ''),
    (
      SELECT nullif(trim(matriz.logo_url), '')
      FROM public.polos matriz
      WHERE matriz.is_matriz
      ORDER BY matriz.created_at, matriz.id
      LIMIT 1
    )
  )
  INTO v_logo_url;

  SELECT template.conteudo
  INTO v_landscape
  FROM public.documentos_templates template
  WHERE template.id = concat('watermark_landscape_', v_polo.id)
     OR template.id IN (
       SELECT concat('watermark_landscape_', matriz.id)
       FROM public.polos matriz
       WHERE matriz.is_matriz
     )
  ORDER BY (template.id = concat('watermark_landscape_', v_polo.id)) DESC
  LIMIT 1;

  v_landscape := coalesce(v_landscape, '{}'::jsonb);

  RETURN jsonb_build_object(
    'versao', 1,
    'gerado_em', now(),
    'completo', true,
    'confidencial', true,
    'limite_por_tabela', v_limite_por_tabela,
    'limite_total', v_limite_total,
    'institucional', jsonb_build_object(
      'id', v_polo.id,
      'nome', v_polo.nome,
      'cnpj', v_polo.cnpj,
      'cidade', v_polo.cidade,
      'estado', v_polo.estado,
      'endereco', v_polo.endereco,
      'numero', v_polo.numero,
      'bairro', v_polo.bairro,
      'cep', v_polo.cep,
      'telefone', v_polo.telefone,
      'email', v_polo.email,
      'logo_url', v_logo_url,
      'is_matriz', v_polo.is_matriz,
      'watermark_url', v_polo.watermark_url,
      'watermark_opacity', coalesce(v_polo.watermark_opacity, 0.1),
      'watermark_scale', coalesce(v_polo.watermark_scale, 50),
      'watermark_rotate', coalesce(v_polo.watermark_rotate, true),
      'landscape_watermark_url', coalesce(
        nullif(v_landscape ->> 'url', ''),
        v_polo.watermark_url
      ),
      'landscape_watermark_opacity', coalesce(
        (v_landscape ->> 'opacity')::numeric,
        v_polo.watermark_opacity,
        0.1
      ),
      'landscape_watermark_scale', coalesce(
        (v_landscape ->> 'scale')::numeric,
        v_polo.watermark_scale,
        50
      ),
      'landscape_watermark_rotate', coalesce(
        (v_landscape ->> 'rotate')::boolean,
        v_polo.watermark_rotate,
        true
      )
    ),
    'resumo', v_statement,
    'totais_recebimentos', v_totais_recebimentos,
    'totais_despesas', v_totais_despesas,
    'recebimentos', v_recebimentos,
    'despesas', v_despesas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) IS
  'Prestação mensal detalhada do Caixa, autoconsistente, limitada a 300 movimentos e com identidade visual paisagem.';
