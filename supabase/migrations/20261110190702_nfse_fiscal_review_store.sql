BEGIN;

-- Review revisions never rewrite a preparation, receipt, reservation or payment.
CREATE TABLE private.nfse_fiscal_review_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES private.nfse_queue_documents(id),
  revision integer NOT NULL CHECK(revision>0),
  actor_id uuid NOT NULL,
  context_id uuid NOT NULL,
  request_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK(environment IN ('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL,
  model_id uuid NOT NULL REFERENCES private.nfse_models(id),
  model_version integer NOT NULL,
  configuration_version integer NOT NULL,
  basis_fingerprint text NOT NULL CHECK(basis_fingerprint ~ '^[0-9a-f]{64}$'),
  basis jsonb NOT NULL,
  definition jsonb NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,revision),
  UNIQUE(actor_id,request_id)
);
ALTER TABLE private.nfse_fiscal_review_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_fiscal_review_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_fiscal_review_immutable BEFORE UPDATE OR DELETE ON private.nfse_fiscal_review_revisions
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_fiscal_review_changed AFTER INSERT ON private.nfse_fiscal_review_revisions
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_queue_change();

CREATE FUNCTION private.nfse_review_valid_document(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v text:=regexp_replace(coalesce(p_value,''),'[^0-9]','','g'); v_sum integer; v_digit integer; i integer;
  v_weights integer[];
BEGIN
  IF v !~ '^([0-9]{11}|[0-9]{14})$' OR v ~ '^([0-9])\1+$' THEN RETURN false; END IF;
  IF length(v)=11 THEN
    FOR v_digit IN 10..11 LOOP
      v_sum:=0;
      FOR i IN 1..v_digit-1 LOOP v_sum:=v_sum+substr(v,i,1)::integer*(v_digit+1-i); END LOOP;
      IF (v_sum*10 % 11) % 10 <> substr(v,v_digit,1)::integer THEN RETURN false; END IF;
    END LOOP;
  ELSE
    FOR v_digit IN 13..14 LOOP
      v_weights:=CASE WHEN v_digit=13 THEN ARRAY[5,4,3,2,9,8,7,6,5,4,3,2]
        ELSE ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2] END;
      v_sum:=0;
      FOR i IN 1..v_digit-1 LOOP v_sum:=v_sum+substr(v,i,1)::integer*v_weights[i]; END LOOP;
      IF (CASE WHEN v_sum%11<2 THEN 0 ELSE 11-v_sum%11 END) <> substr(v,v_digit,1)::integer THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_review_valid_document(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_fiscal_review_basis(p_document_id uuid,p_model_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_q private.nfse_queue_documents%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_config private.nfse_configurations%ROWTYPE; v_issuer jsonb; v_recipient jsonb; v_receipts jsonb;
  v_reservations jsonb; v_source_count integer; v_source_amount numeric(30,2); v_reserved_amount numeric(30,2); v_financing boolean;
  v_basis jsonb; v_issues text[]:='{}';
BEGIN
  SELECT * INTO STRICT v_q FROM private.nfse_queue_documents WHERE id=p_document_id;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_model_id
    AND polo_id=v_q.polo_id AND environment=v_q.environment;
  SELECT * INTO v_config FROM private.nfse_configurations WHERE polo_id=v_q.polo_id AND environment=v_q.environment;
  v_issuer:=private.nfse_issuer_preparation_snapshot(v_q.polo_id);
  v_issuer:=jsonb_build_object('name',coalesce(v_issuer->>'legalName',v_issuer->>'name'),
    'cnpj',regexp_replace(coalesce(v_issuer->>'cnpj',''),'[^0-9]','','g'),
    'municipalityCode',v_config.definition->>'municipalityCode',
    'municipalRegistration',nullif(v_config.definition->>'municipalRegistration',''),
    'opSimpNac',v_config.definition->>'opSimpNac','regEspTrib',v_config.definition->>'regEspTrib',
    'regApTribSN',v_config.definition->'regApTribSN','configurationVersion',v_config.version);
  SELECT jsonb_build_object('mode','STUDENT','studentId',p.id,'name',nullif(btrim(p.nome),''),
    'document',nullif(regexp_replace(coalesce(p.cpf_cnpj,''),'[^0-9]','','g'),''),
    'address',jsonb_build_object('street',p.endereco,'number',p.numero,'complement',p.complemento,
      'district',p.bairro,'city',p.cidade,'state',p.uf,'postalCode',p.cep)) INTO v_recipient
  FROM public.parceiros p WHERE p.id=v_q.student_id AND upper(btrim(p.tipo))='ALUNO';
  v_recipient:=coalesce(v_recipient,jsonb_build_object('mode','STUDENT','studentId',v_q.student_id,
    'name',NULL,'document',NULL,'address',jsonb_build_object('street',NULL,'number',NULL,'complement',NULL,
      'district',NULL,'city',NULL,'state',NULL,'postalCode',NULL)));
  SELECT coalesce(jsonb_agg(r.receipt_snapshot ORDER BY r.receipt_id),'[]'),count(*)::integer,
    coalesce(sum(r.received_amount),0),coalesce(bool_or(r.source_is_financing),false)
    INTO v_receipts,v_source_count,v_source_amount,v_financing
  FROM private.nfse_academic_receipts(v_q.polo_id,v_q.payment_month,ARRAY[v_q.candidate_id]) r
  JOIN private.nfse_receipt_reservations claim ON claim.document_id=v_q.id AND claim.environment=v_q.environment
    AND claim.receipt_id=r.receipt_id AND claim.source_receivable_id=r.source_receivable_id
    AND claim.payment_event_id IS NOT DISTINCT FROM r.payment_event_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('receiptId',receipt_id,'sourceReceivableId',source_receivable_id,
    'paymentEventId',payment_event_id,'amount',amount::numeric(30,2)::text) ORDER BY receipt_id),'[]'),
    coalesce(sum(amount),0) INTO v_reservations,v_reserved_amount
  FROM private.nfse_receipt_reservations WHERE document_id=v_q.id AND environment=v_q.environment;
  IF EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=v_q.id) OR v_q.status<>'PREPARADO' THEN
    v_issues:=array_append(v_issues,'PREPARATION_REMOVED'); END IF;
  IF v_model.id IS NULL OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb THEN
    v_issues:=array_append(v_issues,'MODEL_UNAVAILABLE'); END IF;
  IF v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201' THEN
    v_issues:=array_append(v_issues,'MODEL_SERVICE_NOT_APPROVED'); END IF;
  IF v_config.version IS NULL THEN v_issues:=array_append(v_issues,'FISCAL_CONFIGURATION_REQUIRED'); END IF;
  IF NOT private.nfse_review_valid_document(v_issuer->>'cnpj') THEN
    v_issues:=array_append(v_issues,'ISSUER_DOCUMENT_INVALID'); END IF;
  IF NOT private.nfse_review_valid_document(v_recipient->>'document') THEN
    v_issues:=array_append(v_issues,'RECIPIENT_DOCUMENT_INVALID'); END IF;
  IF coalesce(v_recipient->>'name','')='' THEN v_issues:=array_append(v_issues,'RECIPIENT_NAME_REQUIRED'); END IF;
  IF v_source_count<>v_q.receipt_count OR v_source_amount<>v_q.amount OR v_reserved_amount<>v_q.amount OR v_financing
    OR jsonb_array_length(v_reservations)<>v_q.receipt_count
    OR v_receipts IS DISTINCT FROM coalesce(v_q.snapshot#>'{financial,receipts}','[]'::jsonb) THEN
    v_issues:=array_append(v_issues,'SOURCE_CHANGED'); END IF;
  v_basis:=jsonb_build_object('documentId',v_q.id,'preparationSnapshot',v_q.snapshot,
    'issuer',v_issuer,'recipient',v_recipient,'configuration',v_config.definition,
    'model',jsonb_build_object('id',p_model_id,'version',v_model.version,'definition',v_model.definition),
    'financial',jsonb_build_object('original',v_q.snapshot->'financial','currentReceipts',v_receipts,
      'reservations',v_reservations),'issues',to_jsonb(v_issues));
  RETURN jsonb_build_object('basis',v_basis,'token',encode(sha256(convert_to(v_basis::text,'UTF8')),'hex'),
    'issues',to_jsonb(v_issues));
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_fiscal_review_basis(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_fiscal_review_check(p_code text,p_status text DEFAULT 'BLOCKED')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('code',p_code,'status',p_status,'message',CASE p_code
    WHEN 'PREPARATION_REMOVED' THEN 'A preparação foi retirada da fila.'
    WHEN 'MODEL_UNAVAILABLE' THEN 'Selecione um modelo ativo desta unidade e ambiente.'
    WHEN 'MODEL_SERVICE_NOT_APPROVED' THEN 'Selecione o modelo confirmado de treinamento, código 080201.'
    WHEN 'FISCAL_CONFIGURATION_REQUIRED' THEN 'Salve os parâmetros fiscais desta unidade e ambiente.'
    WHEN 'ISSUER_DOCUMENT_INVALID' THEN 'Revise o CNPJ do estabelecimento no cadastro de Polos e Filiais.'
    WHEN 'RECIPIENT_DOCUMENT_INVALID' THEN 'O CPF ou CNPJ do aluno exige correção no cadastro.'
    WHEN 'RECIPIENT_NAME_REQUIRED' THEN 'O nome do aluno exige correção no cadastro.'
    WHEN 'RECIPIENT_CONFIRMATION_REQUIRED' THEN 'Confirme o aluno como tomador do serviço.'
    WHEN 'COMPETENCE_REQUIRED' THEN 'Informe expressamente a data de competência fiscal.'
    WHEN 'SERVICE_DATE_REQUIRED' THEN 'Informe expressamente a data da prestação do serviço.'
    WHEN 'CONFIGURATION_CHANGED' THEN 'Os parâmetros ou o estabelecimento mudaram após a revisão.'
    WHEN 'MODEL_CHANGED' THEN 'O modelo selecionado mudou após a revisão.'
    WHEN 'RECIPIENT_CHANGED' THEN 'O cadastro do aluno mudou após a revisão.'
    WHEN 'SOURCE_CHANGED' THEN 'A origem, o valor ou os dados dos recebimentos reservados mudaram.'
    WHEN 'REVIEW_STALE' THEN 'Confira novamente os dados atuais e salve uma nova revisão.'
    WHEN 'REVIEW_CONFIRMED' THEN 'Revisão dos dados salva; a autorização fiscal é verificada separadamente.'
    WHEN 'EXTERNAL_HABILITATION_UNCONFIRMED' THEN 'A habilitação fiscal depende da validação no ambiente de destino.'
    WHEN 'REAL_EMISSION_NOT_ENABLED' THEN 'A transmissão destas preparações ainda depende do contrato de emissão real.'
    ELSE 'Confira os dados fiscais antes de continuar.' END);
$function$;
REVOKE ALL ON FUNCTION private.nfse_fiscal_review_check(text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
