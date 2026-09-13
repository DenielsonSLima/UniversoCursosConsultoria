-- Run through MCP inside BEGIN/ROLLBACK with the capability migration installed
-- in the same transaction. The caller supplies the real, privately held proof;
-- no personal information or invented source evidence belongs in this test file.
do $test$
declare
  v_operation jsonb:=current_setting('test.proesc_second_only_operation')::jsonb;
  v_payload jsonb:=v_operation->'payload';
  v_actor uuid:=(v_operation->>'actor_id')::uuid;
  v_request uuid:=(v_operation->>'request_id')::uuid;
  v_id uuid:=(v_payload->>'matriculaId')::uuid;
  v_bad jsonb; v_result jsonb; v_state jsonb; v_receipt jsonb;
  v_before text; v_after text; v_runs text; v_run_after text;
  v_academic text; v_links text; v_existing text; v_message text; v_receivable public.contas_receber%rowtype;
  v_case integer; v_rejected boolean;
begin
  assert current_setting('app.proesc_test_rollback',true)='on','Outer rollback required';
  assert v_payload#>>'{sourceEvidence,scope}'='SEGUNDO_CICLO','Explicit external second cycle required';
  assert not exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_id),
    'This rehearsal requires an unrecorded proof';
  select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) into v_before
    from public.contas_receber c;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.matricula_id,r.cycle_number)::text,'')) into v_runs
    from internal_academic.technical_manual_cycle_runs r;
  select md5(to_jsonb(m)::text) into v_academic from public.matriculas m where m.id=v_id;
  select md5(jsonb_agg(to_jsonb(l)||to_jsonb(i) order by l.id)::text) into v_links
    from internal_proesc.obligation_links l join internal_proesc.obligation_imports i on i.link_id=l.id
    where l.matricula_id=v_id;
  select md5(coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('projection',
    internal_academic.technical_manual_cycle_state(c.matricula_id)) order by c.matricula_id)::text,''))
    into v_existing from internal_academic.technical_external_cycle_coverage c where c.matricula_id<>v_id;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
  for v_case in 1..14 loop
    v_bad:=v_payload;
    case v_case
      when 1 then v_bad:=v_bad||'{"classification":"C1","hasExternalCycle2":false}';
      when 2 then v_bad:=v_bad||'{"hasExternalCycle2":false}';
      when 3 then v_bad:=v_bad||'{"evidenceKind":"SOURCE_CONTRACT"}';
      when 4 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,firstInstallmentCount}','1');
      when 5 then v_bad:=v_bad#-'{sourceEvidence,firstCycleReceipt}';
      when 6 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,firstCycleReceipt,paidCents}','1');
      when 7 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,obligations,0,cycle}','"FIRST"');
      when 8 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,obligations,0,principalCents}','20000');
      when 9 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,obligations,2,ordinal}','1');
      when 10 then v_bad:=jsonb_set(v_bad,'{sourceEvidence,sourceHash}',to_jsonb(repeat('0',64)));
      when 11 then v_bad:=v_bad||jsonb_build_object('expectedRevision',(v_payload->>'expectedRevision')::int+1);
      when 12 then v_bad:=v_bad||jsonb_build_object('expectedManifestHash',repeat('0',64));
      when 13 then v_bad:=v_bad#-'{sourceEvidence,scope}';
      when 14 then
        v_receipt:=(v_payload#>'{sourceEvidence,firstCycleReceipt}')||jsonb_build_object(
          'dueDate',v_payload#>>'{sourceEvidence,obligations,0,dueDate}');
        v_receipt:=v_receipt||jsonb_build_object('transcriptionHash',encode(extensions.digest(
          (v_receipt-'transcriptionHash')::text,'sha256'),'hex'));
        v_bad:=jsonb_set(v_bad,'{sourceEvidence,firstCycleReceipt}',v_receipt);
    end case;
    v_rejected:=false;
    begin
      perform public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,gen_random_uuid(),v_bad);
    exception when sqlstate '22023' or sqlstate '40001' then v_rejected:=true;
    end;
    assert v_rejected,format('Invalid second-cycle proof accepted: case %s',v_case);
  end loop;
  -- A source item previously classified FIRST cannot be relabelled SECOND.
  begin
    update internal_proesc.obligation_imports set source_cycle='FIRST'
      where link_id=(select id from internal_proesc.obligation_links where matricula_id=v_id order by source_key limit 1);
    v_bad:=v_payload||jsonb_build_object('expectedManifestHash',internal_proesc.enrollment_cycle_manifest_hash(v_id));
    begin
      perform public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,gen_random_uuid(),v_bad);
      raise exception 'First-cycle source overlap accepted' using errcode='P9001';
    exception when sqlstate '40001' then null;
    end;
    raise exception 'Rollback overlap fixture' using errcode='P9002';
  exception when sqlstate 'P9002' then null;
  end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_payload);
    raise exception 'Authenticated role bypassed the service authorization' using errcode='P9001';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
  v_result:=public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_payload);
  assert v_result->>'classification'='FULL' and v_result->>'verification'='CONFIRMED'
    and v_result->'currentlyEligibleC1'='false'::jsonb,'External C2 must protect, never authorize C1';
  assert (select count(*)=1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_id
    and scope='SEGUNDO_CICLO' and state='CONFIRMED' and item_count=13 and installment_count=12
    and total_amount=3458.80),'Exact second-cycle coverage was not recorded';
  assert (select count(*)=13 and count(*) filter(where imported_now)=0
    and count(*) filter(where source_kind='MENSALIDADE')=12
    and count(*) filter(where source_kind='REMATRICULA')=1
    from internal_academic.technical_external_cycle_evidence where matricula_id=v_id),
    'Coverage must reference the 13 existing titles without importing any';
  assert (select count(*)=1 from internal_proesc.cycle_evidence_requests where request_id=v_request),
    'Canonical audit missing';
  v_result:=public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,v_payload);
  assert v_result->'replayed'='true'::jsonb,'Exact request replay failed';
  begin
    perform public.proesc_confirm_enrollment_cycle_evidence_service(v_actor,v_request,
      v_payload||'{"hasExternalCycle2":false}');
    raise exception 'Changed request replay accepted' using errcode='P9001';
  exception when invalid_parameter_value then null;
  end;
  v_state:=internal_academic.technical_manual_cycle_state(v_id);
  assert v_state->>'estado'='PROTEGIDO_EXISTENTE' and v_state->'podeGerar'='false'::jsonb
    and v_state#>>'{cicloGerado,origemEmissao}'='PROESC'
    and v_state#>>'{cicloGerado,abrangencia}'='SEGUNDO_CICLO'
    and v_state#>>'{cicloGerado,quantidadeItens}'='13'
    and v_state#>>'{cicloGerado,emitidosBanese}'='0','Factual C2 projection failed';
  begin
    update internal_academic.technical_external_cycle_coverage set scope='CONTRATO_COMPLETO' where matricula_id=v_id;
    raise exception 'Second-only coverage mislabeled complete contract' using errcode='P9001';
  exception when check_violation then null;
  end;
  select * into strict v_receivable from public.contas_receber where matricula_id=v_id order by data_vencimento limit 1;
  begin
    perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,2,current_date+30);
    raise exception 'Preview accepted protected C2' using errcode='P9001';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message=message_text;
    assert v_message='Ciclo técnico manual inválido para esta matrícula.',v_message;
  when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message='A consulta automática Proesc precisa ser atualizada antes de gerar o ciclo.',v_message;
  end;
  begin
    perform public.gerar_ciclo_financeiro_tecnico_manual_secure(v_id,2,current_date+30,gen_random_uuid(),
      repeat('a',64),repeat('b',64),repeat('c',64));
    raise exception 'Generation accepted protected C2' using errcode='P9001';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message=message_text;
    assert v_message='Ciclo técnico manual inválido para esta matrícula.',v_message;
  when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message='A consulta automática Proesc precisa ser atualizada antes de gerar o ciclo.',v_message;
  end;
  begin
    perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_id,2,current_date+30,gen_random_uuid(),
      repeat('a',64),repeat('b',64),repeat('c',64));
    raise exception 'Issuance preparation accepted protected C2' using errcode='P9001';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message=message_text;
    assert v_message='Ciclo técnico manual inválido para esta matrícula.',v_message;
  when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message='A consulta automática Proesc precisa ser atualizada antes de gerar o ciclo.',v_message;
  end;
  begin
    perform public.authorize_technical_manual_receivable_issuance_secure(v_receivable.id,gen_random_uuid());
    raise exception 'Bank issuance accepted a protected existing receivable' using errcode='P9001';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message='Matrícula protegida: nova emissão bancária bloqueada.',v_message;
  end;
  begin
    perform public.obter_emissao_ciclo_financeiro_tecnico_manual_service(v_id,2);
    raise exception 'External coverage fabricated a bank run' using errcode='P9001';
  exception when no_data_found then null;
  end;
  begin
    insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,descricao,valor,
      data_vencimento,status,tipo_lancamento,parcela_numero,origem_cronograma_id)
    values(gen_random_uuid(),v_id,v_receivable.turma_id,v_receivable.cliente_id,v_receivable.polo_id,
      'Teste transacional de proteção',279.90,current_date+30,'PENDENTE','PARCELA',1,'ciclo-2-parc-1');
    raise exception 'Direct INSERT bypassed external protection' using errcode='P9001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    assert v_message='Matrícula com cobertura Proesc: novas cobranças técnicas são bloqueadas.',v_message;
  when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    assert v_message='A consulta automática Proesc precisa ser atualizada antes de gerar o ciclo.',v_message;
  end;
  begin
    update public.contas_receber set valor=valor+1 where id=v_receivable.id;
    raise exception 'External evidence lost its financial identity' using errcode='P9001';
  exception when insufficient_privilege then null;
  end;
  select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) into v_after from public.contas_receber c;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.matricula_id,r.cycle_number)::text,'')) into v_run_after
    from internal_academic.technical_manual_cycle_runs r;
  assert v_before=v_after and v_runs=v_run_after,'Financial titles/payments/runs changed';
  assert v_academic=(select md5(to_jsonb(m)::text) from public.matriculas m where m.id=v_id),
    'Academic status changed';
  assert v_links=(select md5(jsonb_agg(to_jsonb(l)||to_jsonb(i) order by l.id)::text)
    from internal_proesc.obligation_links l join internal_proesc.obligation_imports i on i.link_id=l.id
    where l.matricula_id=v_id),'Canonical import links changed';
  assert v_existing=(select md5(coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('projection',
    internal_academic.technical_manual_cycle_state(c.matricula_id)) order by c.matricula_id)::text,''))
    from internal_academic.technical_external_cycle_coverage c where c.matricula_id<>v_id),
    'Existing complete-contract coverage/projection changed';
  assert not has_function_privilege('anon','public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb)','EXECUTE')
    and not has_function_privilege('service_role','internal_proesc.assert_external_second_cycle_only(uuid,jsonb,timestamptz)','EXECUTE'),
    'Public/private authorization was widened';
end;
$test$;
