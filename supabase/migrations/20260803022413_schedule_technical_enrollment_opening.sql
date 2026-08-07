create or replace function internal_academic.open_scheduled_technical_enrollments()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_opened integer := 0;
  v_today date := (pg_catalog.timezone('America/Maceio', pg_catalog.now()))::date;
begin
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  for v_turma in
    select t.id
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where c.modalidade = 'TECNICO'
      and t.status = 'PLANEJADA'
      and t.permitir_inscricoes_online
      and (t.data_inicio_inscricao is null or t.data_inicio_inscricao <= v_today)
      and (t.data_fim_inscricao is null or t.data_fim_inscricao >= v_today)
    order by t.id
    for update of t skip locked
  loop
    perform public.alterar_status_turma_tecnica(
      v_turma.id,
      'INSCRICOES_ABERTAS',
      null::uuid
    );
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$function$;

revoke all on function internal_academic.open_scheduled_technical_enrollments()
  from public, anon, authenticated;
grant execute on function internal_academic.open_scheduled_technical_enrollments()
  to service_role;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'open-scheduled-technical-enrollments'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'open-scheduled-technical-enrollments',
    '*/5 * * * *',
    'select internal_academic.open_scheduled_technical_enrollments();'
  );
end;
$schedule$;

comment on function internal_academic.open_scheduled_technical_enrollments() is
  'Abre, de forma idempotente, inscrições técnicas planejadas cuja janela já esteja vigente.';
