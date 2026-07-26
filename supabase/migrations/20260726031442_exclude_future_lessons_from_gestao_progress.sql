-- Future planned classes must not advance the current curriculum component.
create or replace function public.get_gestao_turmas_academic_progress(
  p_turma_ids uuid[]
)
returns table (
  turma_id uuid,
  total_disciplinas bigint,
  disciplinas_concluidas bigint,
  grade_concluida boolean,
  modulo_atual_id uuid,
  modulo_atual_nome text,
  modulo_atual_ordem integer,
  disciplina_atual_id uuid,
  disciplina_atual_nome text,
  disciplina_atual_ordem bigint,
  professor_atual text,
  carga_horaria numeric,
  horas_realizadas numeric,
  proxima_aula_data date,
  proxima_aula_titulo text
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with requested_turmas as (
    select t.id, t.curso_id
    from public.turmas t
    where t.id = any(coalesce(p_turma_ids, array[]::uuid[]))
  ), aulas_horas as (
    select
      a.turma_id,
      a.disciplina_id,
      sum(a.carga_horaria) as horas
    from public.aulas_turma a
    join requested_turmas rt on rt.id = a.turma_id
    where a.data_aula is not null
      and a.data_aula <= (pg_catalog.timezone('America/Maceio', now()))::date
    group by a.turma_id, a.disciplina_id
  ), atividades_horas as (
    select
      ae.turma_id,
      ae.disciplina_id,
      sum(ae.carga_horaria_compensacao) as horas
    from public.atividades_extra_classe ae
    join requested_turmas rt on rt.id = ae.turma_id
    where ae.status = 'PUBLICADA'
      and (
        ae.prazo_entrega is null
        or ae.prazo_entrega <= (pg_catalog.timezone('America/Maceio', now()))::date
      )
    group by ae.turma_id, ae.disciplina_id
  ), grade_ordenada as (
    select
      rt.id as turma_id,
      mo.id as modulo_id,
      mo.nome as modulo_nome,
      mo.ordem as modulo_ordem,
      d.id as disciplina_id,
      d.nome as disciplina_nome,
      d.carga_horaria,
      td.professor_nome,
      row_number() over (
        partition by rt.id
        order by
          mo.ordem nulls last,
          mo.created_at,
          mo.id,
          d.ordem nulls last,
          d.created_at,
          d.nome,
          d.id
      ) as disciplina_ordem,
      count(*) over (partition by rt.id) as total_disciplinas
    from requested_turmas rt
    join public.modulos mo on mo.curso_id = rt.curso_id
    join public.disciplinas d on d.modulo_id = mo.id
    left join public.turmas_disciplinas td
      on td.turma_id = rt.id
     and td.disciplina_id = d.id
  ), progresso as (
    select
      go.*,
      coalesce(ah.horas, 0) + coalesce(aeh.horas, 0) as horas_realizadas,
      (
        go.carga_horaria > 0
        and coalesce(ah.horas, 0) + coalesce(aeh.horas, 0) >= go.carga_horaria
      ) as carga_concluida
    from grade_ordenada go
    left join aulas_horas ah
      on ah.turma_id = go.turma_id
     and ah.disciplina_id = go.disciplina_id
    left join atividades_horas aeh
      on aeh.turma_id = go.turma_id
     and aeh.disciplina_id = go.disciplina_id
  ), resumo as (
    select
      p.turma_id,
      max(p.total_disciplinas) as total_disciplinas,
      count(*) filter (where p.carga_concluida) as disciplinas_concluidas
    from progresso p
    group by p.turma_id
  ), disciplina_atual as (
    select distinct on (p.turma_id)
      p.turma_id,
      p.modulo_id,
      p.modulo_nome,
      p.modulo_ordem,
      p.disciplina_id,
      p.disciplina_nome,
      p.disciplina_ordem,
      p.professor_nome,
      p.carga_horaria,
      p.horas_realizadas
    from progresso p
    where not p.carga_concluida
    order by p.turma_id, p.disciplina_ordem
  ), proxima_aula as (
    select distinct on (a.turma_id)
      a.turma_id,
      a.data_aula,
      a.titulo
    from public.aulas_turma a
    join requested_turmas rt on rt.id = a.turma_id
    where a.data_aula >= (pg_catalog.timezone('America/Maceio', now()))::date
    order by a.turma_id, a.data_aula, a.created_at, a.id
  )
  select
    rt.id,
    coalesce(r.total_disciplinas, 0),
    coalesce(r.disciplinas_concluidas, 0),
    coalesce(r.total_disciplinas, 0) > 0
      and coalesce(r.disciplinas_concluidas, 0) = coalesce(r.total_disciplinas, 0),
    da.modulo_id,
    da.modulo_nome,
    da.modulo_ordem,
    da.disciplina_id,
    da.disciplina_nome,
    da.disciplina_ordem,
    coalesce(da.professor_nome, 'Não definido'),
    da.carga_horaria,
    da.horas_realizadas,
    pa.data_aula,
    pa.titulo
  from requested_turmas rt
  left join resumo r on r.turma_id = rt.id
  left join disciplina_atual da on da.turma_id = rt.id
  left join proxima_aula pa on pa.turma_id = rt.id;
$function$;

revoke all on function public.get_gestao_turmas_academic_progress(uuid[])
  from public, anon;
grant execute on function public.get_gestao_turmas_academic_progress(uuid[])
  to authenticated, service_role;
