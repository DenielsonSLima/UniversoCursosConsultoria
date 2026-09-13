-- Rehearse the complete imported diary using existing sources; no PII fixtures.
begin;
set local statement_timeout = '90s';
set local lock_timeout = '5s';

create function pg_temp.diario_unchanged_snapshot()
returns jsonb language sql as $$
  select jsonb_build_object(
    'sources',(select md5(string_agg(to_jsonb(i)::text,'|' order by i.id))
      from internal_academic.diario_importacoes i),
    'sourceLessons',(select md5(string_agg(to_jsonb(a)::text,'|' order by a.id))
      from internal_academic.diario_aulas_importadas a),
    'sourceResults',(select md5(string_agg(to_jsonb(r)::text,'|' order by r.id))
      from internal_academic.diario_resultados_importados r),
    'sourceAttendance',(select md5(string_agg(to_jsonb(f)::text,'|' order by f.resultado_id,f.aula_id))
      from internal_academic.diario_frequencias_importadas f),
    'enrollments',(select md5(string_agg(to_jsonb(m)::text,'|' order by m.id))
      from public.matriculas m where m.turma_id in
        (select turma_id from internal_academic.diario_importacoes)),
    'charges',(select md5(string_agg(to_jsonb(c)::text,'' order by c.id))
      from public.contas_receber c where c.turma_id in
        (select turma_id from internal_academic.diario_importacoes)),
    'periods',(select md5(string_agg(to_jsonb(p)::text,'|' order by p.id))
      from public.periodos_letivos p where p.turma_id in
        (select turma_id from internal_academic.diario_importacoes))
  );
$$;

do $$
declare
  v_source internal_academic.diario_importacoes;
  v_preview jsonb;
  v_response jsonb;
  v_detail jsonb;
  v_card jsonb;
  v_grouped jsonb;
  v_before jsonb;
  v_request uuid;
  v_denied boolean;
  v_sources integer := 0;
  v_lessons integer := 0;
  v_notes integer := 0;
  v_attendance integer := 0;
  v_expected_notes integer;
  v_expected_attendance integer;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_before:=pg_temp.diario_unchanged_snapshot();
  for v_source in select * from internal_academic.diario_importacoes order by id loop
    v_preview:=public.preview_aulas_diario_importado_secure(v_source.id);
    if v_preview is distinct from public.preview_aulas_diario_importado_secure(v_source.id) then
      raise exception 'Preview is not deterministic';
    end if;
    select request_id into v_request from internal_academic.diario_aulas_materializacao_requests
      where importacao_id=v_source.id;
    v_request:=coalesce(v_request,gen_random_uuid());
    v_denied:=false;
    begin
      perform public.materializar_diario_operacional_secure(
        v_request,v_source.id,v_preview->>'previewSha256',repeat('0',64));
    exception when check_violation then v_denied:=true; end;
    if not v_denied then raise exception 'Wrong source hash was accepted'; end if;
    v_denied:=false;
    begin
      perform public.materializar_diario_operacional_secure(
        v_request,v_source.id,repeat('0',64),v_source.payload_sha256);
    exception when check_violation then v_denied:=true; end;
    if not v_denied then raise exception 'Wrong preview hash was accepted'; end if;

    v_response:=public.materializar_diario_operacional_secure(
      v_request,v_source.id,v_preview->>'previewSha256',v_source.payload_sha256);
    select count(*) into v_expected_notes from internal_academic.diario_resultados_importados
      where importacao_id=v_source.id and ativo;
    select count(*) into v_expected_attendance from internal_academic.diario_frequencias_importadas f
      join internal_academic.diario_resultados_importados r on r.id=f.resultado_id and r.ativo
      where f.importacao_id=v_source.id;
    if v_response->>'status'<>'MATERIALIZADO'
      or (v_response#>>'{records,notes}')::integer<>v_expected_notes
      or (v_response#>>'{records,attendance}')::integer<>v_expected_attendance
      or not exists(select 1 from internal_academic.diario_materializacoes m
        where m.importacao_id=v_source.id and m.request_id=v_request
          and m.payload_sha256=v_source.payload_sha256) then
      raise exception 'Completion marker or counts differ from source';
    end if;
    if (select sum(a.carga_horaria) from public.aulas_turma a
      join internal_academic.diario_aulas_materializadas m on m.aula_id=a.id
      where m.importacao_id=v_source.id)<>(v_preview#>>'{plano,cargaOficialTP}')::numeric then
      raise exception 'Official theory/practice workload is incomplete';
    end if;
    if exists(select 1 from internal_academic.diario_aulas_materializadas m
      join internal_academic.diario_aulas_importadas h on h.id=m.aula_historica_id
      join public.aulas_turma a on a.id=m.aula_id
      where m.importacao_id=v_source.id and (a.data_aula is distinct from (h.fonte#>>'{date,value}')::date
        or a.titulo is distinct from h.conteudo or a.sessao<>'U'
        or a.hora_inicio is not null or a.hora_fim is not null)) then
      raise exception 'Documentary encounter was changed';
    end if;
    if exists(select 1 from internal_academic.diario_resultados_importados h
      left join public.diario_notas n on n.origem_resultado_historico_id=h.id
      left join public.get_diario_resultados(v_source.turma_id,v_source.disciplina_id) r
        on r.aluno_id=h.aluno_id
      where h.importacao_id=v_source.id and h.ativo and (
        n.aluno_id is null or r.aluno_id is null
        or r.media_parcial is distinct from n.media_parcial_documental
        or r.media_final is distinct from n.media_final_documental
        or r.nota_rec is distinct from n.nota_rec
        or r.frequencia_percent is distinct from internal_academic.diario_documentary_number(
          h.fonte#>'{reportedResults,frequency}',100))) then
      raise exception 'Canonical results lost documentary means or frequency';
    end if;
    if exists(select aluno_id from public.get_diario_resultados(v_source.turma_id,v_source.disciplina_id)
      group by aluno_id having count(*)>1) then
      raise exception 'Duplicate student result after materialization';
    end if;
    v_detail:=public.get_diario_historico_importado(v_source.turma_id,v_source.disciplina_id);
    if (v_detail->>'readOnly')::boolean
      or v_detail#>>'{materialization,status}'<>'MATERIALIZADO'
      or exists(select 1 from jsonb_array_elements(v_detail->'lessons') l
        where l->>'operationalLessonId' is null)
      or jsonb_array_length(v_detail->'students')<>v_expected_notes then
      raise exception 'Diary detail did not switch to the materialized contract';
    end if;
    select c into strict v_card from jsonb_array_elements(
      public.get_diarios_turma_com_historico(v_source.turma_id)) c
      where c->>'disciplina_id'=v_source.disciplina_id::text;
    if v_card#>>'{historico,materialization,status}'<>'MATERIALIZADO'
      or (v_card->>'horas_realizadas')::numeric<>(v_preview#>>'{plano,cargaOficialTP}')::numeric
      or (v_card->>'aulas_count')::integer<>(v_preview#>>'{plano,quantidadeAulas}')::integer then
      raise exception 'Operational card did not reflect canonical workload and lessons';
    end if;
    v_grouped:=public.get_aulas_diario_agrupadas(v_source.turma_id,v_source.disciplina_id);
    if jsonb_array_length(v_grouped)<>(v_preview#>>'{plano,quantidadeAulas}')::integer
      or (select sum((x->>'cargaHoraria')::numeric) from jsonb_array_elements(v_grouped) x)
        <>(v_preview#>>'{plano,cargaOficialTP}')::numeric then
      raise exception 'Grouped getter changed the canonical workload';
    end if;
    v_response:=public.materializar_diario_operacional_secure(
      v_request,v_source.id,v_preview->>'previewSha256',v_source.payload_sha256);
    if not (v_response#>>'{lessons,replay}')::boolean
      or not (v_response#>>'{records,replay}')::boolean
      or (v_response#>>'{records,inserted}')::integer<>0 then
      raise exception 'Atomic replay inserted or altered data';
    end if;
    v_sources:=v_sources+1;
    v_lessons:=v_lessons+(v_response#>>'{lessons,aulasMaterializadas}')::integer;
    v_notes:=v_notes+v_expected_notes;
    v_attendance:=v_attendance+v_expected_attendance;
  end loop;
  if v_sources=0 or v_lessons=0 then raise exception 'No imported diary was tested'; end if;
  if pg_temp.diario_unchanged_snapshot() is distinct from v_before then
    raise exception 'Original source, enrollment, charge or period changed';
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  execute 'set local role authenticated';
  v_denied:=false;
  begin
    perform public.materializar_diario_operacional_secure(
      v_request,v_source.id,v_preview->>'previewSha256',v_source.payload_sha256);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Authenticated role could materialize data'; end if;
  v_grouped:=public.get_aulas_diario_agrupadas(v_source.turma_id,v_source.disciplina_id);
  if v_grouped is distinct from '[]'::jsonb then
    raise exception 'Grouped getter exposed rows without an authorized identity';
  end if;
  v_denied:=false;
  begin
    perform public.get_diario_historico_importado(v_source.turma_id,v_source.disciplina_id);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Source detail exposed without identity'; end if;
  v_denied:=false;
  begin
    perform public.get_diario_resultados(v_source.turma_id,v_source.disciplina_id);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Results exposed without identity'; end if;
  execute 'reset role';
  raise notice 'Operational materialization passed: % sources, % lessons, % notes, % attendance.',
    v_sources,v_lessons,v_notes,v_attendance;
end;
$$;
set constraints all immediate;
rollback;
