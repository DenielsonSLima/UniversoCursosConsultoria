-- Validação pós-migration. Nenhuma fixture, impersonação, cobrança ou mutação.
begin read only;

do $test$
declare
  v_function regprocedure := to_regprocedure(
    'public.list_receivable_renegotiation_candidate_groups_v2_secure(uuid,text,integer,integer,date,text,uuid)'
  );
  v_config text[];
  v_security_definer boolean;
  v_definition text;
begin
  assert v_function is not null, 'RPC v2 ausente';
  select proconfig, prosecdef, pg_get_functiondef(oid)
  into v_config, v_security_definer, v_definition
  from pg_proc where oid = v_function;
  assert v_security_definer;
  assert 'search_path=""' = any(v_config), 'search_path deve ser vazio';
  assert has_function_privilege('authenticated', v_function, 'EXECUTE');
  assert has_function_privilege('service_role', v_function, 'EXECUTE');
  assert not has_function_privilege('anon', v_function, 'EXECUTE');
  assert not exists (
    select 1 from pg_proc proc cross join lateral aclexplode(proc.proacl) acl
    where proc.oid = v_function and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC não pode executar';
  assert position('assert_receivable_renegotiation_scope(p_polo_id)' in v_definition) > 0;
  assert position('receivable_renegotiation_eligibility(' in v_definition) = 0;
  assert position('receivable_renegotiation_source_item(' in v_definition) = 0;
  assert to_regprocedure(
    'public.list_receivable_renegotiation_candidate_groups_secure(uuid,text,integer,integer,date)'
  ) is not null, 'Contrato v1 deve permanecer disponível';
end;
$test$;

-- Identidade ausente deve falhar antes da leitura, inclusive com grant de RPC.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.list_receivable_renegotiation_candidate_groups_v2_secure(
      null, null, 1, 20, null, null, null
    );
    raise exception 'Identidade ausente acessou lista';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

select jsonb_build_object(
  'status', 'PASS', 'rpcVersion', 2,
  'checks', jsonb_build_array('catalog', 'grants', 'scope-guard', 'no-N+1', 'missing-identity'),
  'businessDataWritten', false, 'bankCalls', false,
  'transactionReadOnly', current_setting('transaction_read_only')
) as release_validation;
rollback;
