-- Ajustes de juros, multa e desconto pertencem à baixa, não ao contrato.
-- A obrigação original e os encargos contratuais permanecem imutáveis; esta
-- migration preserva a composição auditável do desembolso efetivo.
-- Aplicada no ambiente remoto sob a versão 20260811042037.

BEGIN;

ALTER TABLE public.emprestimo_parcela_baixas
  ADD COLUMN IF NOT EXISTS valor_base numeric(14, 2),
  ADD COLUMN IF NOT EXISTS juros_valor numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multa_valor numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_valor numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao text;

UPDATE public.emprestimo_parcela_baixas baixa
SET valor_base = round(parcela.valor_total, 2)
FROM public.emprestimo_parcelas parcela
WHERE parcela.id = baixa.emprestimo_parcela_id
  AND baixa.valor_base IS NULL;

ALTER TABLE public.emprestimo_parcela_baixas
  ALTER COLUMN valor_base SET NOT NULL,
  DROP CONSTRAINT IF EXISTS emprestimo_parcela_baixas_valores_validos_chk,
  DROP CONSTRAINT IF EXISTS emprestimo_parcela_baixas_observacao_chk,
  ADD CONSTRAINT emprestimo_parcela_baixas_valores_validos_chk
    CHECK (
      valor_base > 0
      AND juros_valor >= 0
      AND multa_valor >= 0
      AND desconto_valor >= 0
      AND desconto_valor <= valor_base + juros_valor + multa_valor
    ),
  ADD CONSTRAINT emprestimo_parcela_baixas_observacao_chk
    CHECK (observacao IS NULL OR char_length(observacao) <= 1000);

ALTER TABLE public.emprestimo_parcela_baixas
  ADD COLUMN IF NOT EXISTS valor_pago numeric(14, 2)
    GENERATED ALWAYS AS (
      round(valor_base + juros_valor + multa_valor - desconto_valor, 2)
    ) STORED;

-- O rateio conserva o valor programado e recebe somente o efetivo pago.
-- Isso separa a obrigação financeira do desembolso real sem duplicar os
-- componentes de ajuste em uma segunda fonte de verdade.
ALTER TABLE public.emprestimo_parcela_rateios
  ADD COLUMN IF NOT EXISTS valor_pago numeric(14, 2);

UPDATE public.emprestimo_parcela_rateios rateio
SET valor_pago = round(rateio.valor_total, 2)
WHERE rateio.status = 'PAGO'
  AND rateio.valor_pago IS NULL;

ALTER TABLE public.emprestimo_parcela_rateios
  DROP CONSTRAINT IF EXISTS emprestimo_parcela_rateios_valor_pago_chk,
  ADD CONSTRAINT emprestimo_parcela_rateios_valor_pago_chk
    CHECK (
      status <> 'PAGO'
      OR (valor_pago IS NOT NULL AND valor_pago > 0)
    );

-- A assinatura anterior continua semanticamente compatível: os quatro
-- argumentos novos têm default. Remover a assinatura de sete argumentos
-- evita ambiguidade do PostgREST ao resolver uma RPC sobrecarregada.
DROP FUNCTION IF EXISTS public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text
);

CREATE FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  p_emprestimo_id uuid,
  p_emprestimo_parcela_ids uuid[],
  p_polo_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_emprestimo public.emprestimos_financeiros%ROWTYPE;
  v_parcela public.emprestimo_parcelas%ROWTYPE;
  v_conta_pagar public.contas_pagar%ROWTYPE;
  v_replay public.emprestimos_financeiros_operacoes_requisicoes%ROWTYPE;
  v_rateio record;
  v_ids uuid[];
  v_encontradas integer := 0;
  v_parcela_indice integer := 0;
  v_rateio_indice integer := 0;
  v_rateio_total integer := 0;
  v_parcela_request_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_resultado jsonb;
  v_forma text;
  v_data date;
  v_observacao text;
  v_valor_base_total numeric := 0;
  v_juros_total numeric := 0;
  v_multa_total numeric := 0;
  v_desconto_total numeric := 0;
  v_valor_pago_total numeric := 0;
  v_juros_parcela numeric := 0;
  v_multa_parcela numeric := 0;
  v_desconto_parcela numeric := 0;
  v_valor_pago_parcela numeric := 0;
  v_valor_pago_rateio numeric := 0;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa é obrigatória.';
  END IF;
  IF p_emprestimo_id IS NULL OR p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Informe o empréstimo e o polo responsável.';
  END IF;

  -- A autorização antecede qualquer leitura de contrato ou replay.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para baixar empréstimo neste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT parcela_id ORDER BY parcela_id)
  INTO v_ids
  FROM unnest(coalesce(p_emprestimo_parcela_ids, ARRAY[]::uuid[])) AS selecionadas(parcela_id)
  WHERE parcela_id IS NOT NULL;
  IF coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma parcela para a baixa.';
  END IF;

  v_forma := upper(btrim(coalesce(p_forma_pagamento, '')));
  v_data := coalesce(p_data_pagamento, CURRENT_DATE);
  IF p_conta_bancaria_id IS NULL OR v_forma NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
    RAISE EXCEPTION 'Informe a conta do polo responsável e a forma de pagamento.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, p_polo_id) THEN
    RAISE EXCEPTION 'A conta selecionada não está disponível no polo responsável.';
  END IF;

  SELECT count(*), coalesce(sum(parcela.valor_total), 0)
  INTO v_encontradas, v_valor_base_total
  FROM public.emprestimo_parcelas parcela
  WHERE parcela.emprestimo_id = p_emprestimo_id
    AND parcela.id = ANY(v_ids);
  IF v_encontradas <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Uma ou mais parcelas não pertencem a este empréstimo.';
  END IF;
  IF v_valor_base_total <= 0 THEN
    RAISE EXCEPTION 'As parcelas selecionadas não possuem valor liquidável.';
  END IF;

  v_juros_total := round(coalesce(p_juros_valor, 0), 2);
  v_multa_total := round(coalesce(p_multa_valor, 0), 2);
  v_desconto_total := round(coalesce(p_desconto_valor, 0), 2);
  v_observacao := nullif(btrim(coalesce(p_observacao, '')), '');

  IF v_juros_total = 'NaN'::numeric
     OR v_multa_total = 'NaN'::numeric
     OR v_desconto_total = 'NaN'::numeric
     OR v_juros_total < 0
     OR v_multa_total < 0
     OR v_desconto_total < 0
     OR v_desconto_total > v_valor_base_total + v_juros_total + v_multa_total
     OR v_valor_base_total + v_juros_total + v_multa_total - v_desconto_total
        < cardinality(v_ids)::numeric / 100
  THEN
    RAISE EXCEPTION 'Juros, multa ou desconto inválidos para as parcelas selecionadas.';
  END IF;
  IF v_observacao IS NOT NULL AND char_length(v_observacao) > 1000 THEN
    RAISE EXCEPTION 'A observação da baixa deve ter no máximo 1000 caracteres.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros emprestimo
  WHERE emprestimo.id = p_emprestimo_id
    AND emprestimo.polo_matriz_id = p_polo_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empréstimo não encontrado neste polo.';
  END IF;
  IF v_emprestimo.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Um empréstimo cancelado não pode receber baixa.';
  END IF;

  -- O formato sem ajustes mantém o hash de operações antigas, permitindo
  -- replay seguro de uma tentativa iniciada antes desta expansão.
  v_payload := jsonb_build_object(
    'emprestimoId', p_emprestimo_id,
    'parcelaIds', v_ids,
    'poloId', p_polo_id,
    'contaBancariaId', p_conta_bancaria_id,
    'dataPagamento', v_data,
    'formaPagamento', v_forma
  );
  IF v_juros_total <> 0
     OR v_multa_total <> 0
     OR v_desconto_total <> 0
     OR v_observacao IS NOT NULL
  THEN
    v_payload := v_payload || jsonb_build_object(
      'jurosValor', v_juros_total,
      'multaValor', v_multa_total,
      'descontoValor', v_desconto_total,
      'observacao', v_observacao
    );
  END IF;
  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT * INTO v_replay
  FROM public.emprestimos_financeiros_operacoes_requisicoes operacao
  WHERE operacao.request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_replay.emprestimo_id IS DISTINCT FROM p_emprestimo_id
       OR v_replay.operacao IS DISTINCT FROM 'BAIXAR_PARCELAS'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'A chave de idempotência da baixa já foi usada com dados diferentes.';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  FOR v_parcela IN
    SELECT parcela.*
    FROM public.emprestimo_parcelas parcela
    WHERE parcela.emprestimo_id = p_emprestimo_id
      AND parcela.id = ANY(v_ids)
    ORDER BY parcela.numero, parcela.id
    FOR UPDATE
  LOOP
    SELECT * INTO v_conta_pagar
    FROM public.contas_pagar conta
    WHERE conta.emprestimo_parcela_id = v_parcela.id
      AND conta.polo_id = p_polo_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta a pagar da parcela % não encontrada no polo responsável.', v_parcela.numero;
    END IF;
    IF v_parcela.status = 'PAGO' OR v_conta_pagar.status = 'PAGO' THEN
      RAISE EXCEPTION 'A parcela % já foi baixada.', v_parcela.numero;
    END IF;
    IF v_parcela.status = 'CANCELADO' OR v_conta_pagar.status IN ('CANCELADO', 'ESTORNADO') THEN
      RAISE EXCEPTION 'A parcela % está cancelada e não pode receber baixa.', v_parcela.numero;
    END IF;

    v_parcela_indice := v_parcela_indice + 1;
    v_juros_parcela := public.financeiro_dividir_centavos(
      v_juros_total, v_encontradas, v_parcela_indice
    );
    v_multa_parcela := public.financeiro_dividir_centavos(
      v_multa_total, v_encontradas, v_parcela_indice
    );
    v_desconto_parcela := public.financeiro_dividir_centavos(
      v_desconto_total, v_encontradas, v_parcela_indice
    );
    v_valor_pago_parcela := round(
      v_parcela.valor_total + v_juros_parcela + v_multa_parcela - v_desconto_parcela,
      2
    );
    IF v_valor_pago_parcela <= 0 THEN
      RAISE EXCEPTION 'O desconto deixa a parcela % sem valor liquidável.', v_parcela.numero;
    END IF;

    v_parcela_request_id := (
      substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 1, 8) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 9, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 13, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 17, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 21, 12)
    )::uuid;

    INSERT INTO public.emprestimo_parcela_baixas (
      emprestimo_parcela_id,
      request_id,
      conta_bancaria_id,
      data_pagamento,
      forma_pagamento,
      valor_base,
      juros_valor,
      multa_valor,
      desconto_valor,
      observacao,
      created_by
    ) VALUES (
      v_parcela.id,
      v_parcela_request_id,
      p_conta_bancaria_id,
      v_data,
      v_forma,
      v_parcela.valor_total,
      v_juros_parcela,
      v_multa_parcela,
      v_desconto_parcela,
      v_observacao,
      auth.uid()
    );

    UPDATE public.contas_pagar
    SET status = 'PAGO',
        conta_bancaria_id = p_conta_bancaria_id,
        data_pagamento = v_data,
        valor_pago = v_valor_pago_parcela,
        forma_pagamento = v_forma,
        baixa_request_id = v_parcela_request_id,
        updated_at = now()
    WHERE id = v_conta_pagar.id;

    UPDATE public.emprestimo_parcelas
    SET status = 'PAGO',
        conta_bancaria_id = p_conta_bancaria_id,
        data_pagamento = v_data,
        valor_pago = v_valor_pago_parcela,
        forma_pagamento = v_forma,
        baixa_request_id = v_parcela_request_id,
        updated_at = now()
    WHERE id = v_parcela.id;

    SELECT count(*)::integer
    INTO v_rateio_total
    FROM public.emprestimo_parcela_rateios rateio
    WHERE rateio.emprestimo_parcela_id = v_parcela.id;

    v_rateio_indice := 0;
    FOR v_rateio IN
      SELECT rateio.id
      FROM public.emprestimo_parcela_rateios rateio
      WHERE rateio.emprestimo_parcela_id = v_parcela.id
      ORDER BY rateio.polo_id, rateio.id
      FOR UPDATE
    LOOP
      v_rateio_indice := v_rateio_indice + 1;
      v_valor_pago_rateio := public.financeiro_dividir_centavos(
        v_valor_pago_parcela, v_rateio_total, v_rateio_indice
      );
      UPDATE public.emprestimo_parcela_rateios
      SET status = 'PAGO',
          valor_pago = v_valor_pago_rateio,
          updated_at = now()
      WHERE id = v_rateio.id;
    END LOOP;

    v_valor_pago_total := v_valor_pago_total + v_valor_pago_parcela;
  END LOOP;

  UPDATE public.emprestimos_financeiros emprestimo
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.emprestimo_parcelas parcela
          WHERE parcela.emprestimo_id = emprestimo.id
            AND parcela.status <> 'PAGO'
        ) THEN 'QUITADO'
        ELSE 'ATIVO'
      END,
      updated_at = now()
  WHERE emprestimo.id = p_emprestimo_id
  RETURNING jsonb_build_object(
    'emprestimoId', id,
    'status', status,
    'parcelaIds', v_ids,
    'valorBase', round(v_valor_base_total, 2),
    'jurosValor', v_juros_total,
    'multaValor', v_multa_total,
    'descontoValor', v_desconto_total,
    'valorPago', round(v_valor_pago_total, 2),
    'replayed', false
  ) INTO v_resultado;

  INSERT INTO public.emprestimos_financeiros_operacoes_requisicoes (
    request_id, emprestimo_id, operacao, actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, p_emprestimo_id, 'BAIXAR_PARCELAS', auth.uid(), v_payload_hash, v_resultado
  );

  RETURN v_resultado;
END;
$function$;

-- A listagem é a fonte canônica de detalhe e exportação: traz os ajustes
-- auditados da baixa sem recalcular nenhum valor no cliente.
CREATE OR REPLACE FUNCTION public.listar_emprestimos_financeiros_polo_secure(
  p_polo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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
      'credor_parceiro_id', emprestimo.credor_parceiro_id,
      'credor_nome', emprestimo.credor_nome,
      'descricao', emprestimo.descricao,
      'valor_liberado', emprestimo.valor_liberado,
      'valor_total_divida', emprestimo.valor_total_divida,
      'valor_encargos', emprestimo.valor_encargos,
      'valor_pago', totais.valor_pago,
      'valor_pendente', totais.valor_pendente,
      'data_liberacao', emprestimo.data_liberacao,
      'conta_credito', jsonb_build_object(
        'id', conta_credito.id,
        'banco', conta_credito.banco,
        'titular', conta_credito.titular,
        'agencia', conta_credito.agencia,
        'conta', conta_credito.conta,
        'natureza', conta_credito.natureza
      ),
      'total_parcelas', emprestimo.total_parcelas,
      'status', emprestimo.status,
      'observacao', emprestimo.observacao,
      'cancelamento_motivo', emprestimo.cancelamento_motivo,
      'cancelado_em', emprestimo.cancelado_em,
      'estornado_em', emprestimo.estornado_em,
      'possui_baixa', EXISTS (
        SELECT 1
        FROM public.emprestimo_parcelas parcela_baixa
        WHERE parcela_baixa.emprestimo_id = emprestimo.id
          AND parcela_baixa.status = 'PAGO'
      ),
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
          'juros_valor', coalesce(baixa.juros_valor, 0),
          'multa_valor', coalesce(baixa.multa_valor, 0),
          'desconto_valor', coalesce(baixa.desconto_valor, 0),
          'observacao_baixa', baixa.observacao,
          'conta_pagar_id', conta.id,
          'rateios', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', rateio.id,
              'polo_id', rateio.polo_id,
              'polo_nome', polo.nome,
              'valor_principal', rateio.valor_principal,
              'valor_encargos', rateio.valor_encargos,
              'valor_total', rateio.valor_total,
              'valor_pago', rateio.valor_pago,
              'status', rateio.status
            ) ORDER BY polo.nome, rateio.id)
            FROM public.emprestimo_parcela_rateios rateio
            JOIN public.polos polo ON polo.id = rateio.polo_id
            WHERE rateio.emprestimo_parcela_id = parcela.id
          ), '[]'::jsonb)
        ) ORDER BY parcela.numero, parcela.id)
        FROM public.emprestimo_parcelas parcela
        LEFT JOIN public.contas_pagar conta ON conta.emprestimo_parcela_id = parcela.id
        LEFT JOIN public.emprestimo_parcela_baixas baixa
          ON baixa.emprestimo_parcela_id = parcela.id
        WHERE parcela.emprestimo_id = emprestimo.id
      ), '[]'::jsonb)
    ) ORDER BY emprestimo.data_liberacao DESC, emprestimo.id DESC)
    FROM public.emprestimos_financeiros emprestimo
    JOIN public.polos polo_responsavel ON polo_responsavel.id = emprestimo.polo_matriz_id
    LEFT JOIN public.contas_bancarias conta_credito ON conta_credito.id = emprestimo.conta_credito_id
    LEFT JOIN LATERAL (
      SELECT
        coalesce(sum(parcela_totais.valor_pago) FILTER (
          WHERE parcela_totais.status = 'PAGO'
        ), 0) AS valor_pago,
        coalesce(sum(parcela_totais.valor_total) FILTER (
          WHERE parcela_totais.status IN ('PENDENTE', 'VENCIDO')
        ), 0) AS valor_pendente
      FROM public.emprestimo_parcelas parcela_totais
      WHERE parcela_totais.emprestimo_id = emprestimo.id
    ) totais ON true
    WHERE emprestimo.polo_matriz_id = p_polo_id
  ), '[]'::jsonb);
END;
$function$;

-- O resumo de Caixa passa a distinguir a obrigação programada do valor
-- efetivamente pago, sem misturar financiamento ao resultado operacional.
CREATE OR REPLACE FUNCTION public.get_caixa_financiamento_resumo_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month')::date;
  v_fechamento date := (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month - 1 day')::date;
  v_credito numeric := 0;
  v_obrigacao numeric := 0;
  v_pago_rateado numeric := 0;
  v_principal numeric := 0;
  v_encargos numeric := 0;
  v_ajustes_baixa_rateados numeric := 0;
  v_saldo_emprestimos_a_pagar numeric := 0;
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
      rateio.status,
      CASE
        WHEN rateio.status = 'PAGO'
          THEN coalesce(rateio.valor_pago, rateio.valor_total)
        ELSE NULL
      END AS valor_pago
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
      parcela.status,
      CASE
        WHEN parcela.status = 'PAGO'
          THEN coalesce(parcela.valor_pago, parcela.valor_total)
        ELSE NULL
      END AS valor_pago
    FROM public.emprestimo_parcelas parcela
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    WHERE emprestimo.rateio_modo = 'SEM_RATEIO'
      AND parcela.data_vencimento >= v_inicio
      AND parcela.data_vencimento < v_fim
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
  )
  SELECT
    coalesce(sum(valor_total), 0),
    coalesce(sum(valor_pago) FILTER (WHERE status = 'PAGO'), 0),
    coalesce(sum(valor_principal), 0),
    coalesce(sum(valor_encargos), 0),
    coalesce(sum(valor_pago - valor_total) FILTER (WHERE status = 'PAGO'), 0)
  INTO v_obrigacao, v_pago_rateado, v_principal, v_encargos, v_ajustes_baixa_rateados
  FROM valores_financiamento;

  WITH saldo_devedor AS (
    SELECT rateio.valor_total
    FROM public.emprestimo_parcela_rateios rateio
    JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    WHERE emprestimo.rateio_modo IN ('TODOS', 'SELECIONADOS')
      AND emprestimo.data_liberacao <= v_fechamento
      AND emprestimo.status <> 'CANCELADO'
      AND parcela.status <> 'CANCELADO'
      AND rateio.status <> 'CANCELADO'
      AND (parcela.data_pagamento IS NULL OR parcela.data_pagamento > v_fechamento)
      AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id)

    UNION ALL

    SELECT parcela.valor_total
    FROM public.emprestimo_parcelas parcela
    JOIN public.emprestimos_financeiros emprestimo ON emprestimo.id = parcela.emprestimo_id
    WHERE emprestimo.rateio_modo = 'SEM_RATEIO'
      AND emprestimo.data_liberacao <= v_fechamento
      AND emprestimo.status <> 'CANCELADO'
      AND parcela.status <> 'CANCELADO'
      AND (parcela.data_pagamento IS NULL OR parcela.data_pagamento > v_fechamento)
      AND (p_polo_id IS NULL OR emprestimo.polo_matriz_id = p_polo_id)
  )
  SELECT coalesce(sum(valor_total), 0)
  INTO v_saldo_emprestimos_a_pagar
  FROM saldo_devedor;

  RETURN jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'credito_liberado_matriz', v_credito,
    'obrigacao_rateada', v_obrigacao,
    'principal_rateado', v_principal,
    'encargos_rateados', v_encargos,
    'ajustes_baixa_rateados', v_ajustes_baixa_rateados,
    'pago_rateado', v_pago_rateado,
    'saldo_emprestimos_a_pagar', round(v_saldo_emprestimos_a_pagar, 2)::text,
    'observacao', 'Crédito, principal e encargos de empréstimo são financiamento, não receita ou despesa operacional. O valor pago pode conter juros, multa ou desconto registrados na baixa; o saldo de empréstimos a pagar permanece contratual.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text, numeric, numeric, numeric, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcela_polo_secure(
  uuid, uuid, uuid, uuid, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text, numeric, numeric, numeric, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text, numeric, numeric, numeric, text
) IS 'Liquida parcelas selecionadas com juros, multa, desconto e observação auditáveis; calcula, distribui centavos e atualiza o valor efetivamente pago no backend.';

COMMIT;
