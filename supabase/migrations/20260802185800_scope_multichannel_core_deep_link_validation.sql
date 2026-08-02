-- O núcleo valida deepLink somente nos canais que abrem o portal do aluno.
-- WhatsApp não possui destino interno e deve continuar sendo aceito sem o campo.

do $$
declare
  v_signature regprocedure := 'public.comunicacao_automacao_salvar_rascunho_core(uuid,integer,uuid,text,jsonb)'::regprocedure;
  v_definition text;
  v_old_optional text := 'or (item ? ''deepLink'' and item ->> ''deepLink'' is not null and coalesce(item ->> ''deepLink'', '''') !~ ''^/aluno(?:/|$)'')';
  v_old_global text := 'or coalesce(item ->> ''deepLink'', '''') !~ ''^/aluno(?:/|$)''';
  v_new text := 'or (item ->> ''channel'' in (''app_message'', ''push'') and coalesce(item ->> ''deepLink'', '''') !~ ''^/aluno(?:/|$)'')';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_old_optional in v_definition) > 0 then
    execute replace(v_definition, v_old_optional, v_new);
  elsif position(v_old_global in v_definition) > 0 then
    execute replace(v_definition, v_old_global, v_new);
  end if;
end;
$$;
