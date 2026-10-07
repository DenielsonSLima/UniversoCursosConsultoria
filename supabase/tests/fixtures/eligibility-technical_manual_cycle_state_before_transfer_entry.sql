CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb; v_cycle jsonb;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_local_fee(p_matricula_id);
  v_cycle:=v_state->'cicloGerado';
  if jsonb_typeof(v_cycle)='object' and not (v_cycle ? 'quantidadeBancaria') then
    v_state:=jsonb_set(v_state,'{cicloGerado}',v_cycle||jsonb_build_object(
      'quantidadeBancaria',v_cycle->'quantidadeItens','quantidadeLocal',0));
  end if;
  return v_state||jsonb_build_object('matriculaLocal',
    internal_academic.manual_cycle_local_fee_summary(p_matricula_id));
end;
$function$
