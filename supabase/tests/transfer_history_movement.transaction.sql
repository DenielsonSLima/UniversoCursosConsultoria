-- Read the installed history JOIN and exercise it with isolated synthetic CTEs.
-- No enrollment, receivable, job or transfer is mutated.
begin;
set local plpgsql.check_asserts='on';
do $test$
declare v_body text; v_join text; v_query text; v_result jsonb;
begin
  select prosrc into strict v_body from pg_proc
    where oid='public.get_transferencias_financeiras_turma(uuid)'::regprocedure;
  v_join:=substring(v_body from '(left join public\.banese_cancellation_outbox q[\s\S]*?)left join internal_academic\.transfer_financial_reviews');
  assert v_join is not null,'History outbox join not found';
  v_join:=replace(replace(v_join,'public.banese_cancellation_outbox','fixture_jobs'),
    'public.matricula_movimentacoes','fixture_movements');
  v_query:=$query$
    with fixture_transfers(id,matricula_origem_id,data_transferencia) as (
      values ('old','enrollment',date '2026-09-01'),('current','enrollment',date '2026-09-24')
    ), fixture_receivables(id,matricula_id) as (values ('title','enrollment')),
    fixture_movements(id,matricula_id,tipo,data_movimentacao,metadados) as (
      values ('old-movement','enrollment','TRANSFERENCIA_EXTERNA_ENVIADA',date '2026-09-01','{"transferencia_id":"old"}'::jsonb),
        ('current-movement','enrollment','TRANSFERENCIA_EXTERNA_ENVIADA',date '2026-09-24','{"transferencia_id":"current"}'::jsonb)
    ), fixture_jobs(receivable_id,movement_id,reason,state) as (
      values ('title','current-movement','TRANSFERENCIA_EXTERNA_ENVIADA','PENDING')
    ) select jsonb_object_agg(tr.id,coalesce(q.state,'NO_JOB'))
      from fixture_transfers tr join fixture_receivables r on r.matricula_id=tr.matricula_origem_id
  $query$||v_join;
  execute v_query into v_result;
  assert v_result->>'current'='PENDING','Current transfer must retain its job';
  assert v_result->>'old'='NO_JOB','New job must not be attributed to an old transfer';
end;
$test$;
rollback;
