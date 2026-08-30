-- Impede que uma falha técnica deixe RPCs concorrentes vivas no PostgREST,
-- bloqueie o fechamento do lote ou transforme indisponibilidade em revisão.
begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_prepare constant regprocedure :=
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure;
  v_record constant regprocedure :=
    'public.record_banese_reconciliation_attempt(uuid,uuid,text,text,text,integer,integer)'::regprocedure;
  v_persist constant regprocedure :=
    'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamp with time zone,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_old constant text :=
    $old$when v_result = 'ERROR' and consecutive_failures + 1 >= 8$old$;
  v_new constant text := $new$when v_result = 'ERROR'
          and v_error_class not in (
            'TIMEOUT', 'NETWORK', 'UPSTREAM_5XX',
            'AUTH', 'CONFIGURATION', 'AUDIT_WRITE'
          )
          and consecutive_failures + 1 >= 8$new$;
  v_function regprocedure;
  v_functions regprocedure[] := array[
    v_prepare,
    v_record,
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure,
    v_persist
  ];
  v_config text;
begin
  select pg_catalog.pg_get_functiondef(v_record) into v_definition;
  if pg_catalog.strpos(v_definition, v_new) = 0 then
    if pg_catalog.strpos(v_definition, v_old) = 0 then
      raise exception 'Contrato da quarentena Banese inesperado.'
        using errcode = '23514';
    end if;
    v_definition := pg_catalog.replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;

  foreach v_function in array v_functions loop
    if v_function <> v_prepare and pg_catalog.strpos(
        lower(pg_catalog.pg_get_functiondef(v_function)),
        'security definer'
      ) = 0 then
      raise exception 'RPC Banese sem SECURITY DEFINER: %.', v_function
        using errcode = '23514';
    end if;
    execute 'alter function ' || v_function::text ||
      ' set lock_timeout to ''2s''';
    execute 'alter function ' || v_function::text ||
      ' set statement_timeout to ''7s''';

    select coalesce(array_to_string(proconfig, ','), '') into v_config
    from pg_catalog.pg_proc
    where oid = v_function;
    if pg_catalog.strpos(v_config, 'lock_timeout=2s') = 0
      or pg_catalog.strpos(v_config, 'statement_timeout=7s') = 0
    then
      raise exception 'Limites Banese não aplicados em %.', v_function
        using errcode = '23514';
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(v_record) into v_definition;
  if pg_catalog.strpos(v_definition, v_new) = 0 then
    raise exception 'Falhas transitórias ainda podem virar quarentena.'
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
