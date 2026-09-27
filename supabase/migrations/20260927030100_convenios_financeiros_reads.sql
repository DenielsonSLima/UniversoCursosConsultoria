BEGIN;

CREATE FUNCTION public.convenios_financeiros_mes_item_secure(p_competencia_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH totais AS (
    SELECT
      coalesce((
        SELECT sum(credito.valor)
        FROM public.convenios_financeiros_creditos credito
        WHERE credito.competencia_id = mes.id
      ), 0)::numeric AS creditos,
      coalesce((
        SELECT sum(vinculo.valor_vinculado)
        FROM public.convenios_financeiros_despesas vinculo
        JOIN public.despesas_lancamentos despesa
          ON despesa.id = vinculo.despesa_lancamento_id
        WHERE vinculo.competencia_id = mes.id
          AND vinculo.status = 'ATIVO'
          AND despesa.status = 'PAGO'
      ), 0)::numeric AS despesas_pagas,
      coalesce((
        SELECT sum(vinculo.valor_vinculado)
        FROM public.convenios_financeiros_despesas vinculo
        JOIN public.despesas_lancamentos despesa
          ON despesa.id = vinculo.despesa_lancamento_id
        WHERE vinculo.competencia_id = mes.id
          AND vinculo.status = 'ATIVO'
          AND despesa.status IN ('PENDENTE', 'VENCIDO')
      ), 0)::numeric AS despesas_pendentes,
      (SELECT count(*) FROM public.convenios_financeiros_creditos credito
        WHERE credito.competencia_id = mes.id)::integer AS quantidade_creditos,
      (SELECT count(*)
        FROM public.convenios_financeiros_despesas vinculo
        JOIN public.despesas_lancamentos despesa
          ON despesa.id = vinculo.despesa_lancamento_id
        WHERE vinculo.competencia_id = mes.id
          AND vinculo.status = 'ATIVO'
          AND despesa.status IN ('PENDENTE', 'VENCIDO', 'PAGO'))::integer
        AS quantidade_despesas
    FROM public.convenios_financeiros_competencias mes
    WHERE mes.id = p_competencia_id
  )
  SELECT jsonb_build_object(
    'id', mes.id,
    'convenio_id', convenio.id,
    'convenio_nome', convenio.nome,
    'parceiro_id', convenio.parceiro_id,
    'parceiro_nome', parceiro.nome,
    'polo_id', mes.polo_id,
    'polo_nome', polo.nome,
    'competencia', mes.competencia,
    'status', mes.status,
    'saldo_inicial', mes.saldo_inicial,
    'creditos', totais.creditos,
    'despesas_pagas', totais.despesas_pagas,
    'despesas_pendentes', totais.despesas_pendentes,
    'saldo_disponivel', round(mes.saldo_inicial + totais.creditos - totais.despesas_pagas, 2),
    'saldo_projetado', round(
      mes.saldo_inicial + totais.creditos - totais.despesas_pagas - totais.despesas_pendentes,
      2
    ),
    'quantidade_creditos', totais.quantidade_creditos,
    'quantidade_despesas', totais.quantidade_despesas,
    'fechado_em', mes.fechado_em,
    'observacao', mes.observacao,
    'sucessora_id', sucessora.id
  )
  FROM public.convenios_financeiros_competencias mes
  JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
  JOIN public.polos polo ON polo.id = mes.polo_id
  LEFT JOIN public.parceiros parceiro ON parceiro.id = convenio.parceiro_id
  LEFT JOIN public.convenios_financeiros_competencias sucessora
    ON sucessora.competencia_anterior_id = mes.id
  CROSS JOIN totais
  WHERE mes.id = p_competencia_id;
$function$;

CREATE FUNCTION public.listar_convenios_financeiros_meses_secure(
  p_polo_id uuid,
  p_status_scope text DEFAULT 'TODOS',
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope text := upper(btrim(coalesce(p_status_scope, 'TODOS')));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_items jsonb;
  v_resumo jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (
    public.gestor_has_effective_financeiro_tab('convenios')
    AND (
      (p_polo_id IS NULL AND public.is_financeiro_global())
      OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos convênios financeiros.' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('ABERTOS', 'FINALIZADOS', 'TODOS') THEN
    RAISE EXCEPTION 'Escopo de status inválido.' USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT mes.*, convenio.nome AS convenio_nome
    FROM public.convenios_financeiros_competencias mes
    JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
    LEFT JOIN public.parceiros parceiro ON parceiro.id = convenio.parceiro_id
    WHERE (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
      AND (v_search IS NULL OR concat_ws(' ', convenio.nome, parceiro.nome, mes.competencia::text)
        ILIKE '%' || v_search || '%')
  ), itens AS (
    SELECT mes.*
    FROM base mes
    WHERE v_scope = 'TODOS'
      OR (v_scope = 'ABERTOS' AND mes.status = 'ABERTO')
      OR (v_scope = 'FINALIZADOS' AND mes.status = 'FINALIZADO')
  )
  SELECT coalesce(jsonb_agg(
    public.convenios_financeiros_mes_item_secure(item.id)
    ORDER BY item.competencia DESC, item.convenio_nome, item.id
  ), '[]'::jsonb)
  INTO v_items
  FROM itens item;

  WITH base AS (
    SELECT mes.id, mes.convenio_id, mes.status,
      public.convenios_financeiros_mes_item_secure(mes.id) AS item
    FROM public.convenios_financeiros_competencias mes
    JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
    LEFT JOIN public.parceiros parceiro ON parceiro.id = convenio.parceiro_id
    WHERE (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
      AND (v_search IS NULL OR concat_ws(' ', convenio.nome, parceiro.nome, mes.competencia::text)
        ILIKE '%' || v_search || '%')
  ), monetario AS (
    SELECT * FROM base
    WHERE v_scope = 'TODOS'
      OR (v_scope = 'ABERTOS' AND status = 'ABERTO')
      OR (v_scope = 'FINALIZADOS' AND status = 'FINALIZADO')
  )
  SELECT jsonb_build_object(
    'convenios_ativos', (SELECT count(DISTINCT base.convenio_id) FROM base),
    'meses_abertos', (SELECT count(*) FROM base WHERE base.status = 'ABERTO'),
    'meses_finalizados', (SELECT count(*) FROM base WHERE base.status = 'FINALIZADO'),
    'saldo_inicial', coalesce(sum((item ->> 'saldo_inicial')::numeric), 0),
    'creditos', coalesce(sum((item ->> 'creditos')::numeric), 0),
    'despesas_pagas', coalesce(sum((item ->> 'despesas_pagas')::numeric), 0),
    'despesas_pendentes', coalesce(sum((item ->> 'despesas_pendentes')::numeric), 0),
    'saldo_disponivel', coalesce(sum((item ->> 'saldo_disponivel')::numeric), 0),
    'saldo_projetado', coalesce(sum((item ->> 'saldo_projetado')::numeric), 0)
  ) INTO v_resumo
  FROM monetario;

  RETURN jsonb_build_object(
    'versao', 1,
    'resumo', v_resumo,
    'itens', v_items
  );
END;
$function$;

CREATE FUNCTION public.obter_convenio_financeiro_mes_secure(p_competencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mes public.convenios_financeiros_competencias%ROWTYPE;
  v_movimentos jsonb;
BEGIN
  SELECT * INTO v_mes
  FROM public.convenios_financeiros_competencias
  WHERE id = p_competencia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mês do convênio não encontrado.'; END IF;
  IF auth.role() <> 'service_role' AND NOT (
    public.is_financeiro_for_polo(v_mes.polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao mês do convênio.' USING ERRCODE = '42501';
  END IF;

  WITH movimentos AS (
    SELECT mes.id, 'SALDO_INICIAL'::text AS tipo, 'CONFIRMADO'::text AS status,
      mes.competencia AS data, 'Saldo transportado'::text AS descricao,
      mes.saldo_inicial AS valor, NULL::text AS conta_nome,
      mes.competencia_anterior_id AS origem_id, mes.observacao
    FROM public.convenios_financeiros_competencias mes WHERE mes.id = v_mes.id
    UNION ALL
    SELECT credito.id, 'CREDITO', 'CONFIRMADO', credito.data_credito,
      credito.descricao, credito.valor,
      concat_ws(' - ', conta.banco, conta.conta), credito.conta_receber_id, credito.observacao
    FROM public.convenios_financeiros_creditos credito
    JOIN public.contas_bancarias conta ON conta.id = credito.conta_bancaria_id
    WHERE credito.competencia_id = v_mes.id
    UNION ALL
    SELECT vinculo.id, 'DESPESA',
      CASE WHEN vinculo.status = 'ESTORNADO' THEN 'ESTORNADO'
        WHEN despesa.status IN ('PENDENTE', 'VENCIDO') THEN 'PENDENTE'
        ELSE despesa.status END,
      coalesce(despesa.data_pagamento, despesa.data_lancamento, despesa.data_vencimento),
      despesa.descricao, vinculo.valor_vinculado,
      concat_ws(' - ', conta.banco, conta.conta), despesa.id, despesa.observacao
    FROM public.convenios_financeiros_despesas vinculo
    JOIN public.despesas_lancamentos despesa ON despesa.id = vinculo.despesa_lancamento_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = despesa.conta_bancaria_id
    WHERE vinculo.competencia_id = v_mes.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'tipo', tipo, 'status', status, 'data', data,
    'descricao', descricao, 'valor', valor, 'conta_nome', conta_nome,
    'origem_id', origem_id, 'observacao', observacao
  ) ORDER BY data DESC, id), '[]'::jsonb)
  INTO v_movimentos FROM movimentos;

  RETURN jsonb_build_object(
    'versao', 1,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes.id),
    'movimentos', v_movimentos
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convenios_financeiros_mes_item_secure(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_convenios_financeiros_meses_secure(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obter_convenio_financeiro_mes_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_convenios_financeiros_meses_secure(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_convenio_financeiro_mes_secure(uuid)
  TO authenticated, service_role;

COMMIT;
