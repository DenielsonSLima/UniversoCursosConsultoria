CREATE OR REPLACE FUNCTION internal_proesc.enrollment_financial_block(p_matricula_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when internal_academic.technical_imported_cycle_has_conflict(
      p_matricula_id
    ) then 'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE'
    when internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    ) then 'PROESC_CONTRATO_EXTERNO'
    when internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    ) then null
    when exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id
    ) then 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA'
    when internal_academic.technical_local_cycle_eligible(p_matricula_id)
      then null
    else internal_proesc.enrollment_financial_block_before_individual_admission(
      p_matricula_id
    )
  end;
$function$
;

