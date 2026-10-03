BEGIN;

ALTER TABLE public.convenios_financeiros_operacoes_requisicoes
  DROP CONSTRAINT IF EXISTS convenios_financeiros_operacoes_requisicoes_operacao_check;

ALTER TABLE public.convenios_financeiros_operacoes_requisicoes
  ADD CONSTRAINT convenios_financeiros_operacoes_requisicoes_operacao_check
  CHECK (operacao IN (
    'CRIAR_CONVENIO',
    'LANCAR_CREDITO',
    'VINCULAR_DESPESA',
    'CRIAR_DESPESA',
    'FINALIZAR_MES',
    'ARQUIVAR_CONVENIO'
  ));

CREATE FUNCTION public.convenios_financeiros_bloquear_mutacao_arquivado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT convenio.status
    INTO v_status
    FROM public.convenios_financeiros convenio
    WHERE convenio.id = OLD.convenio_id
    FOR KEY SHARE;

    IF v_status IS DISTINCT FROM 'ATIVO' THEN
      RAISE EXCEPTION 'Convênio excluído não pode receber alterações.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE'
     AND (TG_OP = 'INSERT' OR NEW.convenio_id IS DISTINCT FROM OLD.convenio_id) THEN
    SELECT convenio.status
    INTO v_status
    FROM public.convenios_financeiros convenio
    WHERE convenio.id = NEW.convenio_id
    FOR KEY SHARE;

    IF v_status IS DISTINCT FROM 'ATIVO' THEN
      RAISE EXCEPTION 'Convênio excluído não pode receber alterações.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER convenios_financeiros_competencias_archive_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.convenios_financeiros_competencias
FOR EACH ROW
EXECUTE FUNCTION public.convenios_financeiros_bloquear_mutacao_arquivado();

CREATE TRIGGER convenios_financeiros_creditos_archive_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.convenios_financeiros_creditos
FOR EACH ROW
EXECUTE FUNCTION public.convenios_financeiros_bloquear_mutacao_arquivado();

CREATE TRIGGER convenios_financeiros_despesas_archive_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.convenios_financeiros_despesas
FOR EACH ROW
EXECUTE FUNCTION public.convenios_financeiros_bloquear_mutacao_arquivado();

CREATE FUNCTION public.excluir_convenio_financeiro_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_convenio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_convenio public.convenios_financeiros%ROWTYPE;
  v_mes public.convenios_financeiros_competencias%ROWTYPE;
  v_competencia_id uuid;
  v_competencia_ids uuid[] := ARRAY[]::uuid[];
  v_payload jsonb;
  v_hash text;
  v_replay public.convenios_financeiros_operacoes_requisicoes%ROWTYPE;
  v_resultado jsonb;
  v_operacoes integer;
  v_precheck_pristine boolean;
BEGIN
  IF p_request_id IS NULL OR p_polo_id IS NULL OR p_convenio_id IS NULL THEN
    RAISE EXCEPTION 'Requisição, polo e convênio são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role' AND (
    coalesce(auth.role(), '') <> 'authenticated'
    OR auth.uid() IS NULL
    OR NOT coalesce(
      public.is_financeiro_for_polo(p_polo_id)
      AND public.gestor_has_effective_financeiro_tab('convenios'),
      false
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para excluir convênio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT convenio.*
  INTO v_convenio
  FROM public.convenios_financeiros convenio
  WHERE convenio.id = p_convenio_id
    AND convenio.polo_id = p_polo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado neste polo.'
      USING ERRCODE = 'P0002';
  END IF;

  v_payload := jsonb_build_object(
    'poloId', p_polo_id,
    'convenioId', p_convenio_id
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Crédito e fechamento também começam pela competência. Repetir a ordem
  -- antes da trava de request evita o ciclo mês -> request versus request -> mês.
  PERFORM mes.id
  FROM public.convenios_financeiros_competencias mes
  WHERE mes.convenio_id = p_convenio_id
  ORDER BY mes.id
  FOR UPDATE;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT operacao.*
  INTO v_replay
  FROM public.convenios_financeiros_operacoes_requisicoes operacao
  WHERE operacao.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_replay.convenio_id IS DISTINCT FROM p_convenio_id
       OR v_replay.operacao <> 'ARQUIVAR_CONVENIO'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'A chave de idempotência da exclusão já foi usada com dados diferentes.'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_set(v_replay.resultado, '{replayed}', 'true'::jsonb, true);
  END IF;

  -- Uma sucessora confirmada depois do snapshot da primeira varredura não pode
  -- ser esperada enquanto a raiz estiver travada: um crédito nela pode seguir
  -- a ordem mês -> raiz. Este precheck fresco rejeita histórico antes da raiz.
  SELECT
    count(*) = 1
    AND coalesce(bool_and(
      mes.status = 'ABERTO'
      AND mes.saldo_inicial = 0
      AND mes.creditos_fechamento IS NULL
      AND mes.despesas_fechamento IS NULL
      AND mes.saldo_final IS NULL
      AND mes.competencia_anterior_id IS NULL
      AND mes.fechado_em IS NULL
      AND mes.fechado_por IS NULL
    ), false)
    AND NOT EXISTS (
      SELECT 1
      FROM public.convenios_financeiros_creditos credito
      WHERE credito.convenio_id = p_convenio_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.convenios_financeiros_despesas despesa
      WHERE despesa.convenio_id = p_convenio_id
    )
    AND (
      SELECT count(*) = 1
        AND coalesce(bool_and(operacao.operacao = 'CRIAR_CONVENIO'), false)
      FROM public.convenios_financeiros_operacoes_requisicoes operacao
      WHERE operacao.convenio_id = p_convenio_id
    )
  INTO v_precheck_pristine
  FROM public.convenios_financeiros_competencias mes
  WHERE mes.convenio_id = p_convenio_id;

  IF NOT coalesce(v_precheck_pristine, false) THEN
    RAISE EXCEPTION
      'Somente convênio vazio, sem histórico financeiro ou competências encerradas, pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  SELECT convenio.*
  INTO v_convenio
  FROM public.convenios_financeiros convenio
  WHERE convenio.id = p_convenio_id
    AND convenio.polo_id = p_polo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado neste polo.'
      USING ERRCODE = 'P0002';
  END IF;

  v_competencia_ids := ARRAY[]::uuid[];
  FOR v_competencia_id IN
    SELECT mes.id
    FROM public.convenios_financeiros_competencias mes
    WHERE mes.convenio_id = p_convenio_id
    ORDER BY mes.id
    FOR UPDATE
  LOOP
    v_competencia_ids := array_append(v_competencia_ids, v_competencia_id);
  END LOOP;

  IF v_convenio.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'O convênio já foi excluído.'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(v_competencia_ids) <> 1 THEN
    RAISE EXCEPTION
      'Somente convênio vazio, sem histórico financeiro ou competências encerradas, pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  SELECT mes.*
  INTO v_mes
  FROM public.convenios_financeiros_competencias mes
  WHERE mes.id = v_competencia_ids[1];

  IF v_mes.status <> 'ABERTO'
     OR v_mes.saldo_inicial <> 0
     OR v_mes.creditos_fechamento IS NOT NULL
     OR v_mes.despesas_fechamento IS NOT NULL
     OR v_mes.saldo_final IS NOT NULL
     OR v_mes.competencia_anterior_id IS NOT NULL
     OR v_mes.fechado_em IS NOT NULL
     OR v_mes.fechado_por IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.convenios_financeiros_competencias sucessora
       WHERE sucessora.competencia_anterior_id = v_mes.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.convenios_financeiros_creditos credito
       WHERE credito.convenio_id = p_convenio_id
          OR credito.competencia_id = v_mes.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.convenios_financeiros_despesas despesa
       WHERE despesa.convenio_id = p_convenio_id
          OR despesa.competencia_id = v_mes.id
     ) THEN
    RAISE EXCEPTION
      'Somente convênio vazio, sem histórico financeiro ou competências encerradas, pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
  INTO v_operacoes
  FROM public.convenios_financeiros_operacoes_requisicoes operacao
  WHERE operacao.convenio_id = p_convenio_id;

  IF v_operacoes <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.convenios_financeiros_operacoes_requisicoes operacao
    WHERE operacao.convenio_id = p_convenio_id
      AND operacao.operacao = 'CRIAR_CONVENIO'
      AND operacao.competencia_id = v_mes.id
  ) THEN
    RAISE EXCEPTION
      'Somente convênio vazio, sem histórico financeiro ou competências encerradas, pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.convenios_financeiros
  SET status = 'ARQUIVADO',
      updated_at = now()
  WHERE id = p_convenio_id;

  v_resultado := jsonb_build_object(
    'replayed', false,
    'convenio_id', p_convenio_id,
    'polo_id', p_polo_id,
    'competencia_ids', to_jsonb(v_competencia_ids)
  );

  INSERT INTO public.convenios_financeiros_operacoes_requisicoes (
    request_id,
    convenio_id,
    competencia_id,
    operacao,
    actor_id,
    payload_hash,
    resultado
  ) VALUES (
    p_request_id,
    p_convenio_id,
    v_mes.id,
    'ARQUIVAR_CONVENIO',
    auth.uid(),
    v_hash,
    v_resultado
  );

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.convenios_financeiros_bloquear_mutacao_arquivado()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.excluir_convenio_financeiro_secure(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_convenio_financeiro_secure(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.excluir_convenio_financeiro_secure(uuid, uuid, uuid) IS
  'Exclusão lógica e idempotente de convênio pristine; preserva parceiro, competência inicial e auditoria.';

NOTIFY pgrst, 'reload schema';

COMMIT;
