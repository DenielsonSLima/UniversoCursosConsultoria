create or replace function public.ead_get_cursos_grouped(
  p_status text default 'ativo',
  p_search text default '',
  p_area text default null,
  p_group_by text default 'area',
  p_sort text default 'nome_asc'
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
  v_group_mode text := coalesce(nullif(p_group_by, ''), 'area');
  v_sort_mode text := coalesce(nullif(p_sort, ''), 'nome_asc');
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
    select case when v_group_mode = 'none' then 'Todos os cursos' else coalesce(area, 'Outros') end as area,
           count(*)::int as total,
           jsonb_agg(
             to_jsonb(filtered)
             order by
               case when v_sort_mode = 'area_asc' then coalesce(filtered.area, 'Outros') end asc,
               case when v_sort_mode = 'nome_desc' then filtered.nome end desc,
               filtered.nome asc
           ) as cursos
    from filtered
    group by case when v_group_mode = 'none' then 'Todos os cursos' else coalesce(area, 'Outros') end
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('area', area, 'total', total, 'cursos', cursos)
      order by case when v_group_mode = 'none' then 0 else 1 end, area
    ),
    '[]'::jsonb
  )
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
