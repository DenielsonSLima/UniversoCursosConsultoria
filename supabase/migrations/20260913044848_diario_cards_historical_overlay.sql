-- Add historical evidence to the diary list without altering its operational rows.
create function public.get_diarios_turma_com_historico(p_turma_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  with cards as materialized (
    select d.* from public.get_diarios_turma(p_turma_id) with ordinality d
  ), permitted_imports as materialized (
    select i.*
    from internal_academic.diario_importacoes i
    join cards c on c.disciplina_id = i.disciplina_id
    where i.turma_id = p_turma_id
      and (
        coalesce((select auth.role()), '') = 'service_role'
        or coalesce(public.gestor_can_read_diario_results(p_turma_id), false)
        or coalesce(public.is_professor_assigned_disciplina(p_turma_id, i.disciplina_id), false)
      )
  ), lessons as (
    select a.importacao_id, count(*) as quantidade,
      bool_and(a.data_estado = 'CONFERIDO' and a.data_aula is not null) as datas_conferidas,
      min(a.data_aula) as primeira, max(a.data_aula) as ultima
    from internal_academic.diario_aulas_importadas a
    join permitted_imports i on i.id = a.importacao_id
    group by a.importacao_id
  ), attendance as (
    select f.importacao_id, count(*) as quantidade,
      count(*) filter (where f.estado = 'CONFERIDO') as conferidas
    from internal_academic.diario_frequencias_importadas f
    join permitted_imports i on i.id = f.importacao_id
    join internal_academic.diario_resultados_importados r
      on (r.id, r.importacao_id) = (f.resultado_id, f.importacao_id) and r.ativo
    group by f.importacao_id
  )
  select coalesce(jsonb_agg(
    (to_jsonb(c) - 'ordinality') || jsonb_build_object('historico',
      case when i.id is not null then jsonb_build_object(
        'id', i.id, 'origem', 'DOCX_HISTORICO', 'sourceName', i.source_name,
        'readOnly', true, 'estado', 'EM_CONFERENCIA',
        'aulasDocumentadas', coalesce(a.quantidade, 0),
        'horasDocumentadas', i.carga_aulas_documental,
        'horasOficiais', i.carga_aulas_oficial, 'horasEstado', i.horas_estado,
        'datasEstado', case when a.datas_conferidas then 'CONFERIDO' else 'EM_CONFERENCIA' end,
        'primeiraAula', case when a.datas_conferidas then a.primeira end,
        'ultimaAula', case when a.datas_conferidas then a.ultima end,
        'frequenciasRegistradas', coalesce(f.quantidade, 0),
        'frequenciasConferidas', coalesce(f.conferidas, 0)
      ) else null end
    ) order by c.ordinality
  ), '[]'::jsonb)
  from cards c
  left join permitted_imports i on i.disciplina_id = c.disciplina_id
  left join lessons a on a.importacao_id = i.id
  left join attendance f on f.importacao_id = i.id;
$function$;

revoke all on function public.get_diarios_turma_com_historico(uuid) from public, anon;
grant execute on function public.get_diarios_turma_com_historico(uuid) to authenticated, service_role;
