import assert from 'node:assert/strict';
import { createPdvFixture, uid, polo, otherPolo, otherActor } from './pdv-printing.fixture.mjs';

const f = await createPdvFixture();
const { db } = f;
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const rejected = (action, code) => assert.rejects(action, error => error.code === code);
const printerInput = station => ({ poloId: polo, workstationId: station, name: 'Epson sintética',
  model: 'TM-T20', transport: 'BROWSER', behavior: 'PERGUNTAR', isDefault: true,
  active: true, expectedVersion: 0, template: { widthMm: 80, showLogo: true, footer: 'Obrigado', marginMm: 3, fontSize: 9 } });
let station, printer, receipt, job, claimed;
try {
  const financialBefore = await f.fingerprint();
  await check('estações autorizadas, registro idempotente e payload divergente rejeitado', async () => {
    const req = f.request();
    station = await f.register('Balcão sintético', req);
    assert.deepEqual(await f.register('Balcão sintético', req), station);
    await rejected(() => f.register('Outro balcão', req), 'PT409');
    assert.equal(station.ownedByCurrentUser, true);
  });
  await check('autorização ocorre antes do replay de registro e acesso a outro polo é negado', async () => {
    const req = f.request(); await f.register('Estação de prova', req);
    await f.settings({ use: false, manage: false });
    await rejected(() => f.register('Estação de prova', req), '42501');
    await f.settings();
    await rejected(() => f.scalar('SELECT public.get_pdv_printer_settings($1,NULL) result', [otherPolo]), '42501');
  });
  await check('configuração tem CAS e replay sem criar segunda impressora', async () => {
    const input = printerInput(station.id), req = f.request();
    printer = await f.save(input, req);
    assert.equal(printer.version, 1); assert.equal(printer.transportReady, true);
    assert.equal(printer.automaticReady, false);
    assert.deepEqual(await f.save(input, req), printer);
    printer = await f.save({ ...input, id: printer.id, expectedVersion: 1, name: 'Impressora atualizada' });
    assert.equal(printer.version, 2);
    await rejected(() => f.save({ ...input, id: printer.id, expectedVersion: 1 }), 'PT409');
  });
  await check('prontidão forjada, automático e modelos inválidos são rejeitados', async () => {
    const input = printerInput(station.id);
    await rejected(() => f.save({ ...input, automaticReady: true }), 'PT422');
    await rejected(() => f.save({ ...input, behavior: 'AUTOMATICO' }), 'PT409');
    for (const template of [{ widthMm: null }, { footer: null }, { showLogo: null },
      { marginMm: null }, { fontSize: null }, { widthMm: 90 }, { marginMm: 1 },
      { fontSize: 13 }, { footer: 'x'.repeat(241) }, { total: 'R$ 999' }]) {
      await rejected(() => f.save({ ...input, template }), 'PT422');
    }
  });
  await check('configuração e uso têm permissões distintas; estação de outro ator não é tomada', async () => {
    await f.settings({ manage: false });
    await rejected(() => f.save(printerInput(station.id)), '42501');
    await f.settings({ who: otherActor });
    await rejected(() => f.scalar('SELECT public.get_pdv_printer_settings($1,$2) result', [polo, station.id]), '42501');
    await rejected(() => f.receipt(uid(1), printer.id, station.id), '42501');
    await f.settings();
  });
  await check('snapshot usa pagamento real, máscara, marca dágua e data sem hora inventada', async () => {
    receipt = await f.receipt();
    assert.equal(receipt.totalCents, 50); assert.equal(receipt.totalDisplay, 'R$ 0,50');
    assert.equal(receipt.paidAtDisplay, '26/09/2026');
    assert.equal(receipt.payer.documentMasked, '00******000');
    assert.equal(receipt.issuer.watermarkOpacity, 0.12);
    assert.equal(receipt.issuer.watermarkScale, 65);
    assert.equal(receipt.issuer.watermarkRotate, true);
    assert.equal(receipt.issuer.watermarkUrl, 'https://example.invalid/watermark.png');
    assert.equal(receipt.behavior, 'PERGUNTAR'); assert.equal(receipt.transport, 'BROWSER');
    assert.equal(receipt.template.source, 'DEFAULT'); assert.equal(receipt.template.widthMm, 80);
    assert.equal(receipt.hasPriorPrint, false);
    assert.equal(receipt.id, (await f.receipt()).id); assert.match(receipt.number, /^PDV-\d+$/);
    assert.equal((await f.receipt(uid(12))).totalDisplay, 'R$ 95,00');
    assert.equal((await f.receipt(uid(13))).totalDisplay, 'R$ 110,00');
  });
  await check('PENDENTE, baixa incompleta/revertida, vínculos acadêmicos e outro polo não geram recibo', async () => {
    for (const id of [2, 3, 6, 7]) await rejected(() => f.receipt(uid(id)), 'PT409');
    for (const id of [4, 8, 9, 10, 11]) await rejected(() => f.receipt(uid(id)), 'PT404');
    await rejected(() => f.receipt(uid(5)), '42501');
  });
  await check('modelo institucional futuro não é ignorado pelo fallback', async () => {
    await db.exec("INSERT INTO public.documentos_modelos_configuracoes VALUES('recibo-institucional')");
    await rejected(() => f.receipt(uid(14)), 'PT409');
    assert.equal((await f.receipt()).id, receipt.id, 'recibo existente preserva snapshot');
    await db.exec('DELETE FROM public.documentos_modelos_configuracoes');
  });
  await check('snapshot financeiro é imutável e modelo selecionado segue a estação autorizada', async () => {
    await rejected(() => db.query("UPDATE internal_pdv.receipts SET financial_snapshot='{}' WHERE id=$1", [receipt.id]), 'PT409');
    await rejected(() => db.query('DELETE FROM internal_pdv.receipts WHERE id=$1', [receipt.id]), 'PT409');
    const selected = await f.receipt(uid(1), null, station.id);
    assert.equal(selected.printerId, printer.id); assert.equal(selected.template.version, 2);
    assert.equal(selected.id, receipt.id);
  });
  await check('prepare job é idempotente e congela modelo atual sem alterar o financeiro', async () => {
    const req = f.request();
    job = await f.prepare(receipt.id, { station: station.id, printer: printer.id, req });
    assert.deepEqual(await f.prepare(receipt.id, { station: station.id, printer: printer.id, req }), job);
    assert.equal(job.receipt.template.version, 2);
    const input = { ...printerInput(station.id), id: printer.id, expectedVersion: 2,
      template: { widthMm: 58, showLogo: false, footer: 'Novo modelo', marginMm: 4, fontSize: 10 } };
    printer = await f.save(input);
    claimed = await f.claim(job.id);
    assert.equal(claimed.canDispatch, true);
    assert.equal(claimed.receipt.template.widthMm, 80);
    assert.equal(claimed.receipt.template.version, 2);
    assert.equal((await f.receipt(uid(1), printer.id, station.id)).template.version, 3);
  });
  await check('claim nunca emite segundo token ou autoriza redispatch do mesmo job', async () => {
    const second = await f.claim(job.id);
    assert.equal(second.canDispatch, false); assert.equal(second.token, undefined);
    const anotherReceipt = await f.receipt(uid(14));
    const another = await f.prepare(anotherReceipt.id);
    const req = f.request(), firstClaim = await f.claim(another.id, req);
    const replay = await f.claim(another.id, req);
    assert.equal(firstClaim.canDispatch, true); assert.equal(replay.canDispatch, false);
    assert.equal(replay.token, undefined); assert.equal(replay.replayed, true);
    await f.complete(another.id, firstClaim.token, 'FAILED');
  });
  await check('mesmo recibo em duas abas não permite dois claims manuais simultâneos', async () => {
    const otherReceipt = await f.receipt(uid(15));
    const a = await f.prepare(otherReceipt.id), b = await f.prepare(otherReceipt.id);
    const ca = await f.claim(a.id);
    await rejected(() => f.claim(b.id), 'PT409');
    await f.complete(a.id, ca.token, 'UNKNOWN');
    await rejected(() => f.prepare(otherReceipt.id), 'PT409');
  });
  await check('resultado não afirma impressão física; token inválido e PRINTED são rejeitados', async () => {
    await rejected(() => f.complete(job.id, uid(555), 'DIALOG_CLOSED'), '42501');
    await rejected(() => f.complete(job.id, claimed.token, 'PRINTED'), 'PT422');
    const done = await f.complete(job.id, claimed.token, 'DIALOG_CLOSED');
    assert.equal(done.status, 'DIALOG_CLOSED'); assert.equal(done.canDispatch, false);
    assert.deepEqual(await f.complete(job.id, claimed.token, 'DIALOG_CLOSED'), done);
    assert.equal((await f.receipt()).hasPriorPrint, true);
    await rejected(() => f.prepare(receipt.id), 'PT409');
  });
  await check('reimpressão exige ação e motivo explícitos; automático permanece bloqueado', async () => {
    await rejected(() => f.prepare(receipt.id, { purpose: 'AUTO' }), 'PT409');
    await rejected(() => f.prepare(receipt.id, { purpose: 'REPRINT' }), 'PT422');
    const reprint = await f.prepare(receipt.id, { purpose: 'REPRINT', reason: 'Segunda via solicitada' });
    const lease = await f.claim(reprint.id);
    assert.equal(lease.receipt.id, receipt.id);
    await db.query("UPDATE internal_pdv.print_jobs SET lease_expires_at=now()-interval '1 minute' WHERE id=$1", [reprint.id]);
    assert.equal((await f.complete(reprint.id, lease.token, 'DIALOG_CLOSED')).status, 'UNKNOWN');
    assert.equal((await f.claim(reprint.id)).canDispatch, false);
  });
  await check('revogação de permissão ocorre antes de replay de job/claim', async () => {
    const r = await f.receipt(uid(16)), req = f.request();
    const j = await f.prepare(r.id, { req });
    await f.settings({ use: false });
    await rejected(() => f.prepare(r.id, { req }), '42501');
    await rejected(() => f.claim(j.id), '42501');
    await f.settings({ who: otherActor });
    await rejected(() => f.claim(j.id), '42501');
    await f.settings();
  });
  await check('lease expirada no replay vira UNKNOWN auditado, sem novo token', async () => {
    const r = await f.receipt(uid(12)), j = await f.prepare(r.id), req = f.request();
    await f.claim(j.id, req);
    await db.query("UPDATE internal_pdv.print_jobs SET lease_expires_at=now()-interval '1 minute' WHERE id=$1", [j.id]);
    const replay = await f.claim(j.id, req);
    assert.equal(replay.status, 'UNKNOWN'); assert.equal(replay.canDispatch, false);
    assert.equal(replay.token, undefined);
    assert.equal(await f.scalar("SELECT count(*)::integer result FROM internal_pdv.audit WHERE entity_id=$1 AND operation='EXPIRE_PRINT'", [j.id]), 1);
    await f.claim(j.id, req);
    assert.equal(await f.scalar("SELECT count(*)::integer result FROM internal_pdv.audit WHERE entity_id=$1 AND operation='EXPIRE_PRINT'", [j.id]), 1);
  });
  await check('mudança da baixa invalida recibo antigo antes de qualquer claim', async () => {
    const r = await f.receipt(uid(16)), j = await f.prepare(r.id);
    await db.exec('BEGIN');
    try {
      await db.query('UPDATE public.contas_receber SET valor_pago=1 WHERE id=$1', [uid(16)]);
      await rejected(() => f.claim(j.id), 'PT409');
    } finally { await db.exec('ROLLBACK'); }
  });
  await check('QZ e ePOS podem ser cadastrados mas não fingem transporte pronto', async () => {
    for (const transport of ['QZ_TRAY', 'EPOS']) {
      const p = await f.save({ ...printerInput(station.id), transport, isDefault: false });
      assert.equal(p.transportReady, false); assert.equal(p.automaticReady, false);
      await rejected(() => f.prepare(receipt.id, { station: station.id, printer: p.id,
        purpose: 'REPRINT', reason: 'Prova de transporte' }), 'PT409');
    }
  });
  await check('ACL privada e RLS negam leitura direta e público anônimo não chama RPC', async () => {
    const tables = (await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='internal_pdv'::regnamespace AND relkind='r'")).rows;
    assert.equal(tables.length, 6); assert.ok(tables.every(x => x.relrowsecurity));
    await db.exec('SET ROLE authenticated');
    assert.equal((await f.receipt()).id, receipt.id, 'RPC permitida ao ator autorizado sem acesso às tabelas');
    await rejected(() => db.query('SELECT * FROM internal_pdv.receipts'), '42501');
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE anon');
    await rejected(() => f.receipt(), '42501');
    await rejected(() => f.register(), '42501');
    await db.exec('RESET ROLE');
    assert.equal(await f.fingerprint(), financialBefore, 'Nenhum valor/status/recebível alterado pelas RPCs');
    assert.equal(await f.scalar('SELECT count(*)::integer result FROM internal_pdv.print_jobs WHERE purpose=$1', ['AUTO']), 0);
  });
  console.log(`PASS ${passed} integration checks; canonical financial rows preserved.`);
} finally { await db.close(); }
