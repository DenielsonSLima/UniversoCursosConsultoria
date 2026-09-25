-- Authenticated LOCAL reversal, replay and re-settlement. No Edge or bank calls.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $test$
declare
  v_id uuid; v_turma uuid; v_polo uuid; v_actor uuid; v_actor_system uuid; v_candidate uuid;
  v_request uuid:=gen_random_uuid(); v_due date:=timezone('America/Maceio',now())::date+7;
  v_preview jsonb; v_review jsonb; v_result jsonb; v_replay jsonb; v_state jsonb;
  v_local public.contas_receber%rowtype; v_paid public.contas_receber%rowtype;
  v_fake public.contas_receber%rowtype; v_before_status text;
  v_account uuid; v_settlement uuid; v_previous uuid; v_lease uuid; v_snapshot jsonb;
  v_iteration integer; v_reason text; v_events integer; v_old_snapshot jsonb;
begin
  select m.id,m.turma_id,t.polo_id,m.status into strict v_id,v_turma,v_polo,v_before_status
  from public.matriculas m join public.turmas t on t.id=m.turma_id
  where internal_academic.technical_local_cycle_eligible(m.id) and m.fluxo_operacional='IMPLANTACAO'
    and upper(m.status) in ('ATIVO','PENDENTE')
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_policies p where p.turma_id=m.turma_id and p.active)
    and exists(select 1 from public.matriculas_tecnicas_financeiro_config c where c.matricula_id=m.id)
  order by m.data_matricula desc limit 1;
  v_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,1,v_due,null)->'preview';
  select jsonb_build_object('modoMatricula','REGISTRO_SEM_BOLETO','emitirMatricula',false,
    'itens',jsonb_agg(jsonb_build_object('chave',i->>'chave',
      'valor',case when i->>'tipo'='MATRICULA' then '125.50' else '270.00' end,
      'vencimento',i->>'vencimento','descontoPontualidade','0.00',
      'jurosAtrasoPercentual','0.00','multaAtrasoPercentual','0.00') order by n))
    into v_review from jsonb_array_elements(v_preview->'itens') with ordinality a(i,n);
  v_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,1,v_due,v_review)->'preview';
  if v_preview->>'quantidadeItens'<>'13' or v_preview->>'quantidadeBancaria'<>'12'
    or v_preview->>'quantidadeLocal'<>'1' or v_preview#>>'{itens,0,destinoCobranca}'<>'LOCAL' then
    raise exception 'Local enrollment preview did not retain 13/12/1';
  end if;

  for v_candidate in select distinct u.auth_user_id from public.usuarios_sistema u
    join internal_academic.technical_manual_receivable_issuance_authorizations a on a.authorized_by=u.auth_user_id
    where public.is_active_status(u.status)
  loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    if public.can_operate_turma_academics(v_turma) and public.gestor_has_tab('gestao','financeiro')
      and public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(v_polo) then
      v_actor:=v_candidate; exit;
    end if;
  end loop;
  if v_actor is null then raise exception 'Authorized financial actor fixture unavailable'; end if;
  select u.id into strict v_actor_system from public.usuarios_sistema u
    where u.auth_user_id=v_actor and public.is_active_status(u.status) limit 1;
  execute 'set local role authenticated';
  v_result:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_id,1,v_due,v_request,v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
  execute 'reset role';
  select * into strict v_local from public.contas_receber where matricula_id=v_id and tipo_lancamento='MATRICULA';
  if v_local.status<>'PENDENTE' or not internal_academic.manual_cycle_local_receivable_complete(v_local)
    or internal_academic.manual_cycle_has_bank_fields(v_local)
    or v_result#>>'{ciclo,quantidadeItens}'<>'13'
    or v_result#>>'{ciclo,quantidadeBancaria}'<>'12' or v_result#>>'{ciclo,quantidadeLocal}'<>'1'
    or v_result#>>'{ciclo,pendentesEmissao}'<>'12'
    or v_result#>>'{cicloManual,matriculaLocal,id}' is distinct from v_local.id::text then
    raise exception 'Authenticated preparation changed the local enrollment into a boleto';
  end if;
  if (select count(*) from public.contas_receber where matricula_id=v_id
    and tipo_lancamento='PARCELA' and forma_pagamento='BOLETO' and gateway_payment_method='BOLETO')<>12 then
    raise exception 'The twelve bank installments were not prepared';
  end if;
  v_old_snapshot:=v_local.regra_financeira_tecnica_snapshot;
  v_result:=public.estornar_matricula_local_sem_boleto_secure(
    (select id from public.contas_receber where matricula_id=v_id and tipo_lancamento='PARCELA' limit 1),null,null);
  assert v_result='{"handled":false}'::jsonb,'Non-local fallback must be explicit and may omit expected payment';
  select id into strict v_account from public.contas_bancarias
    where ativo and (polo_id=v_polo or polo_id is null) order by polo_id nulls last limit 1;

  for v_iteration in 1..2 loop
    v_reason:=case when v_iteration=1 then 'Teste de estorno local auditado' else null end;
    v_lease:=gen_random_uuid();
    perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
    perform set_config('request.jwt.claim.role','service_role',true);
    select * into strict v_local from public.contas_receber where id=v_local.id;
    v_snapshot:=jsonb_build_object('status',v_local.status,'valor_cents',round(v_local.valor*100)::bigint,
      'polo_id',v_local.polo_id,'gateway_provider',null,'gateway_environment',null,
      'gateway_payment_method',null,'gateway_payment_id',null,'gateway_payment_link_id',null,
      'gateway_boleto_nosso_numero',null,'gateway_status',null,'asaas_payment_id',null,
      'asaas_payment_link_id',null,'asaas_status',null,'manual_settlement_context','STANDARD');
    insert into public.receivable_manual_settlements(idempotency_key,request_fingerprint,receivable_id,
      actor_id,polo_id,account_id,payment_date,payment_method,principal_cents,interest_cents,
      penalty_cents,discount_cents,received_cents,receivable_snapshot,state,lease_token,lease_expires_at)
    values(gen_random_uuid(),repeat('a',64),v_local.id,v_actor_system,v_polo,v_account,current_date,'DINHEIRO',
      12550,125,250,375,12550,v_snapshot,'REMOTE_CANCELED_LOCAL_PENDING',v_lease,clock_timestamp()+interval '3 minutes')
    returning id into v_settlement;
    v_result:=public.finalize_receivable_manual_settlement(v_settlement,v_lease);
    select * into strict v_paid from public.contas_receber where id=v_local.id;
    assert v_paid.status='PAGO' and internal_academic.manual_cycle_local_receivable_complete(v_paid),
      'Actual finalizer must accept both initial payment and payment after reversal';

    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    execute 'set local role authenticated';
    begin
      perform internal_academic.local_manual_reversal_authorized(v_paid,v_paid);
      raise exception 'Private reversal authority is directly callable' using errcode='P0001';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.receivable_manual_settlement_events(settlement_id,actor_id,event_type,details)
        values(v_settlement,v_actor_system,'LOCAL_SETTLEMENT_REVERSED','{}'::jsonb);
      raise exception 'Authenticated caller forged a reversal event' using errcode='P0001';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
    perform set_config('request.jwt.claim.role','service_role',true);

    -- The old generic service route cannot reopen LOCAL, with or without reason.
    begin
      update public.contas_receber set status='PENDENTE',conta_bancaria_id=null,valor_pago=null,
        data_pagamento=null,forma_pagamento=null,origem_pagamento='LOCAL',
        manual_settlement_reversed_at=clock_timestamp() where id=v_local.id;
      raise exception 'Generic reversal bypassed the local audit' using errcode='P0001';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.contas_receber set status='PENDENTE',conta_bancaria_id=null,valor_pago=null,
        data_pagamento=null,forma_pagamento=null,origem_pagamento='LOCAL',
        manual_settlement_reversed_at=clock_timestamp(),asaas_last_error='Baixa manual estornada. Motivo: teste'
        where id=v_local.id;
      raise exception 'Generic reversal with reason bypassed the local audit' using errcode='P0001';
    exception when insufficient_privilege or check_violation then null;
    end;
    begin
      perform public.estornar_matricula_local_sem_boleto_secure(v_local.id,v_settlement,v_reason);
      raise exception 'Service role bypassed authenticated reversal' using errcode='P0001';
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform public.estornar_matricula_local_sem_boleto_secure(v_local.id,null,v_reason);
      raise exception 'Missing payment CAS was accepted' using errcode='P0001';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform public.estornar_matricula_local_sem_boleto_secure(v_local.id,gen_random_uuid(),v_reason);
      raise exception 'Different payment CAS was accepted' using errcode='P0001';
    exception when serialization_failure then null;
    end;
    if v_previous is not null then
      begin
        perform public.estornar_matricula_local_sem_boleto_secure(v_local.id,v_previous,'Teste de estorno local auditado');
        raise exception 'Late reversal undid a newer payment' using errcode='P0001';
      exception when serialization_failure then null;
      end;
      assert (select status='PAGO' and manual_settlement_id=v_settlement from public.contas_receber where id=v_local.id),
        'A stale reversal must preserve the newer payment';
    end if;
    execute 'set local role authenticated';
    v_result:=public.estornar_matricula_local_sem_boleto_secure(v_local.id,v_settlement,v_reason);
    v_replay:=public.estornar_matricula_local_sem_boleto_secure(v_local.id,v_settlement,v_reason);
    execute 'reset role';
    select * into strict v_local from public.contas_receber where id=v_local.id;
    assert v_result->>'handled'='true' and v_result->>'success'='true' and v_result->>'replayed'='false'
      and v_replay->>'replayed'='true' and v_result->>'gatewayRecreated'='false',
      'Authenticated reversal and exact replay must succeed without a bank operation';
    assert v_local.status='PENDENTE' and v_local.manual_settlement_id=v_settlement
      and internal_academic.manual_cycle_local_receivable_complete(v_local)
      and not internal_academic.manual_cycle_has_bank_fields(v_local)
      and v_local.regra_financeira_tecnica_snapshot=v_old_snapshot,
      'Reversal must preserve the local financial record and frozen terms';
    assert (select state='REVERSED' and reversed_at=v_local.manual_settlement_reversed_at
      from public.receivable_manual_settlements where id=v_settlement),'Ledger reversal must be atomic';
    select count(*) into v_events from public.receivable_manual_settlement_events
      where settlement_id=v_settlement and event_type='LOCAL_SETTLEMENT_REVERSED'
        and actor_id=v_actor_system and details->>'reason'=coalesce(v_reason,'');
    assert v_events=1,'Replay must not create another event or misattribute its actor';
    begin
      perform public.estornar_matricula_local_sem_boleto_secure(v_local.id,v_settlement,'Motivo diferente');
      raise exception 'Replay accepted a different audit intention' using errcode='P0001';
    exception when serialization_failure then null;
    end;
    v_fake:=jsonb_populate_record(v_local,jsonb_build_object('manual_settlement_reversed_at',clock_timestamp()+interval '1 day'));
    assert not internal_academic.manual_cycle_local_receivable_complete(v_fake),'Forged reversal timestamp must fail';
    v_fake:=jsonb_populate_record(v_local,'{"manual_settlement_received_cents":1}'::jsonb);
    assert not internal_academic.manual_cycle_local_receivable_complete(v_fake),'Forged reversal composition must fail';
    begin
      update public.contas_receber set gateway_creation_token=gen_random_uuid() where id=v_local.id;
      raise exception 'Reversed local enrollment gained a bank claim' using errcode='P0001';
    exception when check_violation then null;
    end;
    perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
    perform set_config('request.jwt.claim.role','service_role',true);
    begin
      perform public.finalize_receivable_manual_settlement(v_settlement,v_lease);
      raise exception 'Reversed payment replay returned a false completion' using errcode='P0001';
    exception when object_not_in_prerequisite_state then null;
    end;
    v_result:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
      v_id,1,v_due,v_request,v_preview->>'regraEfetivaFingerprint',
      v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
    v_state:=internal_academic.technical_manual_cycle_state(v_id);
    assert v_result->>'replayed'='true' and v_result#>>'{ciclo,quantidadeItens}'='13'
      and v_result#>>'{ciclo,quantidadeBancaria}'='12' and v_result#>>'{ciclo,pendentesEmissao}'='12'
      and v_state#>>'{matriculaLocal,status}'='PENDENTE' and v_state->>'podeGerar'='false',
      'Reversal keeps the CTA/progress and does not release C2 with unfinished bank installments';
    v_previous:=v_settlement;
  end loop;
  assert (select count(*)=13 from public.contas_receber where matricula_id=v_id),'Reversal cannot duplicate debt';
  assert not exists(select 1 from public.payment_gateway_transactions t
    join public.contas_receber r on r.id=t.receivable_id where r.matricula_id=v_id),'No bank state may be created';
  assert (select status from public.matriculas where id=v_id) is not distinct from v_before_status,
    'Reversal cannot change academic activation';
end;
$test$;
rollback;
