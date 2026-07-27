BEGIN;

-- Disponibilidade operacional continua exigindo conta e polo ativos. Para
-- conciliação histórica, porém, basta que o vínculo contábil exista: inativar
-- uma conta não pode reclassificar retroativamente um recebimento já baixado.
CREATE OR REPLACE FUNCTION public.conta_bancaria_vinculada_ao_polo(
  p_conta_bancaria_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_conta_bancaria_id IS NOT NULL
    AND p_polo_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.contas_bancarias cb
      JOIN public.contas_bancarias_polos acesso
        ON acesso.conta_bancaria_id = cb.id
      JOIN public.polos polo
        ON polo.id = acesso.polo_id
      WHERE cb.id = p_conta_bancaria_id
        AND acesso.polo_id = p_polo_id
    );
$$;

REVOKE ALL ON FUNCTION public.conta_bancaria_vinculada_ao_polo(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conta_bancaria_vinculada_ao_polo(uuid, uuid)
  TO service_role;

-- A função mensal foi criada na migration anterior. A troca é deliberadamente
-- limitada ao predicado de conciliação; autorização, agregações e contrato JSON
-- permanecem idênticos.
DO $$
DECLARE
  v_definition text;
  v_updated_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)'::regprocedure
  )
  INTO v_definition;

  IF position(
    'public.conta_bancaria_disponivel_no_polo(' IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'Predicado operacional esperado não foi encontrado na RPC mensal do Caixa.';
  END IF;

  v_updated_definition := replace(
    v_definition,
    'public.conta_bancaria_disponivel_no_polo(',
    'public.conta_bancaria_vinculada_ao_polo('
  );

  EXECUTE v_updated_definition;
END;
$$;

-- Todos os movimentos notificam o polo de origem/destino e cada unidade que
-- enxerga o saldo físico das contas envolvidas. Ausência de polo gera evento
-- global, sem atribuir silenciosamente o valor à matriz.
CREATE OR REPLACE FUNCTION public.emit_caixa_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE
    WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD)
    ELSE '{}'::jsonb
  END;
  v_new jsonb := CASE
    WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW)
    ELSE '{}'::jsonb
  END;
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

  v_account_ids := array_remove(ARRAY[
    nullif(v_new ->> 'conta_bancaria_id', '')::uuid,
    nullif(v_old ->> 'conta_bancaria_id', '')::uuid,
    nullif(v_new ->> 'conta_origem_id', '')::uuid,
    nullif(v_old ->> 'conta_origem_id', '')::uuid,
    nullif(v_new ->> 'conta_destino_id', '')::uuid,
    nullif(v_old ->> 'conta_destino_id', '')::uuid
  ], NULL);

  IF TG_ARGV[0] = 'ACCOUNT' THEN
    v_account_ids := array_remove(ARRAY[
      nullif(v_new ->> 'id', '')::uuid,
      nullif(v_old ->> 'id', '')::uuid
    ], NULL);
  ELSIF TG_ARGV[0] = 'ACCOUNT_LINK' THEN
    v_account_ids := array_remove(ARRAY[
      nullif(v_new ->> 'conta_bancaria_id', '')::uuid,
      nullif(v_old ->> 'conta_bancaria_id', '')::uuid
    ], NULL);
  END IF;

  IF TG_ARGV[0] = 'TRANSFER' THEN
    IF TG_OP <> 'DELETE' THEN
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_new ->> 'polo_id', '')::uuid
      );
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_new ->> 'polo_origem_id', '')::uuid
      );
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_new ->> 'polo_destino_id', '')::uuid
      );
    END IF;
    IF TG_OP <> 'INSERT' THEN
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_old ->> 'polo_id', '')::uuid
      );
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_old ->> 'polo_origem_id', '')::uuid
      );
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_old ->> 'polo_destino_id', '')::uuid
      );
    END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_new ->> 'polo_id', '')::uuid
      );
    END IF;
    IF TG_OP <> 'INSERT' THEN
      v_polo_ids := array_append(
        v_polo_ids,
        nullif(v_old ->> 'polo_id', '')::uuid
      );
    END IF;
  END IF;

  SELECT coalesce(array_agg(DISTINCT escopo.polo_id), ARRAY[]::uuid[])
  INTO v_polo_ids
  FROM (
    SELECT polo AS polo_id
    FROM unnest(v_polo_ids) AS polo

    UNION

    SELECT acesso.polo_id
    FROM public.contas_bancarias_polos acesso
    WHERE acesso.conta_bancaria_id = ANY(v_account_ids)
  ) escopo;

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
      CASE
        WHEN v_polo_id IS NOT DISTINCT FROM coalesce(
          nullif(v_new ->> 'polo_id', '')::uuid,
          nullif(v_old ->> 'polo_id', '')::uuid
        )
        THEN coalesce(
          nullif(v_new ->> 'turma_id', '')::uuid,
          nullif(v_old ->> 'turma_id', '')::uuid
        )
        ELSE NULL
      END
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

-- Recebimentos preservam a notificação do aluno, mas somente no evento do polo
-- de origem. Eventos adicionais da conta compartilhada não expõem aluno/turma
-- a gestores de outras unidades.
CREATE OR REPLACE FUNCTION public.emit_finance_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE
    WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD)
    ELSE '{}'::jsonb
  END;
  v_new jsonb := CASE
    WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW)
    ELSE '{}'::jsonb
  END;
  v_origin_polo_ids uuid[] := ARRAY[]::uuid[];
  v_polo_ids uuid[] := ARRAY[]::uuid[];
  v_account_ids uuid[] := ARRAY[]::uuid[];
  v_polo_id uuid;
  v_aluno_id uuid;
  v_turma_id uuid;
  v_event_id bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_origin_polo_ids := array_append(
      v_origin_polo_ids,
      nullif(v_new ->> 'polo_id', '')::uuid
    );
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_origin_polo_ids := array_append(
      v_origin_polo_ids,
      nullif(v_old ->> 'polo_id', '')::uuid
    );
  END IF;

  v_account_ids := array_remove(ARRAY[
    nullif(v_new ->> 'conta_bancaria_id', '')::uuid,
    nullif(v_old ->> 'conta_bancaria_id', '')::uuid
  ], NULL);
  v_aluno_id := coalesce(
    nullif(v_new ->> 'cliente_id', '')::uuid,
    nullif(v_old ->> 'cliente_id', '')::uuid
  );
  v_turma_id := coalesce(
    nullif(v_new ->> 'turma_id', '')::uuid,
    nullif(v_old ->> 'turma_id', '')::uuid
  );

  SELECT coalesce(array_agg(DISTINCT escopo.polo_id), ARRAY[]::uuid[])
  INTO v_polo_ids
  FROM (
    SELECT polo AS polo_id
    FROM unnest(v_origin_polo_ids) AS polo

    UNION

    SELECT acesso.polo_id
    FROM public.contas_bancarias_polos acesso
    WHERE acesso.conta_bancaria_id = ANY(v_account_ids)
  ) escopo;

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
      coalesce(
        nullif(v_new ->> 'id', '')::uuid,
        nullif(v_old ->> 'id', '')::uuid
      ),
      v_polo_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(v_origin_polo_ids) AS origem(polo)
          WHERE origem.polo IS NOT DISTINCT FROM v_polo_id
        )
        THEN v_aluno_id
        ELSE NULL
      END,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(v_origin_polo_ids) AS origem(polo)
          WHERE origem.polo IS NOT DISTINCT FROM v_polo_id
        )
        THEN v_turma_id
        ELSE NULL
      END
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

REVOKE ALL ON FUNCTION public.emit_caixa_realtime_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_finance_realtime_event()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.conta_bancaria_vinculada_ao_polo(uuid, uuid) IS
  'Valida vínculo histórico conta-polo sem reabrir conta inativa para novas baixas.';
COMMENT ON FUNCTION public.emit_caixa_realtime_event() IS
  'Invalida origem, destino e todas as unidades que exibem as contas movimentadas.';
COMMENT ON FUNCTION public.emit_finance_realtime_event() IS
  'Emite evento do recebimento para aluno/origem e invalida demais polos da conta sem expor dados acadêmicos.';

COMMIT;
