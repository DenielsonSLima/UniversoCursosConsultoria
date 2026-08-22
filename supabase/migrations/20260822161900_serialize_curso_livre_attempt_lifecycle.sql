begin;

alter function public.iniciar_tentativa_curso_livre_secure(uuid, uuid)
  rename to iniciar_tentativa_curso_livre_core_20260822;
revoke all on function public.iniciar_tentativa_curso_livre_core_20260822(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.iniciar_tentativa_curso_livre_secure(
  p_request_id uuid,
  p_matricula_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_matricula_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-assessment-matricula:' || p_matricula_id::text, 0
    ));
  end if;
  return public.iniciar_tentativa_curso_livre_core_20260822(
    p_request_id, p_matricula_id
  );
end;
$function$;

revoke all on function public.iniciar_tentativa_curso_livre_secure(uuid, uuid)
  from public, anon;
grant execute on function public.iniciar_tentativa_curso_livre_secure(uuid, uuid)
  to authenticated, service_role;

alter function public.entregar_tentativa_curso_livre_secure(uuid, uuid, jsonb)
  rename to entregar_tentativa_curso_livre_core_20260822;
revoke all on function public.entregar_tentativa_curso_livre_core_20260822(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.entregar_tentativa_curso_livre_secure(
  p_request_id uuid,
  p_tentativa_id uuid,
  p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula_id uuid;
begin
  select attempt.matricula_id into v_matricula_id
  from public.curso_livre_tentativas attempt
  where attempt.id = p_tentativa_id;
  if v_matricula_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'curso-livre-assessment-matricula:' || v_matricula_id::text, 0
    ));
  end if;
  return public.entregar_tentativa_curso_livre_core_20260822(
    p_request_id, p_tentativa_id, p_respostas
  );
end;
$function$;

revoke all on function public.entregar_tentativa_curso_livre_secure(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.entregar_tentativa_curso_livre_secure(uuid, uuid, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
