-- Ciclo de vida auditável de empréstimos, baixa em lote e snapshot de
-- exportação. Nenhuma operação apaga crédito, parcelas, baixas ou rateios.
-- Aplicada no ambiente remoto sob a versão 20260811035347.

BEGIN;

CREATE TABLE IF NOT EXISTS public.emprestimos_financeiros_operacoes_requisicoes (
  request_id uuid PRIMARY KEY,
  emprestimo_id uuid NOT NULL
    REFERENCES public.emprestimos_financeiros(id) ON DELETE RESTRICT,
  operacao text NOT NULL CHECK (operacao IN ('BAIXAR_PARCELAS', 'CANCELAR_OU_ESTORNAR')),
  actor_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emprestimos_financeiros_operacoes_requisicoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emprestimos_financeiros_operacoes_requisicoes
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS emprestimos_financeiros_operacoes_emprestimo_idx
  ON public.emprestimos_financeiros_operacoes_requisicoes (emprestimo_id, created_at DESC);

ALTER TABLE public.emprestimos_financeiros
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS estornado_em timestamptz;

-- A leitura permanece uma fonte canônica única para cards, tabela, detalhes
-- e exportação. Metadados de cancelamento são expostos para o histórico, sem
-- expor diretamente as tabelas financeiras protegidas.
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
      -- Os dois totais pertencem ao contrato, não ao React. Em especial,
      -- não derivamos pendente por subtração no cliente: o estado canônico
      -- da parcela determina exatamente o que continua em aberto.
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
            ) ORDER BY polo.nome, rateio.id)
            FROM public.emprestimo_parcela_rateios rateio
            JOIN public.polos polo ON polo.id = rateio.polo_id
            WHERE rateio.emprestimo_parcela_id = parcela.id
          ), '[]'::jsonb)
        ) ORDER BY parcela.numero, parcela.id)
        FROM public.emprestimo_parcelas parcela
        LEFT JOIN public.contas_pagar conta ON conta.emprestimo_parcela_id = parcela.id
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

CREATE OR REPLACE FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  p_emprestimo_id uuid,
  p_emprestimo_parcela_ids uuid[],
  p_polo_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text
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
  v_ids uuid[];
  v_encontradas integer := 0;
  v_parcela_request_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_resultado jsonb;
  v_valor_pago numeric := 0;
  v_forma text;
  v_data date;
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

  v_payload := jsonb_build_object(
    'emprestimoId', p_emprestimo_id,
    'parcelaIds', v_ids,
    'poloId', p_polo_id,
    'contaBancariaId', p_conta_bancaria_id,
    'dataPagamento', v_data,
    'formaPagamento', v_forma
  );
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

  SELECT count(*) INTO v_encontradas
  FROM public.emprestimo_parcelas parcela
  WHERE parcela.emprestimo_id = p_emprestimo_id
    AND parcela.id = ANY(v_ids);
  IF v_encontradas <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Uma ou mais parcelas não pertencem a este empréstimo.';
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

    v_parcela_request_id := (
      substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 1, 8) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 9, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 13, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 17, 4) || '-'
      || substr(pg_catalog.md5(p_request_id::text || ':' || v_parcela.id::text), 21, 12)
    )::uuid;

    INSERT INTO public.emprestimo_parcela_baixas (
      emprestimo_parcela_id, request_id, conta_bancaria_id, data_pagamento, forma_pagamento, created_by
    ) VALUES (
      v_parcela.id, v_parcela_request_id, p_conta_bancaria_id, v_data, v_forma, auth.uid()
    );

    UPDATE public.contas_pagar
    SET status = 'PAGO',
        conta_bancaria_id = p_conta_bancaria_id,
        data_pagamento = v_data,
        valor_pago = valor,
        forma_pagamento = v_forma,
        baixa_request_id = v_parcela_request_id,
        updated_at = now()
    WHERE id = v_conta_pagar.id;

    UPDATE public.emprestimo_parcelas
    SET status = 'PAGO',
        conta_bancaria_id = p_conta_bancaria_id,
        data_pagamento = v_data,
        valor_pago = valor_total,
        forma_pagamento = v_forma,
        baixa_request_id = v_parcela_request_id,
        updated_at = now()
    WHERE id = v_parcela.id;

    UPDATE public.emprestimo_parcela_rateios
    SET status = 'PAGO', updated_at = now()
    WHERE emprestimo_parcela_id = v_parcela.id;

    v_valor_pago := v_valor_pago + v_parcela.valor_total;
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
    'valorPago', round(v_valor_pago, 2),
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

CREATE OR REPLACE FUNCTION public.cancelar_ou_estornar_emprestimo_financeiro_secure(
  p_emprestimo_id uuid,
  p_polo_id uuid,
  p_request_id uuid,
  p_motivo text,
  p_confirmar_estorno boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_emprestimo public.emprestimos_financeiros%ROWTYPE;
  v_replay public.emprestimos_financeiros_operacoes_requisicoes%ROWTYPE;
  v_motivo text;
  v_payload jsonb;
  v_payload_hash text;
  v_tinha_baixa boolean := false;
  v_tinha_credito boolean := false;
  v_resultado jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência do cancelamento é obrigatória.';
  END IF;
  IF p_emprestimo_id IS NULL OR p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Informe o empréstimo e o polo responsável.';
  END IF;

  -- Autoriza por escopo antes de carregar contrato ou eventual replay.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cancelar empréstimo neste polo.'
      USING ERRCODE = '42501';
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'Informe um motivo de pelo menos 3 caracteres para cancelar o empréstimo.';
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

  v_payload := jsonb_build_object(
    'emprestimoId', p_emprestimo_id,
    'poloId', p_polo_id,
    'motivo', v_motivo,
    'confirmarEstorno', coalesce(p_confirmar_estorno, false)
  );
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
       OR v_replay.operacao IS DISTINCT FROM 'CANCELAR_OU_ESTORNAR'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'A chave de idempotência do cancelamento já foi usada com dados diferentes.';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF v_emprestimo.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Este empréstimo já está cancelado.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.emprestimo_parcelas parcela
    WHERE parcela.emprestimo_id = p_emprestimo_id
      AND parcela.status = 'PAGO'
  ) INTO v_tinha_baixa;
  SELECT EXISTS (
    SELECT 1
    FROM public.contas_receber credito
    WHERE credito.id = v_emprestimo.conta_receber_id
      AND credito.status = 'PAGO'
  ) INTO v_tinha_credito;

  -- A criação já registra o crédito como pago. Por isso, cancelar nunca é
  -- apagamento físico: exige a confirmação de que o estorno externo (ou a
  -- inexistência da movimentação externa) foi verificado pelo responsável.
  IF (v_tinha_baixa OR v_tinha_credito) AND coalesce(p_confirmar_estorno, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirme o estorno externo do crédito e das parcelas já baixadas antes de cancelar.';
  END IF;

  -- Títulos já liquidados precisam continuar distinguíveis no histórico:
  -- a obrigação aberta é cancelada; o pagamento que existiu é estornado.
  UPDATE public.contas_pagar conta
  SET status = CASE WHEN conta.status = 'PAGO' THEN 'ESTORNADO' ELSE 'CANCELADO' END,
      updated_at = now()
  WHERE conta.emprestimo_parcela_id IN (
    SELECT parcela.id
    FROM public.emprestimo_parcelas parcela
    WHERE parcela.emprestimo_id = p_emprestimo_id
  )
    AND conta.status NOT IN ('CANCELADO', 'ESTORNADO');

  UPDATE public.emprestimo_parcelas
  SET status = 'CANCELADO', updated_at = now()
  WHERE emprestimo_id = p_emprestimo_id
    AND status <> 'CANCELADO';

  UPDATE public.emprestimo_parcela_rateios rateio
  SET status = 'CANCELADO', updated_at = now()
  WHERE rateio.emprestimo_parcela_id IN (
    SELECT parcela.id
    FROM public.emprestimo_parcelas parcela
    WHERE parcela.emprestimo_id = p_emprestimo_id
  )
    AND rateio.status <> 'CANCELADO';

  UPDATE public.contas_receber credito
  SET status = CASE WHEN credito.status = 'PAGO' THEN 'ESTORNADO' ELSE 'CANCELADO' END,
      updated_at = now()
  WHERE credito.id = v_emprestimo.conta_receber_id;

  UPDATE public.emprestimos_financeiros
  SET status = 'CANCELADO',
      cancelamento_motivo = v_motivo,
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      estornado_em = CASE WHEN v_tinha_baixa OR v_tinha_credito THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_emprestimo_id
  RETURNING jsonb_build_object(
    'emprestimoId', id,
    'status', status,
    'estornado', v_tinha_baixa OR v_tinha_credito,
    'replayed', false
  ) INTO v_resultado;

  INSERT INTO public.emprestimos_financeiros_operacoes_requisicoes (
    request_id, emprestimo_id, operacao, actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, p_emprestimo_id, 'CANCELAR_OU_ESTORNAR', auth.uid(), v_payload_hash, v_resultado
  );

  RETURN v_resultado;
END;
$function$;

-- O snapshot traz filtros, ordenação e identidade institucional do backend.
-- A composição continua vetorial no cliente e reutiliza o mesmo Blob para
-- preview, download e impressão.
CREATE OR REPLACE FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  p_polo_id uuid,
  p_status_scope text DEFAULT 'TODOS'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scope text := upper(btrim(coalesce(p_status_scope, 'TODOS')));
  v_items jsonb := '[]'::jsonb;
  v_polo jsonb;
  v_company jsonb;
BEGIN
  IF p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Informe o polo responsável para exportar empréstimos.';
  END IF;
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao relatório de empréstimos.' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('TODOS', 'ATIVOS', 'FINALIZADOS') THEN
    RAISE EXCEPTION 'Escopo de situação inválido para o relatório de empréstimos.';
  END IF;

  SELECT jsonb_build_object(
    'id', polo.id,
    'nome', polo.nome,
    'nomeFantasia', polo.nome,
    'cnpj', polo.cnpj,
    'cidade', polo.cidade,
    'estado', polo.estado,
    'uf', polo.estado,
    'status', polo.status,
    'is_matriz', polo.is_matriz,
    'logoUrl', coalesce(polo.logo_url, empresa.logo_url),
    'endereco', coalesce(polo.endereco, empresa.endereco),
    'numero', coalesce(polo.numero, empresa.numero),
    'complemento', coalesce(polo.complemento, empresa.complemento),
    'bairro', coalesce(polo.bairro, empresa.bairro),
    'cep', coalesce(polo.cep, empresa.cep),
    'telefone', coalesce(polo.telefone, empresa.telefone),
    'email', coalesce(polo.email, empresa.email),
    'watermark_url', polo.watermark_url,
    'watermark_opacity', polo.watermark_opacity,
    'watermark_scale', polo.watermark_scale,
    'watermark_rotate', polo.watermark_rotate
  ), jsonb_build_object(
    'id', empresa.id,
    'nomeFantasia', empresa.nome_fantasia,
    'razaoSocial', empresa.razao_social,
    'cnpj', empresa.cnpj,
    'endereco', empresa.endereco,
    'numero', empresa.numero,
    'complemento', empresa.complemento,
    'bairro', empresa.bairro,
    'cidade', empresa.cidade,
    'uf', empresa.uf,
    'cep', empresa.cep,
    'telefone', empresa.telefone,
    'email', empresa.email,
    'logoUrl', empresa.logo_url
  )
  INTO v_polo, v_company
  FROM public.polos polo
  JOIN public.empresas empresa ON empresa.id = polo.company_id
  WHERE polo.id = p_polo_id;
  IF v_polo IS NULL THEN
    RAISE EXCEPTION 'Polo responsável não encontrado.';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY ordinalidade), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(public.listar_emprestimos_financeiros_polo_secure(p_polo_id))
    WITH ORDINALITY AS registros(item, ordinalidade)
  WHERE v_scope = 'TODOS'
    OR (v_scope = 'ATIVOS' AND item ->> 'status' = 'ATIVO')
    OR (v_scope = 'FINALIZADOS' AND item ->> 'status' IN ('QUITADO', 'CANCELADO'));

  RETURN jsonb_build_object(
    'issuedAt', now(),
    'statusScope', v_scope,
    'total', jsonb_array_length(v_items),
    'polo', v_polo,
    'company', v_company,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_ou_estornar_emprestimo_financeiro_secure(
  uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_ou_estornar_emprestimo_financeiro_secure(
  uuid, uuid, uuid, text, boolean
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.baixar_emprestimo_parcelas_polo_secure(
  uuid, uuid[], uuid, uuid, uuid, date, text
) IS 'Liquida uma seleção de parcelas do mesmo empréstimo em uma transação idempotente, autorizada e auditável.';
COMMENT ON FUNCTION public.cancelar_ou_estornar_emprestimo_financeiro_secure(
  uuid, uuid, uuid, text, boolean
) IS 'Cancela logicamente um empréstimo e estorna o efeito interno do crédito e das baixas sem apagar a trilha financeira.';
COMMENT ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) IS 'Retorna snapshot canônico, ordenado e autorizado para exportação vetorial de empréstimos.';

COMMIT;
