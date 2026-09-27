import assert from 'node:assert/strict';
import { createIdentityFixture } from './pdv-receipt-identity.fixture.mjs';
import { uid, otherPolo } from './pdv-printing.fixture.mjs';

const f = await createIdentityFixture();
let passed = 0;
const check = async (name, action) => { await action(); passed++; console.log(`PASS ${name}`); };
const denied = (action, code) => assert.rejects(action, error => error.code === code);
const sidecar = receipt => f.scalar('SELECT to_jsonb(i) result FROM internal_pdv.receipt_identity i WHERE receipt_id=$1', [receipt]);
try {
  if (process.env.PDV_IDENTITY_SKIP_MIGRATION !== '1') await f.apply();
  await check('recibo antigo comprovado recebe matrícula e pontuação sem alterar emissão', async () => {
    const current = await f.receipt();
    assert.equal(current.payer.documentLabel, 'CPF');
    assert.equal(current.payer.documentMasked, '12*.***.**3-45');
    assert.equal(current.payer.enrollmentNumber, 'UNIV-A-00001234');
    for (const key of ['id', 'number', 'issuedAt', 'totalCents', 'totalDisplay', 'paidAt', 'paidAtDisplay', 'issuer']) {
      assert.deepEqual(current[key], f.old[1][key]);
    }
    const captured = await sidecar(current.id);
    assert.equal(captured.source, 'BANESE_REPLACEMENT');
    assert.equal(captured.payer_id, uid(700)); assert.ok(captured.captured_at);
    assert.equal(captured.source_reference, uid(101));
    assert.equal(JSON.stringify(captured).includes('12345678345'), false);
    assert.deepEqual(await f.receipt(), current);
  });
  await check('origem ausente, divergente, duplicada ou posterior não inventa matrícula', async () => {
    for (const n of [12, 13, 14, 15, 16, 17]) {
      const current = await f.receipt(uid(n));
      assert.equal(current.payer.enrollmentNumber, null, `Case ${n}`);
      assert.equal(current.payer.documentMasked, '12*.***.**3-45');
      assert.equal((await sidecar(current.id)).source, 'LEGACY_UNPROVEN');
      assert.equal((await sidecar(current.id)).payer_id, null);
    }
  });
  await check('cadastro divergente não substitui documento congelado nem força associação', async () => {
    const current = await f.receipt(uid(18));
    assert.equal(current.payer.enrollmentNumber, null);
    assert.equal(current.payer.documentMasked, '12*.***.**3-45');
    assert.equal(current.payer.name, f.old[18].payer.name);
  });
  await check('novo avulso de aluno usa matrícula de acesso sem vínculo de curso', async () => {
    const current = await f.receipt(uid(19));
    assert.equal(current.payer.enrollmentNumber, 'UNIV-A-00001234');
    assert.equal(current.payer.documentMasked, '12*.***.**3-45');
    const captured = await sidecar(current.id);
    assert.equal(captured.source, 'RECEIPT_CREATION');
    assert.equal(captured.payer_id, uid(700)); assert.equal(captured.source_reference, null);
    assert.equal(await f.scalar(`SELECT matricula_id IS NULL AND turma_id IS NULL result
      FROM public.contas_receber WHERE id=$1`, [uid(19)]), true);
  });
  await check('preparações simultâneas e replay convergem em recibo e identidade únicos', async () => {
    // PGlite serializes its single connection. This covers simultaneous callers
    // and unique/replay outcomes, not a real multi-session lock contention test.
    const receipts = await Promise.all(Array.from({ length: 8 }, () => f.receipt(uid(21))));
    for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
    assert.equal(await f.scalar(`SELECT count(*)::integer result FROM internal_pdv.receipt_identity
      WHERE receipt_id=$1`, [receipts[0].id]), 1);
    assert.equal(await f.scalar(`SELECT count(*)::integer result FROM internal_pdv.receipts
      WHERE receivable_id=$1`, [uid(21)]), 1);
    assert.equal((await sidecar(receipts[0].id)).source, 'RECEIPT_CREATION');
  });
  await check('CNPJ usa máscara 2+3 pontuada e pagador não aluno fica sem matrícula', async () => {
    const current = await f.receipt(uid(22));
    assert.equal(current.payer.documentLabel, 'CNPJ');
    assert.equal(current.payer.documentMasked, '12.***.***/***3-45');
    assert.equal(current.payer.enrollmentNumber, null);
    assert.equal((await sidecar(current.id)).payer_id, uid(701));
  });
  await check('máscara já pontuada é idempotente; valores fora do contrato não expõem documento', async () => {
    const format = value => f.scalar('SELECT internal_pdv.format_masked_document($1) result', [value]);
    assert.deepEqual(await format('12******345'), await format('12*.***.**3-45'));
    assert.deepEqual(await format('12*********345'), await format('12.***.***/***3-45'));
    for (const unsafe of [null, '', '12345678345', '12345678000345', '***.***.345-**', '123*****345']) {
      assert.deepEqual(await format(unsafe), { documentLabel: 'Documento', documentMasked: null });
    }
  });
  await check('identidade capturada não muda com o cadastro nem aceita update/delete', async () => {
    const current = await f.receipt(uid(19)), before = await sidecar(current.id);
    await f.db.query('UPDATE public.parceiros SET matricula_acesso=$1 WHERE id=$2', ['UNIV-A-99998888', uid(700)]);
    assert.equal((await f.receipt(uid(19))).payer.enrollmentNumber, 'UNIV-A-00001234');
    assert.equal((await f.receipt()).payer.enrollmentNumber, 'UNIV-A-00001234');
    assert.deepEqual(await sidecar(current.id), before);
    await denied(() => f.db.query(`UPDATE internal_pdv.receipt_identity SET enrollment_number='UNIV-A-11111111'
      WHERE receipt_id=$1`, [current.id]), 'PT409');
    await denied(() => f.db.query('DELETE FROM internal_pdv.receipt_identity WHERE receipt_id=$1', [current.id]), 'PT409');
    const latest = await f.receipt(uid(20));
    assert.equal(latest.payer.enrollmentNumber, 'UNIV-A-99998888');
  });
  await check('autorização é reavaliada antes de reuse e sidecar não abre leitura direta', async () => {
    await f.settings({ use: false });
    await denied(() => f.receipt(), '42501');
    await f.settings({ scope: otherPolo });
    await denied(() => f.receipt(), '42501');
    await f.settings();
    await f.db.exec('SET ROLE authenticated');
    assert.equal((await f.receipt()).payer.enrollmentNumber, 'UNIV-A-00001234');
    await denied(() => f.db.query('SELECT * FROM internal_pdv.receipt_identity'), '42501');
    await denied(() => f.scalar('SELECT internal_pdv.capture_receipt_identity($1,true) result', [f.old[1].id]), '42501');
    await f.db.exec('RESET ROLE; SET ROLE anon');
    await denied(() => f.receipt(), '42501');
    await f.db.exec('RESET ROLE');
  });
  await check('job antigo permanece literal; novo job congela a projeção enriquecida', async () => {
    assert.equal(await f.jobHash(), f.before.job);
    const current = await f.receipt();
    const job = await f.prepare(current.id, { purpose: 'REPRINT', reason: 'Segunda via com identificação' });
    assert.deepEqual(job.receipt.payer, current.payer);
    assert.equal(f.oldJob.receipt.payer.enrollmentNumber, undefined);
    assert.equal(f.oldJob.receipt.payer.documentMasked, '12******345');
    assert.notDeepEqual(job.receipt.payer, f.oldJob.receipt.payer);
  });
  await check('valores/status/snapshots existentes, OIDs/ACL e STABLE são preservados', async () => {
    assert.equal(await f.fingerprint(), f.before.financial);
    assert.equal(await f.receiptsHash(), f.before.receipts);
    assert.equal(await f.jobHash(), f.before.job);
    assert.deepEqual((await f.metadata()).rows, f.before.metadata);
    assert.equal(await f.scalar(`SELECT relrowsecurity result FROM pg_class
      WHERE oid='internal_pdv.receipt_identity'::regclass`), true);
  });
  console.log(`PASS ${passed} receipt identity integration checks; no remote operations.`);
} finally { await f.db.close(); }
