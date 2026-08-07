-- Corrige a ordem de autorização das RPCs SECURITY DEFINER e torna os replays
-- idempotentes por payload completo, sem permitir leitura por request_id fora do escopo.

ALTER TABLE public.emprestimos_financeiros
  ADD COLUMN IF NOT EXISTS rateio_modo text,
  ADD COLUMN IF NOT EXISTS rateio_polo_ids uuid[];

WITH rateios AS (
  SELECT
    emprestimo.id,
    array_agg(DISTINCT rateio.polo_id ORDER BY rateio.polo_id) AS polos_rateados
  FROM public.emprestimos_financeiros emprestimo
  JOIN public.emprestimo_parcelas parcela
    ON parcela.emprestimo_id = emprestimo.id
  JOIN public.emprestimo_parcela_rateios rateio
    ON rateio.emprestimo_parcela_id = parcela.id
  GROUP BY emprestimo.id
), polos_ativos AS (
  SELECT
    emprestimo.id,
    array_agg(polo.id ORDER BY polo.id) AS todos_os_polos_ativos
  FROM public.emprestimos_financeiros emprestimo
  JOIN public.polos polo
    ON polo.company_id = emprestimo.company_id
   AND lower(coalesce(polo.status, 'ativo')) = 'ativo'
  GROUP BY emprestimo.id
)
UPDATE public.emprestimos_financeiros emprestimo
SET
  rateio_modo = coalesce(
    emprestimo.rateio_modo,
    CASE
      WHEN rateios.polos_rateados = polos_ativos.todos_os_polos_ativos THEN 'TODOS'
      ELSE 'SELECIONADOS'
    END
  ),
  rateio_polo_ids = coalesce(emprestimo.rateio_polo_ids, rateios.polos_rateados)
FROM rateios
JOIN polos_ativos USING (id)
WHERE emprestimo.id = rateios.id;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.emprestimos_financeiros
    WHERE rateio_modo IS NULL
       OR rateio_polo_ids IS NULL
       OR cardinality(rateio_polo_ids) < 1
  ) THEN
    RAISE EXCEPTION 'Empréstimos existentes precisam de rateio auditável antes do endurecimento.';
  END IF;

  ALTER TABLE public.emprestimos_financeiros
    ALTER COLUMN rateio_modo SET NOT NULL,
    ALTER COLUMN rateio_polo_ids SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'emprestimos_rateio_auditavel_chk'
      AND conrelid = 'public.emprestimos_financeiros'::regclass
  ) THEN
    ALTER TABLE public.emprestimos_financeiros
      ADD CONSTRAINT emprestimos_rateio_auditavel_chk
      CHECK (
        rateio_modo IN ('TODOS', 'SELECIONADOS')
        AND cardinality(rateio_polo_ids) > 0
      );
  END IF;
END;
$do$;

CREATE OR REPLACE FUNCTION public.criar_patrimonio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_data_aquisicao date,
  p_tipo_produto text,
  p_descricao text,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_numero_serie text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.patrimonios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_existing
  FROM public.patrimonios
  WHERE request_id = p_request_id
    AND polo_id = p_polo_id;

  IF FOUND THEN
    IF v_existing.data_aquisicao IS DISTINCT FROM p_data_aquisicao
       OR v_existing.tipo_produto IS DISTINCT FROM upper(btrim(p_tipo_produto))
       OR v_existing.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_existing.quantidade IS DISTINCT FROM p_quantidade
       OR v_existing.valor_unitario IS DISTINCT FROM round(p_valor_unitario, 2)
       OR v_existing.numero_serie IS DISTINCT FROM nullif(btrim(coalesce(p_numero_serie, '')), '')
       OR v_existing.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '') THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.polos
  WHERE id = p_polo_id
    AND lower(coalesce(status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;
  IF p_data_aquisicao IS NULL
     OR nullif(btrim(coalesce(p_tipo_produto, '')), '') IS NULL
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR coalesce(p_quantidade, 0) < 1
     OR p_valor_unitario IS NULL
     OR p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Informe data, tipo, descrição, quantidade e valor unitário válidos.';
  END IF;

  BEGIN
    INSERT INTO public.patrimonios (
      company_id, polo_id, data_aquisicao, tipo_produto, descricao,
      quantidade, valor_unitario, numero_serie, observacao, request_id, created_by
    ) VALUES (
      v_company_id, p_polo_id, p_data_aquisicao, upper(btrim(p_tipo_produto)), btrim(p_descricao),
      p_quantidade, round(p_valor_unitario, 2),
      nullif(btrim(coalesce(p_numero_serie, '')), ''),
      nullif(btrim(coalesce(p_observacao, '')), ''),
      p_request_id, auth.uid()
    )
    RETURNING * INTO v_result;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada.';
  END;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_patrimonios_secure(
  p_polo_id uuid,
  p_search text DEFAULT NULL,
  p_tipo_produto text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))), '');
  v_tipo text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_tipo_produto, ''))), '');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.' USING ERRCODE = '42501';
  END IF;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        v_tipo IS NULL
        OR public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          coalesce(patrimonio.tipo_produto, '') || ' ' || coalesce(patrimonio.descricao, '') || ' '
          || coalesce(patrimonio.numero_serie, '') || ' ' || coalesce(patrimonio.observacao, '')
        ) LIKE '%' || v_search || '%'
      )
  )
  SELECT count(*) INTO v_total FROM filtrados;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        v_tipo IS NULL
        OR public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          coalesce(patrimonio.tipo_produto, '') || ' ' || coalesce(patrimonio.descricao, '') || ' '
          || coalesce(patrimonio.numero_serie, '') || ' ' || coalesce(patrimonio.observacao, '')
        ) LIKE '%' || v_search || '%'
      )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'company_id', item.company_id,
    'polo_id', item.polo_id,
    'polo_nome', item.polo_nome,
    'data_aquisicao', item.data_aquisicao,
    'tipo_produto', item.tipo_produto,
    'descricao', item.descricao,
    'quantidade', item.quantidade,
    'valor_unitario', item.valor_unitario,
    'valor_total', item.valor_total,
    'numero_serie', item.numero_serie,
    'observacao', item.observacao,
    'created_at', item.created_at
  ) ORDER BY item.data_aquisicao DESC, item.id DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM filtrados
    ORDER BY data_aquisicao DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  ) item;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_despesa_com_desdobramento_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor_total numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_juros_total numeric DEFAULT 0,
  p_multa_total numeric DEFAULT 0,
  p_desconto_total numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_total_parcelas integer DEFAULT 1,
  p_intervalo_quantidade integer DEFAULT 1,
  p_intervalo_unidade text DEFAULT 'MESES',
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_tamanho bigint DEFAULT NULL
)
RETURNS SETOF public.despesas_lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer := greatest(1, coalesce(p_total_parcelas, 1));
  v_intervalo integer := greatest(1, coalesce(p_intervalo_quantidade, 1));
  v_unidade text := upper(btrim(coalesce(p_intervalo_unidade, 'MESES')));
  v_parcela integer;
  v_vencimento date;
  v_grupo uuid;
  v_valor numeric;
  v_juros numeric;
  v_multa numeric;
  v_desconto numeric;
  v_existing_count integer;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND CASE
         WHEN p_tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para lançar contas a pagar neste polo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  IF p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR p_valor_total IS NULL OR p_valor_total <= 0
     OR p_data_vencimento IS NULL
     OR v_total > 60
     OR v_unidade NOT IN ('DIAS', 'SEMANAS', 'MESES') THEN
    RAISE EXCEPTION 'Dados inválidos para desdobrar a conta a pagar.';
  END IF;
  IF round(p_valor_total * 100)::bigint < v_total THEN
    RAISE EXCEPTION 'O valor total não comporta todas as parcelas com ao menos um centavo.';
  END IF;
  IF coalesce(p_juros_total, 0) < 0 OR coalesce(p_multa_total, 0) < 0
     OR coalesce(p_desconto_total, 0) < 0
     OR p_desconto_total > p_valor_total + coalesce(p_juros_total, 0) + coalesce(p_multa_total, 0) THEN
    RAISE EXCEPTION 'Ajustes inválidos para a conta a pagar.';
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
    AND polo_id = p_polo_id;

  IF v_existing_count > 0 THEN
    IF v_existing_count <> v_total
       OR EXISTS (
         SELECT 1
         FROM generate_series(1, v_total) AS esperado(parcela_numero)
         LEFT JOIN public.despesas_lancamentos existente
           ON existente.request_id = p_request_id
          AND existente.polo_id = p_polo_id
          AND existente.parcela_numero = esperado.parcela_numero
         WHERE existente.id IS NULL
            OR existente.tipo IS DISTINCT FROM p_tipo
            OR existente.descricao IS DISTINCT FROM CASE
              WHEN v_total > 1 THEN btrim(p_descricao) || ' (' || esperado.parcela_numero || '/' || v_total || ')'
              ELSE btrim(p_descricao)
            END
            OR existente.valor_base IS DISTINCT FROM public.financeiro_dividir_centavos(
              p_valor_total, v_total, esperado.parcela_numero
            )
            OR existente.valor IS DISTINCT FROM public.financeiro_dividir_centavos(
              p_valor_total, v_total, esperado.parcela_numero
            )
            OR existente.juros_valor IS DISTINCT FROM public.financeiro_dividir_centavos(
              coalesce(p_juros_total, 0), v_total, esperado.parcela_numero
            )
            OR existente.multa_valor IS DISTINCT FROM public.financeiro_dividir_centavos(
              coalesce(p_multa_total, 0), v_total, esperado.parcela_numero
            )
            OR existente.desconto_valor IS DISTINCT FROM public.financeiro_dividir_centavos(
              coalesce(p_desconto_total, 0), v_total, esperado.parcela_numero
            )
            OR existente.data_lancamento IS DISTINCT FROM coalesce(p_data_lancamento, CURRENT_DATE)
            OR existente.data_vencimento IS DISTINCT FROM CASE v_unidade
              WHEN 'DIAS' THEN p_data_vencimento + ((esperado.parcela_numero - 1) * v_intervalo)
              WHEN 'SEMANAS' THEN p_data_vencimento + ((esperado.parcela_numero - 1) * v_intervalo * 7)
              ELSE (
                p_data_vencimento::timestamp
                + make_interval(months => (esperado.parcela_numero - 1) * v_intervalo)
              )::date
            END
            OR existente.categoria_financeira_id IS DISTINCT FROM p_categoria_financeira_id
            OR existente.fornecedor_id IS DISTINCT FROM p_fornecedor_id
            OR existente.total_parcelas IS DISTINCT FROM v_total
            OR existente.grupo_parcelas_id IS DISTINCT FROM CASE
              WHEN v_total > 1 THEN p_request_id ELSE NULL
            END
            OR existente.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '')
            OR existente.turma_id IS DISTINCT FROM p_turma_id
            OR existente.anexo_bucket IS DISTINCT FROM p_anexo_bucket
            OR existente.anexo_path IS DISTINCT FROM p_anexo_path
            OR existente.anexo_nome IS DISTINCT FROM p_anexo_nome
            OR existente.anexo_mime IS DISTINCT FROM p_anexo_mime
            OR existente.anexo_tamanho IS DISTINCT FROM p_anexo_tamanho
       ) THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
      AND polo_id = p_polo_id
    ORDER BY parcela_numero;
    RETURN;
  END IF;

  v_grupo := CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END;
  BEGIN
    FOR v_parcela IN 1..v_total LOOP
      v_vencimento := CASE v_unidade
        WHEN 'DIAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo)
        WHEN 'SEMANAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo * 7)
        ELSE (p_data_vencimento::timestamp + make_interval(months => (v_parcela - 1) * v_intervalo))::date
      END;
      v_valor := public.financeiro_dividir_centavos(p_valor_total, v_total, v_parcela);
      v_juros := public.financeiro_dividir_centavos(coalesce(p_juros_total, 0), v_total, v_parcela);
      v_multa := public.financeiro_dividir_centavos(coalesce(p_multa_total, 0), v_total, v_parcela);
      v_desconto := public.financeiro_dividir_centavos(coalesce(p_desconto_total, 0), v_total, v_parcela);

      INSERT INTO public.despesas_lancamentos (
        polo_id, tipo, descricao, valor_base, valor, juros_valor, multa_valor, desconto_valor,
        data_lancamento, data_vencimento, status, categoria_financeira_id, fornecedor_id,
        parcela_numero, total_parcelas, grupo_parcelas_id, observacao, turma_id,
        anexo_bucket, anexo_path, anexo_nome, anexo_mime, anexo_tamanho, request_id
      ) VALUES (
        p_polo_id, p_tipo,
        CASE WHEN v_total > 1 THEN btrim(p_descricao) || ' (' || v_parcela || '/' || v_total || ')' ELSE btrim(p_descricao) END,
        v_valor, v_valor, v_juros, v_multa, v_desconto,
        coalesce(p_data_lancamento, CURRENT_DATE), v_vencimento, 'PENDENTE',
        p_categoria_financeira_id, p_fornecedor_id,
        v_parcela, v_total, v_grupo, nullif(btrim(coalesce(p_observacao, '')), ''), p_turma_id,
        p_anexo_bucket, p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho, p_request_id
      );
    END LOOP;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada.';
  END;

  RETURN QUERY
  SELECT *
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
    AND polo_id = p_polo_id
  ORDER BY parcela_numero;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_emprestimo_financeiro_secure(
  p_request_id uuid,
  p_polo_matriz_id uuid,
  p_credor_nome text,
  p_descricao text,
  p_valor_liberado numeric,
  p_valor_total_divida numeric,
  p_data_liberacao date,
  p_data_primeiro_vencimento date,
  p_total_parcelas integer,
  p_intervalo_meses integer,
  p_conta_credito_id uuid,
  p_forma_credito text,
  p_rateio_modo text,
  p_polo_ids uuid[] DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_emprestimo public.emprestimos_financeiros%rowtype;
  v_conta_receber_id uuid;
  v_parcela_id uuid;
  v_parcela integer;
  v_polo_indice integer;
  v_polo_total integer;
  v_polo_id uuid;
  v_principal_parcela numeric;
  v_encargos_parcela numeric;
  v_rateio_principal numeric;
  v_rateio_encargos numeric;
  v_rateio_modo text := upper(btrim(coalesce(p_rateio_modo, '')));
  v_polos uuid[];
  v_polos_solicitados uuid[];
  v_polos_rateio_canonicos uuid[];
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_global()
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode registrar empréstimos.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  v_polos_solicitados := ARRAY(
    SELECT DISTINCT polo_id
    FROM unnest(coalesce(p_polo_ids, ARRAY[]::uuid[])) AS polos_solicitados(polo_id)
    ORDER BY polo_id
  );

  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE request_id = p_request_id;

  IF FOUND THEN
    IF v_emprestimo.polo_matriz_id IS DISTINCT FROM p_polo_matriz_id
       OR v_emprestimo.credor_nome IS DISTINCT FROM btrim(p_credor_nome)
       OR v_emprestimo.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_emprestimo.valor_liberado IS DISTINCT FROM round(p_valor_liberado, 2)
       OR v_emprestimo.valor_total_divida IS DISTINCT FROM round(p_valor_total_divida, 2)
       OR v_emprestimo.data_liberacao IS DISTINCT FROM p_data_liberacao
       OR v_emprestimo.data_primeiro_vencimento IS DISTINCT FROM p_data_primeiro_vencimento
       OR v_emprestimo.total_parcelas IS DISTINCT FROM p_total_parcelas
       OR v_emprestimo.intervalo_meses IS DISTINCT FROM p_intervalo_meses
       OR v_emprestimo.conta_credito_id IS DISTINCT FROM p_conta_credito_id
       OR v_emprestimo.forma_credito IS DISTINCT FROM upper(btrim(p_forma_credito))
       OR v_emprestimo.rateio_modo IS DISTINCT FROM v_rateio_modo
       OR v_emprestimo.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '')
       OR (
         v_rateio_modo = 'SELECIONADOS'
         AND v_emprestimo.rateio_polo_ids IS DISTINCT FROM v_polos_solicitados
       )
       OR (
         v_rateio_modo = 'TODOS'
         AND cardinality(v_polos_solicitados) <> 0
       ) THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
  ELSE
    IF nullif(btrim(coalesce(p_credor_nome, '')), '') IS NULL
       OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
       OR p_valor_liberado IS NULL OR p_valor_liberado <= 0
       OR p_valor_total_divida IS NULL OR p_valor_total_divida < p_valor_liberado
       OR p_data_liberacao IS NULL OR p_data_primeiro_vencimento IS NULL
       OR p_data_primeiro_vencimento < p_data_liberacao
       OR coalesce(p_total_parcelas, 0) NOT BETWEEN 1 AND 120
       OR coalesce(p_intervalo_meses, 1) NOT BETWEEN 1 AND 24
       OR upper(btrim(coalesce(p_forma_credito, ''))) NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO')
       OR v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS') THEN
      RAISE EXCEPTION 'Dados inválidos para o empréstimo.';
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.polos
    WHERE id = p_polo_matriz_id
      AND is_matriz = true
      AND lower(coalesce(status, 'ativo')) = 'ativo';
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um polo Matriz ativo para registrar o empréstimo.';
    END IF;
    IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_credito_id, p_polo_matriz_id) THEN
      RAISE EXCEPTION 'A conta de crédito não está disponível na Matriz selecionada.';
    END IF;

    IF v_rateio_modo = 'TODOS' THEN
      SELECT coalesce(array_agg(id ORDER BY created_at, id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos
      WHERE company_id = v_company_id
        AND lower(coalesce(status, 'ativo')) = 'ativo';
    ELSE
      SELECT coalesce(array_agg(polo.id ORDER BY polo.created_at, polo.id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos polo
      WHERE polo.id = ANY(v_polos_solicitados)
        AND polo.company_id = v_company_id
        AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
      IF cardinality(v_polos) <> cardinality(v_polos_solicitados) THEN
        RAISE EXCEPTION 'Os polos do rateio devem estar ativos e pertencer à mesma empresa da Matriz.';
      END IF;
    END IF;

    v_polo_total := cardinality(v_polos);
    IF v_polo_total < 1 THEN
      RAISE EXCEPTION 'Selecione ao menos um polo para o rateio.';
    END IF;
    v_polos_rateio_canonicos := ARRAY(
      SELECT polo_id
      FROM unnest(v_polos) AS polos_rateados(polo_id)
      ORDER BY polo_id
    );

    INSERT INTO public.contas_receber (
      polo_id, descricao, valor, data_vencimento, data_pagamento, valor_pago,
      status, forma_pagamento, conta_bancaria_id, categoria
    ) VALUES (
      p_polo_matriz_id, 'Crédito de empréstimo: ' || btrim(p_descricao), round(p_valor_liberado, 2),
      p_data_liberacao, p_data_liberacao, round(p_valor_liberado, 2),
      'PAGO', upper(btrim(p_forma_credito)), p_conta_credito_id, 'OUTROS_CREDITOS'
    )
    RETURNING id INTO v_conta_receber_id;

    INSERT INTO public.emprestimos_financeiros (
      company_id, polo_matriz_id, request_id, credor_nome, descricao,
      valor_liberado, valor_total_divida, data_liberacao, data_primeiro_vencimento,
      total_parcelas, intervalo_meses, conta_credito_id, forma_credito,
      rateio_modo, rateio_polo_ids, conta_receber_id, observacao, created_by
    ) VALUES (
      v_company_id, p_polo_matriz_id, p_request_id, btrim(p_credor_nome), btrim(p_descricao),
      round(p_valor_liberado, 2), round(p_valor_total_divida, 2), p_data_liberacao, p_data_primeiro_vencimento,
      p_total_parcelas, p_intervalo_meses, p_conta_credito_id, upper(btrim(p_forma_credito)),
      v_rateio_modo, v_polos_rateio_canonicos, v_conta_receber_id,
      nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
    )
    RETURNING * INTO v_emprestimo;

    FOR v_parcela IN 1..p_total_parcelas LOOP
      v_principal_parcela := public.financeiro_dividir_centavos(p_valor_liberado, p_total_parcelas, v_parcela);
      v_encargos_parcela := public.financeiro_dividir_centavos(p_valor_total_divida - p_valor_liberado, p_total_parcelas, v_parcela);

      INSERT INTO public.emprestimo_parcelas (
        emprestimo_id, numero, data_vencimento, valor_principal, valor_encargos
      ) VALUES (
        v_emprestimo.id,
        v_parcela,
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        v_principal_parcela,
        v_encargos_parcela
      ) RETURNING id INTO v_parcela_id;

      INSERT INTO public.contas_pagar (
        polo_id, descricao, valor, data_vencimento, status, categoria, emprestimo_parcela_id
      ) VALUES (
        p_polo_matriz_id,
        'Empréstimo: ' || btrim(p_descricao) || ' (' || v_parcela || '/' || p_total_parcelas || ')',
        round(v_principal_parcela + v_encargos_parcela, 2),
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        'PENDENTE', 'EMPRESTIMO', v_parcela_id
      );

      FOR v_polo_indice IN 1..v_polo_total LOOP
        v_polo_id := v_polos[v_polo_indice];
        v_rateio_principal := public.financeiro_dividir_centavos(v_principal_parcela, v_polo_total, v_polo_indice);
        v_rateio_encargos := public.financeiro_dividir_centavos(v_encargos_parcela, v_polo_total, v_polo_indice);
        INSERT INTO public.emprestimo_parcela_rateios (
          emprestimo_parcela_id, company_id, polo_id, valor_principal, valor_encargos
        ) VALUES (
          v_parcela_id, v_company_id, v_polo_id, v_rateio_principal, v_rateio_encargos
        );
      END LOOP;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
    'id', emprestimo.id,
    'descricao', emprestimo.descricao,
    'valor_liberado', emprestimo.valor_liberado,
    'valor_total_divida', emprestimo.valor_total_divida,
    'total_parcelas', emprestimo.total_parcelas,
    'rateio_polos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('polo_id', polo.id, 'nome', polo.nome) ORDER BY polo.nome)
      FROM (
        SELECT DISTINCT rateio.polo_id
        FROM public.emprestimo_parcela_rateios rateio
        JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
        WHERE parcela.emprestimo_id = emprestimo.id
      ) rateios
      JOIN public.polos polo ON polo.id = rateios.polo_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.emprestimos_financeiros emprestimo
  WHERE emprestimo.id = v_emprestimo.id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_emprestimo_parcela_matriz_secure(
  p_emprestimo_parcela_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parcela public.emprestimo_parcelas%rowtype;
  v_emprestimo public.emprestimos_financeiros%rowtype;
  v_conta_pagar public.contas_pagar%rowtype;
  v_existing public.emprestimo_parcela_baixas%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa é obrigatória.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_global()
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode baixar parcelas de empréstimo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_parcela
  FROM public.emprestimo_parcelas
  WHERE id = p_emprestimo_parcela_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de empréstimo não encontrada.';
  END IF;
  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE id = v_parcela.emprestimo_id
  FOR UPDATE;
  SELECT * INTO v_conta_pagar
  FROM public.contas_pagar
  WHERE emprestimo_parcela_id = v_parcela.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar central da parcela não encontrada.';
  END IF;

  IF p_conta_bancaria_id IS NULL
     OR nullif(btrim(coalesce(p_forma_pagamento, '')), '') IS NULL
     OR upper(btrim(p_forma_pagamento)) NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
    RAISE EXCEPTION 'Informe a conta da Matriz e a forma de pagamento.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, v_emprestimo.polo_matriz_id) THEN
    RAISE EXCEPTION 'A conta selecionada não está disponível na Matriz.';
  END IF;

  SELECT * INTO v_existing
  FROM public.emprestimo_parcela_baixas
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.emprestimo_parcela_id IS DISTINCT FROM v_parcela.id
       OR v_existing.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id
       OR v_existing.data_pagamento IS DISTINCT FROM coalesce(p_data_pagamento, CURRENT_DATE)
       OR v_existing.forma_pagamento IS DISTINCT FROM upper(btrim(p_forma_pagamento)) THEN
      RAISE EXCEPTION 'A chave de idempotência da baixa já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_build_object('id', v_parcela.id, 'status', v_parcela.status, 'replayed', true);
  END IF;
  IF v_parcela.status = 'PAGO' OR v_conta_pagar.status = 'PAGO' THEN
    RAISE EXCEPTION 'Esta parcela já foi baixada.';
  END IF;
  IF v_parcela.status = 'CANCELADO' OR v_emprestimo.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Uma parcela cancelada não pode ser baixada.';
  END IF;

  INSERT INTO public.emprestimo_parcela_baixas (
    emprestimo_parcela_id, request_id, conta_bancaria_id, data_pagamento, forma_pagamento, created_by
  ) VALUES (
    v_parcela.id, p_request_id, p_conta_bancaria_id,
    coalesce(p_data_pagamento, CURRENT_DATE), upper(btrim(p_forma_pagamento)), auth.uid()
  );

  UPDATE public.contas_pagar
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      valor_pago = valor,
      forma_pagamento = upper(btrim(p_forma_pagamento)),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = v_conta_pagar.id;

  UPDATE public.emprestimo_parcelas
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      valor_pago = valor_total,
      forma_pagamento = upper(btrim(p_forma_pagamento)),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = v_parcela.id;

  UPDATE public.emprestimo_parcela_rateios
  SET status = 'PAGO', updated_at = now()
  WHERE emprestimo_parcela_id = v_parcela.id;

  UPDATE public.emprestimos_financeiros
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.emprestimo_parcelas parcela
          WHERE parcela.emprestimo_id = v_emprestimo.id
            AND parcela.status <> 'PAGO'
        ) THEN 'QUITADO'
        ELSE 'ATIVO'
      END,
      updated_at = now()
  WHERE id = v_emprestimo.id;

  RETURN jsonb_build_object(
    'id', v_parcela.id,
    'status', 'PAGO',
    'valor_pago', v_parcela.valor_total,
    'replayed', false
  );
END;
$function$;
