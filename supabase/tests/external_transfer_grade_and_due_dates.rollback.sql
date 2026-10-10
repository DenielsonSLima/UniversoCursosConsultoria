-- Canonical T40 matrix with a synthetic student. All records are rolled back.
-- No gateway, payment, document notification or production enrollment is committed.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
create function pg_temp.transfer_grade_cpf()
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
  v_class uuid; v_course uuid; v_polo uuid; v_student uuid:=gen_random_uuid(); v_actor uuid; v_candidate record;
  v_subject uuid; v_foreign_subject uuid; v_request uuid:=gen_random_uuid(); v_enrollment uuid;
  v_rule jsonb; v_grade jsonb; v_default jsonb; v_plan jsonb; v_changed jsonb; v_before jsonb;
  v_preview jsonb; v_result jsonb; v_replay jsonb; v_credits jsonb; v_cycle_preview jsonb; v_review jsonb;
  v_today date:=timezone('America/Maceio',now())::date; v_first date; v_fee_date date; v_next_year integer;
  v_item jsonb; v_bad jsonb; v_zero_module uuid:=gen_random_uuid(); v_zero_subject uuid:=gen_random_uuid();
  v_empty_module uuid:=gen_random_uuid();
begin
  select id,curso_id,polo_id into strict v_class,v_course,v_polo from public.turmas where codigo='ENF-T40-INT-MAT';
  assert not exists(select 1 from public.turmas_disciplinas where turma_id=v_class),
    'The regression fixture must have an effective matrix without class overrides';
  insert into public.parceiros(id,tipo,nome,cpf_cnpj,polo_id,nome_mae,nome_pai,
    endereco,cep,bairro,cidade,uf,situacao_ensino_medio,escola_ensino_medio,ano_conclusao_ensino_medio)
    values(v_student,'Aluno','ALUNO SINTETICO GRADE TRANSFERENCIA',pg_temp.transfer_grade_cpf(),v_polo,
      'MAE SINTETICA','PAI SINTETICO','RUA DE TESTE','49000000','CENTRO','ARACAJU','SE','CONCLUIDO','ESCOLA SINTETICA',2025);
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
  assert not has_function_privilege('anon','public.get_grade_recebimento_transferencia_tecnica_secure(uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','internal_academic.transfer_course_grade_rows(uuid)','EXECUTE');
  execute 'set local role authenticated';
  v_grade:=public.get_grade_recebimento_transferencia_tecnica_secure(v_class);
  execute 'reset role';
  assert v_grade->>'turmaId'=v_class::text and v_grade->>'cursoId'=v_course::text;
  assert jsonb_array_length(v_grade->'modulos')=3;
  assert (select count(*) from jsonb_array_elements(v_grade->'modulos') m,
    lateral jsonb_array_elements(m->'disciplinas') d)=27;
  select disciplina_id into strict v_subject from internal_academic.transfer_course_grade_rows(v_class)
    where disciplina_id is not null order by modulo_ordem,disciplina_ordem limit 1;
  select d.id into strict v_foreign_subject from public.disciplinas d join public.modulos m on m.id=d.modulo_id
    where m.curso_id<>v_course limit 1;
  v_rule:=internal_academic.technical_financial_rule(v_class);
  v_first:=v_today+20; v_fee_date:=v_today+3;
  execute 'set local role authenticated';
  v_preview:=public.preview_recebimento_transferencia_tecnica_v3_secure(v_student,v_class,null,null);
  execute 'reset role';
  assert v_preview#>>'{regra,valorMatricula}'='200.00' and v_preview#>>'{regra,valorMensalidade}'='279.90';
  v_default:=v_preview->'financeiro';
  execute 'set local role authenticated';
  v_preview:=public.preview_recebimento_transferencia_tecnica_v3_secure(v_student,v_class,v_default,
    jsonb_build_object('acao','CONFIGURAR_CICLO','cicloNumero',1,'quantidadeParcelas',12,
      'primeiroVencimento',v_first,'vencimentoTaxa',v_fee_date,'periodicidade','DIAS_CORRIDOS_30',
      'cobrarTaxa',true,'valorTaxa','150.00','valorMensalidade','279.90','alvoEncargos','MENSALIDADES',
      'descontoPontualidade','175.00','jurosAtrasoPercentual','1.250000','multaAtrasoPercentual','2.500000'));
  execute 'reset role';
  v_plan:=v_preview->'financeiro';
  assert v_plan#>>'{itens,0,tipo}'='MATRICULA' and v_plan#>>'{itens,0,vencimento}'=v_fee_date::text;
  assert v_plan#>>'{itens,0,valor}'='150.00';
  assert v_plan#>>'{itens,0,descontoPontualidade}'=v_default#>>'{itens,0,descontoPontualidade}',
    'Monthly charges must preserve the fee terms';
  assert (v_preview#>>'{totais,porCiclo,0,totalNominal}')::numeric=3508.80;
  assert (select bool_and((i->>'vencimento')::date=v_first+30*(n-1)::integer)
    from (select i,row_number() over(order by (i->>'ordem')::integer) n
      from jsonb_array_elements(v_plan->'itens') i where i->>'cicloNumero'='1' and i->>'tipo'='PARCELA') x);
  assert (select jsonb_agg(i order by (i->>'ordem')::integer) from jsonb_array_elements(v_plan->'itens') i
    where i->>'cicloNumero'='2')=(select jsonb_agg(i order by (i->>'ordem')::integer)
      from jsonb_array_elements(v_default->'itens') i where i->>'cicloNumero'='2');
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_plan,jsonb_build_object(
    'acao','CONFIGURAR_CICLO','cicloNumero',1,'vencimentoTaxa',v_fee_date+2));
  assert (select jsonb_agg(i order by (i->>'ordem')::integer) from jsonb_array_elements(v_changed->'itens') i
    where i->>'tipo'='PARCELA')=(select jsonb_agg(i order by (i->>'ordem')::integer)
      from jsonb_array_elements(v_plan->'itens') i where i->>'tipo'='PARCELA');
  -- A custom monthly row remains untouched when adding rows using the current cadence.
  v_before:=jsonb_set(v_plan,'{itens,2,vencimento}',to_jsonb((v_first+42)::text));
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_before,
    '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"quantidadeParcelas":14,"periodicidade":"DIAS_CORRIDOS_30"}');
  assert (select bool_and(i=b.i) from jsonb_array_elements(v_before->'itens') i
    join lateral (select j i from jsonb_array_elements(v_changed->'itens') j where j->>'itemId'=i->>'itemId') b on true);
  assert (select (i->>'vencimento')::date=v_first+390 from jsonb_array_elements(v_changed->'itens') i
    where i->>'cicloNumero'='1' and i->>'ordem'='15');
  assert (select i->>'descontoPontualidade'='175.00' and i->>'jurosAtrasoPercentual'='1.250000'
    and i->>'multaAtrasoPercentual'='2.500000' from jsonb_array_elements(v_changed->'itens') i
    where i->>'cicloNumero'='1' and i->>'ordem'='15');
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_before,jsonb_build_object(
    'acao','ADICIONAR_ITEM','cicloNumero',1,'tipo','PARCELA','itemId',gen_random_uuid(),'periodicidade','DIAS_CORRIDOS_30'));
  assert (select (i->>'vencimento')::date=v_first+360 from jsonb_array_elements(v_changed->'itens') i
    where i->>'cicloNumero'='1' and i->>'ordem'='14');
  assert (select i->>'descontoPontualidade'='175.00' and i->>'jurosAtrasoPercentual'='1.250000'
    from jsonb_array_elements(v_changed->'itens') i where i->>'cicloNumero'='1' and i->>'ordem'='14');
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_default,jsonb_build_object('acao','CONFIGURAR_CICLO',
    'cicloNumero',1,'quantidadeParcelas',5,'valorMensalidade','150.00','alvoEncargos','MENSALIDADES',
    'descontoPontualidade','10.00','primeiroVencimento',v_first,'periodicidade','DIAS_CORRIDOS_30'));
  v_before:=v_changed;
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_changed,
    '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"quantidadeParcelas":6,"periodicidade":"DIAS_CORRIDOS_30"}');
  assert (select i->>'valor'='150.00' and i->>'descontoPontualidade'='10.00'
    from jsonb_array_elements(v_changed->'itens') i where i->>'cicloNumero'='1' and i->>'ordem'='7');
  assert (select bool_and(i=b.i) from jsonb_array_elements(v_before->'itens') i
    join lateral (select j i from jsonb_array_elements(v_changed->'itens') j where j->>'itemId'=i->>'itemId') b on true);
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_before,jsonb_build_object(
    'acao','ADICIONAR_ITEM','cicloNumero',1,'tipo','PARCELA','itemId',gen_random_uuid(),'periodicidade','DIAS_CORRIDOS_30'));
  assert (select i->>'valor'='150.00' and i->>'descontoPontualidade'='10.00'
    from jsonb_array_elements(v_changed->'itens') i where i->>'cicloNumero'='1' and i->>'ordem'='7');
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_plan,jsonb_build_object('acao','CONFIGURAR_CICLO',
    'cicloNumero',1,'primeiroVencimento',v_first+1,'periodicidade','DIAS_CORRIDOS_30'));
  assert v_changed#>>'{itens,1,vencimento}'=(v_first+1)::text and v_changed#>>'{itens,2,vencimento}'=(v_first+31)::text;
  assert v_changed#>>'{itens,0,vencimento}'=v_fee_date::text;
  v_next_year:=extract(year from v_today)::integer+1;
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_plan,jsonb_build_object('acao','CONFIGURAR_CICLO',
    'cicloNumero',1,'primeiroVencimento',make_date(v_next_year,1,31),'periodicidade','MENSAL_CALENDARIO'));
  assert v_changed#>>'{itens,3,vencimento}'=make_date(v_next_year,3,31)::text;
  assert v_changed#>>'{itens,0,vencimento}'=v_fee_date::text;
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_changed,
    '{"acao":"CONFIGURAR_CICLO","cicloNumero":1,"quantidadeParcelas":2}');
  v_changed:=internal_academic.adjust_transfer_schedule(v_rule,v_changed,jsonb_build_object(
    'acao','ADICIONAR_ITEM','cicloNumero',1,'tipo','PARCELA','itemId',gen_random_uuid(),'periodicidade','MENSAL_CALENDARIO'));
  assert v_changed#>>'{itens,3,vencimento}'=make_date(v_next_year,3,31)::text,
    'Calendar append retains the chosen day after February';
  for v_bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"periodicidade":"INVENTADA"}'::jsonb,'{"periodicidade":null}'::jsonb,
    '{"vencimentoTaxa":"2026-02-30"}'::jsonb,'{"vencimentoTaxa":null}'::jsonb,
    '{"alvoEncargos":"TODOS"}'::jsonb)) loop
    begin
      perform internal_academic.adjust_transfer_schedule(v_rule,v_plan,
        '{"acao":"CONFIGURAR_CICLO","cicloNumero":1}'::jsonb||v_bad);
      raise exception 'Invalid schedule adjustment accepted' using errcode='ZX001';
    exception when invalid_parameter_value then null; end;
  end loop;
  -- An alien course subject is rejected before anything can be committed.
  execute 'set local role authenticated';
  begin
    perform public.receber_transferencia_tecnica_v3_secure(gen_random_uuid(),v_student,v_class,'ESCOLA SINTETICA',
      null,'Teste de disciplina alheia',null,v_today,jsonb_build_array(jsonb_build_object('disciplinaId',v_foreign_subject,
        'mediaFinal',8,'frequenciaPercent',95,'situacao','APROVEITADO')),v_plan,v_preview->>'regraFingerprint');
    raise exception 'Alien course credit accepted' using errcode='ZX001';
  exception when raise_exception then
    assert SQLERRM='Uma disciplina informada não pertence à turma de destino.';
  end;
  v_credits:=jsonb_build_array(jsonb_build_object('disciplinaId',v_subject,'mediaFinal',8.5,
    'frequenciaPercent',95,'situacao','APROVEITADO'));
  v_result:=public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
    null,'Teste de grade e datas independentes',null,v_today,v_credits,v_plan,v_preview->>'regraFingerprint');
  v_replay:=public.receber_transferencia_tecnica_v3_secure(v_request,v_student,v_class,'ESCOLA SINTETICA',
    null,'Teste de grade e datas independentes',null,v_today,v_credits,v_plan,v_preview->>'regraFingerprint');
  execute 'reset role';
  v_enrollment:=(v_result->>'matriculaId')::uuid;
  assert v_result->>'cobrancaGerada'='false' and v_replay->>'replayed'='true';
  assert exists(select 1 from public.matricula_aproveitamentos where matricula_id=v_enrollment
    and disciplina_id=v_subject and media_final=8.5 and frequencia_percent=95);
  assert not exists(select 1 from public.turmas_disciplinas where turma_id=v_class),
    'Receiving credits must not manufacture class overrides';
  assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment);
  v_review:='{"modoMatricula":"REGISTRO_SEM_BOLETO","itens":[]}';
  execute 'set local role authenticated';
  v_cycle_preview:=public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,v_fee_date,v_review)->'preview';
  perform public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(v_enrollment,1,v_fee_date,gen_random_uuid(),
    v_cycle_preview->>'regraEfetivaFingerprint',v_cycle_preview->>'politicaFingerprint',
    v_cycle_preview->>'cronogramaFingerprint',v_review);
  execute 'reset role';
  assert (select count(*) from public.contas_receber where matricula_id=v_enrollment)=13;
  assert exists(select 1 from public.contas_receber where matricula_id=v_enrollment and parcela_numero=0
    and data_vencimento=v_fee_date and valor=150);
  assert (select bool_and(r.data_vencimento=v_first+30*(r.parcela_numero-1))
    from public.contas_receber r where r.matricula_id=v_enrollment and r.parcela_numero>0);
  assert not exists(select 1 from public.contas_receber where matricula_id=v_enrollment
    and (gateway_payment_id is not null or asaas_payment_id is not null));
  -- Empty modules and zero workload remain valid DTO entries without class overrides.
  insert into public.modulos(id,curso_id,nome) values
    (v_empty_module,v_course,'Módulo sintético vazio'),(v_zero_module,v_course,'Módulo sintético carga zero');
  insert into public.disciplinas(id,modulo_id,nome,carga_horaria)
    values(v_zero_subject,v_zero_module,'Disciplina sintética sem carga',0);
  execute 'set local role authenticated';
  v_grade:=public.get_grade_recebimento_transferencia_tecnica_secure(v_class);
  execute 'reset role';
  assert exists(select 1 from jsonb_array_elements(v_grade->'modulos') m
    where m->>'id'=v_empty_module::text and m->'disciplinas'='[]'::jsonb);
  assert exists(select 1 from jsonb_array_elements(v_grade->'modulos') m,
    lateral jsonb_array_elements(m->'disciplinas') d where d->>'id'=v_zero_subject::text and d->>'cargaHoraria'='0');
end;
$test$;
set constraints all immediate;
rollback;
