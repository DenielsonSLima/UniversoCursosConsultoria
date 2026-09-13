create function internal_academic.diario_documentary_note_row(
  p_result internal_academic.diario_resultados_importados
) returns jsonb language sql immutable set search_path = '' as $$
  select to_jsonb(jsonb_populate_record(null::public.diario_notas,jsonb_build_object(
    'turma_id',p_result.turma_id,'disciplina_id',p_result.disciplina_id,'aluno_id',p_result.aluno_id,
    'nota_p',internal_academic.diario_documentary_instrument(p_result.fonte,'P'),
    'nota_ti',internal_academic.diario_documentary_instrument(p_result.fonte,'TI'),
    'nota_tg',internal_academic.diario_documentary_instrument(p_result.fonte,'TG'),
    'nota_s',internal_academic.diario_documentary_instrument(p_result.fonte,'S'),
    'nota_cq',internal_academic.diario_documentary_instrument(p_result.fonte,'CQ'),
    'nota_o',internal_academic.diario_documentary_instrument(p_result.fonte,'O'),
    'nota_rec',internal_academic.diario_documentary_number(p_result.fonte #> '{reportedResults,recovery}',10),
    'media_parcial_documental',internal_academic.diario_documentary_number(p_result.fonte #> '{reportedResults,partial}',10),
    'media_final_documental',internal_academic.diario_documentary_number(p_result.fonte #> '{reportedResults,final}',10),
    'origem_resultado_historico_id',p_result.id,
    'instrumentos_documentais',case when jsonb_typeof(p_result.fonte -> 'gradeRows')='array'
      then p_result.fonte -> 'gradeRows' else '[]'::jsonb end,
    'resultados_documentais',p_result.fonte -> 'reportedResults'
  ))) - 'created_at';
$$;
revoke all on function internal_academic.diario_documentary_note_row(
  internal_academic.diario_resultados_importados) from public,anon,authenticated,service_role;

create function public.materializar_diario_notas_frequencia(
  p_importacao_id uuid,p_expected_payload_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_import internal_academic.diario_importacoes;
  v_result internal_academic.diario_resultados_importados;
  v_frequency record;
  v_note public.diario_notas;
  v_attendance public.diario_frequencia;
  v_expected jsonb;
  v_actual jsonb;
  v_claim uuid;
  v_notes integer := 0;
  v_marks integer := 0;
  v_unknown integer := 0;
  v_inserted integer := 0;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'Materialização restrita ao serviço autorizado.' using errcode='42501';
  end if;
  select * into strict v_import from internal_academic.diario_importacoes where id=p_importacao_id;
  if p_expected_payload_sha256 is distinct from v_import.payload_sha256 then
    raise exception 'A fonte do diário mudou.' using errcode='23505';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_import.turma_id::text),hashtext(v_import.disciplina_id::text));
  perform pg_advisory_xact_lock(hashtextextended(
    'diario-history:'||v_import.turma_id||':'||v_import.disciplina_id,0));
  -- No temporal status changes, dependency promotion or financial release.
  if exists (
    select 1 from public.turmas_disciplinas td
    join public.periodos_letivos pl on pl.id=td.periodo_letivo_id
    where td.turma_id=v_import.turma_id and td.disciplina_id=v_import.disciplina_id
      and pl.status='FECHADO'
  ) then raise exception 'Período fechado exige revisão própria.' using errcode='23514'; end if;
  if exists (
    select 1 from internal_academic.diario_aulas_importadas h
    left join internal_academic.diario_aulas_materializadas l
      on l.aula_historica_id=h.id and l.importacao_id=h.importacao_id
    left join public.aulas_turma a on a.id=l.aula_id
      and a.turma_id=v_import.turma_id and a.disciplina_id=v_import.disciplina_id
    where h.importacao_id=v_import.id and a.id is null
  ) then raise exception 'Materialize todas as aulas desta fonte primeiro.' using errcode='23514'; end if;
  if exists (
    select 1 from internal_academic.diario_resultados_importados r
    left join public.matriculas m on (m.id,m.turma_id,m.aluno_id)=(r.matricula_id,r.turma_id,r.aluno_id)
    where r.importacao_id=v_import.id and r.ativo and m.id is null
  ) then raise exception 'Matrícula não corresponde à fonte.' using errcode='23514'; end if;

  for v_result in select * from internal_academic.diario_resultados_importados
      where importacao_id=v_import.id and ativo order by id loop
    -- Retain the original approved-dependency guard; never start a dependency here.
    if exists (
      select 1 from public.matricula_aproveitamentos a
      where a.matricula_id=v_result.matricula_id and a.disciplina_id=v_result.disciplina_id
    ) then raise exception 'Disciplina com aproveitamento exige conciliação individual.' using errcode='23514'; end if;
    v_expected := internal_academic.diario_documentary_note_row(v_result);
    select to_jsonb(n)-'created_at' into v_actual from public.diario_notas n
      where (n.turma_id,n.disciplina_id,n.aluno_id)=(v_result.turma_id,v_result.disciplina_id,v_result.aluno_id)
      for update;
    if found then
      if v_actual is distinct from v_expected then
        raise exception 'Notas existentes divergem da transcrição; nada foi sobrescrito.' using errcode='23505';
      end if;
    else
      v_note := jsonb_populate_record(null::public.diario_notas,v_expected);
      v_note.created_at := clock_timestamp();
      insert into internal_academic.diario_documentary_write_claims(
        transaction_id,backend_pid,target_table,expected_row
      ) values(pg_current_xact_id(),pg_backend_pid(),'diario_notas',v_expected) returning id into v_claim;
      insert into public.diario_notas select v_note.*;
      delete from internal_academic.diario_documentary_write_claims where id=v_claim;
      v_inserted := v_inserted+1;
    end if;
    v_notes := v_notes+1;
    for v_frequency in
      select f.*,l.aula_id as canonical_aula_id
      from internal_academic.diario_frequencias_importadas f
      join internal_academic.diario_aulas_materializadas l
        on l.importacao_id=f.importacao_id and l.aula_historica_id=f.aula_id
      where f.resultado_id=v_result.id
      order by f.aula_id
    loop
      -- Symbols unsupported by the regular P/F/J contract remain raw and NULL.
      v_expected := to_jsonb(jsonb_populate_record(null::public.diario_frequencia,jsonb_build_object(
        'turma_id',v_result.turma_id,'disciplina_id',v_result.disciplina_id,
        'aluno_id',v_result.aluno_id,'aula_id',v_frequency.canonical_aula_id,
        'status',case when btrim(v_frequency.fonte #>> '{value,raw}') in ('P','F','J')
          then btrim(v_frequency.fonte #>> '{value,raw}') else null end,
        'status_documental',coalesce(v_frequency.fonte #>> '{value,raw}',''),
        'origem_resultado_historico_id',v_result.id,'origem_aula_historica_id',v_frequency.aula_id
      ))) - 'created_at';
      select to_jsonb(f)-'created_at' into v_actual from public.diario_frequencia f
        where f.aula_id=v_frequency.canonical_aula_id and f.aluno_id=v_result.aluno_id for update;
      if found then
        if v_actual is distinct from v_expected then
          raise exception 'Frequência existente diverge da transcrição; nada foi sobrescrito.' using errcode='23505';
        end if;
      else
        v_attendance := jsonb_populate_record(null::public.diario_frequencia,v_expected);
        v_attendance.created_at := clock_timestamp();
        insert into internal_academic.diario_documentary_write_claims(
          transaction_id,backend_pid,target_table,expected_row
        ) values(pg_current_xact_id(),pg_backend_pid(),'diario_frequencia',v_expected) returning id into v_claim;
        insert into public.diario_frequencia select v_attendance.*;
        delete from internal_academic.diario_documentary_write_claims where id=v_claim;
        v_inserted := v_inserted+1;
      end if;
      v_marks := v_marks+1;
      if v_expected ->> 'status' is null then v_unknown := v_unknown+1; end if;
    end loop;
  end loop;
  return jsonb_build_object('importacaoId',v_import.id,'notes',v_notes,'attendance',v_marks,
    'unknownAttendance',v_unknown,'inserted',v_inserted,'replay',v_inserted=0,
    'materializationState','TRANSCRITO','enrollmentChanged',false);
end;
$$;
revoke all on function public.materializar_diario_notas_frequencia(uuid,text) from public,anon,authenticated;
grant execute on function public.materializar_diario_notas_frequencia(uuid,text) to service_role;
