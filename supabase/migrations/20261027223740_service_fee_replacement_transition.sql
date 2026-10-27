begin;
set local lock_timeout='5s';
create function internal_academic.service_fee_replacement_reset_valid(old_r public.contas_receber,new_r public.contas_receber)
returns boolean language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;
 allowed text[]:=array['gateway_boleto_nosso_numero','gateway_submission_channel','gateway_submission_status','gateway_last_error','updated_at'];
begin
 select * into j from internal_academic.service_fee_replacements where receivable_id=old_r.id;
 return coalesce(j.state='RESETTING' and j.cancel_evidence is not null and j.cancel_hash=internal_academic.rejected_fee_sha256(j.cancel_evidence::text)
  and j.lease_until>clock_timestamp() and current_setting('app.service_fee_replacement',true)=j.operation_id::text
  and current_setting('app.service_fee_replacement_lease',true)=j.lease_token::text
  and to_jsonb(old_r)=j.source_receivable and (to_jsonb(old_r)-allowed)=(to_jsonb(new_r)-allowed)
  and old_r.gateway_boleto_nosso_numero=j.old_number and new_r.gateway_boleto_nosso_numero is null
  and new_r.gateway_submission_channel is null and new_r.gateway_submission_status is null
  and new_r.gateway_last_error is null and new_r.updated_at>old_r.updated_at
  and not internal_financial_correction.has_payment_evidence(old_r),false);
end $$;

create function internal_academic.service_fee_expected_number(p_receivable_id uuid,p_original text)
returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from internal_academic.service_fee_replacements j
  where j.receivable_id=p_receivable_id and j.state in ('ISSUING','COMPLETE'))
 then (select new_number from internal_academic.service_fee_replacements where receivable_id=p_receivable_id)
 else p_original end;
$$;

create function internal_academic.capture_service_fee_replacement_number(old_r public.contas_receber,new_r public.contas_receber)
returns void language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;
begin
 if new_r.gateway_boleto_nosso_numero is not distinct from old_r.gateway_boleto_nosso_numero then return; end if;
 select * into j from internal_academic.service_fee_replacements where receivable_id=old_r.id for update;
 if not found or j.state<>'ISSUING' then return; end if;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=j.operation_id;
 if old_r.gateway_boleto_nosso_numero is not null or j.new_number is not null
  or coalesce(new_r.gateway_boleto_nosso_numero,'')!~'^[0-9]{9}$' or new_r.gateway_boleto_nosso_numero=j.old_number
  or new_r.gateway_creation_token is distinct from c.request_id or j.cancel_evidence is null
  or j.lease_until<=clock_timestamp() or c.lease_token is distinct from j.lease_token
  or c.lease_until<=clock_timestamp()
  or (coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin')) then
  raise exception 'FEE_REPLACEMENT_NEW_NUMBER_FENCE'; end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 update internal_academic.service_fee_replacements set new_number=new_r.gateway_boleto_nosso_numero where operation_id=j.operation_id;
end $$;

create function public.confirm_service_fee_canceled_service(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements; checked timestamptz;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 j:=internal_academic.assert_service_fee_replacement(p_operation_id,p_manifest_hash);
 checked:=(p_evidence->>'checkedAt')::timestamptz;
 if j.lease_token is distinct from p_lease_token or j.lease_until<=clock_timestamp() or j.state not in ('APPROVED','CANCEL_INTENT')
  or p_evidence->>'oldNumber' is distinct from j.old_number or p_evidence->>'convenio' is distinct from j.convenio
  or p_evidence->>'remoteStatus' is distinct from 'CANCELED' or p_evidence->>'situationCode' is distinct from '5'
  or p_evidence->'paid' is distinct from 'false'::jsonb or p_evidence->>'paymentCount' is distinct from '0'
  or p_evidence->>'method' is distinct from 'GET_AFTER_CANCEL' or coalesce(p_evidence->>'responseHash','')!~'^[a-f0-9]{64}$'
  or checked is null or checked<clock_timestamp()-interval '2 minutes' or checked>clock_timestamp()+interval '1 minute'
  then raise exception 'FEE_REPLACEMENT_CANCEL_PROOF_REQUIRED'; end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 perform set_config('app.service_fee_replacement_lease',p_lease_token::text,true);
 update internal_academic.service_fee_replacements set state='RESETTING',cancel_evidence=p_evidence,
  cancel_hash=internal_academic.rejected_fee_sha256(p_evidence::text),canceled_at=checked where operation_id=j.operation_id;
 update public.contas_receber set gateway_boleto_nosso_numero=null,gateway_submission_channel=null,
  gateway_submission_status=null,gateway_last_error=null,updated_at=clock_timestamp() where id=j.receivable_id;
 update internal_academic.service_fee_replacements set state='ISSUING',issue_started_at=clock_timestamp() where operation_id=j.operation_id;
 return jsonb_build_object('ready',true,'newPostAllowed',true);
end $$;

create function internal_academic.service_fee_replacement_number_valid(old_r public.contas_receber,new_r public.contas_receber)
returns boolean language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;
begin
 select * into j from internal_academic.service_fee_replacements where receivable_id=old_r.id;
 if not found or j.state<>'ISSUING' or j.cancel_evidence is null or j.lease_until<=clock_timestamp()
  or old_r.gateway_boleto_nosso_numero is not null or j.new_number is null
  or new_r.gateway_boleto_nosso_numero is distinct from j.new_number or j.new_number=j.old_number
  or (to_jsonb(old_r)-array['gateway_boleto_nosso_numero','updated_at'])
    is distinct from (to_jsonb(new_r)-array['gateway_boleto_nosso_numero','updated_at']) then return false; end if;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=j.operation_id;
 if c.lease_token is distinct from j.lease_token or c.lease_until<=clock_timestamp()
  or new_r.gateway_creation_token is distinct from c.request_id then return false; end if;
 perform internal_academic.assert_rejected_fee_service_scope(c.operation_id,c.manifest_hash);
 return true;
end $$;

-- Existing guards remain intact; only a leased, proven cancellation can reset
-- this bank identity. The financial fingerprint and source authorization stay fixed.
do $patch$
declare body text;sig text;marker text;
begin
 foreach sig in array array['public.enforce_receivable_gateway_submission_fence()',
  'internal_academic.guard_manual_technical_receivable_first_bank_claim()',
  'internal_academic.guard_rejected_fee_claim_identity()'] loop
  body:=pg_get_functiondef(sig::regprocedure);
  if md5(body) is distinct from (case sig
   when 'public.enforce_receivable_gateway_submission_fence()' then '1ea37a921d26c05d07e7980977430208'
   when 'internal_academic.guard_manual_technical_receivable_first_bank_claim()' then '0dc8012b39070a75500e5e0e8c4e3454'
   when 'internal_academic.guard_rejected_fee_claim_identity()' then '8e127250b2a8410c7686535535a3acee' end) then
   raise exception 'FEE_REPLACEMENT_GUARD_HASH_DRIFT'; end if;
  if strpos(body,'service_fee_replacement_reset_valid')<>0 then raise exception 'FEE_REPLACEMENT_GUARD_ALREADY_PATCHED'; end if;
  marker:=E'begin\n';
  if strpos(body,marker)=0 then raise exception 'FEE_REPLACEMENT_GUARD_DRIFT'; end if;
  body:=replace(body,marker,marker||E'  if internal_academic.service_fee_replacement_reset_valid(old,new) then return new; end if;\n');
  if sig='internal_academic.guard_manual_technical_receivable_first_bank_claim()' then
   body:=replace(body,marker,marker||E'  if internal_academic.service_fee_replacement_number_valid(old,new) then return new; end if;\n');
  end if;
  if sig='internal_academic.guard_rejected_fee_claim_identity()' then
   body:=replace(body,E'  if internal_academic.service_fee_replacement_reset_valid(old,new) then return new; end if;\n',
    E'  if internal_academic.service_fee_replacement_reset_valid(old,new) then return new; end if;\n  perform internal_academic.capture_service_fee_replacement_number(old,new);\n');
   marker:='new.gateway_boleto_nosso_numero is distinct from o.source_receivable->>''gateway_boleto_nosso_numero''';
   if strpos(body,marker)=0 then raise exception 'FEE_REPLACEMENT_IDENTITY_GUARD_DRIFT'; end if;
   body:=replace(body,marker,'new.gateway_boleto_nosso_numero is distinct from internal_academic.service_fee_expected_number(new.id,o.source_receivable->>''gateway_boleto_nosso_numero'')');
  end if;
  execute body;
 end loop;
 body:=pg_get_functiondef('public.rejected_fee_bank_policy_service(uuid,uuid)'::regprocedure);
 if md5(body)<>'fec3fae83d1980c140b94e93d6e06764' then raise exception 'FEE_REPLACEMENT_BANK_POLICY_HASH_DRIFT'; end if;
 marker:='r.gateway_boleto_nosso_numero is distinct from o.source_receivable->>''gateway_boleto_nosso_numero''';
 if strpos(body,marker)=0 then raise exception 'FEE_REPLACEMENT_BANK_POLICY_DRIFT'; end if;
 execute replace(body,marker,'r.gateway_boleto_nosso_numero is distinct from internal_academic.service_fee_expected_number(r.id,o.source_receivable->>''gateway_boleto_nosso_numero'')');
end $patch$;
revoke all on function internal_academic.service_fee_replacement_reset_valid(public.contas_receber,public.contas_receber),
 internal_academic.service_fee_expected_number(uuid,text),
 internal_academic.capture_service_fee_replacement_number(public.contas_receber,public.contas_receber),
 internal_academic.service_fee_replacement_number_valid(public.contas_receber,public.contas_receber),
 public.confirm_service_fee_canceled_service(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.confirm_service_fee_canceled_service(uuid,text,uuid,jsonb) to service_role;
commit;
