-- Synthetic admission and local records only. No gateway, payment or commit.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
create function pg_temp.schedule_cpf()
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
create function pg_temp.schedule_item(p_cycle integer,p_kind text,p_order integer,p_value text,p_due date)
returns jsonb language sql as $function$
  select jsonb_build_object('itemId',gen_random_uuid(),'cicloNumero',p_cycle,'tipo',p_kind,
    'ordem',p_order,'valor',p_value,'vencimento',p_due,'descontoPontualidade','0.00',
    'jurosAtrasoPercentual','0.000000','multaAtrasoPercentual','0.000000');
$function$;

do $test$
declare v_class uuid; v_polo uuid; v_student uuid:=gen_random_uuid(); v_actor uuid; v_candidate record;
  v_rule jsonb; v_default jsonb; v_plan jsonb; v_changed jsonb; v_preview jsonb; v_result jsonb;
  v_state jsonb; v_cycle_preview jsonb; v_review jsonb; v_replay jsonb; v_bad jsonb;
  v_id uuid; v_request uuid; v_run_request uuid; v_case integer; v_cycle integer; v_items jsonb;
  v_first jsonb; v_second jsonb; v_total numeric; v_claims text; v_calendar jsonb; v_calendar_due date;
  v_due date:=timezone('America/Maceio',now())::date+7;
begin
  select t.id,t.polo_id into strict v_class,v_polo
    from internal_proesc.class_scopes s join public.turmas t on t.id=s.turma_id
    where s.batch_id is not null and s.phase='CONFIRMED' and t.status='EM_ANDAMENTO'
      and coalesce(t.cobrar_rematricula,t.valor_rematricula>0) limit 1;
  insert into public.parceiros(id,tipo,nome,cpf_cnpj,polo_id,nome_mae,nome_pai,
    endereco,cep,bairro,cidade,uf,situacao_ensino_medio,escola_ensino_medio,ano_conclusao_ensino_medio)
  values(v_student,'Aluno','ALUNO SINTETICO CRONOGRAMA TRANSFERENCIA',pg_temp.schedule_cpf(),
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
  v_claims:=current_setting('request.jwt.claims');
  v_rule:=internal_academic.technical_financial_rule(v_class);
  assert v_rule#>>'{continuidade,maxCiclos}'='2';
  execute 'set local role authenticated';
  v_preview:=public.preview_recebimento_transferencia_tecnica_v3_secure(v_student,v_class,null,null);
  execute 'reset role';
  v_default:=v_preview->'financeiro';
  assert v_preview->>'versao'='3';
  assert v_preview#>>'{regra,valorMatricula}'=v_rule#>>'{cobranca,matricula,valor}';
  assert v_preview#>>'{regra,valorMensalidade}'=v_rule#>>'{cobranca,mensalidade,valor}';
  assert v_preview#>>'{regra,valorRematricula}'=v_rule#>>'{cobranca,rematricula,valor}';
  assert jsonb_array_length(v_preview#>'{totais,porCiclo}')=2;
  assert v_default=internal_academic.default_transfer_schedule(v_rule),'Defaults and IDs must be deterministic';
  assert not exists(select 1 from jsonb_array_elements(v_default->'itens') i
    where (i->>'vencimento')::date<v_due-7),'Historical class dates must advance';
  assert not has_function_privilege('anon','public.preview_recebimento_transferencia_tecnica_v3_secure(uuid,uuid,jsonb,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','internal_academic.normalize_transfer_schedule(jsonb,jsonb,boolean)','EXECUTE');
  v_calendar_due:=make_date(extract(year from v_due)::integer+1,2,28);
  v_calendar:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_rule,
    '{primeiroVencimentoSugerido}',to_jsonb(v_calendar_due::text)),'{vencimento,diaBase}','31'),
    '{cobranca,mensalidade,quantidade}','2'),'{cobranca,matricula,habilitada}','false');
  v_changed:=internal_academic.default_transfer_schedule(v_calendar);
  assert v_changed#>>'{itens,0,vencimento}'=v_calendar_due::text;
  assert v_changed#>>'{itens,1,vencimento}'=make_date(extract(year from v_calendar_due)::integer,3,31)::text,
    'February cannot permanently shorten the canonical day';
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_default,
    '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"quantidadeParcelas":5,"valorMensalidade":"180.00"}');
  assert (select jsonb_agg(i order by (i->>'ordem')::integer) from jsonb_array_elements(v_default->'itens') i
    where i->>'cicloNumero'='2')=(select jsonb_agg(i order by (i->>'ordem')::integer)
      from jsonb_array_elements(v_changed->'itens') i where i->>'cicloNumero'='2'),
    'Editing C1 must leave every C2 field and ID unchanged';
  v_first:=pg_temp.schedule_item(1,'PARCELA',1,'123.45',v_due+20);
  v_second:=pg_temp.schedule_item(1,'PARCELA',2,'234.56',v_due);
  v_plan:=jsonb_build_object('versao',3,'itens',jsonb_build_array(v_first,v_second));
  v_plan:=internal_academic.normalize_transfer_schedule(v_rule,v_plan);
  assert v_plan#>>'{itens,0,vencimento}'=(v_due+20)::text,'Order must not be sorted by date';
  v_changed:=internal_academic.normalize_transfer_schedule(v_rule,jsonb_build_object('versao',3,'itens',
    jsonb_build_array(v_second||'{"ordem":1}',v_first||'{"cicloNumero":2,"ordem":1}')));
  assert v_changed#>>'{itens,1,itemId}'=v_first->>'itemId','Moving a monthly item preserves its identity';
  assert v_changed#>>'{itens,1,vencimento}'=v_first->>'vencimento','Moving an item cannot change its date';
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_plan,jsonb_build_object(
    'acao','ADICIONAR_ITEM','cicloNumero',1,'tipo','MATRICULA','itemId',gen_random_uuid(),'valor','150.00'));
  assert v_changed#>>'{itens,0,tipo}'='MATRICULA' and v_changed#>>'{itens,0,valor}'='150.00';
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_changed,jsonb_build_object(
    'acao','CONFIGURAR_CICLO','cicloNumero',1,'primeiroVencimento',v_due+40));
  assert v_changed#>>'{itens,1,vencimento}'=(v_due+40)::text,'Explicit monthly first due must be literal';
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,'{"versao":3,"itens":[]}',
    '{"acao":"CONFIGURAR_CICLO","cicloNumero":2,"quantidadeParcelas":1}');
  assert v_changed#>>'{itens,0,vencimento}'=(select i->>'vencimento'
    from jsonb_array_elements(v_default->'itens') i where i->>'cicloNumero'='2' limit 1),
    'Restoring an empty C2 starts from its own canonical calendar';
  begin
    perform internal_academic.adjust_transfer_schedule(v_rule,'{"versao":3,"itens":[]}',
      '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"valorMensalidade":"NaN"}');
    raise exception 'Malformed adjustment accepted for an empty cycle' using errcode='ZX001';
  exception when invalid_parameter_value then null; end;
  for v_bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"valor":"0.00"}'::jsonb,'{"valor":"10000000.00"}'::jsonb,'{"valor":"NaN"}'::jsonb,
    '{"descontoPontualidade":"123.45"}'::jsonb,'{"jurosAtrasoPercentual":"100"}'::jsonb,
    '{"itemId":"invalid"}'::jsonb,'{"ordem":0}'::jsonb,'{"tipo":"REMATRICULA"}'::jsonb,
    '{"vencimento":"2026-02-30"}'::jsonb,'{"campoExtra":true}'::jsonb)) loop
    begin
      perform internal_academic.normalize_transfer_schedule(v_rule,jsonb_build_object('versao',3,
        'itens',jsonb_build_array(v_first||v_bad)));
      raise exception 'Invalid schedule item accepted' using errcode='ZX001';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform internal_academic.normalize_transfer_schedule(jsonb_set(v_rule,'{continuidade,maxCiclos}','1'),
      jsonb_build_object('versao',3,'itens',jsonb_build_array(v_first||'{"cicloNumero":2}')));
    raise exception 'C2 invented in a single-cycle class' using errcode='ZX001';
  exception when invalid_parameter_value then null; end;

  -- C1 fee150 +12 rows; LOCAL fee; C2 first; academic only; C1 rows; sequential C2.
  for v_case in 1..6 loop
    begin
      v_cycle:=case when v_case=3 then 2 else 1 end;
      if v_case=1 then
        v_plan:=internal_academic.adjust_transfer_schedule(v_rule,v_default,
          '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"quantidadeParcelas":12,
            "cobrarTaxa":true,"valorTaxa":"150.00","valorMensalidade":"175.00",
            "descontoPontualidade":"0.00","jurosAtrasoPercentual":"0.000000","multaAtrasoPercentual":"0.000000"}');
      elsif v_case=2 then
        v_plan:=jsonb_build_object('versao',3,'itens',jsonb_build_array(pg_temp.schedule_item(1,'MATRICULA',1,'150.00',v_due)));
      elsif v_case=3 then
        v_plan:=jsonb_build_object('versao',3,'itens',jsonb_build_array(
          pg_temp.schedule_item(2,'REMATRICULA',1,'100.00',v_due),
          pg_temp.schedule_item(2,'PARCELA',2,'210.00',v_due+20),
          pg_temp.schedule_item(2,'PARCELA',3,'220.00',v_due+10)));
      elsif v_case=4 then v_plan:='{"versao":3,"itens":[]}';
      elsif v_case=6 then
        v_plan:=jsonb_build_object('versao',3,'itens',jsonb_build_array(
          pg_temp.schedule_item(1,'MATRICULA',1,'150.00',v_due),
          pg_temp.schedule_item(2,'PARCELA',1,'211.00',v_due+30),
          pg_temp.schedule_item(2,'PARCELA',2,'222.00',v_due+10)));
      else v_plan:=jsonb_build_object('versao',3,'itens',jsonb_build_array(v_first,v_second)); end if;
      v_plan:=internal_academic.normalize_transfer_schedule(v_rule,v_plan);
      v_request:=gen_random_uuid();
      execute 'set local role authenticated';
      v_preview:=public.preview_recebimento_transferencia_tecnica_v3_secure(v_student,v_class,v_plan,null);
      begin
        perform public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
          null,'Transferência transacional de cronograma',null,v_due-7,'[]',v_plan,repeat('0',64));
        raise exception 'Stale rule accepted' using errcode='ZX001';
      exception when serialization_failure then null; end;
      v_result:=public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
        null,'Transferência transacional de cronograma',null,v_due-7,'[]',v_plan,v_preview->>'regraFingerprint');
      v_replay:=public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
        null,'Transferência transacional de cronograma',null,v_due-7,'[]',v_plan,v_preview->>'regraFingerprint');
      begin
        perform public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'OUTRA ESCOLA',
          null,'Transferência transacional de cronograma',null,v_due-7,'[]',v_plan,v_preview->>'regraFingerprint');
        raise exception 'Replay changed intent' using errcode='ZX001';
      exception when invalid_parameter_value then null; end;
      if jsonb_array_length(v_plan->'itens')>0 then
        begin
          perform public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
            null,'Transferência transacional de cronograma',null,v_due-7,'[]',
            jsonb_set(v_plan,'{itens,0,valor}','"999.99"'),v_preview->>'regraFingerprint');
          raise exception 'Replay changed the financial schedule' using errcode='ZX001';
        exception when invalid_parameter_value then null; end;
      end if;
      execute 'reset role';
      v_id:=(v_result->>'matriculaId')::uuid;
      assert v_result->>'versao'='3' and v_result->>'cobrancaGerada'='false';
      assert v_replay->>'replayed'='true' and v_replay->>'matriculaId'=v_id::text;
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      begin
        perform public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
          null,'Transferência transacional de cronograma',null,v_due-7,'[]',v_plan,v_preview->>'regraFingerprint');
        raise exception 'Replay bypassed authorization' using errcode='ZX001';
      exception when insufficient_privilege then null; end;
      perform set_config('request.jwt.claims',v_claims,true);
      assert not exists(select 1 from public.contas_receber where matricula_id=v_id);
      assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_id);
      assert not exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id=v_id);
      assert internal_academic.technical_financial_rule(v_class)=v_rule,'The class cannot change';
      v_state:=internal_academic.technical_manual_cycle_state(v_id);
      assert v_state#>'{planoEntrada,itens}'=v_plan->'itens';
      assert v_state#>>'{planoEntrada,cronogramaFingerprint}'=v_preview->>'cronogramaFingerprint';
      assert (select cycle_two_reason is null from internal_academic.technical_transfer_entry_plans where matricula_id=v_id);
      begin
        update internal_academic.technical_transfer_entry_plans set financial_plan='{"versao":3,"itens":[]}'
          where matricula_id=v_id;
        raise exception 'Received schedule was mutable' using errcode='ZX001';
      exception when check_violation then null; end;
      if v_case=4 then
        assert v_state->>'estado'='BLOQUEADO' and v_state#>>'{bloqueio,codigo}'='SEM_COBRANCAS_PLANEJADAS';
      else
        execute 'set local role authenticated';
        v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,v_cycle,v_due,null)->'preview';
        execute 'reset role';
        assert v_cycle_preview->>'cronogramaEntradaVersao'='3';
        assert v_cycle_preview->>'cronogramaEntradaFingerprint'=v_preview->>'cronogramaFingerprint';
        assert v_cycle_preview->>'dataOrigem'=v_due::text and v_cycle_preview->>'sourceVencimento'='INDIVIDUAL';
        select jsonb_agg(i order by (i->>'ordem')::integer),sum((i->>'valor')::numeric)
          into v_items,v_total from jsonb_array_elements(v_plan->'itens') i where (i->>'cicloNumero')::integer=v_cycle;
        assert jsonb_array_length(v_cycle_preview->'itens')=jsonb_array_length(v_items);
        assert (v_cycle_preview->>'total')::numeric=v_total;
        assert (select bool_and(p.i->>'itemId'=s.i->>'itemId' and p.i->>'valor'=s.i->>'valor'
          and p.i->>'vencimento'=s.i->>'vencimento') from jsonb_array_elements(v_cycle_preview->'itens')
          with ordinality p(i,n) join jsonb_array_elements(v_items) with ordinality s(i,n) using(n));
        if v_case=5 then
          assert v_cycle_preview->>'modoMatricula'='OMITIR';
          assert v_cycle_preview->>'primeiroVencimento'=(v_due+20)::text,'Use first row, not minimum date';
          begin
            perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,1,v_due,'{"modoMatricula":"BOLETO","itens":[]}');
            raise exception 'Missing fee invented by emission mode' using errcode='ZX001';
          exception when invalid_parameter_value then null; end;
        end if;
        v_review:=jsonb_build_object('modoMatricula',case when v_case in (2,6) then 'REGISTRO_SEM_BOLETO'
          when v_case=5 then 'OMITIR' else 'BOLETO' end,'itens','[]'::jsonb);
        if v_case=5 then
          v_review:=jsonb_set(v_review,'{itens}',jsonb_build_array(jsonb_build_object(
            'chave','ciclo-1-parc-1','valor','140.00','vencimento',v_due+25,
            'descontoPontualidade','5.00','jurosAtrasoPercentual','1.500000','multaAtrasoPercentual','2.250000')));
          v_items:=jsonb_set(jsonb_set(v_items,'{0,valor}','"140.00"'),'{0,vencimento}',to_jsonb((v_due+25)::text));
        end if;
        v_run_request:=gen_random_uuid();
        execute 'set local role authenticated';
        v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,v_cycle,v_due,v_review)->'preview';
        if v_case=5 then
          assert v_cycle_preview#>>'{itens,0,detalhesBoleto,desconto,valor}'='5.00';
          assert v_cycle_preview#>>'{itens,0,detalhesBoleto,juros,percentualMes}'='1.500000';
          assert v_cycle_preview#>>'{itens,0,detalhesBoleto,multa,percentual}'='2.250000';
          assert v_cycle_preview#>>'{itens,1,valor}'=v_second->>'valor';
          assert v_cycle_preview#>>'{itens,1,vencimento}'=v_second->>'vencimento';
        end if;
        perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_id,v_cycle,v_due,v_run_request,
          v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
          v_cycle_preview->>'cronogramaFingerprint',v_review);
        execute 'reset role';
        assert (select count(*) from public.contas_receber where matricula_id=v_id)=jsonb_array_length(v_items);
        assert not exists(select 1 from public.contas_receber where matricula_id=v_id
          and regra_financeira_tecnica_snapshot->>'cronogramaEntradaFingerprint'
            is distinct from v_preview->>'cronogramaFingerprint');
        assert not exists(select 1 from public.contas_receber r where r.matricula_id=v_id and not exists(
          select 1 from jsonb_array_elements(v_items) i where i->>'itemId'=r.regra_financeira_tecnica_snapshot->>'itemId'
            and (i->>'valor')::numeric=r.valor and (i->>'vencimento')::date=r.data_vencimento));
        if v_case in (2,6) then
          assert v_cycle_preview->>'quantidadeBancaria'='0' and v_cycle_preview->>'quantidadeLocal'='1';
          v_state:=internal_academic.technical_manual_cycle_state(v_id);
          if v_case=2 then
            assert v_state->>'podeGerar'='false' and v_state#>>'{bloqueio,codigo}'='SEM_COBRANCAS_PLANEJADAS';
          else
            assert v_state->>'podeGerar'='true' and v_state->>'proximoCicloNumero'='2';
            assert v_state->>'primeiroVencimentoSugerido'=(v_due+30)::text;
            execute 'set local role authenticated';
            v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_id,2,v_due+30,null)->'preview';
            perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_id,2,v_due+30,gen_random_uuid(),
              v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
              v_cycle_preview->>'cronogramaFingerprint',null);
            execute 'reset role';
            assert v_cycle_preview->>'quantidadeItens'='2' and v_cycle_preview->>'total'='433.00';
            assert v_cycle_preview#>>'{itens,1,vencimento}'=(v_due+10)::text,
              'C2 uses its own ordered dates instead of rebuilding from C1';
            assert (select count(*) from public.contas_receber where matricula_id=v_id)=3;
            assert (select count(*) from internal_academic.technical_manual_cycle_runs where matricula_id=v_id)=2;
          end if;
        end if;
      end if;
      raise exception 'Rollback synthetic case' using errcode='ZX009';
    exception when sqlstate 'ZX009' then null; end;
  end loop;
  assert not exists(select 1 from public.matriculas where aluno_id=v_student);
end;
$test$;
rollback;
