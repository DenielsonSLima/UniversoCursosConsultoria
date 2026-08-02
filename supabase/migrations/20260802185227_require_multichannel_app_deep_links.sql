-- Destinos internos são obrigatórios para mensagens no app e push.
-- CHECK considera NULL como válido, portanto a nulidade precisa ser negada
-- explicitamente tanto na tabela quanto nas duas camadas da RPC.

alter table public.comunicacao_automacao_canais
  drop constraint if exists comunicacao_automacao_canais_app_required_check;
alter table public.comunicacao_automacao_canais
  add constraint comunicacao_automacao_canais_app_required_check
  check (
    canal = 'whatsapp'
    or (
      nullif(btrim(titulo_template), '') is not null
      and deep_link is not null
      and deep_link ~ '^/aluno(?:/|$)'
    )
  ) not valid;
alter table public.comunicacao_automacao_canais
  validate constraint comunicacao_automacao_canais_app_required_check;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text := 'item ->> ''deepLink'' !~ ''^/aluno(?:/|$)''';
  v_new text := 'coalesce(item ->> ''deepLink'', '''') !~ ''^/aluno(?:/|$)''';
begin
  foreach v_signature in array array[
    'public.comunicacao_automacao_salvar_rascunho(uuid,integer,uuid,text,jsonb)'::regprocedure,
    'public.comunicacao_automacao_salvar_rascunho_core(uuid,integer,uuid,text,jsonb)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position(v_old in v_definition) > 0 then
      execute replace(v_definition, v_old, v_new);
    elsif position(v_new in v_definition) = 0 then
      raise exception 'Validação de deepLink não encontrada em %.', v_signature;
    end if;
  end loop;
end;
$$;
