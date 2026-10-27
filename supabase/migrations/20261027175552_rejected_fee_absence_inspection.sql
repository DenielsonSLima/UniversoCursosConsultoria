begin;
set local lock_timeout='5s';
create function internal_academic.assert_rejected_fee_source(p_id uuid,p_hash text)
returns internal_academic.technical_rejected_fee_corrections
language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype;
 r public.contas_receber%rowtype; run internal_academic.technical_manual_cycle_runs%rowtype;
 a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
begin
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_id for update;
 if o.manifest_hash is distinct from p_hash then raise exception 'REJECTED_FEE_MANIFEST_CHANGED' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('technical-manual-banese:'||o.receivable_id::text,0));
 select * into strict run from internal_academic.technical_manual_cycle_runs
  where matricula_id=o.matricula_id and cycle_number=2 for update;
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 select * into strict r from public.contas_receber where id=o.receivable_id;
 select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id for update;
 if to_jsonb(r) is distinct from o.source_receivable or to_jsonb(run) is distinct from o.source_run
  or to_jsonb(a) is distinct from o.source_authorization
  or internal_academic.rejected_fee_siblings_hash(run,r.id) is distinct from o.siblings_hash
  or not internal_academic.rejected_fee_source_safe(r) then
  raise exception 'REJECTED_FEE_SOURCE_CHANGED_OR_UNSAFE' using errcode='PT409';
 end if;
 return o;
end $$;

create function internal_academic.approve_rejected_fee_correction(
 p_id uuid,p_receivable_id uuid,p_expected_source_hash text,p_expected_run_hash text,
 p_corrected_due_date date,p_approval_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contas_receber%rowtype; run internal_academic.technical_manual_cycle_runs%rowtype;
 a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
 o internal_academic.technical_rejected_fee_corrections%rowtype; terms jsonb; manifest jsonb; key text;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_APPROVAL_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_id is null or p_receivable_id is null or length(coalesce(p_approval_reference,''))<8
  or p_expected_source_hash !~ '^[a-f0-9]{64}$' or p_expected_run_hash !~ '^[a-f0-9]{64}$'
  or p_corrected_due_date is distinct from date '2026-10-30'
  or p_corrected_due_date<(timezone('America/Maceio',now()))::date then
  raise exception 'REJECTED_FEE_APPROVAL_SCOPE' using errcode='22023';
 end if;
 select * into o from internal_academic.technical_rejected_fee_corrections where id=p_id;
 if found then
  if o.receivable_id is distinct from p_receivable_id or o.corrected_due_date is distinct from p_corrected_due_date
   or o.approval_reference is distinct from p_approval_reference
   or internal_academic.rejected_fee_sha256(o.source_receivable::text) is distinct from p_expected_source_hash
   or internal_academic.rejected_fee_sha256(o.source_run::text) is distinct from p_expected_run_hash then
   raise exception 'REJECTED_FEE_APPROVAL_REPLAY_CONFLICT' using errcode='PT409'; end if;
  return jsonb_build_object('operationId',o.id,'manifestHash',o.manifest_hash,'replayed',true,'state',o.state);
 end if;
 select * into strict r from public.contas_receber where id=p_receivable_id;
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=r.matricula_id and cycle_number=2 for update;
 perform pg_advisory_xact_lock(hashtextextended('technical-manual-banese:'||p_receivable_id::text,0));
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 select * into strict r from public.contas_receber where id=p_receivable_id;
 select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id for update;
 if internal_academic.rejected_fee_sha256(to_jsonb(r)::text) is distinct from p_expected_source_hash
  or internal_academic.rejected_fee_sha256(to_jsonb(run)::text) is distinct from p_expected_run_hash
  or r.data_vencimento is distinct from date '2026-10-18'
  or not internal_academic.rejected_fee_source_safe(r) then
  raise exception 'REJECTED_FEE_APPROVAL_SOURCE_CHANGED' using errcode='PT409'; end if;
 terms:=jsonb_set(internal_academic.technical_manual_banese_expected_terms(r),'{dueDate}',to_jsonb(p_corrected_due_date::text));
 if terms->'discount'<>'null'::jsonb then terms:=jsonb_set(terms,'{discount,validUntil}',to_jsonb(p_corrected_due_date::text)); end if;
 foreach key in array array['penalty','interest'] loop
  if terms->key<>'null'::jsonb then terms:=jsonb_set(terms,array[key,'startsOn'],to_jsonb((p_corrected_due_date+1)::text)); end if;
 end loop;
 manifest:=jsonb_build_object('version',1,'operationId',p_id,'receivable',to_jsonb(r),
  'authorization',to_jsonb(a),'run',to_jsonb(run),'siblingsHash',internal_academic.rejected_fee_siblings_hash(run,r.id),
  'dueDate',p_corrected_due_date,'terms',terms,'approvalReference',p_approval_reference);
 perform set_config('app.rejected_fee_correction_id',p_id::text,true);
 insert into internal_academic.technical_rejected_fee_corrections(id,receivable_id,matricula_id,cycle_number,
  cycle_request_id,corrected_due_date,source_receivable,source_authorization,source_run,siblings_hash,
  source_fingerprint,corrected_terms,manifest_hash,approval_reference,approved_database_role,new_request_id)
 values(p_id,r.id,r.matricula_id,2,run.request_id,p_corrected_due_date,to_jsonb(r),to_jsonb(a),to_jsonb(run),
  internal_academic.rejected_fee_siblings_hash(run,r.id),internal_academic.technical_manual_receivable_issuance_fingerprint(r),
  terms,internal_academic.rejected_fee_sha256(manifest::text),p_approval_reference,session_user,gen_random_uuid()) returning * into o;
 perform public.registrar_turma_financeiro_auditoria(r.matricula_id,'TAXA_REJEITADA_CORRECAO_APROVADA',
  jsonb_build_object('operationId',o.id,'receivableId',r.id,'manifestHash',o.manifest_hash,
   'approvalReference',p_approval_reference,'executionActorKind','SERVICE_MAINTENANCE','databaseSessionUser',session_user,
   'oldDueDate',r.data_vencimento,'correctedDueDate',p_corrected_due_date,'issued',false),
  'Aprovação específica; depende de consulta oficial de ausência e novo consentimento do gestor para emissão.');
 return jsonb_build_object('operationId',o.id,'manifestHash',o.manifest_hash,'replayed',false,'state',o.state);
end $$;

create function public.claim_rejected_fee_absence_service(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; lease uuid:=gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
  raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 o:=internal_academic.assert_rejected_fee_source(p_operation_id,p_manifest_hash);
 if o.state not in ('APPROVED','ABSENCE_CONFIRMED') or o.lease_until>clock_timestamp() then
  raise exception 'REJECTED_FEE_INSPECTION_BUSY' using errcode='PT409'; end if;
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set lease_token=lease,
  lease_until=clock_timestamp()+interval '60 seconds' where id=o.id;
 return jsonb_build_object('operationId',o.id,'manifestHash',o.manifest_hash,'receivableId',o.receivable_id,
  'leaseToken',lease,'environment','production','convenio',o.source_receivable->>'gateway_boleto_convenio',
  'nossoNumero',o.source_receivable->>'gateway_boleto_nosso_numero');
end $$;

create function public.confirm_rejected_fee_absence_service(
 p_operation_id uuid,p_manifest_hash text,p_lease_token uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; stamp timestamptz;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
  raise exception 'REJECTED_FEE_SERVICE_REQUIRED' using errcode='42501'; end if;
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_operation_id for update;
 if o.manifest_hash=p_manifest_hash and o.lease_token=p_lease_token and o.absence_evidence=p_evidence
  and o.absence_hash=internal_academic.rejected_fee_sha256(p_evidence::text)
  and o.state in ('ABSENCE_CONFIRMED','PREPARED','CONSENTED') then
  return jsonb_build_object('confirmed',true,'replayed',true,'operationId',o.id,'financiallyChanged',false,'issued',false);
 end if;
 o:=internal_academic.assert_rejected_fee_source(p_operation_id,p_manifest_hash);
 stamp:=(p_evidence->>'checkedAt')::timestamptz;
 if o.state not in ('APPROVED','ABSENCE_CONFIRMED') or o.lease_token is distinct from p_lease_token
  or o.lease_until<=clock_timestamp() or o.lease_until is null
  or p_evidence->>'environment' is distinct from 'production'
  or p_evidence->>'convenio' is distinct from o.source_receivable->>'gateway_boleto_convenio'
  or p_evidence->>'nossoNumero' is distinct from o.source_receivable->>'gateway_boleto_nosso_numero'
  or p_evidence->'httpStatus' is distinct from '404'::jsonb
  or p_evidence->>'errorCode' is distinct from 'ERRO_BOLETO_NAO_ENCONTRADO'
  or p_evidence->>'method' is distinct from 'GET' or p_evidence->>'operation' is distinct from 'EXACT_RESERVED_TITLE_ABSENCE'
  or p_evidence->>'responseHash' !~ '^[a-f0-9]{64}$' or p_evidence->>'responseHash' is null
  or stamp is null or stamp<clock_timestamp()-interval '60 seconds' or stamp>clock_timestamp()+interval '5 seconds' then
  raise exception 'REJECTED_FEE_ABSENCE_PROOF_INVALID' using errcode='PT409'; end if;
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set state='ABSENCE_CONFIRMED',
  absence_evidence=p_evidence,absence_hash=internal_academic.rejected_fee_sha256(p_evidence::text),
  absence_confirmed_at=clock_timestamp(),lease_until=null where id=o.id;
 return jsonb_build_object('confirmed',true,'operationId',o.id,'financiallyChanged',false,'issued',false);
end $$;

create function internal_academic.dispatch_rejected_fee_absence(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; secret text; request_id bigint;
begin
 o:=internal_academic.assert_rejected_fee_source(p_operation_id,p_manifest_hash);
 if o.state not in ('APPROVED','ABSENCE_CONFIRMED') or o.lease_until>clock_timestamp()
  or o.last_dispatch_at>clock_timestamp()-interval '90 seconds' then
  raise exception 'REJECTED_FEE_DISPATCH_BUSY' using errcode='PT409'; end if;
 secret:=public.get_banese_reconciliation_worker_secret();
 if secret is null or length(secret)<32 then raise exception 'REJECTED_FEE_WORKER_AUTH_UNAVAILABLE'; end if;
 request_id:=net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/technical-manual-cycle-recovery-worker',
  body:=jsonb_build_object('action','inspect_rejected_fee_absence','operationId',o.id,'manifestHash',o.manifest_hash),
  params:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','X-Banese-Worker-Token',secret),timeout_milliseconds:=45000);
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set last_dispatch_at=clock_timestamp() where id=o.id;
 return jsonb_build_object('queued',true,'requestId',request_id,'bankMutationAllowed',false);
end $$;
revoke all on function internal_academic.assert_rejected_fee_source(uuid,text),
 internal_academic.approve_rejected_fee_correction(uuid,uuid,text,text,date,text),
 internal_academic.dispatch_rejected_fee_absence(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_rejected_fee_absence_service(uuid,text),
 public.confirm_rejected_fee_absence_service(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.claim_rejected_fee_absence_service(uuid,text),
 public.confirm_rejected_fee_absence_service(uuid,text,uuid,jsonb) to service_role;
commit;
