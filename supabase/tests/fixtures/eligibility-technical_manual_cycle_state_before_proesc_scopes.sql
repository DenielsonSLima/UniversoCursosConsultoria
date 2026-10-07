CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_proesc_scopes(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
  v_coverage internal_academic.technical_external_cycle_coverage%rowtype;
begin
  v_state := internal_academic.technical_manual_cycle_state_before_proesc_coverage(p_matricula_id);
  select coverage.* into v_coverage
  from internal_academic.technical_external_cycle_coverage coverage
  where coverage.matricula_id = p_matricula_id and coverage.state = 'CONFIRMED';
  if not found then return v_state; end if;
  -- Coverage records describe external issuance, never local Banese issuance.
  return v_state || jsonb_build_object(
    'estado', 'PROTEGIDO_EXISTENTE', 'podeGerar', false,
    'proximoCicloNumero', null, 'primeiroVencimentoSugerido', null,
    'bloqueio', null,
    'cicloGerado', jsonb_build_object(
      'numero', 2, 'status', 'EXTERNAL_COVERAGE',
      'origemEmissao', 'PROESC', 'abrangencia', v_coverage.scope,
      'quantidadeItens', v_coverage.item_count,
      'total', to_char(v_coverage.total_amount, 'FM999999990.00'),
      'emitidosBanese', 0, 'pendentesEmissao', 0, 'emRevisao', 0
    )
  );
end;
$function$
