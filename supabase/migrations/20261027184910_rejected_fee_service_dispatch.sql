begin;
set local lock_timeout='5s';
create function internal_academic.dispatch_rejected_fee_service_issuance(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint; c internal_academic.rejected_fee_service_capabilities;
begin
 if session_user not in ('postgres','supabase_admin') then
  raise exception 'REJECTED_FEE_SERVICE_DISPATCH_ADMIN_REQUIRED' using errcode='42501'; end if;
 c:=internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
 if c.lease_until>clock_timestamp() then raise exception 'REJECTED_FEE_SERVICE_BUSY' using errcode='PT409'; end if;
 secret:=public.get_banese_reconciliation_worker_secret();
 if secret is null or length(secret)<32 then raise exception 'REJECTED_FEE_WORKER_SECRET_UNAVAILABLE'; end if;
 request_id:=net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/technical-manual-cycle-recovery-worker',
  body:=jsonb_build_object('action','issue_approved_rejected_fee_service','operationId',p_operation_id,'manifestHash',p_manifest_hash),
  params:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','X-Banese-Worker-Token',secret),timeout_milliseconds:=90000);
 return jsonb_build_object('queued',true,'requestId',request_id,'singleApprovedFeeOnly',true);
end $$;
revoke all on function internal_academic.dispatch_rejected_fee_service_issuance(uuid,text) from public,anon,authenticated,service_role;
commit;
