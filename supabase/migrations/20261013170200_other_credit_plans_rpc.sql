BEGIN;

CREATE FUNCTION internal_finance.authorize_other_credit_plan(p_polo_id uuid, p_require_write boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_polo_id IS NULL
    OR NOT coalesce(public.is_financeiro_for_polo(p_polo_id), false)
    OR NOT coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado a Outros Créditos neste polo.' USING ERRCODE = '42501';
  END IF;
  IF p_require_write AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u WHERE u.auth_user_id = auth.uid()
      AND lower(btrim(u.status)) IN ('ativo', 'active')
      AND lower(btrim(u.perfil)) IN ('gestor', 'financeiro')
  ) THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar cobranças de Outros Créditos.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE FUNCTION internal_finance.validate_other_credit_plan_references(p_polo_id uuid, p_input jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.polos p WHERE p.id = p_polo_id
    AND lower(coalesce(p.status, '')) NOT IN ('inativo', 'inactive')) THEN
    RAISE EXCEPTION 'O polo deve existir e estar ativo.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parceiros p WHERE p.id = (p_input ->> 'clienteId')::uuid
    AND lower(coalesce(p.status, '')) IN ('ativo', 'active')
    AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids, ARRAY[]::uuid[])) = 0)
      OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[])))) THEN
    RAISE EXCEPTION 'O pagador deve estar ativo e disponível para este polo.' USING ERRCODE = '22023';
  END IF;
  IF p_input ->> 'categoriaFinanceiraId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categorias_financeiras c
    WHERE c.id = (p_input ->> 'categoriaFinanceiraId')::uuid
      AND upper(c.tipo) = 'OUTRO_CREDITO' AND lower(c.status) = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Selecione uma categoria ativa de Outros Créditos.' USING ERRCODE = '22023';
  END IF;
END;
$function$;

CREATE FUNCTION public.preview_outros_creditos_plano_secure(p_polo_id uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_preview jsonb;
BEGIN
  PERFORM internal_finance.authorize_other_credit_plan(p_polo_id);
  v_preview := internal_finance.other_credit_plan_preview(p_input);
  PERFORM internal_finance.validate_other_credit_plan_references(p_polo_id, v_preview -> 'input');
  RETURN v_preview;
END;
$function$;

CREATE FUNCTION public.obter_outros_creditos_plano_secure(p_plano_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_plan public.outros_creditos_planos%ROWTYPE;
  v_rows jsonb;
  v_payer_name text;
BEGIN
  -- No plan contents are returned until both current tab and polo authorization pass.
  IF auth.uid() IS NULL
    OR NOT coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao carnê.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan FROM public.outros_creditos_planos
    WHERE id = p_plano_id AND public.is_financeiro_for_polo(polo_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carnê indisponível neste escopo.' USING ERRCODE = '42501';
  END IF;
  PERFORM internal_finance.authorize_other_credit_plan(v_plan.polo_id, false);
  SELECT nome INTO v_payer_name FROM public.parceiros WHERE id = v_plan.cliente_id;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY
    (c.regra_financeira_outros_creditos_snapshot ->> 'ordem')::integer, c.id), '[]'::jsonb)
    INTO v_rows FROM public.contas_receber c WHERE c.outros_creditos_plano_id = v_plan.id;
  RETURN jsonb_build_object('plano', to_jsonb(v_plan) || jsonb_build_object('cliente_nome', v_payer_name),
    'receivables', v_rows, 'replayed', false);
END;
$function$;

CREATE FUNCTION public.criar_outros_creditos_plano_secure(p_request_id uuid, p_polo_id uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_preview jsonb;
  v_input jsonb;
  v_existing public.outros_creditos_planos%ROWTYPE;
  v_item jsonb;
  v_snapshot jsonb;
  v_response jsonb;
BEGIN
  -- Identity and scope always precede request-id lookup, including replays.
  PERFORM internal_finance.authorize_other_credit_plan(p_polo_id);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.' USING ERRCODE = '22023';
  END IF;
  v_preview := internal_finance.other_credit_plan_preview(p_input);
  v_input := v_preview -> 'input';
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.outros_creditos_planos WHERE id = p_request_id;
  IF FOUND THEN
    IF v_existing.polo_id IS DISTINCT FROM p_polo_id OR v_existing.input IS DISTINCT FROM v_input THEN
      RAISE EXCEPTION 'Esta tentativa pertence a outro carnê. Inicie uma nova tentativa para alterar as condições.'
        USING ERRCODE = '22023';
    END IF;
    v_response := public.obter_outros_creditos_plano_secure(v_existing.id);
    RETURN v_response || jsonb_build_object('replayed', true);
  END IF;
  PERFORM internal_finance.validate_other_credit_plan_references(p_polo_id, v_input);
  INSERT INTO public.outros_creditos_planos(id, polo_id, cliente_id, categoria_financeira_id,
    descricao, input, preview, created_by)
  VALUES (p_request_id, p_polo_id, (v_input ->> 'clienteId')::uuid,
    (v_input ->> 'categoriaFinanceiraId')::uuid, v_input ->> 'descricao', v_input, v_preview, auth.uid());
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_preview -> 'parcelas') LOOP
    v_snapshot := jsonb_build_object('origem', 'OUTROS_CREDITOS_PLANO', 'versao', 1,
      'planoId', p_request_id, 'papel', v_item ->> 'papel', 'numero', (v_item ->> 'numero')::integer,
      'ordem', (v_item ->> 'ordem')::integer, 'quantidadeParcelas', (v_input ->> 'quantidadeParcelas')::integer,
      'financialTerms', v_item -> 'financialTerms');
    INSERT INTO public.contas_receber(id, polo_id, cliente_id, descricao, valor, data_vencimento,
      status, categoria, categoria_financeira_id, tipo_lancamento, parcela_numero, origem_pagamento,
      forma_pagamento, gateway_payment_method,
      outros_creditos_plano_id, outros_creditos_papel, regra_financeira_outros_creditos_snapshot)
    VALUES (pg_catalog.gen_random_uuid(), p_polo_id, (v_input ->> 'clienteId')::uuid,
      (v_input ->> 'descricao') || ' · ' || CASE WHEN v_item ->> 'papel' = 'PARCELA'
        THEN 'Parcela ' || (v_item ->> 'numero') || '/' || (v_input ->> 'quantidadeParcelas')
        WHEN v_item ->> 'papel' = 'MATRICULA' THEN 'Taxa de matrícula' ELSE 'Taxa de rematrícula' END,
      (v_item ->> 'valor')::numeric, (v_item ->> 'dataVencimento')::date,
      'PENDENTE', 'OUTROS_CREDITOS', (v_input ->> 'categoriaFinanceiraId')::uuid,
      'OUTRO_CREDITO', (v_item ->> 'numero')::integer, 'LOCAL', 'BOLETO', 'BOLETO',
      p_request_id, v_item ->> 'papel', v_snapshot);
  END LOOP;
  -- The statement is atomic; existing receivable audit/Realtime triggers handle every title.
  RETURN public.obter_outros_creditos_plano_secure(p_request_id);
END;
$function$;

-- Preserve the existing canonical reader and convenio exclusion, adding only plan metadata.
CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_creditos jsonb;
BEGIN
  v_creditos := public.listar_outros_creditos_sem_convenios_core(p_polo_id);
  RETURN coalesce((
    SELECT jsonb_agg(item || jsonb_build_object(
      'outros_creditos_plano_id', credito.outros_creditos_plano_id,
      'outros_creditos_papel', credito.outros_creditos_papel,
      'regra_financeira_outros_creditos_snapshot', credito.regra_financeira_outros_creditos_snapshot
    ) ORDER BY item ->> 'data_vencimento', item ->> 'created_at', item ->> 'id')
    FROM jsonb_array_elements(v_creditos) item
    JOIN public.contas_receber credito ON credito.id = (item ->> 'id')::uuid
    WHERE NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos convenio_credito
      WHERE convenio_credito.conta_receber_id = credito.id)
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION internal_finance.authorize_other_credit_plan(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal_finance.validate_other_credit_plan_references(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_outros_creditos_plano_secure(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.criar_outros_creditos_plano_secure(uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.obter_outros_creditos_plano_secure(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_outros_creditos_plano_secure(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_outros_creditos_plano_secure(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_outros_creditos_plano_secure(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
