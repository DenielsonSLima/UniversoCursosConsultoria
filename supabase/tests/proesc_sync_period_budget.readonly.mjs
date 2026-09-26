// Generates SELECT-only SQL using the migration's exact pure helper body.
// Does not claim a lease, invoke the worker or mutate any financial record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL(
  '../migrations/20260926013605_bound_proesc_claim_monthly_periods.sql', import.meta.url,
), 'utf8');
const body = migration.split('$period_prefix$')[1];
assert.ok(body && !/insert|update|delete|http_post|proesc_sync_runtime_service/i.test(body));
assert.match(migration, /language sql immutable security invoker set search_path = ''/);
assert.match(migration, /from public, anon, authenticated, service_role/);
assert.match(migration, /md5\(v_definition\) <> 'a1e7742935e394cede6fe288e57eb83c'/);
assert.match(migration, /v_links:=internal_proesc\.sync_period_budget_prefix\(v_links,now\(\)\);/);
assert.match(migration, /v_last:=\(v_links->-1->>''linkId''\)::uuid;/);
assert.match(migration, /v_return_anchor \|\| ',''referenceTime'',now\(\)'/);

if (process.argv.includes('--postflight')) {
  console.log(`select
    exists (
      select 1 from pg_proc p join pg_language l on l.oid=p.prolang
      where p.oid=to_regprocedure('internal_proesc.sync_period_budget_prefix(jsonb,timestamptz)')
        and p.proowner='postgres'::regrole and not p.prosecdef
        and p.provolatile='i' and l.lanname='sql'
        and p.proconfig=array['search_path=""']::text[]
        and p.prosrc=$body$${body}$body$
        and not exists (
          select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>'postgres'::regrole or a.privilege_type<>'EXECUTE'
        )
    ) as helper_and_acl_preserved,
    not has_schema_privilege('anon','internal_proesc','usage')
      and not has_schema_privilege('authenticated','internal_proesc','usage')
      and not has_schema_privilege('service_role','internal_proesc','usage') as private_schema_preserved,
    md5(replace(replace(
      pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure),
      E'    v_links:=internal_proesc.sync_period_budget_prefix(v_links,now());\\n'
        || E'    v_last:=(v_links->-1->>''linkId'')::uuid;\\n',''),
      ',''referenceTime'',now()',''))='a1e7742935e394cede6fe288e57eb83c'
      as complete_original_runtime_contract_preserved;`);
  process.exit(0);
}

const link = (id, dueDate = '2026-09-15', paymentDate = null, unitId = '1') => ({
  linkId: `link-${id}`, unitId, dueDate, paymentDate,
  expectedBefore: `fingerprint-${id}`, untouched: { nested: true, amounts: [100, 75] },
});
const scenarios = [];
const add = (name, links, expectedCount, reference = '2026-09-26T01:00:00+00:00') => {
  scenarios.push({ name, links, expected: links.slice(0, expectedCount), reference_time: reference });
};
add('empty', [], 0);
add('one_default_current_month', [link(1)], 1);
add('first_link_all_four_periods', [link(1, '2024-07-15', '2027-07-15')], 1);
add('dates_and_complete_original_payload_preserved', [link(1, '2026-01-31', '2026-02-15')], 1);
add('shared_periods_deduplicated', [link(1, '2026-01-01', '2026-02-01'),
  link(2, '2026-02-15', '2026-01-15')], 2);
add('first_over_budget_link_stops_without_skipping_to_later_match', [
  link(1, '2026-01-01', '2026-02-01'), link(2, '2026-03-01'),
  link(3, '2026-01-01', '2026-02-01'),
], 1);
add('payment_month_is_part_of_budget', [
  link(1, '2026-01-01'), link(2, '2026-02-01', '2026-03-01'),
], 1);
add('same_month_different_year_is_distinct', [
  link(1, '2024-07-01', '2025-07-01'), link(2, '2026-07-01'),
], 1);
add('second_unit_does_not_reuse_first_units_months', [
  link(1, '2026-01-01'), link(2, '2026-09-01', null, '2'),
], 1);
add('two_units_with_two_periods_each_fit', [
  link(1), link(2, '2026-09-01', null, '2'), link(3, '2026-09-01', null, '3'),
], 2);
add('missing_dates_keep_current_and_previous', [link(1, null), link(2, '', '')], 2);
add('due_payment_current_previous_overlap', [link(1, '2026-09-01', '2026-08-01'),
  link(2, '2026-07-01', '2026-06-01'), link(3, '2026-05-01')], 2);
add('sixty_links_sharing_periods_all_fit', Array.from({ length: 60 }, (_, i) => link(i)), 60);
add('limit_still_sixty_even_if_given_more', Array.from({ length: 61 }, (_, i) => link(i)), 60);
add('UTC_year_rollover_includes_previous_December', [
  link(1, '2026-01-01', '2025-12-01'), link(2, '2025-11-01', '2025-10-01'),
], 2, '2026-01-01T00:00:00.000001+00:00');
add('timezone_offset_uses_UTC_not_local_year_month', [
  link(1, '2025-10-01', '2025-09-01'), link(2, '2026-01-01'),
], 1, '2026-01-01T01:00:00+03:00');
add('boundary_claim_uses_new_month', [
  link(1, '2026-10-01', '2026-09-01'), link(2, '2026-07-01', '2026-06-01'),
], 2, '2026-10-01T00:00:00+00:00');

// Model successive cursor claims: each has two new historical months, then stops.
// All six original links appear exactly once over the three expected prefixes.
const sequence = Array.from({ length: 6 }, (_, i) => link(i, `2024-${String(i + 1).padStart(2, '0')}-15`));
add('cursor_first_prefix', sequence, 2);
add('cursor_second_prefix', sequence.slice(2), 2);
add('cursor_third_prefix', sequence.slice(4), 2);
assert.deepEqual(scenarios.slice(-3).flatMap((s) => s.expected), sequence);

const expression = body.trim().replace(/;$/, '')
  .replaceAll('p_links', 's.links').replaceAll('p_reference_time', 's.reference_time');
console.log(`with scenarios as (
  select * from jsonb_to_recordset($cases$${JSON.stringify(scenarios)}$cases$::jsonb)
    as x(name text, links jsonb, expected jsonb, reference_time timestamptz)
), evaluated as (
  select s.name, s.expected, (${expression}) as actual from scenarios s
)
select count(*) as cases, count(*) filter(where actual=expected) as passed,
  coalesce(jsonb_agg(jsonb_build_object('case',name,'expected',expected,'actual',actual))
    filter(where actual is distinct from expected),'[]'::jsonb) as failures
from evaluated;`);
