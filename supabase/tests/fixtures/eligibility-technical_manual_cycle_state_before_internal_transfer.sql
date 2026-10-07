CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_internal_transfer(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb; v_plan internal_academic.technical_transfer_entry_plans%rowtype;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  select * into v_plan from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found then return v_state; end if;
  v_state:=v_state||jsonb_build_object('planoEntrada',jsonb_build_object(
    'cicloInicial',v_plan.initial_cycle,'quantidadeParcelas',v_plan.installment_count,
    'primeiroVencimento',v_plan.first_due_date,'justificativaCiclo2',v_plan.cycle_two_reason,'requestId',v_plan.request_id));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_plan.initial_cycle,
      'primeiroVencimentoSugerido',v_plan.first_due_date,'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
    v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
      jsonb_build_object('base',v_state#>>'{politica,fingerprint}','entry',v_plan.financial_plan,
        'requestId',v_plan.request_id)::text,'sha256'),'hex')));
  end if;
  return v_state;
end;
$function$
