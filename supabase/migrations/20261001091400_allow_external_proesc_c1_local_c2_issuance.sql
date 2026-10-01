-- A confirmed Proesc C1 remains readonly history. Its exact reviewed local C2,
-- already materialized by the canonical RPC, may proceed through Banese.
begin;

do $remote_contract$
declare
  v_signature text;
  v_expected_md5 text;
  v_definition text;
begin
  for v_signature, v_expected_md5 in
    select * from (values
      ('internal_academic.technical_imported_cycle_has_confirmed(uuid,integer)',
        'c96cba2bbe58aea169dc41471e5205a0'),
      ('internal_academic.technical_imported_cycle_exists(uuid,integer)',
        'ce58353b4bf1b2fef938f71dab8fdab0'),
      ('internal_academic.technical_imported_cycle_has_conflict(uuid)',
        '015bc32d65064acce6f4336c7c070e70'),
      ('internal_academic.lock_technical_imported_cycle_fact(uuid,integer)',
        '74748099086deaf331c2a167c5e480b3'),
      ('internal_academic.technical_cycle_history_outside_enrollment(uuid)',
        'c50166daef333bbc47e4a263f889bc2e'),
      ('internal_academic.technical_imported_banese_local_c2_is_valid(uuid)',
        '015cc1aac21ed0d256fbcfcef74e1799'),
      ('internal_academic.technical_imported_banese_receivable_is_local_c2(uuid,uuid)',
        '897ce6edd1c0781105572edd2b5f2644'),
      ('public.proesc_import_original_obligation_service(uuid,uuid,jsonb)',
        '8242633e2c6e9f218db4639d155b6d07'),
      ('internal_proesc.import_residual_before_scope_evidence(uuid,uuid,jsonb)',
        '73dd1f3d32459e69a0a209830ece0ff1'),
      ('public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
        '0d50bde17bd0ad942cfc742ccfc70333'),
      ('internal_academic.guard_manual_technical_receivable_first_bank_claim()',
        '260e931d4178872e7da67c5adb99f75a'),
      ('internal_academic.guard_protected_technical_bank_post()',
        '4ec3d7db7baa82f8e3373797e4905d8f')
    ) expected(signature, definition_md5)
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if md5(v_definition) <> v_expected_md5
       or v_definition not like '%SECURITY DEFINER%'
       or v_definition not like '%SET search_path TO ''''%' then
      raise exception 'External Proesc C2 contract drifted at %.', v_signature;
    end if;
    if v_signature =
        'internal_academic.lock_technical_imported_cycle_fact(uuid,integer)'
      and position('technical-imported-cycle-fact:' in v_definition) = 0
    then
      raise exception 'Imported-cycle fact lock shape drifted.';
    end if;
    if v_signature in (
        'public.proesc_import_original_obligation_service(uuid,uuid,jsonb)',
        'internal_proesc.import_residual_before_scope_evidence(uuid,uuid,jsonb)'
      ) and position(
        'technical-manual-cycle-enrollment:' in v_definition
      ) = 0
    then
      raise exception 'Imported-obligation enrollment lock shape drifted.';
    end if;
  end loop;

  if has_function_privilege(
      'anon',
      'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
      'EXECUTE'
    ) then
    raise exception 'External Proesc C2 authorization ACL drifted.';
  end if;
end;
$remote_contract$;

create function
internal_academic.technical_external_proesc_local_c2_is_valid(
  p_matricula_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matricula_id is null then
    return false;
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0
    )
  ) then
    return false;
  end if;
  perform internal_academic.lock_technical_imported_cycle_fact(
    p_matricula_id, 2
  );
  return coalesce((
    select
      internal_academic.technical_imported_cycle_has_confirmed(
        enrollment.id, 1
      )
      and exists (
        select 1
        from internal_academic.technical_imported_cycle_facts fact
        where fact.matricula_id = enrollment.id
          and fact.turma_id = enrollment.turma_id
          and fact.cycle_number = 1
          and fact.administration_origin = 'EXTERNAL_PROESC'
          and fact.source_system = 'PROESC'
      )
      and not internal_academic.technical_imported_cycle_exists(
        enrollment.id, 2
      )
      and not internal_academic.technical_imported_cycle_has_conflict(
        enrollment.id
      )
      and upper(coalesce(enrollment.status, '')) in ('ATIVO', 'PENDENTE')
      and not internal_academic.technical_cycle_history_outside_enrollment(
        enrollment.id
      )
      and exists (
        select 1
        from public.matriculas_tecnicas_financeiro_config config
        where config.matricula_id = enrollment.id
      )
      and not exists (
        select 1
        from internal_proesc.enrollment_cycle_evidence evidence
        where evidence.matricula_id = enrollment.id
          and evidence.classification = 'FULL'
          and evidence.verification = 'CONFIRMED'
          and evidence.has_external_cycle2 is true
      )
      and not exists (
        select 1
        from internal_academic.technical_external_cycle_coverage coverage
        where coverage.matricula_id = enrollment.id
      )
      and not exists (
        select 1
        from internal_proesc.obligation_links link
        join internal_proesc.obligation_imports imported
          on imported.link_id = link.id
        where link.matricula_id = enrollment.id
          and imported.source_cycle in ('SECOND', 'FULL_CONTRACT')
      )
      and (
        select count(*)
        from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = enrollment.id
      ) = 1
      and exists (
        select 1
        from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = enrollment.id
          and run.turma_id = enrollment.turma_id
          and run.cycle_number = 2
          and run.state = 'LOCAL_CREATED'
          and run.request_id is not null
          and run.completed_at is not null
          and run.item_count > 0
          and cardinality(run.receivable_ids) = run.item_count
          and jsonb_typeof(run.reviewed_items) = 'array'
          and jsonb_array_length(run.reviewed_items) = run.item_count
          and (
            select count(distinct receivable.id)
            from unnest(run.receivable_ids) receivable_id
            join public.contas_receber receivable
              on receivable.id = receivable_id
            where receivable.matricula_id = enrollment.id
              and receivable.turma_id = enrollment.turma_id
              and receivable.cliente_id = enrollment.aluno_id
              and class.polo_id is not null
              and receivable.polo_id = class.polo_id
              and receivable.regra_financeira_tecnica_snapshot
                #>> '{cicloManual,requestId}' = run.request_id::text
              and receivable.regra_financeira_tecnica_snapshot
                #>> '{cicloManual,cicloNumero}' = '2'
              and receivable.regra_financeira_tecnica_snapshot
                ->> 'destinoCobranca' = 'BANESE'
              and coalesce(receivable.origem_pagamento, '')
                <> 'SISTEMA_ANTERIOR'
              and not exists (
                select 1
                from internal_proesc.obligation_links link
                where link.receivable_id = receivable.id
              )
          ) = run.item_count
      )
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where enrollment.id = p_matricula_id
  ), false);
end;
$function$;

create function
internal_academic.technical_imported_c1_receivable_is_local_c2(
  p_receivable_id uuid,
  p_matricula_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matricula_id is null then
    return false;
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0
    )
  ) then
    return false;
  end if;
  perform internal_academic.lock_technical_imported_cycle_fact(
    p_matricula_id, 2
  );
  if internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    )
    or internal_academic.technical_imported_cycle_has_conflict(
      p_matricula_id
    )
    or exists (
      select 1
      from internal_proesc.enrollment_cycle_evidence evidence
      where evidence.matricula_id = p_matricula_id
        and evidence.classification = 'FULL'
        and evidence.verification = 'CONFIRMED'
        and evidence.has_external_cycle2 is true
    )
    or exists (
      select 1
      from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = p_matricula_id
    )
    or exists (
      select 1
      from internal_proesc.obligation_links link
      join internal_proesc.obligation_imports imported
        on imported.link_id = link.id
      where link.matricula_id = p_matricula_id
        and imported.source_cycle in ('SECOND', 'FULL_CONTRACT')
    )
  then
    return false;
  end if;
  if coalesce(
    internal_academic.technical_imported_banese_receivable_is_local_c2(
      p_receivable_id, p_matricula_id
    ), false
  ) then
    return true;
  end if;
  if not internal_academic.technical_external_proesc_local_c2_is_valid(
    p_matricula_id
  ) then
    return false;
  end if;
  return exists (
    select 1
    from internal_academic.technical_manual_cycle_runs run
    join public.contas_receber receivable
      on receivable.id = p_receivable_id
    join public.matriculas enrollment
      on enrollment.id = run.matricula_id
    join public.turmas class on class.id = run.turma_id
    join public.matriculas_tecnicas_financeiro_config config
      on config.matricula_id = enrollment.id
    where run.matricula_id = p_matricula_id
      and run.turma_id = enrollment.turma_id
      and run.cycle_number = 2
      and run.state = 'LOCAL_CREATED'
      and p_receivable_id = any(run.receivable_ids)
      and receivable.matricula_id = run.matricula_id
      and receivable.turma_id = run.turma_id
      and receivable.cliente_id = enrollment.aluno_id
      and class.polo_id is not null
      and receivable.polo_id = class.polo_id
      and receivable.regra_financeira_tecnica_snapshot
        #>> '{cicloManual,requestId}' = run.request_id::text
      and receivable.regra_financeira_tecnica_snapshot
        #>> '{cicloManual,cicloNumero}' = '2'
      and receivable.regra_financeira_tecnica_snapshot
        ->> 'destinoCobranca' = 'BANESE'
      and coalesce(receivable.origem_pagamento, '') <> 'SISTEMA_ANTERIOR'
      and not exists (
        select 1
        from internal_proesc.obligation_links link
        where link.receivable_id = receivable.id
      )
  );
end;
$function$;

revoke all on function
  internal_academic.technical_external_proesc_local_c2_is_valid(uuid),
  internal_academic.technical_imported_c1_receivable_is_local_c2(uuid, uuid)
  from public, anon, authenticated, service_role;

do $patch_guards$
declare
  v_signature text;
  v_definition text;
  v_old text := 'technical_imported_banese_receivable_is_local_c2';
  v_new text := 'technical_imported_c1_receivable_is_local_c2';
  v_count integer;
begin
  foreach v_signature in array array[
    'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
    'internal_academic.guard_manual_technical_receivable_first_bank_claim()',
    'internal_academic.guard_protected_technical_bank_post()'
  ]
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_count := (length(v_definition) - length(replace(
      v_definition, v_old, ''
    ))) / length(v_old);
    if v_count <> 1 then
      raise exception 'External Proesc C2 patch anchor drifted at %.',
        v_signature;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$patch_guards$;

revoke all on function
  public.authorize_technical_manual_receivable_issuance_secure(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.authorize_technical_manual_receivable_issuance_secure(uuid, uuid)
  to authenticated;
revoke all on function
  internal_academic.guard_manual_technical_receivable_first_bank_claim(),
  internal_academic.guard_protected_technical_bank_post()
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_external_proesc_local_c2_is_valid(uuid) is
  'Proves the exact reviewed LOCAL_CREATED C2 after a confirmed readonly Proesc C1; it never authorizes generation or the C1 history.';
comment on function
  internal_academic.technical_imported_c1_receivable_is_local_c2(uuid, uuid) is
  'Post-creation issuance fence for an exact bank-destined receivable of a validated local C2 after imported C1; concurrent enrollment import fails closed and may be retried.';

notify pgrst, 'reload schema';
commit;
