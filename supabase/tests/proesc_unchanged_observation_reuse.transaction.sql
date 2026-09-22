-- Run after both reuse migrations, inside this rollback-only transaction.
-- Synthetic composites test the financial decision without touching real rows.
BEGIN;
DO $test$
DECLARE
  c public.contas_receber;
  s internal_proesc.financial_snapshots;
  st internal_proesc.settled_polling_state;
  payload jsonb; original jsonb; fingerprint text;
  changed internal_proesc.financial_snapshots;
  key text;
BEGIN
  c:=jsonb_populate_record(NULL::public.contas_receber,jsonb_build_object(
    'id','11111111-1111-4111-8111-111111111111','valor',100,'valor_pago',100,
    'status','PAGO','data_pagamento','2026-09-01','updated_at',now()-interval '2 hours'));
  s:=jsonb_populate_record(NULL::internal_proesc.financial_snapshots,jsonb_build_object(
    'id','22222222-2222-4222-8222-222222222222','link_id','33333333-3333-4333-8333-333333333333',
    'observed_at',now()-interval '1 hour','recorded_at',now()-interval '1 hour',
    'source_fingerprint',repeat('a',64),'principal_cents',10000,'received_cents',10000,
    'payment_date','2026-09-01','source_status','PAID','verification','VERIFIED',
    'evidence_kind','API_PAYMENT_TOTAL','components',jsonb_build_object('interestCents',NULL,
      'penaltyCents',NULL,'discountCents',NULL,'additionCents',NULL),
    'accounting_lines','[{"blockCode":"1","amountCents":10000,"cancelled":false},{"blockCode":"2","amountCents":10000,"paymentDate":"2026-09-01","cancelled":false}]'::jsonb,
    'review_reasons','[]'::jsonb,'collector_review_reasons','[]'::jsonb));
  fingerprint:=internal_proesc.receivable_fingerprint(c);
  st.link_id:=s.link_id; st.last_snapshot_id:=s.id;
  st.receivable_sha256:=decode(fingerprint,'hex');
  payload:=jsonb_build_object('linkId',s.link_id,'principalCents',s.principal_cents,
    'receivedCents',s.received_cents,'paymentDate',s.payment_date,'sourceStatus',s.source_status,
    'verification',s.verification,'evidenceKind',s.evidence_kind,'components',s.components,
    'lines',s.accounting_lines,'reviewReasons',s.collector_review_reasons,
    'sourceFingerprint',s.source_fingerprint,'observedAt',now());
  IF internal_proesc.reusable_observation_delay(c,s,st,payload,fingerprint)<>interval '24 hours' THEN
    RAISE EXCEPTION 'Exact paid proof was not reusable'; END IF;
  original:=payload;
  FOREACH key IN ARRAY ARRAY['linkId','principalCents','receivedCents','paymentDate','sourceStatus',
    'verification','evidenceKind','components','lines','reviewReasons','sourceFingerprint'] LOOP
    IF internal_proesc.reusable_observation_delay(c,s,st,payload-key,fingerprint)<>interval '0' THEN
      RAISE EXCEPTION 'Missing proof field accepted: %',key; END IF;
  END LOOP;
  IF internal_proesc.reusable_observation_delay(c,s,st,payload||'{"unexpected":true}',fingerprint)<>interval '0'
    OR internal_proesc.reusable_observation_delay(c,s,st,
      jsonb_set(payload,'{receivedCents}','9999'),fingerprint)<>interval '0'
    OR internal_proesc.reusable_observation_delay(c,s,st,
      jsonb_set(payload,'{lines}',s.accounting_lines||s.accounting_lines),fingerprint)<>interval '0'
    OR internal_proesc.reusable_observation_delay(c,s,st,payload,repeat('b',64))<>interval '0' THEN
    RAISE EXCEPTION 'Altered amount, multiset, contract or CAS accepted'; END IF;
  st.last_snapshot_id:='44444444-4444-4444-8444-444444444444';
  IF internal_proesc.reusable_observation_delay(c,s,st,payload,fingerprint)<>interval '0' THEN
    RAISE EXCEPTION 'Superseded snapshot accepted'; END IF;
  st.last_snapshot_id:=s.id;
  changed:=s; changed.review_reasons:='["PRINCIPAL_DIVERGENTE"]'::jsonb;
  IF internal_proesc.reusable_observation_delay(c,changed,st,payload,fingerprint)<>interval '0' THEN
    RAISE EXCEPTION 'Server review was masked'; END IF;
  c.updated_at:=now(); fingerprint:=internal_proesc.receivable_fingerprint(c);
  st.receivable_sha256:=decode(fingerprint,'hex');
  IF internal_proesc.reusable_observation_delay(c,s,st,payload,fingerprint)<>interval '0' THEN
    RAISE EXCEPTION 'Local modification after evidence was ignored'; END IF;
  c.updated_at:=now()-interval '2 hours'; c.status:='PENDENTE'; c.valor_pago:=0; c.data_pagamento:=NULL;
  s.received_cents:=NULL; s.payment_date:=NULL; s.source_status:='UNKNOWN';
  s.verification:='REVIEW'; s.evidence_kind:='UNRESOLVED';
  s.review_reasons:='["ESTADO_REQUER_REVISAO","SEM_CONFIRMACAO"]'::jsonb;
  s.collector_review_reasons:='["NO_PAYMENT_IN_OBSERVED_PERIODS"]'::jsonb;
  s.accounting_lines:='[{"blockCode":"1","amountCents":10000,"cancelled":false}]'::jsonb;
  fingerprint:=internal_proesc.receivable_fingerprint(c); st.receivable_sha256:=decode(fingerprint,'hex');
  payload:=original||jsonb_build_object('receivedCents',NULL,'paymentDate',NULL,'sourceStatus','UNKNOWN',
    'verification','REVIEW','evidenceKind','UNRESOLVED','reviewReasons',s.collector_review_reasons,
    'lines',s.accounting_lines);
  IF internal_proesc.reusable_observation_delay(c,s,st,payload,fingerprint)<>interval '3 hours' THEN
    RAISE EXCEPTION 'Ordinary unchanged open observation was not reusable'; END IF;
  c.status:='PAGO'; fingerprint:=internal_proesc.receivable_fingerprint(c); st.receivable_sha256:=decode(fingerprint,'hex');
  IF internal_proesc.reusable_observation_delay(c,s,st,payload,fingerprint)<>interval '0' THEN
    RAISE EXCEPTION 'Missing remote payment was allowed to stand in for a paid proof'; END IF;
  RAISE NOTICE 'PASS: exact paid/open, missing fields, amount, multiplicity, CAS, supersession, review and paid absence';
END;
$test$;
ROLLBACK;
