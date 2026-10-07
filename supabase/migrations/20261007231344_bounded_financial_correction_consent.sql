-- New, explicit real-user consent. No worker or generic old replay may rotate it.
begin;
create function public.consent_bounded_financial_correction_secure(
 p_operation_id uuid,p_matricula_id uuid,p_request_id uuid,p_expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype; i internal_financial_correction.items%rowtype;
 r public.contas_receber%rowtype; a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
 current_preview jsonb; fresh_request uuid; stamp timestamptz; actual_fingerprint text;
begin
 -- This authenticated read checks actor, permission, polo, academic/protection and
 -- operation scope before any idempotency lookup or disclosure.
 current_preview:=public.preview_bounded_financial_correction_secure(p_operation_id,p_matricula_id);
 if p_request_id is null or p_expected_fingerprint is null
 or current_preview->>'fingerprint' is distinct from p_expected_fingerprint then raise exception 'BOUNDED_STALE_CONSENT_PREVIEW'; end if;
 o:=internal_financial_correction.assert_operation(p_operation_id);
 if o.state<>'FINALIZED' then raise exception 'BOUNDED_INTERNAL_STAGE_PENDING'; end if;
 perform 1 from internal_academic.technical_manual_cycle_runs run where exists(select 1 from internal_financial_correction.items x
 where x.operation_id=o.id and x.matricula_id=run.matricula_id and x.cycle_number=run.cycle_number)
 order by run.matricula_id,run.cycle_number for update;
 perform 1 from internal_financial_correction.items where operation_id=o.id order by receivable_id for update;
 perform 1 from public.contas_receber source_r where exists(select 1 from internal_financial_correction.items x
 where x.operation_id=o.id and x.receivable_id=source_r.id) order by source_r.id for update;
 perform 1 from internal_academic.technical_manual_receivable_issuance_authorizations source_a where exists(
 select 1 from internal_financial_correction.items x where x.operation_id=o.id and x.receivable_id=source_a.receivable_id)
 order by source_a.receivable_id for update;
 perform internal_financial_correction.assert_finalized_operation(o.id);
 if exists(select 1 from internal_financial_correction.items where consent_batch_id=p_request_id
  and (operation_id<>o.id or matricula_id<>p_matricula_id)) then raise exception 'BOUNDED_CONSENT_REQUEST_REUSED'; end if;
 if exists(select 1 from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id
  and kind='RESET_C1' and consent_at is not null) then
  if (select count(*) from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id
   and kind='RESET_C1' and consent_batch_id=p_request_id and consent_actor_id=auth.uid()
   and consent_at is not null and internal_financial_correction.live_consent(receivable_id))<>12
  then raise exception 'BOUNDED_CONSENT_REPLAY_CONFLICT' using errcode='PT409'; end if;
  return jsonb_build_object('consented',true,'replayed',true,'requestId',p_request_id);
 end if;
 if current_preview->>'status'<>'WAITING_CONSENT' then raise exception 'BOUNDED_CONSENT_NOT_READY'; end if;
 stamp:=clock_timestamp();
 for i in select * from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id
  and kind='RESET_C1' order by receivable_id loop
  select * into strict r from public.contas_receber where id=i.receivable_id;
  select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id;
  if internal_financial_correction.has_payment_evidence(r) or r.status not in ('PENDENTE','VENCIDO')
   or r.gateway_creation_token is not null or r.gateway_submission_status is not null
   or r.gateway_payment_id is not null or to_jsonb(a) is distinct from i.authorization_snapshot
   or not internal_financial_correction.corrected_receivable_valid(r)
   or r.gateway_financial_terms is distinct from i.corrected_terms then raise exception 'BOUNDED_CONSENT_SOURCE_CHANGED'; end if;
  fresh_request:=gen_random_uuid();
  actual_fingerprint:=internal_academic.technical_manual_receivable_issuance_fingerprint(r);
  update internal_financial_correction.items set consent_batch_id=p_request_id,consent_request_id=fresh_request,
   consent_actor_id=auth.uid(),consent_at=stamp,consent_fingerprint=actual_fingerprint
  where operation_id=o.id and receivable_id=r.id;
  -- Original full authorization/claim history is immutable in item snapshot and
  -- included in the audit before this intentional rotation of the active consent.
  perform public.registrar_turma_financeiro_auditoria(r.matricula_id,'T46_BOUNDED_EXPLICIT_NEW_CONSENT',
   jsonb_build_object('operationId',o.id,'receivableId',r.id,'consentBatchId',p_request_id,
   'consentRequestId',fresh_request,'actorId',auth.uid(),'correctedPreviewFingerprint',p_expected_fingerprint,
   'priorAuthorization',to_jsonb(a),'correctedDueDate',i.corrected_due_date,'correctedTerms',i.corrected_terms),
   'Consentimento explícito do usuário atual para reemitir a obrigação existente com termos revisados.');
  update internal_academic.technical_manual_receivable_issuance_authorizations
  set request_id=fresh_request,receivable_fingerprint=actual_fingerprint,authorized_by=auth.uid(),
   authorized_at=stamp,first_claimed_at=null,last_claimed_at=null,claim_count=0 where receivable_id=r.id;
 end loop;
 if (select count(*) from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id
  and kind='RESET_C1' and consent_batch_id=p_request_id and internal_financial_correction.live_consent(receivable_id))<>12
 then raise exception 'BOUNDED_CONSENT_INCOMPLETE'; end if;
 return jsonb_build_object('consented',true,'replayed',false,'requestId',p_request_id);
end $$;
revoke all on function public.consent_bounded_financial_correction_secure(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
