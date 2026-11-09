BEGIN;

CREATE OR REPLACE FUNCTION public.preparar_recibo_despesa_secure(p_despesa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_despesa public.despesas_lancamentos%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_despesa
  FROM public.despesas_lancamentos
  WHERE id = p_despesa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada.';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT coalesce((
       public.is_financeiro_for_polo(v_despesa.polo_id)
       AND CASE
         WHEN v_despesa.tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ), false) THEN
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
      'parceiroVinculado', despesa.fornecedor_id IS NOT NULL,
      'fornecedorDocumento', CASE
        WHEN length(regexp_replace(coalesce(fornecedor.cpf_cnpj, ''), '\D', '', 'g')) IN (11, 14)
          THEN regexp_replace(fornecedor.cpf_cnpj, '\D', '', 'g')
        ELSE NULL
      END,
      'categoriaNome', categoria.nome,
      'turmaNome', turma.nome,
      'turmaCodigo', turma.codigo,
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
  LEFT JOIN public.turmas turma
    ON turma.id = despesa.turma_id AND turma.polo_id = despesa.polo_id
  LEFT JOIN public.contas_bancarias conta
    ON conta.id = despesa.conta_bancaria_id
  WHERE despesa.id = v_despesa.id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Não foi possível preparar o recibo institucional desta despesa.';
  END IF;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
