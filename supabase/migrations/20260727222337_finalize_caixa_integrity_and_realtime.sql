BEGIN;

-- Uma baixa financeira só existe com valor positivo, conta, data e meio de
-- pagamento. O lançamento continua pendente até que a RPC transacional grave
-- todos esses fatos em conjunto.
ALTER TABLE public.contas_pagar
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamento_completo_chk;

ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_pagamento_completo_chk
  CHECK (
    upper(status) <> 'PAGO'
    OR (
      conta_bancaria_id IS NOT NULL
      AND data_pagamento IS NOT NULL
      AND valor_pago IS NOT NULL
      AND valor_pago > 0
      AND forma_pagamento IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.contas_pagar
  VALIDATE CONSTRAINT contas_pagar_pagamento_completo_chk;

ALTER TABLE public.despesas_lancamentos
  DROP CONSTRAINT IF EXISTS despesas_lancamentos_pagamento_completo_chk;

ALTER TABLE public.despesas_lancamentos
  ADD CONSTRAINT despesas_lancamentos_pagamento_completo_chk
  CHECK (
    upper(status) <> 'PAGO'
    OR (
      conta_bancaria_id IS NOT NULL
      AND data_pagamento IS NOT NULL
      AND valor_pago IS NOT NULL
      AND valor_pago > 0
      AND forma_pagamento IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.despesas_lancamentos
  VALIDATE CONSTRAINT despesas_lancamentos_pagamento_completo_chk;

-- A conciliação mensal só considera conta efetivamente disponível para o polo
-- que originou o movimento.
CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_inicio date;
  v_fim date;
  v_recebimentos_conciliados integer := 0;
  v_recebimentos_pendentes integer := 0;
  v_pagamentos_conciliados integer := 0;
  v_pagamentos_pendentes integer := 0;
  v_movimentos_sem_data integer := 0;
  v_movimentos_sem_polo integer := 0;
  v_receitas_sem_modalidade integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(
           ARRAY['caixa', 'financeiro'],
           p_polo_id
         )
       )
     ) THEN
    RAISE EXCEPTION 'Acesso ao caixa fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_payload := public.get_caixa_prestacao_mensal_v2_core(
    p_polo_id,
    p_competencia,
    p_meses_historico
  );
  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim := (v_inicio + interval '1 month')::date;

  SELECT
    count(*) FILTER (
      WHERE cr.conta_bancaria_id IS NOT NULL
        AND cr.polo_id IS NOT NULL
        AND public.conta_bancaria_disponivel_no_polo(
          cr.conta_bancaria_id,
          cr.polo_id
        ) IS TRUE
    )::integer,
    count(*) FILTER (
      WHERE cr.conta_bancaria_id IS NULL
        OR cr.polo_id IS NULL
        OR public.conta_bancaria_disponivel_no_polo(
          cr.conta_bancaria_id,
          cr.polo_id
        ) IS NOT TRUE
    )::integer,
    count(*) FILTER (
      WHERE cr.polo_id IS NULL
    )::integer,
    count(*) FILTER (
      WHERE curso.modalidade IS NULL
        AND upper(coalesce(cr.categoria, '')) <> 'OUTROS_CREDITOS'
    )::integer
  INTO
    v_recebimentos_conciliados,
    v_recebimentos_pendentes,
    v_movimentos_sem_polo,
    v_receitas_sem_modalidade
  FROM public.contas_receber cr
  LEFT JOIN public.matriculas matricula
    ON matricula.id = cr.matricula_id
  LEFT JOIN public.turmas turma
    ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= v_inicio
    AND cr.data_pagamento < v_fim
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

  WITH pagamentos AS (
    SELECT
      cp.polo_id,
      cp.conta_bancaria_id,
      public.conta_bancaria_disponivel_no_polo(
        cp.conta_bancaria_id,
        cp.polo_id
      ) AS conta_valida
    FROM public.contas_pagar cp
    WHERE cp.status = 'PAGO'
      AND cp.despesa_lancamento_id IS NULL
      AND cp.data_pagamento >= v_inicio
      AND cp.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)

    UNION ALL

    SELECT
      dl.polo_id,
      dl.conta_bancaria_id,
      public.conta_bancaria_disponivel_no_polo(
        dl.conta_bancaria_id,
        dl.polo_id
      ) AS conta_valida
    FROM public.despesas_lancamentos dl
    WHERE dl.status = 'PAGO'
      AND dl.data_pagamento >= v_inicio
      AND dl.data_pagamento < v_fim
      AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
  )
  SELECT
    count(*) FILTER (
      WHERE conta_bancaria_id IS NOT NULL
        AND polo_id IS NOT NULL
        AND conta_valida IS TRUE
    )::integer,
    count(*) FILTER (
      WHERE conta_bancaria_id IS NULL
        OR polo_id IS NULL
        OR conta_valida IS NOT TRUE
    )::integer,
    v_movimentos_sem_polo
      + count(*) FILTER (WHERE polo_id IS NULL)::integer
  INTO
    v_pagamentos_conciliados,
    v_pagamentos_pendentes,
    v_movimentos_sem_polo
  FROM pagamentos;

  SELECT
    (
      SELECT count(*)::integer
      FROM public.contas_receber cr
      WHERE cr.status = 'PAGO'
        AND cr.data_pagamento IS NULL
        AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    )
    + (
      SELECT count(*)::integer
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND cp.data_pagamento IS NULL
        AND cp.despesa_lancamento_id IS NULL
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    )
    + (
      SELECT count(*)::integer
      FROM public.despesas_lancamentos dl
      WHERE dl.status = 'PAGO'
        AND dl.data_pagamento IS NULL
        AND (p_polo_id IS NULL OR dl.polo_id = p_polo_id)
    )
  INTO v_movimentos_sem_data;

  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,recebimentos_conciliados}',
    to_jsonb(v_recebimentos_conciliados),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,pagamentos_conciliados}',
    to_jsonb(v_pagamentos_conciliados),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{conciliacao,pendentes}',
    to_jsonb(
      v_recebimentos_pendentes
      + v_pagamentos_pendentes
      + v_movimentos_sem_data
    ),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,movimentos_sem_polo}',
    to_jsonb(v_movimentos_sem_polo),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,pagamentos_sem_conta}',
    to_jsonb(v_recebimentos_pendentes + v_pagamentos_pendentes),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,pagamentos_sem_data}',
    to_jsonb(v_movimentos_sem_data),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{qualidade_dados,receitas_sem_modalidade}',
    to_jsonb(v_receitas_sem_modalidade),
    true
  );

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_secure(
  uuid,
  date,
  integer
) TO authenticated, service_role;

-- Em UPDATE, invalida tanto o escopo antigo quanto o novo. Alterar um vínculo
-- compartilhado invalida todas as unidades que enxergam a conta.
CREATE OR REPLACE FUNCTION public.emit_caixa_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_entity_id uuid;
  v_account_ids uuid[] := ARRAY[]::uuid[];
  v_polo_ids uuid[] := ARRAY[]::uuid[];
  v_polo_id uuid;
  v_event_id bigint;
BEGIN
  v_entity_id := coalesce(
    nullif(v_new ->> 'id', '')::uuid,
    nullif(v_new ->> 'conta_bancaria_id', '')::uuid,
    nullif(v_old ->> 'id', '')::uuid,
    nullif(v_old ->> 'conta_bancaria_id', '')::uuid
  );

  IF TG_ARGV[0] = 'ACCOUNT' THEN
    v_account_ids := ARRAY[
      nullif(v_new ->> 'id', '')::uuid,
      nullif(v_old ->> 'id', '')::uuid
    ];

    SELECT coalesce(array_agg(DISTINCT polo), ARRAY[]::uuid[])
    INTO v_polo_ids
    FROM (
      SELECT acesso.polo_id AS polo
      FROM public.contas_bancarias_polos acesso
      WHERE acesso.conta_bancaria_id = ANY(v_account_ids)

      UNION

      SELECT nullif(v_new ->> 'polo_id', '')::uuid

      UNION

      SELECT nullif(v_old ->> 'polo_id', '')::uuid
    ) polos
    WHERE polo IS NOT NULL;
  ELSIF TG_ARGV[0] = 'ACCOUNT_LINK' THEN
    v_account_ids := ARRAY[
      nullif(v_new ->> 'conta_bancaria_id', '')::uuid,
      nullif(v_old ->> 'conta_bancaria_id', '')::uuid
    ];

    SELECT coalesce(array_agg(DISTINCT polo), ARRAY[]::uuid[])
    INTO v_polo_ids
    FROM (
      SELECT acesso.polo_id AS polo
      FROM public.contas_bancarias_polos acesso
      WHERE acesso.conta_bancaria_id = ANY(v_account_ids)

      UNION

      SELECT nullif(v_new ->> 'polo_id', '')::uuid

      UNION

      SELECT nullif(v_old ->> 'polo_id', '')::uuid
    ) polos
    WHERE polo IS NOT NULL;
  ELSIF TG_ARGV[0] = 'TRANSFER' THEN
    v_polo_ids := ARRAY[
      nullif(v_new ->> 'polo_origem_id', '')::uuid,
      nullif(v_new ->> 'polo_destino_id', '')::uuid,
      nullif(v_old ->> 'polo_origem_id', '')::uuid,
      nullif(v_old ->> 'polo_destino_id', '')::uuid
    ];
  ELSE
    v_polo_ids := ARRAY[
      nullif(v_new ->> 'polo_id', '')::uuid,
      nullif(v_old ->> 'polo_id', '')::uuid
    ];
  END IF;

  IF cardinality(v_polo_ids) = 0 THEN
    v_polo_ids := ARRAY[NULL::uuid];
  END IF;

  FOR v_polo_id IN
    SELECT DISTINCT polo
    FROM unnest(v_polo_ids) AS polo
  LOOP
    INSERT INTO public.finance_realtime_events (
      source_table,
      event_type,
      entity_id,
      polo_id,
      aluno_id,
      turma_id
    )
    VALUES (
      TG_TABLE_NAME,
      TG_OP,
      v_entity_id,
      v_polo_id,
      NULL,
      coalesce(
        nullif(v_new ->> 'turma_id', '')::uuid,
        nullif(v_old ->> 'turma_id', '')::uuid
      )
    )
    RETURNING id INTO v_event_id;
  END LOOP;

  IF coalesce(v_event_id, 0) % 100 = 0 THEN
    DELETE FROM public.finance_realtime_events
    WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS contas_bancarias_emit_caixa_event
  ON public.contas_bancarias;
CREATE TRIGGER contas_bancarias_emit_caixa_event
BEFORE INSERT OR UPDATE OR DELETE ON public.contas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ACCOUNT');

DROP TRIGGER IF EXISTS contas_bancarias_polos_emit_caixa_event
  ON public.contas_bancarias_polos;
CREATE TRIGGER contas_bancarias_polos_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.contas_bancarias_polos
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ACCOUNT_LINK');

REVOKE ALL ON FUNCTION public.emit_caixa_realtime_event()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.emit_caixa_realtime_event() IS
  'Invalida os escopos antigo e novo do Caixa e todas as unidades vinculadas a contas compartilhadas.';

COMMIT;
