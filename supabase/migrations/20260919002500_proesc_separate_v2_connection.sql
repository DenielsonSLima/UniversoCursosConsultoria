begin;

-- A conexão original permanece exclusivamente V1 para os workers existentes.
-- Segredos reais entram pelo serviço autorizado; nunca pelo arquivo da migration.
create table internal_proesc.connection_v2 (
  id boolean primary key default true check (id),
  token_secret_id uuid not null references vault.secrets(id),
  waf_secret_id uuid references vault.secrets(id),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.usuarios_sistema(id)
);
alter table internal_proesc.connection_v2 enable row level security;
revoke all on internal_proesc.connection_v2 from public, anon, authenticated, service_role;

create function public.proesc_connection_service(
  p_action text, p_actor_id uuid, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_version text;
  v_actor jsonb;
  v_permissions jsonb;
  v_connection internal_proesc.connection_v2%rowtype;
  v_token text;
  v_waf text;
  v_token_id uuid;
  v_waf_id uuid;
  v_result jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'
      is distinct from 'service_role' then
    raise exception 'Acesso Proesc nao autorizado.' using errcode = '42501';
  end if;
  select to_jsonb(u), case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
      then p.permissoes else u.permissoes end
    into v_actor, v_permissions
    from public.usuarios_sistema u left join public.perfis_acesso p on p.id = u.perfil_acesso_id
    where u.id = p_actor_id and lower(u.status) in ('ativo', 'active') and lower(u.perfil) = 'gestor';
  if v_actor is null or v_permissions->'allPolos' is distinct from 'true'::jsonb
    or not coalesce(v_permissions->'modules' @> '["configuracoes"]'::jsonb, false)
    or (jsonb_typeof(v_actor->'polo_ids') = 'array' and v_actor->'polo_ids' <> '[]'::jsonb)
    or btrim(coalesce(v_actor->>'context', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Gestor global autorizado em Configuracoes obrigatorio.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_action is null
    or p_action not in ('status', 'credential', 'save', 'remove') then
    raise exception 'Operacao de conexao invalida.' using errcode = '22023';
  end if;
  v_version := p_payload->>'version';
  if v_version is null or v_version not in ('v1', 'v2')
    or exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('version', 'token', 'wafHeader'))
    or (p_action <> 'save' and p_payload <> jsonb_build_object('version', v_version)) then
    raise exception 'Parametros de conexao invalidos.' using errcode = '22023';
  end if;
  if p_action = 'save' then
    if jsonb_typeof(p_payload->'token') is distinct from 'string' then
      raise exception 'Token Proesc invalido.' using errcode = '22023';
    end if;
    v_token := btrim(p_payload->>'token');
    if length(v_token) < 12 or length(v_token) > 8192 or v_token ~ '[[:space:][:cntrl:]]'
      or (v_version = 'v1') is distinct from (v_token ~ '^[0-9a-fA-F]{32}$') then
      raise exception 'Token incompativel com a versao selecionada.' using errcode = '22023';
    end if;
    if p_payload ? 'wafHeader' then
      if v_version <> 'v2' or jsonb_typeof(p_payload->'wafHeader') is distinct from 'string' then
        raise exception 'Liberacao WAF invalida.' using errcode = '22023';
      end if;
      v_waf := nullif(btrim(p_payload->>'wafHeader'), '');
      if v_waf is not null and v_waf !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Liberacao WAF invalida.' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_version = 'v1' then
    v_result := public.proesc_workspace_service(
      case p_action when 'credential' then 'token' when 'save' then 'save_token'
        when 'remove' then 'remove_token' else 'status' end,
      p_actor_id, case when p_action = 'save' then jsonb_build_object('token', v_token) else '{}'::jsonb end);
    if p_action = 'credential' then
      if coalesce(v_result->>'token', '') !~ '^[0-9a-fA-F]{32}$' then
        raise exception 'Configure a chave geral na conexao V1.' using errcode = '22023';
      end if;
      return jsonb_build_object('version', 'v1', 'token', v_result->>'token', 'revision', v_result->>'revision');
    end if;
    return jsonb_build_object('version', 'v1', 'configured', coalesce((v_result->>'configured')::boolean, false),
      'updatedAt', v_result->'updatedAt', 'wafConfigured', false);
  end if;

  if p_action in ('save', 'remove') then
    perform pg_advisory_xact_lock(hashtextextended('proesc:connection:v2', 0));
  end if;
  select * into v_connection from internal_proesc.connection_v2 where id;
  if p_action = 'status' then
    return jsonb_build_object('version', 'v2', 'configured', v_connection.token_secret_id is not null,
      'updatedAt', v_connection.updated_at, 'wafConfigured', v_connection.waf_secret_id is not null);
  elsif p_action = 'credential' then
    if v_connection.token_secret_id is null then raise exception 'Configure a conexao Proesc V2.'; end if;
    select decrypted_secret into v_token from vault.decrypted_secrets where id = v_connection.token_secret_id;
    select decrypted_secret into v_waf from vault.decrypted_secrets where id = v_connection.waf_secret_id;
    return jsonb_build_object('version', 'v2', 'token', v_token, 'revision', v_connection.revision,
      'wafHeader', v_waf);
  elsif p_action = 'remove' then
    delete from internal_proesc.connection_v2 where id;
    delete from vault.secrets where id in (v_connection.token_secret_id, v_connection.waf_secret_id);
    return jsonb_build_object('version', 'v2', 'configured', false);
  end if;

  v_token_id := v_connection.token_secret_id;
  v_waf_id := v_connection.waf_secret_id;
  if v_token_id is null then
    v_token_id := vault.create_secret(v_token, 'universo_proesc_v2_token', 'Proesc V2 Bearer');
  else
    perform vault.update_secret(v_token_id, v_token);
  end if;
  if v_waf is not null then
    if v_waf_id is null then
      v_waf_id := vault.create_secret(v_waf, 'universo_proesc_v2_waf', 'Proesc V2 liberacao do suporte');
    else
      perform vault.update_secret(v_waf_id, v_waf);
    end if;
  end if;
  insert into internal_proesc.connection_v2(token_secret_id, waf_secret_id, updated_by)
    values (v_token_id, v_waf_id, p_actor_id)
    on conflict (id) do update set token_secret_id = excluded.token_secret_id,
      waf_secret_id = excluded.waf_secret_id, revision = gen_random_uuid(), updated_at = now(),
      updated_by = excluded.updated_by;
  return jsonb_build_object('version', 'v2', 'configured', true);
end;
$$;
revoke all on function public.proesc_connection_service(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.proesc_connection_service(text, uuid, jsonb) to service_role;

commit;
