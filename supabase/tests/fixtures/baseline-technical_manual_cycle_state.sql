CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
begin
  v_state := internal_academic
    .technical_manual_cycle_state_before_durable_imported_history(
      p_matricula_id
    );
  if internal_academic.technical_imported_cycle_exists(p_matricula_id, 2) then
    if v_state ->> 'estado' in (
      'PROTEGIDO_EXISTENTE', 'JA_GERADO', 'CICLOS_CONCLUIDOS'
    ) then
      return v_state - 'conferenciaProesc';
    end if;
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'proximoCicloNumero', null, 'primeiroVencimentoSugerido', null,
      'bloqueio', jsonb_build_object(
        'codigo', case
          when internal_academic.technical_imported_cycle_has_conflict(
            p_matricula_id
          ) then 'CICLO_IMPORTADO_ORIGENS_CONFLITANTES'
          else 'PROESC_CONTRATO_EXTERNO'
        end,
        'mensagem', 'O segundo ciclo já possui cobertura confirmada.'
      )
    );
  end if;
  if internal_academic.technical_imported_cycle_has_conflict(p_matricula_id) then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object(
        'codigo', 'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE',
        'mensagem', 'A identidade ou a origem do histórico exige revisão.'
      )
    );
  end if;
  if internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    )
    and v_state ->> 'estado' not in ('JA_GERADO', 'CICLOS_CONCLUIDOS')
    and (v_state ->> 'estado' <> 'PROTEGIDO_EXISTENTE'
      or internal_academic.technical_imported_banese_cycle_is_durable(
        p_matricula_id, 1
      ))
    and coalesce(v_state #>> '{bloqueio,codigo}', '') not in (
      'STATUS_ACADEMICO', 'SEM_CONFIGURACAO'
    )
  then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'ELEGIVEL', 'podeGerar', true,
      'cicloBaseHistorico', 1, 'proximoCicloNumero', 2,
      'primeiroVencimentoSugerido', null, 'bloqueio', null,
      'criterioElegibilidade', 'HISTORICO_EXTERNO'
    );
  end if;
  return v_state;
end;
$function$

