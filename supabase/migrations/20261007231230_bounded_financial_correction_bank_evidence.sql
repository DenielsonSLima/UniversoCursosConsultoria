-- LOCAL REVIEW DRAFT ONLY. SQL trusts only the existing secret-authenticated
-- canonical bank worker, never browser-supplied cancellation evidence.
begin;
create function public.complete_financial_correction_service(
  p_operation_id uuid,p_receivable_id uuid,p_fingerprint text,p_lease_token uuid,p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o internal_financial_correction.operations%rowtype;
  i internal_financial_correction.items%rowtype;
  bank jsonb;
  confirmed_at timestamptz;
begin
  perform internal_financial_correction.service_only();
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'CORRECTION_FINGERPRINT_REQUIRED';
  end if;
  o := internal_financial_correction.assert_operation(p_operation_id,p_fingerprint);
  i := internal_financial_correction.check_item(p_operation_id,p_receivable_id);
  if i.lease_token is distinct from p_lease_token then raise exception 'CORRECTION_LEASE_MISMATCH'; end if;
  if i.kind='LOCAL_WAIVER' then raise exception 'CORRECTION_BANK_ITEM_REQUIRED'; end if;
  if i.state in ('BANK_CONFIRMED','FINALIZED') then
    if i.bank_evidence is distinct from p_evidence then
      raise exception 'CORRECTION_COMPLETION_REPLAY_CONFLICT';
    end if;
    return jsonb_build_object('completed',true,'replayed',true);
  end if;
  if i.state not in ('LEASED','INTENT') or i.lease_until is null
    or i.lease_until<=clock_timestamp() then raise exception 'CORRECTION_LEASE_EXPIRED'; end if;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or jsonb_typeof(p_evidence->'bankResult') is distinct from 'object'
    or coalesce(p_evidence->>'evidenceFingerprint','') !~ '^[a-f0-9]{64}$'
  then raise exception 'CORRECTION_EVIDENCE_MISSING'; end if;
  bank := p_evidence->'bankResult';
  confirmed_at := (p_evidence->>'confirmedAt')::timestamptz;
  if confirmed_at is null or confirmed_at<clock_timestamp()-interval '2 minutes'
    or confirmed_at>clock_timestamp()+interval '30 seconds'
    or bank->>'convenio' is distinct from i.identity_snapshot->>'convenio'
    or bank->>'nossoNumero' is distinct from i.identity_snapshot->>'nossoNumero'
    or bank->'situationCode' is distinct from '5'::jsonb
    or bank->>'remoteStatus' is distinct from 'CANCELED'
    or coalesce(bank#>>'{raw,CodigoSituacaoBoleto}',bank#>>'{raw,codigoSituacaoBoleto}')
      is distinct from '5'
    or bank#>'{proof,strictEffectivePayments}' is distinct from 'true'::jsonb
    or bank#>'{proof,paymentsCount}' is distinct from '0'::jsonb
    or bank#>'{proof,identityValidated}' is distinct from 'true'::jsonb
    or bank#>'{proof,termsValidated}' is distinct from 'true'::jsonb
    or jsonb_typeof(bank->'alreadyCanceled') is distinct from 'boolean'
    or jsonb_typeof(bank->'mutationAttempted') is distinct from 'boolean'
    or bank->'alreadyCanceled'=bank->'mutationAttempted'
    or (bank->'mutationAttempted'='true'::jsonb and (i.state<>'INTENT' or i.intent_at is null))
    or (i.state='INTENT' and bank->'mutationAttempted' is distinct from 'true'::jsonb)
  then raise exception 'CORRECTION_BANK_CONFIRMATION_INVALID'; end if;
  -- Immutable worker attestation only. Financial obligations and transactions
  -- remain unchanged until a separate, exact-full-plan, all-49 atomic finalizer.
  update internal_financial_correction.items set state='BANK_CONFIRMED',lease_until=null,
    bank_evidence=p_evidence,bank_evidence_hash=internal_financial_correction.sha256(p_evidence::text)
    where operation_id=o.id and receivable_id=i.receivable_id;
  perform internal_financial_correction.audit_event(o.id,i.receivable_id,'BANK_CONFIRMED',
    jsonb_build_object('evidenceHash',internal_financial_correction.sha256(p_evidence::text)));
  if (select count(*) from internal_financial_correction.items
      where operation_id=o.id and kind<>'LOCAL_WAIVER' and state='BANK_CONFIRMED')=49 then
    update internal_financial_correction.operations set state='BANK_CONFIRMED' where id=o.id;
  end if;
  return jsonb_build_object('completed',true,'replayed',false);
end $$;
revoke all on function public.complete_financial_correction_service(uuid,uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
commit;
