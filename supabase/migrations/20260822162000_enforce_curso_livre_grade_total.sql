begin;

alter function public.salvar_grade_curso_livre_gestao_secure(uuid, uuid, text, jsonb)
  rename to salvar_grade_curso_livre_gestao_core_20260822;
revoke all on function public.salvar_grade_curso_livre_gestao_core_20260822(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.salvar_grade_curso_livre_gestao_secure(
  p_request_id uuid,
  p_curso_id uuid,
  p_expected_fingerprint text,
  p_modulos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_response jsonb;
  v_expected_hours integer;
  v_actual_hours bigint;
begin
  v_response := public.salvar_grade_curso_livre_gestao_core_20260822(
    p_request_id, p_curso_id, p_expected_fingerprint, p_modulos
  );
  if coalesce((v_response ->> 'replayed')::boolean, false) then
    return v_response;
  end if;
  select course.carga_horaria, coalesce(sum(discipline.carga_horaria), 0)
  into v_expected_hours, v_actual_hours
  from public.cursos course
  left join public.modulos module on module.curso_id = course.id
  left join public.disciplinas discipline on discipline.modulo_id = module.id
  where course.id = p_curso_id
  group by course.carga_horaria;
  if v_expected_hours is null or v_actual_hours <> v_expected_hours then
    raise exception 'A soma da grade Livre deve corresponder à carga horária do curso.'
      using errcode = '23514';
  end if;
  return v_response;
end;
$function$;

revoke all on function public.salvar_grade_curso_livre_gestao_secure(
  uuid, uuid, text, jsonb
) from public, anon;
grant execute on function public.salvar_grade_curso_livre_gestao_secure(
  uuid, uuid, text, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
