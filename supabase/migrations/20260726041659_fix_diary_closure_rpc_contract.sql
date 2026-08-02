create or replace function public.get_diario_fechamento(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table (
  bloqueio text,
  status text,
  horas_realizadas numeric,
  carga_horaria numeric,
  progresso_percent numeric,
  bloqueado_em timestamp with time zone,
  motivo text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (
    public.can_operate_turma_academics(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  ) then
    raise exception 'Sem permissão para consultar o fechamento deste diário.'
      using errcode = '42501';
  end if;

  return query
  with carga as (
    select
      coalesce(sum(a.carga_horaria) filter (
        where a.data_aula is null
          or a.data_aula <= pg_catalog.timezone('America/Maceio', now())::date
      ), 0)
      + coalesce((
        select sum(ae.carga_horaria_compensacao)
        from public.atividades_extra_classe ae
        where ae.turma_id = p_turma_id
          and ae.disciplina_id = p_disciplina_id
          and ae.status = 'PUBLICADA'
          and (
            ae.prazo_entrega is null
            or ae.prazo_entrega <= pg_catalog.timezone('America/Maceio', now())::date
          )
      ), 0) as realizadas
    from public.aulas_turma a
    where a.turma_id = p_turma_id
      and a.disciplina_id = p_disciplina_id
  )
  select
    td.bloqueio_diario::text,
    (
      case
        when td.bloqueio_diario = 'TOTAL' then 'FECHADO'
        when td.bloqueio_diario = 'PROFESSOR' then 'EM_REVISAO'
        when c.realizadas >= d.carga_horaria then 'AGUARDANDO_REVISAO'
        else 'EM_ANDAMENTO'
      end
    )::text,
    c.realizadas::numeric,
    d.carga_horaria::numeric,
    (
      case when d.carga_horaria > 0
        then least(100, round((c.realizadas / d.carga_horaria) * 100, 1))
        else 0
      end
    )::numeric,
    td.diario_bloqueado_em,
    td.diario_bloqueio_motivo::text
  from public.turmas_disciplinas td
  join public.disciplinas d on d.id = td.disciplina_id
  cross join carga c
  where td.turma_id = p_turma_id
    and td.disciplina_id = p_disciplina_id;
end;
$function$;

revoke all on function public.get_diario_fechamento(uuid, uuid) from public;
grant execute on function public.get_diario_fechamento(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
