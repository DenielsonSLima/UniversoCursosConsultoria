begin;

create function public.regularizar_grade_tecnica_historica_secure(
  p_request_id uuid,
  p_turma_id uuid,
  p_source_manifest_sha256 text,
  p_expected_curriculum_sha256 text,
  p_periodos jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_class public.turmas%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_existing internal_academic.historical_structure_requests%rowtype;
  v_snapshot jsonb;
  v_module jsonb;
  v_discipline jsonb;
  v_period uuid;
  v_expected jsonb;
  v_payload_sha256 text;
  v_curriculum_sha256 text;
  v_response jsonb;
  v_periods jsonb := '[]'::jsonb;
  v_discipline_count integer := 0;
begin
  -- Permission is checked before validation/replay; a known UUID is no bypass.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Operação histórica restrita ao serviço.';
  end if;
  if p_request_id is null or p_turma_id is null
    or p_source_manifest_sha256 is null or p_source_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_curriculum_sha256 is null or p_expected_curriculum_sha256 !~ '^[0-9a-f]{64}$'
    or p_periodos is distinct from '[]'::jsonb then
    raise exception using errcode = '22023', message =
      'Informe identificadores e hashes válidos. Esta regularização mantém períodos sem datas, em conferência.';
  end if;
  v_payload_sha256 := encode(extensions.digest(jsonb_build_object(
    'turmaId', p_turma_id, 'sourceManifestSha256', p_source_manifest_sha256,
    'curriculumSha256', p_expected_curriculum_sha256, 'periodos', p_periodos
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('historical_structure_request:' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('technical_turma:' || p_turma_id::text, 0));
  select t.* into v_class from public.turmas t where t.id = p_turma_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Turma não encontrada.';
  end if;
  select s.* into v_scope from internal_proesc.class_scopes s
  where s.turma_id = p_turma_id and s.batch_id is not null and s.phase = 'CONFIRMED'
    and s.polo_id = v_class.polo_id and s.class_code = v_class.codigo
    and s.financial_mode = 'INDIVIDUAL_REVIEW'
    and s.source_academic @> '{"verified":true,"status":"EM_ANDAMENTO","calendarState":"REVIEW"}'::jsonb
    and s.class_spec->>'courseId' = v_class.curso_id::text
  for share;
  if not found or v_class.status <> 'EM_ANDAMENTO' or v_class.data_previsao_termino is not null
    or not exists (select 1 from public.cursos c where c.id = v_class.curso_id and c.modalidade = 'TECNICO') then
    raise exception using errcode = '42501', message =
      'A turma exige origem histórica confirmada, curso técnico e calendário pendente.';
  end if;
  select r.* into v_existing from internal_academic.historical_structure_requests r
  where r.request_id = p_request_id for update;
  if found then
    if v_existing.payload_sha256 <> v_payload_sha256 or v_existing.turma_id <> p_turma_id then
      raise exception using errcode = '22023', message = 'A solicitação já existe com outro conteúdo.';
    end if;
    if v_existing.completed_at is null then
      raise exception using errcode = '55000', message = 'A solicitação histórica ainda não foi concluída.';
    end if;
    return v_existing.response || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.periodos_letivos p where p.turma_id = p_turma_id)
    or exists (select 1 from public.turmas_disciplinas d where d.turma_id = p_turma_id)
    or exists (select 1 from public.aulas_turma a where a.turma_id = p_turma_id)
    or exists (select 1 from public.planos_curso p where p.turma_id = p_turma_id)
    or exists (select 1 from public.diario_notas n where n.turma_id = p_turma_id)
    or exists (select 1 from public.diario_frequencia f where f.turma_id = p_turma_id)
    or exists (select 1 from internal_academic.historical_structure_requests r where r.turma_id = p_turma_id) then
    raise exception using errcode = '55000', message =
      'A turma já possui estrutura ou registros acadêmicos; a regularização não sobrescreve dados.';
  end if;
  -- Lock the existing curriculum records and verify the reviewed snapshot again
  -- after inserts. This RPC never edits curriculum, dates or class lifecycle.
  perform m.id from public.modulos m where m.curso_id = v_class.curso_id order by m.id for share;
  perform d.id from public.disciplinas d join public.modulos m on m.id = d.modulo_id
    where m.curso_id = v_class.curso_id order by d.id for share of d;
  v_snapshot := internal_academic.technical_curriculum_snapshot(v_class.curso_id);
  v_curriculum_sha256 := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  if v_curriculum_sha256 <> p_expected_curriculum_sha256 then
    raise exception using errcode = '40001', message = 'A grade mudou desde a conferência; revise a fonte canônica.';
  end if;
  if jsonb_array_length(v_snapshot) = 0 or exists (
    select 1 from jsonb_array_elements(v_snapshot) m where jsonb_array_length(m->'disciplinas') = 0
  ) then
    raise exception using errcode = '22023', message = 'A grade canônica deve conter módulos e disciplinas.';
  end if;
  insert into internal_academic.historical_structure_requests (
    request_id, turma_id, source_scope_id, source_manifest_sha256, curriculum_sha256,
    payload_sha256, curriculum_snapshot, transaction_id, backend_pid
  ) values (p_request_id, p_turma_id, v_scope.id, p_source_manifest_sha256, v_curriculum_sha256,
    v_payload_sha256, v_snapshot, pg_current_xact_id()::text, pg_backend_pid());

  for v_module in select value from jsonb_array_elements(v_snapshot) loop
    v_period := gen_random_uuid();
    v_expected := jsonb_build_object('id', v_period, 'turma_id', p_turma_id,
      'modulo_id', v_module->>'id', 'nome', v_module->>'nome', 'ordem', (v_module->>'ordem')::integer,
      'data_inicio', null, 'data_fim', null, 'status', 'PLANEJADO',
      'fechado_em', null, 'fechado_por', null, 'reaberto_em', null,
      'reaberto_por', null, 'motivo_reabertura', null);
    insert into internal_academic.historical_period_scopes (
      periodo_letivo_id, request_id, turma_id, modulo_id, expected_period
    ) values (v_period, p_request_id, p_turma_id, (v_module->>'id')::uuid, v_expected);
    perform internal_academic.authorize_transition('HISTORICAL_PERIOD_STRUCTURE', v_period, p_request_id::text);
    perform internal_academic.authorize_transition('HISTORICAL_PERIOD_DATES', v_period, p_request_id::text);
    insert into public.periodos_letivos (id, turma_id, modulo_id, nome, ordem, data_inicio, data_fim, status)
    values (v_period, p_turma_id, (v_module->>'id')::uuid, v_module->>'nome',
      (v_module->>'ordem')::integer, null, null, 'PLANEJADO');
    for v_discipline in select value from jsonb_array_elements(v_module->'disciplinas') loop
      perform internal_academic.authorize_transition('HISTORICAL_BINDING:' || p_turma_id::text,
        (v_discipline->>'id')::uuid, v_period::text);
      insert into public.turmas_disciplinas (turma_id, disciplina_id, periodo_letivo_id,
        concluida, professor_id, professor_nome)
      values (p_turma_id, (v_discipline->>'id')::uuid, v_period, false, null, null);
      v_discipline_count := v_discipline_count + 1;
    end loop;
    v_periods := v_periods || jsonb_build_array(jsonb_build_object('periodoLetivoId', v_period,
      'moduloId', v_module->>'id', 'calendarState', 'REVIEW', 'status', 'PLANEJADO'));
  end loop;
  if internal_academic.technical_curriculum_snapshot(v_class.curso_id) <> v_snapshot then
    raise exception using errcode = '40001', message = 'A grade mudou durante a regularização; operação revertida.';
  end if;
  if exists (select 1 from internal_academic.transition_authorizations a
    where a.transaction_id = pg_current_xact_id()::text and a.backend_pid = pg_backend_pid()
      and ((a.entity in ('HISTORICAL_PERIOD_STRUCTURE', 'HISTORICAL_PERIOD_DATES') and a.new_status = p_request_id::text)
        or a.entity = 'HISTORICAL_BINDING:' || p_turma_id::text)) then
    raise exception using errcode = '55000', message = 'Nem todas as autorizações históricas foram consumidas.';
  end if;
  v_response := jsonb_build_object('requestId', p_request_id, 'turmaId', p_turma_id,
    'curriculumSha256', v_curriculum_sha256, 'sourceManifestSha256', p_source_manifest_sha256,
    'calendarState', 'REVIEW', 'periodos', v_periods,
    'disciplinasCriadas', v_discipline_count, 'replayed', false);
  update internal_academic.historical_structure_requests
    set response = v_response, completed_at = now() where request_id = p_request_id;
  return v_response;
end;
$$;

revoke all on function public.regularizar_grade_tecnica_historica_secure(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.regularizar_grade_tecnica_historica_secure(uuid, uuid, text, text, jsonb)
  to service_role;
comment on function public.regularizar_grade_tecnica_historica_secure(uuid, uuid, text, text, jsonb) is
  'Recovers an empty confirmed imported technical curriculum only. p_periodos must be []; calendar remains REVIEW and planned. Does not import grades, lessons, attendance or financial data.';

commit;
