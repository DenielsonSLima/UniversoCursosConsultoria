
-- Snapshot anterior para ensaio descartável de compatibilidade; sem dados reais.
CREATE OR REPLACE FUNCTION public.criar_despesa_rateada_matriz_secure_raw(p_request_id uuid, p_polo_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_data_lancamento date, p_data_vencimento date, p_juros_valor numeric DEFAULT 0, p_multa_valor numeric DEFAULT 0, p_desconto_valor numeric DEFAULT 0, p_categoria_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_turma_id uuid DEFAULT NULL::uuid, p_total_parcelas integer DEFAULT 1, p_intervalo_quantidade integer DEFAULT 1, p_intervalo_unidade text DEFAULT 'MESES'::text, p_split_total boolean DEFAULT false, p_baixa_imediata boolean DEFAULT false, p_forma_pagamento text DEFAULT NULL::text, p_conta_bancaria_id uuid DEFAULT NULL::uuid, p_anexo_bucket text DEFAULT NULL::text, p_anexo_path text DEFAULT NULL::text, p_anexo_nome text DEFAULT NULL::text, p_anexo_mime text DEFAULT NULL::text, p_anexo_tamanho bigint DEFAULT NULL::bigint, p_rateio_modo text DEFAULT NULL::text, p_rateio_polo_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS SETOF despesas_lancamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_total integer := greatest(1, coalesce(p_total_parcelas, 1));
  v_intervalo integer := greatest(1, coalesce(p_intervalo_quantidade, 1));
  v_unidade text := upper(btrim(coalesce(p_intervalo_unidade, 'MESES')));
  v_rateio_modo text := upper(btrim(coalesce(p_rateio_modo, '')));
  v_polos_solicitados uuid[];
  v_polos uuid[];
  v_polo_total integer;
  v_parcela integer;
  v_polo_indice integer;
  v_vencimento date;
  v_grupo uuid;
  v_valor_base numeric(15, 2);
  v_juros numeric(15, 2);
  v_multa numeric(15, 2);
  v_desconto numeric(15, 2);
  v_despesa_id uuid;
  v_existing_count integer;
  v_expected_status text := CASE WHEN coalesce(p_baixa_imediata, false) THEN 'PAGO' ELSE 'PENDENTE' END;
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

  IF p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR p_valor IS NULL OR p_valor <= 0
     OR p_data_vencimento IS NULL
     OR v_total > 60
     OR v_unidade NOT IN ('DIAS', 'SEMANAS', 'MESES')
     OR v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS') THEN
    RAISE EXCEPTION 'Dados inválidos para o rateio da conta a pagar.';
  END IF;

  IF coalesce(p_juros_valor, 0) < 0
     OR coalesce(p_multa_valor, 0) < 0
     OR coalesce(p_desconto_valor, 0) < 0
     OR p_desconto_valor > p_valor + coalesce(p_juros_valor, 0) + coalesce(p_multa_valor, 0) THEN
    RAISE EXCEPTION 'Ajustes inválidos para a conta a pagar.';
  END IF;

  IF coalesce(p_split_total, false)
     AND round(p_valor * 100)::bigint < v_total THEN
    RAISE EXCEPTION 'O valor total não comporta todas as parcelas com ao menos um centavo.';
  END IF;

  IF coalesce(p_baixa_imediata, false)
     AND (
       p_conta_bancaria_id IS NULL
       OR nullif(btrim(coalesce(p_forma_pagamento, '')), '') IS NULL
     ) THEN
    RAISE EXCEPTION 'Informe a conta da Matriz e a forma de pagamento para dar baixa.';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND polo.is_matriz = true
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O rateio de contas a pagar só pode ser lançado pela Matriz ativa.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_baixa_imediata, false)
     AND NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, p_polo_id) THEN
    RAISE EXCEPTION 'A conta selecionada não está ativa ou disponível na Matriz.';
  END IF;

  v_polos_solicitados := ARRAY(
    SELECT DISTINCT polo_id
    FROM unnest(coalesce(p_rateio_polo_ids, ARRAY[]::uuid[])) AS solicitados(polo_id)
    ORDER BY polo_id
  );

  IF v_rateio_modo = 'TODOS' THEN
    SELECT coalesce(array_agg(polo.id ORDER BY polo.id), ARRAY[]::uuid[])
    INTO v_polos
    FROM public.polos polo
    WHERE polo.company_id = v_company_id
      AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
  ELSE
    IF cardinality(v_polos_solicitados) = 0 THEN
      RAISE EXCEPTION 'Selecione ao menos um polo para o rateio.';
    END IF;

    SELECT coalesce(array_agg(polo.id ORDER BY polo.id), ARRAY[]::uuid[])
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
    RAISE EXCEPTION 'Não há polos ativos para o rateio.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.despesas_lancamentos despesa
  WHERE despesa.request_id = p_request_id;

  IF v_existing_count > 0 THEN
    IF v_existing_count <> v_total
       OR EXISTS (
         SELECT 1
         FROM generate_series(1, v_total) AS esperado(parcela_numero)
         LEFT JOIN public.despesas_lancamentos existente
           ON existente.request_id = p_request_id
          AND existente.parcela_numero = esperado.parcela_numero
         WHERE existente.id IS NULL
            OR existente.polo_id IS DISTINCT FROM p_polo_id
            OR existente.tipo IS DISTINCT FROM p_tipo
            OR existente.descricao IS DISTINCT FROM CASE
              WHEN v_total > 1 THEN btrim(p_descricao) || ' (' || esperado.parcela_numero || '/' || v_total || ')'
              ELSE btrim(p_descricao)
            END
            OR existente.valor_base IS DISTINCT FROM CASE
              WHEN coalesce(p_split_total, false)
                THEN public.financeiro_dividir_centavos(p_valor, v_total, esperado.parcela_numero)
              ELSE round(p_valor, 2)
            END
            OR existente.juros_valor IS DISTINCT FROM CASE
              WHEN coalesce(p_split_total, false)
                THEN public.financeiro_dividir_centavos(coalesce(p_juros_valor, 0), v_total, esperado.parcela_numero)
              ELSE round(coalesce(p_juros_valor, 0), 2)
            END
            OR existente.multa_valor IS DISTINCT FROM CASE
              WHEN coalesce(p_split_total, false)
                THEN public.financeiro_dividir_centavos(coalesce(p_multa_valor, 0), v_total, esperado.parcela_numero)
              ELSE round(coalesce(p_multa_valor, 0), 2)
            END
            OR existente.desconto_valor IS DISTINCT FROM CASE
              WHEN coalesce(p_split_total, false)
                THEN public.financeiro_dividir_centavos(coalesce(p_desconto_valor, 0), v_total, esperado.parcela_numero)
              ELSE round(coalesce(p_desconto_valor, 0), 2)
            END
            OR existente.data_lancamento IS DISTINCT FROM coalesce(p_data_lancamento, CURRENT_DATE)
            OR existente.data_vencimento IS DISTINCT FROM CASE v_unidade
              WHEN 'DIAS' THEN p_data_vencimento + ((esperado.parcela_numero - 1) * v_intervalo)
              WHEN 'SEMANAS' THEN p_data_vencimento + ((esperado.parcela_numero - 1) * v_intervalo * 7)
              ELSE (p_data_vencimento::timestamp + make_interval(months => (esperado.parcela_numero - 1) * v_intervalo))::date
            END
            OR existente.categoria_financeira_id IS DISTINCT FROM p_categoria_financeira_id
            OR existente.fornecedor_id IS DISTINCT FROM p_fornecedor_id
            OR existente.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '')
            OR existente.turma_id IS DISTINCT FROM p_turma_id
            OR existente.total_parcelas IS DISTINCT FROM v_total
            OR existente.grupo_parcelas_id IS DISTINCT FROM CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END
            OR existente.status IS DISTINCT FROM v_expected_status
            OR existente.forma_pagamento IS DISTINCT FROM CASE
              WHEN coalesce(p_baixa_imediata, false) THEN upper(btrim(p_forma_pagamento))
              ELSE NULL
            END
            OR existente.conta_bancaria_id IS DISTINCT FROM CASE
              WHEN coalesce(p_baixa_imediata, false) THEN p_conta_bancaria_id
              ELSE NULL
            END
            OR existente.anexo_bucket IS DISTINCT FROM p_anexo_bucket
            OR existente.anexo_path IS DISTINCT FROM p_anexo_path
            OR existente.anexo_nome IS DISTINCT FROM p_anexo_nome
            OR existente.anexo_mime IS DISTINCT FROM p_anexo_mime
            OR existente.anexo_tamanho IS DISTINCT FROM p_anexo_tamanho
            OR existente.rateio_modo IS DISTINCT FROM v_rateio_modo
            OR existente.rateio_polo_ids IS DISTINCT FROM v_polos
       )
       OR EXISTS (
         SELECT 1
         FROM public.despesas_lancamentos existente
         LEFT JOIN LATERAL (
           SELECT count(*)::integer AS quantidade
           FROM public.despesas_lancamentos_rateios rateio
           WHERE rateio.despesa_lancamento_id = existente.id
         ) filhos ON true
         WHERE existente.request_id = p_request_id
           AND filhos.quantidade <> v_polo_total
       ) THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
    ORDER BY parcela_numero;
    RETURN;
  END IF;

  v_grupo := CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END;

  FOR v_parcela IN 1..v_total LOOP
    v_vencimento := CASE v_unidade
      WHEN 'DIAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo)
      WHEN 'SEMANAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo * 7)
      ELSE (p_data_vencimento::timestamp + make_interval(months => (v_parcela - 1) * v_intervalo))::date
    END;

    v_valor_base := CASE
      WHEN coalesce(p_split_total, false)
        THEN public.financeiro_dividir_centavos(p_valor, v_total, v_parcela)
      ELSE round(p_valor, 2)
    END;
    v_juros := CASE
      WHEN coalesce(p_split_total, false)
        THEN public.financeiro_dividir_centavos(coalesce(p_juros_valor, 0), v_total, v_parcela)
      ELSE round(coalesce(p_juros_valor, 0), 2)
    END;
    v_multa := CASE
      WHEN coalesce(p_split_total, false)
        THEN public.financeiro_dividir_centavos(coalesce(p_multa_valor, 0), v_total, v_parcela)
      ELSE round(coalesce(p_multa_valor, 0), 2)
    END;
    v_desconto := CASE
      WHEN coalesce(p_split_total, false)
        THEN public.financeiro_dividir_centavos(coalesce(p_desconto_valor, 0), v_total, v_parcela)
      ELSE round(coalesce(p_desconto_valor, 0), 2)
    END;

    INSERT INTO public.despesas_lancamentos (
      polo_id,
      tipo,
      descricao,
      valor_base,
      valor,
      juros_valor,
      multa_valor,
      desconto_valor,
      data_lancamento,
      data_vencimento,
      data_pagamento,
      valor_pago,
      status,
      categoria_financeira_id,
      fornecedor_id,
      forma_pagamento,
      conta_bancaria_id,
      parcela_numero,
      total_parcelas,
      grupo_parcelas_id,
      observacao,
      turma_id,
      anexo_bucket,
      anexo_path,
      anexo_nome,
      anexo_mime,
      anexo_tamanho,
      request_id,
      rateio_modo,
      rateio_polo_ids
    ) VALUES (
      p_polo_id,
      p_tipo,
      CASE WHEN v_total > 1 THEN btrim(p_descricao) || ' (' || v_parcela || '/' || v_total || ')' ELSE btrim(p_descricao) END,
      v_valor_base,
      v_valor_base,
      v_juros,
      v_multa,
      v_desconto,
      coalesce(p_data_lancamento, CURRENT_DATE),
      v_vencimento,
      CASE WHEN coalesce(p_baixa_imediata, false) THEN coalesce(p_data_lancamento, CURRENT_DATE) ELSE NULL END,
      NULL,
      v_expected_status,
      p_categoria_financeira_id,
      p_fornecedor_id,
      CASE WHEN coalesce(p_baixa_imediata, false) THEN upper(btrim(p_forma_pagamento)) ELSE NULL END,
      CASE WHEN coalesce(p_baixa_imediata, false) THEN p_conta_bancaria_id ELSE NULL END,
      v_parcela,
      v_total,
      v_grupo,
      nullif(btrim(coalesce(p_observacao, '')), ''),
      p_turma_id,
      p_anexo_bucket,
      p_anexo_path,
      p_anexo_nome,
      p_anexo_mime,
      p_anexo_tamanho,
      p_request_id,
      v_rateio_modo,
      v_polos
    )
    RETURNING id INTO v_despesa_id;

    FOR v_polo_indice IN 1..v_polo_total LOOP
      INSERT INTO public.despesas_lancamentos_rateios (
        despesa_lancamento_id,
        company_id,
        polo_id,
        valor_base,
        juros_valor,
        multa_valor,
        desconto_valor,
        status,
        data_pagamento
      ) VALUES (
        v_despesa_id,
        v_company_id,
        v_polos[v_polo_indice],
        public.financeiro_dividir_centavos(v_valor_base, v_polo_total, v_polo_indice),
        public.financeiro_dividir_centavos(v_juros, v_polo_total, v_polo_indice),
        public.financeiro_dividir_centavos(v_multa, v_polo_total, v_polo_indice),
        public.financeiro_dividir_centavos(v_desconto, v_polo_total, v_polo_indice),
        v_expected_status,
        CASE WHEN coalesce(p_baixa_imediata, false) THEN coalesce(p_data_lancamento, CURRENT_DATE) ELSE NULL END
      );
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
  ORDER BY parcela_numero;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_despesa_rateada_matriz_secure_raw(uuid,uuid,text,text,numeric,date,date,numeric,numeric,numeric,uuid,uuid,text,uuid,integer,integer,text,boolean,boolean,text,uuid,text,text,text,text,bigint,text,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_rateada_matriz_secure_raw(uuid,uuid,text,text,numeric,date,date,numeric,numeric,numeric,uuid,uuid,text,uuid,integer,integer,text,boolean,boolean,text,uuid,text,text,text,text,bigint,text,uuid[]) TO service_role;

