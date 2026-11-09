
-- Snapshot anterior para ensaio descartável de compatibilidade; sem dados reais.
CREATE OR REPLACE FUNCTION public.criar_despesa_com_desdobramento_secure(p_request_id uuid, p_polo_id uuid, p_tipo text, p_descricao text, p_valor_total numeric, p_data_lancamento date, p_data_vencimento date, p_juros_total numeric DEFAULT 0, p_multa_total numeric DEFAULT 0, p_desconto_total numeric DEFAULT 0, p_categoria_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_turma_id uuid DEFAULT NULL::uuid, p_total_parcelas integer DEFAULT 1, p_intervalo_quantidade integer DEFAULT 1, p_intervalo_unidade text DEFAULT 'MESES'::text, p_anexo_bucket text DEFAULT NULL::text, p_anexo_path text DEFAULT NULL::text, p_anexo_nome text DEFAULT NULL::text, p_anexo_mime text DEFAULT NULL::text, p_anexo_tamanho bigint DEFAULT NULL::bigint)
 RETURNS SETOF despesas_lancamentos
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

REVOKE ALL ON FUNCTION public.criar_despesa_com_desdobramento_secure(uuid,uuid,text,text,numeric,date,date,numeric,numeric,numeric,uuid,uuid,text,uuid,integer,integer,text,text,text,text,text,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_com_desdobramento_secure(uuid,uuid,text,text,numeric,date,date,numeric,numeric,numeric,uuid,uuid,text,uuid,integer,integer,text,text,text,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_despesa_com_desdobramento_secure(uuid,uuid,text,text,numeric,date,date,numeric,numeric,numeric,uuid,uuid,text,uuid,integer,integer,text,text,text,text,text,bigint) TO service_role;

