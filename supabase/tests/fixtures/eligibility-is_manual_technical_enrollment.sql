CREATE OR REPLACE FUNCTION internal_academic.is_manual_technical_enrollment(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.matriculas m
    join public.turmas t on t.id=m.turma_id join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO'));
$function$
;

