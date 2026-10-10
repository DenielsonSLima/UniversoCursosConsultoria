import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';

const draft = (name) => readFileSync(new URL(`../review-drafts/proesc-v2-growth/${name}.draft.sql`, import.meta.url), 'utf8');
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

async function scenario(canonical) {
  const f = await createFixture();
  const { db, id, actor, enrollment, classId, person, revision, personHash } = f;
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
  const rpc = (action, payload = {}) => scalar(
    'select public.proesc_v2_runtime_service($1,$2,$3::jsonb) value', [action, actor, JSON.stringify(payload)]);
  try {
    for (const name of ['01_payload_storage', '02_payload_readers', '03_payload_writer', '04_payload_activation_gate']) await db.exec(draft(name));
    check(await scalar('select enabled value from internal_proesc.v2_payload_storage_control'), false, 'Installation never activates');
    await assert.rejects(db.exec('select internal_proesc.v2_set_payload_storage_enabled(true)'), /Validate payload constraints/); checks++;
    await db.exec(`ALTER TABLE internal_proesc.v2_invoice_observations VALIDATE CONSTRAINT v2_invoice_payload_identity_fk;
      ALTER TABLE internal_proesc.v2_invoice_observations VALIDATE CONSTRAINT v2_invoice_one_payload;`);
    await db.query('select internal_proesc.v2_set_payload_storage_enabled($1)', [canonical]);
    await db.query(`update public.turmas set codigo='ENF-T42-INT-MAT',polo_id=$1`, [id(7)]);
    await db.query(`update internal_proesc.class_scopes set class_code='ENF-T42-INT-MAT',polo_id=$1`, [id(7)]);
    for (let n = 1; n <= 4; n++) {
      await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,
        valor,valor_pago,data_vencimento,data_pagamento,status,origem_pagamento,tipo_lancamento,updated_at)
        values($1,$2,$3,$4,$5,279.90,$6,'2026-09-15',$7,$8,'SISTEMA_ANTERIOR','PARCELA',now())`,
      [id(10 + n), enrollment, classId, person, id(7), n === 3 ? 285.58 : 0,
        n === 3 ? '2026-09-16' : null, n === 3 ? 'PAGO' : 'PENDENTE']);
      await db.query(`insert into internal_proesc.obligation_links
        (id,matricula_id,turma_id,receivable_id,source_unit_id,source_class_id,source_key,auto_enabled)
        values($1,$2,$3,$4,'3145','123',$5,true)`,
      [id(20 + n), enrollment, classId, id(10 + n), String(100 + n)]);
    }
    await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,principal_cents,
      received_cents,payment_date,source_status,verification,evidence_kind,components,accounting_lines)
      values($1,$2,now()-interval '1 day',27990,28558,'2026-09-16','PAID','VERIFIED','API_PAYMENT_TOTAL',
      '{"interestCents":9,"penaltyCents":559}','[]')`, [id(30), id(23)]);
    const invoice = (n, sourceStatus, paidCents, paymentDate = null) => ({
      invoiceId: String(100 + n), personId: '11', sourceEnrollmentId: '22', sourceClassId: '123', personHash,
      unitId: '3145', dueDate: '2026-09-15', principalCents: 27990, paidCents, paymentDate, sourceStatus,
      groupId: '99', order: 1, groupTotal: 12,
      financialConfiguration: { fineRate: '2', interestRate: '0.033' },
      reviewReasons: sourceStatus === 'PAGAMENTO PARCIAL' ? ['PARTIAL_PAYMENT_REQUIRES_REVIEW'] : [],
    });
    const initial = [invoice(1, 'PAGA', 26000, '2026-10-01'), invoice(2, 'VENCIDO', 0),
      invoice(3, 'PAGAMENTO PARCIAL', 28558, '2026-09-16'), invoice(4, 'PAGAMENTO PARCIAL', 28600, '2026-09-17')];
    const people = [{ personId: '11', personHash, enrollments: [{ sourceEnrollmentId: '22', sourceClassId: '123' }] }];
    let runNumber = 1000;
    async function full(records, exerciseReplay = false) {
      const runId = id(++runNumber);
      await rpc('start', { runId, mode: 'FULL' });
      let guard = 0;
      for (;;) {
        const task = await rpc('claim');
        if (!task.claimed) break;
        assert.ok(++guard < 20, 'Bounded test worker');
        const lease = { taskId: task.taskId, leaseId: task.leaseId, credentialRevision: revision };
        if (task.resource === 'apply') {
          await rpc('apply', lease);
          continue;
        }
        const rows = task.resource === 'people' ? people : records;
        const page = { ...lease, page: 1, lastPage: 1, total: rows.length,
          observedAt: new Date().toISOString(), records: rows };
        if (exerciseReplay && task.resource === 'invoices') {
          await assert.rejects(rpc('apply', lease), /inventário completo/); checks++;
          const before = await scalar('select count(*)::int value from internal_proesc.v2_invoice_payloads');
          await assert.rejects(rpc('commit', { ...page, records: [records[0], records[0], ...records.slice(2)] }), /duplicate key/); checks++;
          check(await scalar('select count(*)::int value from internal_proesc.v2_invoice_payloads'), before, 'Failed page leaves no orphan');
        }
        await rpc('commit', page);
        if (exerciseReplay) {
          check((await rpc('commit', page)).replayed, true, 'Same page replay preserved');
          await assert.rejects(rpc('commit', { ...page, records: [] }), /divergente/); checks++;
        }
      }
      check((await rpc('status', { runId })).run.status, 'COMPLETE', 'Actual runtime completes');
      return runId;
    }
    const firstRun = await full(initial, true);
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_observations`), 4, 'One observation per invoice per run');
    check(await scalar(`select count(*)::int value from internal_proesc.reconciliation_events where result='APPLIED'`), 1, 'One actual financial application');
    check(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots where link_id=$1`, [id(23)]), 1, 'Existing proved payment preserved');
    const paidSnapshot = await scalar(`select snapshot_id value from internal_proesc.v2_invoice_observations where invoice_id='101'`);
    check(await scalar('select internal_proesc.v2_net_discount_candidate($1,$2) value', [id(11), paidSnapshot]), true, 'Real net discount reader accepts representation');
    const originalFinancial = await scalar(`select jsonb_agg(to_jsonb(c) order by id) value from public.contas_receber c`);
    await full(initial);
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_observations`), 8, 'Unchanged FULL still has complete evidence');
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_payloads`), canonical ? 4 : 0, 'No repeated heavy payload');
    check(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots where link_id=$1`, [id(22)]), 2, 'OPEN history intentionally unchanged in this phase');
    check(await scalar(`select jsonb_agg(to_jsonb(c) order by id) value from public.contas_receber c`), originalFinancial, 'Repeated run cannot alter money');
    const changed = structuredClone(initial);
    changed[1].financialConfiguration.fineRate = '3';
    await full(changed);
    await full(initial);
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_payloads`), canonical ? 5 : 0, 'A B A shares content but retains transitions');
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_observations where invoice_id='102'`), 4, 'All A B A observations retained');
    const resolved = (await db.query(`select internal_proesc.v2_invoice_normalized(o) payload
      from internal_proesc.v2_invoice_observations o where invoice_id='102' order by observed_at,recorded_at,id`)).rows;
    check(resolved.map(r => r.payload.financialConfiguration.fineRate), ['2', '2', '3', '2'], 'Exact time sequence recoverable');
    await db.exec('select internal_proesc.v2_set_payload_storage_enabled(false)');
    await full(initial);
    check(await scalar(`select count(*)::int value from internal_proesc.v2_invoice_observations where normalized is not null`), canonical ? 4 : 20, 'Rollback resumes legacy writes without materializing/deleting history');
    check(await scalar('select internal_proesc.v2_net_discount_candidate($1,$2) value', [id(11), paidSnapshot]), true, 'Mixed canonical and legacy readers work');
    check(await scalar(`select count(*)::int value from internal_proesc.v2_people_observations where run_id=$1`, [firstRun]), 1, 'FULL identity evidence retained');
    const countBefore = await scalar('select count(*)::int value from internal_proesc.v2_invoice_payloads');
    await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    await assert.rejects(rpc('start', { runId: id(1999) }), /Denied/); checks++;
    check(await scalar('select count(*)::int value from internal_proesc.v2_invoice_payloads'), countBefore, 'Authorization before any new payload');
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    const finances = await scalar(`select jsonb_agg(to_jsonb(c)-'updated_at' order by id) value from public.contas_receber c`);
    const observations = (await db.query(`select invoice_id,result,reason,
      internal_proesc.v2_invoice_normalized(o) normalized from internal_proesc.v2_invoice_observations o
      order by invoice_id,observed_at,recorded_at,id`)).rows;
    const snapshots = (await db.query(`select link_id,principal_cents,received_cents,payment_date,
      source_status,verification,evidence_kind,components,accounting_lines,review_reasons
      from internal_proesc.financial_snapshots order by link_id,observed_at,recorded_at,id`)).rows;
    const bytes = await scalar(`select coalesce((select sum(pg_column_size(normalized)) from internal_proesc.v2_invoice_observations),0)
      +coalesce((select sum(pg_column_size(normalized)) from internal_proesc.v2_invoice_payloads),0) value`);
    return { finances, observations, snapshots, bytes: Number(bytes) };
  } finally { await db.close(); }
}

try {
  const legacy = await scenario(false);
  const canonical = await scenario(true);
  check(canonical.finances, legacy.finances, 'All receivables are identical');
  check(canonical.observations, legacy.observations, 'All observation values and outcomes are identical');
  check(canonical.snapshots, legacy.snapshots, 'All financial proof values and history are identical');
  assert.ok(canonical.bytes < legacy.bytes); checks++;
  console.log(JSON.stringify({ result: 'PASS', checks, legacyPayloadColumnBytes: legacy.bytes,
    canonicalPayloadColumnBytes: canonical.bytes,
    reduction: 1 - canonical.bytes / legacy.bytes,
    metric: 'Synthetic JSONB payload column bytes; not total database, WAL or disk provisioned',
    concurrency: 'Real PostgreSQL semantics in single-process WASM; multi-backend races remain a deployment gate' }, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
