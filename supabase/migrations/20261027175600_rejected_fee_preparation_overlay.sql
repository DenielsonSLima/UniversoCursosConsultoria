begin;
set local lock_timeout='5s';
create function internal_academic.rejected_fee_reset_transition_valid(old_r public.contas_receber,new_r public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype;
 allowed text[]:=array['data_vencimento','gateway_financial_terms','gateway_creation_token','gateway_status',
 'gateway_submission_channel','gateway_submission_status','gateway_last_error','updated_at'];
begin
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=old_r.id;
 return coalesce(found and o.state='PREPARING' and o.preparation_xid=txid_current()
  and current_setting('app.rejected_fee_correction_id',true)=o.id::text
  and o.absence_confirmed_at>clock_timestamp()-interval '5 minutes'
  and o.absence_hash=internal_academic.rejected_fee_sha256(o.absence_evidence::text)
  and to_jsonb(old_r)=o.source_receivable and new_r.data_vencimento=o.corrected_due_date
  and new_r.gateway_financial_terms=o.corrected_terms
  and new_r.gateway_creation_token is null and new_r.gateway_status is null
  and new_r.gateway_submission_channel is null and new_r.gateway_submission_status is null
  and new_r.gateway_last_error is null and new_r.updated_at>=old_r.updated_at
  and (to_jsonb(new_r)-allowed)=(to_jsonb(old_r)-allowed),false);
end $$;

create function internal_academic.prepare_rejected_fee_correction(p_operation_id uuid,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; r public.contas_receber%rowtype;
 run internal_academic.technical_manual_cycle_runs%rowtype;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'REJECTED_FEE_PREPARE_ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_operation_id for update;
 if o.manifest_hash is distinct from p_manifest_hash then raise exception 'REJECTED_FEE_MANIFEST_CHANGED' using errcode='PT409'; end if;
 if o.state in ('PREPARED','CONSENTED') then
  select * into strict r from public.contas_receber where id=o.receivable_id;
  if not internal_academic.rejected_fee_corrected_valid(r) then raise exception 'REJECTED_FEE_PREPARED_DRIFT' using errcode='PT409'; end if;
  return jsonb_build_object('prepared',true,'replayed',true,'issued',false,'operationId',o.id,'dueDate',o.corrected_due_date);
 end if;
 o:=internal_academic.assert_rejected_fee_source(p_operation_id,p_manifest_hash);
 if o.state<>'ABSENCE_CONFIRMED' or o.corrected_due_date<timezone('America/Maceio',now())::date or o.absence_confirmed_at is null
  or o.absence_confirmed_at<=clock_timestamp()-interval '5 minutes'
  or (o.absence_evidence->>'checkedAt')::timestamptz<=clock_timestamp()-interval '5 minutes'
  or o.absence_hash is distinct from internal_academic.rejected_fee_sha256(o.absence_evidence::text)
  or o.lease_until is not null then raise exception 'REJECTED_FEE_FRESH_ABSENCE_REQUIRED' using errcode='PT409'; end if;
 perform set_config('app.rejected_fee_correction_id',o.id::text,true);
 update internal_academic.technical_rejected_fee_corrections set state='PREPARING',preparation_xid=txid_current() where id=o.id;
 update public.contas_receber set data_vencimento=o.corrected_due_date,gateway_financial_terms=o.corrected_terms,
  gateway_creation_token=null,gateway_status=null,gateway_submission_channel=null,gateway_submission_status=null,
  gateway_last_error=null,updated_at=clock_timestamp() where id=o.receivable_id returning * into r;
 if not internal_academic.rejected_fee_corrected_valid(r)
  or internal_academic.technical_manual_banese_expected_terms(r) is distinct from o.corrected_terms then
  raise exception 'REJECTED_FEE_CORRECTED_TERMS_INVALID' using errcode='23514'; end if;
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=o.matricula_id and cycle_number=2;
 if to_jsonb(run) is distinct from o.source_run
  or internal_academic.rejected_fee_siblings_hash(run,o.receivable_id) is distinct from o.siblings_hash then
  raise exception 'REJECTED_FEE_UNRELATED_ITEMS_CHANGED' using errcode='23514'; end if;
 update internal_academic.technical_rejected_fee_corrections set state='PREPARED',prepared_at=clock_timestamp() where id=o.id;
 perform public.registrar_turma_financeiro_auditoria(o.matricula_id,'TAXA_REJEITADA_VENCIMENTO_PREPARADO',
  jsonb_build_object('operationId',o.id,'receivableId',o.receivable_id,'manifestHash',o.manifest_hash,
   'oldDueDate',o.source_receivable->>'data_vencimento','dueDate',o.corrected_due_date,
   'absenceHash',o.absence_hash,'originalAuthorizationArchived',true,'issued',false,'requiresManagerConsent',true),
  'Apenas a taxa rejeitada foi preparada; histórico e mensalidades preservados. Nenhuma emissão automática.');
 return jsonb_build_object('prepared',true,'replayed',false,'issued',false,'operationId',o.id,'dueDate',o.corrected_due_date);
end $$;

DO $patch$
declare sig text; body text; old_text text; new_text text; expected text;
begin
 foreach sig in array array['internal_academic.guard_manual_cycle_reviewed_identity()',
 'public.enforce_receivable_gateway_submission_fence()'] loop
  body:=pg_get_functiondef(sig::regprocedure);
  expected:=case sig when 'internal_academic.guard_manual_cycle_reviewed_identity()' then '28a05a60a41eabab99333e5f9e386dee' else '4a1900137cc963991b9151859dd46d6a' end;
  if md5(body)<>expected then raise exception 'REJECTED_FEE_GUARD_HASH_DRIFT %',sig; end if;
  old_text:='if internal_financial_correction.reset_transition_valid(old,new) then return new; end if;';
  if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'REJECTED_FEE_GUARD_DRIFT %',sig; end if;
  new_text:='if internal_academic.rejected_fee_reset_transition_valid(old,new) then return new; end if;'||chr(10)||'  '||old_text;
  execute replace(body,old_text,new_text);
 end loop;
 sig:='internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)';
 body:=pg_get_functiondef(sig::regprocedure);
 if md5(body)<>'afc178a7871d3fe8a0ef52833bffac59' then raise exception 'REJECTED_FEE_REVIEW_HASH_DRIFT'; end if;
 old_text:='if internal_financial_correction.corrected_receivable_valid(p_receivable) then return; end if;';
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'REJECTED_FEE_REVIEW_GUARD_DRIFT'; end if;
 execute replace(body,old_text,'if internal_academic.rejected_fee_corrected_valid(p_receivable) then return; end if;'||chr(10)||'  '||old_text);
 sig:='internal_academic.manual_cycle_legacy_creation_proven(internal_academic.technical_manual_cycle_runs)';
 body:=pg_get_functiondef(sig::regprocedure);
 if md5(body)<>'d20e6584842a875797ac474cac5e2607' then raise exception 'REJECTED_FEE_LEGACY_HASH_DRIFT'; end if;
 old_text:='(i->>''vencimento'')::date=c.data_vencimento';
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>2 then raise exception 'REJECTED_FEE_LEGACY_PROOF_DRIFT'; end if;
 execute replace(body,old_text,'(i->>''vencimento'')::date=internal_academic.rejected_fee_original_due(c)');
end $patch$;
revoke all on function internal_academic.rejected_fee_reset_transition_valid(public.contas_receber,public.contas_receber),
 internal_academic.prepare_rejected_fee_correction(uuid,text) from public,anon,authenticated,service_role;
commit;
