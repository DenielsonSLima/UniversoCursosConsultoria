-- An imported Banese C1 remains bank-managed history, but it must not make an
-- otherwise authorized local C2 look like a duplicate protected enrollment.
begin;

do $remote_contract$
begin
  if md5(pg_get_functiondef(
      'internal_academic.is_technical_manual_cycle_protected(uuid)'::regprocedure
    )) <> '6fd5a1a0ebb198f36d4a5ac72e0e91c6'
    or md5(pg_get_functiondef(
      'internal_academic.guard_technical_manual_cycle_insert()'::regprocedure
    )) <> '516ab2f89e4754f3abc5c2280499b98e'
    or md5(pg_get_functiondef(
      'internal_academic.guard_manual_technical_receivable_first_bank_claim()'
        ::regprocedure
    )) <> '0ce5fe986ccdf03990b16b087c069f77'
    or md5(pg_get_functiondef(
      'internal_academic.guard_protected_technical_bank_post()'::regprocedure
    )) <> 'b644e5af718b9f802c489aca336d367b'
    or md5(pg_get_functiondef(
      'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'
        ::regprocedure
    )) <> 'a9fa65141ddfc6feed81324cb574688e'
  then
    raise exception 'Technical Banese protection contract changed; rebase required.';
  end if;
end;
$remote_contract$;

create function internal_academic.technical_imported_banese_local_c2_is_valid(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.technical_imported_banese_cycle_is_durable(
      p_matricula_id, 1
    )
    and (select count(*)
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id) = 2
    and exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id
        and run.cycle_number = 2
        and run.state = 'LOCAL_CREATED'
        and run.request_id is not null
        and run.completed_at is not null
        and cardinality(run.receivable_ids) = run.item_count
        and (select count(distinct receivable.id)
          from unnest(run.receivable_ids) receivable_id
          join public.contas_receber receivable
            on receivable.id = receivable_id
          where receivable.matricula_id = run.matricula_id
            and receivable.turma_id = run.turma_id
            and receivable.regra_financeira_tecnica_snapshot
              #>> '{cicloManual,requestId}' = run.request_id::text
            and receivable.regra_financeira_tecnica_snapshot
              #>> '{cicloManual,cicloNumero}' = '2'
        ) = run.item_count
    );
$function$;

create function internal_academic.technical_imported_banese_c2_claim_is_current(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.technical_imported_banese_cycle_is_durable(
      p_matricula_id, 1
    )
    and internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    )
    and exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id
        and run.cycle_number = 2
        and run.state = 'GENERATING'
        and run.request_id is not null
        and run.completed_at is null
        and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
        and coalesce(cardinality(run.receivable_ids), 0) = 0
    );
$function$;

create function internal_academic.technical_imported_banese_receivable_is_local_c2(
  p_receivable_id uuid,
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.technical_imported_banese_local_c2_is_valid(
      p_matricula_id
    )
    and exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id
        and run.cycle_number = 2
        and run.state = 'LOCAL_CREATED'
        and p_receivable_id = any(run.receivable_ids)
    );
$function$;

do $patch_guards$
declare
  v_definition text;
  v_from text;
  v_to text;
begin
  v_definition := pg_get_functiondef(
    'internal_academic.guard_technical_manual_cycle_insert()'::regprocedure
  );
  v_from := $old$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;$old$;
  v_to := $new$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic.technical_imported_banese_c2_claim_is_current(
      new.matricula_id
    ) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected technical-cycle INSERT protection boundary.';
  end if;
  execute replace(v_definition, v_from, v_to);

  v_definition := pg_get_functiondef(
    'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'
      ::regprocedure
  );
  v_from := $old$  if internal_academic.is_technical_manual_cycle_protected(
    v_receivable.matricula_id
  ) then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;$old$;
  v_to := $new$  if internal_academic.is_technical_manual_cycle_protected(
    v_receivable.matricula_id
  ) and not internal_academic
    .technical_imported_banese_receivable_is_local_c2(
      v_receivable.id, v_receivable.matricula_id
    ) then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected issuance authorization protection boundary.';
  end if;
  execute replace(v_definition, v_from, v_to);

  v_definition := pg_get_functiondef(
    'internal_academic.guard_manual_technical_receivable_first_bank_claim()'
      ::regprocedure
  );
  v_from := $old$  if v_protected_enrollment then$old$;
  v_to := $new$  if v_protected_enrollment and not internal_academic
    .technical_imported_banese_receivable_is_local_c2(
      new.id, new.matricula_id
    ) then$new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected first bank-claim protection boundary.';
  end if;
  execute replace(v_definition, v_from, v_to);

  v_definition := pg_get_functiondef(
    'internal_academic.guard_protected_technical_bank_post()'::regprocedure
  );
  v_from := $old$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and ($old$;
  v_to := $new$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic
      .technical_imported_banese_receivable_is_local_c2(
        new.id, new.matricula_id
      )
    and ($new$;
  if length(v_definition) - length(replace(v_definition, v_from, ''))
      <> length(v_from) then
    raise exception 'Unexpected protected bank-POST boundary.';
  end if;
  execute replace(v_definition, v_from, v_to);
end;
$patch_guards$;

create or replace function internal_proesc.has_confirmed_first_cycle_only(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.technical_imported_cycle_has_confirmed(
      p_matricula_id, 1
    )
    and not internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    )
    and not exists (
      select 1
      from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = p_matricula_id
    )
    and (
      not exists (
        select 1
        from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = p_matricula_id
      )
      or (
        internal_academic.technical_imported_banese_cycle_is_durable(
          p_matricula_id, 1
        )
        and (select count(*)
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = p_matricula_id) = 1
      )
    );
$function$;

revoke all on function
  internal_academic.technical_imported_banese_local_c2_is_valid(uuid),
  internal_academic.technical_imported_banese_c2_claim_is_current(uuid),
  internal_academic.technical_imported_banese_receivable_is_local_c2(uuid, uuid),
  internal_proesc.has_confirmed_first_cycle_only(uuid)
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_imported_banese_c2_claim_is_current(uuid) is
  'Narrow C2 INSERT exception for the current transaction only; the imported Banese C1 remains protected.';

notify pgrst, 'reload schema';
commit;
