-- Only existing imported sources are used; no student data is printed or embedded.
-- Run after the materialization contracts in a rollback-only rehearsal.
begin;
do $$
declare
  v_import record;
  v_preview jsonb;
  v_response jsonb;
  v_request uuid;
  v_count integer := 0;
  v_lessons integer := 0;
  v_before_sources text;
  v_after_sources text;
  v_before_enrollments text;
  v_after_enrollments text;
  v_before_periods text;
  v_after_periods text;
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,''),'sha256'),'hex')
    into v_before_sources from internal_academic.diario_importacoes i;
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,''),'sha256'),'hex')
    into v_before_enrollments from public.matriculas m
    where m.turma_id in(select turma_id from internal_academic.diario_importacoes);
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,''),'sha256'),'hex')
    into v_before_periods from public.periodos_letivos p
    where p.turma_id in(select turma_id from internal_academic.diario_importacoes);

  for v_import in select id,turma_id,disciplina_id from internal_academic.diario_importacoes order by id loop
    v_preview := public.preview_aulas_diario_importado_secure(v_import.id);
    if v_preview is distinct from public.preview_aulas_diario_importado_secure(v_import.id) then
      raise exception 'Preview is not deterministic';
    end if;
    select request_id into v_request from internal_academic.diario_aulas_materializacao_requests
      where importacao_id=v_import.id;
    v_request := coalesce(v_request,gen_random_uuid());
    v_denied := false;
    begin
      perform public.materializar_aulas_diario_importado_secure(v_request,v_import.id,repeat('0',64));
    exception when check_violation then v_denied:=true;
    end;
    if not v_denied then raise exception 'Wrong SHA was accepted'; end if;

    v_response := public.materializar_aulas_diario_importado_secure(v_request,v_import.id,v_preview->>'previewSha256');
    if (v_response->>'aulasMaterializadas')::integer<>(v_preview#>>'{plano,quantidadeAulas}')::integer then
      raise exception 'Not all source encounters were materialized';
    end if;
    if (select sum(a.carga_horaria) from public.aulas_turma a
      join internal_academic.diario_aulas_materializadas m on m.aula_id=a.id
      where m.importacao_id=v_import.id)<>(v_preview#>>'{plano,cargaOficialTP}')::numeric then
      raise exception 'Materialized workload does not equal official theory/practice workload';
    end if;
    if exists(select 1 from internal_academic.diario_aulas_materializadas m
      join internal_academic.diario_aulas_importadas h on h.id=m.aula_historica_id
      join public.aulas_turma a on a.id=m.aula_id
      where m.importacao_id=v_import.id and (a.data_aula is distinct from (h.fonte#>>'{date,value}')::date
        or a.titulo is distinct from h.conteudo or a.sessao<>'U'
        or a.hora_inicio is not null or a.hora_fim is not null)) then
      raise exception 'Source dates/content changed or unsupported clock times were created';
    end if;
    v_response := public.materializar_aulas_diario_importado_secure(v_request,v_import.id,v_preview->>'previewSha256');
    if not (v_response->>'replay')::boolean then raise exception 'Expected idempotent replay'; end if;
    v_count:=v_count+1;
    v_lessons:=v_lessons+(v_response->>'aulasMaterializadas')::integer;
  end loop;
  if v_count=0 or v_lessons=0 then raise exception 'No imported source was tested'; end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  v_denied:=false;
  begin
    perform public.preview_aulas_diario_importado_secure(v_import.id);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Authenticated caller bypassed service-only guard'; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,''),'sha256'),'hex')
    into v_after_sources from internal_academic.diario_importacoes i;
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,''),'sha256'),'hex')
    into v_after_enrollments from public.matriculas m
    where m.turma_id in(select turma_id from internal_academic.diario_importacoes);
  select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,''),'sha256'),'hex')
    into v_after_periods from public.periodos_letivos p
    where p.turma_id in(select turma_id from internal_academic.diario_importacoes);
  if v_before_sources<>v_after_sources or v_before_enrollments<>v_after_enrollments
      or v_before_periods<>v_after_periods then
    raise exception 'Source, enrollment or period changed during lesson materialization';
  end if;
  raise notice 'Lesson materialization tested: % sources, % encounters, replay and authorization passed.',v_count,v_lessons;
end;
$$;
rollback;
