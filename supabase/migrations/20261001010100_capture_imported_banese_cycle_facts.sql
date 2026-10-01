-- Preserve the imported Banese administration origin without weakening the
-- bank identity contract or treating every local manual run as an import.
begin;

create function internal_academic.technical_imported_banese_run_is_valid(
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
    from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = p_matricula_id
      and run.cycle_number = p_cycle_number
      and run.state = 'PROTECTED_EXISTING'
      and run.completed_at is not null
      and run.item_count > 0
      and cardinality(run.receivable_ids) = run.item_count
      and internal_academic.technical_imported_cycle_identity_context(
        run.matricula_id
      ) is not null
      and (select count(distinct receivable.id)
        from unnest(run.receivable_ids) receivable_id
        join public.contas_receber receivable
          on receivable.id = receivable_id
        where receivable.matricula_id = run.matricula_id
          and receivable.turma_id = run.turma_id
          and upper(coalesce(receivable.origem_pagamento, '')) = 'BANESE'
          and lower(coalesce(receivable.gateway_provider, '')) in (
            'banese', 'banese_card'
          )
          and receivable.gateway_payment_id is not null
          and (select count(*)
            from public.payment_gateway_transactions gateway_tx
            where gateway_tx.receivable_id = receivable.id) = 1
          and exists (
            select 1
            from public.payment_gateway_transactions gateway_tx
            where gateway_tx.receivable_id = receivable.id
              and gateway_tx.provider_code = receivable.gateway_provider
              and gateway_tx.environment = receivable.gateway_environment
              and gateway_tx.payment_method = 'BOLETO'
              and nullif(gateway_tx.bank_slip_our_number, '') =
                nullif(receivable.gateway_boleto_nosso_numero, '')
              and gateway_tx.remote_payment_id = receivable.gateway_payment_id
              and gateway_tx.amount = receivable.valor
          )) = run.item_count
  );
$function$;

create function internal_academic.technical_imported_banese_run_proof_hash(
  p_matricula_id uuid,
  p_cycle_number integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when not internal_academic.technical_imported_banese_run_is_valid(
      p_matricula_id, p_cycle_number
    ) then null
    else encode(extensions.digest(jsonb_build_object(
      'matriculaId', run.matricula_id,
      'turmaId', run.turma_id,
      'cycleNumber', run.cycle_number,
      'itemCount', run.item_count,
      'receivables', (select jsonb_agg(jsonb_build_object(
        'receivableId', receivable.id,
        'provider', gateway_tx.provider_code,
        'environment', gateway_tx.environment,
        'paymentMethod', gateway_tx.payment_method,
        'ourNumber', gateway_tx.bank_slip_our_number,
        'amount', gateway_tx.amount,
        'paymentId', receivable.gateway_payment_id,
        'transactionId', gateway_tx.id,
        'remotePaymentId', gateway_tx.remote_payment_id
      ) order by receivable.id)
      from unnest(run.receivable_ids) receivable_id
      join public.contas_receber receivable on receivable.id = receivable_id
      join public.payment_gateway_transactions gateway_tx
        on gateway_tx.receivable_id = receivable.id)
    )::text, 'sha256'), 'hex')
  end
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_cycle_number;
$function$;

create function internal_academic.capture_imported_banese_cycle_fact(
  p_matricula_id uuid,
  p_cycle_number integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_proof_hash text;
begin
  if not internal_academic.technical_imported_banese_run_is_valid(
    p_matricula_id, p_cycle_number
  ) then
    return;
  end if;
  select * into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_cycle_number;
  v_context := internal_academic.technical_imported_cycle_identity_context(
    p_matricula_id
  );
  v_proof_hash := internal_academic.technical_imported_banese_run_proof_hash(
    p_matricula_id, p_cycle_number
  );
  perform internal_academic.lock_technical_imported_cycle_fact(
    p_matricula_id, p_cycle_number
  );
  insert into internal_academic.technical_imported_cycle_facts(
    matricula_id, turma_id, cycle_number, administration_origin,
    source_system, proof_kind, source_scope_id, proof_reference_id,
    proof_hash, audit_hash, identity_hash, proof_manifest_hash,
    source_observed_at, confirmed_at
  ) values (
    p_matricula_id, v_run.turma_id, p_cycle_number,
    'IMPORTED_BANESE', 'BANESE', 'BANESE_PROTECTED_RUN',
    (v_context ->> 'scopeId')::uuid, v_run.request_id,
    v_proof_hash, v_proof_hash, v_context ->> 'identityHash', null,
    v_run.completed_at, v_run.completed_at
  ) on conflict (matricula_id, cycle_number) do nothing;
end;
$function$;

-- Payment, settlement or cancellation status may evolve after import. Passage
-- uses the immutable canonical fact plus its protected run, never a mutable
-- bank-status field.
create function internal_academic.technical_imported_banese_cycle_is_durable(
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
    join internal_academic.technical_manual_cycle_runs run
      on run.matricula_id = fact.matricula_id
      and run.cycle_number = fact.cycle_number
    where fact.matricula_id = p_matricula_id
      and fact.cycle_number = p_cycle_number
      and fact.administration_origin = 'IMPORTED_BANESE'
      and fact.proof_kind = 'BANESE_PROTECTED_RUN'
      and fact.identity_hash =
        internal_academic.technical_imported_cycle_identity_context(
          p_matricula_id
        ) ->> 'identityHash'
      and run.state = 'PROTECTED_EXISTING'
      and run.completed_at is not null
      and cardinality(run.receivable_ids) = run.item_count
      and not exists (
        select 1
        from internal_academic.technical_imported_cycle_fact_conflicts conflict
        where conflict.matricula_id = fact.matricula_id
          and conflict.cycle_number = fact.cycle_number
      )
  );
$function$;

create function internal_academic.capture_imported_banese_cycle_fact_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.state = 'PROTECTED_EXISTING' then
    perform internal_academic.capture_imported_banese_cycle_fact(
      new.matricula_id, new.cycle_number
    );
  end if;
  return new;
end;
$function$;

create trigger capture_imported_banese_cycle_fact
after insert or update
on internal_academic.technical_manual_cycle_runs
for each row execute function
  internal_academic.capture_imported_banese_cycle_fact_trigger();

create function internal_academic.technical_imported_receivable_provenance(
  p_receivable_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'imported', true,
    'administrationOrigin', 'IMPORTED_BANESE',
    'sourceSystem', 'BANESE',
    'cycleNumber', run.cycle_number,
    'proofKind', 'BANESE_PROTECTED_RUN',
    'factRecorded', coalesce(
      fact.administration_origin = 'IMPORTED_BANESE', false
    ),
    'identityConfirmed', coalesce(
      fact.identity_hash = context.value ->> 'identityHash', false
    ),
    'conflictRecorded', exists (
      select 1
      from internal_academic.technical_imported_cycle_fact_conflicts conflict
      where conflict.matricula_id = run.matricula_id
        and conflict.cycle_number = run.cycle_number
    ),
    'confirmedAt', coalesce(fact.confirmed_at, run.completed_at)
  )
  from internal_academic.technical_manual_cycle_runs run
  cross join lateral (select
    internal_academic.technical_imported_cycle_identity_context(
      run.matricula_id
    ) as value) context
  join internal_academic.technical_imported_cycle_facts fact
    on fact.matricula_id = run.matricula_id
    and fact.cycle_number = run.cycle_number
    and fact.administration_origin = 'IMPORTED_BANESE'
    and fact.proof_kind = 'BANESE_PROTECTED_RUN'
  where p_receivable_id = any(run.receivable_ids)
    and run.state = 'PROTECTED_EXISTING'
    and run.completed_at is not null
    and cardinality(run.receivable_ids) = run.item_count
  order by run.cycle_number desc
  limit 1;
$function$;

do $backfill$
declare
  v_run record;
begin
  for v_run in
    select run.matricula_id, run.cycle_number
    from internal_academic.technical_manual_cycle_runs run
    where run.state = 'PROTECTED_EXISTING'
  loop
    perform internal_academic.capture_imported_banese_cycle_fact(
      v_run.matricula_id, v_run.cycle_number
    );
  end loop;
end;
$backfill$;

revoke all on function
  internal_academic.technical_imported_banese_run_is_valid(uuid, integer),
  internal_academic.technical_imported_banese_run_proof_hash(uuid, integer),
  internal_academic.capture_imported_banese_cycle_fact(uuid, integer),
  internal_academic.capture_imported_banese_cycle_fact_trigger(),
  internal_academic.technical_imported_banese_cycle_is_durable(uuid, integer),
  internal_academic.technical_imported_receivable_provenance(uuid)
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_imported_receivable_provenance(uuid) is
  'Sanitized imported-Banese provenance, available to trusted projections without exposing bank payloads or weakening operation guards.';

commit;
