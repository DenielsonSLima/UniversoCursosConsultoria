CREATE OR REPLACE FUNCTION internal_academic.technical_imported_cycle_identity_context(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'matriculaId', enrollment.id,
    'turmaId', enrollment.turma_id,
    'poloId', coalesce(scope.polo_id, class.polo_id),
    'scopeId', scope.id,
    'unitId', scope.source_unit_id,
    'classId', scope.source_class_id,
    'personHash', internal_proesc.person_document_hash(enrollment.aluno_id),
    'manifestHash', internal_proesc.enrollment_cycle_manifest_hash(enrollment.id),
    'identityHash', encode(extensions.digest(jsonb_build_object(
      'matriculaId', enrollment.id,
      'turmaId', enrollment.turma_id,
      'poloId', coalesce(scope.polo_id, class.polo_id),
      'unitId', scope.source_unit_id,
      'classId', scope.source_class_id,
      'personHash', internal_proesc.person_document_hash(enrollment.aluno_id)
    )::text, 'sha256'), 'hex')
  )
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join internal_academic.technical_manual_cycle_policies policy
    on policy.turma_id = enrollment.turma_id
    and policy.active
    and policy.generation_mode = 'MANUAL'
    and policy.initial_state = 'IMPORTADA_CICLO_1'
    and policy.baseline_cycle = 1
    and policy.max_cycle = 2
    and policy.eligibility_rule in (
      'HISTORICO_EXTERNO', 'HISTORICO_IMPORTADO_CONSULTA'
    )
  left join internal_proesc.class_scopes scope
    on scope.turma_id = enrollment.turma_id and scope.phase = 'CONFIRMED'
  where enrollment.id = p_matricula_id
    and (select count(*)
      from internal_proesc.class_scopes confirmed_scope
      where confirmed_scope.turma_id = enrollment.turma_id
        and confirmed_scope.phase = 'CONFIRMED') <= 1;
$function$
;

