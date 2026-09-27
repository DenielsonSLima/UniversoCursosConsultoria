BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_pdv_receipt(uuid,uuid,uuid)'::regprocedure))
      IS DISTINCT FROM '54a395734389baff5636b644643cc8f2'
    OR md5(pg_get_functiondef('internal_pdv.receipt_dto(internal_pdv.receipts,uuid,uuid)'::regprocedure))
      IS DISTINCT FROM 'b5861778ab7d2b2650bca1fdf4a6aaec' THEN
    RAISE EXCEPTION 'Contrato de recibo mudou; revise a migration antes de aplicar.';
  END IF;
END $guard$;

-- Presentation identity supplements the immutable financial snapshot. It never
-- rewrites a receipt or an existing print job, and never stores a raw document.
CREATE TABLE internal_pdv.receipt_identity (
  receipt_id uuid PRIMARY KEY REFERENCES internal_pdv.receipts(id),
  payer_id uuid,
  enrollment_number text CHECK(enrollment_number ~ '^UNIV-A-[0-9]{8}$'),
  source text NOT NULL CHECK(source IN('RECEIPT_CREATION','BANESE_REPLACEMENT','LEGACY_UNPROVEN')),
  source_reference uuid,
  source_fingerprint text,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  captured_by uuid NOT NULL,
  CHECK(enrollment_number IS NULL OR payer_id IS NOT NULL),
  CHECK(source<>'LEGACY_UNPROVEN' OR (payer_id IS NULL AND enrollment_number IS NULL)),
  CHECK(source<>'BANESE_REPLACEMENT' OR (source_reference IS NOT NULL AND source_fingerprint IS NOT NULL))
);
ALTER TABLE internal_pdv.receipt_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_pdv.receipt_identity FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pdv_receipt_identity_immutable BEFORE UPDATE OR DELETE ON internal_pdv.receipt_identity
  FOR EACH ROW EXECUTE FUNCTION internal_pdv.reject_receipt_mutation();

CREATE FUNCTION internal_pdv.format_masked_document(p_mask text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v text:=regexp_replace(coalesce(p_mask,''),'[./-]','','g');
BEGIN
  IF v ~ '^[0-9]{2}[*]{6}[0-9]{3}$' THEN
    RETURN jsonb_build_object('documentLabel','CPF','documentMasked',
      substr(v,1,3)||'.'||substr(v,4,3)||'.'||substr(v,7,3)||'-'||substr(v,10,2));
  ELSIF v ~ '^[0-9]{2}[*]{9}[0-9]{3}$' THEN
    RETURN jsonb_build_object('documentLabel','CNPJ','documentMasked',
      substr(v,1,2)||'.'||substr(v,3,3)||'.'||substr(v,6,3)||'/'||substr(v,9,4)||'-'||substr(v,13,2));
  END IF;
  -- Unknown or unmasked data must not become a full document in the DTO.
  RETURN jsonb_build_object('documentLabel','Documento','documentMasked',NULL);
END $$;

CREATE FUNCTION internal_pdv.capture_receipt_identity(p_receipt_id uuid,p_created_now boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r internal_pdv.receipts; c public.contas_receber; p public.parceiros;
  v_source text:='LEGACY_UNPROVEN'; v_reference uuid; v_source_hash text;
  v_payer uuid; v_number text; v_document text; v_mask text;
  v_origin record; v_origins integer:=0;
BEGIN
  SELECT * INTO r FROM internal_pdv.receipts WHERE id=p_receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprovante indisponível.' USING ERRCODE='PT404'; END IF;
  c:=internal_pdv.paid_receivable(r.receivable_id);
  IF c.polo_id IS DISTINCT FROM r.polo_id OR
    internal_pdv.settlement_fingerprint(c) IS DISTINCT FROM r.settlement_fingerprint THEN
    RAISE EXCEPTION 'Pagamento alterado. Identidade não pode ser complementada.' USING ERRCODE='PT409';
  END IF;
  -- Authorization and the current confirmed payment precede idempotent reuse.
  IF EXISTS(SELECT 1 FROM internal_pdv.receipt_identity WHERE receipt_id=r.id) THEN RETURN; END IF;
  SELECT * INTO p FROM public.parceiros WHERE id=c.cliente_id FOR SHARE;
  IF p_created_now THEN
    -- Only the INSERT winner in prepare_pdv_receipt calls this private branch.
    v_source:='RECEIPT_CREATION'; v_payer:=p.id;
  ELSE
    -- The old receipt lacks a payer_id. The authorized replacement request is
    -- an existing, exact link to the frozen previous title, never a name join.
    FOR v_origin IN SELECT j.receivable_id,j.snapshot,j.evidence_sha256
      FROM public.banese_pdv_cancellation_jobs j
      WHERE j.replacement_request_id=r.receivable_id AND j.state='CANCELED'
        AND j.confirmed_at IS NOT NULL AND j.confirmed_at<=r.issued_at
        AND j.evidence_sha256 ~ '^[a-f0-9]{64}$'
        AND j.snapshot->>'id'=j.receivable_id::text
        AND j.snapshot->>'cliente_id'=c.cliente_id::text
        AND j.snapshot->>'polo_id'=r.polo_id::text
      FOR SHARE
    LOOP
      v_origins:=v_origins+1;
      v_reference:=v_origin.receivable_id;
      v_source_hash:=md5(jsonb_build_object('snapshot',v_origin.snapshot,
        'evidence',v_origin.evidence_sha256)::text);
    END LOOP;
    v_document:=regexp_replace(coalesce(p.cpf_cnpj,''),'[^0-9]','','g');
    v_mask:=CASE WHEN length(v_document) IN(11,14) THEN
      substr(v_document,1,2)||repeat('*',length(v_document)-5)||right(v_document,3) ELSE NULL END;
    IF v_origins=1 AND p.id IS NOT NULL
      AND coalesce(p.nome,'Cliente geral')=r.financial_snapshot->'payer'->>'name'
      AND v_mask IS NOT NULL
      AND internal_pdv.format_masked_document(v_mask)=internal_pdv.format_masked_document(
        r.financial_snapshot->'payer'->>'documentMasked') THEN
      v_source:='BANESE_REPLACEMENT'; v_payer:=p.id;
    ELSE v_reference:=NULL; v_source_hash:=NULL;
    END IF;
  END IF;
  IF v_payer IS NOT NULL AND p.tipo='Aluno' AND p.matricula_acesso ~ '^UNIV-A-[0-9]{8}$' THEN
    v_number:=p.matricula_acesso;
  END IF;
  INSERT INTO internal_pdv.receipt_identity(receipt_id,payer_id,enrollment_number,
    source,source_reference,source_fingerprint,captured_by)
  VALUES(r.id,v_payer,v_number,v_source,v_reference,v_source_hash,auth.uid()) ON CONFLICT DO NOTHING;
  -- A concurrent INSERT winner is authoritative; callers read the stored row.
END $$;

CREATE FUNCTION internal_pdv.receipt_payer_dto(r internal_pdv.receipts) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(r.financial_snapshot->'payer','{}'::jsonb)
    ||internal_pdv.format_masked_document(r.financial_snapshot->'payer'->>'documentMasked')
    ||jsonb_build_object('enrollmentNumber',(SELECT enrollment_number
      FROM internal_pdv.receipt_identity WHERE receipt_id=r.id))
$$;

-- Preserve existing OIDs, ACL, security attributes and all financial logic.
DO $patch$
DECLARE v text; v_anchor text; v_replacement text;
BEGIN
  v:=pg_get_functiondef('public.prepare_pdv_receipt(uuid,uuid,uuid)'::regprocedure);
  v_anchor:=$old$    IF NOT FOUND THEN SELECT * INTO v_receipt FROM internal_pdv.receipts
      WHERE receivable_id=v.id AND settlement_fingerprint=v_fingerprint; END IF;$old$;
  v_replacement:=$new$    IF FOUND THEN
      PERFORM internal_pdv.capture_receipt_identity(v_receipt.id,true);
    ELSE
      SELECT * INTO v_receipt FROM internal_pdv.receipts
        WHERE receivable_id=v.id AND settlement_fingerprint=v_fingerprint;
    END IF;$new$;
  IF strpos(v,v_anchor)=0 THEN RAISE EXCEPTION 'Âncora de criação de recibo divergente.'; END IF;
  v:=replace(v,v_anchor,v_replacement);
  v_anchor:='  RETURN internal_pdv.receipt_dto(v_receipt,p_workstation_id,p_printer_id);';
  IF strpos(v,v_anchor)=0 THEN RAISE EXCEPTION 'Âncora de retorno de recibo divergente.'; END IF;
  v:=replace(v,v_anchor,E'  PERFORM internal_pdv.capture_receipt_identity(v_receipt.id,false);\n'||v_anchor);
  EXECUTE v;
  v:=pg_get_functiondef('internal_pdv.receipt_dto(internal_pdv.receipts,uuid,uuid)'::regprocedure);
  v_anchor:='  RETURN p_receipt.financial_snapshot||jsonb_build_object';
  IF strpos(v,v_anchor)=0 THEN RAISE EXCEPTION 'Âncora de apresentação de recibo divergente.'; END IF;
  v:=replace(v,v_anchor,$new$  RETURN jsonb_set(p_receipt.financial_snapshot,'{payer}',
    internal_pdv.receipt_payer_dto(p_receipt))||jsonb_build_object$new$);
  EXECUTE v;
END $patch$;
REVOKE ALL ON FUNCTION internal_pdv.format_masked_document(text),
  internal_pdv.capture_receipt_identity(uuid,boolean),
  internal_pdv.receipt_payer_dto(internal_pdv.receipts) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
