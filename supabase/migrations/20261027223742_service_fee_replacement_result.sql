begin;
create function public.stage_service_fee_replacement_result_service(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;r public.contas_receber;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 j:=internal_academic.assert_service_fee_replacement(p_operation_id,p_manifest_hash);
 select * into strict r from public.contas_receber where id=j.receivable_id;
 if j.lease_token is distinct from p_lease_token or j.lease_until<=clock_timestamp() or j.state<>'ISSUING'
  or j.new_number is null or r.gateway_boleto_nosso_numero is distinct from j.new_number
  or p_result->>'bankSlipOurNumber' is distinct from j.new_number or p_result->>'remotePaymentId' is distinct from j.new_number
  or nullif(p_result->>'pixPayload','') is null or nullif(p_result->>'pixEncodedImage','') is null then
  raise exception 'FEE_REPLACEMENT_RESULT_IDENTITY_REQUIRED'; end if;
 if j.official_result is not null then
  if j.official_result is distinct from p_result then raise exception 'FEE_REPLACEMENT_RESULT_IMMUTABLE'; end if;
  return jsonb_build_object('stored',true,'replayed',true);
 end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 update internal_academic.service_fee_replacements set official_result=p_result,
  result_hash=internal_academic.rejected_fee_sha256(p_result::text) where operation_id=j.operation_id;
 return jsonb_build_object('stored',true,'replayed',false);
end $$;

create function public.finish_service_fee_replacement_service(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;r public.contas_receber;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 select * into strict j from internal_academic.service_fee_replacements where operation_id=p_operation_id for update;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=j.operation_id;
 select * into strict r from public.contas_receber where id=j.receivable_id;
 if j.completed_at is not null then return jsonb_build_object('completed',true,'replayed',true); end if;
 if c.manifest_hash is distinct from p_manifest_hash or j.lease_token is distinct from p_lease_token
  or c.completed_at is null or not internal_academic.technical_manual_banese_receivable_complete(r)
  or r.gateway_boleto_nosso_numero is distinct from coalesce(j.new_number,j.old_number) then
  raise exception 'FEE_REPLACEMENT_COMPLETION_UNCONFIRMED'; end if;
 perform set_config('app.service_fee_replacement',j.operation_id::text,true);
 update internal_academic.service_fee_replacements set state=case when canceled_at is null then 'RECOVERED_PIX' else 'COMPLETE' end,
  completed_at=clock_timestamp(),lease_until=null,last_error=null where operation_id=j.operation_id;
 perform public.registrar_turma_financeiro_auditoria(r.matricula_id,'TAXA_SERVICO_SUBSTITUICAO_CONCLUIDA',
  jsonb_build_object('operationId',j.operation_id,'oldTitleCanceled',j.canceled_at is not null,'officialPixPersisted',true),
  'Obrigação original preservada; título anterior arquivado quando cancelado e uma única transação ativa.');
 return jsonb_build_object('completed',true,'replayed',false);
end $$;

create function public.fail_service_fee_replacement_service(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j internal_academic.service_fee_replacements;c internal_academic.rejected_fee_service_capabilities;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'FEE_REPLACEMENT_SERVICE_REQUIRED'; end if;
 select * into strict j from internal_academic.service_fee_replacements where operation_id=p_operation_id for update;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=j.operation_id;
 if c.manifest_hash is distinct from p_manifest_hash or j.lease_token is distinct from p_lease_token then
  raise exception 'FEE_REPLACEMENT_LEASE_REQUIRED'; end if;
 if j.completed_at is null then
  perform set_config('app.service_fee_replacement',j.operation_id::text,true);
  update internal_academic.service_fee_replacements set lease_until=null,last_error='REVIEW_EXACT_GET_ONLY' where operation_id=j.operation_id;
 end if;
 if c.completed_at is null then
  perform set_config('app.rejected_fee_service_operation',c.operation_id::text,true);
  update internal_academic.rejected_fee_service_capabilities set lease_until=null,last_error='REVIEW_RETRY_GET_ONLY' where operation_id=c.operation_id;
 end if;
 return jsonb_build_object('review',true,'newPostAllowed',false);
end $$;

create function internal_academic.guard_service_fee_canceled_number()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.gateway_boleto_nosso_numero is not distinct from old.gateway_boleto_nosso_numero
  and new.gateway_boleto_convenio is not distinct from old.gateway_boleto_convenio then return new; end if;
 if new.gateway_environment='production' and exists(select 1 from internal_academic.service_fee_replacements j
  where j.canceled_at is not null and j.convenio=new.gateway_boleto_convenio and j.old_number=new.gateway_boleto_nosso_numero) then
  raise exception 'FEE_REPLACEMENT_CANCELED_NUMBER_REUSE'; end if;
 return new;
end $$;
create trigger a0_guard_service_fee_canceled_number before insert or update on public.contas_receber
 for each row execute function internal_academic.guard_service_fee_canceled_number();
revoke all on function public.stage_service_fee_replacement_result_service(uuid,text,uuid,jsonb),
 public.finish_service_fee_replacement_service(uuid,text,uuid),public.fail_service_fee_replacement_service(uuid,text,uuid),
 internal_academic.guard_service_fee_canceled_number() from public,anon,authenticated,service_role;
grant execute on function public.stage_service_fee_replacement_result_service(uuid,text,uuid,jsonb),
 public.finish_service_fee_replacement_service(uuid,text,uuid),public.fail_service_fee_replacement_service(uuid,text,uuid) to service_role;
commit;
