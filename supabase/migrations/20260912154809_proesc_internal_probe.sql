-- Probe pontual do runtime Edge. Não agenda sincronização ou altera financeiro.
begin;

do $$
begin
  perform pg_advisory_xact_lock(hashtextextended('proesc:internal-probe-secret', 0));
  if not exists (select 1 from vault.secrets where name = 'proesc_internal_probe_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'proesc_internal_probe_worker_secret',
      'Autorização privada do teste de conectividade Proesc no runtime Edge'
    );
  end if;
end;
$$;

create function public.proesc_internal_probe_service(
  p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
  v_expected bytea;
  v_received bytea;
  v_difference integer := 0;
  v_actor_id uuid;
  v_actor jsonb;
  v_permissions jsonb;
  v_request_id bigint;
  i integer;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'
       is distinct from 'service_role' then
    raise exception 'Acesso interno Proesc nao autorizado.' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or coalesce(p_action, '') not in ('authorize', 'enqueue') then
    raise exception 'Teste interno Proesc invalido.' using errcode = '22023';
  end if;
  if (p_action = 'enqueue' and p_payload <> '{}'::jsonb)
     or (p_action = 'authorize' and exists (
       select 1 from jsonb_object_keys(p_payload) as fields(key) where key <> 'key')) then
    raise exception 'Parametros do teste interno invalidos.' using errcode = '22023';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name = 'proesc_internal_probe_worker_secret';
  if v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'Teste interno Proesc indisponivel.' using errcode = '42501';
  end if;

  if p_action = 'authorize' then
    -- Comparação dos 32 bytes SHA-256 sem saída antecipada dependente do segredo.
    v_expected := extensions.digest(v_secret, 'sha256');
    v_received := extensions.digest(coalesce(p_payload->>'key', ''), 'sha256');
    for i in 0..31 loop
      v_difference := v_difference | (get_byte(v_expected, i) # get_byte(v_received, i));
    end loop;
    if v_difference <> 0 then
      raise exception 'Acesso interno Proesc nao autorizado.' using errcode = '42501';
    end if;
  end if;

  select c.updated_by into v_actor_id from internal_proesc.connection c where c.id;
  select to_jsonb(u), case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
      then p.permissoes else u.permissoes end
    into v_actor, v_permissions
    from public.usuarios_sistema u
    left join public.perfis_acesso p on p.id = u.perfil_acesso_id
    where u.id = v_actor_id and lower(u.status) in ('ativo', 'active') and lower(u.perfil) = 'gestor';
  if v_actor is null or v_permissions->'allPolos' is distinct from 'true'::jsonb
     or not coalesce(v_permissions->'modules' @> '["configuracoes"]'::jsonb, false)
     or (jsonb_typeof(v_actor->'polo_ids') = 'array' and v_actor->'polo_ids' <> '[]'::jsonb)
     or btrim(coalesce(v_actor->>'context', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Gestor global ativo autorizado em Configuracoes obrigatorio.' using errcode = '42501';
  end if;

  if p_action = 'authorize' then
    return jsonb_build_object('actorId', v_actor_id);
  end if;
  -- Destino, ação e cabeçalhos fixos: nenhum chamador escolhe URL ou payload remoto.
  v_request_id := net.http_post(
    url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-api',
    body := '{"action":"internal_probe"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Proesc-Worker-Secret', v_secret),
    timeout_milliseconds := 30000
  );
  return jsonb_build_object('requestId', v_request_id);
end;
$$;
revoke all on function public.proesc_internal_probe_service(text, jsonb) from public, anon, authenticated;
grant execute on function public.proesc_internal_probe_service(text, jsonb) to service_role;
comment on function public.proesc_internal_probe_service(text, jsonb) is
  'Probe interno service_role com segredo dedicado no Vault. authorize retorna somente ator; enqueue retorna somente requestId. Sem cron ou alteração financeira.';

commit;
