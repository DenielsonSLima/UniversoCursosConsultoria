-- Executar via MCP após aplicar a migration. Todos os dados sintéticos são revertidos.
begin;
set local statement_timeout = '15s';

do $$
declare
  v_actor uuid;
  v_original jsonb;
  v_original_token_hash bytea;
  v_result jsonb;
  v_credential jsonb;
  v_before_revision text;
  v_waf constant text := '00000000-0000-0000-0000-000000000001';
begin
  select c.updated_by, to_jsonb(c), extensions.digest(s.decrypted_secret, 'sha256')
    into v_actor, v_original, v_original_token_hash
    from internal_proesc.connection c join vault.decrypted_secrets s on s.id = c.secret_id where c.id;
  if v_actor is null then raise exception 'Fixture exige conexao V1 existente com gestor configurador.'; end if;

  assert not has_function_privilege('anon', 'public.proesc_connection_service(text,uuid,jsonb)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.proesc_connection_service(text,uuid,jsonb)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.proesc_connection_service(text,uuid,jsonb)', 'EXECUTE');
  assert not has_table_privilege('service_role', 'internal_proesc.connection_v2', 'SELECT');
  assert (select relrowsecurity from pg_class where oid = 'internal_proesc.connection_v2'::regclass);

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.proesc_connection_service('status', v_actor, '{"version":"v2"}');
    raise exception 'Authenticated acessou RPC de servico.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.proesc_connection_service('status', null, '{"version":"v2"}');
    raise exception 'Ator ausente foi aceito.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.proesc_connection_service('save', v_actor,
      '{"version":"v1","token":"synthetic-v2-token"}');
    raise exception 'V1 aceitou token V2.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.proesc_connection_service('save', v_actor,
      jsonb_build_object('version', 'v2', 'token', repeat('a', 32)));
    raise exception 'V2 aceitou chave V1.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.proesc_connection_service('status', v_actor, '{"version":"v3"}');
    raise exception 'Versao desconhecida aceita.';
  exception when invalid_parameter_value then null;
  end;

  -- Garante o cenário sem WAF mesmo quando já existe uma conexão V2 real.
  perform public.proesc_connection_service('remove', v_actor, '{"version":"v2"}');
  perform public.proesc_connection_service('save', v_actor,
    '{"version":"v2","token":"synthetic-v2-token"}');
  v_result := public.proesc_connection_service('status', v_actor, '{"version":"v2"}');
  assert v_result->'configured' = 'true'::jsonb and v_result->'wafConfigured' = 'false'::jsonb;
  assert not (v_result ?| array['token', 'wafHeader', 'revision', 'secret_id']);
  v_credential := public.proesc_connection_service('credential', v_actor, '{"version":"v2"}');
  assert v_credential->>'token' = 'synthetic-v2-token' and v_credential->>'wafHeader' is null;
  v_before_revision := v_credential->>'revision';

  perform public.proesc_connection_service('save', v_actor,
    jsonb_build_object('version', 'v2', 'token', 'synthetic-v2-token', 'wafHeader', v_waf));
  v_credential := public.proesc_connection_service('credential', v_actor, '{"version":"v2"}');
  assert v_credential->>'wafHeader' = v_waf and v_credential->>'revision' <> v_before_revision;
  perform public.proesc_connection_service('save', v_actor,
    '{"version":"v2","token":"synthetic-v2-rotated"}');
  v_credential := public.proesc_connection_service('credential', v_actor, '{"version":"v2"}');
  assert v_credential->>'wafHeader' = v_waf and v_credential->>'token' = 'synthetic-v2-rotated';

  perform public.proesc_connection_service('remove', v_actor, '{"version":"v2"}');
  v_result := public.proesc_connection_service('status', v_actor, '{"version":"v2"}');
  assert v_result->'configured' = 'false'::jsonb and v_result->'wafConfigured' = 'false'::jsonb;
  assert not exists(select 1 from vault.secrets where name in ('universo_proesc_v2_token', 'universo_proesc_v2_waf'));
  assert (select to_jsonb(c) from internal_proesc.connection c where c.id) = v_original;
  assert (select extensions.digest(s.decrypted_secret, 'sha256') from internal_proesc.connection c
    join vault.decrypted_secrets s on s.id = c.secret_id where c.id) = v_original_token_hash;
end;
$$;

rollback;
