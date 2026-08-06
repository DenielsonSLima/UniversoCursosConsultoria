-- A função já existente é extensa e pode receber correções independentes.
-- Este patch altera apenas o guard lógico, preservando integralmente a versão
-- instalada e falhando se a assinatura esperada não estiver presente uma vez.
begin;

do $migration$
declare
  v_definition text;
  v_patched_definition text;
  v_bad_guard constant text :=
    'if v_origin <> ''cadastro_publico_ead'' and v_tipo <> ''Aluno'' then';
  v_exact_guard constant text :=
    'if v_origin <> ''cadastro_publico_ead'' or v_tipo <> ''Aluno'' then';
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
  into v_definition
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'sync_public_aluno_auth_profile'
    and proc.pronargs = 0;

  if v_definition is null then
    raise exception 'Função sync_public_aluno_auth_profile não encontrada.';
  end if;

  v_patched_definition := replace(v_definition, v_bad_guard, v_exact_guard);
  if v_patched_definition = v_definition
     or length(v_definition) - length(replace(v_definition, v_bad_guard, ''))
       <> length(v_bad_guard)
  then
    raise exception 'Guard lógico inesperado em sync_public_aluno_auth_profile.';
  end if;

  execute v_patched_definition;
end;
$migration$;

comment on function public.sync_public_aluno_auth_profile() is
  'Sincroniza perfil somente no cadastro público EAD de aluno; não intercepta convites do gestor.';

revoke all on function public.sync_public_aluno_auth_profile()
  from public, anon, authenticated;
grant execute on function public.sync_public_aluno_auth_profile()
  to service_role;

commit;
