BEGIN;
CREATE FUNCTION public.criar_despesa_estimada_secure(p_input jsonb, p_rateada boolean DEFAULT false)
RETURNS SETOF public.despesas_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request_id uuid := (p_input->>'p_request_id')::uuid;
  v_polo_id uuid := (p_input->>'p_polo_id')::uuid;
  v_payload_hash text := md5(jsonb_build_object('input',p_input,'rateada',p_rateada)::text);
  prior private.despesas_estimativas_operacoes%ROWTYPE;
  ids uuid[];
  previous_context text := current_setting('app.despesa_estimativa_context',true);
BEGIN
  IF v_actor IS NULL OR internal_financial_payments.actor_allowed(v_actor,v_polo_id,'despesas') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_request_id IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text,0));
  SELECT * INTO prior FROM private.despesas_estimativas_operacoes o WHERE o.request_id = v_request_id;
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM v_actor OR prior.operacao <> 'CRIAR'
      OR prior.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(prior.resultado->'ids') saved
      LEFT JOIN public.despesas_lancamentos d ON d.id=saved.value::uuid
      WHERE d.id IS NULL OR internal_financial_payments.actor_allowed(v_actor,d.polo_id,'despesas') IS NOT TRUE) THEN
      RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT d.* FROM public.despesas_lancamentos d
      WHERE d.id IN (SELECT value::uuid FROM jsonb_array_elements_text(prior.resultado->'ids'))
      ORDER BY d.parcela_numero;
    RETURN;
  END IF;
  IF p_input->>'p_tipo' NOT IN ('DESPESA_FIXA','DESPESA_VARIAVEL')
    OR p_input->>'p_tipo' IS NULL OR coalesce((p_input->>'p_baixa_imediata')::boolean,false)
    OR coalesce((p_input->>'p_split_total')::boolean,false)
    OR p_input->>'p_convenio_mes_id' IS NOT NULL
    OR coalesce((p_input->>'p_juros_valor')::numeric,0) <> 0
    OR coalesce((p_input->>'p_multa_valor')::numeric,0) <> 0
    OR coalesce((p_input->>'p_desconto_valor')::numeric,0) <> 0 THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.despesas_lancamentos d WHERE d.request_id = v_request_id) THEN
    RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
  END IF;
  IF p_rateada THEN
    SELECT array_agg(d.id ORDER BY d.parcela_numero) INTO ids
      FROM public.criar_despesa_rateada_matriz_secure(
        p_request_id => v_request_id, p_polo_id => v_polo_id, p_tipo => p_input->>'p_tipo',
        p_descricao => p_input->>'p_descricao', p_valor => (p_input->>'p_valor_base')::numeric,
        p_data_lancamento => (p_input->>'p_data_lancamento')::date,
        p_data_vencimento => (p_input->>'p_data_vencimento')::date, p_data_pagamento => NULL::date,
        p_juros_valor => 0, p_multa_valor => 0, p_desconto_valor => 0,
        p_categoria_financeira_id => (p_input->>'p_categoria_financeira_id')::uuid,
        p_fornecedor_id => (p_input->>'p_fornecedor_id')::uuid,
        p_observacao => p_input->>'p_observacao', p_turma_id => (p_input->>'p_turma_id')::uuid,
        p_total_parcelas => coalesce((p_input->>'p_total_parcelas')::integer,1),
        p_intervalo_quantidade => coalesce((p_input->>'p_intervalo_quantidade')::integer,1),
        p_intervalo_unidade => coalesce(p_input->>'p_intervalo_unidade','MESES'),
        p_split_total => false, p_baixa_imediata => false,
        p_anexo_bucket => p_input->>'p_anexo_bucket', p_anexo_path => p_input->>'p_anexo_path',
        p_anexo_nome => p_input->>'p_anexo_nome', p_anexo_mime => p_input->>'p_anexo_mime',
        p_anexo_tamanho => (p_input->>'p_anexo_tamanho')::bigint,
        p_rateio_modo => p_input->>'p_rateio_modo',
        p_rateio_polo_ids => ARRAY(SELECT value::uuid
          FROM jsonb_array_elements_text(coalesce(nullif(p_input->'p_rateio_polo_ids','null'::jsonb),'[]'::jsonb)))
      ) d;
  ELSE
    SELECT array_agg(d.id ORDER BY d.parcela_numero) INTO ids
      FROM public.criar_despesa_secure(
        p_request_id => v_request_id, p_polo_id => v_polo_id, p_tipo => p_input->>'p_tipo',
        p_descricao => p_input->>'p_descricao', p_valor_base => (p_input->>'p_valor_base')::numeric,
        p_data_lancamento => (p_input->>'p_data_lancamento')::date,
        p_data_vencimento => (p_input->>'p_data_vencimento')::date, p_data_pagamento => NULL::date,
        p_juros_valor => 0, p_multa_valor => 0, p_desconto_valor => 0,
        p_categoria_financeira_id => (p_input->>'p_categoria_financeira_id')::uuid,
        p_fornecedor_id => (p_input->>'p_fornecedor_id')::uuid,
        p_observacao => p_input->>'p_observacao', p_turma_id => (p_input->>'p_turma_id')::uuid,
        p_total_parcelas => coalesce((p_input->>'p_total_parcelas')::integer,1),
        p_intervalo_quantidade => coalesce((p_input->>'p_intervalo_quantidade')::integer,1),
        p_intervalo_unidade => coalesce(p_input->>'p_intervalo_unidade','MESES'),
        p_baixa_imediata => false,
        p_anexo_bucket => p_input->>'p_anexo_bucket', p_anexo_path => p_input->>'p_anexo_path',
        p_anexo_nome => p_input->>'p_anexo_nome', p_anexo_mime => p_input->>'p_anexo_mime',
        p_anexo_tamanho => (p_input->>'p_anexo_tamanho')::bigint
      ) d;
  END IF;
  IF coalesce(cardinality(ids),0) <> greatest(1,coalesce((p_input->>'p_total_parcelas')::integer,1)) THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_CREATION_INCOMPLETE';
  END IF;
  PERFORM set_config('app.despesa_estimativa_context','CRIAR',true);
  UPDATE public.despesas_lancamentos d SET valor_estimado = true,
    valor_estimado_original = d.valor_base, updated_at = now() WHERE d.id = ANY(ids);
  PERFORM set_config('app.despesa_estimativa_context',coalesce(previous_context,''),true);
  INSERT INTO private.despesas_estimativas_operacoes(request_id,actor_id,operacao,payload_hash,resultado)
    VALUES (v_request_id,v_actor,'CRIAR',v_payload_hash,jsonb_build_object('ids',ids));
  RETURN QUERY SELECT d.* FROM public.despesas_lancamentos d WHERE d.id = ANY(ids) ORDER BY d.parcela_numero;
END $$;
REVOKE ALL ON FUNCTION public.criar_despesa_estimada_secure(jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_estimada_secure(jsonb,boolean) TO authenticated;
COMMIT;
