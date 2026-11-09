-- Snapshot do contrato anterior, usado apenas no ensaio descartável de compatibilidade.
CREATE OR REPLACE FUNCTION public.criar_despesa_secure(p_request_id uuid, p_polo_id uuid, p_tipo text, p_descricao text, p_valor_base numeric, p_data_lancamento date, p_data_vencimento date, p_juros_valor numeric DEFAULT 0, p_multa_valor numeric DEFAULT 0, p_desconto_valor numeric DEFAULT 0, p_categoria_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_turma_id uuid DEFAULT NULL::uuid, p_total_parcelas integer DEFAULT 1, p_intervalo_quantidade integer DEFAULT 1, p_intervalo_unidade text DEFAULT 'MESES'::text, p_baixa_imediata boolean DEFAULT false, p_forma_pagamento text DEFAULT NULL::text, p_conta_bancaria_id uuid DEFAULT NULL::uuid, p_anexo_bucket text DEFAULT NULL::text, p_anexo_path text DEFAULT NULL::text, p_anexo_nome text DEFAULT NULL::text, p_anexo_mime text DEFAULT NULL::text, p_anexo_tamanho bigint DEFAULT NULL::bigint)
 RETURNS SETOF despesas_lancamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parcela integer;
  v_vencimento date;
  v_grupo uuid;
  v_total integer := greatest(1, coalesce(p_total_parcelas, 1));
  v_intervalo integer := greatest(1, coalesce(p_intervalo_quantidade, 1));
  v_unidade text := upper(trim(coalesce(p_intervalo_unidade, 'MESES')));
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND (
         (
           p_tipo = 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('outros-debitos')
         )
         OR (
           p_tipo <> 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('despesas')
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para lançar despesas neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.despesas_lancamentos existente
      WHERE existente.request_id = p_request_id
        AND existente.parcela_numero = 1
        AND (
          existente.polo_id IS DISTINCT FROM p_polo_id
          OR existente.tipo IS DISTINCT FROM p_tipo
          OR regexp_replace(
               existente.descricao,
               ' \([0-9]+/[0-9]+\)$',
               ''
             ) IS DISTINCT FROM trim(p_descricao)
          OR existente.valor_base IS DISTINCT FROM round(p_valor_base, 2)
          OR existente.juros_valor IS DISTINCT FROM
            round(coalesce(p_juros_valor, 0), 2)
          OR existente.multa_valor IS DISTINCT FROM
            round(coalesce(p_multa_valor, 0), 2)
          OR existente.desconto_valor IS DISTINCT FROM
            round(coalesce(p_desconto_valor, 0), 2)
          OR existente.data_lancamento IS DISTINCT FROM
            coalesce(p_data_lancamento, CURRENT_DATE)
          OR existente.data_vencimento IS DISTINCT FROM p_data_vencimento
          OR existente.categoria_financeira_id IS DISTINCT FROM
            p_categoria_financeira_id
          OR existente.fornecedor_id IS DISTINCT FROM p_fornecedor_id
          OR existente.observacao IS DISTINCT FROM
            nullif(trim(coalesce(p_observacao, '')), '')
          OR existente.turma_id IS DISTINCT FROM p_turma_id
          OR existente.total_parcelas IS DISTINCT FROM v_total
          OR existente.status IS DISTINCT FROM
            CASE WHEN p_baixa_imediata THEN 'PAGO' ELSE 'PENDENTE' END
          OR existente.forma_pagamento IS DISTINCT FROM
            CASE
              WHEN p_baixa_imediata
                THEN upper(trim(p_forma_pagamento))
              ELSE NULL
            END
          OR existente.conta_bancaria_id IS DISTINCT FROM
            CASE WHEN p_baixa_imediata
              THEN p_conta_bancaria_id
              ELSE NULL
            END
          OR existente.anexo_bucket IS DISTINCT FROM p_anexo_bucket
          OR existente.anexo_path IS DISTINCT FROM p_anexo_path
          OR existente.anexo_nome IS DISTINCT FROM p_anexo_nome
          OR existente.anexo_mime IS DISTINCT FROM p_anexo_mime
          OR existente.anexo_tamanho IS DISTINCT FROM p_anexo_tamanho
          OR (
            v_total > 1
            AND (
              SELECT segunda.data_vencimento
              FROM public.despesas_lancamentos segunda
              WHERE segunda.request_id = p_request_id
                AND segunda.parcela_numero = 2
            ) IS DISTINCT FROM CASE v_unidade
              WHEN 'DIAS' THEN p_data_vencimento + v_intervalo
              WHEN 'SEMANAS' THEN p_data_vencimento + (v_intervalo * 7)
              ELSE (
                p_data_vencimento::timestamp
                + make_interval(months => v_intervalo)
              )::date
            END
          )
        )
    ) THEN
      RAISE EXCEPTION
        'A chave de idempotência já foi usada com dados diferentes.';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
    ORDER BY parcela_numero;
    RETURN;
  END IF;

  IF p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO') THEN
    RAISE EXCEPTION 'Tipo de despesa inválido.';
  END IF;
  IF nullif(trim(p_descricao), '') IS NULL THEN
    RAISE EXCEPTION 'A descrição da despesa é obrigatória.';
  END IF;
  IF p_valor_base IS NULL OR p_valor_base <= 0 THEN
    RAISE EXCEPTION 'O valor-base deve ser maior que zero.';
  END IF;
  IF v_total > 60 THEN
    RAISE EXCEPTION 'O parcelamento deve conter no máximo 60 parcelas.';
  END IF;
  IF v_unidade NOT IN ('DIAS', 'SEMANAS', 'MESES') THEN
    RAISE EXCEPTION 'A unidade do intervalo deve ser dias, semanas ou meses.';
  END IF;

  IF p_baixa_imediata AND (
    p_conta_bancaria_id IS NULL
    OR nullif(trim(p_forma_pagamento), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Informe a conta e a forma de pagamento para dar baixa.';
  END IF;

  IF p_baixa_imediata
     AND NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_bancaria_id,
       p_polo_id
     ) THEN
    RAISE EXCEPTION 'A conta selecionada não está ativa ou disponível neste polo.';
  END IF;

  v_grupo := CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END;

  FOR v_parcela IN 1..v_total LOOP
    v_vencimento := CASE v_unidade
      WHEN 'DIAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo)
      WHEN 'SEMANAS' THEN p_data_vencimento + ((v_parcela - 1) * v_intervalo * 7)
      ELSE (
        p_data_vencimento::timestamp
        + make_interval(months => (v_parcela - 1) * v_intervalo)
      )::date
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
      request_id
    )
    VALUES (
      p_polo_id,
      p_tipo,
      CASE
        WHEN v_total > 1
          THEN trim(p_descricao) || ' (' || v_parcela || '/' || v_total || ')'
        ELSE trim(p_descricao)
      END,
      round(p_valor_base, 2),
      round(p_valor_base, 2),
      round(coalesce(p_juros_valor, 0), 2),
      round(coalesce(p_multa_valor, 0), 2),
      round(coalesce(p_desconto_valor, 0), 2),
      coalesce(p_data_lancamento, CURRENT_DATE),
      v_vencimento,
      CASE WHEN p_baixa_imediata
        THEN coalesce(p_data_lancamento, CURRENT_DATE)
        ELSE NULL
      END,
      NULL,
      CASE WHEN p_baixa_imediata THEN 'PAGO' ELSE 'PENDENTE' END,
      p_categoria_financeira_id,
      p_fornecedor_id,
      CASE WHEN p_baixa_imediata THEN upper(trim(p_forma_pagamento)) ELSE NULL END,
      CASE WHEN p_baixa_imediata THEN p_conta_bancaria_id ELSE NULL END,
      v_parcela,
      v_total,
      v_grupo,
      nullif(trim(p_observacao), ''),
      p_turma_id,
      p_anexo_bucket,
      p_anexo_path,
      p_anexo_nome,
      p_anexo_mime,
      p_anexo_tamanho,
      p_request_id
    );
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
  ORDER BY parcela_numero;
END;
$function$;

