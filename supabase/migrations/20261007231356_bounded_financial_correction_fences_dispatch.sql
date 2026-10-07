-- No grants. Private dispatch reuses existing authentication inside the database.
begin;
alter table internal_financial_correction.items add column last_dispatch_at timestamptz;
create function internal_financial_correction.has_active_fence(p_receivable_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from internal_financial_correction.items i join internal_financial_correction.operations o on o.id=i.operation_id
 where i.receivable_id=p_receivable_id and i.state<>'FINALIZED'
 and ((o.execution_enabled and o.state in ('APPROVED','BANK_CONFIRMED')) or i.intent_at is not null));
$$;
create function internal_financial_correction.fence_new_operation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.receivable_id is null then return new; end if;
 if tg_table_name='technical_manual_banese_reissue_jobs' and internal_financial_correction.finalizing(new.receivable_id)
 and exists(select 1 from internal_financial_correction.items where receivable_id=new.receivable_id and kind='RESET_C1')
 then return new; end if;
 if exists(select 1 from internal_financial_correction.items where receivable_id=new.receivable_id)
 and current_setting('transaction_isolation')<>'read committed' then raise exception 'BOUNDED_FRESH_SNAPSHOT_REQUIRED'; end if;
 perform 1 from public.contas_receber where id=new.receivable_id for update;
 if internal_financial_correction.has_active_fence(new.receivable_id) then raise exception 'BOUNDED_OTHER_OPERATION_FENCED'; end if;
 return new;
end $$;
create trigger a00_bounded_settlement_fence before insert on public.receivable_manual_settlements
for each row execute function internal_financial_correction.fence_new_operation();
create trigger a00_bounded_reissue_fence before insert on internal_academic.technical_manual_banese_reissue_jobs
for each row execute function internal_financial_correction.fence_new_operation();
create trigger a00_bounded_cancellation_fence before insert on public.banese_cancellation_outbox
for each row execute function internal_financial_correction.fence_new_operation();
create trigger a00_bounded_renegotiation_fence before insert on public.receivable_renegotiation_source_items
for each row execute function internal_financial_correction.fence_new_operation();

create function internal_financial_correction.fence_queue()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not internal_financial_correction.has_active_fence(new.receivable_id) then return new; end if;
 if exists(select 1 from public.contas_receber r where r.id=new.receivable_id and internal_financial_correction.has_payment_evidence(r)) then return new; end if;
 if new.state='LEASED' or new.lease_run_id is not null then raise exception 'BOUNDED_RECONCILIATION_FENCED'; end if;
 if new.state='READY' then new.state:='DONE';new.next_check_at:=null;new.lease_run_id:=null;new.lease_until:=null;new.last_result:='CANCELLATION_IN_PROGRESS'; end if;
 return new;
end $$;
create trigger a00_bounded_queue_fence before insert or update on public.banese_reconciliation_queue
for each row execute function internal_financial_correction.fence_queue();

create function internal_financial_correction.dispatch_cancel_item(p_operation_id uuid,p_receivable_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype;i internal_financial_correction.items%rowtype;
 worker_secret text; request_id bigint;
begin
 o:=internal_financial_correction.assert_operation(p_operation_id,p_fingerprint);
 i:=internal_financial_correction.check_item(o.id,p_receivable_id);
 if i.kind='LOCAL_WAIVER' then raise exception 'BOUNDED_BANK_TARGET_REQUIRED'; end if;
 if i.state in ('BANK_CONFIRMED','FINALIZED') then return jsonb_build_object('queued',false,'bankConfirmed',true); end if;
 if i.lease_until>clock_timestamp() or i.last_dispatch_at>clock_timestamp()-interval '2 minutes'
 then raise exception 'BOUNDED_DISPATCH_ALREADY_PENDING'; end if;
 worker_secret:=public.get_banese_reconciliation_worker_secret();
 if worker_secret is null or length(worker_secret)<32 then raise exception 'BOUNDED_EXISTING_WORKER_AUTH_UNAVAILABLE'; end if;
 request_id:=net.http_post(
  url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/technical-manual-cycle-recovery-worker',
  body:=jsonb_build_object('action','cancel_approved_financial_correction_item','operationId',o.id,
   'receivableId',i.receivable_id,'manifestFingerprint',o.fingerprint),params:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','X-Banese-Worker-Token',worker_secret),timeout_milliseconds:=60000);
 update internal_financial_correction.items set last_dispatch_at=clock_timestamp() where operation_id=o.id and receivable_id=i.receivable_id;
 perform internal_financial_correction.audit_event(o.id,i.receivable_id,'DISPATCH_QUEUED',jsonb_build_object('requestId',request_id));
 return jsonb_build_object('queued',true,'requestId',request_id);
end $$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
