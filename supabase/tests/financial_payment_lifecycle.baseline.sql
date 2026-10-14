CREATE OR REPLACE FUNCTION public.gerar_ciclo_financeiro_apos_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_modalidade text;
  v_manual boolean := false;
begin
  if new.status = 'PAGO'
    and old.status is distinct from 'PAGO'
    and new.matricula_id is not null
  then
    select
      upper(coalesce(course.modalidade, '')),
      exists (
        select 1
        from internal_academic.technical_manual_cycle_policies policy
        where policy.turma_id = enrollment.turma_id
          and policy.active
          and policy.generation_mode = 'MANUAL'
      )
    into v_modalidade, v_manual
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    where enrollment.id = new.matricula_id;

    if v_modalidade in ('TECNICO', 'TÉCNICO') and not v_manual then
      if new.tipo_lancamento = 'MATRICULA' then
        perform public.gerar_parcelas_matricula(new.matricula_id);
      elsif new.tipo_lancamento = 'PARCELA' then
        perform public.gerar_rematricula_apos_parcelas(new.matricula_id);
      end if;
    end if;
  end if;
  return new;
end;
$function$
;

