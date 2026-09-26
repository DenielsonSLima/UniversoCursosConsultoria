-- Iniciar a turma libera o vínculo acadêmico dos alunos já matriculados.
begin;

create or replace function internal_academic.activate_enrollments_on_class_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula_id uuid;
begin
  if new.status <> 'EM_ANDAMENTO' or old.status = 'EM_ANDAMENTO' then
    return new;
  end if;
  for v_matricula_id in
    select id from public.matriculas
    where turma_id = new.id and fluxo_operacional = 'REGULAR'
      and status in ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
    order by id
  loop
    perform internal_academic.activate_started_technical_enrollment(v_matricula_id);
  end loop;
  return new;
end;
$function$;

revoke all on function internal_academic.activate_enrollments_on_class_start()
  from public, anon, authenticated, service_role;

create trigger activate_technical_enrollments_on_class_start
after update of status on public.turmas
for each row when (old.status is distinct from new.status)
execute function internal_academic.activate_enrollments_on_class_start();

-- Repara apenas vínculos regulares pendentes. Não reabre saída acadêmica,
-- conclusão ou implantação, nem altera títulos, quitações e parcelas.
do $reconcile$
declare
  v_matricula_id uuid;
  v_previous_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Migração administrativa: a guarda existente continua verificando o papel.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  for v_matricula_id in
    select matricula.id
    from public.matriculas matricula
    join public.turmas turma on turma.id = matricula.turma_id
    join public.cursos curso on curso.id = turma.curso_id
    where matricula.fluxo_operacional = 'REGULAR'
      and matricula.status in ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
      and turma.status = 'EM_ANDAMENTO'
      and upper(coalesce(curso.modalidade, '')) in ('TECNICO', 'TÉCNICO')
    order by turma.id, matricula.id
  loop
    perform internal_academic.activate_started_technical_enrollment(v_matricula_id);
  end loop;
  perform set_config('request.jwt.claim.role', coalesce(v_previous_role, ''), true);
end;
$reconcile$;

commit;
