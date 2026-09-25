-- Actual installed predicates/triggers projected into pg_temp. No product row,
-- real bank identity or financial history is created or changed.
begin;
set local plpgsql.check_asserts='on';
create temporary table rf_enrollment on commit drop as select * from public.matriculas with no data;
create temporary table rf_class on commit drop as select * from public.turmas with no data;
create temporary table rf_course on commit drop as select * from public.cursos with no data;
create temporary table rf_route on commit drop as select * from public.payment_gateway_routes with no data;
create temporary table rf_transactions on commit drop as select * from public.payment_gateway_transactions with no data;
create temporary table rf_jobs on commit drop as select * from internal_academic.technical_manual_banese_reissue_jobs with no data;
create temporary table rf_receivables on commit drop as select * from public.contas_receber with no data;
create temporary table rf_flags(protected boolean,proven boolean) on commit drop;
insert into rf_flags values(false,false);
create function pg_temp.rf_fingerprint(public.contas_receber) returns text language sql as $$ select repeat('a',64) $$;
create function pg_temp.rf_terms(public.contas_receber) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function pg_temp.rf_settled(public.contas_receber) returns boolean language sql as $$ select false $$;
create function pg_temp.rf_protected(uuid) returns boolean language sql as $$ select protected from pg_temp.rf_flags $$;
create function pg_temp.rf_local(public.contas_receber) returns boolean language sql as $$ select false $$;
create function pg_temp.rf_complete(pg_temp.rf_receivables) returns boolean language sql as $$ select proven from pg_temp.rf_flags $$;
do $copy$
declare v text; pair text[];
begin
  v:=pg_get_functiondef('internal_academic.technical_manual_banese_review_cancel_candidate(public.contas_receber,internal_academic.technical_manual_cycle_runs,internal_academic.technical_manual_receivable_issuance_authorizations,uuid)'::regprocedure);
  foreach pair slice 1 in array array[
    ['internal_academic.technical_manual_banese_review_cancel_candidate(', 'pg_temp.rf_candidate('],
    ['internal_academic.technical_manual_receivable_issuance_fingerprint(', 'pg_temp.rf_fingerprint('],
    ['internal_academic.technical_manual_banese_expected_terms(', 'pg_temp.rf_terms('],
    ['internal_academic.technical_manual_banese_has_settlement_evidence(', 'pg_temp.rf_settled('],
    ['internal_academic.is_technical_manual_cycle_protected(', 'pg_temp.rf_protected('],
    ['internal_academic.manual_cycle_has_local_intent(', 'pg_temp.rf_local('],
    ['public.matriculas as enrollment','pg_temp.rf_enrollment as enrollment'],
    ['public.turmas as class','pg_temp.rf_class as class'],
    ['public.cursos as course','pg_temp.rf_course as course'],
    ['public.payment_gateway_routes as route','pg_temp.rf_route as route'],
    ['public.payment_gateway_transactions as transaction','pg_temp.rf_transactions as transaction']
  ] loop v:=replace(v,pair[1],pair[2]); end loop;
  execute v;
  v:=pg_get_functiondef('internal_academic.guard_academic_exit_during_banese_reissue()'::regprocedure);
  v:=replace(v,'internal_academic.guard_academic_exit_during_banese_reissue()','pg_temp.rf_guard()');
  v:=replace(v,'internal_academic.technical_manual_banese_reissue_jobs','pg_temp.rf_jobs');
  v:=replace(v,'public.contas_receber r','pg_temp.rf_receivables r');
  v:=replace(v,'internal_academic.technical_manual_banese_receivable_complete(','pg_temp.rf_complete(');
  v:=replace(v,'internal_academic.technical_manual_banese_receivable_paid_issued(','pg_temp.rf_complete(');
  execute v;
end;
$copy$;
create trigger rf_exit before update of status on rf_enrollment
  for each row execute function pg_temp.rf_guard();
do $test$
declare
  r public.contas_receber; run internal_academic.technical_manual_cycle_runs;
  authz internal_academic.technical_manual_receivable_issuance_authorizations;
  e uuid:='50000000-0000-0000-0000-000000000001';
  t uuid:='50000000-0000-0000-0000-000000000002';
  p uuid:='50000000-0000-0000-0000-000000000003';
  c uuid:='50000000-0000-0000-0000-000000000004';
  rid uuid:='50000000-0000-0000-0000-000000000005';
  req uuid:='50000000-0000-0000-0000-000000000006';
  state text; result boolean;
begin
  insert into pg_temp.rf_enrollment(id,turma_id,aluno_id,status) values(e,t,p,'ATIVO');
  insert into pg_temp.rf_class(id,curso_id) values(t,c);
  insert into pg_temp.rf_course(id,modalidade) values(c,'TECNICO');
  insert into pg_temp.rf_route(modalidade,payment_method,environment,provider_code,enabled)
    values('TECNICO','BOLETO','production','banese_card',true);
  r:=jsonb_populate_record(null::public.contas_receber,jsonb_build_object(
    'id',rid,'matricula_id',e,'turma_id',t,'cliente_id',p,'status','PENDENTE',
    'gateway_provider','banese_card','gateway_environment','production',
    'gateway_payment_method','BOLETO','forma_pagamento','BOLETO',
    'gateway_issuer_polo_id',t,'gateway_submission_channel','API',
    'gateway_submission_status','API_REVIEW','gateway_status','CREATING',
    'gateway_creation_token',req,'gateway_last_error','CICLO_MANUAL_BANESE_REVISAO_INTERNAL_GET:'||req::text,
    'gateway_boleto_nosso_numero','000000001','gateway_boleto_convenio','1',
    'gateway_boleto_agencia','001','gateway_financial_terms','{}'::jsonb,
    'regra_financeira_tecnica_snapshot',jsonb_build_object('destinoCobranca','BOLETO')));
  run:=jsonb_populate_record(null::internal_academic.technical_manual_cycle_runs,jsonb_build_object(
    'matricula_id',e,'turma_id',t,'state','LOCAL_CREATED','receivable_ids',jsonb_build_array(rid),
    'cycle_number',1,'created_by',p));
  authz:=jsonb_populate_record(null::internal_academic.technical_manual_receivable_issuance_authorizations,
    jsonb_build_object('receivable_id',rid,'matricula_id',e,'turma_id',t,'cycle_number',1,
      'request_id',req,'authorized_by',p,'first_claimed_at',now(),'claim_count',1,
      'receivable_fingerprint',repeat('a',64)));
  foreach state in array array['ATIVO','PENDENTE','TRANSFERIDO','TRANCADO','DESISTENTE','CANCELADO'] loop
    update pg_temp.rf_enrollment set status=state;
    result:=pg_temp.rf_candidate(r,run,authz,req);
    assert result is not null,'Predicate must never be null';
    assert result=(state in ('ATIVO','PENDENTE')),'Academic eligibility diverged: '||state;
  end loop;
  update pg_temp.rf_enrollment set status='ATIVO';
  update pg_temp.rf_flags set protected=true;
  assert not pg_temp.rf_candidate(r,run,authz,req),'Protected enrollment cannot replace a bank title';
  update pg_temp.rf_flags set protected=false;
  r.regra_financeira_tecnica_snapshot:='{"destinoCobranca":"LOCAL"}';
  assert not pg_temp.rf_candidate(r,run,authz,req),'LOCAL never enters replacement';
  r.regra_financeira_tecnica_snapshot:='{"destinoCobranca":"BOLETO"}';
  r.gateway_provider:=null;
  assert pg_temp.rf_candidate(r,run,authz,req) is false,'Incomplete evidence fails closed';
  insert into pg_temp.rf_receivables(id,status) values(rid,'PENDENTE');
  insert into pg_temp.rf_jobs(matricula_id,receivable_id,status,lease_valid_until)
    values(e,rid,'CANCEL_INTENT',now()-interval '1 day');
  foreach state in array array['TRANSFERIDO','TRANCADO','DESISTENTE','CANCELADO'] loop
    begin
      update pg_temp.rf_enrollment set status=state;
      raise exception 'Unresolved bank intent allowed academic exit';
    exception when sqlstate 'PT409' then null;
    end;
  end loop;
  update pg_temp.rf_enrollment set status='PENDENTE';
  update pg_temp.rf_jobs set status='CANCEL_CONFIRMED';
  begin
    update pg_temp.rf_enrollment set status='TRANSFERIDO';
    raise exception 'Cancellation awaiting reset allowed academic exit';
  exception when sqlstate 'PT409' then null;
  end;
  update pg_temp.rf_jobs set status='RESET_COMPLETE';
  begin
    update pg_temp.rf_enrollment set status='TRANSFERIDO';
    raise exception 'Reset without replacement title allowed academic exit';
  exception when sqlstate 'PT409' then null;
  end;
  update pg_temp.rf_flags set proven=true;
  foreach state in array array['FENCED','RECOVERED_PIX','RESET_COMPLETE'] loop
    update pg_temp.rf_jobs set status=state;
    update pg_temp.rf_enrollment set status='TRANSFERIDO';
    update pg_temp.rf_enrollment set status='ATIVO';
  end loop;
  update pg_temp.rf_flags set proven=false;
  foreach state in array array['PAGO','CANCELADO'] loop
    update pg_temp.rf_receivables set status=state;
    update pg_temp.rf_enrollment set status='TRANSFERIDO';
    update pg_temp.rf_enrollment set status='ATIVO';
  end loop;
end;
$test$;
rollback;
