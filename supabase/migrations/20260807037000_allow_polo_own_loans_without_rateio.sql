-- Empréstimos podem pertencer a um polo comum sem gerar rateio. O nome da
-- coluna legado `polo_matriz_id` é preservado por compatibilidade, mas passa
-- a representar o polo responsável quando o modo for `SEM_RATEIO`.
--
-- Regras canônicas:
-- - Matriz: somente TODOS ou SELECIONADOS, com rateio persistido por parcela.
-- - Polo comum: somente SEM_RATEIO, com crédito, CxP e baixa no próprio polo.
-- - Financiamento permanece fora do resultado operacional do Caixa.

BEGIN;

ALTER TABLE public.emprestimos_financeiros
  DROP CONSTRAINT IF EXISTS emprestimos_rateio_auditavel_chk;

ALTER TABLE public.emprestimos_financeiros
  ADD CONSTRAINT emprestimos_rateio_auditavel_chk
  CHECK (
    (
      rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND cardinality(rateio_polo_ids) > 0
    )
    OR (
      rateio_modo = 'SEM_RATEIO'
      AND cardinality(rateio_polo_ids) = 0
    )
  );

COMMENT ON COLUMN public.emprestimos_financeiros.polo_matriz_id IS
  'Coluna legada de compatibilidade. Nos contratos TODOS/SELECIONADOS identifica a Matriz; em SEM_RATEIO identifica o polo responsável pelo contrato próprio.';

CREATE INDEX IF NOT EXISTS emprestimos_financeiros_polo_responsavel_status_idx
  ON public.emprestimos_financeiros (polo_matriz_id, status, data_liberacao DESC);

-- A leitura direta permanece restrita ao polo responsável. As mutações
-- seguem exclusivamente pelas RPCs SECURITY DEFINER abaixo.
DROP POLICY IF EXISTS emprestimos_financeiros_select_matriz
  ON public.emprestimos_financeiros;
CREATE POLICY emprestimos_financeiros_select_responsavel
  ON public.emprestimos_financeiros
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_matriz_id)
    AND public.gestor_has_financeiro_tab('emprestimos')
  );

DROP POLICY IF EXISTS emprestimo_parcelas_select_matriz
  ON public.emprestimo_parcelas;
CREATE POLICY emprestimo_parcelas_select_responsavel
  ON public.emprestimo_parcelas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.emprestimos_financeiros emprestimo
      WHERE emprestimo.id = emprestimo_parcelas.emprestimo_id
        AND public.is_financeiro_for_polo(emprestimo.polo_matriz_id)
        AND public.gestor_has_financeiro_tab('emprestimos')
    )
  );

CREATE OR REPLACE FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  p_request_id uuid,
  p_polo_id uuid,
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
  p_polo_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_polo_is_matriz boolean := false;
  v_emprestimo public.emprestimos_financeiros%rowtype;
  v_conta_receber_id uuid;
  v_parcela_id uuid;
  v_parcela integer;
  v_polo_indice integer;
  v_polo_total integer := 0;
  v_polo_rateado_id uuid;
  v_principal_parcela numeric;
  v_encargos_parcela numeric;
  v_rateio_principal numeric;
  v_rateio_encargos numeric;
  v_rateio_modo text := upper(btrim(coalesce(p_rateio_modo, '')));
  v_polos uuid[] := ARRAY[]::uuid[];
  v_polos_solicitados uuid[] := ARRAY[]::uuid[];
  v_polos_rateio_canonicos uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  -- A autorização ocorre antes de qualquer busca por request_id. O usuário
  -- precisa poder operar o polo solicitado e ter a aba de empréstimos.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para registrar empréstimo neste polo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  v_polos_solicitados := ARRAY(
    SELECT DISTINCT polo_id
    FROM unnest(coalesce(p_polo_ids, ARRAY[]::uuid[])) AS polos_solicitados(polo_id)
    ORDER BY polo_id
  );

  SELECT polo.company_id, polo.is_matriz
  INTO v_company_id, v_polo_is_matriz
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  -- O filtro do polo faz com que uma chave aleatória usada em outro escopo não
  -- revele a operação existente. A unicidade global continua protegendo a
  -- gravação em caso de colisão entre escopos.
  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE request_id = p_request_id
    AND polo_matriz_id = p_polo_id;

  IF FOUND THEN
    IF v_emprestimo.credor_nome IS DISTINCT FROM btrim(p_credor_nome)
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
         v_rateio_modo IN ('TODOS', 'SEM_RATEIO')
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
       OR v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS', 'SEM_RATEIO') THEN
      RAISE EXCEPTION 'Dados inválidos para o empréstimo.';
    END IF;

    IF (v_polo_is_matriz AND v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS'))
       OR (NOT v_polo_is_matriz AND v_rateio_modo <> 'SEM_RATEIO') THEN
      RAISE EXCEPTION 'A Matriz deve escolher TODOS ou SELECIONADOS; polo comum deve usar SEM_RATEIO.';
    END IF;

    IF v_rateio_modo IN ('TODOS', 'SEM_RATEIO')
       AND cardinality(v_polos_solicitados) <> 0 THEN
      RAISE EXCEPTION 'Este modo não aceita polos adicionais no rateio.';
    END IF;

    IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_credito_id, p_polo_id) THEN
      RAISE EXCEPTION 'A conta de crédito não está disponível no polo responsável.';
    END IF;

    IF v_rateio_modo = 'TODOS' THEN
      SELECT coalesce(array_agg(polo.id ORDER BY polo.created_at, polo.id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos polo
      WHERE polo.company_id = v_company_id
        AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
    ELSIF v_rateio_modo = 'SELECIONADOS' THEN
      SELECT coalesce(array_agg(polo.id ORDER BY polo.created_at, polo.id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos polo
      WHERE polo.id = ANY(v_polos_solicitados)
        AND polo.company_id = v_company_id
        AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

      IF cardinality(v_polos) <> cardinality(v_polos_solicitados) THEN
        RAISE EXCEPTION 'Os polos do rateio devem estar ativos e pertencer à mesma empresa da Matriz.';
      END IF;
    ELSIF v_rateio_modo = 'SEM_RATEIO' THEN
      -- Intencionalmente vazio: a obrigação física e econômica é somente do
      -- polo responsável; não é criado espelho em emprestimo_parcela_rateios.
      v_polos := ARRAY[]::uuid[];
    END IF;

    v_polo_total := cardinality(v_polos);
    IF v_rateio_modo IN ('TODOS', 'SELECIONADOS') AND v_polo_total < 1 THEN
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
      p_polo_id, 'Crédito de empréstimo: ' || btrim(p_descricao), round(p_valor_liberado, 2),
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
      v_company_id, p_polo_id, p_request_id, btrim(p_credor_nome), btrim(p_descricao),
      round(p_valor_liberado, 2), round(p_valor_total_divida, 2), p_data_liberacao, p_data_primeiro_vencimento,
      p_total_parcelas, p_intervalo_meses, p_conta_credito_id, upper(btrim(p_forma_credito)),
      v_rateio_modo, v_polos_rateio_canonicos, v_conta_receber_id,
      nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
    )
    RETURNING * INTO v_emprestimo;

    FOR v_parcela IN 1..p_total_parcelas LOOP
      v_principal_parcela := public.financeiro_dividir_centavos(p_valor_liberado, p_total_parcelas, v_parcela);
      v_encargos_parcela := public.financeiro_dividir_centavos(
        p_valor_total_divida - p_valor_liberado,
        p_total_parcelas,
        v_parcela
      );

      INSERT INTO public.emprestimo_parcelas (
        emprestimo_id, numero, data_vencimento, valor_principal, valor_encargos
      ) VALUES (
        v_emprestimo.id,
        v_parcela,
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        v_principal_parcela,
        v_encargos_parcela
      )
      RETURNING id INTO v_parcela_id;

      -- Há sempre uma única obrigação física. Em SEM_RATEIO ela é do polo
      -- responsável; em TODOS/SELECIONADOS ela é da Matriz.
      INSERT INTO public.contas_pagar (
        polo_id, descricao, valor, data_vencimento, status, categoria, emprestimo_parcela_id
      ) VALUES (
        p_polo_id,
        'Empréstimo: ' || btrim(p_descricao) || ' (' || v_parcela || '/' || p_total_parcelas || ')',
        round(v_principal_parcela + v_encargos_parcela, 2),
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        'PENDENTE', 'EMPRESTIMO', v_parcela_id
      );

      FOR v_polo_indice IN 1..v_polo_total LOOP
        v_polo_rateado_id := v_polos[v_polo_indice];
        v_rateio_principal := public.financeiro_dividir_centavos(v_principal_parcela, v_polo_total, v_polo_indice);
        v_rateio_encargos := public.financeiro_dividir_centavos(v_encargos_parcela, v_polo_total, v_polo_indice);
        INSERT INTO public.emprestimo_parcela_rateios (
          emprestimo_parcela_id, company_id, polo_id, valor_principal, valor_encargos
        ) VALUES (
          v_parcela_id, v_company_id, v_polo_rateado_id, v_rateio_principal, v_rateio_encargos
        );
      END LOOP;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
    'id', emprestimo.id,
    'polo_responsavel_id', emprestimo.polo_matriz_id,
    'polo_responsavel_nome', polo_responsavel.nome,
    'polo_responsavel_is_matriz', polo_responsavel.is_matriz,
    'rateio_modo', emprestimo.rateio_modo,
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
  JOIN public.polos polo_responsavel ON polo_responsavel.id = emprestimo.polo_matriz_id
  WHERE emprestimo.id = v_emprestimo.id;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada.';
END;
$function$;

COMMENT ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) IS
  'Cria empréstimo com autorização antes do replay: Matriz pode ratear; polo comum cria SEM_RATEIO no próprio escopo. Valores, parcelas e centavos são canônicos no banco.';

CREATE OR REPLACE FUNCTION public.listar_emprestimos_financeiros_polo_secure(
  p_polo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos empréstimos deste polo.' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', emprestimo.id,
      'polo_responsavel_id', emprestimo.polo_matriz_id,
      'polo_responsavel_nome', polo_responsavel.nome,
      'polo_responsavel_is_matriz', polo_responsavel.is_matriz,
      'rateio_modo', emprestimo.rateio_modo,
      'credor_nome', emprestimo.credor_nome,
      'descricao', emprestimo.descricao,
      'valor_liberado', emprestimo.valor_liberado,
      'valor_total_divida', emprestimo.valor_total_divida,
      'valor_encargos', emprestimo.valor_encargos,
      'data_liberacao', emprestimo.data_liberacao,
      'total_parcelas', emprestimo.total_parcelas,
      'status', emprestimo.status,
      'observacao', emprestimo.observacao,
      'parcelas', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', parcela.id,
          'numero', parcela.numero,
          'data_vencimento', parcela.data_vencimento,
          'valor_principal', parcela.valor_principal,
          'valor_encargos', parcela.valor_encargos,
          'valor_total', parcela.valor_total,
          'status', parcela.status,
          'data_pagamento', parcela.data_pagamento,
          'valor_pago', parcela.valor_pago,
          'conta_pagar_id', conta.id,
          'rateios', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', rateio.id,
              'polo_id', rateio.polo_id,
              'polo_nome', polo.nome,
              'valor_principal', rateio.valor_principal,
              'valor_encargos', rateio.valor_encargos,
              'valor_total', rateio.valor_total,
              'status', rateio.status
            ) ORDER BY polo.nome)
            FROM public.emprestimo_parcela_rateios rateio
            JOIN public.polos polo ON polo.id = rateio.polo_id
            WHERE rateio.emprestimo_parcela_id = parcela.id
          ), '[]'::jsonb)
        ) ORDER BY parcela.numero)
        FROM public.emprestimo_parcelas parcela
        LEFT JOIN public.contas_pagar conta ON conta.emprestimo_parcela_id = parcela.id
        WHERE parcela.emprestimo_id = emprestimo.id
      ), '[]'::jsonb)
    ) ORDER BY emprestimo.data_liberacao DESC, emprestimo.id DESC)
    FROM public.emprestimos_financeiros emprestimo
    JOIN public.polos polo_responsavel ON polo_responsavel.id = emprestimo.polo_matriz_id
    WHERE emprestimo.polo_matriz_id = p_polo_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_emprestimo_parcela_polo_secure(
  p_emprestimo_parcela_id uuid,
  p_polo_id uuid,
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
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para baixar empréstimo neste polo.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT parcela.* INTO v_parcela
  FROM public.emprestimo_parcelas parcela
  JOIN public.emprestimos_financeiros emprestimo
    ON emprestimo.id = parcela.emprestimo_id
  WHERE parcela.id = p_emprestimo_parcela_id
    AND emprestimo.polo_matriz_id = p_polo_id
  FOR UPDATE OF parcela;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de empréstimo não encontrada neste polo.';
  END IF;

  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE id = v_parcela.emprestimo_id
    AND polo_matriz_id = p_polo_id
  FOR UPDATE;

  SELECT * INTO v_conta_pagar
  FROM public.contas_pagar
  WHERE emprestimo_parcela_id = v_parcela.id
    AND polo_id = p_polo_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar do empréstimo não encontrada neste polo.';
  END IF;

  SELECT baixa.* INTO v_existing
  FROM public.emprestimo_parcela_baixas baixa
  JOIN public.emprestimo_parcelas parcela ON parcela.id = baixa.emprestimo_parcela_id
  JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
  WHERE baixa.request_id = p_request_id
    AND emprestimo.polo_matriz_id = p_polo_id;

  IF FOUND THEN
    IF v_existing.emprestimo_parcela_id IS DISTINCT FROM v_parcela.id
       OR v_existing.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id
       OR v_existing.data_pagamento IS DISTINCT FROM coalesce(p_data_pagamento, CURRENT_DATE)
       OR v_existing.forma_pagamento IS DISTINCT FROM upper(btrim(p_forma_pagamento)) THEN
      RAISE EXCEPTION 'A chave de idempotência da baixa já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_build_object(
      'id', v_parcela.id,
      'status', v_parcela.status,
      'valor_pago', coalesce(v_parcela.valor_pago, v_parcela.valor_total),
      'replayed', true
    );
  END IF;

  IF p_conta_bancaria_id IS NULL
     OR nullif(btrim(coalesce(p_forma_pagamento, '')), '') IS NULL
     OR upper(btrim(p_forma_pagamento)) NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
    RAISE EXCEPTION 'Informe a conta do polo responsável e a forma de pagamento.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, p_polo_id) THEN
    RAISE EXCEPTION 'A conta selecionada não está disponível no polo responsável.';
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

  -- Em SEM_RATEIO não há linhas nesta tabela; a atualização é naturalmente
  -- vazia e mantém a baixa física limitada ao polo responsável.
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
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa já foi usada.';
END;
$function$;

-- O resumo de financiamento inclui o contrato sem rateio no seu próprio polo,
-- mas continua separado do resultado operacional já filtrado pela prestação
-- mensal do Caixa. Para contratos rateados, cada rateio econômico é contado
-- uma única vez; para SEM_RATEIO, entra a parcela física do polo responsável.
CREATE OR REPLACE FUNCTION public.get_caixa_financiamento_resumo_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, CURRENT_DATE)) + interval '1 month')::date;
  v_credito numeric := 0;
  v_obrigacao numeric := 0;
  v_pago_rateado numeric := 0;
  v_principal numeric := 0;
  v_encargos numeric := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (p_polo_id IS NULL AND public.is_financeiro_global() AND public.gestor_has_module('caixa'))
       OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id) AND public.gestor_has_module('caixa'))
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao resumo financeiro do Caixa.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(emprestimo.valor_liberado), 0)
  INTO v_credito
  FROM public.emprestimos_financeiros emprestimo
  WHERE emprestimo.data_liberacao >= v_inicio
    AND emprestimo.data_liberacao < v_fim
    AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id);

  WITH valores_financiamento AS (
    SELECT
      rateio.valor_total,
      rateio.valor_principal,
      rateio.valor_encargos,
      rateio.status
    FROM public.emprestimo_parcela_rateios rateio
    JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    WHERE emprestimo.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND parcela.data_vencimento >= v_inicio
      AND parcela.data_vencimento < v_fim
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)

    UNION ALL

    SELECT
      parcela.valor_total,
      parcela.valor_principal,
      parcela.valor_encargos,
      parcela.status
    FROM public.emprestimo_parcelas parcela
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    WHERE emprestimo.rateio_modo = 'SEM_RATEIO'
      AND parcela.data_vencimento >= v_inicio
      AND parcela.data_vencimento < v_fim
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
  )
  SELECT
    coalesce(sum(valor_total), 0),
    coalesce(sum(valor_total) FILTER (WHERE status = 'PAGO'), 0),
    coalesce(sum(valor_principal), 0),
    coalesce(sum(valor_encargos), 0)
  INTO v_obrigacao, v_pago_rateado, v_principal, v_encargos
  FROM valores_financiamento;

  RETURN jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'credito_liberado_matriz', v_credito,
    'obrigacao_rateada', v_obrigacao,
    'principal_rateado', v_principal,
    'encargos_rateados', v_encargos,
    'pago_rateado', v_pago_rateado,
    'observacao', 'Crédito, principal e encargos de empréstimo são financiamento, não receita ou despesa operacional. No SEM_RATEIO, os valores pertencem exclusivamente ao polo responsável.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_emprestimos_financeiros_polo_secure(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcela_polo_secure(uuid, uuid, uuid, uuid, date, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_caixa_financiamento_resumo_secure(uuid, date)
  FROM PUBLIC;

-- O frontend passa a usar exclusivamente as RPCs por polo. As rotas legadas
-- aceitavam apenas o caso central e não conhecem SEM_RATEIO; removemos o
-- EXECUTE de authenticated para não permitir baixa de contrato próprio pelo
-- caminho antigo. service_role continua disponível para rotinas técnicas.
REVOKE EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.baixar_emprestimo_parcela_matriz_secure(
  uuid, uuid, uuid, date, text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_emprestimos_financeiros_polo_secure(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.baixar_emprestimo_parcela_polo_secure(uuid, uuid, uuid, uuid, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_financiamento_resumo_secure(uuid, date)
  TO authenticated, service_role;

COMMIT;
