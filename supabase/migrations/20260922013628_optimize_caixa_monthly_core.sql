-- Filter monthly facts before classification and reuse authorized bank positions.
-- Applied migrations remain immutable; exact source guards reject drift.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5s';
DO $patch$
DECLARE
  v_function regprocedure := 'public.get_caixa_prestacao_mensal_v2_core(uuid,date,integer)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
  v_change record;
  v_acl aclitem[];
  v_owner oid;
BEGIN
  SELECT proacl, proowner INTO STRICT v_acl, v_owner FROM pg_proc WHERE oid = v_function;
  IF encode(extensions.digest(v_definition, 'sha256'), 'hex') <>
    '692e631b234a84079005f1f838ee89e2b15006a1882fe14f0918aa4a5b9cd8b4' THEN
    RAISE EXCEPTION 'Caixa function changed; review and rebase the optimization.';
  END IF;
  FOR v_change IN SELECT * FROM (VALUES
    (
      'empty definer search path',
$before$ SET search_path TO 'public'$before$,
$after$ SET search_path TO ''$after$
    ),
    (
      'reject null identity',
$before$  IF auth.role() <> 'service_role'$before$,
$after$  IF auth.role() IS DISTINCT FROM 'service_role'$after$
    ),
    (
      'filter receipts before classification',
$before$    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
  ),
  receitas_mes AS MATERIALIZED ($before$,
$after$    LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
    WHERE cr.status = 'PAGO'
      AND cr.data_pagamento >= v_inicio
      AND cr.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
  ),
  receitas_mes AS MATERIALIZED ($after$
    ),
    (
      'filter standalone expenses before classification',
$before$    FROM public.contas_pagar cp
    WHERE cp.despesa_lancamento_id IS NULL

    UNION ALL$before$,
$after$    FROM public.contas_pagar cp
    WHERE cp.despesa_lancamento_id IS NULL
      AND cp.status = 'PAGO'
      AND cp.data_pagamento >= v_inicio
      AND cp.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL$after$
    ),
    (
      'filter expense entries before classification',
$before$    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = dl.categoria_financeira_id
  ),
  debitos_mes AS MATERIALIZED ($before$,
$after$    LEFT JOIN public.categorias_financeiras categoria
      ON categoria.id = dl.categoria_financeira_id
    WHERE dl.status = 'PAGO'
      AND dl.data_pagamento >= v_inicio
      AND dl.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  ),
  debitos_mes AS MATERIALIZED ($after$
    ),
    (
      'reuse all bank positions for unassigned shared balance',
$before$    ), 0)
  INTO
    v_contas,
    v_saldo_total,
    v_saldo_bancario,
    v_caixa_local,
    v_compartilhado_total,
    v_posicao_compartilhada
  FROM saldos;

  SELECT coalesce(sum(posicao.saldo_gerencial), 0)
  INTO v_saldo_nao_atribuido
  FROM public.get_contas_bancarias_posicoes_polos_secure() posicao
  JOIN public.contas_bancarias conta
    ON conta.id = posicao.conta_bancaria_id
  WHERE posicao.polo_id IS NULL
    AND (
      SELECT count(*)
      FROM public.contas_bancarias_polos acesso
      WHERE acesso.conta_bancaria_id = conta.id
    ) > 1;$before$,
$after$    ), 0),
    (
      SELECT coalesce(sum(posicao.saldo_gerencial), 0)
      FROM posicoes posicao
      JOIN public.contas_bancarias conta
        ON conta.id = posicao.conta_bancaria_id
      WHERE posicao.polo_id IS NULL
        AND (
          SELECT count(*)
          FROM public.contas_bancarias_polos acesso
          WHERE acesso.conta_bancaria_id = conta.id
        ) > 1
    )
  INTO
    v_contas,
    v_saldo_total,
    v_saldo_bancario,
    v_caixa_local,
    v_compartilhado_total,
    v_posicao_compartilhada,
    v_saldo_nao_atribuido
  FROM saldos;$after$
    )
  ) changes(label, before_text, after_text)
  LOOP
    IF (length(v_definition) - length(replace(v_definition, v_change.before_text, '')))
      / length(v_change.before_text) <> 1 THEN
      RAISE EXCEPTION 'Caixa optimization target is not unique: %', v_change.label;
    END IF;
    v_definition := replace(v_definition, v_change.before_text, v_change.after_text);
  END LOOP;
  EXECUTE v_definition;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef AND provolatile = 's'
      AND proconfig = ARRAY['search_path=""'] AND proacl IS NOT DISTINCT FROM v_acl
      AND proowner = v_owner
  ) THEN
    RAISE EXCEPTION 'Caixa optimization changed its privilege or execution contract.';
  END IF;
END;
$patch$;
NOTIFY pgrst, 'reload schema';

