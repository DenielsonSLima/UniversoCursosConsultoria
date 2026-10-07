CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_local_fee(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb;
begin
  if internal_academic.technical_local_cycle_eligible(p_matricula_id) then
    return internal_academic.technical_manual_cycle_state_before_external_history(p_matricula_id);
  end if;
  v_state:=internal_academic.technical_manual_cycle_state_before_individual_admission(p_matricula_id);
  if internal_academic.is_manual_technical_enrollment(p_matricula_id) and (
    not coalesce((v_state->>'habilitado')::boolean,false)
    or internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id)
    or (v_state->>'estado'='ELEGIVEL' and v_state->>'proximoCicloNumero'='1')
  ) then
    return v_state||jsonb_build_object('habilitado',true,'modo','MANUAL',
      'estado','PROTEGIDO_EXISTENTE','podeGerar',false,'cicloMaximo',2,
      'proximoCicloNumero',null,'primeiroVencimentoSugerido',null,
      'bloqueio',jsonb_build_object('codigo','HISTORICO_FINANCEIRO_EXISTENTE',
        'mensagem','Há histórico financeiro vinculado ao aluno. Confira as cobranças existentes antes de qualquer novo ciclo.'));
  end if;
  return v_state;
end;
$function$
