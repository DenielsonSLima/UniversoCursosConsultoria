-- Scoped Proesc import extension, rebased against the verified remote contract.
begin;

create function public.proesc_import_original_obligation_service(
  p_actor_id uuid,p_request_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_replay jsonb;
  v_enrollment public.matriculas%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_import internal_proesc.obligation_imports%rowtype;
  v_before jsonb;
  v_expected jsonb;
  v_id uuid;
  v_account uuid;
  v_due date;
  v_amount numeric;
  v_ordinal integer;
  v_kind text := p_payload->>'obligationKind';
  v_cycle text := p_payload->>'sourceCycle';
  v_origin text;
  v_status text;
  v_type text;
  v_description text;
  v_new boolean := nullif(p_payload->>'existingReceivableId','') is null;
begin
  v_replay:=internal_proesc.begin_financial_request('IMPORT_ORIGINAL',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce((p_payload->>'sourceFingerprint' ~ '^[0-9a-f]{64}$'
    and p_payload->>'expectedEnrollmentBefore' ~ '^[0-9a-f]{64}$'
    and p_payload->'source'->>'personHash' ~ '^[0-9a-f]{64}$'
    and p_payload->'source'->>'unitId' ~ '^[1-9][0-9]*$'
    and p_payload->'source'->>'classId' ~ '^[1-9][0-9]*$'
    and p_payload->'source'->>'key' ~ '^[1-9][0-9]*$'
    and p_payload->>'principalCents' ~ '^[1-9][0-9]*$'
    and p_payload->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and p_payload->'sourceCancelled'='false'::jsonb
    and v_kind in ('TUITION','REENROLLMENT_FEE','OTHER_CONFIRMED','UNRESOLVED')
    and v_cycle in ('FIRST','SECOND','FULL_CONTRACT','UNRESOLVED')),false)
    or (p_payload ? 'ordinal' and p_payload->'ordinal'<>'null'::jsonb
      and not coalesce(p_payload->>'ordinal' ~ '^[1-9][0-9]{0,3}$',false))
    or (not v_new and not coalesce(p_payload->>'expectedBefore' ~ '^[0-9a-f]{64}$',false)) then
    raise exception 'Importação exige identidade, principal e intenção conferidos.' using errcode='22023'; end if;
  v_due:=(p_payload->>'dueDate')::date;
  v_amount:=(p_payload->>'principalCents')::numeric/100;
  v_ordinal:=(p_payload->>'ordinal')::integer;
  if not isfinite(v_due) or v_due not between date '1900-01-01' and date '2200-12-31'
    or v_amount>999999999999.99 or v_ordinal>1000
    or (v_kind<>'TUITION' and v_ordinal is not null) then
    raise exception 'Data, principal ou posição da obrigação inválidos.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('proesc:obligation:' ||
    jsonb_build_object('unitId',p_payload->'source'->>'unitId','classId',p_payload->'source'->>'classId',
      'key',p_payload->'source'->>'key')::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || (p_payload->>'matriculaId')::uuid::text,0));
  select * into strict v_enrollment from public.matriculas where id=(p_payload->>'matriculaId')::uuid;
  perform 1 from public.turmas where id=v_enrollment.turma_id for update;
  select * into strict v_enrollment from public.matriculas where id=v_enrollment.id for update;
  v_scope:=internal_proesc.assert_confirmed_class_scope(v_enrollment.turma_id,
    p_payload->'source'->>'unitId',p_payload->'source'->>'classId');
  perform 1 from internal_proesc.class_scopes where id=v_scope.id for update;
  v_scope:=internal_proesc.assert_confirmed_class_scope(v_enrollment.turma_id,
    p_payload->'source'->>'unitId',p_payload->'source'->>'classId');
  perform 1 from public.parceiros where id=v_enrollment.aluno_id for share;
  perform 1 from internal_proesc.enrollment_sources where matricula_id=v_enrollment.id for update;
  if internal_proesc.enrollment_import_fingerprint(v_enrollment.id)
      is distinct from p_payload->>'expectedEnrollmentBefore'
    or internal_proesc.person_document_hash(v_enrollment.aluno_id)
      is distinct from p_payload->'source'->>'personHash'
    or (v_scope.batch_id is not null and not exists (
      select 1 from internal_proesc.enrollment_sources e where e.matricula_id=v_enrollment.id
        and e.scope_id=v_scope.id and e.source_person_key=p_payload->'source'->>'personHash')) then
    raise exception 'Matrícula, CPF ou escopo mudou após a conferência.' using errcode='40001'; end if;
  -- Source classification belongs to the individual contract, never the class number.
  -- UNKNOWN is imported as an observation; it cannot authorize a local cycle.
  -- Source SECOND/UNRESOLVED is retained. It does not prove complete external
  -- cycle coverage and must keep new local issuance blocked pending review.
  v_origin:='PROESC-V1:' || v_scope.source_unit_id || ':' || (p_payload->'source'->>'key');
  select * into v_link from internal_proesc.obligation_links
    where source_unit_id=v_scope.source_unit_id and source_class_id=v_scope.source_class_id
      and source_key=p_payload->'source'->>'key' for update;
  if found and (v_new or v_link.receivable_id is distinct from (p_payload->>'existingReceivableId')::uuid) then
    raise exception 'Identidade externa já vinculada; reutilize o recebível conferido.' using errcode='40001'; end if;
  if exists (select 1 from internal_academic.technical_external_cycle_evidence e
    where e.source_unit_id=v_scope.source_unit_id and e.source_class_id=v_scope.source_class_id
      and e.source_key=p_payload->'source'->>'key'
      and (v_new or e.receivable_id is distinct from (p_payload->>'existingReceivableId')::uuid)) then
    raise exception 'Obrigação já pertence à cobertura externa; não duplicar.' using errcode='40001'; end if;
  v_account:=internal_proesc.shared_account(v_scope.polo_id);
  v_type:=case when v_kind='REENROLLMENT_FEE' then 'REMATRICULA' else 'PARCELA' end;
  v_description:=case v_kind when 'TUITION' then 'Mensalidade - Histórico Proesc'
    when 'REENROLLMENT_FEE' then 'Rematrícula - Histórico Proesc'
    when 'UNRESOLVED' then 'Obrigação - Histórico Proesc (classificação pendente)'
    else 'Obrigação conferida - Histórico Proesc' end;
  if v_new then
    if exists (select 1 from public.contas_receber c where c.matricula_id=v_enrollment.id
      and (c.origem_cronograma_id=v_origin
        or (c.valor=v_amount and c.data_vencimento=v_due and not exists (
          select 1 from internal_proesc.obligation_links known where known.receivable_id=c.id
            and known.source_unit_id=v_scope.source_unit_id and known.source_class_id=v_scope.source_class_id
            and known.source_key<>p_payload->'source'->>'key')))) then
      raise exception 'Há candidato local para esta obrigação; conferir vínculo antes de incluir.' using errcode='40001'; end if;
    v_id:=gen_random_uuid();
    v_status:='PENDENTE'; -- Operational holding state; source OPEN/overdue is not inferred.
    v_expected:=jsonb_build_object('id',v_id,'matricula_id',v_enrollment.id,'turma_id',v_enrollment.turma_id,
      'cliente_id',v_enrollment.aluno_id,'polo_id',v_scope.polo_id,'valor',v_amount,'data_vencimento',v_due,
      'descricao',v_description,'status',v_status,'valor_pago',0,'data_pagamento',null,
      'conta_bancaria_id',v_account,'origem_pagamento','SISTEMA_ANTERIOR','origem_cronograma_id',v_origin,
      'tipo_lancamento',v_type,'parcela_numero',v_ordinal);
    insert into internal_proesc.mutation_claims(request_id,transaction_id,receivable_id,kind,expected_new)
      values(p_request_id,txid_current(),v_id,'IMPORT_ORIGINAL',v_expected);
    insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,valor,data_vencimento,
      descricao,status,valor_pago,data_pagamento,conta_bancaria_id,origem_pagamento,origem_cronograma_id,
      tipo_lancamento,parcela_numero,categoria)
    values(v_id,v_enrollment.id,v_enrollment.turma_id,v_enrollment.aluno_id,v_scope.polo_id,v_amount,v_due,
      v_description,v_status,0,null,v_account,'SISTEMA_ANTERIOR',v_origin,v_type,v_ordinal,
      case when v_kind='TUITION' then 'MENSALIDADE' else 'OUTROS_CREDITOS' end)
    returning * into v_receivable;
    if not to_jsonb(v_receivable) @> v_expected then
      raise exception 'O principal importado divergiu da intenção.' using errcode='40001'; end if;
  else
    select * into strict v_receivable from public.contas_receber
      where id=(p_payload->>'existingReceivableId')::uuid for update;
    v_before:=to_jsonb(v_receivable);
    if internal_proesc.receivable_fingerprint(v_receivable) is distinct from p_payload->>'expectedBefore'
      or v_receivable.matricula_id is distinct from v_enrollment.id
      or v_receivable.cliente_id is distinct from v_enrollment.aluno_id
      or v_receivable.turma_id is distinct from v_scope.turma_id
      or v_receivable.polo_id is distinct from v_scope.polo_id
      or v_receivable.valor is distinct from v_amount or v_receivable.data_vencimento is distinct from v_due then
      raise exception 'Recebível existente divergiu da fonte conferida.' using errcode='40001'; end if;
    if v_receivable.conta_bancaria_id is distinct from v_account then
      update public.contas_receber set conta_bancaria_id=v_account,updated_at=now()
        where id=v_receivable.id returning * into v_receivable;
    end if;
  end if;
  perform internal_proesc.assert_historical_receivable(v_receivable);
  select * into v_link from internal_proesc.obligation_links where receivable_id=v_receivable.id for update;
  if found then
    if v_link.source_unit_id<>v_scope.source_unit_id or v_link.source_class_id<>v_scope.source_class_id
      or v_link.source_key<>p_payload->'source'->>'key' or v_link.kind<>'ORIGINAL' then
      raise exception 'Vínculo existente não pode mudar de identidade.' using errcode='40001'; end if;
  else
    insert into internal_proesc.obligation_links(matricula_id,turma_id,receivable_id,
      source_unit_id,source_class_id,source_key,kind,auto_enabled,confirmed_by)
    values(v_enrollment.id,v_scope.turma_id,v_receivable.id,v_scope.source_unit_id,v_scope.source_class_id,
      p_payload->'source'->>'key','ORIGINAL',false,p_actor_id) returning * into v_link;
  end if;
  select * into v_import from internal_proesc.obligation_imports where link_id=v_link.id;
  if found then
    if (v_import.scope_id,v_import.source_person_hash,v_import.source_cycle,v_import.obligation_kind,v_import.source_ordinal)
      is distinct from (v_scope.id,p_payload->'source'->>'personHash',v_cycle,v_kind,v_ordinal) then
      raise exception 'Classificação de origem já registrada; exige revisão auditada.' using errcode='40001'; end if;
  else
    insert into internal_proesc.obligation_imports(link_id,request_id,scope_id,source_person_hash,
      source_fingerprint,source_cycle,obligation_kind,source_ordinal)
    values(v_link.id,p_request_id,v_scope.id,p_payload->'source'->>'personHash',
      p_payload->>'sourceFingerprint',v_cycle,v_kind,v_ordinal);
  end if;
  if v_scope.batch_id is not null then
    update internal_proesc.enrollment_sources set financial_review_state='REVIEW' where matricula_id=v_enrollment.id;
    update internal_proesc.obligation_links set auto_enabled=false where id=v_link.id;
  end if;
  update internal_proesc.mutation_claims set completed=true where request_id=p_request_id;
  insert into internal_proesc.reconciliation_events(request_id,link_id,mode,result,before_state,after_state)
  values(p_request_id,v_link.id,'IMPORT_ORIGINAL',case when v_new then 'IMPORTED' else 'LINKED' end,
    v_before,to_jsonb(v_receivable));
  return internal_proesc.finish_financial_request(p_request_id,jsonb_build_object(
    'result',case when v_new then 'IMPORTED' else 'LINKED' end,'linkId',v_link.id,
    'receivableId',v_receivable.id,'currentBefore',internal_proesc.receivable_fingerprint(v_receivable),
    'financialReview','REVIEW','paymentApplied',false));
end;
$$;
revoke all on function public.proesc_import_original_obligation_service(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.proesc_import_original_obligation_service(uuid,uuid,jsonb) to service_role;
commit;
