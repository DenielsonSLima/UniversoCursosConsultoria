-- The detail screen and academic read paths share one result-state decision.
-- Preserve all fields, documentary sources and the existing authorization scope.
create or replace function public.get_diario_historico_importado(p_turma_id uuid,p_disciplina_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_import internal_academic.diario_importacoes; v_response jsonb;
begin
  if coalesce((select auth.role()),'') <> 'service_role'
    and not coalesce(public.gestor_can_read_diario_results(p_turma_id),false)
    and not coalesce(public.is_professor_assigned_disciplina(p_turma_id,p_disciplina_id),false) then
    raise exception 'Acesso ao histórico do diário não autorizado.' using errcode='42501';
  end if;
  select * into v_import from internal_academic.diario_importacoes
    where turma_id=p_turma_id and disciplina_id=p_disciplina_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'id',v_import.id,'sourceName',v_import.source_name,'sourceSha256',v_import.source_sha256,
    'importedAt',v_import.created_at,'readOnly',true,
    'officialHours',v_import.carga_oficial,'officialClassHours',v_import.carga_aulas_oficial,
    'reportedClassHours',v_import.carga_aulas_documental,'hoursState',v_import.horas_estado,
    'metadata',v_import.payload -> 'metadata','workloadReview',v_import.payload -> 'workloadReview',
    'studentsCount',(select count(*) from internal_academic.diario_resultados_importados r where r.importacao_id=v_import.id and r.ativo),
    'unresolvedCount',(select count(*) from jsonb_array_elements(v_import.payload -> 'students') s
      where coalesce(s #>> '{identity,status}','REVIEW') <> 'MATCHED'),
    'lessonsCount',(select count(*) from internal_academic.diario_aulas_importadas a where a.importacao_id=v_import.id),
    'attendanceCount',(select count(*) from internal_academic.diario_frequencias_importadas f where f.importacao_id=v_import.id and f.estado='CONFERIDO'),
    'gradesConfirmed',(select count(*) from internal_academic.diario_resultados_importados r where r.importacao_id=v_import.id and r.ativo and r.notas_estado='CONFERIDO'),
    'lessons',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'sourceKey',a.source_key,'date',a.data_aula,'dateField',a.fonte -> 'date',
      'hours',a.carga_horaria,'hoursState',a.horas_estado,'hoursField',a.fonte -> 'hours',
      'content',a.conteudo,'contentField',a.fonte -> 'content','practice',a.pratica,'practiceField',a.fonte -> 'practice'
    ) order by a.ordem) from internal_academic.diario_aulas_importadas a where a.importacao_id=v_import.id),'[]'::jsonb),
    'students',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.aluno_id,'matriculaId',r.matricula_id,'name',p.nome,'enrollmentStatus',m.status,
      'grades',r.fonte -> 'grades','reportedResults',r.fonte -> 'reportedResults',
      'gradeRows',r.fonte -> 'gradeRows','reportedAttendanceTotals',r.fonte -> 'reportedAttendanceTotals',
      'partial',case when r.notas_estado='CONFERIDO' then r.media_parcial end,
      'final',case when r.notas_estado='CONFERIDO' then r.media_final end,
      'recovery',case when r.notas_estado='CONFERIDO' then r.nota_rec end,
      'gradeState',r.notas_estado,'frequency',r.frequencia_percent,'frequencyState',r.frequencia_estado,
      'resultState',case when resultado.resultado_final <> 'EM_CONFERENCIA'
        then 'CONFERIDO' else 'EM_CONFERENCIA' end,
      'attendance',coalesce((select jsonb_agg(jsonb_build_object(
        'lessonId',f.aula_id,'status',f.status,'state',f.estado,'source',f.fonte -> 'value'
      ) order by a.ordem) from internal_academic.diario_frequencias_importadas f
      join internal_academic.diario_aulas_importadas a on a.id=f.aula_id
      where f.resultado_id=r.id),'[]'::jsonb)
    ) order by p.nome,r.aluno_id) from internal_academic.diario_resultados_importados r
      join public.parceiros p on p.id=r.aluno_id
      join public.matriculas m on (m.id,m.turma_id,m.aluno_id)=(r.matricula_id,r.turma_id,r.aluno_id)
      cross join lateral internal_academic.resolve_diario_historical_result(r) resultado
      where r.importacao_id=v_import.id and r.ativo),'[]'::jsonb),
    'unresolvedStudents',coalesce((select jsonb_agg(jsonb_build_object(
      'sourcePersonKey',s ->> 'sourcePersonKey','sourceNames',s -> 'sourceNames','identity',s -> 'identity'
    )) from jsonb_array_elements(v_import.payload -> 'students') s
      where coalesce(s #>> '{identity,status}','REVIEW') <> 'MATCHED'),'[]'::jsonb),
    'issues',coalesce(v_import.payload -> 'issues','[]'::jsonb)
  ) into v_response;
  return v_response;
end;
$$;
revoke all on function public.get_diario_historico_importado(uuid,uuid) from public,anon;
grant execute on function public.get_diario_historico_importado(uuid,uuid) to authenticated,service_role;
