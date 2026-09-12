-- Individual cycle evidence for the authorized Proesc import batch.
begin;

-- Individual evidence never changes existing T42 coverage constraints.
CREATE TABLE internal_proesc.enrollment_cycle_evidence (
  matricula_id uuid PRIMARY KEY REFERENCES public.matriculas(id),
  scope_id uuid NOT NULL REFERENCES internal_proesc.class_scopes(id),
  classification text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (classification IN ('UNKNOWN','C1','FULL')),
  has_external_cycle2 boolean,
  verification text NOT NULL DEFAULT 'REVIEW'
    CHECK (verification IN ('REVIEW','CONFIRMED')),
  evidence_kind text NOT NULL DEFAULT 'UNRESOLVED'
    CHECK (evidence_kind IN (
      'UNRESOLVED','SOURCE_CONTRACT','SOURCE_CYCLE_REFERENCE','USER_CONFIRMED_CONTRACT'
    )),
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_evidence)='object'),
  obligation_manifest_hash text NOT NULL CHECK (obligation_manifest_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  source_observed_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  request_id uuid NOT NULL UNIQUE,
  recorded_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES public.usuarios_sistema(id),
  confirmed_at timestamptz,
  CHECK ((verification='CONFIRMED' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
    OR (verification='REVIEW' AND confirmed_at IS NULL AND confirmed_by IS NULL)),
  CHECK (classification='UNKNOWN' OR (
    verification='CONFIRMED' AND evidence_kind<>'UNRESOLVED'
    AND (classification='C1' AND has_external_cycle2 IS FALSE
      OR classification='FULL' AND has_external_cycle2 IS TRUE)
  ))
);
ALTER TABLE internal_proesc.enrollment_cycle_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.enrollment_cycle_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE internal_proesc.cycle_evidence_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  matricula_id uuid NOT NULL REFERENCES public.matriculas(id),
  before_state jsonb,
  after_state jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE internal_proesc.cycle_evidence_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.cycle_evidence_requests FROM PUBLIC,anon,authenticated,service_role;

-- Identity/principal manifest only: automatic payment updates do not revoke a
-- contract. Newly imported obligations, source reclassification or identity edits
-- DO invalidate it. Local cycle insertions are excluded, otherwise generation
-- would invalidate its own authorization after inserting the first item.
CREATE FUNCTION internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT encode(extensions.digest(jsonb_build_object(
    'matriculaId',m.id,'turmaId',m.turma_id,'poloId',s.polo_id,'scopeId',s.id,
    'personHash',internal_proesc.person_document_hash(m.aluno_id),
    'unitId',s.source_unit_id,'classId',s.source_class_id,
    'obligations',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'matriculaId',c.matricula_id,'turmaId',c.turma_id,'personId',c.cliente_id,
      'poloId',c.polo_id,'principal',c.valor,'due',c.data_vencimento,
      'origin',c.origem_cronograma_id,'kind',c.tipo_lancamento,
      'linkId',l.id,'sourceUnit',l.source_unit_id,'sourceClass',l.source_class_id,
      'sourceKey',l.source_key,'linkKind',l.kind,'parentLink',l.parent_link_id,
      'importScope',i.scope_id,'sourcePerson',i.source_person_hash,
      'sourceFingerprint',i.source_fingerprint,'sourceCycle',i.source_cycle,
      'sourceKind',i.obligation_kind,'sourceOrdinal',i.source_ordinal
    ) ORDER BY c.id) FROM public.contas_receber c
      LEFT JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
      LEFT JOIN internal_proesc.obligation_imports i ON i.link_id=l.id
      WHERE c.matricula_id=m.id AND (c.origem_pagamento='SISTEMA_ANTERIOR' OR l.id IS NOT NULL)),
      '[]'::jsonb)
  )::text,'sha256'),'hex')
  FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
  WHERE m.id=p_matricula_id;
$$;

CREATE FUNCTION internal_proesc.has_confirmed_first_cycle_only(p_matricula_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal_proesc.enrollment_cycle_evidence e
    JOIN internal_proesc.class_scopes s ON s.id=e.scope_id
    JOIN internal_proesc.enrollment_sources a ON a.matricula_id=e.matricula_id AND a.scope_id=e.scope_id
    JOIN public.matriculas m ON m.id=e.matricula_id AND m.turma_id=s.turma_id
    WHERE e.matricula_id=p_matricula_id AND s.batch_id IS NOT NULL
      AND s.phase='CONFIRMED' AND s.financial_mode='INDIVIDUAL_REVIEW'
      AND e.classification='C1' AND e.has_external_cycle2 IS FALSE
      AND e.verification='CONFIRMED' AND e.evidence_kind<>'UNRESOLVED'
      AND e.obligation_manifest_hash=internal_proesc.enrollment_cycle_manifest_hash(m.id)
      AND a.financial_review_state='CONFIRMED' AND a.source_verified
      AND a.source_status='CURSANDO' AND upper(m.status)='ATIVO'
      AND NOT EXISTS (SELECT 1 FROM internal_proesc.obligation_links l
        JOIN internal_proesc.obligation_imports i ON i.link_id=l.id
        WHERE l.matricula_id=m.id AND i.source_cycle IN ('SECOND','FULL_CONTRACT'))
  );
$$;

CREATE FUNCTION public.proesc_confirm_enrollment_cycle_evidence_service(
  p_actor_id uuid,p_request_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
  v_request internal_proesc.cycle_evidence_requests%rowtype;
  v_old internal_proesc.enrollment_cycle_evidence%rowtype;
  v_new internal_proesc.enrollment_cycle_evidence%rowtype;
  v_enrollment public.matriculas%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_classification text:=p_payload->>'classification';
  v_kind text:=p_payload->>'evidenceKind';
  v_source jsonb:=p_payload->'sourceEvidence';
  v_items jsonb; v_item jsonb; v_actual jsonb;
  v_hash text; v_manifest text; v_evidence_hash text;
  v_has_second boolean; v_observed timestamptz;
  v_first_count integer; v_second_count integer; v_count integer;
  v_response jsonb; v_before jsonb;
BEGIN
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR NOT coalesce(p_payload->>'matriculaId' ~ '^[0-9a-fA-F-]{36}$'
      AND p_payload->>'scopeId' ~ '^[0-9a-fA-F-]{36}$'
      AND p_payload->>'expectedManifestHash' ~ '^[0-9a-f]{64}$'
      AND p_payload->>'expectedRevision' ~ '^[0-9]+$'
      AND v_classification IN ('UNKNOWN','C1','FULL')
      AND v_kind IN ('UNRESOLVED','SOURCE_CONTRACT','SOURCE_CYCLE_REFERENCE','USER_CONFIRMED_CONTRACT'),false)
    OR jsonb_typeof(v_source) IS DISTINCT FROM 'object'
    OR (p_payload->'hasExternalCycle2' IS DISTINCT FROM 'null'::jsonb
      AND jsonb_typeof(p_payload->'hasExternalCycle2') IS DISTINCT FROM 'boolean')
    OR octet_length(p_payload::text)>262144 THEN
    RAISE EXCEPTION 'Prova individual de ciclo inválida.' USING errcode='22023';
  END IF;
  v_has_second:=(p_payload->>'hasExternalCycle2')::boolean;
  v_observed:=(p_payload->>'observedAt')::timestamptz;
  IF v_observed IS NULL OR NOT isfinite(v_observed) OR v_observed>now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Data da prova individual inválida.' USING errcode='22023'; END IF;
  v_hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:cycle-evidence-request:'||p_request_id::text,0));
  SELECT * INTO v_request FROM internal_proesc.cycle_evidence_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_request.actor_id IS DISTINCT FROM p_actor_id OR v_request.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'requestId já utilizado com outra prova.' USING errcode='22023'; END IF;
    RETURN v_request.response||jsonb_build_object('replayed',true,
      'currentlyEligibleC1',internal_proesc.has_confirmed_first_cycle_only(v_request.matricula_id));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:'||(p_payload->>'matriculaId')::uuid::text,0));
  SELECT * INTO STRICT v_enrollment FROM public.matriculas WHERE id=(p_payload->>'matriculaId')::uuid;
  PERFORM 1 FROM public.turmas WHERE id=v_enrollment.turma_id FOR UPDATE;
  SELECT * INTO STRICT v_enrollment FROM public.matriculas WHERE id=v_enrollment.id FOR UPDATE;
  SELECT * INTO STRICT v_scope FROM internal_proesc.class_scopes
    WHERE id=(p_payload->>'scopeId')::uuid FOR UPDATE;
  IF v_scope.turma_id IS DISTINCT FROM v_enrollment.turma_id OR v_scope.batch_id IS NULL
    OR v_scope.phase<>'CONFIRMED' OR v_scope.financial_mode<>'INDIVIDUAL_REVIEW' THEN
    RAISE EXCEPTION 'Prova restrita ao escopo individual confirmado.' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.parceiros WHERE id=v_enrollment.aluno_id FOR SHARE;
  PERFORM 1 FROM public.matriculas_tecnicas_financeiro_config WHERE matricula_id=v_enrollment.id FOR UPDATE;
  PERFORM 1 FROM public.contas_receber WHERE matricula_id=v_enrollment.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM internal_proesc.enrollment_sources
    WHERE matricula_id=v_enrollment.id AND scope_id=v_scope.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Origem acadêmica ausente.' USING errcode='42501'; END IF;
  SELECT * INTO v_old FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=v_enrollment.id FOR UPDATE;
  IF coalesce(v_old.revision,0) IS DISTINCT FROM (p_payload->>'expectedRevision')::integer
    OR v_old.evidence_hash IS DISTINCT FROM nullif(p_payload->>'expectedEvidenceHash','') THEN
    RAISE EXCEPTION 'Prova individual mudou; refaça a conferência.' USING errcode='40001'; END IF;
  IF v_old.scope_id IS NOT NULL AND v_old.scope_id<>v_scope.id THEN
    RAISE EXCEPTION 'Prova não pode mudar de escopo.' USING errcode='40001'; END IF;
  v_manifest:=internal_proesc.enrollment_cycle_manifest_hash(v_enrollment.id);
  IF v_manifest IS DISTINCT FROM p_payload->>'expectedManifestHash' THEN
    RAISE EXCEPTION 'Conjunto de obrigações mudou; refaça a conferência.' USING errcode='40001'; END IF;
  IF EXISTS (SELECT 1 FROM internal_academic.technical_manual_cycle_runs WHERE matricula_id=v_enrollment.id)
    OR EXISTS (SELECT 1 FROM internal_academic.technical_external_cycle_coverage WHERE matricula_id=v_enrollment.id) THEN
    RAISE EXCEPTION 'Emissão existente preservada; revisão de conflito obrigatória.' USING errcode='40001'; END IF;
  IF v_old.has_external_cycle2 IS TRUE AND v_has_second IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Emissão externa comprovada não pode ser removida desta revisão.' USING errcode='40001'; END IF;

  IF v_classification<>'UNKNOWN' THEN
    IF v_kind='UNRESOLVED' OR v_source->'completeContract' IS DISTINCT FROM 'true'::jsonb
      OR v_source->>'unitId' IS DISTINCT FROM v_scope.source_unit_id
      OR v_source->>'classId' IS DISTINCT FROM v_scope.source_class_id
      OR v_source->>'personHash' IS DISTINCT FROM internal_proesc.person_document_hash(v_enrollment.aluno_id)
      OR NOT coalesce(v_source->>'artifactHash' ~ '^[0-9a-f]{64}$'
        AND length(btrim(v_source->>'contractReference')) BETWEEN 1 AND 180
        AND v_source->>'firstInstallmentCount' ~ '^[1-9][0-9]?$'
        AND v_source->>'secondInstallmentCount' ~ '^[0-9]{1,2}$',false)
      OR (v_kind='USER_CONFIRMED_CONTRACT' AND NOT coalesce(
        v_source->>'userConfirmationReference' ~ '^[0-9a-f]{64}$',false)) THEN
      RAISE EXCEPTION 'Classificação exige contrato completo e prova individual identificada.' USING errcode='22023'; END IF;
    v_first_count:=(v_source->>'firstInstallmentCount')::integer;
    v_second_count:=(v_source->>'secondInstallmentCount')::integer;
    IF v_first_count>60 OR v_second_count>60
      OR (v_classification='C1' AND (v_has_second IS DISTINCT FROM false OR v_second_count<>0))
      OR (v_classification='FULL' AND (v_has_second IS DISTINCT FROM true OR v_second_count=0)) THEN
      RAISE EXCEPTION 'Abrangência individual inconsistente.' USING errcode='22023'; END IF;
    v_items:=v_source->'obligations';
    IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Contrato exige obrigações identificadas.' USING errcode='22023'; END IF;
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 500 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items) i WHERE NOT coalesce(
        i->>'key' ~ '^[1-9][0-9]*$' AND i->>'cycle' IN ('FIRST','SECOND')
        AND i->>'kind' IN ('TUITION','FEE','OTHER','RESIDUAL')
        AND i->>'principalCents' ~ '^[1-9][0-9]*$'
        AND i->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND (i->>'kind'<>'TUITION' OR i->>'ordinal' ~ '^[1-9][0-9]?$'),false))
      OR (SELECT count(DISTINCT i->>'key') FROM jsonb_array_elements(v_items) i)<>jsonb_array_length(v_items) THEN
      RAISE EXCEPTION 'Identidade ou ordinais da prova inválidos.' USING errcode='22023'; END IF;
    IF (SELECT count(*) FROM internal_proesc.obligation_links WHERE matricula_id=v_enrollment.id)<>jsonb_array_length(v_items)
      OR EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.matricula_id=v_enrollment.id
        AND c.origem_pagamento='SISTEMA_ANTERIOR' AND NOT EXISTS (
          SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id=c.id)) THEN
      RAISE EXCEPTION 'Manifesto não corresponde ao histórico completo.' USING errcode='40001'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      SELECT jsonb_build_object('key',l.source_key,'cycle',i.source_cycle,'kind',l.kind,
        'amount',round(c.valor*100)::bigint,'due',c.data_vencimento) INTO v_actual
      FROM internal_proesc.obligation_links l
      JOIN internal_proesc.obligation_imports i ON i.link_id=l.id AND i.scope_id=v_scope.id
      JOIN public.contas_receber c ON c.id=l.receivable_id
      WHERE l.matricula_id=v_enrollment.id AND l.source_unit_id=v_scope.source_unit_id
        AND l.source_class_id=v_scope.source_class_id AND l.source_key=v_item->>'key'
        AND i.source_person_hash=internal_proesc.person_document_hash(v_enrollment.aluno_id);
      IF NOT FOUND OR v_actual->>'amount' IS DISTINCT FROM v_item->>'principalCents'
        OR v_actual->>'due' IS DISTINCT FROM v_item->>'dueDate'
        OR ((v_actual->>'kind'='RESIDUAL') IS DISTINCT FROM (v_item->>'kind'='RESIDUAL'))
        OR (v_classification='C1' AND (v_item->>'cycle'<>'FIRST' OR v_actual->>'cycle' IN ('SECOND','FULL_CONTRACT'))) THEN
        RAISE EXCEPTION 'Obrigação diverge da prova individual.' USING errcode='40001'; END IF;
    END LOOP;
    FOR v_count IN 1..2 LOOP
      IF (SELECT count(*) FROM jsonb_array_elements(v_items) i
        WHERE i->>'kind'='TUITION' AND i->>'cycle'=CASE v_count WHEN 1 THEN 'FIRST' ELSE 'SECOND' END)
        <> (CASE v_count WHEN 1 THEN v_first_count ELSE v_second_count END)
        OR EXISTS (SELECT 1 FROM generate_series(1,CASE v_count WHEN 1 THEN v_first_count ELSE v_second_count END) n
          WHERE (SELECT count(*) FROM jsonb_array_elements(v_items) i WHERE i->>'kind'='TUITION'
            AND i->>'cycle'=CASE v_count WHEN 1 THEN 'FIRST' ELSE 'SECOND' END AND (i->>'ordinal')::integer=n)<>1) THEN
        RAISE EXCEPTION 'Contrato exige todos os ordinais de cada ciclo informado.' USING errcode='22023'; END IF;
    END LOOP;
  END IF;
  v_evidence_hash:=encode(extensions.digest(jsonb_build_object('classification',v_classification,
    'hasExternalCycle2',v_has_second,'kind',v_kind,'source',v_source,'manifest',v_manifest)::text,'sha256'),'hex');
  v_before:=CASE WHEN v_old.matricula_id IS NULL THEN NULL ELSE to_jsonb(v_old) END;
  INSERT INTO internal_proesc.enrollment_cycle_evidence(matricula_id,scope_id,classification,has_external_cycle2,
    verification,evidence_kind,source_evidence,obligation_manifest_hash,evidence_hash,source_observed_at,
    revision,request_id,recorded_by,confirmed_by,confirmed_at)
  VALUES(v_enrollment.id,v_scope.id,v_classification,v_has_second,
    CASE WHEN v_classification='UNKNOWN' THEN 'REVIEW' ELSE 'CONFIRMED' END,v_kind,v_source,v_manifest,
    v_evidence_hash,v_observed,coalesce(v_old.revision,0)+1,p_request_id,p_actor_id,
    CASE WHEN v_classification='UNKNOWN' THEN NULL ELSE p_actor_id END,
    CASE WHEN v_classification='UNKNOWN' THEN NULL ELSE now() END)
  ON CONFLICT(matricula_id) DO UPDATE SET classification=excluded.classification,
    has_external_cycle2=excluded.has_external_cycle2,verification=excluded.verification,
    evidence_kind=excluded.evidence_kind,source_evidence=excluded.source_evidence,
    obligation_manifest_hash=excluded.obligation_manifest_hash,evidence_hash=excluded.evidence_hash,
    source_observed_at=excluded.source_observed_at,revision=excluded.revision,request_id=excluded.request_id,
    recorded_by=excluded.recorded_by,recorded_at=now(),confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at
  RETURNING * INTO v_new;
  v_response:=jsonb_build_object('matriculaId',v_enrollment.id,'classification',v_new.classification,
    'verification',v_new.verification,'revision',v_new.revision,'evidenceHash',v_new.evidence_hash,
    'manifestHash',v_manifest,'currentlyEligibleC1',internal_proesc.has_confirmed_first_cycle_only(v_enrollment.id));
  INSERT INTO internal_proesc.cycle_evidence_requests(request_id,actor_id,payload_hash,matricula_id,before_state,after_state,response)
  VALUES(p_request_id,p_actor_id,v_hash,v_enrollment.id,v_before,to_jsonb(v_new),v_response);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION internal_proesc.enrollment_cycle_manifest_hash(uuid),
  internal_proesc.has_confirmed_first_cycle_only(uuid),
  public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb) TO service_role;

-- Fold individual evidence into the policy fingerprint already compared by the
-- manual preview/commit RPC. Never invent a fingerprint for missing policy.
CREATE FUNCTION internal_proesc.individual_cycle_policy_fingerprint(p_matricula_id uuid,p_base text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN p_base IS NULL OR p_base !~ '^[0-9a-f]{64}$' THEN p_base ELSE
    coalesce((SELECT encode(extensions.digest(jsonb_build_object(
      'base',p_base,'matriculaId',m.id,'scopeId',s.id,
      'evidenceHash',e.evidence_hash,'revision',e.revision,
      'confirmedManifest',e.obligation_manifest_hash,
      'currentManifest',internal_proesc.enrollment_cycle_manifest_hash(m.id)
    )::text,'sha256'),'hex')
    FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
    LEFT JOIN internal_proesc.enrollment_cycle_evidence e ON e.matricula_id=m.id AND e.scope_id=s.id
    WHERE m.id=p_matricula_id AND s.batch_id IS NOT NULL AND s.financial_mode='INDIVIDUAL_REVIEW'),p_base)
  END;
$$;
REVOKE ALL ON FUNCTION internal_proesc.individual_cycle_policy_fingerprint(uuid,text)
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
