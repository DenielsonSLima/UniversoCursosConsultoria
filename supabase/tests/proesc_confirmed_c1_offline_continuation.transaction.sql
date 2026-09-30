-- Run after 20260930204000. This contract copies the deployed wrappers into
-- pg_temp and exercises only synthetic state; no real enrollment is changed.
begin;

create temporary table durable_c1_fixture (
  matricula_id uuid primary key,
  classification text not null check (classification in ('C1', 'UNKNOWN', 'FULL')),
  local_eligible boolean not null default false,
  confirmed_c1 boolean not null default false,
  baseline_state jsonb not null
) on commit drop;

create temporary sequence durable_c1_legacy_calls;

create function pg_temp.durable_c1_local_eligible(p_matricula_id uuid)
returns boolean language sql stable as $function$
  select local_eligible
  from pg_temp.durable_c1_fixture
  where matricula_id = p_matricula_id;
$function$;

create function pg_temp.durable_c1_confirmed(p_matricula_id uuid)
returns boolean language sql stable as $function$
  select confirmed_c1 and classification = 'C1'
  from pg_temp.durable_c1_fixture
  where matricula_id = p_matricula_id;
$function$;

create function pg_temp.durable_c1_legacy_guard(p_matricula_id uuid)
returns void language plpgsql volatile as $function$
begin
  perform 1
  from pg_temp.durable_c1_fixture
  where matricula_id = p_matricula_id;
  if not found then raise exception 'Synthetic fixture missing.'; end if;

  -- Sequence increments survive the caught PL/pgSQL subtransaction, allowing
  -- the contract to prove that the preserved guard was actually entered.
  perform nextval('pg_temp.durable_c1_legacy_calls'::regclass);
  raise exception 'Synthetic legacy refresh required.' using errcode = '42501';
end;
$function$;

create function pg_temp.durable_c1_base_state(p_matricula_id uuid)
returns jsonb language sql stable as $function$
  select baseline_state
  from pg_temp.durable_c1_fixture
  where matricula_id = p_matricula_id;
$function$;

do $copy_current_wrappers$
declare
  v_guard text;
  v_scope text;
  v_state text;
begin
  v_scope := pg_get_functiondef(
    'internal_proesc.is_t42_durable_imported_c1(uuid)'::regprocedure
  );
  assert position('ENF-T42-INT-MAT' in v_scope) > 0
    and position('SCOPE.BATCH_ID IS NULL' in upper(v_scope)) > 0
    and position('CICLO1_PROESC' in v_scope) > 0
    and position('HISTORICO_IMPORTADO_CONSULTA' in v_scope) > 0,
    'The durable predicate must stay restricted to the T42 seed policy';

  v_guard := pg_get_functiondef(
    'internal_proesc.assert_fresh_cycle_generation(uuid)'::regprocedure
  );
  assert position(
    'internal_proesc.is_t42_durable_imported_c1' in v_guard
  ) > 0,
    'Deploy the T42-scoped durable imported-C1 gate before this contract';
  assert position(
    'internal_proesc.assert_fresh_cycle_generation_before_individual_admission'
      in v_guard
  ) > 0,
    'The durable C1 gate must preserve the legacy guard for unresolved history';

  v_guard := replace(
    v_guard,
    'internal_proesc.assert_fresh_cycle_generation_before_individual_admission',
    'pg_temp.durable_c1_legacy_guard'
  );
  v_guard := replace(
    v_guard,
    'internal_academic.technical_local_cycle_eligible',
    'pg_temp.durable_c1_local_eligible'
  );
  v_guard := replace(
    v_guard,
    'internal_proesc.is_t42_durable_imported_c1',
    'pg_temp.durable_c1_confirmed'
  );
  v_guard := replace(
    v_guard,
    'internal_proesc.assert_fresh_cycle_generation',
    'pg_temp.durable_c1_assert'
  );
  execute v_guard;

  v_state := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_state(uuid)'::regprocedure
  );
  assert position(
    'technical_manual_cycle_state_before_durable_imported_history' in v_state
  ) > 0,
    'Deploy the durable imported-C1 state projection before this contract';
  assert position($needle$v_state - 'conferenciaProesc'$needle$ in v_state) > 0,
    'Confirmed imported C1 must remove the obsolete online-review flag';

  v_state := regexp_replace(
    v_state,
    'internal_academic[[:space:]]*\.[[:space:]]*technical_manual_cycle_state_before_durable_imported_history',
    'pg_temp.durable_c1_base_state',
    'g'
  );
  v_state := replace(
    v_state,
    'internal_proesc.is_t42_durable_imported_c1',
    'pg_temp.durable_c1_confirmed'
  );
  v_state := replace(
    v_state,
    'internal_academic.technical_manual_cycle_state',
    'pg_temp.durable_c1_state'
  );
  assert position(
    'technical_manual_cycle_state_before_durable_imported_history' in v_state
  ) = 0, 'The copied state still calls the real enrollment projection';
  execute v_state;
end;
$copy_current_wrappers$;

do $durable_imported_c1_contract$
declare
  v_c1 uuid := '42000000-0000-0000-0000-000000000001';
  v_unknown uuid := '42000000-0000-0000-0000-000000000002';
  v_full uuid := '42000000-0000-0000-0000-000000000003';
  v_id uuid;
  v_state jsonb;
  v_message text;
  v_expected_calls bigint := 0;
begin
  insert into pg_temp.durable_c1_fixture(
    matricula_id, classification, confirmed_c1, baseline_state
  ) values
    (v_c1, 'C1', true,
      '{"estado":"ELEGIVEL","podeGerar":true,"criterioElegibilidade":"HISTORICO_EXTERNO","conferenciaProesc":{"necessaria":true},"bloqueio":null}'),
    (v_unknown, 'UNKNOWN', false,
      '{"estado":"BLOQUEADO","podeGerar":false,"criterioElegibilidade":"HISTORICO_EXTERNO","conferenciaProesc":{"necessaria":true},"bloqueio":{"codigo":"PROESC_CONFERENCIA_ATUALIZADA_NECESSARIA"}}'),
    (v_full, 'FULL', false,
      '{"estado":"PROTEGIDO_EXISTENTE","podeGerar":false,"criterioElegibilidade":"HISTORICO_EXTERNO","bloqueio":{"codigo":"PROESC_CONTRATO_EXTERNO"}}');

  -- A durable, locally confirmed imported C1 must not touch the online legacy
  -- refresh gate, even when that gate would reject an unavailable Proesc API.
  perform pg_temp.durable_c1_assert(v_c1);
  assert (
    select not is_called
    from pg_temp.durable_c1_legacy_calls
  ), 'Confirmed C1 still invoked the legacy online refresh';

  v_state := pg_temp.durable_c1_state(v_c1);
  assert v_state->>'estado' = 'ELEGIVEL' and v_state->'podeGerar' = 'true'::jsonb,
    'Confirmed C1 must retain canonical local eligibility';
  assert not (v_state ? 'conferenciaProesc'),
    'Confirmed C1 must not advertise an online Proesc preflight';
  assert v_state - 'conferenciaProesc' = (
    select baseline_state - 'conferenciaProesc'
    from pg_temp.durable_c1_fixture
    where matricula_id = v_c1
  ), 'Removing the obsolete flag changed another state field';

  foreach v_id in array array[v_unknown, v_full] loop
    begin
      perform pg_temp.durable_c1_assert(v_id);
      raise exception 'Unresolved or FULL evidence bypassed the legacy guard';
    exception when insufficient_privilege then
      get stacked diagnostics v_message = message_text;
      assert v_message = 'Synthetic legacy refresh required.',
        'The preserved legacy guard returned an unexpected failure';
    end;

    v_expected_calls := v_expected_calls + 1;
    assert (
      select is_called and last_value = v_expected_calls
      from pg_temp.durable_c1_legacy_calls
    ), 'UNKNOWN/FULL evidence did not execute the legacy protection';
  end loop;

  assert pg_temp.durable_c1_state(v_unknown)#>>'{conferenciaProesc,necessaria}' = 'true',
    'UNKNOWN evidence must keep the review-required projection';
  assert pg_temp.durable_c1_state(v_full)#>>'{bloqueio,codigo}' = 'PROESC_CONTRATO_EXTERNO',
    'FULL evidence must keep external-cycle protection';
end;
$durable_imported_c1_contract$;

select 'Confirmed imported C1 works offline; UNKNOWN/FULL still use the legacy guard.' as result;
rollback;
