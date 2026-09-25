-- Execute the installed SQL predicate over isolated CTEs, without mutating tables.
begin;
set local plpgsql.check_asserts='on';
do $test$
declare v_body text; v_query text; v_id uuid:='10000000-0000-0000-0000-000000000001';
  v_first uuid:='10000000-0000-0000-0000-000000000002';
  v_second uuid:='10000000-0000-0000-0000-000000000003';
  v_third uuid:='10000000-0000-0000-0000-000000000004';
  v_movements jsonb; v_current uuid;
begin
  select prosrc into strict v_body from pg_proc
    where oid='internal_academic.current_external_transfer_movement(uuid)'::regprocedure;
  v_query:='with fixture_enrollments as (select $1::uuid id,''TRANSFERIDO''::text status),
    fixture_movements as(select * from jsonb_to_recordset($2) as x(
      id uuid,matricula_id uuid,tipo text,status_novo text,created_at timestamptz)) '
    ||replace(replace(replace(v_body,'public.matriculas','fixture_enrollments'),
      'public.matricula_movimentacoes','fixture_movements'),'p_matricula_id','$1');
  v_movements:=jsonb_build_array(jsonb_build_object('id',v_first,'matricula_id',v_id,
    'tipo','TRANSFERENCIA_EXTERNA_ENVIADA','status_novo','TRANSFERIDO','created_at','2026-09-01T10:00:00Z'));
  execute v_query into v_current using v_id,v_movements;
  assert v_current=v_first,'Current external exit must match';
  v_movements:=v_movements||jsonb_build_array(jsonb_build_object('id',v_second,'matricula_id',v_id,
    'tipo','REATIVACAO','status_novo','ATIVO','created_at','2026-09-02T10:00:00Z'));
  execute v_query into v_current using v_id,v_movements;
  assert v_current is null,'Historic exit is not current after reactivation';
  v_movements:=v_movements||jsonb_build_array(jsonb_build_object('id',v_third,'matricula_id',v_id,
    'tipo','TRANSFERENCIA_INTERNA','status_novo','TRANSFERIDO','created_at','2026-09-03T10:00:00Z'));
  execute v_query into v_current using v_id,v_movements;
  assert v_current is null,'Internal transfer must never revive an older external cancellation';
end;
$test$;
rollback;
