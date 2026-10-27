begin;
set local lock_timeout='5s';
create function internal_academic.consent_rejected_fee_correction(r public.contas_receber,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype;
 a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype; actor uuid:=auth.uid();
begin
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=r.id for update;
 if not found then return; end if;
 if o.state not in ('PREPARED','CONSENTED') or p_request_id is distinct from o.new_request_id
  or not internal_academic.rejected_fee_corrected_valid(r) then
  raise exception 'REJECTED_FEE_NEW_APPROVED_REQUEST_REQUIRED' using errcode='PT409'; end if;
 if actor is null or not coalesce(public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(r.polo_id),false) then
  raise exception 'REJECTED_FEE_REAL_MANAGER_CONSENT_REQUIRED' using errcode='42501'; end if;
 if o.state='CONSENTED' then return; end if;
 if o.corrected_due_date<timezone('America/Maceio',now())::date or r.gateway_creation_token is not null or r.gateway_payment_id is not null
  or r.gateway_submission_status is not null or internal_financial_correction.has_payment_evidence(r)
  or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id)
  or not internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id) then
  raise exception 'REJECTED_FEE_PRE_CONSENT_STATE_CHANGED' using errcode='PT409'; end if;
 select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id for update;
 if to_jsonb(a) is distinct from o.source_authorization then raise exception 'REJECTED_FEE_AUTHORIZATION_CHANGED' using errcode='PT409'; end if;
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set state='CONSENTED',consent_actor_id=actor,consent_at=clock_timestamp() where id=o.id;
 update internal_academic.technical_manual_receivable_issuance_authorizations
 set request_id=o.new_request_id,receivable_fingerprint=internal_academic.technical_manual_receivable_issuance_fingerprint(r),
  authorized_by=actor,authorized_at=clock_timestamp(),first_claimed_at=null,last_claimed_at=null,claim_count=0
 where receivable_id=r.id;
 perform public.registrar_turma_financeiro_auditoria(o.matricula_id,'TAXA_REJEITADA_NOVO_CONSENTIMENTO_GESTOR',
  jsonb_build_object('operationId',o.id,'receivableId',r.id,'oldRequestId',o.source_authorization->>'request_id',
   'newRequestId',o.new_request_id,'actorId',actor,'manifestHash',o.manifest_hash,
   'oldClaimCount',o.source_authorization->'claim_count','dueDate',o.corrected_due_date,'issued',false),
  'Gestor autenticado consentiu a nova tentativa somente da taxa; autorização anterior preservada no arquivo imutável.');
end $$;

create function public.resolve_rejected_fee_request_service(p_receivable_id uuid,p_cycle_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; r public.contas_receber%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
  raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=p_receivable_id;
 if not found then return jsonb_build_object('required',false); end if;
 if o.cycle_request_id is distinct from p_cycle_request_id or o.state not in ('PREPARED','CONSENTED') then
  raise exception 'REJECTED_FEE_PREPARATION_REQUIRED' using errcode='PT409'; end if;
 select * into strict r from public.contas_receber where id=p_receivable_id;
 if not internal_academic.rejected_fee_corrected_valid(r) then raise exception 'REJECTED_FEE_CORRECTION_DRIFT' using errcode='PT409'; end if;
 return jsonb_build_object('required',true,'requestId',o.new_request_id,'receivableId',r.id,
  'cycleRequestId',o.cycle_request_id,'requiresManagerConsent',true);
end $$;

create function public.rejected_fee_bank_policy_service(p_receivable_id uuid,p_creation_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; r public.contas_receber%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
  raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=p_receivable_id;
 if not found then return jsonb_build_object('required',false); end if;
 select * into strict r from public.contas_receber where id=p_receivable_id;
 if o.state<>'CONSENTED' or p_creation_token is distinct from o.new_request_id
  or r.gateway_creation_token is distinct from p_creation_token
  or r.gateway_boleto_nosso_numero is distinct from o.source_receivable->>'gateway_boleto_nosso_numero'
  or r.gateway_boleto_convenio is distinct from o.source_receivable->>'gateway_boleto_convenio'
  or r.gateway_environment is distinct from 'production'
  or not internal_academic.rejected_fee_corrected_valid(r)
  or internal_financial_correction.has_payment_evidence(r)
  or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id)
  or exists(select 1 from public.contas_receber c where c.id<>r.id and c.gateway_environment='production'
   and c.gateway_boleto_convenio=r.gateway_boleto_convenio and c.gateway_boleto_nosso_numero=r.gateway_boleto_nosso_numero)
  or not internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id) then
  raise exception 'REJECTED_FEE_BANK_POLICY_CHANGED' using errcode='PT409'; end if;
 return jsonb_build_object('required',true,'environment','production','convenio',r.gateway_boleto_convenio,
  'nossoNumero',r.gateway_boleto_nosso_numero,'allowNewPost',r.data_vencimento>=timezone('America/Maceio',now())::date);
end $$;

create function internal_academic.guard_rejected_fee_authorization()
returns trigger language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype;
begin
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=old.receivable_id;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then raise exception 'REJECTED_FEE_AUTHORIZATION_HISTORY_REQUIRED' using errcode='55000'; end if;
 if to_jsonb(new)=to_jsonb(old) then return new; end if;
 if old.request_id=(o.source_authorization->>'request_id')::uuid and new.request_id=o.new_request_id
  and o.state='CONSENTED' and o.consent_actor_id=auth.uid()
  and current_setting('app.rejected_fee_correction_id',true)=o.id::text
  and to_jsonb(old)=o.source_authorization and new.authorized_by=o.consent_actor_id
  and new.first_claimed_at is null and new.last_claimed_at is null and new.claim_count=0
  and (to_jsonb(new)-array['request_id','receivable_fingerprint','authorized_by','authorized_at','first_claimed_at','last_claimed_at','claim_count'])
   =(to_jsonb(old)-array['request_id','receivable_fingerprint','authorized_by','authorized_at','first_claimed_at','last_claimed_at','claim_count']) then return new; end if;
 if o.state='CONSENTED' and old.request_id=o.new_request_id and
  (to_jsonb(new)-array['first_claimed_at','last_claimed_at','claim_count'])=(to_jsonb(old)-array['first_claimed_at','last_claimed_at','claim_count'])
  and new.claim_count>=old.claim_count and new.first_claimed_at is not null
  and (old.first_claimed_at is null or new.first_claimed_at=old.first_claimed_at)
  and new.last_claimed_at>=coalesce(old.last_claimed_at,new.last_claimed_at) then return new; end if;
 raise exception 'REJECTED_FEE_CANONICAL_CONSENT_REQUIRED' using errcode='42501';
end $$;
create trigger guard_rejected_fee_authorization before update or delete
on internal_academic.technical_manual_receivable_issuance_authorizations for each row
execute function internal_academic.guard_rejected_fee_authorization();

create function internal_academic.guard_rejected_fee_claim_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype;
begin
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=old.id;
 if not found or o.state not in ('PREPARED','CONSENTED') then return new; end if;
 if new.data_vencimento is distinct from o.corrected_due_date or new.gateway_financial_terms is distinct from o.corrected_terms
  or new.gateway_boleto_nosso_numero is distinct from o.source_receivable->>'gateway_boleto_nosso_numero'
  or new.gateway_boleto_convenio is distinct from o.source_receivable->>'gateway_boleto_convenio'
  or new.gateway_provider is distinct from 'banese_card' or new.gateway_environment is distinct from 'production'
  or (new.gateway_creation_token is not null and (o.state<>'CONSENTED' or new.gateway_creation_token is distinct from o.new_request_id)) then
  raise exception 'REJECTED_FEE_APPROVED_CLAIM_IDENTITY_REQUIRED' using errcode='23514'; end if;
 return new;
end $$;
create trigger a0_guard_rejected_fee_claim_identity before update on public.contas_receber
for each row execute function internal_academic.guard_rejected_fee_claim_identity();
revoke all on function internal_academic.guard_rejected_fee_claim_identity() from public,anon,authenticated,service_role;

DO $patch$
declare body text; marker text;
begin
 body:=pg_get_functiondef('public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'::regprocedure);
 if md5(body)<>'2a8b9e9740a9b9d9fa6d972d136aa6f5' then raise exception 'REJECTED_FEE_AUTHORIZATION_HASH_DRIFT'; end if;
 marker:='  select authz.receivable_id into v_request_owner';
 if (length(body)-length(replace(body,marker,'')))/length(marker)<>1 or strpos(body,'public.gestor_has_financeiro_tab(''receber'')')=0
  or strpos(body,'perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);')=0 then
  raise exception 'REJECTED_FEE_AUTHORIZATION_ROUTE_DRIFT'; end if;
 execute replace(body,marker,'  perform internal_academic.consent_rejected_fee_correction(v_receivable,p_request_id);'||chr(10)||chr(10)||marker);
end $patch$;
revoke all on function internal_academic.consent_rejected_fee_correction(public.contas_receber,uuid),
 internal_academic.guard_rejected_fee_authorization(),public.resolve_rejected_fee_request_service(uuid,uuid),public.rejected_fee_bank_policy_service(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.resolve_rejected_fee_request_service(uuid,uuid),public.rejected_fee_bank_policy_service(uuid,uuid) to service_role;
commit;
