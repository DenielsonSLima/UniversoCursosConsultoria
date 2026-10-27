begin;
set local lock_timeout='5s';
create table internal_academic.rejected_fee_service_capabilities (
 operation_id uuid primary key references internal_academic.technical_rejected_fee_corrections(id),
 manifest_hash text not null, receivable_id uuid not null unique, request_id uuid not null unique,
 approval_reference text not null, actor_kind text not null check(actor_kind='SYSTEM'),
 prepared_receivable jsonb not null, source_authorization jsonb not null, source_run jsonb not null, siblings_hash text not null,
 approved_at timestamptz not null default clock_timestamp(), first_claimed_at timestamptz,
 lease_token uuid, lease_until timestamptz, fingerprint text, completed_at timestamptz, result_hash text, last_error text
);
alter table internal_academic.rejected_fee_service_capabilities enable row level security;
revoke all on internal_academic.rejected_fee_service_capabilities from public,anon,authenticated,service_role;

create function internal_academic.guard_rejected_fee_service_capability()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'REJECTED_FEE_SERVICE_HISTORY_IMMUTABLE'; end if;
 if current_setting('app.rejected_fee_service_operation',true) is distinct from new.operation_id::text then
  raise exception 'REJECTED_FEE_SERVICE_CANONICAL_CONTEXT_REQUIRED' using errcode='42501'; end if;
 if tg_op='UPDATE' and (
  (to_jsonb(old)-array['first_claimed_at','lease_token','lease_until','fingerprint','completed_at','result_hash','last_error'])
   is distinct from (to_jsonb(new)-array['first_claimed_at','lease_token','lease_until','fingerprint','completed_at','result_hash','last_error'])
  or (old.first_claimed_at is not null and (new.first_claimed_at is distinct from old.first_claimed_at or new.fingerprint is distinct from old.fingerprint))
  or (old.completed_at is not null and (new.completed_at is distinct from old.completed_at or new.result_hash is distinct from old.result_hash))) then
  raise exception 'REJECTED_FEE_SERVICE_HISTORY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger guard_rejected_fee_service_capability before insert or update or delete
on internal_academic.rejected_fee_service_capabilities for each row execute function internal_academic.guard_rejected_fee_service_capability();

create function internal_academic.assert_rejected_fee_service_scope(p_operation_id uuid,p_manifest_hash text)
returns internal_academic.rejected_fee_service_capabilities
language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities; o internal_academic.technical_rejected_fee_corrections;
 r public.contas_receber; run internal_academic.technical_manual_cycle_runs; a jsonb;
begin
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=p_operation_id for update;
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_operation_id for update;
 perform pg_advisory_xact_lock(hashtextextended('technical-manual-banese:'||c.receivable_id::text,0));
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=o.matricula_id and cycle_number=2 for update;
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 select * into strict r from public.contas_receber where id=c.receivable_id;
 select to_jsonb(x) into strict a from internal_academic.technical_manual_receivable_issuance_authorizations x where receivable_id=c.receivable_id;
 if c.manifest_hash is distinct from p_manifest_hash or o.manifest_hash is distinct from p_manifest_hash
  or c.receivable_id is distinct from o.receivable_id or c.request_id is distinct from o.new_request_id
  or c.actor_kind<>'SYSTEM' or o.state<>'CONSENTED' or o.consent_actor_id is not null
  or to_jsonb(run) is distinct from c.source_run or a is distinct from c.source_authorization
  or internal_academic.rejected_fee_siblings_hash(run,r.id) is distinct from c.siblings_hash
  or r.valor is distinct from 100::numeric or r.data_vencimento is distinct from date '2026-10-30'
  or not internal_academic.rejected_fee_corrected_valid(r)
  or internal_financial_correction.has_payment_evidence(r)
  or (internal_academic.is_technical_manual_cycle_protected(r.matricula_id)
   and not internal_academic.manual_cycle_manager_receivable_valid(r.id,r.matricula_id))
  or not internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id)
  or not exists(select 1 from public.matriculas m where m.id=r.matricula_id and m.turma_id=r.turma_id
    and upper(coalesce(m.status,'')) in ('PENDENTE','ATIVO'))
  or (c.first_claimed_at is not null and c.fingerprint is distinct from internal_academic.technical_manual_receivable_issuance_fingerprint(r))
  or exists(select 1 from public.contas_receber x where x.id<>r.id and x.gateway_environment='production'
    and x.gateway_boleto_convenio=r.gateway_boleto_convenio and x.gateway_boleto_nosso_numero=r.gateway_boleto_nosso_numero)
  or (c.completed_at is null and exists(select 1 from public.payment_gateway_transactions x where x.receivable_id=r.id))
  or run.item_count<>13 or cardinality(run.receivable_ids)<>13
  or (select count(*) from public.contas_receber x where x.id=any(run.receivable_ids) and x.id<>r.id
      and x.tipo_lancamento='PARCELA' and internal_academic.technical_manual_banese_receivable_complete(x))<>12 then
  raise exception 'REJECTED_FEE_SERVICE_SCOPE_CHANGED' using errcode='PT409'; end if;
 return c;
end $$;

create function internal_academic.approve_rejected_fee_service_issuance(p_operation_id uuid,p_manifest_hash text,p_approval_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections; r public.contas_receber; run internal_academic.technical_manual_cycle_runs;
 a jsonb; c internal_academic.rejected_fee_service_capabilities;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_operation_id for update;
 select * into c from internal_academic.rejected_fee_service_capabilities where operation_id=p_operation_id;
 if found then
  if c.approval_reference is distinct from p_approval_reference then raise exception 'REJECTED_FEE_APPROVAL_REPLAY_CONFLICT'; end if;
  perform internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
  return jsonb_build_object('approved',true,'replayed',true,'issued',false);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('technical-manual-banese:'||o.receivable_id::text,0));
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=o.matricula_id and cycle_number=2 for update;
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 select * into strict r from public.contas_receber where id=o.receivable_id;
 select to_jsonb(x) into strict a from internal_academic.technical_manual_receivable_issuance_authorizations x where receivable_id=r.id;
 if o.state<>'PREPARED' or o.manifest_hash is distinct from p_manifest_hash
  or length(coalesce(p_approval_reference,''))<8 or o.consent_at is not null or o.consent_actor_id is not null
  or to_jsonb(run) is distinct from o.source_run or a is distinct from o.source_authorization
  or internal_academic.rejected_fee_siblings_hash(run,r.id) is distinct from o.siblings_hash
  or not internal_academic.rejected_fee_corrected_valid(r) or internal_financial_correction.has_payment_evidence(r)
  or r.valor is distinct from 100::numeric or r.data_vencimento is distinct from date '2026-10-30'
  or r.data_vencimento<timezone('America/Maceio',now())::date or r.gateway_creation_token is not null
  or r.gateway_submission_status is not null or r.gateway_payment_id is not null
  or exists(select 1 from public.payment_gateway_transactions where receivable_id=r.id)
  or not internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id)
  or run.item_count<>13 or cardinality(run.receivable_ids)<>13
  or (select count(*) from public.contas_receber x where x.id=any(run.receivable_ids) and x.id<>r.id
    and x.tipo_lancamento='PARCELA' and internal_academic.technical_manual_banese_receivable_complete(x))<>12 then
  raise exception 'REJECTED_FEE_SERVICE_APPROVAL_SCOPE' using errcode='PT409'; end if;
 perform set_config('app.rejected_fee_service_operation',o.id::text,true);
 insert into internal_academic.rejected_fee_service_capabilities(operation_id,manifest_hash,receivable_id,request_id,
 approval_reference,actor_kind,prepared_receivable,source_authorization,source_run,siblings_hash)
 values(o.id,o.manifest_hash,r.id,o.new_request_id,p_approval_reference,'SYSTEM',to_jsonb(r),a,to_jsonb(run),o.siblings_hash);
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set state='CONSENTED',consent_actor_id=null,consent_at=clock_timestamp() where id=o.id;
 perform public.registrar_turma_financeiro_auditoria(o.matricula_id,'TAXA_REJEITADA_SERVICO_APROVADO',
 jsonb_build_object('operationId',o.id,'manifestHash',o.manifest_hash,'approvalReference',p_approval_reference,
 'executionActorKind','SYSTEM','authorizedBy',null,'issued',false), 'Capacidade específica de serviço; autorização histórica imutável.');
 return jsonb_build_object('approved',true,'replayed',false,'issued',false);
end $$;

create function internal_academic.rejected_fee_service_claim_transition(old_r public.contas_receber,new_r public.contas_receber)
returns boolean language plpgsql security definer set search_path='' as $$
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
end $$;

create function public.claim_rejected_fee_service_issuance(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities; r public.contas_receber; lease uuid:=gen_random_uuid(); retry boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 c:=internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
 if c.completed_at is not null then return jsonb_build_object('operationId',c.operation_id,'manifestHash',c.manifest_hash,
 'receivableId',c.receivable_id,'matriculaId',c.prepared_receivable->>'matricula_id','requestId',c.request_id,
 'completed',true,'recoveryOnly',true,'issued',true); end if;
 if c.lease_until>clock_timestamp() then raise exception 'REJECTED_FEE_SERVICE_BUSY' using errcode='PT409'; end if;
 retry:=c.first_claimed_at is not null;
 select * into strict r from public.contas_receber where id=c.receivable_id;
 if not retry and to_jsonb(r) is distinct from c.prepared_receivable then raise exception 'REJECTED_FEE_PREPARED_CHANGED'; end if;
 if retry and r.gateway_creation_token is distinct from c.request_id then raise exception 'REJECTED_FEE_RETRY_IDENTITY_CHANGED'; end if;
 perform set_config('app.rejected_fee_service_operation',c.operation_id::text,true);
 update internal_academic.rejected_fee_service_capabilities set lease_token=lease,lease_until=clock_timestamp()+interval '90 seconds',
 first_claimed_at=coalesce(first_claimed_at,clock_timestamp()),fingerprint=coalesce(fingerprint,internal_academic.technical_manual_receivable_issuance_fingerprint(r)) where operation_id=c.operation_id;
 perform set_config('app.rejected_fee_service_lease',lease::text,true);
 if not retry then update public.contas_receber set gateway_creation_token=c.request_id,gateway_status='CREATING',updated_at=clock_timestamp() where id=r.id returning * into r; end if;
 return jsonb_build_object('operationId',c.operation_id,'manifestHash',c.manifest_hash,'leaseToken',lease,'receivableId',r.id,
 'requestId',c.request_id,'matriculaId',r.matricula_id,'turmaId',r.turma_id,'poloId',r.polo_id,
 'issuerPoloId',r.gateway_issuer_polo_id,'recoveryOnly',retry,'completed',false);
end $$;

create function internal_academic.rejected_fee_service_effective_authorization(p_receivable_id uuid,p_request_id uuid)
returns internal_academic.technical_manual_receivable_issuance_authorizations
language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities; a internal_academic.technical_manual_receivable_issuance_authorizations;
begin
 select * into strict c from internal_academic.rejected_fee_service_capabilities where receivable_id=p_receivable_id;
 if c.request_id is distinct from p_request_id or c.lease_token::text is distinct from current_setting('app.rejected_fee_service_persist_lease',true)
  or c.first_claimed_at is null or (c.lease_until is null or c.lease_until<=clock_timestamp()) then raise exception 'REJECTED_FEE_SERVICE_CAPABILITY_REQUIRED' using errcode='42501'; end if;
 perform internal_academic.assert_rejected_fee_service_scope(c.operation_id,c.manifest_hash);
 a:=jsonb_populate_record(null::internal_academic.technical_manual_receivable_issuance_authorizations,c.source_authorization);
 a.request_id:=c.request_id;a.authorized_by:=null;a.authorized_at:=c.approved_at;a.first_claimed_at:=c.first_claimed_at;
 a.last_claimed_at:=c.first_claimed_at;a.claim_count:=1;a.receivable_fingerprint:=c.fingerprint;
 return a;
end $$;

DO $patch$
declare body text; marker text:='begin'||chr(10); source text; old_auth text;
begin
 if (select md5(prosrc) from pg_proc where oid='internal_academic.guard_manual_technical_receivable_first_bank_claim()'::regprocedure)<>'bb5fa2a95ec942f796149226ae6ece80' then raise exception 'REJECTED_FEE_FIRST_CLAIM_HASH_DRIFT'; end if;
 body:=pg_get_functiondef('internal_academic.guard_manual_technical_receivable_first_bank_claim()'::regprocedure);
 if strpos(body,'v_first_claim boolean;')=0 or strpos(body,'v_authorization')=0 or strpos(body,'rejected_fee_service_claim_transition')<>0 then raise exception 'REJECTED_FEE_FIRST_CLAIM_PATCH_DRIFT'; end if;
 if (length(body)-length(replace(body,marker,'')))/length(marker)<>1 then raise exception 'REJECTED_FEE_FIRST_CLAIM_MARKER_DRIFT'; end if;
 body:=replace(body,marker,marker||'  if internal_academic.rejected_fee_service_claim_transition(old,new) then return new; end if;'||chr(10));
 execute body;
 if (select md5(prosrc) from pg_proc where oid='public.persist_technical_manual_cycle_banese_issuance(uuid,uuid,uuid,jsonb)'::regprocedure)<>'12e2d196f998588cc72de75305b96118' then raise exception 'REJECTED_FEE_PERSIST_HASH_DRIFT'; end if;
 source:=pg_get_functiondef('public.persist_technical_manual_cycle_banese_issuance(uuid,uuid,uuid,jsonb)'::regprocedure);
 old_auth:=$old$  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = p_authorization_request_id
  for update;$old$;
 if (length(source)-length(replace(source,old_auth,'')))/length(old_auth)<>1 then raise exception 'REJECTED_FEE_PERSIST_PATCH_DRIFT'; end if;
 source:=replace(source,'public.persist_technical_manual_cycle_banese_issuance(', 'internal_academic.persist_rejected_fee_service_canonical(');
 source:=replace(source,old_auth,'  v_auth:=internal_academic.rejected_fee_service_effective_authorization(v_receivable.id,p_authorization_request_id);');
 execute source;
end $patch$;

create function public.persist_rejected_fee_service_issuance(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities; result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 c:=internal_academic.assert_rejected_fee_service_scope(p_operation_id,p_manifest_hash);
 if c.lease_token is distinct from p_lease_token or c.first_claimed_at is null then raise exception 'REJECTED_FEE_SERVICE_LEASE_REQUIRED'; end if;
 if c.completed_at is not null then
  if c.result_hash is distinct from internal_academic.rejected_fee_sha256(p_result::text) then raise exception 'REJECTED_FEE_RESULT_REPLAY_CONFLICT'; end if;
  return jsonb_build_object('success',true,'replayed',true,'issued',true);
 end if;
 if c.lease_until is null or c.lease_until<=clock_timestamp() then raise exception 'REJECTED_FEE_SERVICE_LEASE_REQUIRED'; end if;
 perform set_config('app.rejected_fee_service_persist_lease',c.lease_token::text,true);
 result:=internal_academic.persist_rejected_fee_service_canonical(c.receivable_id,c.request_id,c.request_id,p_result);
 perform set_config('app.rejected_fee_service_operation',c.operation_id::text,true);
 update internal_academic.rejected_fee_service_capabilities set completed_at=clock_timestamp(),result_hash=internal_academic.rejected_fee_sha256(p_result::text) where operation_id=c.operation_id;
 perform public.registrar_turma_financeiro_auditoria((c.prepared_receivable->>'matricula_id')::uuid,'TAXA_REJEITADA_SERVICO_CONCLUIDO',
 jsonb_build_object('operationId',c.operation_id,'manifestHash',c.manifest_hash,'executionActorKind','SYSTEM','issued',true), 'Emissão restrita de serviço persistida pelo contrato canônico.');
 return result;
end $$;
create function public.fail_rejected_fee_service_issuance(p_operation_id uuid,p_manifest_hash text,p_lease_token uuid,p_diagnostic text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c internal_academic.rejected_fee_service_capabilities;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=p_operation_id for update;
 if c.manifest_hash is distinct from p_manifest_hash or c.lease_token is distinct from p_lease_token
  or c.first_claimed_at is null or c.completed_at is not null then raise exception 'REJECTED_FEE_SERVICE_LEASE_REQUIRED'; end if;
 -- Never store caller-supplied text: it may contain credentials or bank PII.
 perform set_config('app.rejected_fee_service_operation',c.operation_id::text,true);
 update internal_academic.rejected_fee_service_capabilities set lease_until=null,last_error='REVIEW_RETRY_GET_ONLY' where operation_id=c.operation_id;
 return jsonb_build_object('review',true,'recoveryOnly',true,'issued',false);
end $$;
revoke all on function internal_academic.guard_rejected_fee_service_capability(),internal_academic.assert_rejected_fee_service_scope(uuid,text),
 internal_academic.approve_rejected_fee_service_issuance(uuid,text,text),
 internal_academic.rejected_fee_service_claim_transition(public.contas_receber,public.contas_receber),
 internal_academic.rejected_fee_service_effective_authorization(uuid,uuid),
 internal_academic.persist_rejected_fee_service_canonical(uuid,uuid,uuid,jsonb),
 public.claim_rejected_fee_service_issuance(uuid,text),public.persist_rejected_fee_service_issuance(uuid,text,uuid,jsonb),
 public.fail_rejected_fee_service_issuance(uuid,text,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.claim_rejected_fee_service_issuance(uuid,text),public.persist_rejected_fee_service_issuance(uuid,text,uuid,jsonb),
 public.fail_rejected_fee_service_issuance(uuid,text,uuid,text) to service_role;
commit;
