-- Run only via MCP after 180000..180400. No Edge or bank operation occurs.
begin;
set local statement_timeout='45s';
set local lock_timeout='3s';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $test$
declare
  v_id uuid; v_turma uuid; v_polo uuid; v_actor uuid; v_actor_system uuid; v_candidate uuid;
  v_request uuid:=gen_random_uuid(); v_due date:=timezone('America/Maceio',now())::date+7;
  v_preview jsonb; v_review jsonb; v_result jsonb; v_replay jsonb; v_state jsonb;
  v_local public.contas_receber%rowtype; v_fake public.contas_receber%rowtype;
  v_patch jsonb; v_key text; v_count integer; v_before_status text;
  v_account uuid; v_settlement uuid; v_lease uuid:=gen_random_uuid(); v_snapshot jsonb;
begin
  if internal_academic.manual_cycle_enrollment_mode('{"emitirMatricula":true}'::jsonb)<>'BOLETO'
    or internal_academic.manual_cycle_enrollment_mode('{"emitirMatricula":false}'::jsonb)<>'OMITIR'
    or internal_academic.manual_cycle_enrollment_mode('{"modoMatricula":"REGISTRO_SEM_BOLETO","emitirMatricula":false}'::jsonb)<>'REGISTRO_SEM_BOLETO' then
    raise exception 'Legacy or explicit enrollment intent changed';
  end if;
  begin
    perform internal_academic.manual_cycle_enrollment_mode('{"modoMatricula":"REGISTRO_SEM_BOLETO","emitirMatricula":true}'::jsonb);
    raise exception 'Conflicting enrollment intent accepted' using errcode='P0001';
  exception when invalid_parameter_value then null;
  end;

  select m.id,m.turma_id,t.polo_id,m.status into strict v_id,v_turma,v_polo,v_before_status
  from public.matriculas m join public.turmas t on t.id=m.turma_id
  where internal_academic.technical_local_cycle_eligible(m.id) and m.fluxo_operacional='IMPLANTACAO'
    and upper(m.status) in ('ATIVO','PENDENTE')
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_policies p where p.turma_id=m.turma_id and p.active)
    and exists(select 1 from public.matriculas_tecnicas_financeiro_config c where c.matricula_id=m.id)
  order by m.data_matricula desc limit 1;
  -- The old boolean false did not suppress a C2 re-enrollment fee.
  v_result:=internal_academic.review_manual_cycle_items(jsonb_build_array(jsonb_build_object(
    'chave','ciclo-1-rematricula','tipo','REMATRICULA','numero',0,'descricao','SYNTHETIC',
    'valor','125.50','vencimento',v_due)),
    '{"emitirMatricula":false,"itens":[]}'::jsonb,
    internal_academic.technical_financial_effective_rule(v_id),'SYNTHETIC','SYNTHETIC');
  if jsonb_array_length(v_result->'itens')<>1 or v_result#>>'{itens,0,destinoCobranca}'<>'BANESE' then
    raise exception 'Legacy C2 boolean behavior changed';
  end if;
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
  v_fake:=jsonb_populate_record(v_local,'{"status":"PAGO","origem_pagamento":"PRESENCIAL"}'::jsonb);
  if internal_academic.manual_cycle_local_receivable_complete(v_fake) then
    raise exception 'Unproven local payment accepted';
  end if;
  begin
    perform public.authorize_technical_manual_receivable_issuance_secure(v_local.id,gen_random_uuid());
    raise exception 'Local enrollment bank authorization accepted' using errcode='P0001';
  exception when check_violation then null;
  end;
  begin
    perform internal_academic.technical_manual_banese_expected_terms(v_local);
    raise exception 'Local enrollment bank terms accepted' using errcode='P0001';
  exception when check_violation then null;
  end;
  for v_patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('gateway_provider','banese_card'),
    jsonb_build_object('gateway_payment_method','BOLETO'),
    jsonb_build_object('gateway_creation_token',gen_random_uuid()),
    jsonb_build_object('gateway_submission_channel','API'),
    jsonb_build_object('gateway_cnab_file_id',gen_random_uuid()),
    jsonb_build_object('asaas_payment_id','local-test-forbidden')
  )) loop
    select key into strict v_key from jsonb_object_keys(v_patch) key;
    begin
      execute format('update public.contas_receber set %1$I=(jsonb_populate_record(null::public.contas_receber,$1)).%1$I where id=$2',v_key)
        using v_patch,v_local.id;
      raise exception 'Generic bank claim accepted local-only enrollment' using errcode='P0001';
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.payment_gateway_transactions(receivable_id,provider_code,environment,payment_method,
      origin_polo_id,issuer_polo_id,amount) values(v_local.id,'banese_card','production','BOLETO',v_polo,v_polo,v_local.valor);
    raise exception 'Local enrollment acquired a bank transaction' using errcode='P0001';
  exception when check_violation then null;
  end;
  begin
    update internal_academic.technical_manual_cycle_runs set reviewed_items=jsonb_set(
      reviewed_items,'{0,destinoCobranca}','"BANESE"'::jsonb) where matricula_id=v_id and cycle_number=1;
    raise exception 'Local enrollment intent changed after creation' using errcode='P0001';
  exception when check_violation then null;
  end;
  begin
    perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
      v_id,1,v_due,v_request,v_preview->>'regraEfetivaFingerprint',
      v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',
      jsonb_set(v_review,'{modoMatricula}','"OMITIR"'::jsonb));
    raise exception 'Replay accepted a different financial intention' using errcode='P0001';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);
  select id into strict v_account from public.contas_bancarias
    where ativo and (polo_id=v_polo or polo_id is null) order by polo_id nulls last limit 1;
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
  v_replay:=public.finalize_receivable_manual_settlement(v_settlement,v_lease);
  select * into strict v_local from public.contas_receber where id=v_local.id;
  if v_result->'success' is distinct from 'true'::jsonb or v_replay->'replayed' is distinct from 'true'::jsonb
    or v_local.status<>'PAGO' or not internal_academic.manual_cycle_local_receivable_complete(v_local)
    or internal_academic.manual_cycle_has_bank_fields(v_local) then
    raise exception 'Canonical cash settlement did not preserve local-only intent';
  end if;
  if not public.should_skip_technical_manual_future_sync(v_id)
    or public.gerar_parcelas_matricula(v_id)<>0 then
    raise exception 'Local enrollment settlement enabled legacy future installments';
  end if;
  v_result:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_id,1,v_due,v_request,v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint',v_preview->>'cronogramaFingerprint',v_review);
  v_state:=internal_academic.technical_manual_cycle_state(v_id);
  if v_result->'replayed' is distinct from 'true'::jsonb
    or v_result#>>'{ciclo,quantidadeItens}'<>'13'
    or v_result#>>'{ciclo,quantidadeBancaria}'<>'12'
    or v_result#>>'{ciclo,pendentesEmissao}'<>'12'
    or v_state#>>'{matriculaLocal,status}'<>'PAGO'
    or v_state#>>'{cicloGerado,quantidadeLocal}'<>'1'
    or v_state#>>'{cicloGerado,quantidadeBancaria}'<>'12'
    or v_state->'podeGerar' is distinct from 'false'::jsonb then
    raise exception 'Replay after local settlement lost bank progress or released unfinished C2';
  end if;
  select count(*) into v_count from public.contas_receber where matricula_id=v_id;
  if v_count<>13 or exists(select 1 from public.payment_gateway_transactions t
    join public.contas_receber r on r.id=t.receivable_id where r.matricula_id=v_id)
    or (select status from public.matriculas where id=v_id) is distinct from v_before_status then
    raise exception 'Settlement/replay duplicated debt, created bank state or changed academic activation';
  end if;
end;
$test$;
rollback;
