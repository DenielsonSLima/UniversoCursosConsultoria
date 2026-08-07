begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.comunicacao_automacao_salvar_rascunho(uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    '''^[a-z0-9_]{1,512}$''',
    '''^[a-z0-9_]+$'''
  );
  execute v_definition;
end;
$$;

commit;
