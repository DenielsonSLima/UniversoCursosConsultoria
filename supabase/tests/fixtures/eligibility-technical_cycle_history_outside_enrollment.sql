CREATE OR REPLACE FUNCTION internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with person as (select aluno_id from public.matriculas where id=p_matricula_id),
  other_enrollments as (select m.id from public.matriculas m join person p on p.aluno_id=m.aluno_id
    where m.id<>p_matricula_id)
  select exists(select 1 from public.contas_receber r
    where (r.cliente_id in (select aluno_id from person) and r.matricula_id is distinct from p_matricula_id)
      or r.matricula_id in (select id from other_enrollments))
    or exists(select 1 from internal_proesc.enrollment_sources s
      join other_enrollments m on m.id=s.matricula_id)
    or exists(select 1 from internal_proesc.obligation_links l
      join other_enrollments m on m.id=l.matricula_id)
    or exists(select 1 from internal_proesc.enrollment_cycle_evidence e
      join other_enrollments m on m.id=e.matricula_id)
    or exists(select 1 from internal_academic.technical_external_cycle_coverage c
      join other_enrollments m on m.id=c.matricula_id)
    or exists(select 1 from internal_academic.technical_manual_cycle_runs r
      join other_enrollments m on m.id=r.matricula_id);
$function$
;

