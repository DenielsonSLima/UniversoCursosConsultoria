-- Keep the existing invoker security, regular arithmetic and return shape.
-- Historical rows have their own authorized projection, including missing notes.
create or replace view public.v_diario_notas_resultados
with (security_invoker = true) as
with aulas as (
  select a.turma_id, a.disciplina_id,
    count(distinct a.data_aula) as total_aulas,
    sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end) as total_horas
  from public.aulas_turma a group by a.turma_id, a.disciplina_id
), frequencias as (
  select f.turma_id, f.disciplina_id, f.aluno_id, count(*) as lancamentos,
    count(*) filter (where f.status = 'F') as total_faltas,
    sum(case when f.status = 'F'
      then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
      else 0 end) as horas_falta
  from public.diario_frequencia f join public.aulas_turma a on a.id = f.aula_id
  group by f.turma_id, f.disciplina_id, f.aluno_id
), base as (
  select n.turma_id, n.disciplina_id, n.aluno_id,
    n.nota_p, n.nota_ti, n.nota_tg, n.nota_s, n.nota_cq, n.nota_o, n.nota_rec,
    coalesce(a.total_aulas, 0::bigint) as total_aulas,
    coalesce(f.total_faltas, 0::bigint) as total_faltas,
    case when coalesce(a.total_horas, 0) > 0
      and coalesce(f.lancamentos, 0) = (
        select count(*) from public.aulas_turma sessoes
        where sessoes.turma_id = n.turma_id and sessoes.disciplina_id = n.disciplina_id
      ) then round((a.total_horas - coalesce(f.horas_falta, 0)) / a.total_horas * 100, 2)
      else null::numeric end as frequencia_percent,
    internal_academic.calculate_diario_partial(
      td.instrumentos_avaliativos, n.nota_p, n.nota_ti, n.nota_tg,
      n.nota_s, n.nota_cq, n.nota_o
    ) as media_parcial
  from public.diario_notas n
  left join aulas a on a.turma_id = n.turma_id and a.disciplina_id = n.disciplina_id
  left join frequencias f on f.turma_id = n.turma_id
    and f.disciplina_id = n.disciplina_id and f.aluno_id = n.aluno_id
  left join public.turmas_disciplinas td on td.turma_id = n.turma_id
    and td.disciplina_id = n.disciplina_id
), finais as (
  select b.*,
    case when b.media_parcial is null then null::numeric
      when b.nota_rec is not null and b.nota_rec > b.media_parcial
        then least(10.00, round(b.nota_rec::numeric, 1))
      else b.media_parcial end as media_final
  from base b
), regular as (
  select f.turma_id, f.disciplina_id, f.aluno_id,
    f.nota_p, f.nota_ti, f.nota_tg, f.nota_s, f.nota_cq, f.nota_o, f.nota_rec,
    f.total_aulas, f.total_faltas, f.frequencia_percent, f.media_parcial, f.media_final,
    case when f.media_parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia_percent is null then 'FREQUENCIA_PENDENTE'
      when f.media_final >= 6.0 and f.frequencia_percent >= 75 then 'APROVADO'
      when f.frequencia_percent < 75 then 'REPROVADO_POR_FALTA'
      when f.nota_rec is null and f.media_parcial < 6.0 then 'EM_RECUPERACAO'
      else 'REPROVADO' end as resultado_final
  from finais f
), historico as materialized (
  select resultado.* from internal_academic.get_diario_historical_snapshot_rows() resultado
), combinado as (
  select r.* from regular r where not exists (
    select 1 from historico h where h.turma_id = r.turma_id
      and h.disciplina_id = r.disciplina_id and h.aluno_id = r.aluno_id
  )
  union all
  select h.* from historico h
)
select c.turma_id, c.disciplina_id, c.aluno_id,
  c.nota_p::numeric(4,2), c.nota_ti::numeric(4,2), c.nota_tg::numeric(4,2),
  c.nota_s::numeric(4,2), c.nota_cq::numeric(4,2), c.nota_o::numeric(4,2),
  c.nota_rec::numeric(4,2), c.total_aulas, c.total_faltas,
  c.frequencia_percent, c.media_parcial, c.media_final, c.resultado_final
from combinado c;
