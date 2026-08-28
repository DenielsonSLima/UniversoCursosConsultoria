begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_function regprocedure :=
    'public.persist_banese_discount_removal_correction(uuid,timestamp with time zone,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_stale_fingerprint constant text :=
    'f8a6ab2dc5ac3c82faaa364d0c3d611bc1c303be119c136c2e1c3c1b0e642216';
  v_current_fingerprint constant text :=
    '5439c26924faa7a642d14377cac507c3caa47e0b5f646de11d632227d612ab21';
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;

  if pg_catalog.strpos(v_definition, v_current_fingerprint) > 0
    and pg_catalog.strpos(v_definition, v_stale_fingerprint) = 0
  then
    return;
  end if;
  if pg_catalog.strpos(v_definition, v_stale_fingerprint) = 0
    or pg_catalog.strpos(v_definition, v_current_fingerprint) > 0
  then
    raise exception
      'Contrato da persistência Banese diverge do estado esperado.'
      using errcode = '23514';
  end if;

  execute pg_catalog.replace(
    v_definition,
    v_stale_fingerprint,
    v_current_fingerprint
  );

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if pg_catalog.strpos(v_definition, v_current_fingerprint) = 0
    or pg_catalog.strpos(v_definition, v_stale_fingerprint) > 0
  then
    raise exception
      'Fingerprint canônico não foi aplicado à persistência Banese.'
      using errcode = '23514';
  end if;
end;
$migration$;

comment on function public.persist_banese_discount_removal_correction(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, uuid
) is 'Persiste a remoção auditada do desconto da rematrícula T42 usando a revisão financeira canônica vigente.';

commit;
