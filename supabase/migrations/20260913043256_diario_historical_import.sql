create function public.importar_diario_historico_secure(
  p_manifest_sha256 text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_turma uuid;
  v_disciplina uuid;
  v_professor uuid;
  v_source text := p_payload #>> '{source,sha256}';
  v_hash text;
  v_id uuid;
  v_existing internal_academic.diario_importacoes;
  v_carga numeric;
  v_carga_aulas numeric;
  v_media_minima numeric;
  v_frequencia_minima numeric;
  v_total numeric;
  v_horas_ok boolean;
  v_item jsonb;
  v_student jsonb;
  v_field jsonb;
  v_aula uuid;
  v_resultado uuid;
  v_aluno uuid;
  v_matricula uuid;
  v_date date;
  v_hours numeric;
  v_ordinal integer := 0;
  v_count integer;
  v_confirmed integer;
  v_absences integer;
  v_present_hours numeric;
  v_all_hours numeric;
  v_freq numeric;
  v_reported_freq numeric;
  v_freq_ok boolean;
  v_notas_ok boolean;
  v_response jsonb;
begin
  -- Service identity is checked before any replay lookup or source response.
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Importação histórica restrita ao serviço autorizado.' using errcode='42501';
  end if;
  v_turma := (p_payload ->> 'turmaId')::uuid;
  v_disciplina := (p_payload ->> 'disciplinaId')::uuid;
  v_professor := (p_payload ->> 'professorId')::uuid;
  if p_manifest_sha256 !~ '^[a-f0-9]{64}$' or v_source !~ '^[a-f0-9]{64}$'
    or v_source is null or p_manifest_sha256 is null
    or jsonb_typeof(p_payload -> 'lessons') is distinct from 'array'
    or jsonb_typeof(p_payload -> 'students') is distinct from 'array'
    or jsonb_array_length(p_payload -> 'lessons') > 200
    or jsonb_array_length(p_payload -> 'students') > 200
    or octet_length(p_payload::text) > 3000000 then
    raise exception 'Fonte histórica inválida ou fora dos limites.' using errcode='22023';
  end if;
  -- Every cell reference must belong to this exact document, including review fields.
  for v_field in select refs.value from jsonb_path_query(p_payload,
      'strict $.** ? (exists(@.sourceRefs)).sourceRefs') refs(value) loop
    if jsonb_typeof(v_field) is distinct from 'array' then
      raise exception 'Referências de origem inválidas.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(v_field) ref
      where ref ->> 'sha256' is distinct from v_source
        or ref ->> 'part' is distinct from 'word/document.xml'
        or nullif(btrim(ref ->> 'locator'),'') is null) then
      raise exception 'Referência não pertence ao documento informado.' using errcode='22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('diario-history:'||v_turma||':'||v_disciplina,0));
  select d.carga_horaria, coalesce(d.carga_horaria_teoria,0)+coalesce(d.carga_horaria_pratica,0),
    t.media_minima,t.frequencia_minima_percent
    into v_carga,v_carga_aulas,v_media_minima,v_frequencia_minima
  from public.turmas t join public.cursos c on c.id=t.curso_id
  join public.modulos m on m.curso_id=c.id
  join public.disciplinas d on d.modulo_id=m.id
  join public.turmas_disciplinas td on td.turma_id=t.id and td.disciplina_id=d.id
  join public.parceiros p on p.id=td.professor_id
  where t.id=v_turma and d.id=v_disciplina and td.professor_id=v_professor
    and upper(c.modalidade) in ('TECNICO','TÉCNICO') and p.tipo='Professor';
  if not found then
    raise exception 'Turma, disciplina ou docente não conferem com a grade.' using errcode='23514';
  end if;
  v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');
  select * into v_existing from internal_academic.diario_importacoes where source_sha256=v_source;
  if found then
    if v_existing.payload_sha256 <> v_hash or v_existing.manifest_sha256 <> p_manifest_sha256
      or v_existing.turma_id <> v_turma or v_existing.disciplina_id <> v_disciplina then
      raise exception 'Fonte já importada com conteúdo diferente; revisão explícita necessária.' using errcode='23505';
    end if;
    return jsonb_build_object('importacaoId',v_existing.id,'replay',true);
  end if;
  if exists(select 1 from public.diario_notas where turma_id=v_turma and disciplina_id=v_disciplina)
    or exists(select 1 from public.diario_frequencia where turma_id=v_turma and disciplina_id=v_disciplina)
    or exists(select 1 from public.aulas_turma where turma_id=v_turma and disciplina_id=v_disciplina)
    or exists(select 1 from internal_academic.diario_importacoes where turma_id=v_turma and disciplina_id=v_disciplina) then
    raise exception 'Diário já possui lançamentos; conciliação individual necessária.' using errcode='23505';
  end if;

  select sum(case when jsonb_typeof(e #> '{hours,value}')='number'
      and (e #>> '{hours,value}')::numeric between 0.01 and 24
      then (e #>> '{hours,value}')::numeric else null end),
    bool_and(coalesce(internal_academic.diario_historical_number(e -> 'hours',24) > 0,false))
    into v_total,v_horas_ok from jsonb_array_elements(p_payload -> 'lessons') e;
  v_horas_ok := coalesce(v_horas_ok and v_total=v_carga_aulas, false);
  insert into internal_academic.diario_importacoes(turma_id,disciplina_id,professor_id,
    source_sha256,manifest_sha256,payload_sha256,source_name,payload,
    carga_oficial,carga_aulas_oficial,carga_aulas_documental,horas_estado)
  values(v_turma,v_disciplina,v_professor,v_source,p_manifest_sha256,v_hash,
    p_payload #>> '{source,fileName}',p_payload,v_carga,v_carga_aulas,v_total,
    case when v_horas_ok then 'CONFERIDO' else 'EM_CONFERENCIA' end) returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'lessons') loop
    v_ordinal := v_ordinal+1;
    v_date := null;
    if (v_item #>> '{date,value}') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_date := (v_item #>> '{date,value}')::date;
    end if;
    v_hours := case when jsonb_typeof(v_item #> '{hours,value}')='number'
      and (v_item #>> '{hours,value}')::numeric between 0.01 and 24
      then (v_item #>> '{hours,value}')::numeric else null end;
    if nullif(v_item ->> 'sourceKey','') is null then
      raise exception 'Aula sem localizador de origem.' using errcode='22023';
    end if;
    insert into internal_academic.diario_aulas_importadas(importacao_id,source_key,ordem,
      data_aula,carga_horaria,conteudo,pratica,data_estado,horas_estado,fonte)
    values(v_id,v_item ->> 'sourceKey',v_ordinal,v_date,v_hours,
      v_item #>> '{content,value}',v_item #>> '{practice,value}',
      case when v_date is not null and internal_academic.diario_historical_field_confirmed(v_item -> 'date')
        then 'CONFERIDO' else 'EM_CONFERENCIA' end,
      case when v_hours is not null and v_horas_ok then 'CONFERIDO' else 'EM_CONFERENCIA' end,v_item);
  end loop;

  for v_student in select value from jsonb_array_elements(p_payload -> 'students') loop
    -- Unresolved identities remain in the immutable source, without fabricated enrollments.
    if coalesce(v_student #>> '{identity,status}','REVIEW') <> 'MATCHED' then continue; end if;
    v_aluno := (v_student #>> '{identity,alunoId}')::uuid;
    v_matricula := (v_student #>> '{identity,matriculaId}')::uuid;
    if not exists(select 1 from public.matriculas m where m.id=v_matricula
        and m.turma_id=v_turma and m.aluno_id=v_aluno) then
      raise exception 'Identidade não corresponde à matrícula desta turma.' using errcode='23514';
    end if;
    v_notas_ok := internal_academic.diario_historical_number(v_student #> '{reportedResults,final}',10) is not null;
    if exists(select 1 from jsonb_each(case when jsonb_typeof(v_student -> 'reportedResults')='object'
        then v_student -> 'reportedResults' else '{}'::jsonb end) f
        where f.key in ('partial','final','recovery','outcome') and f.value #>> '{review,state}'='REVIEW')
      or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_student -> 'grades')='array'
        then v_student -> 'grades' else '[]'::jsonb end) g
        where g #>> '{value,review,state}'='REVIEW' or g #>> '{category,review,state}'='REVIEW') then
      v_notas_ok := false;
    end if;
    insert into internal_academic.diario_resultados_importados(importacao_id,turma_id,
      disciplina_id,aluno_id,matricula_id,source_person_key,notas_estado,frequencia_estado,
      media_parcial,media_final,nota_rec,resultado_documental,fonte,row_fingerprint)
    values(v_id,v_turma,v_disciplina,v_aluno,v_matricula,v_student ->> 'sourcePersonKey',
      case when v_notas_ok then 'CONFERIDO' else 'EM_CONFERENCIA' end,'EM_CONFERENCIA',
      internal_academic.diario_historical_number(v_student #> '{reportedResults,partial}',10),
      internal_academic.diario_historical_number(v_student #> '{reportedResults,final}',10),
      internal_academic.diario_historical_number(v_student #> '{reportedResults,recovery}',10),
      v_student #>> '{reportedResults,outcome,value}',v_student,
      encode(extensions.digest(v_student::text,'sha256'),'hex')) returning id into v_resultado;
    for v_item in select value from jsonb_array_elements(v_student -> 'attendance') loop
      select id into v_aula from internal_academic.diario_aulas_importadas
        where importacao_id=v_id and source_key=v_item ->> 'lessonSourceKey';
      if v_aula is null then raise exception 'Frequência sem aula de origem.' using errcode='23514'; end if;
      v_field := v_item -> 'value';
      insert into internal_academic.diario_frequencias_importadas(importacao_id,resultado_id,aula_id,status,estado,fonte)
      values(v_id,v_resultado,v_aula,
        case when internal_academic.diario_historical_field_confirmed(v_field)
          and v_field ->> 'value' in ('P','F','J') then v_field ->> 'value' else null end,
        case when internal_academic.diario_historical_field_confirmed(v_field)
          and v_field ->> 'value' in ('P','F','J') then 'CONFERIDO' else 'EM_CONFERENCIA' end,v_item);
    end loop;
    select count(a.id), count(f.aula_id) filter(where f.estado='CONFERIDO'),
      count(f.aula_id) filter(where f.status='F'),
      sum(a.carga_horaria) filter(where f.status in ('P','J')),
      sum(a.carga_horaria), bool_and(a.data_estado='CONFERIDO' and a.horas_estado='CONFERIDO')
    into v_count,v_confirmed,v_absences,v_present_hours,v_all_hours,v_freq_ok
    from internal_academic.diario_aulas_importadas a
    left join internal_academic.diario_frequencias_importadas f on f.aula_id=a.id and f.resultado_id=v_resultado
    where a.importacao_id=v_id;
    v_freq_ok := coalesce(v_freq_ok and v_count > 0 and v_count=v_confirmed and v_all_hours=v_carga_aulas,false);
    v_freq := case when v_freq_ok then round(coalesce(v_present_hours,0)/nullif(v_all_hours,0)*100,2) else null end;
    v_reported_freq := internal_academic.diario_historical_number(v_student #> '{reportedResults,frequency}',100);
    -- A conflicting written percentage or absence total cannot be silently corrected.
    if (v_student #>> '{reportedResults,frequency,review,state}')='REVIEW'
      or (v_student #>> '{reportedResults,absences,review,state}')='REVIEW'
      or (v_reported_freq is not null and abs(v_reported_freq-v_freq)>0.1) then v_freq_ok:=false; end if;
    update internal_academic.diario_resultados_importados set
      frequencia_estado=case when v_freq_ok then 'CONFERIDO' else 'EM_CONFERENCIA' end,
      frequencia_percent=case when v_freq_ok then v_freq else null end,
      total_faltas=v_absences,aulas_registradas=v_count,frequencias_lancadas=v_confirmed
      where id=v_resultado;
    -- Contradictory approval stays pending; the original statement remains in fonte.
    if upper(btrim(v_student #>> '{reportedResults,outcome,value}'))
        in ('APROVADO','APROVADA','APROVADO(A)','APROVADO (A)')
      and (internal_academic.diario_historical_number(v_student #> '{reportedResults,final}',10) < v_media_minima
        or (v_freq_ok and v_freq < v_frequencia_minima)) then
      update internal_academic.diario_resultados_importados set resultado_documental=null
        where id=v_resultado;
    end if;
  end loop;
  select jsonb_build_object('importacaoId',v_id,'replay',false,
    'alunosVinculados',count(*),'notasConferidas',count(*) filter(where notas_estado='CONFERIDO'),
    'frequenciasConferidas',count(*) filter(where frequencia_estado='CONFERIDO'),
    'aulas',v_ordinal,'horasEstado',case when v_horas_ok then 'CONFERIDO' else 'EM_CONFERENCIA' end)
  into v_response from internal_academic.diario_resultados_importados where importacao_id=v_id;
  return v_response;
end;
$$;
revoke all on function public.importar_diario_historico_secure(text,jsonb) from public,anon,authenticated;
grant execute on function public.importar_diario_historico_secure(text,jsonb) to service_role;
