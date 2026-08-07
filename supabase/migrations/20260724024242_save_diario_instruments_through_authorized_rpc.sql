create or replace function public.set_diario_instrumentos_avaliativos(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_instrumentos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_saved jsonb;
begin
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or public.can_operate_turma_academics(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  ) then
    raise exception 'Acesso ao diário não autorizado.'
      using errcode = '42501';
  end if;

  if p_instrumentos is null
    or jsonb_typeof(p_instrumentos) <> 'object'
    or not (p_instrumentos ?& array['p', 'ti', 'tg', 's', 'cq', 'o'])
    or p_instrumentos - 'p' - 'ti' - 'tg' - 's' - 'cq' - 'o' <> '{}'::jsonb
    or jsonb_typeof(p_instrumentos -> 'p') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'ti') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'tg') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 's') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'cq') <> 'boolean'
    or jsonb_typeof(p_instrumentos -> 'o') <> 'boolean'
  then
    raise exception 'Configuração de instrumentos avaliativos inválida.'
      using errcode = '22023';
  end if;

  update public.turmas_disciplinas td
  set instrumentos_avaliativos = p_instrumentos
  where td.turma_id = p_turma_id
    and td.disciplina_id = p_disciplina_id
  returning td.instrumentos_avaliativos into v_saved;

  if v_saved is null then
    raise exception 'Disciplina não vinculada à turma.'
      using errcode = 'P0002';
  end if;

  return v_saved;
end;
$function$;

revoke all on function public.set_diario_instrumentos_avaliativos(
  uuid, uuid, jsonb
) from public;
revoke all on function public.set_diario_instrumentos_avaliativos(
  uuid, uuid, jsonb
) from anon;
grant execute on function public.set_diario_instrumentos_avaliativos(
  uuid, uuid, jsonb
) to authenticated;
grant execute on function public.set_diario_instrumentos_avaliativos(
  uuid, uuid, jsonb
) to service_role;
