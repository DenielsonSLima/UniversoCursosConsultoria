-- Todo novo empréstimo deve apontar para um Parceiro PJ categorizado como
-- BANCO. O nome continua armazenado como retrato histórico do contrato, mas
-- a origem passa a ser uma referência canônica e autorizada.

BEGIN;

INSERT INTO public.categorias (nome, tipo, descricao, status)
SELECT 'BANCO', 'pj', 'Instituições financeiras, bancos e cooperativas de crédito', 'ativo'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categorias categoria
  WHERE categoria.tipo = 'pj'
    AND lower(btrim(categoria.nome)) = 'banco'
);

UPDATE public.categorias
SET status = 'ativo'
WHERE tipo = 'pj'
  AND lower(btrim(nome)) = 'banco';

ALTER TABLE public.emprestimos_financeiros
  ADD COLUMN IF NOT EXISTS credor_parceiro_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.emprestimos_financeiros'::regclass
      AND conname = 'emprestimos_financeiros_credor_parceiro_id_fkey'
  ) THEN
    ALTER TABLE public.emprestimos_financeiros
      ADD CONSTRAINT emprestimos_financeiros_credor_parceiro_id_fkey
      FOREIGN KEY (credor_parceiro_id)
      REFERENCES public.parceiros(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS emprestimos_financeiros_credor_parceiro_idx
  ON public.emprestimos_financeiros (credor_parceiro_id)
  WHERE credor_parceiro_id IS NOT NULL;

COMMENT ON COLUMN public.emprestimos_financeiros.credor_parceiro_id IS
  'Parceiro PJ de categoria BANCO selecionado no cadastro. Registros históricos podem permanecer sem vínculo.';

-- A busca é intencionalmente estreita: somente bancos ativos, cadastrados
-- como PJ e pertencentes ao escopo de parceiros do polo financeiro atual.
CREATE OR REPLACE FUNCTION public.get_financeiro_bancos_por_polo_secure(
  p_polo_id uuid
)
RETURNS TABLE (
  id uuid,
  nome text,
  cpf_cnpj text,
  foto_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_polo_id IS NULL
     OR (
       auth.role() <> 'service_role'
       AND NOT (
         public.is_financeiro_for_polo(p_polo_id)
         AND public.gestor_has_effective_financeiro_tab('emprestimos')
       )
     )
  THEN
    RAISE EXCEPTION 'Acesso aos bancos credores fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    parceiro.id,
    parceiro.nome,
    parceiro.cpf_cnpj,
    parceiro.foto_url
  FROM public.parceiros AS parceiro
  JOIN public.categorias AS categoria
    ON categoria.id = parceiro.categoria_id
  WHERE upper(btrim(coalesce(parceiro.status, ''))) = 'ATIVO'
    AND upper(btrim(coalesce(parceiro.tipo, ''))) = 'PJ'
    AND lower(btrim(coalesce(categoria.tipo, ''))) = 'pj'
    AND upper(btrim(coalesce(categoria.nome, ''))) = 'BANCO'
    AND lower(btrim(coalesce(categoria.status, ''))) = 'ativo'
    AND (
      (
        parceiro.polo_id IS NULL
        AND coalesce(cardinality(parceiro.polo_ids), 0) = 0
      )
      OR parceiro.polo_id = p_polo_id
      OR parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]
    )
  ORDER BY parceiro.nome, parceiro.id;
END;
$$;

-- O caminho legado recebe o nome como retrato do contrato e concentra todo o
-- cálculo. Esta fachada segura seleciona o parceiro canônico, mantém a
-- idempotência e remove a possibilidade de o navegador enviar texto livre.
CREATE OR REPLACE FUNCTION public.criar_emprestimo_financeiro_polo_com_banco_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_credor_parceiro_id uuid,
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
  p_polo_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_credor_nome text;
  v_existing_credor_parceiro_id uuid;
  v_emprestimo_id uuid;
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL OR p_credor_parceiro_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência e o banco credor são obrigatórios.';
  END IF;

  -- Autoriza antes de qualquer lookup de parceiro ou de replay.
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para registrar empréstimo neste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT parceiro.nome
  INTO v_credor_nome
  FROM public.parceiros AS parceiro
  JOIN public.categorias AS categoria
    ON categoria.id = parceiro.categoria_id
  WHERE parceiro.id = p_credor_parceiro_id
    AND upper(btrim(coalesce(parceiro.status, ''))) = 'ATIVO'
    AND upper(btrim(coalesce(parceiro.tipo, ''))) = 'PJ'
    AND lower(btrim(coalesce(categoria.tipo, ''))) = 'pj'
    AND upper(btrim(coalesce(categoria.nome, ''))) = 'BANCO'
    AND lower(btrim(coalesce(categoria.status, ''))) = 'ativo'
    AND (
      (
        parceiro.polo_id IS NULL
        AND coalesce(cardinality(parceiro.polo_ids), 0) = 0
      )
      OR parceiro.polo_id = p_polo_id
      OR parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]
    );

  IF v_credor_nome IS NULL THEN
    RAISE EXCEPTION 'Selecione um Parceiro PJ ativo da categoria Banco disponível para este polo.';
  END IF;

  -- Esta comparação impede que a mesma chave seja reaproveitada com outro
  -- parceiro, inclusive quando dois cadastros tiverem o mesmo nome.
  SELECT emprestimo.credor_parceiro_id
  INTO v_existing_credor_parceiro_id
  FROM public.emprestimos_financeiros AS emprestimo
  WHERE emprestimo.request_id = p_request_id
    AND emprestimo.polo_matriz_id = p_polo_id;

  IF FOUND
     AND v_existing_credor_parceiro_id IS NOT NULL
     AND v_existing_credor_parceiro_id IS DISTINCT FROM p_credor_parceiro_id THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada com outro banco credor.';
  END IF;

  v_result := public.criar_emprestimo_financeiro_polo_secure(
    p_request_id,
    p_polo_id,
    v_credor_nome,
    p_descricao,
    p_valor_liberado,
    p_valor_total_divida,
    p_data_liberacao,
    p_data_primeiro_vencimento,
    p_total_parcelas,
    p_intervalo_meses,
    p_conta_credito_id,
    p_forma_credito,
    p_rateio_modo,
    p_polo_ids,
    p_observacao
  );

  v_emprestimo_id := nullif(v_result ->> 'id', '')::uuid;
  IF v_emprestimo_id IS NULL THEN
    RAISE EXCEPTION 'O empréstimo não retornou um identificador canônico.';
  END IF;

  UPDATE public.emprestimos_financeiros AS emprestimo
  SET credor_parceiro_id = p_credor_parceiro_id
  WHERE emprestimo.id = v_emprestimo_id
    AND (
      emprestimo.credor_parceiro_id IS NULL
      OR emprestimo.credor_parceiro_id = p_credor_parceiro_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada com outro banco credor.';
  END IF;

  RETURN v_result || jsonb_build_object(
    'credor_parceiro_id', p_credor_parceiro_id,
    'credor_nome', v_credor_nome
  );
END;
$$;

COMMENT ON FUNCTION public.criar_emprestimo_financeiro_polo_com_banco_secure(
  uuid, uuid, uuid, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) IS
  'Cria empréstimo a partir de Parceiro PJ ativo da categoria BANCO, validando escopo, idempotência e valores no banco.';

-- A listagem mantém o nome histórico, mas passa a expor o vínculo canônico
-- para que o cliente não precise inferir a origem do credor.
CREATE OR REPLACE FUNCTION public.listar_emprestimos_financeiros_polo_secure(
  p_polo_id uuid
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
    JOIN public.polos polo_responsavel ON polo_responsavel.id = emprestimo.polo_matriz_id
    WHERE emprestimo.polo_matriz_id = p_polo_id
  ), '[]'::jsonb);
END;
$function$;

-- O RPC textual torna-se uma implementação interna de compatibilidade. A
-- sessão autenticada usa apenas a entrada que recebe o identificador do banco.
REVOKE EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_financeiro_bancos_por_polo_secure(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_emprestimo_financeiro_polo_com_banco_secure(
  uuid, uuid, uuid, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_financeiro_bancos_por_polo_secure(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_com_banco_secure(
  uuid, uuid, uuid, text, numeric, numeric, date, date, integer, integer, uuid, text, text, uuid[], text
) TO authenticated, service_role;

COMMIT;
