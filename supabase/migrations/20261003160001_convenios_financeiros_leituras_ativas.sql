BEGIN;

CREATE OR REPLACE FUNCTION public.listar_convenios_financeiros_meses_secure(
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
  IF coalesce(auth.role(), '') <> 'service_role' AND (
    coalesce(auth.role(), '') <> 'authenticated'
    OR auth.uid() IS NULL
    OR NOT coalesce(
      public.gestor_has_effective_financeiro_tab('convenios')
      AND (
        (p_polo_id IS NULL AND public.is_financeiro_global())
        OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
      ),
      false
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos convênios financeiros.'
      USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('ABERTOS', 'FINALIZADOS', 'TODOS') THEN
    RAISE EXCEPTION 'Escopo de status inválido.' USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT mes.*, convenio.nome AS convenio_nome
    FROM public.convenios_financeiros_competencias mes
    JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
    LEFT JOIN public.parceiros parceiro ON parceiro.id = convenio.parceiro_id
    WHERE convenio.status = 'ATIVO'
      AND (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
      AND (
        v_search IS NULL
        OR concat_ws(' ', convenio.nome, parceiro.nome, mes.competencia::text)
          ILIKE '%' || v_search || '%'
      )
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
    WHERE convenio.status = 'ATIVO'
      AND (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
      AND (
        v_search IS NULL
        OR concat_ws(' ', convenio.nome, parceiro.nome, mes.competencia::text)
          ILIKE '%' || v_search || '%'
      )
  ), monetario AS (
    SELECT *
    FROM base
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
  )
  INTO v_resumo
  FROM monetario;

  RETURN jsonb_build_object(
    'versao', 1,
    'resumo', v_resumo,
    'itens', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.obter_convenio_financeiro_mes_secure(
  p_competencia_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mes public.convenios_financeiros_competencias%ROWTYPE;
  v_convenio_status text;
  v_movimentos jsonb;
BEGIN
  SELECT mes.*
  INTO v_mes
  FROM public.convenios_financeiros_competencias mes
  WHERE mes.id = p_competencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mês do convênio não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role' AND (
    coalesce(auth.role(), '') <> 'authenticated'
    OR auth.uid() IS NULL
    OR NOT coalesce(
      public.is_financeiro_for_polo(v_mes.polo_id)
      AND public.gestor_has_effective_financeiro_tab('convenios'),
      false
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao mês do convênio.'
      USING ERRCODE = '42501';
  END IF;

  SELECT convenio.status
  INTO v_convenio_status
  FROM public.convenios_financeiros convenio
  WHERE convenio.id = v_mes.convenio_id;

  IF v_convenio_status IS DISTINCT FROM 'ATIVO' THEN
    RAISE EXCEPTION 'Mês do convênio não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  WITH movimentos AS (
    SELECT mes.id, 'SALDO_INICIAL'::text AS tipo, 'CONFIRMADO'::text AS status,
      mes.competencia AS data, 'Saldo transportado'::text AS descricao,
      mes.saldo_inicial AS valor, NULL::text AS conta_nome,
      mes.competencia_anterior_id AS origem_id, mes.observacao
    FROM public.convenios_financeiros_competencias mes
    WHERE mes.id = v_mes.id
    UNION ALL
    SELECT credito.id, 'CREDITO', 'CONFIRMADO', credito.data_credito,
      credito.descricao, credito.valor,
      concat_ws(' - ', conta.banco, conta.conta),
      credito.conta_receber_id, credito.observacao
    FROM public.convenios_financeiros_creditos credito
    JOIN public.contas_bancarias conta ON conta.id = credito.conta_bancaria_id
    WHERE credito.competencia_id = v_mes.id
    UNION ALL
    SELECT vinculo.id, 'DESPESA',
      CASE
        WHEN vinculo.status = 'ESTORNADO' THEN 'ESTORNADO'
        WHEN despesa.status IN ('PENDENTE', 'VENCIDO') THEN 'PENDENTE'
        ELSE despesa.status
      END,
      coalesce(despesa.data_pagamento, despesa.data_lancamento, despesa.data_vencimento),
      despesa.descricao, vinculo.valor_vinculado,
      concat_ws(' - ', conta.banco, conta.conta),
      despesa.id, despesa.observacao
    FROM public.convenios_financeiros_despesas vinculo
    JOIN public.despesas_lancamentos despesa ON despesa.id = vinculo.despesa_lancamento_id
    LEFT JOIN public.contas_bancarias conta ON conta.id = despesa.conta_bancaria_id
    WHERE vinculo.competencia_id = v_mes.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'tipo', tipo,
    'status', status,
    'data', data,
    'descricao', descricao,
    'valor', valor,
    'conta_nome', conta_nome,
    'origem_id', origem_id,
    'observacao', observacao
  ) ORDER BY data DESC, id), '[]'::jsonb)
  INTO v_movimentos
  FROM movimentos;

  RETURN jsonb_build_object(
    'versao', 1,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes.id),
    'movimentos', v_movimentos
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_caixa_convenios_resumo_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_competencia date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_items jsonb;
  v_quantidade integer;
  v_saldo_inicial numeric;
  v_creditos numeric;
  v_pagas numeric;
  v_aberto numeric;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (
    coalesce(auth.role(), '') <> 'authenticated'
    OR auth.uid() IS NULL
    OR NOT coalesce(
      (
        (p_polo_id IS NULL AND public.is_financeiro_global())
        OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
      )
      AND public.gestor_has_effective_financeiro_tab('convenios'),
      false
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao resumo de convênios do Caixa.'
      USING ERRCODE = '42501';
  END IF;

  WITH meses AS (
    SELECT
      mes.id,
      mes.convenio_id,
      convenio.nome,
      mes.competencia,
      mes.status,
      mes.saldo_inicial,
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
      ), 0)::numeric AS comprometido_aberto
    FROM public.convenios_financeiros_competencias mes
    JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
    WHERE convenio.status = 'ATIVO'
      AND mes.competencia = v_competencia
      AND (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
  )
  SELECT
    count(*)::integer,
    coalesce(sum(saldo_inicial), 0),
    coalesce(sum(creditos), 0),
    coalesce(sum(despesas_pagas), 0),
    coalesce(sum(comprometido_aberto), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'convenio_id', convenio_id,
      'nome', nome,
      'competencia', competencia,
      'status', status,
      'saldo_inicial', saldo_inicial,
      'creditos_recebidos', creditos,
      'despesas_pagas', despesas_pagas,
      'comprometido_aberto', comprometido_aberto,
      'saldo_disponivel', round(saldo_inicial + creditos - despesas_pagas, 2),
      'saldo_projetado', round(
        saldo_inicial + creditos - despesas_pagas - comprometido_aberto,
        2
      )
    ) ORDER BY nome, convenio_id), '[]'::jsonb)
  INTO v_quantidade, v_saldo_inicial, v_creditos, v_pagas, v_aberto, v_items
  FROM meses;

  RETURN jsonb_build_object(
    'versao', 1,
    'competencia', v_competencia,
    'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id', p_polo_id,
    'quantidade_convenios', v_quantidade,
    'saldo_inicial', v_saldo_inicial,
    'creditos_recebidos', v_creditos,
    'despesas_pagas', v_pagas,
    'comprometido_aberto', v_aberto,
    'saldo_disponivel', round(v_saldo_inicial + v_creditos - v_pagas, 2),
    'saldo_projetado', round(v_saldo_inicial + v_creditos - v_pagas - v_aberto, 2),
    'itens', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_convenios_financeiros_meses_secure(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obter_convenio_financeiro_mes_secure(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_caixa_convenios_resumo_secure(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_convenios_financeiros_meses_secure(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_convenio_financeiro_mes_secure(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_convenios_resumo_secure(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_convenios_financeiros_meses_secure(uuid, text, text) IS
  'Lista somente convênios ativos; registros arquivados permanecem preservados para auditoria.';

NOTIFY pgrst, 'reload schema';

COMMIT;
