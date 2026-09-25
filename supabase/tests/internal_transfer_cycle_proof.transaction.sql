-- Isolated contract fixture: no fake bank identity is written to product tables.
-- Bank/LOCAL evidence predicates are substituted only in pg_temp copies; those
-- original predicates retain their separate issuance/settlement regression tests.
begin;
set local plpgsql.check_asserts='on';
create temporary table transfer_fixture_enrollments on commit drop as select * from public.matriculas with no data;
create temporary table transfer_fixture_runs on commit drop as select * from internal_academic.technical_manual_cycle_runs with no data;
create temporary table transfer_fixture_receivables on commit drop as select * from public.contas_receber with no data;
create temporary table transfer_fixture_links on commit drop as select * from internal_academic.transfer_financial_continuity with no data;
create temporary table transfer_fixture_transfers on commit drop as select * from public.transferencias_academicas with no data;
create function pg_temp.fixture_bank_complete(r public.contas_receber)
returns boolean language sql as $$ select r.descricao='PROVEN_BANK' and r.status in ('PENDENTE','PAGO'); $$;
create function pg_temp.fixture_local_complete(r public.contas_receber)
returns boolean language sql as $$ select r.descricao='PROVEN_LOCAL' and r.status in ('PENDENTE','PAGO'); $$;

do $test$
declare v_definition text; v_source uuid:='20000000-0000-0000-0000-000000000001';
  v_target uuid:='20000000-0000-0000-0000-000000000002';
  v_person uuid:='20000000-0000-0000-0000-000000000003';
  v_class uuid:='20000000-0000-0000-0000-000000000004';
  v_target_class uuid:='20000000-0000-0000-0000-000000000005';
  v_transfer uuid:='20000000-0000-0000-0000-000000000006';
  v_request uuid:='20000000-0000-0000-0000-000000000007';
  v_bank uuid:='20000000-0000-0000-0000-000000000008';
  v_local uuid:='20000000-0000-0000-0000-000000000009';
  v_origin uuid; v_complete boolean;
begin
  v_definition:=pg_get_functiondef('internal_academic.transfer_financial_origin(uuid)'::regprocedure);
  v_definition:=replace(v_definition,'internal_academic.transfer_financial_origin(','pg_temp.fixture_origin(');
  v_definition:=replace(v_definition,'internal_academic.transfer_financial_continuity','pg_temp.transfer_fixture_links');
  v_definition:=replace(v_definition,'public.transferencias_academicas','pg_temp.transfer_fixture_transfers');
  v_definition:=replace(v_definition,'public.matriculas','pg_temp.transfer_fixture_enrollments');
  execute v_definition;
  v_definition:=pg_get_functiondef('internal_academic.transfer_source_cycle_one_complete(uuid)'::regprocedure);
  v_definition:=replace(v_definition,'internal_academic.transfer_source_cycle_one_complete(','pg_temp.fixture_complete(');
  v_definition:=replace(v_definition,'internal_academic.transfer_financial_origin(','pg_temp.fixture_origin(');
  v_definition:=replace(v_definition,'internal_academic.technical_manual_cycle_runs','pg_temp.transfer_fixture_runs');
  v_definition:=replace(v_definition,'public.matriculas','pg_temp.transfer_fixture_enrollments');
  v_definition:=replace(v_definition,'from public.contas_receber','from pg_temp.transfer_fixture_receivables');
  v_definition:=replace(v_definition,'internal_academic.technical_manual_banese_receivable_complete(','pg_temp.fixture_bank_complete(');
  v_definition:=replace(v_definition,'internal_academic.technical_manual_banese_receivable_paid_issued(','pg_temp.fixture_bank_complete(');
  v_definition:=replace(v_definition,'internal_academic.manual_cycle_local_receivable_complete(','pg_temp.fixture_local_complete(');
  execute v_definition;
  insert into pg_temp.transfer_fixture_enrollments(id,aluno_id,turma_id,status,origem_matricula_id,continuidade_tipo)
    values(v_source,v_person,v_class,'TRANSFERIDO',null,null),
      (v_target,v_person,v_target_class,'ATIVO',v_source,'TRANSFERENCIA_INTERNA');
  insert into pg_temp.transfer_fixture_transfers(id,aluno_id,tipo,matricula_origem_id,matricula_destino_id,
    turma_origem_id,turma_destino_id,data_transferencia)
    values(v_transfer,v_person,'INTERNA_TURMA',v_source,v_target,v_class,v_target_class,current_date);
  insert into pg_temp.transfer_fixture_links(transferencia_id,source_enrollment_id,target_enrollment_id,effective_date)
    values(v_transfer,v_source,v_target,current_date);
  insert into pg_temp.transfer_fixture_runs(matricula_id,turma_id,cycle_number,state,item_count,receivable_ids,request_id)
    values(v_source,v_class,1,'LOCAL_CREATED',2,array[v_bank,v_local],v_request);
  insert into pg_temp.transfer_fixture_receivables(id,matricula_id,turma_id,cliente_id,descricao,status,regra_financeira_tecnica_snapshot)
    values(v_bank,v_source,v_class,v_person,'PROVEN_BANK','PENDENTE',jsonb_build_object('cicloManual',jsonb_build_object('requestId',v_request))),
      (v_local,v_source,v_class,v_person,'PROVEN_LOCAL','PENDENTE',jsonb_build_object('cicloManual',jsonb_build_object('requestId',v_request)));
  execute 'select pg_temp.fixture_origin($1),pg_temp.fixture_complete($1)' into v_origin,v_complete using v_target;
  assert v_origin=v_source and v_complete,'C1 proof survives TRANSFERIDO and LOCAL fee remains payable';
  update pg_temp.transfer_fixture_receivables set status='PAGO';
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert v_complete,'Historically proven paid items do not require a second bank issue';
  update pg_temp.transfer_fixture_receivables set descricao='AMBIGUOUS' where id=v_bank;
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert not v_complete,'One ambiguous bank item blocks continuity';
  update pg_temp.transfer_fixture_receivables set descricao='PROVEN_BANK' where id=v_bank;
  update pg_temp.transfer_fixture_receivables set descricao='UNPROVEN_LOCAL' where id=v_local;
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert not v_complete,'Unproven LOCAL cannot release C2';
  update pg_temp.transfer_fixture_receivables set descricao='PROVEN_LOCAL',matricula_id=v_target where id=v_local;
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert not v_complete,'Moving an item to the destination cannot prove source C1';
  update pg_temp.transfer_fixture_receivables set matricula_id=v_source where id=v_local;
  update pg_temp.transfer_fixture_runs set receivable_ids=array[v_bank];
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert not v_complete,'Missing receipt ID blocks continuity';
  update pg_temp.transfer_fixture_runs set receivable_ids=array[v_bank,v_local];
  insert into pg_temp.transfer_fixture_runs(matricula_id,cycle_number,state) values(v_source,2,'LOCAL_CREATED');
  execute 'select pg_temp.fixture_complete($1)' into v_complete using v_target;
  assert not v_complete,'An existing source C2 cannot be duplicated in destination';
  update pg_temp.transfer_fixture_enrollments set aluno_id=gen_random_uuid() where id=v_target;
  execute 'select pg_temp.fixture_origin($1)' into v_origin using v_target;
  assert v_origin is null,'Another person cannot inherit the bridge';
end;
$test$;

-- Reuse this fixture for the installed eligibility/state projection chain.
create temporary table it_class (like public.turmas) on commit drop;
create temporary table it_course (like public.cursos) on commit drop;
create temporary table it_config (like public.matriculas_tecnicas_financeiro_config) on commit drop;
create temporary table it_policy (like internal_academic.technical_manual_cycle_policies) on commit drop;
create temporary table it_entry (like internal_academic.technical_transfer_entry_plans) on commit drop;
create temporary table it_scope(turma_id uuid,phase text) on commit drop;
create temporary table it_source(matricula_id uuid) on commit drop;
create temporary table it_link(matricula_id uuid) on commit drop;
create temporary table it_evidence(matricula_id uuid) on commit drop;
create temporary table it_coverage(matricula_id uuid) on commit drop;
create temporary table it_proof(receivable_id uuid,kind text) on commit drop;
do $nullable$
declare c record;
begin
  for c in select t.relname,a.attname from pg_class t join pg_attribute a on a.attrelid=t.oid
    where t.relnamespace=pg_my_temp_schema() and t.relname like 'it_%' and a.attnum>0 and a.attnotnull
  loop execute format('alter table pg_temp.%I alter column %I drop not null',c.relname,c.attname); end loop;
end;
$nullable$;
create function pg_temp.it_open_proof(p_row pg_temp.transfer_fixture_receivables) returns boolean language sql as $$
  select p_row.status in ('PENDENTE','VENCIDO')
    and exists(select 1 from pg_temp.it_proof where receivable_id=p_row.id and kind='OPEN');
$$;
create function pg_temp.it_paid_proof(p_row pg_temp.transfer_fixture_receivables) returns boolean language sql as $$
  select p_row.status='PAGO'
    and exists(select 1 from pg_temp.it_proof where receivable_id=p_row.id and kind='PAID');
$$;
create function pg_temp.it_local_proof(p_row pg_temp.transfer_fixture_receivables) returns boolean language sql as $$
  select p_row.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    and exists(select 1 from pg_temp.it_proof where receivable_id=p_row.id and kind='LOCAL');
$$;
create function pg_temp.it_rule(uuid) returns jsonb language sql
  as $$select '{"cobranca":{"mensalidade":{"quantidade":12}}}'::jsonb$$;
create function pg_temp.it_policy_projection(uuid) returns jsonb language sql
  as $$select jsonb_build_object('fingerprint',repeat('a',64))$$;
create function pg_temp.it_old_state(uuid) returns jsonb language sql
  as $$select '{"habilitado":false,"estado":"NAO_HABILITADO"}'::jsonb$$;
create function pg_temp.it_fee_summary(uuid) returns jsonb language sql as $$select null::jsonb$$;

do $copy$
declare v_signature text; v_definition text; v_pair text[];
begin
  foreach v_signature in array array[
    'internal_academic.is_manual_technical_enrollment(uuid)',
    'internal_academic.technical_cycle_history_outside_enrollment(uuid)',
    'internal_academic.technical_local_cycle_eligible_before_internal_transfer(uuid)',
    'internal_academic.transfer_financial_origin(uuid)',
    'internal_academic.transfer_financial_origin_chain(uuid)',
    'internal_academic.transfer_source_cycle_one_complete(uuid)',
    'internal_academic.technical_local_cycle_eligible(uuid)',
    'internal_academic.technical_manual_cycle_state_before_external_history(uuid)',
    'internal_academic.technical_manual_cycle_state_before_local_fee(uuid)',
    'internal_academic.technical_manual_cycle_state_before_transfer_entry(uuid)',
    'internal_academic.technical_manual_cycle_state_before_internal_transfer(uuid)',
    'internal_academic.technical_manual_cycle_state(uuid)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    foreach v_pair slice 1 in array array[
      ['internal_academic.technical_local_cycle_eligible_before_internal_transfer','pg_temp.it_base_eligible'],
      ['internal_academic.technical_manual_cycle_state_before_internal_transfer','pg_temp.it_external_state'],
      ['internal_academic.technical_manual_cycle_state_before_transfer_entry','pg_temp.it_fee_state'],
      ['internal_academic.technical_manual_cycle_state_before_local_fee','pg_temp.it_individual_state'],
      ['internal_academic.technical_manual_cycle_state_before_individual_admission','pg_temp.it_old_state'],
      ['internal_academic.technical_manual_cycle_state_before_external_history','pg_temp.it_core_state'],
      ['internal_academic.technical_manual_cycle_state','pg_temp.it_state'],
      ['internal_academic.technical_local_cycle_eligible','pg_temp.it_eligible'],
      ['internal_academic.technical_cycle_history_outside_enrollment','pg_temp.it_history_outside'],
      ['internal_academic.is_manual_technical_enrollment','pg_temp.it_is_technical'],
      ['internal_academic.transfer_financial_origin_chain','pg_temp.it_origin_chain'],
      ['internal_academic.transfer_financial_origin','pg_temp.it_origin'],
      ['internal_academic.transfer_source_cycle_one_complete','pg_temp.it_source_complete'],
      ['internal_academic.technical_manual_banese_receivable_paid_issued','pg_temp.it_paid_proof'],
      ['internal_academic.technical_manual_banese_receivable_complete','pg_temp.it_open_proof'],
      ['internal_academic.manual_cycle_local_receivable_complete','pg_temp.it_local_proof'],
      ['internal_academic.manual_cycle_local_fee_summary','pg_temp.it_fee_summary'],
      ['internal_academic.technical_financial_effective_rule','pg_temp.it_rule'],
      ['internal_academic.technical_manual_cycle_policy_projection','pg_temp.it_policy_projection'],
      ['internal_academic.transfer_financial_continuity','pg_temp.transfer_fixture_links'],
      ['internal_academic.technical_transfer_entry_plans','pg_temp.it_entry'],
      ['internal_academic.technical_manual_cycle_policies','pg_temp.it_policy'],
      ['internal_academic.technical_manual_cycle_runs','pg_temp.transfer_fixture_runs'],
      ['internal_academic.technical_external_cycle_coverage','pg_temp.it_coverage'],
      ['internal_proesc.enrollment_cycle_evidence','pg_temp.it_evidence'],
      ['internal_proesc.enrollment_sources','pg_temp.it_source'],
      ['internal_proesc.obligation_links','pg_temp.it_link'],
      ['internal_proesc.class_scopes','pg_temp.it_scope'],
      ['public.transferencias_academicas','pg_temp.transfer_fixture_transfers'],
      ['public.matriculas_tecnicas_financeiro_config','pg_temp.it_config'],
      ['public.contas_receber','pg_temp.transfer_fixture_receivables'],
      ['public.matriculas','pg_temp.transfer_fixture_enrollments'],
      ['public.turmas','pg_temp.it_class'],
      ['public.cursos','pg_temp.it_course']
    ] loop v_definition:=replace(v_definition,v_pair[1],v_pair[2]); end loop;
    execute v_definition;
  end loop;
end;
$copy$;

do $test$
declare
  v_person uuid:=gen_random_uuid(); v_source uuid:=gen_random_uuid(); v_target uuid:=gen_random_uuid();
  v_class_a uuid:=gen_random_uuid(); v_class_b uuid:=gen_random_uuid(); v_class_c uuid:=gen_random_uuid();
  v_course uuid:=gen_random_uuid();
  v_transfer uuid:=gen_random_uuid(); v_actor uuid:=gen_random_uuid(); v_request uuid:=gen_random_uuid();
  v_extra uuid:=gen_random_uuid(); v_third uuid:=gen_random_uuid(); v_third_transfer uuid:=gen_random_uuid();
  v_state jsonb; v_source_snapshot jsonb; v_ids uuid[]; v_day date:=current_date;
begin
  truncate pg_temp.transfer_fixture_enrollments,pg_temp.transfer_fixture_runs,
    pg_temp.transfer_fixture_receivables,pg_temp.transfer_fixture_links,pg_temp.transfer_fixture_transfers;
  insert into pg_temp.it_course(id,modalidade) values(v_course,'TECNICO');
  insert into pg_temp.it_class(id,curso_id,polo_id,status) values
    (v_class_a,v_course,v_class_a,'EM_ANDAMENTO'),(v_class_b,v_course,v_class_b,'EM_ANDAMENTO'),
    (v_class_c,v_course,v_class_c,'EM_ANDAMENTO');
  insert into pg_temp.it_scope values(v_class_a,'CONFIRMED'),(v_class_b,'CONFIRMED'),(v_class_c,'CONFIRMED');
  insert into pg_temp.transfer_fixture_enrollments(id,aluno_id,turma_id,status,origem_matricula_id,continuidade_tipo)
    values(v_source,v_person,v_class_a,'TRANSFERIDO',null,null),
      (v_target,v_person,v_class_b,'ATIVO',v_source,'TRANSFERENCIA_INTERNA');
  insert into pg_temp.it_config(matricula_id) values(v_source),(v_target);
  insert into pg_temp.transfer_fixture_transfers(id,aluno_id,matricula_origem_id,matricula_destino_id,tipo,
    turma_origem_id,turma_destino_id,data_transferencia)
    values(v_transfer,v_person,v_source,v_target,'INTERNA_TURMA',v_class_a,v_class_b,v_day);
  insert into pg_temp.transfer_fixture_links(transferencia_id,source_enrollment_id,target_enrollment_id,effective_date,actor_id)
    values(v_transfer,v_source,v_target,v_day,v_actor);
  assert pg_temp.it_origin(v_target)=v_source,'The academic and financial bridge must agree';
  assert pg_temp.it_origin_chain(v_target)=array[v_source];
  assert pg_temp.it_eligible(v_target),'An empty academic origin cannot invent financial history';
  v_state:=pg_temp.it_state(v_target);
  assert v_state->>'podeGerar'='true' and v_state->>'proximoCicloNumero'='1'
    and v_state->>'cicloBaseHistorico'='0' and v_state->'cicloGerado'='null'::jsonb;
  assert v_state#>>'{continuidadeFinanceira,semHistoricoFinanceiro}'='true';

  insert into pg_temp.transfer_fixture_receivables(id,matricula_id,turma_id,cliente_id,tipo_lancamento,
    parcela_numero,valor,data_vencimento,status,regra_financeira_tecnica_snapshot)
    select gen_random_uuid(),v_source,v_class_a,v_person,'PARCELA',n,200,
      (v_day+n*interval '1 month')::date,'PENDENTE',jsonb_build_object('destinoCobranca','BANESE',
        'cicloManual',jsonb_build_object('requestId',v_request,'cicloNumero',1))
    from generate_series(1,12) n;
  select array_agg(id order by parcela_numero) into v_ids from pg_temp.transfer_fixture_receivables;
  insert into pg_temp.transfer_fixture_runs(matricula_id,turma_id,cycle_number,state,request_id,receivable_ids,
    item_count,expected_installment_count,reviewed_items,total_amount)
    values(v_source,v_class_a,1,'LOCAL_CREATED',v_request,v_ids,12,12,'[]',2400);
  insert into pg_temp.it_proof select id,'OPEN' from pg_temp.transfer_fixture_receivables;
  assert pg_temp.it_source_complete(v_target),'A transferred origin retains a complete issued C1';
  assert pg_temp.it_eligible(v_target),'Only this complete canonical origin may authorize target C2';
  select jsonb_agg(to_jsonb(r) order by id) into v_source_snapshot from pg_temp.transfer_fixture_receivables r;
  v_state:=pg_temp.it_state(v_target);
  assert v_state->>'estado'='ELEGIVEL' and v_state->>'podeGerar'='true'
    and v_state->>'proximoCicloNumero'='2' and v_state->>'cicloBaseHistorico'='0'
    and v_state->>'criterioElegibilidade'='TRANSFERENCIA_INTERNA_CANONICA'
    and v_state->'cicloGerado'='null'::jsonb,'C2 must not create a fictitious target C1';
  assert v_state#>>'{continuidadeFinanceira,origemCompleta}'='true'
    and v_state#>>'{continuidadeFinanceira,semHistoricoFinanceiro}'='false';
  assert v_state#>'{continuidadeFinanceira,cadeiaOrigemIds}'=to_jsonb(array[v_source]);
  assert v_state->>'primeiroVencimentoSugerido'=(
    select internal_academic.technical_manual_cycle_due_from_last_boleto(max(data_vencimento))::text
      from pg_temp.transfer_fixture_receivables);
  assert (select jsonb_agg(to_jsonb(r) order by id)=v_source_snapshot from pg_temp.transfer_fixture_receivables r),
    'Projection must never move or alter the origin receivables';
  assert not exists(select 1 from pg_temp.transfer_fixture_runs where matricula_id=v_target);

  insert into pg_temp.it_source values(v_source);
  assert not pg_temp.it_source_complete(v_target) and not pg_temp.it_eligible(v_target);
  delete from pg_temp.it_source;
  insert into pg_temp.transfer_fixture_receivables(id,cliente_id,status) values(v_extra,v_person,'CANCELADO');
  assert not pg_temp.it_eligible(v_target),'Other personal debt cannot disappear behind the bridge';
  delete from pg_temp.transfer_fixture_receivables where id=v_extra;
  update pg_temp.transfer_fixture_enrollments set status='ATIVO' where id=v_source;
  assert pg_temp.it_origin(v_target) is null and not pg_temp.it_eligible(v_target);
  update pg_temp.transfer_fixture_enrollments set status='TRANSFERIDO' where id=v_source;

  insert into pg_temp.transfer_fixture_runs(matricula_id,turma_id,cycle_number,state,request_id,receivable_ids,
    item_count,expected_installment_count,reviewed_items,total_amount)
    values(v_target,v_class_b,2,'LOCAL_CREATED',gen_random_uuid(),'{}',0,12,'[]',0);
  v_state:=pg_temp.it_state(v_target);
  assert v_state->>'estado'='JA_GERADO' and v_state->>'proximoCicloNumero' is null,
    'An existing target C2 cannot unlock another cycle';
  delete from pg_temp.transfer_fixture_runs where matricula_id=v_target;

  update pg_temp.transfer_fixture_enrollments set status='TRANSFERIDO' where id=v_target;
  insert into pg_temp.transfer_fixture_enrollments(id,aluno_id,turma_id,status,origem_matricula_id,continuidade_tipo)
    values(v_third,v_person,v_class_c,'ATIVO',v_target,'TRANSFERENCIA_INTERNA');
  insert into pg_temp.it_config(matricula_id) values(v_third);
  insert into pg_temp.transfer_fixture_transfers(id,aluno_id,matricula_origem_id,matricula_destino_id,tipo,
    turma_origem_id,turma_destino_id,data_transferencia)
    values(v_third_transfer,v_person,v_target,v_third,'INTERNA_TURMA',v_class_b,v_class_c,v_day);
  insert into pg_temp.transfer_fixture_links(transferencia_id,source_enrollment_id,target_enrollment_id,effective_date,actor_id)
    values(v_third_transfer,v_target,v_third,v_day,v_actor);
  assert pg_temp.it_origin_chain(v_third)=array[v_target,v_source];
  assert not pg_temp.it_eligible(v_third),'An empty immediate origin cannot hide an earlier issued C1';
  v_state:=pg_temp.it_state(v_third);
  assert v_state->>'podeGerar'='false' and v_state#>'{continuidadeFinanceira,cadeiaOrigemIds}'
    =to_jsonb(array[v_target,v_source]),'Transitive history is visible but not fresh C1 eligibility';
end;
$test$;
rollback;
