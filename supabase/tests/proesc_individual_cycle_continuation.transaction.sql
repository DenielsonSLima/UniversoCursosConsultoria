-- Run after 20260913191000. Only temporary objects hold synthetic inputs.
-- The production function body is executed against its existing dependencies'
-- test doubles; no real enrollment, configuration or receivable is modified.
begin;

create temporary table cycle_fixture_policy (
  turma_id uuid, active boolean, eligibility_rule text, initial_state text,
  baseline_cycle integer, max_cycle integer, generation_mode text
) on commit drop;
create temporary table cycle_fixture_enrollment (id uuid, turma_id uuid) on commit drop;
create temporary table cycle_fixture_scope (
  turma_id uuid, phase text, batch_id uuid, financial_mode text
) on commit drop;
create temporary table cycle_fixture_run (matricula_id uuid) on commit drop;
create temporary table cycle_fixture_link (
  receivable_id uuid, matricula_id uuid, turma_id uuid
) on commit drop;
create temporary table cycle_fixture_transaction (receivable_id uuid) on commit drop;
create temporary table cycle_fixture_receivable (
  id uuid, matricula_id uuid, turma_id uuid, tipo_lancamento text,
  origem_pagamento text, origem_cronograma_id text, regra_financeira_tecnica_snapshot jsonb,
  gateway_provider text, gateway_payment_id text, gateway_submission_channel text,
  gateway_submission_status text, gateway_boleto_nosso_numero text,
  gateway_boleto_linha_digitavel text, gateway_boleto_codigo_barras text,
  asaas_payment_id text, nosso_numero_asaas text
) on commit drop;
create temporary table cycle_fixture_state (
  matricula_id uuid, baseline jsonb, confirmed_c1 boolean
) on commit drop;

create function pg_temp.cycle_fixture_baseline(p_id uuid) returns jsonb
language sql as $$ select baseline from pg_temp.cycle_fixture_state where matricula_id=p_id $$;
create function pg_temp.cycle_fixture_confirmed_c1(p_id uuid) returns boolean
language sql as $$ select confirmed_c1 from pg_temp.cycle_fixture_state where matricula_id=p_id $$;

do $copy_actual_function$
declare
  v_source text := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_state_before_proesc_coverage(uuid)'::regprocedure);
  v_pair text[];
begin
  assert position('internal_proesc.has_confirmed_first_cycle_only' in v_source)>0,
    'Deploy the individual continuation migration before this test';
  foreach v_pair slice 1 in array array[
    ['internal_academic.technical_manual_cycle_state_before_proesc_coverage', 'pg_temp.cycle_fixture_evaluate'],
    ['internal_academic.technical_manual_cycle_state_before_external_history', 'pg_temp.cycle_fixture_baseline'],
    ['internal_academic.technical_manual_cycle_policies', 'pg_temp.cycle_fixture_policy'],
    ['internal_academic.technical_manual_cycle_runs', 'pg_temp.cycle_fixture_run'],
    ['internal_proesc.has_confirmed_first_cycle_only', 'pg_temp.cycle_fixture_confirmed_c1'],
    ['internal_proesc.class_scopes', 'pg_temp.cycle_fixture_scope'],
    ['internal_proesc.obligation_links', 'pg_temp.cycle_fixture_link'],
    ['public.payment_gateway_transactions', 'pg_temp.cycle_fixture_transaction'],
    ['public.contas_receber', 'pg_temp.cycle_fixture_receivable'],
    ['public.matriculas', 'pg_temp.cycle_fixture_enrollment']
  ] loop
    v_source := replace(v_source,v_pair[1],v_pair[2]);
  end loop;
  execute v_source;
end;
$copy_actual_function$;

do $synthetic_continuation_contract$
declare
  v_enrollment uuid := '10000000-0000-0000-0000-000000000001';
  v_class uuid := '10000000-0000-0000-0000-000000000002';
  v_batch uuid := '10000000-0000-0000-0000-000000000003';
  v_receivable uuid := '10000000-0000-0000-0000-000000000004';
  v_base jsonb := '{"habilitado":true,"estado":"ELEGIVEL","proximoCicloNumero":2,
    "podeGerar":true,"bloqueio":null,"primeiroVencimentoSugerido":"2199-01-15",
    "politica":{"revisao":7,"fingerprint":"synthetic-untouched"}}';
  v_state jsonb;
begin
  insert into pg_temp.cycle_fixture_policy values
    (v_class,true,'HISTORICO_IMPORTADO_CONSULTA','IMPORTADA_CICLO_1',1,2,'MANUAL');
  insert into pg_temp.cycle_fixture_enrollment values(v_enrollment,v_class);
  insert into pg_temp.cycle_fixture_scope values(v_class,'CONFIRMED',v_batch,'INDIVIDUAL_REVIEW');
  insert into pg_temp.cycle_fixture_state values(v_enrollment,v_base,false);

  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'An imported class with UNKNOWN/FULL/stale evidence must not become eligible';
  update pg_temp.cycle_fixture_state set confirmed_c1=true;
  v_state:=pg_temp.cycle_fixture_evaluate(v_enrollment);
  assert v_state->>'estado'='ELEGIVEL' and v_state->'podeGerar'='true'::jsonb,
    'Confirmed C1 must authorize continuation in an explicitly configured imported class';
  assert v_state->'primeiroVencimentoSugerido'='null'::jsonb,
    'An external due date must not be silently selected for a new local cycle';
  assert v_state->'politica'=v_base->'politica','The policy CAS must remain intact';

  update pg_temp.cycle_fixture_scope set phase='STAGED';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'Incomplete academic import must stay blocked';
  update pg_temp.cycle_fixture_scope set phase='CONFIRMED',financial_mode='CONTRATO_COMPLETO';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'A different financial scope must not authorize second-cycle continuation';
  update pg_temp.cycle_fixture_scope set financial_mode='INDIVIDUAL_REVIEW';

  update pg_temp.cycle_fixture_state set baseline=v_base||
    '{"estado":"BLOQUEADO","podeGerar":false,"bloqueio":{"codigo":"STATUS_ACADEMICO"}}';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)#>>'{bloqueio,codigo}'='STATUS_ACADEMICO',
    'Inactive academic state must be preserved';
  update pg_temp.cycle_fixture_state set baseline=v_base||
    '{"estado":"BLOQUEADO","podeGerar":false,"bloqueio":{"codigo":"SEM_CONFIGURACAO"}}';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)#>>'{bloqueio,codigo}'='SEM_CONFIGURACAO',
    'Missing individual financial configuration must remain blocked';
  update pg_temp.cycle_fixture_state set baseline=v_base||'{"estado":"JA_GERADO","podeGerar":false}';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='JA_GERADO',
    'An already generated Banese cycle must stay unchanged';
  update pg_temp.cycle_fixture_state set baseline=v_base||'{"estado":"PROTEGIDO_EXISTENTE","podeGerar":false}';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='PROTEGIDO_EXISTENTE',
    'Existing external cycle coverage must stay protected';
  update pg_temp.cycle_fixture_state set baseline=v_base;

  insert into pg_temp.cycle_fixture_run values(v_enrollment);
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'A recorded generation must not be repeated';
  delete from pg_temp.cycle_fixture_run;
  insert into pg_temp.cycle_fixture_receivable(id,matricula_id,turma_id,tipo_lancamento,
    origem_pagamento,origem_cronograma_id) values
    (v_receivable,v_enrollment,v_class,'PARCELA','SISTEMA_ANTERIOR','PROESC-SYNTHETIC');
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'An unlinked imported receivable must block continuation';
  insert into pg_temp.cycle_fixture_link values(v_receivable,v_enrollment,v_class);
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='ELEGIVEL',
    'A valid linked historical receivable must not block confirmed C1';
  insert into pg_temp.cycle_fixture_transaction values(v_receivable);
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'A bank transaction on external history must block continuation';
  delete from pg_temp.cycle_fixture_transaction;
  update pg_temp.cycle_fixture_receivable set gateway_provider='BANESE_CARD';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'A bank identity must not be accepted as unissued external history';
  delete from pg_temp.cycle_fixture_receivable;

  update pg_temp.cycle_fixture_state set confirmed_c1=false;
  update pg_temp.cycle_fixture_scope set batch_id=null,financial_mode='CICLO1_PROESC';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='ELEGIVEL',
    'The existing reconciled seed scope must retain its contract';
  update pg_temp.cycle_fixture_scope set batch_id=v_batch;
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='BLOQUEADO',
    'A new batch cannot imitate the existing seed scope';
  update pg_temp.cycle_fixture_policy set active=false;
  update pg_temp.cycle_fixture_state set baseline='{"habilitado":false,"podeGerar":false,"estado":"NAO_HABILITADO"}';
  assert pg_temp.cycle_fixture_evaluate(v_enrollment)->>'estado'='NAO_HABILITADO',
    'No policy may be fabricated for an unconfigured class';
end;
$synthetic_continuation_contract$;

rollback;
