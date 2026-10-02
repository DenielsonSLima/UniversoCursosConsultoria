begin;

create function internal_proesc.archive_unconfirmed_receivables(p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $archive$
declare
  v_request internal_proesc.administrative_archive_requests;
  v_c public.contas_receber; v_l internal_proesc.obligation_links;
  v_s internal_proesc.financial_snapshots; v_target jsonb;
  v_count integer; v_deleted integer; v_response jsonb;
  v_matricula uuid:=(p_payload->>'matriculaId')::uuid;
  v_run uuid:=(p_payload->>'fullRunId')::uuid;
begin
  perform internal_proesc.require_archive_database_operator();
  perform pg_advisory_xact_lock(hashtextextended('proesc:administrative-archive:'||p_request_id::text,0));
  select * into v_request from internal_proesc.administrative_archive_requests where request_id=p_request_id;
  if found then
    if v_request.action<>'ARCHIVE' or v_request.payload is distinct from p_payload then
      raise exception 'Replay administrativo divergente.' using errcode='40001'; end if;
    if v_request.response is null then raise exception 'Operação administrativa incompleta.' using errcode='55000'; end if;
    return v_request.response;
  end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'targets') is distinct from 'array'
    or v_matricula is null or v_run is null then
    raise exception 'Manifesto administrativo inválido.' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_payload->'targets');
  if v_count not between 1 and 30 or v_count is distinct from (p_payload->>'expectedCount')::integer
    or v_count<>(select count(distinct t->>'receivableId') from jsonb_array_elements(p_payload->'targets') t)
    or length(coalesce(p_payload->>'approvalReference','')) not between 8 and 200
    or length(coalesce(p_payload->>'reason','')) not between 20 and 1000 then
    raise exception 'Quantidade, autorização ou motivo administrativo inválido.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||v_matricula::text,0));
  perform 1 from public.turmas where id=(select turma_id from public.matriculas where id=v_matricula) for update;
  perform 1 from public.matriculas where id=v_matricula for update;
  if not exists(select 1 from internal_proesc.v2_runs where id=v_run and mode='FULL' and status='COMPLETE') then
    raise exception 'Inventário V2 completo obrigatório.' using errcode='40001'; end if;
  insert into internal_proesc.administrative_archive_requests(request_id,action,payload,payload_hash,
    approval_reference,reason,executed_by,database_session,transaction_id)
  values(p_request_id,'ARCHIVE',p_payload,md5(p_payload::text),p_payload->>'approvalReference',
    p_payload->>'reason',current_user,session_user,txid_current());
  for v_target in select t from jsonb_array_elements(p_payload->'targets') t order by t->>'receivableId' loop
    select * into strict v_l from internal_proesc.obligation_links
      where id=(v_target->>'linkId')::uuid for update;
    select * into strict v_c from public.contas_receber where id=(v_target->>'receivableId')::uuid for update;
    select * into strict v_s from internal_proesc.financial_snapshots where link_id=v_l.id
      order by observed_at desc,recorded_at desc,id desc limit 1 for share;
    if md5(to_jsonb(v_c)::text) is distinct from v_target->>'receiptHash'
      or md5((to_jsonb(v_l)-'archived_receivable_id')::text) is distinct from v_target->>'linkHash'
      or md5(to_jsonb(v_s)::text) is distinct from v_target->>'snapshotHash'
      or v_s.id is distinct from (v_target->>'snapshotId')::uuid
      or v_l.receivable_id is distinct from v_c.id or v_l.archived_receivable_id is not null
      or v_l.matricula_id is distinct from v_matricula or v_c.matricula_id is distinct from v_matricula
      or v_l.kind is distinct from 'ORIGINAL' or v_l.parent_link_id is not null
      or exists(select 1 from internal_proesc.obligation_links where parent_link_id=v_l.id)
      or v_c.status is distinct from 'PENDENTE' or coalesce(v_c.valor_pago,0)<>0 or v_c.data_pagamento is not null
      or internal_proesc.reconciliation_source_system(v_c) is distinct from 'PROESC'
      or v_s.verification is distinct from 'REVIEW' or coalesce(v_s.source_status,'') not in ('UNKNOWN','CANCELED')
      or exists(select 1 from internal_proesc.financial_snapshots s where s.link_id=v_l.id
        and s.verification='VERIFIED' and s.source_status in ('OPEN','PAID')) then
      raise exception 'Registro ou evidência mudou; arquivamento bloqueado.' using errcode='40001'; end if;
    perform internal_proesc.assert_historical_receivable(v_c);
    perform internal_proesc.assert_archive_no_receivable_dependencies(v_c.id);
    if exists(select 1 from public.push_notification_jobs where source_type='financial'
      and source_id=v_c.id and status in ('pending','processing')) then
      raise exception 'Notificação financeira em andamento; arquivamento bloqueado.' using errcode='55000'; end if;
    if not exists(select 1 from internal_proesc.v2_enrollment_links pin
        where pin.matricula_id=v_matricula and pin.unit_id=v_l.source_unit_id
          and pin.source_class_id=v_l.source_class_id)
      or not exists(select 1 from internal_proesc.v2_tasks task where task.run_id=v_run
        and task.resource='invoices' and task.unit_id=v_l.source_unit_id and task.status='COMPLETE'
        and task.source_year=extract(year from v_c.data_vencimento)::integer
        and task.source_month=extract(month from v_c.data_vencimento)::integer
        and task.records_seen=task.expected_total and task.next_page>task.last_page)
      or exists(select 1 from internal_proesc.v2_invoice_observations o
        where o.unit_id=v_l.source_unit_id and o.invoice_id=v_l.source_key) then
      raise exception 'Correspondência ou cobertura V2 exige nova revisão.' using errcode='40001'; end if;
    insert into internal_proesc.administrative_receivable_archive(receivable_id,link_id,request_id,snapshot_id,
      receipt,original_link,receipt_hash,link_hash,snapshot_hash)
    values(v_c.id,v_l.id,p_request_id,v_s.id,to_jsonb(v_c),to_jsonb(v_l)-'archived_receivable_id',
      md5(to_jsonb(v_c)::text),md5((to_jsonb(v_l)-'archived_receivable_id')::text),md5(to_jsonb(v_s)::text));
    update internal_proesc.obligation_links set receivable_id=null,archived_receivable_id=v_c.id,auto_enabled=false
      where id=v_l.id;
    delete from public.contas_receber where id=v_c.id;
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'Exclusão administrativa incompleta.' using errcode='40001'; end if;
  end loop;
  v_response:=jsonb_build_object('result','ARCHIVED','count',v_count,'requestId',p_request_id,
    'financialSettlement',false,'providerCancellation',false,'recoverable',true);
  update internal_proesc.administrative_archive_requests set response=v_response where request_id=p_request_id;
  return v_response;
end;
$archive$;

-- Restoring is an explicit second maintenance request. The original JSON is
-- immutable; a same-transaction claim permits only that exact historical row.
create function internal_proesc.restore_archived_receivable(p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $restore$
declare
  v_request internal_proesc.administrative_archive_requests;
  v_a internal_proesc.administrative_receivable_archive;
  v_l internal_proesc.obligation_links; v_c public.contas_receber;
  v_response jsonb;
begin
  perform internal_proesc.require_archive_database_operator();
  perform pg_advisory_xact_lock(hashtextextended('proesc:administrative-archive:'||p_request_id::text,0));
  select * into v_request from internal_proesc.administrative_archive_requests where request_id=p_request_id;
  if found then
    if v_request.action<>'RESTORE' or v_request.payload is distinct from p_payload then
      raise exception 'Replay administrativo divergente.' using errcode='40001'; end if;
    if v_request.response is null then raise exception 'Operação administrativa incompleta.' using errcode='55000'; end if;
    return v_request.response;
  end if;
  if p_request_id is null or length(coalesce(p_payload->>'approvalReference','')) not between 8 and 200
    or length(coalesce(p_payload->>'reason','')) not between 20 and 1000 then
    raise exception 'Autorização e motivo da recuperação obrigatórios.' using errcode='22023'; end if;
  select * into strict v_a from internal_proesc.administrative_receivable_archive
    where receivable_id=(p_payload->>'receivableId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-enrollment:'||(v_a.receipt->>'matricula_id'),0));
  perform 1 from public.turmas where id=(v_a.receipt->>'turma_id')::uuid for update;
  perform 1 from public.matriculas where id=(v_a.receipt->>'matricula_id')::uuid for update;
  select * into strict v_l from internal_proesc.obligation_links where id=v_a.link_id for update;
  select * into strict v_a from internal_proesc.administrative_receivable_archive
    where receivable_id=v_a.receivable_id for update;
  if v_a.restored_by_request is not null or v_l.archived_receivable_id is distinct from v_a.receivable_id
    or v_l.receivable_id is not null or v_a.receipt_hash is distinct from p_payload->>'receiptHash'
    or (to_jsonb(v_l)-'receivable_id'-'archived_receivable_id'-'auto_enabled')
      is distinct from (v_a.original_link-'receivable_id'-'auto_enabled')
    or exists(select 1 from public.contas_receber where id=v_a.receivable_id)
    or exists(select 1 from internal_proesc.v2_invoice_observations
      where unit_id=v_l.source_unit_id and invoice_id=v_l.source_key)
    or (select md5(to_jsonb(s)::text) from internal_proesc.financial_snapshots s where s.link_id=v_l.id
      order by s.observed_at desc,s.recorded_at desc,s.id desc limit 1) is distinct from v_a.snapshot_hash then
    raise exception 'Arquivo ou nova evidência exige revisão antes da recuperação.' using errcode='40001'; end if;
  insert into internal_proesc.administrative_archive_requests(request_id,action,payload,payload_hash,
    approval_reference,reason,executed_by,database_session,transaction_id)
  values(p_request_id,'RESTORE',p_payload,md5(p_payload::text),p_payload->>'approvalReference',
    p_payload->>'reason',current_user,session_user,txid_current());
  insert into public.contas_receber select (jsonb_populate_record(null::public.contas_receber,v_a.receipt)).*
    returning * into v_c;
  if to_jsonb(v_c) is distinct from v_a.receipt then
    raise exception 'Recuperação alterou os fatos originais.' using errcode='40001'; end if;
  update internal_proesc.obligation_links set receivable_id=v_a.receivable_id,archived_receivable_id=null,
    auto_enabled=(v_a.original_link->>'auto_enabled')::boolean where id=v_a.link_id;
  update internal_proesc.administrative_receivable_archive set restored_by_request=p_request_id
    where receivable_id=v_a.receivable_id;
  v_response:=jsonb_build_object('result','RESTORED','receivableId',v_a.receivable_id,'requestId',p_request_id);
  update internal_proesc.administrative_archive_requests set response=v_response where request_id=p_request_id;
  return v_response;
end;
$restore$;

create function internal_proesc.is_exact_administrative_restore(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $claim$
  select exists(select 1 from internal_proesc.administrative_archive_requests request
    join internal_proesc.administrative_receivable_archive archive
      on archive.receivable_id=(request.payload->>'receivableId')::uuid
    join internal_proesc.obligation_links link on link.id=archive.link_id
    where request.action='RESTORE' and request.transaction_id=txid_current() and request.response is null
      and request.executed_by='postgres' and archive.restored_by_request is null
      and link.archived_receivable_id=archive.receivable_id and link.receivable_id is null
      and archive.receivable_id=p_receivable.id and archive.receipt=to_jsonb(p_receivable));
$claim$;
revoke all on function internal_proesc.is_exact_administrative_restore(public.contas_receber)
  from public,anon,authenticated,service_role;

do $patches$
declare v_definition text; v_old text; v_new text; v_meta jsonb; v_oid oid;
begin
  v_oid:='internal_proesc.v2_apply_invoice(uuid,uuid)'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  select to_jsonb(p)-'prosrc' into v_meta from pg_proc p where p.oid=v_oid;
  if md5(v_definition)<>'ac5b9ae49ba510f8d49cea60ffb11ebb' then
    raise exception 'V2 apply changed; rebase administrative archive guard.'; end if;
  v_old:='  SELECT * INTO STRICT v_receivable FROM public.contas_receber WHERE id=v_link.receivable_id FOR UPDATE;';
  v_new:=$guard$  IF v_link.archived_receivable_id IS NOT NULL THEN
    UPDATE internal_proesc.v2_invoice_observations SET link_id=v_link.id,result='REVIEW',
      reason='ADMINISTRATIVELY_ARCHIVED_OBLIGATION' WHERE id=p_observation_id;
    RETURN 'REVIEW';
  END IF;
$guard$||v_old;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
    raise exception 'V2 archive guard anchor changed.'; end if;
  execute replace(v_definition,v_old,v_new);
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid=v_oid)<>v_meta then
    raise exception 'V2 function privileges or metadata changed.'; end if;

  v_oid:='internal_academic.is_authorized_external_history_insert(public.contas_receber)'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  select to_jsonb(p)-'prosrc' into v_meta from pg_proc p where p.oid=v_oid;
  if md5(v_definition)<>'d179d20420f0d4ac57401015ca5002f2' then
    raise exception 'Historical insertion guard changed; rebase recovery claim.'; end if;
  v_old:='  select internal_academic.is_authorized_external_history_insert_before_original(p_receivable)';
  v_new:=v_old||E'\n    or internal_proesc.is_exact_administrative_restore(p_receivable)';
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
    raise exception 'Historical recovery claim anchor changed.'; end if;
  execute replace(v_definition,v_old,v_new);
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid=v_oid)<>v_meta then
    raise exception 'Historical function privileges or metadata changed.'; end if;

  -- Preserve the original technical snapshot, including its original timestamp.
  -- This exception cannot authorize imports, arbitrary inserts or updated rules.
  v_oid:='internal_academic.guard_technical_receivable_policy_snapshot()'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  select to_jsonb(p)-'prosrc' into v_meta from pg_proc p where p.oid=v_oid;
  if md5(v_definition)<>'5eecb96ad96e0d55a0adbce640bf70a1' then
    raise exception 'Technical snapshot trigger changed; rebase exact recovery.'; end if;
  v_old:=$anchor$  if tg_op = 'INSERT' then$anchor$;
  v_new:=v_old||E'\n    if internal_proesc.is_exact_administrative_restore(new) then return new; end if;';
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
    raise exception 'Technical recovery claim anchor changed.'; end if;
  execute replace(v_definition,v_old,v_new);
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid=v_oid)<>v_meta then
    raise exception 'Technical trigger privileges or metadata changed.'; end if;
end;
$patches$;
revoke all on function internal_proesc.archive_unconfirmed_receivables(uuid,jsonb),
  internal_proesc.restore_archived_receivable(uuid,jsonb) from public,anon,authenticated,service_role;
commit;
