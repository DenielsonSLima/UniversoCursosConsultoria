begin;

create or replace function public.should_skip_technical_manual_future_sync(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    join internal_academic.technical_manual_cycle_policies policy
      on policy.turma_id = class.id
    where enrollment.id = p_matricula_id
      and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
      and policy.active = true
      and policy.generation_mode = 'MANUAL'
  );
$function$;

revoke all on function
  public.should_skip_technical_manual_future_sync(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.should_skip_technical_manual_future_sync(uuid)
  to service_role;

comment on function public.should_skip_technical_manual_future_sync(uuid) is
  'Service-role guard that suppresses automatic future billing only for active manual technical-cycle enrollments.';

notify pgrst, 'reload schema';

commit;
