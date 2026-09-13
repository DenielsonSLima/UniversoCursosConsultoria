-- Keep the existing table RLS and aggregate lesson sessions in the database.
-- Undated lessons remain individual; created_at is never an academic date.
create function public.get_aulas_diario_agrupadas(p_turma_id uuid,p_disciplina_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible_lessons as (
    select a.*,case a.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end as session_order,
      case when a.data_aula is null then 'id:'||a.id::text else 'date:'||a.data_aula::text end as encounter
    from public.aulas_turma a where a.turma_id=p_turma_id and a.disciplina_id=p_disciplina_id
  ), encounters as (
    select encounter,data_aula,
      (array_agg(id order by session_order,created_at,id))[1] as id,
      (array_agg(titulo order by session_order,created_at,id))[1] as titulo,
      sum(carga_horaria) as carga,
      jsonb_agg(jsonb_build_object('id',id,'periodo',sessao,'cargaHoraria',carga_horaria)
        order by session_order,created_at,id) as sessoes
    from visible_lessons group by encounter,data_aula
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,
    'cargaHoraria',carga,'dataAula',data_aula,'sessoes',sessoes)
    order by data_aula nulls last,id),'[]'::jsonb) from encounters;
$$;
revoke all on function public.get_aulas_diario_agrupadas(uuid,uuid) from public,anon;
grant execute on function public.get_aulas_diario_agrupadas(uuid,uuid) to authenticated,service_role;
