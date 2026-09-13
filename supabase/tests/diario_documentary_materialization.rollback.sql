-- Execute after the lesson and documentary migrations. No fixture PII is stored.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

create function pg_temp.documentary_field(p_value jsonb,p_state text default 'REVIEW')
returns jsonb language sql immutable as $$
  select jsonb_build_object('value',p_value,'raw',p_value,
    'review',jsonb_build_object('state',p_state),
    'sourceRefs',jsonb_build_array(jsonb_build_object(
      'sha256',repeat('a',64),'part','word/document.xml','locator','tbl[1]/tr[1]/tc[1]')));
$$;

do $$
declare
  v_source internal_academic.diario_importacoes;
  v_preview jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_rows jsonb;
  v_expected_notes integer;
  v_expected_attendance integer;
  v_expected_unknown integer;
  v_before text;
  v_after text;
  v_note public.diario_notas;
  v_request uuid := gen_random_uuid();
  v_denied boolean;
  v_claim uuid;
begin
  -- Formula REVIEW must not discard an explicitly written mean or zero.
  if internal_academic.diario_documentary_number(pg_temp.documentary_field('9.5'),10) <> 9.5
    or internal_academic.diario_documentary_number(pg_temp.documentary_field('0'),10) <> 0
    or internal_academic.diario_documentary_number(pg_temp.documentary_field('"-"'),10) is not null
    or internal_academic.diario_documentary_number(pg_temp.documentary_field('null'),10) is not null
    or internal_academic.diario_documentary_number(pg_temp.documentary_field('11'),10) is not null then
    raise exception 'Documentary numeric semantics failed.';
  end if;
  v_rows := jsonb_build_object('grades',jsonb_build_array(
    jsonb_build_object('category',pg_temp.documentary_field('"P"'),'value',pg_temp.documentary_field('4.4')),
    jsonb_build_object('category',pg_temp.documentary_field('"P"'),'value',pg_temp.documentary_field('5.0')),
    jsonb_build_object('category',pg_temp.documentary_field('"P+PP"'),'value',pg_temp.documentary_field('8.0')),
    jsonb_build_object('category',pg_temp.documentary_field('"TI"'),'value',pg_temp.documentary_field('0'))
  ));
  if internal_academic.diario_documentary_instrument(v_rows,'P') is not null
    or internal_academic.diario_documentary_instrument(v_rows,'O') is not null
    or internal_academic.diario_documentary_instrument(v_rows,'TI') <> 0 then
    raise exception 'Repeated and combined instruments were remapped.';
  end if;

  select * into strict v_source from internal_academic.diario_importacoes
    order by id limit 1;
  select count(*) into v_expected_notes from internal_academic.diario_resultados_importados
    where importacao_id=v_source.id and ativo;
  select count(*),count(*) filter(where btrim(f.fonte #>> '{value,raw}') not in ('P','F','J')
      or f.fonte #>> '{value,raw}' is null)
    into v_expected_attendance,v_expected_unknown
  from internal_academic.diario_frequencias_importadas f
  join internal_academic.diario_resultados_importados r on r.id=f.resultado_id and r.ativo
  where f.importacao_id=v_source.id;
  select md5(string_agg(to_jsonb(m)::text,'|' order by m.id)) into v_before
    from public.matriculas m where m.turma_id=v_source.turma_id;

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  v_denied := false;
  begin
    perform public.materializar_diario_notas_frequencia(v_source.id,v_source.payload_sha256);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Anonymous materialization accepted.'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  v_denied := false;
  begin
    perform public.materializar_diario_notas_frequencia(v_source.id,v_source.payload_sha256);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Authenticated materialization accepted.'; end if;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_preview := public.preview_aulas_diario_importado_secure(v_source.id);
  perform public.materializar_aulas_diario_importado_secure(
    v_request,v_source.id,v_preview ->> 'previewSha256');
  v_denied := false;
  begin
    perform public.materializar_diario_notas_frequencia(v_source.id,repeat('0',64));
  exception when unique_violation then v_denied := true; end;
  if not v_denied then raise exception 'Wrong payload SHA accepted.'; end if;

  v_result := public.materializar_diario_notas_frequencia(v_source.id,v_source.payload_sha256);
  if (v_result ->> 'notes')::integer <> v_expected_notes
    or (v_result ->> 'attendance')::integer <> v_expected_attendance
    or (v_result ->> 'unknownAttendance')::integer <> v_expected_unknown
    or (v_result ->> 'enrollmentChanged')::boolean then
    raise exception 'Materialization counts differ from immutable sources.';
  end if;
  v_replay := public.materializar_diario_notas_frequencia(v_source.id,v_source.payload_sha256);
  if not (v_replay ->> 'replay')::boolean or (v_replay ->> 'inserted')::integer <> 0 then
    raise exception 'Identical replay inserted data.';
  end if;
  if exists (
    select 1 from internal_academic.diario_resultados_importados r
    left join public.diario_notas n on n.origem_resultado_historico_id=r.id
    where r.importacao_id=v_source.id and r.ativo
      and (n.aluno_id is null or (to_jsonb(n)-'created_at')
        is distinct from internal_academic.diario_documentary_note_row(r))
  ) then raise exception 'Grade values, sources or exact enrollment tuple changed.'; end if;
  if exists (
    select 1 from internal_academic.diario_frequencias_importadas f
    join internal_academic.diario_resultados_importados r on r.id=f.resultado_id and r.ativo
    join internal_academic.diario_aulas_materializadas a on a.aula_historica_id=f.aula_id
    left join public.diario_frequencia c on c.aula_id=a.aula_id and c.aluno_id=r.aluno_id
    where f.importacao_id=v_source.id and (
      c.aluno_id is null or c.status_documental is distinct from coalesce(f.fonte #>> '{value,raw}','')
      or c.origem_resultado_historico_id is distinct from r.id
      or c.origem_aula_historica_id is distinct from f.aula_id
      or c.status::text is distinct from case when btrim(f.fonte #>> '{value,raw}') in ('P','F','J')
        then btrim(f.fonte #>> '{value,raw}') else null end)
  ) then raise exception 'Attendance symbol or lesson identity changed.'; end if;
  if exists (select 1 from internal_academic.diario_documentary_write_claims
      where transaction_id=pg_current_xact_id()) then
    raise exception 'A write claim escaped materialization.';
  end if;
  select n.* into strict v_note from public.diario_notas n
    join internal_academic.diario_resultados_importados r on r.id=n.origem_resultado_historico_id
    where r.importacao_id=v_source.id order by n.aluno_id limit 1;
  if internal_academic.is_diario_documentary_write_claim('diario_notas',to_jsonb(v_note)) then
    raise exception 'Claim remains usable after the exact insertion.';
  end if;
  insert into internal_academic.diario_documentary_write_claims(
    transaction_id,backend_pid,target_table,expected_row
  ) values(pg_current_xact_id(),pg_backend_pid(),'diario_notas',to_jsonb(v_note)-'created_at')
    returning id into v_claim;
  if not internal_academic.is_diario_documentary_write_claim('diario_notas',to_jsonb(v_note))
    or internal_academic.is_diario_documentary_write_claim('diario_frequencia',to_jsonb(v_note))
    or internal_academic.is_diario_documentary_write_claim('diario_notas',
      to_jsonb(v_note)||jsonb_build_object('aluno_id',gen_random_uuid())) then
    raise exception 'Claim did not bind the exact target and identity.';
  end if;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  if internal_academic.is_diario_documentary_write_claim('diario_notas',to_jsonb(v_note)) then
    raise exception 'A claim granted non-service access.';
  end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  delete from internal_academic.diario_documentary_write_claims where id=v_claim;
  v_denied := false;
  begin
    update public.diario_notas set media_final_documental=coalesce(media_final_documental,0)
      where origem_resultado_historico_id=v_note.origem_resultado_historico_id;
  exception when check_violation then v_denied := true; end;
  if not v_denied then raise exception 'Unclaimed metadata mutation accepted.'; end if;

  select md5(string_agg(to_jsonb(m)::text,'|' order by m.id)) into v_after
    from public.matriculas m where m.turma_id=v_source.turma_id;
  if v_after is distinct from v_before then raise exception 'Enrollment changed during transcription.'; end if;
  if exists (select 1 from internal_academic.diario_importacoes
      where id=v_source.id and payload_sha256 is distinct from v_source.payload_sha256) then
    raise exception 'Immutable source changed.';
  end if;
end;
$$;
set constraints all immediate;
rollback;
