begin;
create table internal_academic.service_fee_replacements (
 operation_id uuid primary key references internal_academic.rejected_fee_service_capabilities(operation_id),
 receivable_id uuid not null unique references public.contas_receber(id),
 approval_reference text not null,
 approved_at timestamptz not null default clock_timestamp(),
 source_receivable jsonb not null,
 old_number text not null check(old_number ~ '^[0-9]{9}$'),
 convenio text not null,
 state text not null default 'APPROVED' check(state in
  ('APPROVED','CANCEL_INTENT','RESETTING','ISSUING','COMPLETE','RECOVERED_PIX')),
 lease_token uuid,lease_until timestamptz,cancel_intent_at timestamptz,
 cancel_evidence jsonb,cancel_hash text,canceled_at timestamptz,
 new_number text,issue_started_at timestamptz,
 official_result jsonb,result_hash text,completed_at timestamptz,last_error text,
 unique(convenio,old_number),check(new_number is null or (new_number ~ '^[0-9]{9}$' and new_number<>old_number))
);
alter table internal_academic.service_fee_replacements enable row level security;
revoke all on internal_academic.service_fee_replacements from public,anon,authenticated,service_role;

create function internal_academic.guard_service_fee_replacement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'FEE_REPLACEMENT_HISTORY_IMMUTABLE'; end if;
 if current_setting('app.service_fee_replacement',true) is distinct from new.operation_id::text then
  raise exception 'FEE_REPLACEMENT_CANONICAL_CONTEXT_REQUIRED'; end if;
 if tg_op='UPDATE' and (
  row(new.operation_id,new.receivable_id,new.approval_reference,new.approved_at,new.source_receivable,new.old_number,new.convenio)
   is distinct from row(old.operation_id,old.receivable_id,old.approval_reference,old.approved_at,old.source_receivable,old.old_number,old.convenio)
  or (old.cancel_evidence is not null and row(new.cancel_evidence,new.cancel_hash,new.canceled_at)
   is distinct from row(old.cancel_evidence,old.cancel_hash,old.canceled_at))
  or (old.new_number is not null and new.new_number is distinct from old.new_number)
  or (old.official_result is not null and row(new.official_result,new.result_hash) is distinct from row(old.official_result,old.result_hash))
  or (old.completed_at is not null and to_jsonb(new) is distinct from to_jsonb(old))) then
  raise exception 'FEE_REPLACEMENT_HISTORY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger guard_service_fee_replacement before insert or update or delete
 on internal_academic.service_fee_replacements for each row execute function internal_academic.guard_service_fee_replacement();

create function internal_academic.approve_service_fee_replacement(p_operation_id uuid,p_manifest_hash text,p_approval_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities;r public.contas_receber;j internal_academic.service_fee_replacements;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_ADMIN_REQUIRED'; end if;
 select * into j from internal_academic.service_fee_replacements where operation_id=p_operation_id;
 if found then
  if j.approval_reference is distinct from p_approval_reference then raise exception 'FEE_REPLACEMENT_APPROVAL_CONFLICT'; end if;
  return jsonb_build_object('approved',true,'replayed',true,'state',j.state);
 end if;
 c:=internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
 select * into strict r from public.contas_receber where id=c.receivable_id for update;
 if length(coalesce(p_approval_reference,''))<8 or c.first_claimed_at is null or c.completed_at is not null
  or c.lease_until>clock_timestamp() or r.gateway_creation_token is distinct from c.request_id
  or r.gateway_submission_status is distinct from 'API_AMBIGUOUS' or coalesce(r.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
  or r.gateway_pix_payload is not null or r.gateway_pix_encoded_image is not null
  or r.data_vencimento<timezone('America/Maceio',now())::date then raise exception 'FEE_REPLACEMENT_APPROVAL_SCOPE'; end if;
 perform set_config('app.service_fee_replacement',c.operation_id::text,true);
 insert into internal_academic.service_fee_replacements(operation_id,receivable_id,approval_reference,source_receivable,old_number,convenio)
 values(c.operation_id,r.id,p_approval_reference,to_jsonb(r),r.gateway_boleto_nosso_numero,r.gateway_boleto_convenio);
 perform public.registrar_turma_financeiro_auditoria(r.matricula_id,'TAXA_SERVICO_SUBSTITUICAO_APROVADA',
  jsonb_build_object('operationId',c.operation_id,'approvalReference',p_approval_reference,'oneReplacementOnly',true,'issued',false),
  'Cancelamento condicionado a GET íntegro sem pagamento e sem Pix; uma única substituição autorizada.');
 return jsonb_build_object('approved',true,'replayed',false);
end $$;

create function internal_academic.assert_service_fee_replacement(p_operation_id uuid,p_manifest_hash text)
returns internal_academic.service_fee_replacements language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;r public.contas_receber;
begin
 c:=internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
 select * into strict j from internal_academic.service_fee_replacements where operation_id=c.operation_id for update;
 select * into strict r from public.contas_receber where id=j.receivable_id for update;
 if j.receivable_id is distinct from c.receivable_id or j.convenio is distinct from r.gateway_boleto_convenio
  or (j.state in ('APPROVED','CANCEL_INTENT') and to_jsonb(r) is distinct from j.source_receivable)
  or internal_academic.technical_manual_receivable_issuance_fingerprint(r)
    is distinct from internal_academic.technical_manual_receivable_issuance_fingerprint(
     jsonb_populate_record(null::public.contas_receber,j.source_receivable))
  or internal_financial_correction.has_payment_evidence(r) then raise exception 'FEE_REPLACEMENT_SOURCE_CHANGED'; end if;
 return j;
end $$;

create function public.claim_service_fee_replacement_service(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;lease uuid:=gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 j:=internal_academic.assert_service_fee_replacement(p_operation_id,p_manifest_hash);
 if j.completed_at is not null then return jsonb_build_object('completed',true); end if;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=j.operation_id;
 if j.lease_until>clock_timestamp() or c.lease_until>clock_timestamp() then raise exception 'FEE_REPLACEMENT_BUSY'; end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 update internal_academic.service_fee_replacements set lease_token=lease,lease_until=clock_timestamp()+interval '3 minutes'
 where operation_id=j.operation_id returning * into j;
 perform set_config('app.rejected_fee_service_operation',c.operation_id::text,true);
 update internal_academic.rejected_fee_service_capabilities set lease_token=lease,lease_until=j.lease_until where operation_id=c.operation_id;
 return jsonb_build_object('completed',false,'operationId',j.operation_id,'receivableId',j.receivable_id,
  'matriculaId',j.source_receivable->>'matricula_id','requestId',c.request_id,'leaseToken',lease,'state',j.state,
  'oldNumber',j.old_number,'newNumber',j.new_number,'recoveryOnly',j.issue_started_at is not null,'officialResult',j.official_result);
end $$;

create function public.mark_service_fee_cancel_intent_service(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 j:=internal_academic.assert_service_fee_replacement(p_operation_id,p_manifest_hash);
 if j.lease_token is distinct from p_lease_token or j.lease_until<=clock_timestamp() or j.state not in ('APPROVED','CANCEL_INTENT') then
  raise exception 'FEE_REPLACEMENT_CANCEL_LEASE_REQUIRED'; end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 update internal_academic.service_fee_replacements set state='CANCEL_INTENT',cancel_intent_at=coalesce(cancel_intent_at,clock_timestamp())
 where operation_id=j.operation_id;
 return jsonb_build_object('intent',true);
end $$;

create function internal_academic.dispatch_service_fee_replacement(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;secret text;request_id bigint;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_ADMIN_REQUIRED'; end if;
 j:=internal_academic.assert_service_fee_replacement(p_operation_id,p_manifest_hash);
 if j.lease_until>clock_timestamp() then raise exception 'FEE_REPLACEMENT_BUSY'; end if;
 secret:=public.get_banese_reconciliation_worker_secret();
 if secret is null or length(secret)<32 then raise exception 'FEE_REPLACEMENT_CONFIG_UNAVAILABLE'; end if;
 request_id:=net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/technical-manual-cycle-recovery-worker',
  body:=jsonb_build_object('action','replace_approved_service_fee','operationId',p_operation_id,'manifestHash',p_manifest_hash),
  params:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','X-Banese-Worker-Token',secret),timeout_milliseconds:=90000);
 return jsonb_build_object('queued',true,'requestId',request_id);
end $$;
revoke all on function internal_academic.guard_service_fee_replacement(),
 internal_academic.approve_service_fee_replacement(uuid,text,text),internal_academic.assert_service_fee_replacement(uuid,text),
 internal_academic.dispatch_service_fee_replacement(uuid,text),public.claim_service_fee_replacement_service(uuid,text),
 public.mark_service_fee_cancel_intent_service(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_service_fee_replacement_service(uuid,text),public.mark_service_fee_cancel_intent_service(uuid,text,uuid) to service_role;
commit;
