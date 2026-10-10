-- Synthetic admissions and local-only obligations. No gateway, payment or commit.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
create function pg_temp.synthetic_transfer_cpf()
returns text language plpgsql as $function$
declare v_digits text:=lpad(floor(random()*999999999)::bigint::text,9,'0');
  v_sum integer; v_check integer; v_length integer; v_i integer;
begin
  for v_length in 9..10 loop
    v_sum:=0;
    for v_i in 1..v_length loop
      v_sum:=v_sum+substring(v_digits,v_i,1)::integer*(v_length+2-v_i);
    end loop;
    v_check:=(v_sum*10)%11;
    v_digits:=v_digits||case when v_check=10 then 0 else v_check end::text;
  end loop;
  return v_digits;
end;
$function$;

do $test$
declare
  v_actor uuid; v_candidate record; v_student uuid:=gen_random_uuid();
  v_class uuid; v_polo uuid; v_rule jsonb; v_conditions jsonb; v_plan jsonb;
  v_preview jsonb; v_result jsonb; v_replay jsonb; v_state jsonb;
  v_single_cycle_rule jsonb; v_single_cycle_plan jsonb;
  v_cycle_preview jsonb; v_review jsonb; v_run_result jsonb; v_bad jsonb;
  v_request uuid; v_enrollment uuid; v_case integer; v_cycle integer;
  v_receivable uuid;
  v_charge_monthly boolean; v_charge_fee boolean; v_expected numeric;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  select t.id,t.polo_id into strict v_class,v_polo
    from internal_proesc.class_scopes s join public.turmas t on t.id=s.turma_id
    where s.batch_id is not null and s.phase='CONFIRMED' and t.status='EM_ANDAMENTO' limit 1;
  insert into public.parceiros(id,tipo,nome,cpf_cnpj,polo_id,nome_mae,nome_pai,
    endereco,cep,bairro,cidade,uf,situacao_ensino_medio,escola_ensino_medio,ano_conclusao_ensino_medio)
  values(v_student,'Aluno','ALUNO SINTETICO CONDICOES TRANSFERENCIA',pg_temp.synthetic_transfer_cpf(),
    v_polo,'MAE SINTETICA','PAI SINTETICO','RUA DE TESTE','49000000','CENTRO','ARACAJU','SE',
    'CONCLUIDO','ESCOLA SINTETICA',2025);
  for v_candidate in select auth_user_id,email from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status) loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
      'sub',v_candidate.auth_user_id,'email',v_candidate.email)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      perform internal_academic.assert_transfer_entry_access(v_student,v_class);
      perform internal_academic.resolve_responsavel(null);
      v_actor:=v_candidate.auth_user_id; exit;
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_actor is not null,'Authorized synthetic fixture unavailable';
  v_rule:=internal_academic.technical_financial_rule(v_class);
  execute 'set local role authenticated';
  v_preview:=public.preview_recebimento_transferencia_tecnica_secure(v_student,v_class,null);
  execute 'reset role';
  assert v_preview->>'versao'='2';
  assert v_preview#>'{financeiro,condicoes}'=internal_academic.transfer_entry_conditions(v_rule),
    'Default conditions must come from the canonical class rule';
  assert v_preview#>>'{financeiro,cobrarMensalidades}'='true';
  assert v_preview#>>'{financeiro,quantidadeParcelas}'=v_rule#>>'{cobranca,mensalidade,quantidade}';
  assert v_preview->>'maxCiclos'=v_rule#>>'{continuidade,maxCiclos}';
  assert not has_function_privilege('anon',
    'public.preview_recebimento_transferencia_tecnica_secure(uuid,uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'internal_academic.normalize_transfer_entry_conditions(jsonb,jsonb,boolean)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'internal_academic.guard_fee_only_transfer_cycle()','EXECUTE');

  v_plan:=jsonb_build_object('cicloNumero',1,'quantidadeParcelas',5,
    'primeiroVencimento',v_today+7,'justificativaCiclo2',null);
  v_single_cycle_rule:=jsonb_set(v_rule,'{continuidade,maxCiclos}','1'::jsonb);
  v_single_cycle_plan:=internal_academic.normalize_transfer_entry_plan(v_single_cycle_rule,
    v_plan||'{"condicoes":{"cobrarRematricula":false}}'::jsonb);
  v_single_cycle_rule:=internal_academic.transfer_entry_individual_rule(v_single_cycle_rule,v_single_cycle_plan);
  assert v_single_cycle_rule#>>'{continuidade,maxCiclos}'='1';
  assert internal_academic.transfer_entry_rule(v_single_cycle_rule,5,v_today+7,repeat('0',64))
    #>>'{continuidade,maxCiclos}'='1','A fee override cannot manufacture C2';
  begin
    perform internal_academic.normalize_transfer_entry_plan(v_single_cycle_rule,
      v_plan||'{"cicloNumero":2,"justificativaCiclo2":"Teste de ciclo inexistente na turma"}'::jsonb);
    raise exception 'Admission manufactured C2 in a single-cycle class' using errcode='P0001';
  exception when invalid_parameter_value then null; end;
  for v_bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"valorMensalidade":"NaN"}'::jsonb,'{"valorMensalidade":"0.00"}'::jsonb,
    '{"valorMensalidade":"-1"}'::jsonb,'{"cobrarMatricula":"false"}'::jsonb,
    '{"aplicarDescontoMensalidade":null}'::jsonb,'{"descontoPontualidade":"99999999.99"}'::jsonb,
    '{"multaAtrasoPercentual":"100.00"}'::jsonb,'{"campoDesconhecido":false}'::jsonb)) loop
    begin
      perform internal_academic.normalize_transfer_entry_plan(v_rule,v_plan||jsonb_build_object('condicoes',v_bad));
      raise exception 'Malformed conditions were accepted' using errcode='P0001';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform internal_academic.normalize_transfer_entry_plan(v_rule,
      v_plan||'{"cobrarMensalidades":false,"quantidadeParcelas":0}'::jsonb);
    raise exception 'Disabled monthly count bypassed validation' using errcode='P0001';
  exception when invalid_parameter_value then null; end;

  -- C1/C2 partial, fee-only, no obligations and C1 fee-only with a LOCAL fee.
  for v_case in 1..6 loop
    begin
      v_cycle:=case when v_case in (3,5) then 2 else 1 end;
      v_charge_monthly:=v_case in (1,5);
      v_charge_fee:=v_case in (2,3,6);
      v_conditions:=jsonb_build_object('cobrarMatricula',v_charge_fee,'valorMatricula','90.00',
        'valorMensalidade',case when v_charge_monthly then '180.00' else '0.00' end,
        'cobrarRematricula',v_charge_fee,'valorRematricula','100.00',
        'descontoPontualidade','10.00','jurosAtrasoPercentual','0.000000','multaAtrasoPercentual','2.500000',
        'aplicarDescontoMatricula',true,'aplicarMultaJurosMatricula',false,
        'aplicarDescontoMensalidade',true,'aplicarMultaJurosMensalidade',true,
        'aplicarDescontoRematricula',false,'aplicarMultaJurosRematricula',true);
      v_plan:=jsonb_build_object('cicloNumero',v_cycle,'quantidadeParcelas',5,
        'primeiroVencimento',v_today+7,'justificativaCiclo2',case when v_cycle=2
          then 'Ingresso individual no segundo ciclo nesta instituição' end,
        'condicoes',v_conditions,'cobrarMensalidades',v_charge_monthly);
      v_request:=gen_random_uuid();
      execute 'set local role authenticated';
      v_preview:=public.preview_recebimento_transferencia_tecnica_secure(v_student,v_class,v_plan);
      begin
        perform public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
          'ESCOLA SINTETICA',null,'Transferência transacional de teste',null,v_today,'[]',v_plan,repeat('0',64));
        raise exception 'Outdated class fingerprint was accepted' using errcode='P0001';
      exception when serialization_failure then null; end;
      v_result:=public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
        'ESCOLA SINTETICA',null,'Transferência transacional de teste',null,v_today,'[]',v_plan,v_preview->>'regraFingerprint');
      v_replay:=public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
        'ESCOLA SINTETICA',null,'Transferência transacional de teste',null,v_today,'[]',v_plan,v_preview->>'regraFingerprint');
      begin
        perform public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
          'ESCOLA SINTETICA',null,'Transferência transacional de teste',null,v_today,'[]',
          jsonb_set(v_plan,'{condicoes,valorMatricula}','"91.00"'),v_preview->>'regraFingerprint');
        raise exception 'Replay accepted different individual conditions' using errcode='P0001';
      exception when invalid_parameter_value then null; end;
      execute 'reset role';
      v_enrollment:=(v_result->>'matriculaId')::uuid;
      assert v_result->>'versao'='2' and v_result->>'cobrancaGerada'='false';
      assert v_replay->>'replayed'='true' and v_replay->>'matriculaId'=v_result->>'matriculaId';
      assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment);
      assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_enrollment);
      assert not exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_enrollment);
      assert (select count(*)=1 from public.transferencias_academicas where matricula_destino_id=v_enrollment);
      if v_case in (1,4) then
        begin
          insert into internal_academic.technical_manual_cycle_runs(matricula_id,turma_id,cycle_number,
            state,request_id,first_due_date,item_count,expected_installment_count,total_amount,created_by,reviewed_items)
          values(v_enrollment,v_class,v_cycle,'GENERATING',gen_random_uuid(),v_today+7,1,0,90,v_actor,
            '[{"tipo":"MATRICULA","valor":"90.00"}]'::jsonb);
          raise exception 'A zero-installment run bypassed the explicit fee-only plan' using errcode='P0001';
        exception when check_violation then null; end;
      end if;
      assert internal_academic.technical_financial_rule(v_class)=v_rule,'Student terms cannot change the class';
      assert internal_academic.technical_financial_effective_rule(v_enrollment)#>>'{cobranca,mensalidade,habilitada}'
        =v_charge_monthly::text;
      assert internal_academic.technical_financial_effective_rule(v_enrollment)#>>'{cobranca,mensalidade,valor}'
        =v_conditions->>'valorMensalidade';
      assert internal_academic.technical_financial_effective_rule(v_enrollment)->'continuidade'=v_rule->'continuidade',
        'Omitting a fee cannot shorten or manufacture a financial cycle';
      v_expected:=case when v_charge_monthly then 900 else 0 end
        +case when v_charge_fee then case v_cycle when 1 then 90 else 100 end else 0 end;
      assert (v_preview#>>'{totais,cicloInicialNominal}')::numeric=v_expected;
      assert (v_preview#>>'{totais,totalNominal}')::numeric=v_expected
        +case when v_cycle=1 and v_rule#>>'{continuidade,maxCiclos}'='2'
          then case when v_charge_monthly then (v_rule#>>'{cobranca,mensalidade,quantidade}')::integer*180 else 0 end
            +case when v_charge_fee then 100 else 0 end else 0 end;
      v_state:=internal_academic.technical_manual_cycle_state(v_enrollment);
      assert v_state#>>'{planoEntrada,cobrarMensalidades}'=v_charge_monthly::text;
      if v_case=4 then
        assert v_state->>'estado'='BLOQUEADO' and v_state->>'podeGerar'='false'
          and v_state#>>'{bloqueio,codigo}'='SEM_COBRANCAS_PLANEJADAS';
        begin
          perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,null);
          raise exception 'An empty cycle became issuable' using errcode='ZX002';
        exception when raise_exception then null; end;
      else
        execute 'set local role authenticated';
        v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,null)->'preview';
        execute 'reset role';
        assert v_cycle_preview->>'mensalidadesHabilitadas'=v_charge_monthly::text;
        assert (select count(*) from jsonb_array_elements(v_cycle_preview->'itens') i
          where i->>'tipo'='PARCELA')=case when v_charge_monthly then 5 else 0 end;
        assert (v_cycle_preview->>'quantidadeItens')::integer=case when v_charge_monthly then 5 else 1 end;
        assert (v_cycle_preview->>'total')::numeric=v_expected;
        if v_charge_monthly then
          assert v_cycle_preview#>>'{itens,0,detalhesBoleto,desconto,valor}'='10.00';
          assert v_cycle_preview#>>'{itens,0,detalhesBoleto,multa,percentual}'='2.500000';
          assert v_cycle_preview#>'{itens,0,detalhesBoleto,juros}'='null'::jsonb;
          if v_cycle=1 then
            begin
              perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,null,
                '{"emitirMatricula":true,"itens":[]}');
              raise exception 'Disabled admission fee was silently re-enabled' using errcode='P0001';
            exception when invalid_parameter_value then null; end;
          end if;
        end if;
        select jsonb_build_object('emitirMatricula',v_charge_fee,'itens',coalesce(jsonb_agg(jsonb_build_object(
          'chave',i->>'chave','valor',i->>'valor','vencimento',i->>'vencimento',
          'descontoPontualidade','0.00','jurosAtrasoPercentual','0.00','multaAtrasoPercentual','0.00') order by n),'[]'::jsonb))
          into v_review from jsonb_array_elements(v_cycle_preview->'itens') with ordinality a(i,n);
        if v_case=6 then
          v_review:=v_review||'{"modoMatricula":"REGISTRO_SEM_BOLETO","emitirMatricula":false}'::jsonb;
        end if;
        execute 'set local role authenticated';
        v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,v_review)->'preview';
        v_run_result:=public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_enrollment,v_cycle,null,gen_random_uuid(),
          v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
          v_cycle_preview->>'cronogramaFingerprint',v_review);
        execute 'reset role';
        if v_case=6 then
          assert v_cycle_preview->>'modoMatricula'='REGISTRO_SEM_BOLETO';
          assert v_cycle_preview->>'quantidadeBancaria'='0' and v_cycle_preview->>'quantidadeLocal'='1';
          assert v_cycle_preview#>>'{itens,0,destinoCobranca}'='LOCAL';
          assert (select count(*)=1 from public.contas_receber where matricula_id=v_enrollment
            and regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL');
        end if;
        assert (select count(*) from public.contas_receber where matricula_id=v_enrollment)
          =case when v_charge_monthly then 5 else 1 end;
        assert (select expected_installment_count from internal_academic.technical_manual_cycle_runs
          where matricula_id=v_enrollment and cycle_number=v_cycle)=case when v_charge_monthly then 5 else 0 end;
        if not v_charge_monthly and v_case<>6 then
          select id into strict v_receivable from public.contas_receber where matricula_id=v_enrollment;
          execute 'set local role authenticated';
          perform public.authorize_technical_manual_receivable_issuance_secure(v_receivable,gen_random_uuid());
          execute 'reset role';
        end if;
        assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment
          and (gateway_payment_id is not null or asaas_payment_id is not null));
      end if;
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      begin
        perform public.receber_transferencia_tecnica_planejada_secure(v_request,v_student,v_class,
          'ESCOLA SINTETICA',null,'Transferência transacional de teste',null,v_today,'[]',v_plan,v_preview->>'regraFingerprint');
        raise exception 'Authorization was skipped for replay' using errcode='P0001';
      exception when insufficient_privilege then null; end;
      execute 'set constraints all immediate';
      raise exception 'ROLLBACK_SYNTHETIC_CASE' using errcode='ZX001';
    exception when sqlstate 'ZX001' then null; end;
  end loop;
end;
$test$;
rollback;
