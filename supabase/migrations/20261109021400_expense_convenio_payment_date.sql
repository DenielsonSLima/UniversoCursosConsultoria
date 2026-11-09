-- Sobrecarga com data obrigatória: chamadas anteriores preservam o contrato existente.
BEGIN;

CREATE OR REPLACE FUNCTION public.criar_despesa_convenio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_convenio_mes_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor_base numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_data_pagamento date,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL::uuid,
  p_fornecedor_id uuid DEFAULT NULL::uuid,
  p_observacao text DEFAULT NULL::text,
  p_turma_id uuid DEFAULT NULL::uuid,
  p_total_parcelas integer DEFAULT 1,
  p_intervalo_quantidade integer DEFAULT 1,
  p_intervalo_unidade text DEFAULT 'MESES'::text,
  p_baixa_imediata boolean DEFAULT false,
  p_forma_pagamento text DEFAULT NULL::text,
  p_conta_bancaria_id uuid DEFAULT NULL::uuid,
  p_anexo_bucket text DEFAULT NULL::text,
  p_anexo_path text DEFAULT NULL::text,
  p_anexo_nome text DEFAULT NULL::text,
  p_anexo_mime text DEFAULT NULL::text,
  p_anexo_tamanho bigint DEFAULT NULL::bigint
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_mes public.convenios_financeiros_competencias%ROWTYPE;
  v_despesa public.despesas_lancamentos%ROWTYPE;
  v_valor numeric(15, 2) := round(
    p_valor_base + coalesce(p_juros_valor, 0) + coalesce(p_multa_valor, 0)
      - coalesce(p_desconto_valor, 0), 2
  );
  v_saldo numeric(15, 2);
  v_payload jsonb;
  v_hash text;
  v_replay public.convenios_financeiros_operacoes_requisicoes%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_convenio_mes_id IS NULL THEN
    RAISE EXCEPTION 'Requisição e mês do convênio são obrigatórios.';
  END IF;
  SELECT * INTO v_mes FROM public.convenios_financeiros_competencias
  WHERE id = p_convenio_mes_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mês do convênio não encontrado.'; END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT coalesce((
    public.is_financeiro_for_polo(v_mes.polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado para usar este convênio.' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'poloId', p_polo_id, 'convenioMesId', p_convenio_mes_id,
    'tipo', p_tipo, 'descricao', nullif(btrim(coalesce(p_descricao, '')), ''),
    'valorBase', round(p_valor_base, 2), 'dataLancamento', p_data_lancamento,
    'dataVencimento', p_data_vencimento, 'dataPagamento', p_data_pagamento, 'jurosValor', round(coalesce(p_juros_valor, 0), 2),
    'multaValor', round(coalesce(p_multa_valor, 0), 2),
    'descontoValor', round(coalesce(p_desconto_valor, 0), 2),
    'categoriaFinanceiraId', p_categoria_financeira_id, 'fornecedorId', p_fornecedor_id,
    'observacao', nullif(btrim(coalesce(p_observacao, '')), ''), 'turmaId', p_turma_id,
    'baixaImediata', coalesce(p_baixa_imediata, false),
    'formaPagamento', nullif(upper(btrim(coalesce(p_forma_pagamento, ''))), ''),
    'contaBancariaId', p_conta_bancaria_id, 'anexoBucket', p_anexo_bucket,
    'anexoPath', p_anexo_path, 'anexoNome', p_anexo_nome,
    'anexoMime', p_anexo_mime, 'anexoTamanho', p_anexo_tamanho
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_replay FROM public.convenios_financeiros_operacoes_requisicoes
  WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_replay.competencia_id IS DISTINCT FROM p_convenio_mes_id
       OR v_replay.operacao <> 'CRIAR_DESPESA'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'A chave de idempotência da despesa já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_set(v_replay.resultado, '{replayed}', 'true'::jsonb, true);
  END IF;

  IF v_mes.status <> 'ABERTO' THEN RAISE EXCEPTION 'O mês do convênio está finalizado.'; END IF;
  IF p_polo_id IS DISTINCT FROM v_mes.polo_id THEN
    RAISE EXCEPTION 'A despesa e o convênio precisam pertencer ao mesmo polo.';
  END IF;
  IF coalesce(p_total_parcelas, 1) <> 1 THEN
    RAISE EXCEPTION 'Despesa de convênio não pode ser parcelada no MVP.';
  END IF;
  IF p_data_lancamento < v_mes.competencia
     OR p_data_lancamento >= (v_mes.competencia + interval '1 month')::date THEN
    RAISE EXCEPTION 'A data de lançamento deve pertencer à competência do convênio.';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor da despesa inválido.'; END IF;

  SELECT (public.convenios_financeiros_mes_item_secure(v_mes.id) ->> 'saldo_projetado')::numeric
  INTO v_saldo;
  IF v_saldo < v_valor THEN RAISE EXCEPTION 'Saldo insuficiente no convênio.'; END IF;

  SELECT criada.* INTO v_despesa
  FROM public.criar_despesa_secure(
    p_request_id, p_polo_id, p_tipo, p_descricao, p_valor_base,
    p_data_lancamento, p_data_vencimento, p_data_pagamento, p_juros_valor, p_multa_valor,
    p_desconto_valor, p_categoria_financeira_id, p_fornecedor_id,
    p_observacao, p_turma_id, 1, p_intervalo_quantidade,
    p_intervalo_unidade, p_baixa_imediata, p_forma_pagamento,
    p_conta_bancaria_id, p_anexo_bucket, p_anexo_path, p_anexo_nome,
    p_anexo_mime, p_anexo_tamanho
  ) criada
  LIMIT 1;
  IF v_despesa.id IS NULL THEN RAISE EXCEPTION 'A despesa não foi criada.'; END IF;

  INSERT INTO public.convenios_financeiros_despesas (
    competencia_id, convenio_id, company_id, polo_id,
    despesa_lancamento_id, valor_vinculado, created_by
  ) VALUES (
    v_mes.id, v_mes.convenio_id, v_mes.company_id, v_mes.polo_id,
    v_despesa.id, v_valor, auth.uid()
  );

  v_resultado := jsonb_build_object(
    'replayed', false, 'despesa_id', v_despesa.id,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes.id)
  );
  INSERT INTO public.convenios_financeiros_operacoes_requisicoes (
    request_id, convenio_id, competencia_id, operacao, actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, v_mes.convenio_id, v_mes.id, 'CRIAR_DESPESA', auth.uid(), v_hash, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_despesa_convenio_secure(uuid, uuid, uuid, text, text, numeric, date, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, boolean, text, uuid, text, text, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_convenio_secure(uuid, uuid, uuid, text, text, numeric, date, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, boolean, text, uuid, text, text, text, text, bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

