-- Patrimônio, empréstimos com baixa central na matriz e desdobramento seguro.
-- O cliente apenas envia entradas; totais, parcelas, rateios e autorizações
-- são resolvidos de forma canônica no banco.

CREATE TABLE public.patrimonios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  data_aquisicao date NOT NULL,
  tipo_produto text NOT NULL,
  descricao text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(14, 2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total numeric(16, 2) GENERATED ALWAYS AS (
    round((quantidade::numeric * valor_unitario), 2)
  ) STORED,
  numero_serie text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  request_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrimonios_textos_obrigatorios_chk CHECK (
    nullif(btrim(tipo_produto), '') IS NOT NULL
    AND nullif(btrim(descricao), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX patrimonios_request_id_uidx
  ON public.patrimonios (request_id);
CREATE INDEX patrimonios_polo_data_id_ativos_idx
  ON public.patrimonios (polo_id, data_aquisicao DESC, id DESC)
  WHERE ativo = true;
CREATE INDEX patrimonios_company_polo_idx
  ON public.patrimonios (company_id, polo_id);
CREATE INDEX patrimonios_search_idx
  ON public.patrimonios
  USING gin (
    public.financeiro_normalize_search_text(
      coalesce(tipo_produto, '') || ' ' || coalesce(descricao, '') || ' '
      || coalesce(numero_serie, '') || ' ' || coalesce(observacao, '')
    ) extensions.gin_trgm_ops
  );

ALTER TABLE public.patrimonios ENABLE ROW LEVEL SECURITY;

CREATE POLICY patrimonio_select_scoped
  ON public.patrimonios
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_module('patrimonio')
  );

ALTER TABLE public.contas_pagar
  ADD COLUMN emprestimo_parcela_id uuid;

ALTER TABLE public.contas_pagar
  DROP CONSTRAINT contas_pagar_categoria_check;

ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_categoria_check
  CHECK (
    categoria = ANY (
      ARRAY[
        'DESPESA_VARIAVEL'::text,
        'DESPESA_ADMINISTRATIVA'::text,
        'OUTRAS_DESPESAS'::text,
        'ADIANTAMENTO_CEDIDO'::text,
        'EMPRESTIMO'::text
      ]
    )
  );

ALTER TABLE public.contas_receber
  DROP CONSTRAINT contas_receber_forma_pagamento_check;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_forma_pagamento_check
  CHECK (forma_pagamento = ANY (ARRAY['BOLETO'::text, 'PIX'::text, 'CARTAO'::text, 'DINHEIRO'::text, 'TED'::text]));

CREATE TABLE public.emprestimos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_matriz_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  credor_nome text NOT NULL,
  descricao text NOT NULL,
  valor_liberado numeric(14, 2) NOT NULL CHECK (valor_liberado > 0),
  valor_total_divida numeric(14, 2) NOT NULL CHECK (valor_total_divida > 0),
  valor_encargos numeric(14, 2) GENERATED ALWAYS AS (
    round((valor_total_divida - valor_liberado), 2)
  ) STORED,
  data_liberacao date NOT NULL,
  data_primeiro_vencimento date NOT NULL,
  total_parcelas integer NOT NULL CHECK (total_parcelas BETWEEN 1 AND 120),
  intervalo_meses integer NOT NULL DEFAULT 1 CHECK (intervalo_meses BETWEEN 1 AND 24),
  conta_credito_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  forma_credito text NOT NULL CHECK (forma_credito IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO')),
  conta_receber_id uuid REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'QUITADO', 'CANCELADO')),
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emprestimos_divida_valida_chk CHECK (valor_total_divida >= valor_liberado),
  CONSTRAINT emprestimos_textos_obrigatorios_chk CHECK (
    nullif(btrim(credor_nome), '') IS NOT NULL
    AND nullif(btrim(descricao), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX emprestimos_financeiros_request_id_uidx
  ON public.emprestimos_financeiros (request_id);
CREATE UNIQUE INDEX emprestimos_financeiros_credito_uidx
  ON public.emprestimos_financeiros (conta_receber_id)
  WHERE conta_receber_id IS NOT NULL;
CREATE INDEX emprestimos_financeiros_company_matriz_status_idx
  ON public.emprestimos_financeiros (company_id, polo_matriz_id, status, data_liberacao DESC);

CREATE TABLE public.emprestimo_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emprestimo_id uuid NOT NULL REFERENCES public.emprestimos_financeiros(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero >= 1),
  data_vencimento date NOT NULL,
  valor_principal numeric(14, 2) NOT NULL CHECK (valor_principal >= 0),
  valor_encargos numeric(14, 2) NOT NULL CHECK (valor_encargos >= 0),
  valor_total numeric(14, 2) GENERATED ALWAYS AS (
    round((valor_principal + valor_encargos), 2)
  ) STORED,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO')),
  data_pagamento date,
  valor_pago numeric(14, 2),
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  forma_pagamento text CHECK (forma_pagamento IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO')),
  baixa_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emprestimo_parcelas_pagamento_completo_chk CHECK (
    status <> 'PAGO'
    OR (
      data_pagamento IS NOT NULL
      AND valor_pago IS NOT NULL
      AND valor_pago > 0
      AND conta_bancaria_id IS NOT NULL
      AND forma_pagamento IS NOT NULL
    )
  ),
  CONSTRAINT emprestimo_parcelas_numero_uidx UNIQUE (emprestimo_id, numero)
);

CREATE INDEX emprestimo_parcelas_abertas_vencimento_idx
  ON public.emprestimo_parcelas (data_vencimento, emprestimo_id)
  WHERE status IN ('PENDENTE', 'VENCIDO');
CREATE INDEX emprestimo_parcelas_emprestimo_status_idx
  ON public.emprestimo_parcelas (emprestimo_id, status, numero);

ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_emprestimo_parcela_fkey
  FOREIGN KEY (emprestimo_parcela_id)
  REFERENCES public.emprestimo_parcelas(id)
  ON DELETE RESTRICT;
CREATE UNIQUE INDEX contas_pagar_emprestimo_parcela_uidx
  ON public.contas_pagar (emprestimo_parcela_id)
  WHERE emprestimo_parcela_id IS NOT NULL;

CREATE TABLE public.emprestimo_parcela_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emprestimo_parcela_id uuid NOT NULL REFERENCES public.emprestimo_parcelas(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  valor_principal numeric(14, 2) NOT NULL CHECK (valor_principal >= 0),
  valor_encargos numeric(14, 2) NOT NULL CHECK (valor_encargos >= 0),
  valor_total numeric(14, 2) GENERATED ALWAYS AS (
    round((valor_principal + valor_encargos), 2)
  ) STORED,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emprestimo_parcela_rateios_uidx UNIQUE (emprestimo_parcela_id, polo_id)
);

CREATE INDEX emprestimo_rateios_company_polo_status_idx
  ON public.emprestimo_parcela_rateios (company_id, polo_id, status);
CREATE INDEX emprestimo_rateios_polo_parcela_idx
  ON public.emprestimo_parcela_rateios (polo_id, emprestimo_parcela_id);

CREATE TABLE public.emprestimo_parcela_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emprestimo_parcela_id uuid NOT NULL REFERENCES public.emprestimo_parcelas(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  conta_bancaria_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  data_pagamento date NOT NULL,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emprestimo_parcela_baixas_request_uidx UNIQUE (request_id),
  CONSTRAINT emprestimo_parcela_baixas_parcela_uidx UNIQUE (emprestimo_parcela_id)
);

ALTER TABLE public.emprestimos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimo_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimo_parcela_rateios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimo_parcela_baixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY emprestimos_financeiros_select_matriz
  ON public.emprestimos_financeiros
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_global()
    AND public.gestor_has_effective_financeiro_tab('emprestimos')
  );

CREATE POLICY emprestimo_parcelas_select_matriz
  ON public.emprestimo_parcelas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.emprestimos_financeiros emprestimo
      WHERE emprestimo.id = emprestimo_parcelas.emprestimo_id
        AND public.is_financeiro_global()
        AND public.gestor_has_effective_financeiro_tab('emprestimos')
    )
  );

CREATE POLICY emprestimo_rateios_select_scoped
  ON public.emprestimo_parcela_rateios
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND (
      public.gestor_has_effective_financeiro_tab('emprestimos')
      OR public.gestor_has_effective_financeiro_tab('despesas')
      OR public.gestor_has_module('caixa')
    )
  );

CREATE OR REPLACE FUNCTION public.financeiro_dividir_centavos(
  p_valor numeric,
  p_quantidade integer,
  p_indice integer
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
DECLARE
  v_centavos bigint;
  v_base bigint;
  v_resto bigint;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_indice IS NULL
     OR p_indice < 1 OR p_indice > p_quantidade THEN
    RAISE EXCEPTION 'Parâmetros inválidos para divisão de centavos.';
  END IF;

  v_centavos := round(coalesce(p_valor, 0) * 100)::bigint;
  v_base := v_centavos / p_quantidade;
  v_resto := mod(v_centavos, p_quantidade);

  RETURN (v_base + CASE WHEN p_indice <= v_resto THEN 1 ELSE 0 END)::numeric / 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_patrimonio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_data_aquisicao date,
  p_tipo_produto text,
  p_descricao text,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_numero_serie text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.patrimonios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_existing
  FROM public.patrimonios
  WHERE request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.polo_id IS DISTINCT FROM p_polo_id
       OR v_existing.data_aquisicao IS DISTINCT FROM p_data_aquisicao
       OR v_existing.tipo_produto IS DISTINCT FROM upper(btrim(p_tipo_produto))
       OR v_existing.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_existing.quantidade IS DISTINCT FROM p_quantidade
       OR v_existing.valor_unitario IS DISTINCT FROM round(p_valor_unitario, 2)
       OR v_existing.numero_serie IS DISTINCT FROM nullif(btrim(coalesce(p_numero_serie, '')), '')
       OR v_existing.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '') THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_existing;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.polos
  WHERE id = p_polo_id
    AND lower(coalesce(status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;
  IF p_data_aquisicao IS NULL
     OR nullif(btrim(coalesce(p_tipo_produto, '')), '') IS NULL
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR coalesce(p_quantidade, 0) < 1
     OR p_valor_unitario IS NULL
     OR p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Informe data, tipo, descrição, quantidade e valor unitário válidos.';
  END IF;

  INSERT INTO public.patrimonios (
    company_id, polo_id, data_aquisicao, tipo_produto, descricao,
    quantidade, valor_unitario, numero_serie, observacao, request_id, created_by
  ) VALUES (
    v_company_id, p_polo_id, p_data_aquisicao, upper(btrim(p_tipo_produto)), btrim(p_descricao),
    p_quantidade, round(p_valor_unitario, 2),
    nullif(btrim(coalesce(p_numero_serie, '')), ''),
    nullif(btrim(coalesce(p_observacao, '')), ''),
    p_request_id, auth.uid()
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_patrimonios_secure(
  p_polo_id uuid,
  p_search text DEFAULT NULL,
  p_tipo_produto text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))), '');
  v_tipo text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_tipo_produto, ''))), '');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.' USING ERRCODE = '42501';
  END IF;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        v_tipo IS NULL
        OR public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          concat_ws(' ', patrimonio.tipo_produto, patrimonio.descricao, patrimonio.numero_serie, patrimonio.observacao)
        ) LIKE '%' || v_search || '%'
      )
  ), pagina AS (
    SELECT * FROM filtrados
    ORDER BY data_aquisicao DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT count(*) INTO v_total FROM filtrados;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        v_tipo IS NULL
        OR public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          concat_ws(' ', patrimonio.tipo_produto, patrimonio.descricao, patrimonio.numero_serie, patrimonio.observacao)
        ) LIKE '%' || v_search || '%'
      )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'company_id', item.company_id,
    'polo_id', item.polo_id,
    'polo_nome', item.polo_nome,
    'data_aquisicao', item.data_aquisicao,
    'tipo_produto', item.tipo_produto,
    'descricao', item.descricao,
    'quantidade', item.quantidade,
    'valor_unitario', item.valor_unitario,
    'valor_total', item.valor_total,
    'numero_serie', item.numero_serie,
    'observacao', item.observacao,
    'created_at', item.created_at
  ) ORDER BY item.data_aquisicao DESC, item.id DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM filtrados
    ORDER BY data_aquisicao DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  ) item;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_despesa_com_desdobramento_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor_total numeric,
  p_data_lancamento date,
  p_data_vencimento date,
  p_juros_total numeric DEFAULT 0,
  p_multa_total numeric DEFAULT 0,
  p_desconto_total numeric DEFAULT 0,
  p_categoria_financeira_id uuid DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_total_parcelas integer DEFAULT 1,
  p_intervalo_quantidade integer DEFAULT 1,
  p_intervalo_unidade text DEFAULT 'MESES',
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_tamanho bigint DEFAULT NULL
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
  v_parcela integer;
  v_vencimento date;
  v_grupo uuid;
  v_valor numeric;
  v_juros numeric;
  v_multa numeric;
  v_desconto numeric;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.despesas_lancamentos WHERE request_id = p_request_id) THEN
    RETURN QUERY
    SELECT * FROM public.despesas_lancamentos
    WHERE request_id = p_request_id
    ORDER BY parcela_numero;
    RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('despesas')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para lançar contas a pagar neste polo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR p_valor_total IS NULL OR p_valor_total <= 0
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

  v_grupo := CASE WHEN v_total > 1 THEN p_request_id ELSE NULL END;
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

  RETURN QUERY
  SELECT * FROM public.despesas_lancamentos
  WHERE request_id = p_request_id
  ORDER BY parcela_numero;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_emprestimo_financeiro_secure(
  p_request_id uuid,
  p_polo_matriz_id uuid,
  p_credor_nome text,
  p_descricao text,
  p_valor_liberado numeric,
  p_valor_total_divida numeric,
  p_data_liberacao date,
  p_data_primeiro_vencimento date,
  p_total_parcelas integer,
  p_intervalo_meses integer,
  p_conta_credito_id uuid,
  p_forma_credito text,
  p_rateio_modo text,
  p_polo_ids uuid[] DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_emprestimo public.emprestimos_financeiros%rowtype;
  v_conta_receber_id uuid;
  v_parcela_id uuid;
  v_conta_pagar_id uuid;
  v_parcela integer;
  v_polo_indice integer;
  v_polo_total integer;
  v_polo_id uuid;
  v_principal_parcela numeric;
  v_encargos_parcela numeric;
  v_rateio_principal numeric;
  v_rateio_encargos numeric;
  v_rateio_modo text := upper(btrim(coalesce(p_rateio_modo, '')));
  v_polos uuid[];
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_emprestimo.polo_matriz_id IS DISTINCT FROM p_polo_matriz_id
       OR v_emprestimo.credor_nome IS DISTINCT FROM btrim(p_credor_nome)
       OR v_emprestimo.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_emprestimo.valor_liberado IS DISTINCT FROM round(p_valor_liberado, 2)
       OR v_emprestimo.valor_total_divida IS DISTINCT FROM round(p_valor_total_divida, 2)
       OR v_emprestimo.total_parcelas IS DISTINCT FROM p_total_parcelas
       OR v_emprestimo.data_primeiro_vencimento IS DISTINCT FROM p_data_primeiro_vencimento THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
  ELSE
    IF auth.role() <> 'service_role'
       AND NOT (
         public.is_financeiro_global()
         AND public.gestor_has_effective_financeiro_tab('emprestimos')
       ) THEN
      RAISE EXCEPTION 'Apenas a Matriz autorizada pode registrar empréstimos.' USING ERRCODE = '42501';
    END IF;
    IF nullif(btrim(coalesce(p_credor_nome, '')), '') IS NULL
       OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
       OR p_valor_liberado IS NULL OR p_valor_liberado <= 0
       OR p_valor_total_divida IS NULL OR p_valor_total_divida < p_valor_liberado
       OR p_data_liberacao IS NULL OR p_data_primeiro_vencimento IS NULL
       OR coalesce(p_total_parcelas, 0) NOT BETWEEN 1 AND 120
       OR coalesce(p_intervalo_meses, 1) NOT BETWEEN 1 AND 24
       OR upper(btrim(coalesce(p_forma_credito, ''))) NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
      RAISE EXCEPTION 'Dados inválidos para o empréstimo.';
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.polos
    WHERE id = p_polo_matriz_id
      AND is_matriz = true
      AND lower(coalesce(status, 'ativo')) = 'ativo';
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um polo Matriz ativo para registrar o empréstimo.';
    END IF;
    IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_credito_id, p_polo_matriz_id) THEN
      RAISE EXCEPTION 'A conta de crédito não está disponível na Matriz selecionada.';
    END IF;

    IF v_rateio_modo = 'TODOS' THEN
      SELECT coalesce(array_agg(id ORDER BY created_at, id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos
      WHERE company_id = v_company_id
        AND lower(coalesce(status, 'ativo')) = 'ativo';
    ELSIF v_rateio_modo = 'SELECIONADOS' THEN
      SELECT coalesce(array_agg(polo.id ORDER BY polo.created_at, polo.id), ARRAY[]::uuid[])
      INTO v_polos
      FROM public.polos polo
      WHERE polo.id = ANY(coalesce(p_polo_ids, ARRAY[]::uuid[]))
        AND polo.company_id = v_company_id
        AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
      IF cardinality(v_polos) <> cardinality(ARRAY(SELECT DISTINCT unnest(coalesce(p_polo_ids, ARRAY[]::uuid[])))) THEN
        RAISE EXCEPTION 'Os polos do rateio devem estar ativos e pertencer à mesma empresa da Matriz.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Escolha rateio para todos os polos ou polos selecionados.';
    END IF;
    v_polo_total := cardinality(v_polos);
    IF v_polo_total < 1 THEN
      RAISE EXCEPTION 'Selecione ao menos um polo para o rateio.';
    END IF;

    INSERT INTO public.contas_receber (
      polo_id, descricao, valor, data_vencimento, data_pagamento, valor_pago,
      status, forma_pagamento, conta_bancaria_id, categoria
    ) VALUES (
      p_polo_matriz_id, 'Crédito de empréstimo: ' || btrim(p_descricao), round(p_valor_liberado, 2),
      p_data_liberacao, p_data_liberacao, round(p_valor_liberado, 2),
      'PAGO', upper(btrim(p_forma_credito)), p_conta_credito_id, 'OUTROS_CREDITOS'
    )
    RETURNING id INTO v_conta_receber_id;

    INSERT INTO public.emprestimos_financeiros (
      company_id, polo_matriz_id, request_id, credor_nome, descricao,
      valor_liberado, valor_total_divida, data_liberacao, data_primeiro_vencimento,
      total_parcelas, intervalo_meses, conta_credito_id, forma_credito,
      conta_receber_id, observacao, created_by
    ) VALUES (
      v_company_id, p_polo_matriz_id, p_request_id, btrim(p_credor_nome), btrim(p_descricao),
      round(p_valor_liberado, 2), round(p_valor_total_divida, 2), p_data_liberacao, p_data_primeiro_vencimento,
      p_total_parcelas, p_intervalo_meses, p_conta_credito_id, upper(btrim(p_forma_credito)),
      v_conta_receber_id, nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
    )
    RETURNING * INTO v_emprestimo;

    FOR v_parcela IN 1..p_total_parcelas LOOP
      v_principal_parcela := public.financeiro_dividir_centavos(p_valor_liberado, p_total_parcelas, v_parcela);
      v_encargos_parcela := public.financeiro_dividir_centavos(p_valor_total_divida - p_valor_liberado, p_total_parcelas, v_parcela);

      INSERT INTO public.emprestimo_parcelas (
        emprestimo_id, numero, data_vencimento, valor_principal, valor_encargos
      ) VALUES (
        v_emprestimo.id,
        v_parcela,
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        v_principal_parcela,
        v_encargos_parcela
      ) RETURNING id INTO v_parcela_id;

      INSERT INTO public.contas_pagar (
        polo_id, descricao, valor, data_vencimento, status, categoria, emprestimo_parcela_id
      ) VALUES (
        p_polo_matriz_id,
        'Empréstimo: ' || btrim(p_descricao) || ' (' || v_parcela || '/' || p_total_parcelas || ')',
        round(v_principal_parcela + v_encargos_parcela, 2),
        (p_data_primeiro_vencimento::timestamp + make_interval(months => (v_parcela - 1) * p_intervalo_meses))::date,
        'PENDENTE', 'EMPRESTIMO', v_parcela_id
      ) RETURNING id INTO v_conta_pagar_id;

      FOR v_polo_indice IN 1..v_polo_total LOOP
        v_polo_id := v_polos[v_polo_indice];
        v_rateio_principal := public.financeiro_dividir_centavos(v_principal_parcela, v_polo_total, v_polo_indice);
        v_rateio_encargos := public.financeiro_dividir_centavos(v_encargos_parcela, v_polo_total, v_polo_indice);
        INSERT INTO public.emprestimo_parcela_rateios (
          emprestimo_parcela_id, company_id, polo_id, valor_principal, valor_encargos
        ) VALUES (
          v_parcela_id, v_company_id, v_polo_id, v_rateio_principal, v_rateio_encargos
        );
      END LOOP;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
    'id', emprestimo.id,
    'descricao', emprestimo.descricao,
    'valor_liberado', emprestimo.valor_liberado,
    'valor_total_divida', emprestimo.valor_total_divida,
    'total_parcelas', emprestimo.total_parcelas,
    'rateio_polos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('polo_id', polo.id, 'nome', polo.nome) ORDER BY polo.nome)
      FROM (
        SELECT DISTINCT rateio.polo_id
        FROM public.emprestimo_parcela_rateios rateio
        JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
        WHERE parcela.emprestimo_id = emprestimo.id
      ) rateios
      JOIN public.polos polo ON polo.id = rateios.polo_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.emprestimos_financeiros emprestimo
  WHERE emprestimo.id = v_emprestimo.id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_emprestimos_financeiros_secure(
  p_polo_matriz_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_global()
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos empréstimos.' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', emprestimo.id,
      'credor_nome', emprestimo.credor_nome,
      'descricao', emprestimo.descricao,
      'valor_liberado', emprestimo.valor_liberado,
      'valor_total_divida', emprestimo.valor_total_divida,
      'valor_encargos', emprestimo.valor_encargos,
      'data_liberacao', emprestimo.data_liberacao,
      'total_parcelas', emprestimo.total_parcelas,
      'status', emprestimo.status,
      'observacao', emprestimo.observacao,
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
            ) ORDER BY polo.nome)
            FROM public.emprestimo_parcela_rateios rateio
            JOIN public.polos polo ON polo.id = rateio.polo_id
            WHERE rateio.emprestimo_parcela_id = parcela.id
          ), '[]'::jsonb)
        ) ORDER BY parcela.numero)
        FROM public.emprestimo_parcelas parcela
        LEFT JOIN public.contas_pagar conta ON conta.emprestimo_parcela_id = parcela.id
        WHERE parcela.emprestimo_id = emprestimo.id
      ), '[]'::jsonb)
    ) ORDER BY emprestimo.data_liberacao DESC, emprestimo.id DESC)
    FROM public.emprestimos_financeiros emprestimo
    WHERE emprestimo.polo_matriz_id = p_polo_matriz_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_emprestimo_parcela_matriz_secure(
  p_emprestimo_parcela_id uuid,
  p_request_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parcela public.emprestimo_parcelas%rowtype;
  v_emprestimo public.emprestimos_financeiros%rowtype;
  v_conta_pagar public.contas_pagar%rowtype;
  v_existing public.emprestimo_parcela_baixas%rowtype;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da baixa é obrigatória.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_parcela
  FROM public.emprestimo_parcelas
  WHERE id = p_emprestimo_parcela_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de empréstimo não encontrada.';
  END IF;
  SELECT * INTO v_emprestimo
  FROM public.emprestimos_financeiros
  WHERE id = v_parcela.emprestimo_id
  FOR UPDATE;
  SELECT * INTO v_conta_pagar
  FROM public.contas_pagar
  WHERE emprestimo_parcela_id = v_parcela.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar central da parcela não encontrada.';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_global()
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode baixar parcelas de empréstimo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_conta_bancaria_id IS NULL
     OR nullif(btrim(coalesce(p_forma_pagamento, '')), '') IS NULL
     OR upper(btrim(p_forma_pagamento)) NOT IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO') THEN
    RAISE EXCEPTION 'Informe a conta da Matriz e a forma de pagamento.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(p_conta_bancaria_id, v_emprestimo.polo_matriz_id) THEN
    RAISE EXCEPTION 'A conta selecionada não está disponível na Matriz.';
  END IF;

  SELECT * INTO v_existing
  FROM public.emprestimo_parcela_baixas
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.emprestimo_parcela_id IS DISTINCT FROM v_parcela.id
       OR v_existing.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id
       OR v_existing.data_pagamento IS DISTINCT FROM coalesce(p_data_pagamento, CURRENT_DATE)
       OR v_existing.forma_pagamento IS DISTINCT FROM upper(btrim(p_forma_pagamento)) THEN
      RAISE EXCEPTION 'A chave de idempotência da baixa já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_build_object('id', v_parcela.id, 'status', v_parcela.status, 'replayed', true);
  END IF;
  IF v_parcela.status = 'PAGO' OR v_conta_pagar.status = 'PAGO' THEN
    RAISE EXCEPTION 'Esta parcela já foi baixada.';
  END IF;
  IF v_parcela.status = 'CANCELADO' OR v_emprestimo.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Uma parcela cancelada não pode ser baixada.';
  END IF;

  INSERT INTO public.emprestimo_parcela_baixas (
    emprestimo_parcela_id, request_id, conta_bancaria_id, data_pagamento, forma_pagamento, created_by
  ) VALUES (
    v_parcela.id, p_request_id, p_conta_bancaria_id,
    coalesce(p_data_pagamento, CURRENT_DATE), upper(btrim(p_forma_pagamento)), auth.uid()
  );

  UPDATE public.contas_pagar
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      valor_pago = valor,
      forma_pagamento = upper(btrim(p_forma_pagamento)),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = v_conta_pagar.id;

  UPDATE public.emprestimo_parcelas
  SET status = 'PAGO',
      conta_bancaria_id = p_conta_bancaria_id,
      data_pagamento = coalesce(p_data_pagamento, CURRENT_DATE),
      valor_pago = valor_total,
      forma_pagamento = upper(btrim(p_forma_pagamento)),
      baixa_request_id = p_request_id,
      updated_at = now()
  WHERE id = v_parcela.id;

  UPDATE public.emprestimo_parcela_rateios
  SET status = 'PAGO', updated_at = now()
  WHERE emprestimo_parcela_id = v_parcela.id;

  UPDATE public.emprestimos_financeiros
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.emprestimo_parcelas parcela
          WHERE parcela.emprestimo_id = v_emprestimo.id
            AND parcela.status <> 'PAGO'
        ) THEN 'QUITADO'
        ELSE 'ATIVO'
      END,
      updated_at = now()
  WHERE id = v_emprestimo.id;

  RETURN jsonb_build_object(
    'id', v_parcela.id,
    'status', 'PAGO',
    'valor_pago', v_parcela.valor_total,
    'replayed', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_caixa_financiamento_resumo_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, CURRENT_DATE)) + interval '1 month')::date;
  v_credito numeric := 0;
  v_obrigacao numeric := 0;
  v_pago_rateado numeric := 0;
  v_principal numeric := 0;
  v_encargos numeric := 0;
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

  SELECT
    coalesce(sum(rateio.valor_total), 0),
    coalesce(sum(rateio.valor_total) FILTER (WHERE rateio.status = 'PAGO'), 0),
    coalesce(sum(rateio.valor_principal), 0),
    coalesce(sum(rateio.valor_encargos), 0)
  INTO v_obrigacao, v_pago_rateado, v_principal, v_encargos
  FROM public.emprestimo_parcela_rateios rateio
  JOIN public.emprestimo_parcelas parcela ON parcela.id = rateio.emprestimo_parcela_id
  WHERE parcela.data_vencimento >= v_inicio
    AND parcela.data_vencimento < v_fim
    AND (p_polo_id IS NULL OR rateio.polo_id = p_polo_id);

  RETURN jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'credito_liberado_matriz', v_credito,
    'obrigacao_rateada', v_obrigacao,
    'principal_rateado', v_principal,
    'encargos_rateados', v_encargos,
    'pago_rateado', v_pago_rateado,
    'observacao', 'Crédito de empréstimo é financiamento, não receita operacional. O ponto de equilíbrio depende de política de margem e custos.'
  );
END;
$function$;

ALTER TABLE public.patrimonios REPLICA IDENTITY FULL;
ALTER TABLE public.emprestimos_financeiros REPLICA IDENTITY FULL;
ALTER TABLE public.emprestimo_parcelas REPLICA IDENTITY FULL;
ALTER TABLE public.emprestimo_parcela_rateios REPLICA IDENTITY FULL;

DO $do$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.patrimonios;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$do$;
DO $do$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emprestimos_financeiros;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$do$;
DO $do$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emprestimo_parcelas;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$do$;
DO $do$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emprestimo_parcela_rateios;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$do$;

REVOKE ALL ON FUNCTION public.financeiro_dividir_centavos(numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_patrimonio_secure(uuid, uuid, date, text, text, integer, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_patrimonios_secure(uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_despesa_com_desdobramento_secure(uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, text, text, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_emprestimo_financeiro_secure(uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_emprestimos_financeiros_secure(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcela_matriz_secure(uuid, uuid, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_caixa_financiamento_resumo_secure(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_patrimonio_secure(uuid, uuid, date, text, text, integer, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_patrimonios_secure(uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_despesa_com_desdobramento_secure(uuid, uuid, text, text, numeric, date, date, numeric, numeric, numeric, uuid, uuid, text, uuid, integer, integer, text, text, text, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_secure(uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_emprestimos_financeiros_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.baixar_emprestimo_parcela_matriz_secure(uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_financiamento_resumo_secure(uuid, date) TO authenticated, service_role;
