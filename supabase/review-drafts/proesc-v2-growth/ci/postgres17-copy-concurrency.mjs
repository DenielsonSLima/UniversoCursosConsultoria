// Runs only inside the guarded, loopback-only disposable PostgreSQL harness.
import assert from 'node:assert/strict';
import { installCopyDraft, syntheticCopyReceipt } from '../../../tests/fixtures/proesc-v2-copy.fixture.mjs';

export async function runNativeCopyChecks({ main, a, b, id, runId, waitBlocked }) {
  let checks = 0;
  const value = async (client, sql, args = []) => (await client.query(sql, args)).rows[0].value;
  await installCopyDraft({ exec: (sql) => main.query(sql) });
  const ids = (await main.query('SELECT id FROM internal_proesc.v2_invoice_observations WHERE run_id=$1 ORDER BY id', [runId])).rows.map((row) => row.id);
  assert.equal(ids.length, 2); checks++;
  const prepare = (client, batch, selected = ids) => value(client,
    'SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[]) value', [batch, runId, '3145', selected]);
  const exportBatch = (batch) => value(main, 'SELECT public.proesc_v2_export_copy_service($1) value', [batch]);
  const record = (client, receipt) => value(client,
    'SELECT public.proesc_v2_record_copy_receipt_service($1,$2::jsonb) value', [receipt.batchId, JSON.stringify(receipt)]);

  await a.query('BEGIN'); const owner = await prepare(a, id(7000));
  await b.query('BEGIN'); const rival = prepare(b, id(7000), [...ids].reverse());
  await waitBlocked(rival); await a.query('COMMIT');
  assert.deepEqual(await rival, owner); await b.query('COMMIT'); checks++;

  await a.query('BEGIN'); await prepare(a, id(7001));
  await b.query('BEGIN'); const divergent = prepare(b, id(7001), [ids[0]]);
  await waitBlocked(divergent); await a.query('COMMIT');
  await assert.rejects(divergent, /Copy plan replay conflict/); await b.query('ROLLBACK'); checks++;

  const receipt = syntheticCopyReceipt(await exportBatch(id(7000)));
  await a.query('BEGIN'); const recorded = await record(a, receipt);
  await b.query('BEGIN'); const receiptReplay = record(b, receipt);
  await waitBlocked(receiptReplay); await a.query('COMMIT');
  assert.deepEqual(await receiptReplay, recorded); await b.query('COMMIT'); checks++;

  const nextReceipt = syntheticCopyReceipt(await exportBatch(id(7001)));
  await a.query('BEGIN'); await record(a, nextReceipt);
  await b.query('BEGIN'); const receiptConflict = record(b, { ...nextReceipt, compressedBytes: 601 });
  await waitBlocked(receiptConflict); await a.query('COMMIT');
  await assert.rejects(receiptConflict, /Copy receipt replay conflict/); await b.query('ROLLBACK'); checks++;

  await a.query('BEGIN'); await prepare(a, id(7002));
  await b.query('BEGIN'); const afterPlanRollback = prepare(b, id(7002));
  await waitBlocked(afterPlanRollback); await a.query('ROLLBACK');
  assert.equal((await afterPlanRollback).status, 'PREPARED_COPY_ONLY'); await b.query('COMMIT'); checks++;
  const rollbackReceipt = syntheticCopyReceipt(await exportBatch(id(7002)));
  await a.query('BEGIN'); await record(a, rollbackReceipt);
  await b.query('BEGIN'); const afterReceiptRollback = record(b, rollbackReceipt);
  await waitBlocked(afterReceiptRollback); await a.query('ROLLBACK');
  assert.equal((await afterReceiptRollback).status, 'COPY_RECEIPT_RECORDED'); await b.query('COMMIT'); checks++;

  // A stable export sees committed source only. A later change invalidates the approved digest.
  const originalReason = await value(main, 'SELECT reason value FROM internal_proesc.v2_invoice_observations WHERE id=$1', [ids[0]]);
  await a.query('BEGIN'); await a.query("UPDATE internal_proesc.v2_invoice_observations SET reason='synthetic copy drift' WHERE id=$1", [ids[0]]);
  assert.equal((await exportBatch(id(7000))).payloadSha256, receipt.payloadSha256); checks++;
  await a.query('COMMIT'); await assert.rejects(exportBatch(id(7000)), /changed after approved plan/); checks++;
  await main.query('UPDATE internal_proesc.v2_invoice_observations SET reason=$1 WHERE id=$2', [originalReason, ids[0]]);
  assert.equal(Number(await value(main, 'SELECT count(*) value FROM internal_proesc.v2_copy_archive_plans')), 3); checks++;
  assert.equal(Number(await value(main, 'SELECT count(*) value FROM internal_proesc.v2_copy_archive_receipts')), 3); checks++;
  await main.query('SELECT internal_proesc.v2_assert_payload_readers()'); checks++;
  return { result: 'PASS', checks, scope: 'Copy-only plan/receipt contention and source drift; no Storage requests' };
}
