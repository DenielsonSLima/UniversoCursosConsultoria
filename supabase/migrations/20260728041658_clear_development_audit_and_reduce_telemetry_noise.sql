BEGIN;

-- A tabela contém somente a auditoria de desenvolvimento/homologação.
-- Não há FKs apontando para ela e nenhum cadastro operacional é afetado.
TRUNCATE TABLE public.sistema_eventos;

-- Mantém INSERT/DELETE integralmente auditados. Em UPDATE, ignora somente
-- telemetria técnica de sincronização que não altera o estado financeiro.
DROP TRIGGER IF EXISTS trg_sistema_eventos_audit
  ON public.contas_receber;
DROP TRIGGER IF EXISTS trg_sistema_eventos_audit_insert_delete
  ON public.contas_receber;
DROP TRIGGER IF EXISTS trg_sistema_eventos_audit_meaningful_update
  ON public.contas_receber;

CREATE TRIGGER trg_sistema_eventos_audit_insert_delete
AFTER INSERT OR DELETE ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.registrar_sistema_evento_trigger();

CREATE TRIGGER trg_sistema_eventos_audit_meaningful_update
AFTER UPDATE ON public.contas_receber
FOR EACH ROW
WHEN (
  (
    to_jsonb(OLD) - ARRAY[
      'updated_at',
      'gateway_synced_at',
      'asaas_synced_at'
    ]::text[]
  )
  IS DISTINCT FROM
  (
    to_jsonb(NEW) - ARRAY[
      'updated_at',
      'gateway_synced_at',
      'asaas_synced_at'
    ]::text[]
  )
)
EXECUTE FUNCTION public.registrar_sistema_evento_trigger();

COMMENT ON TRIGGER trg_sistema_eventos_audit_meaningful_update
  ON public.contas_receber IS
  'Audita alterações financeiras, operacionais e erros do gateway; ignora somente timestamps técnicos de sincronização.';

-- Evita invalidar telas financeiras a cada heartbeat. Mudanças de erro,
-- status, valor, pagamento e demais campos continuam emitindo Realtime.
DROP TRIGGER IF EXISTS contas_receber_emit_realtime_event
  ON public.contas_receber;
DROP TRIGGER IF EXISTS contas_receber_emit_realtime_insert_delete
  ON public.contas_receber;
DROP TRIGGER IF EXISTS contas_receber_emit_realtime_meaningful_update
  ON public.contas_receber;

CREATE TRIGGER contas_receber_emit_realtime_insert_delete
AFTER INSERT OR DELETE ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.emit_finance_realtime_event();

CREATE TRIGGER contas_receber_emit_realtime_meaningful_update
AFTER UPDATE ON public.contas_receber
FOR EACH ROW
WHEN (
  (
    to_jsonb(OLD) - ARRAY[
      'updated_at',
      'gateway_synced_at',
      'asaas_synced_at'
    ]::text[]
  )
  IS DISTINCT FROM
  (
    to_jsonb(NEW) - ARRAY[
      'updated_at',
      'gateway_synced_at',
      'asaas_synced_at'
    ]::text[]
  )
)
EXECUTE FUNCTION public.emit_finance_realtime_event();

COMMENT ON TRIGGER contas_receber_emit_realtime_meaningful_update
  ON public.contas_receber IS
  'Emite Realtime para mudanças relevantes; heartbeat de sincronização isolado não invalida as telas.';

-- Defesa em profundidade: caso uma integração antiga volte a gravar auditoria
-- puramente técnica, mantém apenas 30 dias desse ruído sem tocar em eventos
-- financeiros reais, pagamentos, valores, vencimentos, status ou exclusões.
CREATE OR REPLACE FUNCTION public.prune_sistema_eventos_technical_noise()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  WITH deleted AS (
    DELETE FROM public.sistema_eventos evento
    WHERE evento.created_at < now() - interval '30 days'
      AND evento.entidade = 'contas_receber'
      AND evento.acao = 'Atualizou'
      AND jsonb_typeof(evento.detalhes -> 'camposAlterados') = 'array'
      AND jsonb_array_length(
        CASE
          WHEN jsonb_typeof(evento.detalhes -> 'camposAlterados') = 'array'
            THEN evento.detalhes -> 'camposAlterados'
          ELSE '[]'::jsonb
        END
      ) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(evento.detalhes -> 'camposAlterados') = 'array'
              THEN evento.detalhes -> 'camposAlterados'
            ELSE '[]'::jsonb
          END
        ) AS campo(nome)
        WHERE campo.nome <> ALL (ARRAY[
          'updated_at',
          'gateway_synced_at',
          'asaas_synced_at'
        ]::text[])
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.prune_sistema_eventos_technical_noise() IS
  'Remove somente auditoria técnica repetitiva de sincronização com mais de 30 dias.';

REVOKE ALL ON FUNCTION public.prune_sistema_eventos_technical_noise()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_sistema_eventos_technical_noise()
  TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'prune-system-audit-technical-noise-daily'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'prune-system-audit-technical-noise-daily',
    '20 3 * * *',
    'select public.prune_sistema_eventos_technical_noise();'
  );
END;
$$;

COMMIT;
