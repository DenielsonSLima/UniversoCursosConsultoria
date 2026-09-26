// SELECT-only fixtures inline the migration's exact helpers. No remote DDL/DML.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const migration = readFileSync(new URL(
  '../migrations/20260926121636_preserve_explicit_caixa_proesc_evidence.sql', import.meta.url,
), 'utf8');
export const predicate = migration.split('$uninformative$')[1].trim().replace(/;$/, '');
export const selector = migration.split('$effective$')[1].trim().replace(/;$/, '');
assert.ok(predicate && selector);
assert.doesNotMatch(predicate + selector, /\b(insert|update|delete|truncate|http_get|http_post)\b/i);
assert.match(migration, /LANGUAGE sql IMMUTABLE SECURITY INVOKER\n/);
assert.match(migration, /LANGUAGE sql STABLE SECURITY INVOKER ROWS 1/);
assert.match(migration, /FROM public,anon,authenticated,service_role;/);
assert.match(selector, /FROM internal_proesc\.financial_snapshots/);
assert.match(migration, /78ce8e039c288d7f849112d63171d002/);
assert.match(migration, /c32d1f8caaeaba081405f945cd9aae81/);
assert.match(migration, /b95b6bd9d8719fb3ba396f88b5ff9599/);
assert.match(migration, /to_jsonb\(p\)-'prosrc'/);

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const proofTime = '2026-09-25T12:00:00+00:00';
const pollTime = '2026-09-25T13:00:00+00:00';
const components = { interestCents: null, penaltyCents: null, discountCents: null, additionCents: null };
const proof = () => ({ observed_at: proofTime, recorded_at: proofTime,
  principal_cents: 27990, received_cents: null, payment_date: null, source_status: 'OPEN',
  verification: 'VERIFIED', evidence_kind: 'PORTAL_CONFIRMED', components,
  accounting_lines: [], review_reasons: [], collector_review_reasons: [], open_evidence: null });
const poll = () => ({ ...proof(), observed_at: pollTime, recorded_at: pollTime,
  source_status: 'UNKNOWN', verification: 'REVIEW', evidence_kind: 'UNRESOLVED',
  accounting_lines: [{ blockCode: '1', amountCents: 27990, paymentDate: null,
    cancelled: false, renegotiation: false, sourceMonth: 9, sourceYear: 2026 }],
  review_reasons: ['ESTADO_REQUER_REVISAO', 'SEM_CONFIRMACAO'],
  collector_review_reasons: ['NO_PAYMENT_IN_OBSERVED_PERIODS'] });

export const cases = [];
function add(name, history, expectedIndex, options = {}) {
  const n = cases.length + 1;
  const receivable = { id: uuid(n), matricula_id: uuid(1000 + n), turma_id: uuid(2000 + n),
    status: 'PENDENTE', valor: 279.90, valor_pago: 0, data_pagamento: null,
    updated_at: '2026-09-01T00:00:00+00:00', ...options.receivable };
  const link = { id: uuid(3000 + n), receivable_id: receivable.id, matricula_id: receivable.matricula_id,
    turma_id: receivable.turma_id, confirmed_at: '2026-09-01T00:00:00+00:00',
    parent_link_id: null, ...options.link };
  const snapshots = history.map((row, i) => ({ id: uuid(10000 + n * 100 + i), link_id: link.id,
    source_fingerprint: 'a'.repeat(64), recorded_by: uuid(999), ...row }));
  const expected = expectedIndex === null ? null : snapshots[expectedIndex];
  cases.push({ name, receivable, link_id: link.id,
    links: options.missingLink ? [] : [link, ...(options.replacement ? [
      { ...link, id: uuid(4000 + n), parent_link_id: link.id, receivable_id: uuid(5000 + n) },
    ] : [])], snapshots,
    expected_id: expected?.id ?? null, expected_observed_at: expected?.observed_at ?? null,
    expected_recorded_at: expected?.recorded_at ?? null });
}

add('explicit_proof_unchanged', [proof()], 0);
add('trailing_empty_poll_preserves_proof_and_original_age', [proof(), poll()], 0);
add('multiple_empty_polls_do_not_refresh_proof', [proof(), poll(),
  { ...poll(), observed_at: '2026-09-25T14:00:00+00:00' }], 0);
add('unknown_without_any_proof_remains_unknown', [poll()], 0);
add('no_observations_remains_without_evidence', [], null);
add('paid_barrier_even_when_followed_by_empty_poll', [proof(),
  { ...proof(), source_status: 'PAID', received_cents: 26000, payment_date: '2026-09-25',
    observed_at: '2026-09-25T12:30:00+00:00' }, poll()], 2);
add('canceled_barrier_even_when_followed_by_empty_poll', [proof(),
  { ...poll(), source_status: 'CANCELED', observed_at: '2026-09-25T12:30:00+00:00' }, poll()], 2);
add('identity_conflict_is_a_barrier_not_skipped', [proof(),
  { ...poll(), collector_review_reasons: ['IDENTITY_REQUIRES_REVIEW'],
    observed_at: '2026-09-25T12:30:00+00:00' }, poll()], 2);
add('new_explicit_proof_after_conflict_is_eligible', [
  { ...poll(), source_status: 'CANCELED', observed_at: '2026-09-25T11:00:00+00:00' }, proof(), poll(),
], 1);
add('explicit_api_open_proof_is_supported', [{ ...proof(), evidence_kind: 'API_OPEN_OBLIGATION',
  open_evidence: { basis: 'EXPLICIT_SOURCE_STATUS', providerStatus: 'OPEN' } }, poll()], 0);
add('unrecognized_open_evidence_kind_is_not_upgraded', [
  { ...proof(), evidence_kind: 'UNRESOLVED' }, poll()], 1);
add('review_open_is_not_upgraded', [{ ...proof(), verification: 'REVIEW' }, poll()], 1);
add('principal_change_is_informative', [proof(), { ...poll(), principal_cents: 28000 }], 1);
add('local_amount_change_keeps_review', [proof(), poll()], 1, { receivable: { valor: 280 } });
add('local_updated_row_requires_new_proof', [proof(), poll()], 1,
  { receivable: { updated_at: '2026-09-25T12:30:00+00:00' } });
add('missing_local_update_timestamp_fails_closed', [proof(), poll()], 1,
  { receivable: { updated_at: null } });
add('local_paid_is_never_reopened', [proof(), poll()], 1,
  { receivable: { status: 'PAGO', valor_pago: 260, data_pagamento: '2026-09-25' } });
add('local_canceled_is_never_reopened', [proof(), poll()], 1, { receivable: { status: 'CANCELADO' } });
add('partial_local_receipt_blocks_open', [proof(), poll()], 1, { receivable: { valor_pago: 1 } });
add('missing_link_fails_closed', [proof(), poll()], 1, { missingLink: true });
add('link_to_other_receivable_fails_closed', [proof(), poll()], 1,
  { link: { receivable_id: uuid(999999) } });
add('enrollment_replacement_fails_closed', [proof(), poll()], 1,
  { link: { matricula_id: uuid(999999) } });
add('class_replacement_fails_closed', [proof(), poll()], 1,
  { link: { turma_id: uuid(999999) } });
add('confirmed_link_changed_after_proof_fails_closed', [proof(), poll()], 1,
  { link: { confirmed_at: '2026-09-25T12:30:00+00:00' } });
add('successor_obligation_prevents_old_open_fallback', [proof(), poll()], 1, { replacement: true });
add('future_proof_not_silently_made_current', [
  { ...proof(), observed_at: '2099-09-25T12:00:00+00:00' },
  { ...poll(), observed_at: '2099-09-25T13:00:00+00:00' },
], 1);
add('old_proof_age_is_kept_without_inventing_expiration', [
  { ...proof(), observed_at: '2000-01-01T00:00:00+00:00', recorded_at: '2000-01-01T00:00:00+00:00' }, poll(),
], 0, { receivable: { updated_at: '1999-01-01T00:00:00+00:00' },
  link: { confirmed_at: '1999-01-01T00:00:00+00:00' } });
add('same_observed_time_uses_recorded_order', [proof(),
  { ...poll(), observed_at: proofTime, recorded_at: pollTime },
], 0);
add('same_timestamp_id_tie_preserves_conflict_barrier', [proof(),
  { ...poll(), observed_at: proofTime, recorded_at: proofTime, source_status: 'CANCELED' },
  { ...poll(), observed_at: proofTime, recorded_at: proofTime },
], 2);
for (const [name, patch] of [
  ['renegotiation_signal', { accounting_lines: [{ ...poll().accounting_lines[0], renegotiation: true }] }],
  ['cancelled_principal', { accounting_lines: [{ ...poll().accounting_lines[0], cancelled: true }] }],
  ['additional_block_is_not_uninformative', { accounting_lines: [...poll().accounting_lines,
    { blockCode: '5', amountCents: 27990, cancelled: false, renegotiation: false }] }],
  ['payment_date_without_payment_block', { payment_date: '2026-09-25' }],
  ['payment_amount_without_payment_block', { received_cents: 1 }],
  ['principal_line_payment_date', { accounting_lines: [{ ...poll().accounting_lines[0], paymentDate: '2026-09-25' }] }],
  ['unknown_flags_not_silently_false', { accounting_lines: [{ blockCode: '1', amountCents: 27990 }] }],
  ['missing_principal_line', { accounting_lines: [] }],
  ['explicit_component_is_informative', { components: { ...components, discountCents: 100 } }],
  ['extra_database_review_reason', { review_reasons: [...poll().review_reasons, 'PRINCIPAL_DIVERGENTE'] }],
  ['extra_collector_review_reason', { collector_review_reasons: [...poll().collector_review_reasons, 'SOURCE_STATE_REQUIRES_REVIEW'] }],
]) add(name, [proof(), { ...poll(), ...patch }], 1);

export function buildReadOnlySQL() {
  let body = selector;
  for (const variable of ['l.snapshot', 'ROW(s.*)::internal_proesc.financial_snapshots']) {
    const call = `internal_contas.caixa_proesc_uninformative_observation(${variable},pg_catalog.round(p_receivable.valor*100)::bigint)`;
    const inline = predicate.replaceAll('p_snapshot', `(${variable})`)
      .replaceAll('p_principal', '(pg_catalog.round(p_receivable.valor*100)::bigint)');
    assert.ok(body.includes(call));
    body = body.replaceAll(call, `(${inline})`);
  }
  body = body.replaceAll('FROM internal_proesc.financial_snapshots', 'FROM fixture_history')
    .replaceAll('internal_proesc.obligation_links', 'fixture_links')
    .replaceAll('p_receivable', '(scenario.receivable)').replaceAll('p_link_id', 'scenario.link_id');
  return `WITH scenarios AS (
    SELECT x.*,jsonb_populate_record(NULL::public.contas_receber,x.receivable_json) AS receivable
    FROM jsonb_to_recordset($cases$${JSON.stringify(cases.map(({ receivable, ...row }) =>
      ({ ...row, receivable_json: receivable })))}$cases$::jsonb)
      AS x(name text,receivable_json jsonb,link_id uuid,links jsonb,snapshots jsonb,
        expected_id uuid,expected_observed_at timestamptz,expected_recorded_at timestamptz)
  ), fixture_history AS (
    SELECT h.* FROM scenarios scenario CROSS JOIN LATERAL
      jsonb_populate_recordset(NULL::internal_proesc.financial_snapshots,scenario.snapshots) h
  ), fixture_links AS (
    SELECT l.* FROM scenarios scenario CROSS JOIN LATERAL
      jsonb_populate_recordset(NULL::internal_proesc.obligation_links,scenario.links) l
  ), evaluated AS (
    SELECT scenario.*,actual.id AS actual_id,actual.observed_at,actual.recorded_at
    FROM scenarios scenario LEFT JOIN LATERAL (${body}) actual ON true
  ) SELECT count(*) AS cases,count(*) FILTER(WHERE actual_id IS NOT DISTINCT FROM expected_id
      AND observed_at IS NOT DISTINCT FROM expected_observed_at
      AND recorded_at IS NOT DISTINCT FROM expected_recorded_at) AS passed,
    coalesce(jsonb_agg(jsonb_build_object('case',name,'expectedId',expected_id,'actualId',actual_id,
      'expectedObservedAt',expected_observed_at,'actualObservedAt',observed_at)) FILTER(WHERE
        actual_id IS DISTINCT FROM expected_id OR observed_at IS DISTINCT FROM expected_observed_at
        OR recorded_at IS DISTINCT FROM expected_recorded_at),'[]'::jsonb) AS failures
  FROM evaluated;`;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) console.log(buildReadOnlySQL());
