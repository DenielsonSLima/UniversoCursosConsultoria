BEGIN;

CREATE OR REPLACE FUNCTION public.listar_faculdades_parceiras_convenio_secure(
  p_polo_id uuid
)
RETURNS TABLE (
  id uuid,
  nome text,
  cpf_cnpj text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_polo_id IS NULL OR (
    auth.role() <> 'service_role'
    AND NOT (
      public.is_financeiro_for_polo(p_polo_id)
      AND public.gestor_has_effective_financeiro_tab('convenios')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado às faculdades parceiras deste polo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT parceiro.id, parceiro.nome, parceiro.cpf_cnpj
  FROM public.parceiros parceiro
  LEFT JOIN public.tipos_parceria tipo_parceria
    ON tipo_parceria.id = parceiro.tipo_parceria_id
  WHERE parceiro.status = 'ATIVO'
    AND parceiro.tipo = 'PJ'
    AND lower(btrim(coalesce(tipo_parceria.nome, parceiro.tipo_convenio, '')))
      = lower('FACULDADE PARCEIRA / AFILIADO')
    AND (
      (
        parceiro.polo_id IS NULL
        AND coalesce(cardinality(parceiro.polo_ids), 0) = 0
      )
      OR parceiro.polo_id = p_polo_id
      OR parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]
    )
  ORDER BY parceiro.nome, parceiro.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_convenio_financeiro_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_parceiro_id uuid,
  p_nome text,
  p_competencia date,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_convenio_id uuid;
  v_mes_id uuid;
  v_nome text;
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_payload jsonb;
  v_hash text;
  v_replay public.convenios_financeiros_operacoes_requisicoes%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF p_request_id IS NULL OR p_polo_id IS NULL OR p_parceiro_id IS NULL
     OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Requisição, polo, faculdade parceira e competência são obrigatórios.';
  END IF;
  IF auth.role() <> 'service_role' AND NOT (
    public.is_financeiro_for_polo(p_polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para criar convênio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Polo ativo não encontrado.';
  END IF;

  SELECT parceiro.nome INTO v_nome
  FROM public.parceiros parceiro
  LEFT JOIN public.tipos_parceria tipo_parceria
    ON tipo_parceria.id = parceiro.tipo_parceria_id
  WHERE parceiro.id = p_parceiro_id
    AND parceiro.status = 'ATIVO'
    AND parceiro.tipo = 'PJ'
    AND lower(btrim(coalesce(tipo_parceria.nome, parceiro.tipo_convenio, '')))
      = lower('FACULDADE PARCEIRA / AFILIADO')
    AND (
      (
        parceiro.polo_id IS NULL
        AND coalesce(cardinality(parceiro.polo_ids), 0) = 0
      )
      OR parceiro.polo_id = p_polo_id
      OR parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]
    );
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Selecione uma Faculdade parceira / afiliado disponível neste polo.';
  END IF;

  v_payload := jsonb_build_object(
    'poloId', p_polo_id,
    'parceiroId', p_parceiro_id,
    'nome', v_nome,
    'competencia', v_competencia,
    'observacao', nullif(btrim(coalesce(p_observacao, '')), '')
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT * INTO v_replay
  FROM public.convenios_financeiros_operacoes_requisicoes
  WHERE request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_replay.operacao <> 'CRIAR_CONVENIO'
       OR v_replay.actor_id IS DISTINCT FROM auth.uid()
       OR v_replay.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN jsonb_set(v_replay.resultado, '{replayed}', 'true'::jsonb, true);
  END IF;

  INSERT INTO public.convenios_financeiros (
    company_id, polo_id, parceiro_id, nome, observacao, request_id, created_by
  ) VALUES (
    v_company_id, p_polo_id, p_parceiro_id, v_nome,
    nullif(btrim(coalesce(p_observacao, '')), ''), p_request_id, auth.uid()
  ) RETURNING id INTO v_convenio_id;

  INSERT INTO public.convenios_financeiros_competencias (
    convenio_id, company_id, polo_id, competencia, saldo_inicial,
    observacao, created_by
  ) VALUES (
    v_convenio_id, v_company_id, p_polo_id, v_competencia, 0,
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  ) RETURNING id INTO v_mes_id;

  v_resultado := jsonb_build_object(
    'replayed', false,
    'mes', public.convenios_financeiros_mes_item_secure(v_mes_id)
  );
  INSERT INTO public.convenios_financeiros_operacoes_requisicoes (
    request_id, convenio_id, competencia_id, operacao,
    actor_id, payload_hash, resultado
  ) VALUES (
    p_request_id, v_convenio_id, v_mes_id, 'CRIAR_CONVENIO',
    auth.uid(), v_hash, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.listar_faculdades_parceiras_convenio_secure(uuid) IS
  'Lista PJs Faculdade parceira / afiliado globais ou vinculadas ao polo financeiro autorizado.';

COMMIT;
