-- Executar por MCP após a migration. Dados de teste e token fictício são revertidos.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  actor_id uuid;
  result jsonb;
  run jsonb;
  revision text;
  payload jsonb;
  before_hash text;
  after_hash text;
begin
  if has_function_privilege('anon', 'public.proesc_workspace_service(text,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.proesc_workspace_service(text,uuid,jsonb)', 'execute')
     or has_schema_privilege('authenticated', 'internal_proesc', 'usage') then
    raise exception 'Proesc exposto fora do serviço autorizado';
  end if;
  select id into actor_id from public.usuarios_sistema
    where lower(status) in ('ativo', 'active') and lower(perfil) = 'gestor' limit 1;
  if actor_id is null then raise exception 'Gestor de teste não encontrado'; end if;
  select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.id), '')) into before_hash
    from public.contas_receber c where c.turma_id in (
      select id from public.turmas where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'));
  perform public.proesc_workspace_service('save_token', actor_id, '{"token":"synthetic-transaction-only"}');
  result := public.proesc_workspace_service('status', actor_id);
  if result->>'configured' <> 'true' or result::text like '%synthetic-transaction-only%' then
    raise exception 'Contrato de credencial inválido';
  end if;
  result := public.proesc_workspace_service('history_t42', actor_id);
  if jsonb_array_length(result->'students') = 0 then raise exception 'Histórico T42 não retornado'; end if;
  revision := public.proesc_workspace_service('token', actor_id)->>'revision';
  run := public.proesc_workspace_service('start', actor_id,
    '{"resource":"invoices","filters":{"unitId":"1","start":"2025-01","end":"2025-01"},"cursor":{"year":2025,"month":1,"page":1}}');
  payload := jsonb_build_object('id', run->>'id', 'revision', revision, 'expectedPages', 0,
    'cursor', run->'cursor', 'result', jsonb_build_object('records', '[]'::jsonb), 'nextCursor', null);
  result := public.proesc_workspace_service('commit_page', actor_id, payload);
  if result->>'status' <> 'complete' or result->>'pages' <> '1' then
    raise exception 'Página não concluída corretamente';
  end if;
  begin
    perform public.proesc_workspace_service('commit_page', actor_id, payload);
    raise exception 'CAS_TEST_FAILED';
  exception when raise_exception then
    if sqlerrm = 'CAS_TEST_FAILED' then raise; end if;
  end;
  perform public.proesc_workspace_service('save_token', actor_id, '{"token":"synthetic-rotated-only"}');
  begin
    perform public.proesc_workspace_service('context', actor_id, jsonb_build_object('id', run->>'id'));
    raise exception 'REVISION_TEST_FAILED';
  exception when raise_exception then
    if sqlerrm = 'REVISION_TEST_FAILED' then raise; end if;
  end;
  -- Páginas antigas permanecem acessíveis para conferência após rotação.
  result := public.proesc_workspace_service('page', actor_id, jsonb_build_object('id', run->>'id', 'position', 1));
  if result->'page' is null then raise exception 'Histórico perdeu acesso'; end if;
  perform public.proesc_workspace_service('remove_token', actor_id);
  result := public.proesc_workspace_service('status', actor_id);
  if result->>'configured' <> 'false' then raise exception 'Remoção não confirmada'; end if;
  select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.id), '')) into after_hash
    from public.contas_receber c where c.turma_id in (
      select id from public.turmas where codigo in ('ENF-T42-INT-MAT', '2026.1-RAD-INT-JAP'));
  if before_hash <> after_hash then raise exception 'Financeiro alterado pela consulta'; end if;
end;
$$;
rollback;
