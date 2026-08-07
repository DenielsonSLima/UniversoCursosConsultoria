-- Fecha duas bordas do rateio: entrega Realtime para a aba Contas a Pagar e
-- replay idempotente mesmo se um polo mudar de status após a primeira chamada.

DROP POLICY IF EXISTS finance_realtime_events_select ON public.finance_realtime_events;
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
        OR public.gestor_has_financeiro_tab('resumo')
        OR public.gestor_has_financeiro_tab('receber')
        OR public.gestor_has_financeiro_tab('despesas')
        OR public.gestor_has_financeiro_tab('outros-debitos')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
        OR public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
    )
  );

ALTER FUNCTION public.criar_despesa_rateada_matriz_secure(
  uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric,
  uuid, uuid, text, uuid, integer, integer, text, boolean, boolean, text,
  uuid, text, text, text, text, bigint, text, uuid[]
)
RENAME TO criar_despesa_rateada_matriz_secure_raw;

CREATE OR REPLACE FUNCTION public.criar_despesa_rateada_matriz_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_total_parcelas integer DEFAULT 1,
  p_intervalo_quantidade integer DEFAULT 1,
  p_intervalo_unidade text DEFAULT 'MESES',
  p_split_total boolean DEFAULT false,
  p_baixa_imediata boolean DEFAULT false,
  p_forma_pagamento text DEFAULT NULL,
  p_conta_bancaria_id uuid DEFAULT NULL,
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_tamanho bigint DEFAULT NULL,
  p_rateio_modo text DEFAULT NULL,
  p_rateio_polo_ids uuid[] DEFAULT NULL
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
  v_rateio_modo text := upper(btrim(coalesce(p_rateio_modo, '')));
  v_polos_solicitados uuid[];
  v_polos_gravados uuid[];
  v_polo_total integer;
  v_existing_count integer;
  v_expected_status text := CASE WHEN coalesce(p_baixa_imediata, false) THEN 'PAGO' ELSE 'PENDENTE' END;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  -- Autorização sempre vem antes de consultar a chave de idempotência.
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

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.despesas_lancamentos despesa
  WHERE despesa.request_id = p_request_id;

  IF v_existing_count = 0 THEN
    RETURN QUERY
    SELECT *
    FROM public.criar_despesa_rateada_matriz_secure_raw(
      p_request_id,
      p_polo_id,
      p_tipo,
      p_descricao,
      p_valor,
      p_data_lancamento,
      p_data_vencimento,
      p_juros_valor,
      p_multa_valor,
      p_desconto_valor,
      p_categoria_financeira_id,
      p_fornecedor_id,
      p_observacao,
      p_turma_id,
      p_total_parcelas,
      p_intervalo_quantidade,
      p_intervalo_unidade,
      p_split_total,
      p_baixa_imediata,
      p_forma_pagamento,
      p_conta_bancaria_id,
      p_anexo_bucket,
      p_anexo_path,
      p_anexo_nome,
      p_anexo_mime,
      p_anexo_tamanho,
      p_rateio_modo,
      p_rateio_polo_ids
    );
    RETURN;
  END IF;

  -- O lote já existe: a composição canônica foi congelada no pai. Não é
  -- recalculada a partir de polos ativos/inativos no retry.
  SELECT despesa.rateio_polo_ids
  INTO v_polos_gravados
  FROM public.despesas_lancamentos despesa
  WHERE despesa.request_id = p_request_id
  ORDER BY despesa.parcela_numero
  LIMIT 1;

  v_polos_solicitados := ARRAY(
    SELECT DISTINCT polo_id
    FROM unnest(coalesce(p_rateio_polo_ids, ARRAY[]::uuid[])) AS solicitados(polo_id)
    ORDER BY polo_id
  );
  v_polo_total := cardinality(v_polos_gravados);

  IF v_total > 60
     OR v_unidade NOT IN ('DIAS', 'SEMANAS', 'MESES')
     OR v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS')
     OR p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR p_valor IS NULL OR p_valor <= 0
     OR p_data_vencimento IS NULL
     OR (coalesce(p_split_total, false) AND round(p_valor * 100)::bigint < v_total)
     OR coalesce(p_juros_valor, 0) < 0
     OR coalesce(p_multa_valor, 0) < 0
     OR coalesce(p_desconto_valor, 0) < 0
     OR p_desconto_valor > p_valor + coalesce(p_juros_valor, 0) + coalesce(p_multa_valor, 0)
     OR (coalesce(p_baixa_imediata, false) AND (
       p_conta_bancaria_id IS NULL
       OR nullif(btrim(coalesce(p_forma_pagamento, '')), '') IS NULL
     ))
     OR (v_rateio_modo = 'TODOS' AND cardinality(v_polos_solicitados) <> 0)
     OR (v_rateio_modo = 'SELECIONADOS' AND v_polos_solicitados IS DISTINCT FROM v_polos_gravados)
  THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
  END IF;

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
          OR existente.rateio_polo_ids IS DISTINCT FROM v_polos_gravados
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
     )
  THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
  ORDER BY parcela_numero;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_despesa_rateada_matriz_secure_raw(
  uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric,
  uuid, uuid, text, uuid, integer, integer, text, boolean, boolean, text,
  uuid, text, text, text, text, bigint, text, uuid[]
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.criar_despesa_rateada_matriz_secure(
  uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric,
  uuid, uuid, text, uuid, integer, integer, text, boolean, boolean, text,
  uuid, text, text, text, text, bigint, text, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_despesa_rateada_matriz_secure(
  uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric,
  uuid, uuid, text, uuid, integer, integer, text, boolean, boolean, text,
  uuid, text, text, text, text, bigint, text, uuid[]
) TO authenticated, service_role;
