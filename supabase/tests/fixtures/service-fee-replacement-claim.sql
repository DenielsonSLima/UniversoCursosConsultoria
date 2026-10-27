CREATE OR REPLACE FUNCTION internal_academic.rejected_fee_service_claim_transition(old_r contas_receber, new_r contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c internal_academic.rejected_fee_service_capabilities;
 allowed text[]:=array['gateway_creation_token','gateway_status','gateway_submission_channel','gateway_submission_status','gateway_last_error','updated_at'];
begin
 select * into c from internal_academic.rejected_fee_service_capabilities where receivable_id=old_r.id;
 if not found or c.completed_at is not null or c.first_claimed_at is null or (c.lease_until is null or c.lease_until<=clock_timestamp())
  or c.lease_token is null or c.fingerprint is null then return false; end if;
 if new_r.gateway_creation_token is distinct from c.request_id or new_r.gateway_status is distinct from 'CREATING'
  or (to_jsonb(old_r)-allowed) is distinct from (to_jsonb(new_r)-allowed)
  or internal_financial_correction.has_payment_evidence(old_r)
  or not internal_academic.rejected_fee_corrected_valid(new_r) then return false; end if;
 perform internal_academic.assert_rejected_fee_service_scope(c.operation_id,c.manifest_hash);
 return coalesce((current_setting('app.rejected_fee_service_lease',true)=c.lease_token::text
   and to_jsonb(old_r)=c.prepared_receivable and new_r.gateway_submission_channel is null and new_r.gateway_submission_status is null)
  or (old_r.gateway_creation_token=c.request_id and new_r.gateway_submission_channel='API'
   and new_r.gateway_submission_status='API_AMBIGUOUS' and old_r.gateway_submission_status is null),false);
end $function$;

