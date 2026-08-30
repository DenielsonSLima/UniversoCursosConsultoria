-- Conflito CAS e uma resposta de negocio, nao uma transacao serializavel.
-- SQLSTATE 40001 faz o PostgREST repetir a RPC; PT409 devolve o conflito uma
-- unica vez ao worker, que preserva o titulo e registra revisao financeira.
begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_function constant regprocedure :=
    'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamp with time zone,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_hits integer;
  v_pattern constant text :=
    'using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''';
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  select count(*) into v_hits
  from pg_catalog.regexp_matches(v_definition, v_pattern, 'gi');

  if v_hits <> 3 then
    raise exception 'Contrato CAS Banese inesperado: % ocorrencias.', v_hits
      using errcode = '23514';
  end if;

  v_definition := pg_catalog.regexp_replace(
    v_definition,
    v_pattern,
    'using errcode = ''PT409''',
    'gi'
  );
  execute v_definition;

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  select count(*) into v_hits
  from pg_catalog.regexp_matches(
    v_definition,
    'using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''PT409''',
    'gi'
  );
  if v_hits <> 3 or v_definition ~* v_pattern then
    raise exception 'Conflitos CAS Banese ainda podem disparar retry.'
      using errcode = '23514';
  end if;

  if pg_catalog.strpos(lower(v_definition), 'security definer') = 0 then
    raise exception 'RPC Banese perdeu SECURITY DEFINER.'
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
