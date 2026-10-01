-- Reuse the audited human-review RPC for confirmed seed scopes. This does not
-- permit a bare UNKNOWN decision: the same identified, complete contract and
-- obligation-by-obligation validation remains mandatory.
begin;

do $patch$
declare
  v_definition text;
  v_from text;
  v_to text;
begin
  v_definition := pg_get_functiondef(
    'public.proesc_confirm_enrollment_cycle_evidence_service(uuid,uuid,jsonb)'
      ::regprocedure
  );
  if md5(v_definition) <> '58859618ce822917a967c9fdac5bf728' then
    raise exception 'Cycle evidence review RPC changed; rebase required.';
  end if;

  v_from := $old$  IF v_scope.turma_id IS DISTINCT FROM v_enrollment.turma_id OR v_scope.batch_id IS NULL
    OR v_scope.phase<>'CONFIRMED' OR v_scope.financial_mode<>'INDIVIDUAL_REVIEW' THEN
    RAISE EXCEPTION 'Prova restrita ao escopo individual confirmado.' USING errcode='42501'; END IF;$old$;
  v_to := $new$  IF v_scope.turma_id IS DISTINCT FROM v_enrollment.turma_id
    OR v_scope.phase<>'CONFIRMED' OR NOT (
      (v_scope.batch_id IS NOT NULL
        AND v_scope.financial_mode='INDIVIDUAL_REVIEW')
      OR (v_scope.batch_id IS NULL
        AND v_scope.financial_mode='CICLO1_PROESC')
    ) THEN
    RAISE EXCEPTION 'Prova restrita ao escopo importado confirmado.' USING errcode='42501'; END IF;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected imported-scope review boundary.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$  PERFORM 1 FROM internal_proesc.enrollment_sources
    WHERE matricula_id=v_enrollment.id AND scope_id=v_scope.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Origem acadêmica ausente.' USING errcode='42501'; END IF;$old$;
  v_to := $new$  IF v_scope.batch_id IS NOT NULL THEN
    PERFORM 1 FROM internal_proesc.enrollment_sources
      WHERE matricula_id=v_enrollment.id AND scope_id=v_scope.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Origem acadêmica ausente.' USING errcode='42501'; END IF;
  END IF;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected enrollment-source review boundary.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$JOIN internal_proesc.obligation_imports i ON i.link_id=l.id AND i.scope_id=v_scope.id$old$;
  v_to := $new$LEFT JOIN internal_proesc.obligation_imports i ON i.link_id=l.id AND i.scope_id=v_scope.id$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected obligation-import review join.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$AND i.source_person_hash=internal_proesc.person_document_hash(v_enrollment.aluno_id);$old$;
  v_to := $new$AND (v_scope.batch_id IS NULL
          OR i.source_person_hash=internal_proesc.person_document_hash(v_enrollment.aluno_id));$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected obligation identity review boundary.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$  RETURN v_response;
END;$old$;
  v_to := $new$  v_response := jsonb_set(v_response, '{currentlyEligibleC1}', to_jsonb(
    internal_proesc.has_confirmed_first_cycle_only(v_enrollment.id)
  ));
  RETURN v_response;
END;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected cycle evidence response boundary.';
  end if;
  execute replace(v_definition, v_from, v_to);
end;
$patch$;

revoke all on function
  public.proesc_confirm_enrollment_cycle_evidence_service(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.proesc_confirm_enrollment_cycle_evidence_service(uuid, uuid, jsonb)
  to service_role;

comment on function
  public.proesc_confirm_enrollment_cycle_evidence_service(uuid, uuid, jsonb) is
  'Audited assisted review for imported scopes, including seed scopes; positive facts still require identified complete contract evidence and exact obligation matching.';

notify pgrst, 'reload schema';
commit;
