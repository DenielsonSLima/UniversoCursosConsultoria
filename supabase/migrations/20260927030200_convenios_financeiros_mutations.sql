BEGIN;

CREATE FUNCTION public.criar_convenio_financeiro_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_parceiro_id uuid,
  p_nome text,
  p_competencia date,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_convenio_id uuid;
  v_mes_id uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_payload jsonb;
  v_hash text;
  v_replay public.convenios_financeiros_operacoes_requisicoes%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF p_request_id IS NULL OR p_polo_id IS NULL OR p_competencia IS NULL OR v_nome IS NULL THEN
    RAISE EXCEPTION 'Requisição, polo, nome e competência são obrigatórios.';
  END IF;
  IF auth.role() <> 'service_role' AND NOT (
    public.is_financeiro_for_polo(p_polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para criar convênio neste polo.' USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Polo ativo não encontrado.'; END IF;
  IF p_parceiro_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.parceiros parceiro WHERE parceiro.id = p_parceiro_id
  ) THEN
    RAISE EXCEPTION 'Parceiro não encontrado.';
  END IF;
  IF auth.role() <> 'service_role' AND p_parceiro_id IS NOT NULL
     AND NOT public.is_parceiro_in_financeiro_scope(p_parceiro_id, p_polo_id) THEN
    RAISE EXCEPTION 'Parceiro fora do escopo financeiro do polo.' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'poloId', p_polo_id, 'parceiroId', p_parceiro_id, 'nome', v_nome,
    'competencia', v_competencia,
    'observacao', nullif(btrim(coalesce(p_observacao, '')), '')
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_replay
  FROM public.convenios_financeiros_operacoes_requisicoes
  WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_replay.operacao <> 'CRIAR_CONVENIO'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_set(v_replay.resultado, '{replayed}', 'true'::jsonb, true);
  END IF;

  INSERT INTO public.convenios_financeiros (
    company_id, polo_id, parceiro_id, nome, observacao, request_id, created_by
  ) VALUES (
    v_company_id, p_polo_id, p_parceiro_id, v_nome,
    nullif(btrim(coalesce(p_observacao, '')), ''), p_request_id, auth.uid()
  ) RETURNING id INTO v_convenio_id;

  INSERT INTO public.convenios_financeiros_competencias (
    convenio_id, company_id, polo_id, competencia, saldo_inicial,
    observacao, created_by
  ) VALUES (
    v_convenio_id, v_company_id, p_polo_id, v_competencia, 0,
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  ) RETURNING id INTO v_mes_id;

  v_resultado := jsonb_build_object(
    'replayed', false,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes_id)
  );
  INSERT INTO public.convenios_financeiros_operacoes_requisicoes (
    request_id, convenio_id, competencia_id, operacao, actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, v_convenio_id, v_mes_id, 'CRIAR_CONVENIO', auth.uid(), v_hash, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

CREATE FUNCTION public.convenios_financeiros_proteger_credito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.convenios_financeiros_creditos credito
    WHERE credito.conta_receber_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Crédito vinculado a convênio é imutável; registre um ajuste auditável.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER convenios_financeiros_credito_update_guard
BEFORE UPDATE OR DELETE ON public.contas_receber
FOR EACH ROW EXECUTE FUNCTION public.convenios_financeiros_proteger_credito();

CREATE FUNCTION public.lancar_credito_convenio_financeiro_secure(
  p_request_id uuid,
  p_competencia_id uuid,
  p_conta_bancaria_id uuid,
  p_data_credito date,
  p_valor numeric,
  p_forma_recebimento text,
  p_descricao text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mes public.convenios_financeiros_competencias%ROWTYPE;
  v_credito_id uuid;
  v_conta_receber_id uuid;
  v_valor numeric(15, 2) := round(p_valor, 2);
  v_forma text := upper(btrim(coalesce(p_forma_recebimento, '')));
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_payload jsonb;
  v_hash text;
  v_replay public.convenios_financeiros_operacoes_requisicoes%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF p_request_id IS NULL OR p_competencia_id IS NULL THEN
    RAISE EXCEPTION 'Requisição e mês do convênio são obrigatórios.';
  END IF;
  SELECT * INTO v_mes FROM public.convenios_financeiros_competencias
  WHERE id = p_competencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mês do convênio não encontrado.'; END IF;
  IF auth.role() <> 'service_role' AND NOT (
    public.is_financeiro_for_polo(v_mes.polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para lançar crédito neste convênio.' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'competenciaId', p_competencia_id, 'contaBancariaId', p_conta_bancaria_id,
    'dataCredito', p_data_credito, 'valor', v_valor, 'formaRecebimento', v_forma,
    'descricao', v_descricao, 'observacao', nullif(btrim(coalesce(p_observacao, '')), '')
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_replay FROM public.convenios_financeiros_operacoes_requisicoes
  WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_replay.competencia_id IS DISTINCT FROM p_competencia_id
       OR v_replay.operacao <> 'LANCAR_CREDITO'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'A chave de idempotência do crédito já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_set(v_replay.resultado, '{replayed}', 'true'::jsonb, true);
  END IF;

  IF v_mes.status <> 'ABERTO' THEN RAISE EXCEPTION 'O mês do convênio está finalizado.'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 OR p_data_credito IS NULL OR v_descricao IS NULL THEN
    RAISE EXCEPTION 'Data, descrição e valor positivo são obrigatórios.';
  END IF;
  IF p_data_credito < v_mes.competencia
     OR p_data_credito >= (v_mes.competencia + interval '1 month')::date THEN
    RAISE EXCEPTION 'A data do crédito deve pertencer à competência do convênio.';
  END IF;
  IF v_forma NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
    RAISE EXCEPTION 'Forma de recebimento inválida.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, v_mes.polo_id) THEN
    RAISE EXCEPTION 'A conta não está ativa ou disponível neste polo.';
  END IF;

  INSERT INTO public.contas_receber (
    polo_id, descricao, valor, data_vencimento, data_pagamento, valor_pago,
    status, forma_pagamento, conta_bancaria_id, categoria
  ) VALUES (
    v_mes.polo_id, 'Crédito de convênio: ' || v_descricao, v_valor,
    p_data_credito, p_data_credito, v_valor, 'PAGO', v_forma,
    p_conta_bancaria_id, 'OUTROS_CREDITOS'
  ) RETURNING id INTO v_conta_receber_id;

  INSERT INTO public.convenios_financeiros_creditos (
    competencia_id, convenio_id, company_id, polo_id, conta_receber_id,
    conta_bancaria_id, data_credito, valor, forma_recebimento, descricao,
    observacao, created_by
  ) VALUES (
    v_mes.id, v_mes.convenio_id, v_mes.company_id, v_mes.polo_id, v_conta_receber_id,
    p_conta_bancaria_id, p_data_credito, v_valor, v_forma, v_descricao,
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  ) RETURNING id INTO v_credito_id;

  v_resultado := jsonb_build_object(
    'replayed', false,
    'credito_id', v_credito_id,
    'conta_receber_id', v_conta_receber_id,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes.id)
  );
  INSERT INTO public.convenios_financeiros_operacoes_requisicoes (
    request_id, convenio_id, competencia_id, operacao, actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, v_mes.convenio_id, v_mes.id, 'LANCAR_CREDITO', auth.uid(), v_hash, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_convenio_financeiro_secure(
  uuid, uuid, uuid, text, date, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lancar_credito_convenio_financeiro_secure(
  uuid, uuid, uuid, date, numeric, text, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convenios_financeiros_proteger_credito()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_convenio_financeiro_secure(
  uuid, uuid, uuid, text, date, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lancar_credito_convenio_financeiro_secure(
  uuid, uuid, uuid, date, numeric, text, text, text
) TO authenticated, service_role;

COMMIT;
