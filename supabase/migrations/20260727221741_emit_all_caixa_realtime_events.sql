BEGIN;

CREATE OR REPLACE FUNCTION public.emit_caixa_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_entity_id uuid;
  v_owner_polo_id uuid;
  v_polo_id uuid;
  v_polo_ids uuid[] := ARRAY[]::uuid[];
  v_event_id bigint;
BEGIN
  v_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  v_entity_id := coalesce(
    nullif(v_row ->> 'id', '')::uuid,
    nullif(v_row ->> 'conta_bancaria_id', '')::uuid
  );
  v_owner_polo_id := nullif(v_row ->> 'polo_id', '')::uuid;

  IF TG_ARGV[0] = 'ACCOUNT' THEN
    SELECT coalesce(array_agg(DISTINCT acesso.polo_id), ARRAY[]::uuid[])
    INTO v_polo_ids
    FROM public.contas_bancarias_polos acesso
    WHERE acesso.conta_bancaria_id = v_entity_id;

    IF cardinality(v_polo_ids) = 0 THEN
      v_polo_ids := ARRAY[v_owner_polo_id];
    END IF;
  ELSIF TG_ARGV[0] = 'TRANSFER' THEN
    v_polo_ids := ARRAY[
      nullif(v_row ->> 'polo_origem_id', '')::uuid,
      nullif(v_row ->> 'polo_destino_id', '')::uuid
    ];
  ELSE
    v_polo_ids := ARRAY[v_owner_polo_id];
  END IF;

  FOR v_polo_id IN
    SELECT DISTINCT polo
    FROM unnest(v_polo_ids) polo
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
      nullif(v_row ->> 'turma_id', '')::uuid
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

DROP TRIGGER IF EXISTS contas_pagar_emit_caixa_event
  ON public.contas_pagar;
CREATE TRIGGER contas_pagar_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.contas_pagar
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');

DROP TRIGGER IF EXISTS despesas_lancamentos_emit_caixa_event
  ON public.despesas_lancamentos;
CREATE TRIGGER despesas_lancamentos_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.despesas_lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');

DROP TRIGGER IF EXISTS contas_bancarias_emit_caixa_event
  ON public.contas_bancarias;
CREATE TRIGGER contas_bancarias_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.contas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ACCOUNT');

DROP TRIGGER IF EXISTS contas_bancarias_polos_emit_caixa_event
  ON public.contas_bancarias_polos;
CREATE TRIGGER contas_bancarias_polos_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.contas_bancarias_polos
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');

DROP TRIGGER IF EXISTS transferencias_contas_emit_caixa_event
  ON public.transferencias_contas;
CREATE TRIGGER transferencias_contas_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.transferencias_contas
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('TRANSFER');

REVOKE ALL ON FUNCTION public.emit_caixa_realtime_event()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.emit_caixa_realtime_event() IS
  'Emite invalidações leves e escopadas por polo para todos os movimentos que alteram o Caixa.';

COMMIT;
