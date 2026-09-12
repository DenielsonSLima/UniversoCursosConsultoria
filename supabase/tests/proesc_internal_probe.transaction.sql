-- Executar por MCP. Nunca chama enqueue nem realiza requisição externa.
-- A chave permanece em variável SQL; nenhuma credencial integra a saída.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v_key text;
  v_actor_id uuid;
  v_unauthorized_actor_id uuid;
  v_fixture_created boolean := false;
  v_result jsonb;
  v_actor_before jsonb;
  v_connection_before jsonb;
begin
  if has_function_privilege('anon', 'public.proesc_internal_probe_service(text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.proesc_internal_probe_service(text,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.proesc_internal_probe_service(text,jsonb)', 'execute') then
    raise exception 'Privilegios do probe interno incorretos';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets
    where name = 'proesc_internal_probe_worker_secret';
  select c.updated_by, to_jsonb(c) into v_actor_id, v_connection_before
    from internal_proesc.connection c where c.id;
  if v_key is null or length(v_key) <> 64 or v_actor_id is null then
    raise exception 'Precondicao do teste interno ausente';
  end if;
  select to_jsonb(u) into v_actor_before from public.usuarios_sistema u where u.id = v_actor_id;
  select u.id into v_unauthorized_actor_id from public.usuarios_sistema u
    where coalesce(lower(u.perfil), '') <> 'gestor'
       or coalesce(lower(u.status), '') not in ('ativo', 'active')
    order by u.id limit 1;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key));
    raise exception 'SERVICE_GUARD_FAILED';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.proesc_internal_probe_service('authorize', '{"key":"synthetic-invalid-key"}');
    raise exception 'WORKER_SECRET_GUARD_FAILED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.proesc_internal_probe_service('authorize', '{}');
    raise exception 'MISSING_SECRET_GUARD_FAILED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key, 'url', 'invalid'));
    raise exception 'UNKNOWN_PAYLOAD_GUARD_FAILED';
  exception when invalid_parameter_value then null;
  end;
  v_result := public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key));
  if v_result is distinct from jsonb_build_object('actorId', v_actor_id) then
    raise exception 'Autorizacao retornou dados alem do ator';
  end if;

  -- Subtransação: a conexão ausente precisa negar autorização; restauração automática.
  begin
    delete from internal_proesc.connection where id;
    begin
      perform public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key));
      raise exception 'CONNECTION_ACTOR_GUARD_FAILED';
    exception when insufficient_privilege then null;
    end;
    raise exception 'ROLLBACK_CONNECTION_FIXTURE';
  exception when raise_exception then
    if sqlerrm <> 'ROLLBACK_CONNECTION_FIXTURE' then raise; end if;
  end;

  -- Nunca altera usuário real. Se necessário, cria fixture sem Auth na subtransação.
  begin
    if v_unauthorized_actor_id is null then
      v_unauthorized_actor_id := gen_random_uuid();
      insert into public.usuarios_sistema (id, nome, email, perfil, status, auth_user_id)
      values (v_unauthorized_actor_id, 'Fixture',
        'proesc-probe-' || v_unauthorized_actor_id::text || '@fixture.example.test',
        'financeiro', 'Inativo', null);
      if exists (select 1 from public.usuarios_sistema
        where id = v_unauthorized_actor_id and auth_user_id is not null) then
        raise exception 'FIXTURE_MUST_NOT_HAVE_AUTH';
      end if;
      v_fixture_created := true;
    end if;
    update internal_proesc.connection set updated_by = v_unauthorized_actor_id where id;
    begin
      perform public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key));
      raise exception 'ACTIVE_MANAGER_GUARD_FAILED';
    exception when insufficient_privilege then null;
    end;
    raise exception 'ROLLBACK_CONNECTION_ACTOR_FIXTURE';
  exception when raise_exception then
    if sqlerrm <> 'ROLLBACK_CONNECTION_ACTOR_FIXTURE' then raise; end if;
  end;
  if v_fixture_created and exists (select 1 from public.usuarios_sistema where id = v_unauthorized_actor_id) then
    raise exception 'Fixture sintetica nao foi revertida';
  end if;
  if v_actor_before is distinct from (select to_jsonb(u) from public.usuarios_sistema u where u.id = v_actor_id)
     or v_connection_before is distinct from (select to_jsonb(c) from internal_proesc.connection c where c.id) then
    raise exception 'Fixture alterou estado persistente';
  end if;
  v_result := public.proesc_internal_probe_service('authorize', jsonb_build_object('key', v_key));
  if v_result is distinct from jsonb_build_object('actorId', v_actor_id) then
    raise exception 'Autorizacao nao recuperada apos fixtures';
  end if;
end;
$$;
rollback;
