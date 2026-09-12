-- Executar por MCP após a migration. Eventos sintéticos são revertidos integralmente.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  actor_id uuid;
  class_id uuid;
  legacy_class_id uuid;
  request_id uuid := gen_random_uuid();
  payload jsonb;
  result jsonb;
  replay jsonb;
  page_two jsonb;
  item jsonb;
  event_id text;
  initial_events integer;
  financial_before text;
  financial_after text;
  i integer;
  page_offset integer := 0;
begin
  if has_function_privilege('anon', 'public.proesc_class_history_service(text,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.proesc_class_history_service(text,uuid,jsonb)', 'execute')
     or has_schema_privilege('authenticated', 'internal_proesc', 'usage')
     or has_table_privilege('authenticated', 'internal_proesc.class_history', 'select')
     or has_table_privilege('authenticated', 'internal_proesc.class_history_feed', 'select')
     or not has_function_privilege('service_role', 'public.proesc_class_history_service(text,uuid,jsonb)', 'execute') then
    raise exception 'Historico Proesc exposto ou servico sem acesso';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'internal_proesc.class_history'::regclass) then
    raise exception 'Historico sem RLS';
  end if;
  select u.id into actor_id
    from public.usuarios_sistema u left join public.perfis_acesso p on p.id = u.perfil_acesso_id
    where lower(u.status) in ('ativo', 'active') and lower(u.perfil) = 'gestor'
      and (case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
        then p.permissoes else u.permissoes end)->'allPolos' = 'true'::jsonb
      and (case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
        then p.permissoes else u.permissoes end)->'modules' @> '["configuracoes"]'::jsonb
      and coalesce(to_jsonb(u)->'polo_ids', 'null'::jsonb) in ('null'::jsonb, '[]'::jsonb)
      and btrim(coalesce(u.context, '')) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by u.id limit 1;
  select id into class_id from public.turmas where codigo <> 'ENF-T42-INT-MAT' order by id limit 1;
  if actor_id is null or class_id is null then
    raise exception 'Precondicao ausente: gestor global autorizado e turma de teste';
  end if;
  select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.id), '')) into financial_before
    from public.contas_receber c where c.turma_id = class_id;
  result := public.proesc_class_history_service('events', actor_id, jsonb_build_object('classId', class_id));
  initial_events := (result->>'totalEvents')::integer;
  payload := jsonb_build_object('requestId', request_id, 'classId', class_id,
    'operation', 'CONSULTA', 'status', 'CONCLUIDO', 'source', 'PROESC_API',
    'records', 19, 'summary', 'Conferência sintética sem importação.');

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.proesc_class_history_service('record', actor_id, payload);
    raise exception 'SERVICE_GUARD_FAILED';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.proesc_class_history_service('list', gen_random_uuid());
    raise exception 'ACTOR_GUARD_FAILED';
  exception when insufficient_privilege then null;
  end;

  result := public.proesc_class_history_service('record', actor_id, payload);
  event_id := result->>'id';
  replay := public.proesc_class_history_service('record', actor_id, payload);
  if replay is distinct from result or result->>'operation' <> 'CONSULTA'
     or result->>'status' <> 'CONCLUIDO' or result->>'source' <> 'PROESC_API' then
    raise exception 'Replay ou semantica consulta/importacao incorreto';
  end if;
  if (select count(*) from internal_proesc.class_history h where h.request_id = (payload->>'requestId')::uuid) <> 1 then
    raise exception 'Replay duplicou evento';
  end if;
  begin
    perform public.proesc_class_history_service('record', actor_id, payload || '{"records":20}');
    raise exception 'IMMUTABLE_PAYLOAD_FAILED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.proesc_class_history_service('record', gen_random_uuid(), payload);
    raise exception 'REPLAY_AUTHORIZATION_FAILED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.proesc_class_history_service('record', actor_id,
      payload || jsonb_build_object('requestId', gen_random_uuid(), 'source', 'LEGADO'));
    raise exception 'LEGACY_SOURCE_CONSTRAINT_FAILED';
  exception when check_violation then null;
  end;
  begin
    perform public.proesc_class_history_service('record', actor_id,
      payload || jsonb_build_object('requestId', gen_random_uuid(), 'unrecognized', 'blocked'));
    raise exception 'UNKNOWN_PAYLOAD_FAILED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.proesc_class_history_service('list', actor_id, '{"offset":-1}');
    raise exception 'OFFSET_GUARD_FAILED';
  exception when invalid_parameter_value then null;
  end;

  -- Mais de uma página: consulta repetida não deve somar registros como importações.
  for i in 1..21 loop
    perform public.proesc_class_history_service('record', actor_id,
      payload || jsonb_build_object('requestId', gen_random_uuid(), 'records', 3,
        'occurredAt', now() + make_interval(secs => i)));
  end loop;
  result := public.proesc_class_history_service('events', actor_id, jsonb_build_object('classId', class_id));
  page_two := public.proesc_class_history_service('events', actor_id,
    jsonb_build_object('classId', class_id, 'offset', 20));
  if (result->>'totalEvents')::integer <> initial_events + 22
     or jsonb_array_length(result->'events') <> 20 or jsonb_array_length(page_two->'events') < 2 then
    raise exception 'Contagem ou paginacao de eventos incorreta';
  end if;
  if exists (select 1 from jsonb_array_elements(result->'events') a
    join jsonb_array_elements(page_two->'events') b on a->>'id' = b->>'id') then
    raise exception 'Evento repetido entre paginas';
  end if;
  if result::text like '%request_payload%' or result::text like '%recorded_by%'
     or result::text like '%request_id%' then
    raise exception 'Metadados internos expostos';
  end if;
  loop
    result := public.proesc_class_history_service('list', actor_id, jsonb_build_object('offset', page_offset));
    select value into item from jsonb_array_elements(result->'classes') where value->>'classId' = class_id::text;
    exit when item is not null or page_offset + 20 >= (result->>'totalClasses')::integer;
    page_offset := page_offset + 20;
  end loop;
  if item is null or (item->>'eventsCount')::integer <> initial_events + 22
     or item->>'operation' <> 'CONSULTA' or item->>'source' <> 'PROESC_API'
     or (item->>'records')::integer <> 3 then
    raise exception 'Resumo por turma perdeu origem ou somou consultas repetidas';
  end if;

  -- A referência de legado, quando disponível, permanece sem data inventada.
  select t.id into legacy_class_id from public.turmas t where t.codigo = 'ENF-T42-INT-MAT';
  if exists (select 1 from internal_proesc.class_history_feed where id = 'legacy:' || legacy_class_id::text) then
    select to_jsonb(h) into item from internal_proesc.class_history_feed h
      where id = 'legacy:' || legacy_class_id::text;
    if item->>'source' <> 'LEGADO' or item->>'operation' <> 'IMPORTACAO_HISTORICO'
       or item->'occurred_at' <> 'null'::jsonb or (item->>'records')::integer <= 0 then
      raise exception 'Referencia legada rotulada como API ou data inventada';
    end if;
    perform public.proesc_class_history_service('record', actor_id,
      payload || jsonb_build_object('requestId', gen_random_uuid(), 'classId', legacy_class_id,
        'operation', 'IMPORTACAO_HISTORICO', 'source', 'LEGADO', 'records', (item->>'records')::integer,
        'summary', 'Registro sintético para conferir supressão da referência repetida.'));
    if exists (select 1 from internal_proesc.class_history_feed where id = 'legacy:' || legacy_class_id::text) then
      raise exception 'Referencia legada duplicou evento explicito';
    end if;
  end if;
  select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.id), '')) into financial_after
    from public.contas_receber c where c.turma_id = class_id;
  if financial_before <> financial_after then raise exception 'Historico alterou financeiro'; end if;
end;
$$;
rollback;
