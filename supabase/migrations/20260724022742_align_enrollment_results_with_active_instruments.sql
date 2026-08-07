create or replace function internal_academic.get_enrollment_results(
  p_matricula_id uuid
)
returns table(
  disciplina_id uuid,
  media_final numeric,
  frequencia_percent numeric,
  resultado_final text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with matricula as (
    select
      m.id,
      m.aluno_id,
      m.turma_id,
      t.frequencia_minima_percent,
      t.media_minima
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    where m.id = p_matricula_id
  ),
  disciplinas as (
    select td.disciplina_id, td.instrumentos_avaliativos
    from public.turmas_disciplinas td
    join matricula m on m.turma_id = td.turma_id
  ),
  aulas as (
    select
      a.disciplina_id,
      count(*) as total_aulas,
      sum(
        case when a.carga_horaria > 0 then a.carga_horaria else 1 end
      ) as total_horas
    from public.aulas_turma a
    join matricula m on m.turma_id = a.turma_id
    group by a.disciplina_id
  ),
  frequencias as (
    select
      f.disciplina_id,
      count(*) as lancamentos,
      sum(case when f.status = 'F' then 1 else 0 end) as faltas,
      sum(
        case when f.status = 'F'
          then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
          else 0
        end
      ) as horas_falta
    from public.diario_frequencia f
    join public.aulas_turma a on a.id = f.aula_id
    join matricula m
      on m.turma_id = f.turma_id
     and m.aluno_id = f.aluno_id
    group by f.disciplina_id
  ),
  base as (
    select
      d.disciplina_id,
      ap.id as aproveitamento_id,
      ap.media_final as media_aproveitada,
      ap.frequencia_percent as frequencia_aproveitada,
      n.nota_rec,
      internal_academic.calculate_diario_partial(
        d.instrumentos_avaliativos,
        n.nota_p,
        n.nota_ti,
        n.nota_tg,
        n.nota_s,
        n.nota_cq,
        n.nota_o
      ) as media_parcial,
      case
        when ap.id is not null then ap.frequencia_percent
        when a.total_horas > 0
          and coalesce(f.lancamentos, 0) = a.total_aulas
          then round(
            (
              (a.total_horas - coalesce(f.horas_falta, 0))
              / a.total_horas
            ) * 100,
            2
          )
        else null
      end as frequencia,
      m.frequencia_minima_percent,
      m.media_minima
    from disciplinas d
    cross join matricula m
    left join aulas a on a.disciplina_id = d.disciplina_id
    left join frequencias f on f.disciplina_id = d.disciplina_id
    left join public.diario_notas n
      on n.turma_id = m.turma_id
     and n.disciplina_id = d.disciplina_id
     and n.aluno_id = m.aluno_id
    left join public.matricula_aproveitamentos ap
      on ap.matricula_id = m.id
     and ap.disciplina_id = d.disciplina_id
  ),
  finais as (
    select
      b.*,
      case
        when b.aproveitamento_id is not null then b.media_aproveitada
        when b.media_parcial is null then null
        when b.nota_rec is not null and b.nota_rec > b.media_parcial
          then b.nota_rec
        else b.media_parcial
      end as final
    from base b
  )
  select
    f.disciplina_id,
    f.final,
    coalesce(f.frequencia_aproveitada, f.frequencia),
    case
      when f.aproveitamento_id is not null then 'APROVEITADO'
      when f.media_parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia is null then 'FREQUENCIA_PENDENTE'
      when f.frequencia < f.frequencia_minima_percent then 'REPROVADO_FREQUENCIA'
      when f.final >= f.media_minima then 'APROVADO'
      when f.nota_rec is null then 'EM_RECUPERACAO'
      else 'REPROVADO'
    end
  from finais f;
$function$;
