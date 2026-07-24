create or replace view public.v_diario_notas_resultados as
with stats_faltas as (
  select
    f.turma_id,
    f.disciplina_id,
    f.aluno_id,
    count(case when f.status = 'F' then 1 end) as total_faltas
  from public.diario_frequencia f
  group by f.turma_id, f.disciplina_id, f.aluno_id
),
total_aulas_count as (
  select a.turma_id, a.disciplina_id, count(a.id) as total_aulas
  from public.aulas_turma a
  group by a.turma_id, a.disciplina_id
),
base as (
  select
    n.*,
    coalesce(ta.total_aulas, 0::bigint) as total_aulas,
    coalesce(sf.total_faltas, 0::bigint) as total_faltas,
    case
      when coalesce(ta.total_aulas, 0::bigint) > 0 then round(
        (ta.total_aulas - coalesce(sf.total_faltas, 0::bigint))::numeric
        / ta.total_aulas::numeric * 100::numeric
      )
      else 100::numeric
    end as frequencia_percent,
    internal_academic.calculate_diario_partial(
      td.instrumentos_avaliativos,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o
    ) as media_parcial
  from public.diario_notas n
  left join stats_faltas sf
    on n.turma_id = sf.turma_id
   and n.disciplina_id = sf.disciplina_id
   and n.aluno_id = sf.aluno_id
  left join total_aulas_count ta
    on n.turma_id = ta.turma_id
   and n.disciplina_id = ta.disciplina_id
  left join public.turmas_disciplinas td
    on n.turma_id = td.turma_id
   and n.disciplina_id = td.disciplina_id
),
finais as (
  select
    b.*,
    case
      when b.media_parcial is null then null::numeric
      when b.nota_rec is not null and b.nota_rec > b.media_parcial
        then least(10.00, round(b.nota_rec::numeric, 1))
      else b.media_parcial
    end as media_final
  from base b
)
select
  f.turma_id,
  f.disciplina_id,
  f.aluno_id,
  f.nota_p,
  f.nota_ti,
  f.nota_tg,
  f.nota_s,
  f.nota_cq,
  f.nota_o,
  f.nota_rec,
  f.total_aulas,
  f.total_faltas,
  f.frequencia_percent,
  f.media_parcial,
  f.media_final,
  case
    when f.media_parcial is null then 'SEM_LANCAMENTO'::text
    when f.media_final >= 6.0 and f.frequencia_percent >= 75
      then 'APROVADO'::text
    when f.frequencia_percent < 75 then 'REPROVADO_POR_FALTA'::text
    when f.nota_rec is null and f.media_parcial < 6.0
      then 'EM_RECUPERACAO'::text
    else 'REPROVADO'::text
  end as resultado_final
from finais f;
