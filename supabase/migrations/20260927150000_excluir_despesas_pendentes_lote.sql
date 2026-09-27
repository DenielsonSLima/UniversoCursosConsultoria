BEGIN;

-- “Excluir” na interface remove lançamentos ainda não pagos das leituras
-- operacionais, preservando a linha e a autoria para auditoria financeira.
ALTER TABLE public.despesas_lancamentos
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_por uuid,
  ADD COLUMN IF NOT EXISTS exclusao_request_id uuid;

CREATE TABLE IF NOT EXISTS public.despesas_exclusoes_requisicoes (
  request_id uuid PRIMARY KEY,
  polo_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')),
  actor_id uuid,
  despesa_ids uuid[] NOT NULL CHECK (cardinality(despesa_ids) BETWEEN 1 AND 100),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.despesas_exclusoes_requisicoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.despesas_exclusoes_requisicoes
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.excluir_despesas_pendentes_lote_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_tipo text,
  p_despesa_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_ids uuid[];
  v_payload jsonb;
  v_payload_hash text;
  v_replay public.despesas_exclusoes_requisicoes%ROWTYPE;
  v_quantidade integer;
  v_resultado jsonb;
BEGIN
  IF p_request_id IS NULL OR p_polo_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência e o polo são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF v_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO') THEN
    RAISE EXCEPTION 'Tipo de despesa inválido.' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND CASE
         WHEN v_tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para excluir estas despesas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_despesa_ids IS NULL OR cardinality(p_despesa_ids) NOT BETWEEN 1 AND 100
     OR array_position(p_despesa_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Selecione entre 1 e 100 lançamentos válidos.'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(item.id ORDER BY item.id)
  INTO v_ids
  FROM (SELECT DISTINCT unnest(p_despesa_ids) AS id) item;

  IF cardinality(v_ids) <> cardinality(p_despesa_ids) THEN
    RAISE EXCEPTION 'A seleção contém lançamentos repetidos.' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'poloId', p_polo_id,
    'tipo', v_tipo,
    'despesaIds', to_jsonb(v_ids)
  );
  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT *
  INTO v_replay
  FROM public.despesas_exclusoes_requisicoes
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_replay.actor_id IS DISTINCT FROM v_actor_id
       OR v_replay.polo_id IS DISTINCT FROM p_polo_id
       OR v_replay.tipo IS DISTINCT FROM v_tipo
       OR v_replay.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com outra seleção.';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  -- Ordem determinística evita deadlocks quando dois lotes se cruzam.
  PERFORM despesa.id
  FROM public.despesas_lancamentos despesa
  WHERE despesa.id = ANY(v_ids)
  ORDER BY despesa.id
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_quantidade
  FROM public.despesas_lancamentos despesa
  WHERE despesa.id = ANY(v_ids)
    AND despesa.polo_id = p_polo_id
    AND despesa.tipo = v_tipo
    AND despesa.status IN ('PENDENTE', 'VENCIDO')
    AND despesa.excluido_em IS NULL;

  IF v_quantidade <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'A seleção contém lançamento pago, já excluído ou fora do escopo. Nada foi alterado.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.despesas_lancamentos despesa
  SET status = 'CANCELADO',
      cancelamento_motivo = 'Excluído pelo gestor antes da baixa',
      cancelado_em = now(),
      cancelado_por = v_actor_id,
      estornado_em = NULL,
      excluido_em = now(),
      excluido_por = v_actor_id,
      exclusao_request_id = p_request_id,
      updated_at = now()
  WHERE despesa.id = ANY(v_ids);

  v_resultado := jsonb_build_object(
    'requestId', p_request_id,
    'despesaIds', to_jsonb(v_ids),
    'quantidade', cardinality(v_ids)
  );

  INSERT INTO public.despesas_exclusoes_requisicoes (
    request_id, polo_id, tipo, actor_id, despesa_ids, payload_hash, resultado
  ) VALUES (
    p_request_id, p_polo_id, v_tipo, v_actor_id, v_ids, v_payload_hash, v_resultado
  );

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.excluir_despesas_pendentes_lote_secure(
  uuid, uuid, text, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_despesas_pendentes_lote_secure(
  uuid, uuid, text, uuid[]
) TO authenticated, service_role;

COMMENT ON FUNCTION public.excluir_despesas_pendentes_lote_secure(
  uuid, uuid, text, uuid[]
) IS 'Exclusão lógica, atômica e idempotente de até 100 despesas ainda não pagas no mesmo polo e tipo.';

-- Mantém a leitura econômica anterior como núcleo e oculta somente registros
-- explicitamente excluídos. Cancelamentos/estornos comuns continuam no histórico.
ALTER FUNCTION public.listar_despesas_economicas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) RENAME TO listar_despesas_economicas_v2_core;

REVOKE ALL ON FUNCTION public.listar_despesas_economicas_v2_core(
  text, uuid, uuid, text, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.listar_despesas_economicas_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  despesa_lancamento_id uuid,
  polo_id uuid,
  polo_nome text,
  tipo text,
  descricao text,
  valor_base numeric,
  juros_valor numeric,
  multa_valor numeric,
  desconto_valor numeric,
  valor numeric,
  data_vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text,
  categoria_financeira_id uuid,
  categoria_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  forma_pagamento text,
  conta_bancaria_id uuid,
  parcela_numero integer,
  total_parcelas integer,
  grupo_parcelas_id uuid,
  observacao text,
  turma_id uuid,
  turma_nome text,
  anexo_bucket text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  created_at timestamptz,
  is_rateio_derivado boolean,
  rateio_modo text,
  rateio_polos_quantidade integer,
  polo_matriz_id uuid,
  polo_matriz_nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT item.*
  FROM public.listar_despesas_economicas_v2_core(
    p_tipo, p_polo_id, p_categoria_id, p_search,
    p_due_start, p_due_end, p_status_scope, p_turma_id
  ) item
  JOIN public.despesas_lancamentos despesa
    ON despesa.id = item.despesa_lancamento_id
  WHERE despesa.excluido_em IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.listar_despesas_economicas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_despesas_economicas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_despesas_economicas_secure(
  text, uuid, uuid, text, date, date, text, uuid
) IS 'Lista econômica de despesas visíveis; exclusões lógicas permanecem auditáveis e não retornam à interface.';

COMMIT;
