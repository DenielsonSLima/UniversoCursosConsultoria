CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_policy_projection(p_turma_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select jsonb_build_object(
      'habilitado', true,
      'modo', policy.generation_mode,
      'estadoInicial', policy.initial_state,
      'cicloBaseHistorico', policy.baseline_cycle,
      'cicloMaximo', policy.max_cycle,
      'criterioElegibilidade', case
        when policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
          then 'HISTORICO_EXTERNO'
        else policy.eligibility_rule end,
      'revisao', policy.revision,
      'fingerprint', pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(jsonb_build_object(
          'versao', 2,
          'turmaId', policy.turma_id,
          'modo', policy.generation_mode,
          'estadoInicial', policy.initial_state,
          'cicloBaseHistorico', policy.baseline_cycle,
          'cicloMaximo', policy.max_cycle,
          'criterioElegibilidade', policy.eligibility_rule,
          'revisao', policy.revision
        )::text, 'UTF8'),
        'sha256'
      ), 'hex')
    )
    from internal_academic.technical_manual_cycle_policies policy
    where policy.turma_id = p_turma_id
      and policy.active
      and policy.generation_mode = 'MANUAL'
  ), jsonb_build_object(
    'habilitado', false, 'modo', null, 'estadoInicial', null,
    'cicloBaseHistorico', null, 'cicloMaximo', null,
    'criterioElegibilidade', null, 'revisao', null, 'fingerprint', null
  ));
$function$
;

