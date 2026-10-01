-- Replace cache/token authorization with immutable passage facts while retaining
-- every academic, configuration, duplicate and current-transaction fence.
begin;

do $remote_contract$
begin
  if md5(pg_get_functiondef(
      'internal_academic.technical_manual_cycle_state(uuid)'::regprocedure
    )) <> '66b1ec40ac482cd852c2296bbf5f750c'
    or md5(pg_get_functiondef(
      'internal_proesc.enrollment_financial_block(uuid)'::regprocedure
    )) <> '8d8c2e43651a5d9b7e2cf2eee868bdff'
    or md5(pg_get_functiondef(
      'internal_proesc.assert_fresh_cycle_generation(uuid)'::regprocedure
    )) <> '13b612653b2056f782e9ae46ba8f1835'
    or md5(pg_get_functiondef(
      'internal_proesc.individual_cycle_policy_fingerprint(uuid,text)'::regprocedure
    )) <> 'f6a2da49475c5ce50e42ca4e1d68ee25'
  then
    raise exception 'Imported-cycle guard contract changed; rebase required.';
  end if;
end;
$remote_contract$;

create function internal_academic.technical_imported_cycle_fact_state(
  p_matricula_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with identity_context as (
    select internal_academic.technical_imported_cycle_identity_context(
      p_matricula_id
    ) as value
  )
  select jsonb_build_object(
    'cycle1Confirmed', exists (
      select 1
      from internal_academic.technical_imported_cycle_facts fact,
        identity_context context
      where fact.matricula_id = p_matricula_id
        and fact.cycle_number = 1
        and fact.identity_hash = context.value ->> 'identityHash'
        and not exists (
          select 1
          from internal_academic.technical_imported_cycle_fact_conflicts conflict
          where conflict.matricula_id = fact.matricula_id
            and conflict.cycle_number = fact.cycle_number
        )
    ),
    'cycle2Confirmed', exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id and fact.cycle_number = 2
    ),
    'identityConflict', exists (
      select 1
      from internal_academic.technical_imported_cycle_facts fact,
        identity_context context
      where fact.matricula_id = p_matricula_id
        and fact.identity_hash is distinct from context.value ->> 'identityHash'
    ),
    'recordedConflict', exists (
      select 1
      from internal_academic.technical_imported_cycle_fact_conflicts conflict
      where conflict.matricula_id = p_matricula_id
    ),
    'cycles', coalesce((
      select jsonb_object_agg(fact.cycle_number::text, jsonb_build_object(
        'administrationOrigin', fact.administration_origin,
        'sourceSystem', fact.source_system,
        'proofKind', fact.proof_kind,
        'identityConfirmed', fact.identity_hash = context.value ->> 'identityHash',
        'confirmedAt', fact.confirmed_at
      ) order by fact.cycle_number)
      from internal_academic.technical_imported_cycle_facts fact
      cross join identity_context context
      where fact.matricula_id = p_matricula_id
    ), '{}'::jsonb)
  )
  from identity_context;
$function$;

create function internal_academic.technical_imported_cycle_has_conflict(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (internal_academic.technical_imported_cycle_fact_state(p_matricula_id)
      ->> 'identityConflict')::boolean, false
  ) or coalesce(
    (internal_academic.technical_imported_cycle_fact_state(p_matricula_id)
      ->> 'recordedConflict')::boolean, false
  );
$function$;

create function internal_academic.technical_imported_cycle_exists(
  p_matricula_id uuid,
  p_cycle_number integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from internal_academic.technical_imported_cycle_facts fact
    where fact.matricula_id = p_matricula_id
      and fact.cycle_number = p_cycle_number
  );
$function$;

create function internal_academic.technical_imported_cycle_has_confirmed(
  p_matricula_id uuid,
  p_cycle_number integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from internal_academic.technical_imported_cycle_facts fact
    where fact.matricula_id = p_matricula_id
      and fact.cycle_number = p_cycle_number
      and fact.identity_hash =
        internal_academic.technical_imported_cycle_identity_context(
          p_matricula_id
        ) ->> 'identityHash'
      and not exists (
        select 1
        from internal_academic.technical_imported_cycle_fact_conflicts conflict
        where conflict.matricula_id = fact.matricula_id
          and conflict.cycle_number = fact.cycle_number
      )
  );
$function$;

create function internal_academic.technical_imported_cycle_generation_permitted(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select internal_academic.technical_imported_cycle_has_confirmed(
      enrollment.id, 1
    )
    and not internal_academic.technical_imported_cycle_exists(enrollment.id, 2)
    and not internal_academic.technical_imported_cycle_has_conflict(enrollment.id)
    and upper(enrollment.status) in ('ATIVO', 'PENDENTE')
    and not internal_academic.technical_cycle_history_outside_enrollment(
      enrollment.id
    )
    and exists (
      select 1 from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = enrollment.id
    )
    and not exists (
      select 1 from internal_proesc.enrollment_cycle_evidence evidence
      where evidence.matricula_id = enrollment.id
        and evidence.classification = 'FULL'
        and evidence.verification = 'CONFIRMED'
        and evidence.has_external_cycle2 is true
    )
    and not exists (
      select 1 from internal_academic.technical_external_cycle_coverage coverage
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
      (
        not exists (
          select 1 from internal_academic.technical_imported_cycle_facts fact
          where fact.matricula_id = enrollment.id
            and fact.cycle_number = 1
            and fact.administration_origin = 'IMPORTED_BANESE'
        )
        and (
          not exists (
            select 1 from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = enrollment.id
          )
          or ((select count(*)
              from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id) = 1
            and exists (
              select 1 from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id
                and run.cycle_number = 2 and run.state = 'GENERATING'
                and run.request_id is not null and run.completed_at is null
                and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
                and coalesce(cardinality(run.receivable_ids), 0) = 0
            ))
        )
      )
      or (
        internal_academic.technical_imported_banese_cycle_is_durable(
          enrollment.id, 1
        )
        and (select count(*)
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = enrollment.id) in (1, 2)
        and not exists (
          select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = enrollment.id
            and not (
              (run.cycle_number = 1 and run.state = 'PROTECTED_EXISTING')
              or (run.cycle_number = 2 and run.state = 'GENERATING'
                and run.request_id is not null and run.completed_at is null
                and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
                and coalesce(cardinality(run.receivable_ids), 0) = 0)
            )
        )
      )
    )
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
$function$;

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
      select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = p_matricula_id
    )
    and not exists (
      select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id
    );
$function$;

create or replace function internal_proesc.enrollment_financial_block(
  p_matricula_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when internal_academic.technical_imported_cycle_has_conflict(
      p_matricula_id
    ) then 'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE'
    when internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    ) then 'PROESC_CONTRATO_EXTERNO'
    when internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    ) then null
    when exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id
    ) then 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA'
    when internal_academic.technical_local_cycle_eligible(p_matricula_id)
      then null
    else internal_proesc.enrollment_financial_block_before_individual_admission(
      p_matricula_id
    )
  end;
$function$;

create or replace function internal_proesc.assert_fresh_cycle_generation(
  p_matricula_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if internal_academic.technical_imported_cycle_has_conflict(
    p_matricula_id
  ) then
    raise exception 'A identidade ou a origem do histórico exige revisão.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_imported_cycle_exists(
    p_matricula_id, 2
  ) then
    raise exception 'O segundo ciclo já possui cobertura confirmada.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_imported_cycle_generation_permitted(
    p_matricula_id
  ) then
    return;
  end if;
  if exists (
    select 1 from internal_academic.technical_imported_cycle_facts fact
    where fact.matricula_id = p_matricula_id
  ) then
    raise exception 'O histórico importado não autoriza esta geração.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_local_cycle_eligible(p_matricula_id) then
    return;
  end if;
  if internal_academic.technical_imported_cycle_identity_context(
    p_matricula_id
  ) is not null then
    raise exception 'A cobertura individual importada exige prova confirmada.'
      using errcode = '42501';
  end if;
  perform internal_proesc.assert_fresh_cycle_generation_before_individual_admission(
    p_matricula_id
  );
end;
$function$;

alter function internal_proesc.individual_cycle_policy_fingerprint(uuid, text)
  rename to individual_cycle_policy_fingerprint_before_durable_facts;

create function internal_proesc.individual_cycle_policy_fingerprint(
  p_matricula_id uuid,
  p_base text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_base is null or p_base !~ '^[0-9a-f]{64}$' then p_base
    when exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id
    ) then encode(extensions.digest(jsonb_build_object(
      'base', p_base,
      'matriculaId', p_matricula_id,
      'identity', internal_academic.technical_imported_cycle_identity_context(
        p_matricula_id
      ) ->> 'identityHash',
      'facts', (select jsonb_agg(jsonb_build_object(
        'cycle', fact.cycle_number,
        'origin', fact.administration_origin,
        'proof', fact.proof_hash,
        'identity', fact.identity_hash
      ) order by fact.cycle_number)
      from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id),
      'conflict', internal_academic.technical_imported_cycle_has_conflict(
        p_matricula_id
      )
    )::text, 'sha256'), 'hex')
    else internal_proesc
      .individual_cycle_policy_fingerprint_before_durable_facts(
        p_matricula_id, p_base
      )
  end;
$function$;

create or replace function internal_academic.technical_manual_cycle_state(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function internal_proesc.is_t42_durable_imported_c1(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where enrollment.id = p_matricula_id
      and class.codigo = 'ENF-T42-INT-MAT'
      and internal_academic.technical_imported_cycle_generation_permitted(
        enrollment.id
      )
  );
$function$;

revoke all on function
  internal_academic.technical_imported_cycle_fact_state(uuid),
  internal_academic.technical_imported_cycle_has_conflict(uuid),
  internal_academic.technical_imported_cycle_exists(uuid, integer),
  internal_academic.technical_imported_cycle_has_confirmed(uuid, integer),
  internal_academic.technical_imported_cycle_generation_permitted(uuid),
  internal_proesc.has_confirmed_first_cycle_only(uuid),
  internal_proesc.enrollment_financial_block(uuid),
  internal_proesc.assert_fresh_cycle_generation(uuid),
  internal_proesc.individual_cycle_policy_fingerprint(uuid, text),
  internal_proesc.individual_cycle_policy_fingerprint_before_durable_facts(
    uuid, text
  ),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_proesc.is_t42_durable_imported_c1(uuid)
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_imported_cycle_generation_permitted(uuid) is
  'Allows only C2 from a matching immutable imported C1 fact, with no C2 fact, conflict, coverage or foreign/current completed run.';

notify pgrst, 'reload schema';
commit;
