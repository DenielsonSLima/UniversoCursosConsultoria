-- Execute through MCP only after migrations 010100..010200.
-- Synthetic JSON/temp fixtures only; no ledger, evidence, run or bank row changes.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $test$
declare
  v_enrollment uuid := '71000000-0000-0000-0000-000000000001';
  v_scope uuid := '71000000-0000-0000-0000-000000000002';
  v_request uuid := '71000000-0000-0000-0000-000000000003';
  v_hash text := repeat('a', 64);
  v_manifest text := repeat('b', 64);
  v_identity text := repeat('c', 64);
  v_context jsonb;
  v_source jsonb;
  v_after jsonb;
  v_cycles smallint[];
begin
  v_context := jsonb_build_object(
    'matriculaId', v_enrollment, 'turmaId', gen_random_uuid(),
    'poloId', gen_random_uuid(), 'scopeId', v_scope,
    'unitId', '99', 'classId', '42', 'personHash', repeat('d', 64),
    'manifestHash', v_manifest, 'identityHash', v_identity);
  v_source := jsonb_build_object(
    'classification', 'C1', 'completeApiWindow', true, 'derived', true,
    'cacheId', gen_random_uuid(), 'sourceHash', repeat('e', 64),
    'unitId', '99', 'classId', '42', 'personHash', repeat('d', 64),
    'monthlyCount', 12, 'obligationCount', 12);
  v_after := jsonb_build_object(
    'matricula_id', v_enrollment, 'scope_id', v_scope,
    'classification', 'C1', 'has_external_cycle2', false,
    'verification', 'CONFIRMED', 'evidence_kind', 'API_SCHEDULE_REVIEW',
    'source_evidence', v_source, 'obligation_manifest_hash', v_manifest,
    'evidence_hash', v_hash, 'source_observed_at', now(), 'revision', 7,
    'request_id', v_request, 'confirmed_at', now());

  select array_agg(candidate.cycle_number order by candidate.cycle_number)
  into v_cycles
  from internal_academic.technical_imported_cycle_fact_candidates(
    v_after, v_context, repeat('f', 64), v_request, v_enrollment
  ) candidate;
  assert v_cycles = array[1]::smallint[],
    'Audited complete C1 did not materialize only cycle 1';

  create temporary table synthetic_fact(
    cycle_number smallint primary key,
    proof_hash text not null
  ) on commit drop;
  insert into synthetic_fact values (1, v_hash);
  v_after := jsonb_set(v_after, '{classification}', '"UNKNOWN"'::jsonb);
  v_after := jsonb_set(v_after, '{verification}', '"REVIEW"'::jsonb);
  select array_agg(candidate.cycle_number) into v_cycles
  from internal_academic.technical_imported_cycle_fact_candidates(
    v_after, v_context, repeat('f', 64), v_request, v_enrollment
  ) candidate;
  assert v_cycles is null and (select count(*) from synthetic_fact) = 1,
    'An inconclusive observation erased or recreated the prior positive fact';

  v_source := jsonb_set(v_source, '{classification}', '"FULL"'::jsonb);
  v_source := jsonb_set(v_source, '{monthlyCount}', '24'::jsonb);
  v_source := jsonb_set(v_source, '{obligationCount}', '25'::jsonb);
  v_after := jsonb_set(v_after, '{classification}', '"FULL"'::jsonb);
  v_after := jsonb_set(v_after, '{verification}', '"CONFIRMED"'::jsonb);
  v_after := jsonb_set(v_after, '{has_external_cycle2}', 'true'::jsonb);
  v_after := jsonb_set(v_after, '{source_evidence}', v_source);
  select array_agg(candidate.cycle_number order by candidate.cycle_number)
  into v_cycles
  from internal_academic.technical_imported_cycle_fact_candidates(
    v_after, v_context, repeat('f', 64), v_request, v_enrollment
  ) candidate;
  assert v_cycles = array[1, 2]::smallint[],
    'Positive FULL proof did not protect both external cycles';

  v_source := jsonb_set(v_source, '{personHash}', to_jsonb(repeat('0', 64)));
  v_after := jsonb_set(v_after, '{source_evidence}', v_source);
  select array_agg(candidate.cycle_number) into v_cycles
  from internal_academic.technical_imported_cycle_fact_candidates(
    v_after, v_context, repeat('f', 64), v_request, v_enrollment
  ) candidate;
  assert v_cycles is null, 'A different identity created a trusted fact';

  assert pg_get_functiondef(
      'internal_academic.technical_imported_cycle_generation_permitted(uuid)'
        ::regprocedure
    ) !~* 'cycle_review_cache|token_revision|api_cycle_schedule_is_fresh',
    'Passage still depends on a live Proesc cache or token';
  assert pg_get_functiondef(
      'internal_academic.technical_imported_cycle_generation_permitted(uuid)'
        ::regprocedure
    ) ~* 'technical_imported_banese_cycle_is_durable',
    'A durable imported Banese C1 cannot continue safely to C2';
  assert pg_get_functiondef(
      'internal_academic.technical_imported_banese_cycle_is_durable(uuid,integer)'
        ::regprocedure
    ) !~* 'gateway_submission_status|status.*PAGO|data_pagamento',
    'Durable Banese provenance still depends on mutable payment state';
  assert exists (
    select 1 from pg_trigger
    where tgrelid = 'internal_proesc.cycle_evidence_requests'::regclass
      and tgname = 'capture_imported_cycle_fact_from_audit'
      and not tgisinternal
  ), 'Future positive evidence is not captured';
  assert exists (
    select 1 from pg_trigger
    where tgrelid =
      'internal_academic.technical_external_cycle_coverage'::regclass
      and tgname = 'capture_external_cycle_coverage_fact'
      and not tgisinternal
  ), 'Future external coverage is not captured';
end;
$test$;

select 'imported_cycle_facts_synthetic_contract_passed' as result;
rollback;
