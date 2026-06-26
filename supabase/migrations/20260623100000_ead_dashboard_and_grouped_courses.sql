create index if not exists idx_turmas_curso_id on public.turmas(curso_id);
create index if not exists idx_matriculas_turma_data on public.matriculas(turma_id, data_matricula);

create or replace function public.ead_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_cursos int;
  v_cursos_ativos int;
  v_cursos_inativos int;
  v_total_alunos int;
  v_months jsonb;
begin
  select count(*)::int,
         count(*) filter (where status = 'ativo')::int,
         count(*) filter (where status = 'inativo')::int
    into v_total_cursos, v_cursos_ativos, v_cursos_inativos
  from public.cursos
  where modalidade = 'EAD';

  select count(distinct m.aluno_id)::int
    into v_total_alunos
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  join public.cursos c on c.id = t.curso_id
  where c.modalidade = 'EAD';

  with months as (
    select (date_trunc('month', current_date) - (interval '1 month' * gs))::date as month_start
    from generate_series(2, 0, -1) gs
  ), counts as (
    select date_trunc('month', m.data_matricula)::date as month_start,
           count(distinct m.aluno_id)::int as total
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where c.modalidade = 'EAD'
      and m.data_matricula >= date_trunc('month', current_date) - interval '2 months'
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'label', to_char(months.month_start, 'Mon'),
    'month', to_char(months.month_start, 'YYYY-MM'),
    'total', coalesce(counts.total, 0)
  ) order by months.month_start)
  into v_months
  from months
  left join counts on counts.month_start = months.month_start;

  return jsonb_build_object(
    'totalCursos', coalesce(v_total_cursos, 0),
    'cursosAtivos', coalesce(v_cursos_ativos, 0),
    'cursosInativos', coalesce(v_cursos_inativos, 0),
    'totalAlunos', coalesce(v_total_alunos, 0),
    'ultimosTresMeses', coalesce(v_months, '[]'::jsonb)
  );
end;
$$;

create or replace function public.ead_get_cursos_grouped(
  p_status text default 'ativo',
  p_search text default '',
  p_area text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groups jsonb;
  v_areas jsonb;
  v_total int;
begin
  with filtered as (
    select c.*
    from public.cursos c
    where c.modalidade = 'EAD'
      and c.status = coalesce(nullif(p_status, ''), c.status)
      and (coalesce(nullif(p_area, ''), 'Todas') = 'Todas' or coalesce(c.area, 'Outros') = p_area)
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or c.nome ilike '%' || p_search || '%'
        or coalesce(c.descricao, '') ilike '%' || p_search || '%'
      )
  ), grouped as (
    select coalesce(area, 'Outros') as area,
           count(*)::int as total,
           jsonb_agg(to_jsonb(filtered) order by nome) as cursos
    from filtered
    group by coalesce(area, 'Outros')
  )
  select coalesce(jsonb_agg(jsonb_build_object('area', area, 'total', total, 'cursos', cursos) order by area), '[]'::jsonb)
  into v_groups
  from grouped;

  select coalesce(jsonb_agg(area order by area), '[]'::jsonb)
  into v_areas
  from (
    select distinct coalesce(area, 'Outros') as area
    from public.cursos
    where modalidade = 'EAD'
  ) areas;

  select count(*)::int into v_total
  from public.cursos
  where modalidade = 'EAD'
    and status = coalesce(nullif(p_status, ''), status);

  return jsonb_build_object(
    'groups', v_groups,
    'areas', v_areas,
    'total', coalesce(v_total, 0)
  );
end;
$$;
