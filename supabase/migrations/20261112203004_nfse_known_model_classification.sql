BEGIN;
-- Generic, administrator-only operational classifier. No deployment-specific IDs.
-- The reviewed mapping is supplied privately after inventory, never embedded in public source.
CREATE TABLE private.nfse_model_classification_runs(
  request_id uuid PRIMARY KEY, payload jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_model_classification_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_model_classification_runs FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.classify_nfse_models_reviewed(p_request_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_item jsonb; v_model private.nfse_models%ROWTYPE; v_prior private.nfse_model_classification_runs%ROWTYPE;
  v_id uuid; v_type text; v_description text; v_after jsonb; v_result jsonb:='[]'::jsonb;
BEGIN
  IF p_request_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Classificação operacional inválida.' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO v_prior FROM private.nfse_model_classification_runs WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.payload IS DISTINCT FROM p_items THEN RAISE EXCEPTION 'Pedido operacional divergente.' USING ERRCODE='22023'; END IF;
    RETURN v_prior.result;
  END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Modelos duplicados.' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'id' LOOP
    v_id:=(v_item->>'id')::uuid; v_type:=v_item->>'modelType';
    IF v_type IS NULL OR v_type NOT IN('ALUNO','SERVICO','AMBOS') THEN
      RAISE EXCEPTION 'Tipo de modelo inválido.' USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT v_model FROM private.nfse_models WHERE id=v_id FOR UPDATE;
    IF v_model.version IS DISTINCT FROM (v_item->>'expectedVersion')::integer
      OR v_model.environment IS DISTINCT FROM v_item->>'environment'
      OR v_model.polo_id IS DISTINCT FROM (v_item->>'poloId')::uuid
      OR v_model.definition->>'modelType' IS NOT NULL THEN
      RAISE EXCEPTION 'Modelo alterado desde a revisão. Reconfira o inventário.' USING ERRCODE='40001'; END IF;
    IF v_type IN('ALUNO','AMBOS') AND v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201' THEN
      RAISE EXCEPTION 'Modelo acadêmico fora do código técnico revisado.' USING ERRCODE='22023'; END IF;
    v_description:=coalesce(v_item->>'serviceDescription',v_model.definition->>'serviceDescription');
    IF v_description IS NULL OR length(btrim(v_description)) NOT BETWEEN 1 AND 2000 THEN
      RAISE EXCEPTION 'Descrição operacional inválida.' USING ERRCODE='22023'; END IF;
    PERFORM private.validate_nfse_description_template(v_description);
    IF v_type='ALUNO' AND position('{{periodo}}' IN v_description)>0 THEN
      RAISE EXCEPTION 'Período manual incompatível com modelo exclusivo de alunos.' USING ERRCODE='22023'; END IF;
    IF v_type='SERVICO' AND v_description ~ '\{\{(curso|matricula|parcelas|meses_pagamento|mes_referencia)\}\}' THEN
      RAISE EXCEPTION 'Variável acadêmica incompatível com modelo de serviços.' USING ERRCODE='22023'; END IF;
    v_after:=v_model.definition||jsonb_build_object('modelType',v_type,'serviceDescription',v_description);
    UPDATE private.nfse_models SET definition=v_after,version=version+1,updated_at=now() WHERE id=v_id;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'previousVersion',v_model.version,
      'version',v_model.version+1,'before',v_model.definition,'after',v_after));
  END LOOP;
  INSERT INTO private.nfse_model_classification_runs(request_id,payload,result) VALUES(p_request_id,p_items,v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.classify_nfse_models_reviewed(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
