CREATE OR REPLACE FUNCTION internal_academic.technical_local_cycle_eligible(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_source uuid; v_person uuid; v_source_run internal_academic.technical_manual_cycle_runs%rowtype;
begin
  if to_regprocedure('internal_academic.transfer_financial_origin(uuid)') is null then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  v_source:=internal_academic.transfer_financial_origin(p_matricula_id);
  if v_source is null then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  if not internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id) then
    return internal_academic.technical_local_cycle_eligible_before_internal_transfer(p_matricula_id);
  end if;
  if not coalesce(internal_academic.transfer_source_cycle_one_complete(p_matricula_id),false) then return false; end if;
  select aluno_id into v_person from public.matriculas where id=p_matricula_id;
  select * into strict v_source_run from internal_academic.technical_manual_cycle_runs
    where matricula_id=v_source and cycle_number=1 and state='LOCAL_CREATED';
  return internal_academic.is_manual_technical_enrollment(p_matricula_id)
    and not exists(select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where m.id=p_matricula_id and s.phase<>'CONFIRMED')
    and not exists(select 1 from public.matriculas m join internal_proesc.enrollment_cycle_evidence e on e.matricula_id=m.id
      where m.aluno_id=v_person)
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
      join public.matriculas m on m.id=run.matricula_id where m.aluno_id=v_person
      and not (run.matricula_id=v_source and run.cycle_number=1 and run.state='LOCAL_CREATED')
      and not (run.matricula_id=p_matricula_id and run.cycle_number=2 and run.state in ('GENERATING','LOCAL_CREATED')))
    and not exists(select 1 from public.contas_receber r
      where (r.cliente_id=v_person or r.matricula_id in (select id from public.matriculas where aluno_id=v_person))
        and not (r.matricula_id=v_source and r.id=any(v_source_run.receivable_ids))
        and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
          join public.matriculas m on m.id=run.matricula_id
          where run.matricula_id=p_matricula_id and run.cycle_number=2
            and r.matricula_id=run.matricula_id and r.turma_id=run.turma_id and r.cliente_id=m.aluno_id
            and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
            and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'='2'
            and (run.state='LOCAL_CREATED' and r.id=any(run.receivable_ids)
              or run.state='GENERATING' and run.request_id::text=current_setting('app.technical_manual_cycle_request_id',true))));
exception when others then return false;
end;
$function$
;

