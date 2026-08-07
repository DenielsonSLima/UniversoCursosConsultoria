-- Consolida no banco os KPIs úteis do resumo da turma.
-- O progresso considera a carga horária já entregue até hoje e a saúde
-- financeira considera somente valores pagos ou vencidos.

create or replace function public.internal_get_turma_resumo_academico_20260719(
  p_turma_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with matriculas_stats as (
    select
      count(*) as total_matriculas,
      count(distinct m.aluno_id) as total_alunos,
      count(distinct m.aluno_id) filter (where m.status = 'ATIVO') as alunos_ativos
    from public.matriculas m
    where m.turma_id = p_turma_id
  ), grade as (
    select
      td.disciplina_id,
      greatest(coalesce(d.carga_horaria, 0), 0)::numeric as carga_prevista
    from public.turmas_disciplinas td
    join public.disciplinas d on d.id = td.disciplina_id
    where td.turma_id = p_turma_id
  ), aulas_horas as (
    select
      a.disciplina_id,
      coalesce(sum(a.carga_horaria), 0)::numeric as carga_realizada
    from public.aulas_turma a
    where a.turma_id = p_turma_id
      and a.data_aula is not null
      and a.data_aula <= (pg_catalog.timezone('America/Maceio', now()))::date
    group by a.disciplina_id
  ), atividades_horas as (
    select
      ae.disciplina_id,
      coalesce(sum(ae.carga_horaria_compensacao), 0)::numeric as carga_realizada
    from public.atividades_extra_classe ae
    where ae.turma_id = p_turma_id
      and ae.status = 'PUBLICADA'
      and (
        ae.prazo_entrega is null
        or ae.prazo_entrega <= (pg_catalog.timezone('America/Maceio', now()))::date
      )
    group by ae.disciplina_id
  ), progresso_stats as (
    select
      round(
        sum(
          least(
            coalesce(ah.carga_realizada, 0) + coalesce(aeh.carga_realizada, 0),
            g.carga_prevista
          )
        )
        / nullif(sum(g.carga_prevista), 0)
        * 100,
        1
      ) as progresso_curso
    from grade g
    left join aulas_horas ah on ah.disciplina_id = g.disciplina_id
    left join atividades_horas aeh on aeh.disciplina_id = g.disciplina_id
  ), financeiro_stats as (
    select
      coalesce(
        sum(coalesce(cr.valor_pago, cr.valor)) filter (where cr.status = 'PAGO'),
        0
      )::numeric as recebido,
      coalesce(
        sum(greatest(cr.valor - coalesce(cr.valor_pago, 0), 0)) filter (
          where cr.status = 'VENCIDO'
             or (
               cr.status = 'PENDENTE'
               and cr.data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date
             )
        ),
        0
      )::numeric as vencido
    from public.contas_receber cr
    where cr.turma_id = p_turma_id
  ), saude_financeira as (
    select
      round(
        fs.recebido / nullif(fs.recebido + fs.vencido, 0) * 100,
        1
      ) as percentual
    from financeiro_stats fs
  )
  select jsonb_build_object(
    'totalMatriculas', ms.total_matriculas,
    'totalAlunos', ms.total_alunos,
    'alunosAtivos', ms.alunos_ativos,
    'progressoCurso', ps.progresso_curso,
    'saudeFinanceiraPercentual', sf.percentual,
    'saudeFinanceiraStatus', case
      when sf.percentual is null then 'SEM_DADOS'
      when sf.percentual >= 90 then 'SAUDAVEL'
      when sf.percentual >= 75 then 'ATENCAO'
      else 'CRITICA'
    end
  )
  from matriculas_stats ms
  cross join progresso_stats ps
  cross join saude_financeira sf;
$function$;

revoke all on function public.internal_get_turma_resumo_academico_20260719(uuid)
  from public, anon, authenticated;
grant execute on function public.internal_get_turma_resumo_academico_20260719(uuid)
  to service_role;
