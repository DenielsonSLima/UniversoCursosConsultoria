-- Corrige o ciclo de vida de Contas a Pagar sem apagar histórico financeiro.
-- Edição é permitida somente antes da baixa; uma baixa já feita exige estorno
-- auditável, que preserva a conta, o valor, a data e a forma originais.

CREATE TABLE IF NOT EXISTS public.despesas_operacoes_requisicoes (
  request_id uuid PRIMARY KEY,
  despesa_lancamento_id uuid NOT NULL
    REFERENCES public.despesas_lancamentos(id) ON DELETE RESTRICT,
  operacao text NOT NULL CHECK (operacao IN ('ATUALIZAR', 'CANCELAR_OU_ESTORNAR')),
  actor_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.despesas_operacoes_requisicoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.despesas_operacoes_requisicoes
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS despesas_operacoes_requisicoes_despesa_idx
  ON public.despesas_operacoes_requisicoes (despesa_lancamento_id, created_at DESC);

ALTER TABLE public.despesas_lancamentos
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS estornado_em timestamptz;

CREATE OR REPLACE FUNCTION public.atualizar_despesa_secure(
  p_despesa_id uuid,
  p_request_id uuid,
  p_descricao text,
  p_valor_base numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_juros_valor numeric DEFAULT 0,
  p_multa_valor numeric DEFAULT 0,
  p_desconto_valor numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL
)
RETURNS public.despesas_lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_despesa public.despesas_lancamentos%ROWTYPE;
  v_replay public.despesas_operacoes_requisicoes%ROWTYPE;
  v_payload jsonb;
  v_payload_hash text;
  v_descricao text;
  v_status text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da edição é obrigatória.';
  END IF;

  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;

  -- Autoriza antes de consultar qualquer replay da requisição.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(v_despesa.polo_id)
       AND CASE
         WHEN v_despesa.tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para editar esta despesa.'
      USING ERRCODE = '42501';
  END IF;

  v_descricao := nullif(btrim(coalesce(p_descricao, '')), '');
  IF v_descricao IS NULL
     OR p_valor_base IS NULL
     OR p_valor_base <= 0
     OR p_data_lancamento IS NULL
     OR p_data_vencimento IS NULL
     OR coalesce(p_juros_valor, 0) < 0
     OR coalesce(p_multa_valor, 0) < 0
     OR coalesce(p_desconto_valor, 0) < 0
     OR coalesce(p_desconto_valor, 0) > p_valor_base + coalesce(p_juros_valor, 0) + coalesce(p_multa_valor, 0)
  THEN
    RAISE EXCEPTION 'Dados inválidos para editar a conta a pagar.';
  END IF;

  -- Parcelas preservam a identificação visual; a edição atua só nesta linha.
  IF v_despesa.total_parcelas > 1 THEN
    v_descricao := regexp_replace(v_descricao, ' \([0-9]+/[0-9]+\)$', '')
      || ' (' || v_despesa.parcela_numero || '/' || v_despesa.total_parcelas || ')';
  END IF;

  v_payload := jsonb_build_object(
    'despesaId', p_despesa_id,
    'descricao', v_descricao,
    'valorBase', round(p_valor_base, 2),
    'dataLancamento', p_data_lancamento,
    'dataVencimento', p_data_vencimento,
    'jurosValor', round(coalesce(p_juros_valor, 0), 2),
    'multaValor', round(coalesce(p_multa_valor, 0), 2),
    'descontoValor', round(coalesce(p_desconto_valor, 0), 2),
    'categoriaFinanceiraId', p_categoria_financeira_id,
    'fornecedorId', p_fornecedor_id,
    'observacao', nullif(btrim(coalesce(p_observacao, '')), ''),
    'turmaId', p_turma_id
  );
  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT *
  INTO v_replay
  FROM public.despesas_operacoes_requisicoes
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_replay.despesa_lancamento_id IS DISTINCT FROM p_despesa_id
       OR v_replay.operacao IS DISTINCT FROM 'ATUALIZAR'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'A chave de idempotência da edição já foi usada com dados diferentes.';
    END IF;
    RETURN v_despesa;
  END IF;

  IF v_despesa.status NOT IN ('PENDENTE', 'VENCIDO') THEN
    RAISE EXCEPTION 'Uma despesa paga ou cancelada não pode ser editada. Use o estorno quando necessário.';
  END IF;

  IF p_categoria_financeira_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.categorias_financeiras categoria
       WHERE categoria.id = p_categoria_financeira_id
         AND categoria.tipo = v_despesa.tipo
         AND categoria.status = 'ativo'
     ) THEN
    RAISE EXCEPTION 'A categoria precisa estar ativa e ser compatível com este tipo de despesa.';
  END IF;

  IF p_fornecedor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.parceiros parceiro
       WHERE parceiro.id = p_fornecedor_id
         AND parceiro.status = 'ATIVO'
         AND parceiro.tipo IN ('Aluno', 'Professor', 'PJ', 'PF')
         AND (
           (parceiro.polo_id IS NULL AND coalesce(cardinality(parceiro.polo_ids), 0) = 0)
           OR parceiro.polo_id = v_despesa.polo_id
           OR parceiro.polo_ids @> ARRAY[v_despesa.polo_id]::uuid[]
         )
     ) THEN
    RAISE EXCEPTION 'O fornecedor precisa estar ativo e disponível para este polo.';
  END IF;

  IF p_turma_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.turmas turma
       WHERE turma.id = p_turma_id
         AND turma.polo_id = v_despesa.polo_id
     ) THEN
    RAISE EXCEPTION 'A turma informada não pertence a este polo.';
  END IF;

  v_status := CASE
    WHEN p_data_vencimento < CURRENT_DATE THEN 'VENCIDO'
    ELSE 'PENDENTE'
  END;

  UPDATE public.despesas_lancamentos
  SET descricao = v_descricao,
      valor_base = round(p_valor_base, 2),
      juros_valor = round(coalesce(p_juros_valor, 0), 2),
      multa_valor = round(coalesce(p_multa_valor, 0), 2),
      desconto_valor = round(coalesce(p_desconto_valor, 0), 2),
      data_lancamento = p_data_lancamento,
      data_vencimento = p_data_vencimento,
      categoria_financeira_id = p_categoria_financeira_id,
      fornecedor_id = p_fornecedor_id,
      observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
      turma_id = p_turma_id,
      status = v_status,
      updated_at = now()
  WHERE id = v_despesa.id
  RETURNING * INTO v_despesa;

  INSERT INTO public.despesas_operacoes_requisicoes (
    request_id,
    despesa_lancamento_id,
    operacao,
    actor_id,
    payload_hash,
    resultado
  ) VALUES (
    p_request_id,
    v_despesa.id,
    'ATUALIZAR',
    auth.uid(),
    v_payload_hash,
    jsonb_build_object('despesaId', v_despesa.id, 'status', v_despesa.status)
  );

  RETURN v_despesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_ou_estornar_despesa_secure(
  p_despesa_id uuid,
  p_request_id uuid,
  p_motivo text,
  p_confirmar_estorno boolean DEFAULT false
)
RETURNS public.despesas_lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_despesa public.despesas_lancamentos%ROWTYPE;
  v_replay public.despesas_operacoes_requisicoes%ROWTYPE;
  v_payload jsonb;
  v_payload_hash text;
  v_motivo text;
  v_era_pago boolean;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência do cancelamento é obrigatória.';
  END IF;

  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;

  -- Autoriza antes de consultar qualquer replay da requisição.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(v_despesa.polo_id)
       AND CASE
         WHEN v_despesa.tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cancelar esta despesa.'
      USING ERRCODE = '42501';
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'Informe um motivo de pelo menos 3 caracteres para o cancelamento.';
  END IF;

  v_payload := jsonb_build_object(
    'despesaId', p_despesa_id,
    'motivo', v_motivo,
    'confirmarEstorno', coalesce(p_confirmar_estorno, false)
  );
  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT *
  INTO v_replay
  FROM public.despesas_operacoes_requisicoes
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_replay.despesa_lancamento_id IS DISTINCT FROM p_despesa_id
       OR v_replay.operacao IS DISTINCT FROM 'CANCELAR_OU_ESTORNAR'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'A chave de idempotência do cancelamento já foi usada com dados diferentes.';
    END IF;
    RETURN v_despesa;
  END IF;

  IF v_despesa.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Esta despesa já está cancelada.';
  END IF;
  IF v_despesa.status NOT IN ('PENDENTE', 'VENCIDO', 'PAGO') THEN
    RAISE EXCEPTION 'O status atual desta despesa não permite cancelamento.';
  END IF;

  v_era_pago := v_despesa.status = 'PAGO';
  IF v_era_pago AND coalesce(p_confirmar_estorno, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirme o estorno da baixa antes de cancelar uma despesa paga.';
  END IF;

  -- Os dados da baixa permanecem na linha para auditoria. Os saldos, o Caixa
  -- e os resumos consideram somente status PAGO, portanto a mudança abaixo
  -- reverte o efeito interno da baixa na mesma transação.
  UPDATE public.despesas_lancamentos
  SET status = 'CANCELADO',
      cancelamento_motivo = v_motivo,
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      estornado_em = CASE WHEN v_era_pago THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = v_despesa.id
  RETURNING * INTO v_despesa;

  INSERT INTO public.despesas_operacoes_requisicoes (
    request_id,
    despesa_lancamento_id,
    operacao,
    actor_id,
    payload_hash,
    resultado
  ) VALUES (
    p_request_id,
    v_despesa.id,
    'CANCELAR_OU_ESTORNAR',
    auth.uid(),
    v_payload_hash,
    jsonb_build_object(
      'despesaId', v_despesa.id,
      'status', v_despesa.status,
      'estornado', v_era_pago
    )
  );

  RETURN v_despesa;
END;
$function$;

-- Leitura detalhada compatível: mantém a RPC econômica existente como fonte
-- de escopo/rateio e acrescenta a data real de lançamento e os metadados de
-- correção. A conta física da Matriz não é exposta em linhas econômicas de
-- rateio de outro polo.
CREATE OR REPLACE FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  despesa_lancamento_id uuid,
  polo_id uuid,
  polo_nome text,
  tipo text,
  descricao text,
  valor_base numeric,
  juros_valor numeric,
  multa_valor numeric,
  desconto_valor numeric,
  valor numeric,
  data_lancamento date,
  data_vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text,
  categoria_financeira_id uuid,
  categoria_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  forma_pagamento text,
  conta_bancaria_id uuid,
  conta_bancaria_nome text,
  parcela_numero integer,
  total_parcelas integer,
  grupo_parcelas_id uuid,
  observacao text,
  turma_id uuid,
  turma_nome text,
  anexo_bucket text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  cancelamento_motivo text,
  cancelado_em timestamptz,
  estornado_em timestamptz,
  created_at timestamptz,
  is_rateio_derivado boolean,
  rateio_modo text,
  rateio_polos_quantidade integer,
  polo_matriz_id uuid,
  polo_matriz_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_status_scope text := lower(btrim(coalesce(p_status_scope, 'todos')));
BEGIN
  IF v_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR v_status_scope NOT IN ('todos', 'mes_atual', 'em_aberto') THEN
    RAISE EXCEPTION 'Filtros inválidos para contas a pagar.' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       p_polo_id IS NOT NULL
       AND public.is_financeiro_for_polo(p_polo_id)
       AND CASE
         WHEN v_tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso às contas a pagar fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    item.id,
    item.despesa_lancamento_id,
    item.polo_id,
    item.polo_nome,
    item.tipo,
    item.descricao,
    item.valor_base,
    item.juros_valor,
    item.multa_valor,
    item.desconto_valor,
    item.valor,
    despesa.data_lancamento,
    item.data_vencimento,
    item.data_pagamento,
    item.valor_pago,
    item.status,
    item.categoria_financeira_id,
    item.categoria_nome,
    item.fornecedor_id,
    item.fornecedor_nome,
    item.forma_pagamento,
    item.conta_bancaria_id,
    CASE
      WHEN item.is_rateio_derivado OR conta.id IS NULL THEN NULL
      WHEN conta.natureza = 'CAIXA_INTERNO'
        THEN concat_ws(' • ', conta.banco, conta.conta)
      ELSE concat_ws(
        ' • ',
        conta.banco,
        CASE WHEN nullif(btrim(coalesce(conta.agencia, '')), '') IS NULL THEN NULL ELSE 'Ag. ' || conta.agencia END,
        CASE WHEN nullif(btrim(coalesce(conta.conta, '')), '') IS NULL THEN NULL ELSE 'Conta ' || conta.conta END
      )
    END,
    item.parcela_numero,
    item.total_parcelas,
    item.grupo_parcelas_id,
    item.observacao,
    item.turma_id,
    item.turma_nome,
    item.anexo_bucket,
    item.anexo_path,
    item.anexo_nome,
    item.anexo_mime,
    item.anexo_tamanho,
    despesa.cancelamento_motivo,
    despesa.cancelado_em,
    despesa.estornado_em,
    item.created_at,
    item.is_rateio_derivado,
    item.rateio_modo,
    item.rateio_polos_quantidade,
    item.polo_matriz_id,
    item.polo_matriz_nome
  FROM public.listar_despesas_economicas_secure(
    p_tipo,
    p_polo_id,
    p_categoria_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_turma_id
  ) AS item
  LEFT JOIN public.despesas_lancamentos despesa
    ON despesa.id = item.despesa_lancamento_id
  LEFT JOIN public.contas_bancarias conta
    ON conta.id = despesa.conta_bancaria_id
   AND item.is_rateio_derivado = false;
END;
$function$;

-- Snapshot fechado para prévia/download/impressão de recibo. A composição no
-- browser recebe somente dados autorizados e não reutiliza IDs internos como
-- documento de fornecedor.
CREATE OR REPLACE FUNCTION public.preparar_recibo_despesa_secure(
  p_despesa_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_despesa public.despesas_lancamentos%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(v_despesa.polo_id)
       AND CASE
         WHEN v_despesa.tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao recibo desta despesa.'
      USING ERRCODE = '42501';
  END IF;

  IF v_despesa.status NOT IN ('PENDENTE', 'VENCIDO', 'PAGO') THEN
    RAISE EXCEPTION 'O status atual desta despesa não permite emitir este documento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'receipt', jsonb_build_object(
      'lancamentoId', despesa.id,
      'reciboTitulo', CASE
        WHEN despesa.status = 'PAGO' THEN 'Recibo de Pagamento'
        ELSE 'Comprovante de Lançamento'
      END,
      'reciboNumero', upper(left(despesa.id::text, 8)),
      'descricao', despesa.descricao,
      'valor', despesa.valor,
      'valorBase', despesa.valor_base,
      'jurosValor', despesa.juros_valor,
      'multaValor', despesa.multa_valor,
      'descontoValor', despesa.desconto_valor,
      'dataLancamento', despesa.data_lancamento,
      'dataVencimento', despesa.data_vencimento,
      'dataPagamento', despesa.data_pagamento,
      'valorPago', despesa.valor_pago,
      'fornecedorNome', fornecedor.nome,
      'fornecedorDocumento', CASE
        WHEN length(regexp_replace(coalesce(fornecedor.cpf_cnpj, ''), '\D', '', 'g')) IN (11, 14)
          THEN regexp_replace(fornecedor.cpf_cnpj, '\D', '', 'g')
        ELSE NULL
      END,
      'categoriaNome', categoria.nome,
      'formaPagamento', despesa.forma_pagamento,
      'contaBancariaNome', CASE
        WHEN conta.id IS NULL THEN NULL
        WHEN conta.natureza = 'CAIXA_INTERNO'
          THEN concat_ws(' • ', conta.banco, conta.conta)
        ELSE concat_ws(
          ' • ',
          conta.banco,
          CASE WHEN nullif(btrim(coalesce(conta.agencia, '')), '') IS NULL THEN NULL ELSE 'Ag. ' || conta.agencia END,
          CASE WHEN nullif(btrim(coalesce(conta.conta, '')), '') IS NULL THEN NULL ELSE 'Conta ' || conta.conta END
        )
      END,
      'poloId', polo.id,
      'poloNome', polo.nome,
      'parcelaNumero', despesa.parcela_numero,
      'totalParcelas', despesa.total_parcelas,
      'observacao', despesa.observacao,
      'status', despesa.status
    ),
    'polo', jsonb_build_object(
      'id', polo.id,
      'nome', polo.nome,
      'nomeFantasia', polo.nome,
      'cnpj', coalesce(nullif(polo.cnpj, ''), nullif(empresa.cnpj, '')),
      'cidade', coalesce(nullif(polo.cidade, ''), nullif(empresa.cidade, '')),
      'estado', coalesce(nullif(polo.estado, ''), nullif(empresa.uf, '')),
      'uf', coalesce(nullif(polo.estado, ''), nullif(empresa.uf, '')),
      'status', polo.status,
      'is_matriz', polo.is_matriz,
      'logoUrl', coalesce(nullif(polo.logo_url, ''), nullif(empresa.logo_url, '')),
      'endereco', coalesce(nullif(polo.endereco, ''), nullif(empresa.endereco, '')),
      'numero', coalesce(nullif(polo.numero, ''), nullif(empresa.numero, '')),
      'complemento', coalesce(nullif(polo.complemento, ''), nullif(empresa.complemento, '')),
      'bairro', coalesce(nullif(polo.bairro, ''), nullif(empresa.bairro, '')),
      'cep', coalesce(nullif(polo.cep, ''), nullif(empresa.cep, '')),
      'telefone', coalesce(nullif(polo.telefone, ''), nullif(empresa.telefone, '')),
      'email', coalesce(nullif(polo.email, ''), nullif(empresa.email, '')),
      'watermark_url', polo.watermark_url,
      'watermark_opacity', polo.watermark_opacity,
      'watermark_scale', polo.watermark_scale,
      'watermark_rotate', polo.watermark_rotate
    )
  )
  INTO v_result
  FROM public.despesas_lancamentos despesa
  JOIN public.polos polo
    ON polo.id = despesa.polo_id
  LEFT JOIN public.empresas empresa
    ON empresa.id = polo.company_id
  LEFT JOIN public.categorias_financeiras categoria
    ON categoria.id = despesa.categoria_financeira_id
  LEFT JOIN public.parceiros fornecedor
    ON fornecedor.id = despesa.fornecedor_id
  LEFT JOIN public.contas_bancarias conta
    ON conta.id = despesa.conta_bancaria_id
  WHERE despesa.id = v_despesa.id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Não foi possível preparar o recibo institucional desta despesa.';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_despesa_secure(
  uuid, uuid, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_ou_estornar_despesa_secure(uuid, uuid, text, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preparar_recibo_despesa_secure(uuid)
  FROM PUBLIC, anon;

-- O cancelamento legado não possui chave de idempotência nem a autorização
-- por aba efetiva. A interface passa a usar exclusivamente a RPC auditável.
REVOKE ALL ON FUNCTION public.cancelar_despesa_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_despesa_secure(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.atualizar_despesa_secure(
  uuid, uuid, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_ou_estornar_despesa_secure(uuid, uuid, text, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preparar_recibo_despesa_secure(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.atualizar_despesa_secure(
  uuid, uuid, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid
) IS 'Edita exclusivamente uma despesa pendente ou vencida, com idempotência e validação financeira canônica.';
COMMENT ON FUNCTION public.cancelar_ou_estornar_despesa_secure(uuid, uuid, text, boolean)
  IS 'Cancela uma conta pendente/vencida ou estorna uma baixa paga sem apagar a trilha financeira.';
COMMENT ON FUNCTION public.listar_despesas_economicas_detalhadas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) IS 'Leitura econômica autorizada com data real de lançamento e metadados auditáveis de cancelamento/estorno.';
COMMENT ON FUNCTION public.preparar_recibo_despesa_secure(uuid)
IS 'Snapshot autorizado e completo para o recibo/comprovante vetorial de uma despesa física.';

NOTIFY pgrst, 'reload schema';
