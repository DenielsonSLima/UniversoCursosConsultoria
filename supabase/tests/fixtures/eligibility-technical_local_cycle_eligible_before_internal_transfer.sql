CREATE OR REPLACE FUNCTION internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with person as (
    select m.aluno_id,m.turma_id from public.matriculas m
    where m.id=p_matricula_id
      and internal_academic.is_manual_technical_enrollment(m.id)
  ), enrollments as (
    select m.id from public.matriculas m join person p on p.aluno_id=m.aluno_id
  )
  select exists(select 1 from person)
    and not exists(select 1 from person p join internal_proesc.class_scopes s
      on s.turma_id=p.turma_id where s.phase<>'CONFIRMED')
    and not exists(select 1 from internal_proesc.enrollment_sources s
      join enrollments e on e.id=s.matricula_id)
    and not exists(select 1 from internal_proesc.obligation_links l
      join enrollments e on e.id=l.matricula_id)
    and not exists(select 1 from internal_proesc.enrollment_cycle_evidence c
      join enrollments e on e.id=c.matricula_id)
    and not exists(select 1 from internal_academic.technical_external_cycle_coverage c
      join enrollments e on e.id=c.matricula_id)
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs r
      join enrollments e on e.id=r.matricula_id
      where r.matricula_id<>p_matricula_id or r.state='PROTECTED_EXISTING'
        or (r.cycle_number=2 and not exists(
          select 1 from internal_academic.technical_transfer_entry_plans entry
          where entry.matricula_id=r.matricula_id and entry.initial_cycle=2)
        and not exists(
          select 1 from internal_academic.technical_manual_cycle_runs first_run
          where first_run.matricula_id=r.matricula_id and first_run.cycle_number=1
            and first_run.state='LOCAL_CREATED')))
    and not exists(select 1 from public.contas_receber cr
      where (cr.cliente_id in (select aluno_id from person)
        or cr.matricula_id in (select id from enrollments))
        and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id=p_matricula_id and run.turma_id=cr.turma_id
            and cr.matricula_id=run.matricula_id
            and cr.cliente_id=(select aluno_id from person)
            and run.state in ('GENERATING','LOCAL_CREATED')
            and cr.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
            and cr.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=run.cycle_number::text
            and (cr.id=any(run.receivable_ids) or (run.state='GENERATING'
              and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true)))))
$function$
;

