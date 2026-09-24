-- Isolated proof of C2 readiness; only pg_temp fixtures are written and dropped.
begin;
set local plpgsql.check_asserts='on';
create temporary table local_fee_enrollment (like public.matriculas) on commit drop;
create temporary table local_fee_class (like public.turmas) on commit drop;
create temporary table local_fee_course (like public.cursos) on commit drop;
create temporary table local_fee_config (like public.matriculas_tecnicas_financeiro_config) on commit drop;
create temporary table local_fee_policy (like internal_academic.technical_manual_cycle_policies) on commit drop;
create temporary table local_fee_run (like internal_academic.technical_manual_cycle_runs) on commit drop;
create temporary table local_fee_receivable (like public.contas_receber) on commit drop;
create temporary table local_fee_transaction (like public.payment_gateway_transactions) on commit drop;
create temporary table local_fee_settlement (like public.receivable_manual_settlements) on commit drop;
do $nullable$
declare c record;
begin
  for c in select t.relname,a.attname from pg_class t join pg_attribute a on a.attrelid=t.oid
    where t.relnamespace=pg_my_temp_schema() and t.relname like 'local_fee_%' and a.attnum>0 and a.attnotnull
  loop execute format('alter table pg_temp.%I alter column %I drop not null',c.relname,c.attname); end loop;
end;
$nullable$;
create function pg_temp.local_fee_eligible(uuid) returns boolean language sql as $$select true$$;
create function pg_temp.local_fee_policy_projection(uuid) returns jsonb language sql
  as $$select jsonb_build_object('fingerprint',repeat('a',64))$$;
create function pg_temp.local_fee_rule(uuid) returns jsonb language sql
  as $$select '{"cobranca":{"mensalidade":{"quantidade":12}}}'::jsonb$$;
do $copy$
declare v_signature text; v_definition text; v_pair text[];
begin
  foreach v_signature in array array[
    'internal_academic.manual_cycle_has_local_intent(public.contas_receber)',
    'internal_academic.manual_cycle_has_bank_fields(public.contas_receber)',
    'internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)',
    'internal_academic.manual_cycle_local_receivable_complete(public.contas_receber)',
    'internal_academic.technical_manual_cycle_state_before_external_history(uuid)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    foreach v_pair slice 1 in array array[
      ['internal_academic.technical_manual_cycle_state_before_external_history','pg_temp.local_fee_state'],
      ['internal_academic.technical_local_cycle_eligible','pg_temp.local_fee_eligible'],
      ['internal_academic.technical_manual_cycle_policy_projection','pg_temp.local_fee_policy_projection'],
      ['internal_academic.technical_financial_effective_rule','pg_temp.local_fee_rule'],
      ['internal_academic.manual_cycle_has_local_intent','pg_temp.local_fee_intent'],
      ['internal_academic.manual_cycle_has_bank_fields','pg_temp.local_fee_bank_fields'],
      ['internal_academic.assert_manual_cycle_reviewed_receivable','pg_temp.local_fee_assert_review'],
      ['internal_academic.manual_cycle_local_receivable_complete','pg_temp.local_fee_complete'],
      ['internal_academic.technical_manual_cycle_policies','pg_temp.local_fee_policy'],
      ['internal_academic.technical_manual_cycle_runs','pg_temp.local_fee_run'],
      ['public.matriculas_tecnicas_financeiro_config','pg_temp.local_fee_config'],
      ['public.receivable_manual_settlements','pg_temp.local_fee_settlement'],
      ['public.payment_gateway_transactions','pg_temp.local_fee_transaction'],
      ['public.contas_receber','pg_temp.local_fee_receivable'],
      ['p_receivable contas_receber','p_receivable pg_temp.local_fee_receivable'],
      ['public.matriculas','pg_temp.local_fee_enrollment'],
      ['public.turmas','pg_temp.local_fee_class'],
      ['public.cursos','pg_temp.local_fee_course']
    ] loop v_definition:=replace(v_definition,v_pair[1],v_pair[2]); end loop;
    execute v_definition;
  end loop;
end;
$copy$;
do $test$
declare
  v_person uuid:=gen_random_uuid(); v_enrollment uuid:=gen_random_uuid(); v_class uuid:=gen_random_uuid();
  v_course uuid:=gen_random_uuid(); v_request uuid:=gen_random_uuid(); v_fee uuid:=gen_random_uuid();
  v_settlement uuid:=gen_random_uuid(); v_account uuid:=gen_random_uuid();
  v_snapshot jsonb; v_items jsonb; v_state jsonb; v_fee_row pg_temp.local_fee_receivable%rowtype;
begin
  insert into pg_temp.local_fee_course(id,modalidade) values(v_course,'TECNICO');
  insert into pg_temp.local_fee_class(id,curso_id,polo_id) values(v_class,v_course,v_class);
  insert into pg_temp.local_fee_enrollment(id,aluno_id,turma_id,status) values(v_enrollment,v_person,v_class,'ATIVO');
  insert into pg_temp.local_fee_config(matricula_id) values(v_enrollment);
  v_snapshot:=jsonb_build_object('versao',2,'destinoCobranca','LOCAL','cicloManual',jsonb_build_object(
    'requestId',v_request,'cicloNumero',1,'regraFingerprint',repeat('a',64),
    'politicaFingerprint',repeat('b',64),'cronogramaFingerprint',repeat('c',64)));
  insert into pg_temp.local_fee_receivable(id,matricula_id,turma_id,polo_id,cliente_id,tipo_lancamento,
    origem_cronograma_id,parcela_numero,valor,data_vencimento,status,regra_financeira_tecnica_snapshot)
    values(v_fee,v_enrollment,v_class,v_class,v_person,'MATRICULA','matricula',0,100,current_date,'PENDENTE',v_snapshot);
  insert into pg_temp.local_fee_receivable(id,matricula_id,turma_id,polo_id,cliente_id,tipo_lancamento,
    origem_cronograma_id,parcela_numero,valor,data_vencimento,status,regra_financeira_tecnica_snapshot,gateway_submission_status)
    select gen_random_uuid(),v_enrollment,v_class,v_class,v_person,'PARCELA','ciclo-1-parc-'||n,n,
      200,(current_date+n*interval '1 month')::date,'PENDENTE',
      jsonb_set(v_snapshot,'{destinoCobranca}','"BANESE"'::jsonb),'API_REGISTERED' from generate_series(1,12) n;
  select jsonb_agg(jsonb_build_object('chave',origem_cronograma_id,'tipo',tipo_lancamento,'numero',parcela_numero,
    'valor',valor,'vencimento',data_vencimento,'destinoCobranca',
    case when tipo_lancamento='MATRICULA' then 'LOCAL' else 'BANESE' end) order by parcela_numero)
    into v_items from pg_temp.local_fee_receivable;
  insert into pg_temp.local_fee_run(matricula_id,turma_id,cycle_number,state,request_id,rule_fingerprint,
    policy_fingerprint,schedule_fingerprint,item_count,expected_installment_count,total_amount,receivable_ids,reviewed_items)
    select v_enrollment,v_class,1,'LOCAL_CREATED',v_request,repeat('a',64),repeat('b',64),repeat('c',64),
      13,12,2500,array_agg(id),v_items from pg_temp.local_fee_receivable;

  select * into v_fee_row from pg_temp.local_fee_receivable where id=v_fee;
  assert pg_temp.local_fee_complete(v_fee_row),'A canonical unpaid local fee is a complete local record';
  v_state:=pg_temp.local_fee_state(v_enrollment);
  assert v_state->>'podeGerar'='true' and v_state->>'proximoCicloNumero'='2',
    'Twelve registered bank items permit cycle two while the local fee is unpaid';
  assert v_state#>>'{cicloGerado,quantidadeItens}'='13' and v_state#>>'{cicloGerado,quantidadeBancaria}'='12'
    and v_state#>>'{cicloGerado,quantidadeLocal}'='1' and v_state#>>'{cicloGerado,emitidosBanese}'='12'
    and v_state#>>'{cicloGerado,pendentesEmissao}'='0','Bank progress excludes the local fee';

  update pg_temp.local_fee_receivable set status='PAGO',data_pagamento=current_date,valor_pago=100,
    origem_pagamento='PRESENCIAL',conta_bancaria_id=v_account,forma_pagamento='DINHEIRO',
    manual_settlement_id=v_settlement,manual_settlement_principal_cents=10000,
    manual_settlement_interest_cents=0,manual_settlement_penalty_cents=0,manual_settlement_addition_cents=0,
    manual_settlement_discount_cents=0,manual_settlement_received_cents=10000 where id=v_fee;
  assert pg_temp.local_fee_state(v_enrollment)->>'podeGerar'='false','Unproven local payment fails closed';
  insert into pg_temp.local_fee_settlement(id,receivable_id,state,requires_remote_cancellation,polo_id,account_id,
    payment_method,payment_date,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,received_cents)
    values(v_settlement,v_fee,'COMPLETED',false,v_class,v_account,'DINHEIRO',current_date,10000,0,0,0,0,10000);
  assert pg_temp.local_fee_state(v_enrollment)->>'podeGerar'='true',
    'A proven local settlement preserves cycle-two eligibility';
  update pg_temp.local_fee_receivable set gateway_submission_status='API_AMBIGUOUS' where parcela_numero=1;
  assert pg_temp.local_fee_state(v_enrollment)->>'podeGerar'='false','An ambiguous bank item still blocks cycle two';
  update pg_temp.local_fee_receivable set gateway_submission_status='API_REGISTERED' where parcela_numero=1;
  update pg_temp.local_fee_receivable set gateway_submission_status='API_REGISTERED' where id=v_fee;
  assert pg_temp.local_fee_state(v_enrollment)->>'podeGerar'='false',
    'A local fee cannot masquerade as a registered bank item to bypass its proof';
end;
$test$;
commit;
