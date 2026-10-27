-- REVIEW DRAFT ONLY. Private scoped dispatch; no global worker and no grants.
begin;
create function internal_inclusion_cancellation.dispatch_item(p_operation_id uuid,p_receivable_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i internal_inclusion_cancellation.items%rowtype;
 worker_secret text; request_id bigint;
begin
 if coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_FINGERPRINT_REQUIRED'; end if;
 o:=internal_inclusion_cancellation.operation(p_operation_id,p_fingerprint);
 i:=internal_inclusion_cancellation.check_item(o.id,p_receivable_id);
 if i.state='COMPLETE' then return jsonb_build_object('queued',false,'completed',true); end if;
 if i.lease_until>clock_timestamp() or i.last_dispatch_at>clock_timestamp()-interval '2 minutes'
 then raise exception 'INCLUSION_DISPATCH_PENDING'; end if;
 worker_secret:=public.get_banese_reconciliation_worker_secret();
 if worker_secret is null or length(worker_secret)<32 then raise exception 'INCLUSION_WORKER_AUTH_UNAVAILABLE'; end if;
 request_id:=net.http_post(
  url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/enrollment-inclusion-cancellation',
  body:=jsonb_build_object('action','cancel_approved_inclusion_item','operationId',o.id,
   'receivableId',i.receivable_id,'manifestFingerprint',o.fingerprint),params:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','X-Banese-Worker-Token',worker_secret),
  timeout_milliseconds:=60000);
 update internal_inclusion_cancellation.items set last_dispatch_at=clock_timestamp()
  where operation_id=o.id and receivable_id=i.receivable_id;
 insert into internal_inclusion_cancellation.events(operation_id,receivable_id,event,details)
  values(o.id,i.receivable_id,'DISPATCHED',jsonb_build_object('requestId',request_id));
 return jsonb_build_object('queued',true,'requestId',request_id);
end $$;
revoke all on all functions in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
commit;
