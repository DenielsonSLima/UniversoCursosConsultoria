create or replace function public.get_diario_alunos(p_turma_id uuid, p_disciplina_id uuid)
returns table (
  matricula_id uuid, aluno_id uuid, nome text,
  data_matricula timestamptz, status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not coalesce(public.gestor_can_read_diario_results(p_turma_id), false)
    and not coalesce(public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id), false)
  then
    raise exception 'Acesso ao diário não autorizado.' using errcode = '42501';
  end if;

  return query
  with regular as (
    select base.*
    from internal_academic.p1_get_diario_alunos_20260719(p_turma_id, p_disciplina_id) base
    where internal_academic.is_student_in_diary_roster(
      p_turma_id, p_disciplina_id, base.matricula_id, base.aluno_id
    )
  ), historico as (
    select m.id as matricula_id, m.aluno_id, p.nome, m.data_matricula, m.status
    from internal_academic.diario_resultados_importados h
    join public.matriculas m on m.id = h.matricula_id
      and m.turma_id = h.turma_id and m.aluno_id = h.aluno_id
    join public.parceiros p on p.id = m.aluno_id
    where h.ativo and h.turma_id = p_turma_id and h.disciplina_id = p_disciplina_id
  ), combinado as (
    select r.* from regular r
    where not exists (select 1 from historico h where h.aluno_id = r.aluno_id)
    union all
    select h.* from historico h
  )
  select c.* from combinado c order by c.nome, c.matricula_id;
end;
$$;

create or replace function public.get_diario_resultados(p_turma_id uuid, p_disciplina_id uuid)
returns table (
  turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric,
  nota_cq numeric, nota_o numeric, nota_rec numeric,
  total_aulas bigint, total_faltas bigint, frequencia_percent numeric,
  media_parcial numeric, media_final numeric, resultado_final text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean;
  v_student_access boolean;
begin
  v_full_access := coalesce((select auth.role()), '') = 'service_role'
    or coalesce(public.gestor_can_read_diario_results(p_turma_id), false)
    or coalesce(public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id), false);

  select exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.turma_id = p_turma_id and m.aluno_id = v_aluno_id
      and upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
      and (
        (upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          and upper(coalesce(m.status, '')) = 'ATIVO')
        or (upper(coalesce(t.status, '')) = 'FINALIZADA'
          and upper(coalesce(m.status, '')) in ('CONCLUIDO','REPROVADO','EM_DEPENDENCIA'))
      )
  ) into v_student_access;

  if not coalesce(v_full_access, false) and not coalesce(v_student_access, false) then
    raise exception 'Acesso aos resultados não autorizado.' using errcode = '42501';
  end if;

  return query
  with regular as (
    select resultado.*
    from internal_academic.p1_get_diario_resultados_20260719(p_turma_id, p_disciplina_id) resultado
    where (coalesce(v_full_access, false) or resultado.aluno_id = v_aluno_id)
      and internal_academic.is_student_in_diary_roster(
        p_turma_id, p_disciplina_id, null, resultado.aluno_id
      )
  ), historico as (
    select resultado.*
    from internal_academic.diario_resultados_importados h
    join public.matriculas m on m.id = h.matricula_id
      and m.turma_id = h.turma_id and m.aluno_id = h.aluno_id
    cross join lateral internal_academic.resolve_diario_historical_result(h) resultado
    where h.ativo and h.turma_id = p_turma_id and h.disciplina_id = p_disciplina_id
      and (coalesce(v_full_access, false) or h.aluno_id = v_aluno_id)
  )
  select r.* from regular r
  where not exists (select 1 from historico h where h.aluno_id = r.aluno_id)
  union all
  select h.* from historico h;
end;
$$;

revoke all on function public.get_diario_alunos(uuid,uuid),
  public.get_diario_resultados(uuid,uuid) from public, anon;
grant execute on function public.get_diario_alunos(uuid,uuid),
  public.get_diario_resultados(uuid,uuid) to authenticated, service_role;
