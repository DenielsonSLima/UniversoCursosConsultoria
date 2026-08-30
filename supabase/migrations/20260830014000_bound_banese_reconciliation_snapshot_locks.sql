-- A persistência final não pode exceder a lease de 90s do worker. Um lock
-- concorrente deve devolver erro auditável antes de transformar o lote em
-- ABANDONED; nunca reduzimos as validações nem a atomicidade da baixa.
begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_function constant regprocedure :=
    'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamp with time zone,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_config text;
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if v_definition is null
    or pg_catalog.strpos(lower(v_definition), 'for update') = 0
    or pg_catalog.strpos(lower(v_definition), 'security definer') = 0
  then
    raise exception 'Contrato da persistência Banese inesperado.'
      using errcode = '23514';
  end if;

  execute 'alter function ' || v_function::text ||
    ' set lock_timeout to ''5s''';
  execute 'alter function ' || v_function::text ||
    ' set statement_timeout to ''45s''';

  select coalesce(array_to_string(proconfig, ','), '') into v_config
  from pg_catalog.pg_proc
  where oid = v_function;
  if pg_catalog.strpos(v_config, 'lock_timeout=5s') = 0
    or pg_catalog.strpos(v_config, 'statement_timeout=45s') = 0
  then
    raise exception 'Limites da persistência Banese não foram aplicados.'
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
