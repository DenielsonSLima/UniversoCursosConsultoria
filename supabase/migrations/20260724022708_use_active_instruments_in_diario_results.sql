create or replace function internal_academic.p1_get_diario_resultados_20260719(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table(
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean := false;
  v_student_access boolean := false;
begin
  select
    coalesce((select auth.role()), '') = 'service_role'
    or public.is_gestor_for_polo(t.polo_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  into v_full_access
  from public.turmas t
  where t.id = p_turma_id;

  v_full_access := coalesce(v_full_access, false);

  if not v_full_access and v_aluno_id is not null then
    select exists (
      select 1
      from public.matriculas m
      join public.turmas t on t.id = m.turma_id
      join public.cursos c on c.id = t.curso_id
      where m.turma_id = p_turma_id
        and m.aluno_id = v_aluno_id
        and upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
        and (
          (
            upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
            and upper(coalesce(m.status, '')) = 'ATIVO'
          )
          or (
            upper(coalesce(t.status, '')) = 'FINALIZADA'
            and upper(coalesce(m.status, '')) in ('CONCLUIDO', 'REPROVADO')
          )
        )
    ) into v_student_access;
  end if;

  if not v_full_access and not v_student_access then
    raise exception 'Acesso acadêmico não autorizado.' using errcode = '42501';
  end if;

  return query
  with regras as (
    select t.frequencia_minima_percent, t.media_minima
    from public.turmas t
    where t.id = p_turma_id
  ),
  configuracao as (
    select (
      select td.instrumentos_avaliativos
      from public.turmas_disciplinas td
      where td.turma_id = p_turma_id
        and td.disciplina_id = p_disciplina_id
      limit 1
    ) as instrumentos_avaliativos
  ),
  alunos as (
    select m.id as matricula_id, m.aluno_id
    from public.matriculas m
    where m.turma_id = p_turma_id
      and upper(coalesce(m.status, ''))
        not in ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
      and (v_full_access or m.aluno_id = v_aluno_id)
  ),
  aulas as (
    select
      count(*) as total,
      sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end) as horas
    from public.aulas_turma a
    where a.turma_id = p_turma_id
      and a.disciplina_id = p_disciplina_id
  ),
  frequencias as (
    select
      f.aluno_id,
      count(*) filter (where f.status = 'F') as faltas,
      count(*) as lancamentos,
      sum(
        case when f.status = 'F'
          then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
          else 0
        end
      ) as horas_falta
    from public.diario_frequencia f
    join public.aulas_turma a on a.id = f.aula_id
    where f.turma_id = p_turma_id
      and f.disciplina_id = p_disciplina_id
    group by f.aluno_id
  ),
  base as (
    select
      a.matricula_id,
      a.aluno_id,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o,
      n.nota_rec,
      au.total as aulas,
      coalesce(f.faltas, 0) as faltas,
      case
        when ap.id is not null then ap.frequencia_percent
        when au.horas > 0 and coalesce(f.lancamentos, 0) = au.total
          then round(
            ((au.horas - coalesce(f.horas_falta, 0)) / au.horas) * 100,
            2
          )
        else null
      end as frequencia,
      case
        when ap.id is not null then ap.media_final
        else internal_academic.calculate_diario_partial(
          cfg.instrumentos_avaliativos,
          n.nota_p,
          n.nota_ti,
          n.nota_tg,
          n.nota_s,
          n.nota_cq,
          n.nota_o
        )
      end as parcial,
      ap.id as aproveitamento_id,
      r.frequencia_minima_percent,
      r.media_minima
    from alunos a
    cross join aulas au
    cross join regras r
    cross join configuracao cfg
    left join frequencias f on f.aluno_id = a.aluno_id
    left join public.diario_notas n
      on n.turma_id = p_turma_id
     and n.disciplina_id = p_disciplina_id
     and n.aluno_id = a.aluno_id
    left join public.matricula_aproveitamentos ap
      on ap.matricula_id = a.matricula_id
     and ap.disciplina_id = p_disciplina_id
  ),
  finais as (
    select
      b.*,
      case
        when b.parcial is null then null
        when b.nota_rec is not null and b.nota_rec > b.parcial then b.nota_rec
        else b.parcial
      end as final
    from base b
  )
  select
    p_turma_id,
    p_disciplina_id,
    f.aluno_id,
    f.nota_p,
    f.nota_ti,
    f.nota_tg,
    f.nota_s,
    f.nota_cq,
    f.nota_o,
    f.nota_rec,
    f.aulas,
    f.faltas,
    f.frequencia,
    f.parcial,
    f.final,
    case
      when f.aproveitamento_id is not null then 'APROVEITADO'
      when f.parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia is null then 'FREQUENCIA_PENDENTE'
      when f.frequencia < f.frequencia_minima_percent then 'REPROVADO_FREQUENCIA'
      when f.final >= f.media_minima then 'APROVADO'
      when f.nota_rec is null then 'EM_RECUPERACAO'
      else 'REPROVADO'
    end
  from finais f;
end;
$function$;
