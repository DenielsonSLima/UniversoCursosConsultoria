import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { id } from './nfse_service_receivables.fixture.mjs';
import { prepareServiceCancellation, service, cancelFiscal, call, value, proof } from './nfse_service_cancellation.fixture.mjs';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const operationFile = name => new URL(`../operations/nfse-service-${name}-20261112.sql`, import.meta.url);
const queryStatus = (db, title) => value(db, 'SELECT status value FROM public.contas_receber WHERE id=$1', [title]);
const args = job => [job.jobId, job.leaseToken];

async function fixture() {
  const db = new PGlite(); await prepareServiceCancellation(db);
  const previous = await service(db, 6, { amount: '120.00' });
  await db.query("UPDATE private.nfse_service_receivables SET origin='HISTORICAL' WHERE receivable_id=$1", [previous.titles[0]]);
  // The real correction concerns a fiscal cancellation predating the new queue.
  await db.exec('ALTER TABLE private.nfse_individual_cancellations DISABLE TRIGGER nfse_service_receivable_cancel_enqueue');
  await cancelFiscal(db, previous);
  await db.exec('ALTER TABLE private.nfse_individual_cancellations ENABLE TRIGGER nfse_service_receivable_cancel_enqueue');
  const active = { serviceId: id(700), operation: id(10007) };
  await db.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
    service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
    VALUES($1,$2,'PRODUCAO',$3,$4,'2026-11-12','Serviço sintético ativo',120,'{}','{}',null,'NONE',$5)`,
  [active.serviceId, id(1), id(20), id(30), id(11)]);
  await db.exec('ALTER TABLE private.nfse_individual_operations DISABLE TRIGGER nfse_service_financial_authorized');
  await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml,actor_id,context_id,month)
    VALUES($1,$2,'PRODUCAO','AUTHORIZED',$3,$4,$5,$6,$7,'2026-11')`,
  [active.operation, id(1), { source: { kind: 'PARTNER_SERVICE', id: active.serviceId, amount: '120.00' } },
    { number: '7', accessKey: '7'.repeat(50) },
    '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>7</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Descrição fiscal sintética ativa</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>', id(11), id(10)]);
  await db.exec('ALTER TABLE private.nfse_individual_operations ENABLE TRIGGER nfse_service_financial_authorized');
  const run = async name => {
    let source = await readFile(operationFile(name), 'utf8');
    const constants = [...new Set([...source.matchAll(/'([0-9a-f]{8}-[0-9a-f-]{27})'/g)].map(match => match[1]))];
    const replacements = name === 'local-cancellation' ? [previous.titles[0], previous.cancellation]
      : [previous.titles[0], active.operation, active.serviceId];
    assert.equal(constants.length, replacements.length, 'The operational scope must remain explicitly bounded');
    constants.forEach((original, index) => { source = source.replaceAll(original, replacements[index]); });
    source = source.replaceAll('14863.71', '120.00');
    try { await db.exec(source); } catch (error) { await db.exec('ROLLBACK'); throw error; }
  };
  const completePrevious = async () => {
    await run('local-cancellation');
    const job = await call(db, 'claim_nfse_service_cancellation_job_internal');
    assert.equal(job.receivableId, previous.titles[0]);
    assert.equal((await call(db, 'get_nfse_service_cancellation_material_internal', args(job))).action, 'LOCAL_CANCEL');
    await call(db, 'complete_nfse_service_cancellation_job_internal', [...args(job), proof('LOCAL_CANCELLED')]);
    assert.equal(await queryStatus(db, previous.titles[0]), 'CANCELADO');
  };
  return { db, previous, active, run, completePrevious };
}

test('authorized local correction closes only historical invoice 6 and creates one distinct local invoice 7 title', async () => {
  const f = await fixture(); const { db, previous, active, run } = f;
  try {
    assert.equal(await value(db, 'SELECT private.nfse_service_cancellation_proven($1) value', [previous.cancellation]), true);
    await assert.rejects(run('active-receivable'), error => error.code === '40001');
    await run('local-cancellation'); await run('local-cancellation');
    assert.equal(await value(db, 'SELECT count(*)::int value FROM private.nfse_service_cancellation_jobs'), 1);
    assert.equal(await queryStatus(db, previous.titles[0]), 'PENDENTE', 'Enqueue does not pretend the worker already completed');
    await f.completePrevious();
    await run('local-cancellation');
    await run('active-receivable'); await run('active-receivable');
    const titles = (await db.query('SELECT c.*,l.operation_id,l.fiscal_number,l.fiscal_description FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id WHERE l.service_id=$1', [active.serviceId])).rows;
    assert.equal(titles.length, 1);
    const title = titles[0]; assert.notEqual(title.id, previous.titles[0]);
    assert.equal(title.operation_id, active.operation); assert.equal(title.fiscal_number, '7');
    assert.equal(title.status, 'PENDENTE'); assert.equal(Number(title.valor), 120);
    assert.equal(new Date(title.data_vencimento).toISOString().slice(0, 10), '2026-11-30');
    assert.equal(title.polo_id, id(1)); assert.equal(title.cliente_id, id(20));
    assert(title.descricao.includes('Descrição fiscal sintética ativa')); assert.equal(title.gateway_provider, null);
    assert.equal(await value(db, 'SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'), 0);
    assert.equal(await value(db, 'SELECT count(*)::int value FROM public.payment_gateway_transactions'), 0);
    assert.equal(await value(db, 'SELECT count(*)::int value FROM public.financial_payment_events'), 0);
    assert.equal(await value(db, 'SELECT issue_bolepix value FROM private.nfse_service_financial_plans WHERE service_id=$1', [active.serviceId]), false);
  } finally { await db.close(); }
});

test('historical cancellation refuses malformed fiscal proof, payment history and any bank identity', async () => {
  for (const scenario of ['bad-proof', 'payment', 'bank', 'wrong-due']) {
    const { db, previous, run } = await fixture();
    try {
      if (scenario === 'bad-proof') await db.query("UPDATE private.nfse_individual_cancellations SET event_xml='<evento/>' WHERE id=$1", [previous.cancellation]);
      if (scenario === 'payment') await db.query("INSERT INTO public.financial_payment_events(id,source_kind,source_id,received_amount) VALUES($1,'RECEIVABLE',$2,20)", [id(990), previous.titles[0]]);
      if (scenario === 'bank') await db.query("UPDATE public.contas_receber SET gateway_provider='banese_card',gateway_payment_id='synthetic-bank-id' WHERE id=$1", [previous.titles[0]]);
      if (scenario === 'wrong-due') await db.query("UPDATE public.contas_receber SET data_vencimento='2026-11-29' WHERE id=$1", [previous.titles[0]]);
      await assert.rejects(run('local-cancellation'), error => error.code === '40001', scenario);
      assert.equal(await queryStatus(db, previous.titles[0]), 'PENDENTE');
      assert.equal(await value(db, 'SELECT count(*)::int value FROM private.nfse_service_cancellation_jobs'), 0);
    } finally { await db.close(); }
  }
});

test('active title correction rejects a changed plan, cancelled invoice or changed financial terms without duplicates', async () => {
  for (const scenario of ['changed-plan', 'cancelled-active', 'changed-source', 'changed-due', 'changed-replay-plan']) {
    const { db, previous, active, run, completePrevious } = await fixture();
    try {
      await completePrevious();
      if (scenario === 'changed-plan') await db.query(`INSERT INTO private.nfse_service_financial_plans(service_id,due_date,category_id,rule,issue_bolepix)
        VALUES($1,'2026-11-30',$2,'EXPLICIT',true)`, [active.serviceId, id(40)]);
      if (scenario === 'cancelled-active') await db.query("INSERT INTO private.nfse_individual_cancellations(id,operation_id,state) VALUES($1,$2,'CANCELLED')", [id(998), active.operation]);
      if (scenario === 'changed-source') await db.query("UPDATE private.nfse_individual_operations SET snapshot=jsonb_set(snapshot,'{source,id}',to_jsonb($2::text)) WHERE id=$1", [active.operation, id(999)]);
      if (scenario === 'changed-due') {
        await run('active-receivable');
        await db.query("UPDATE public.contas_receber SET data_vencimento='2026-11-29' WHERE id=(SELECT receivable_id FROM private.nfse_service_receivables WHERE service_id=$1)", [active.serviceId]);
      }
      if (scenario === 'changed-replay-plan') {
        await run('active-receivable');
        await db.query('UPDATE private.nfse_service_financial_plans SET issue_bolepix=true WHERE service_id=$1', [active.serviceId]);
      }
      await assert.rejects(run('active-receivable'), error => error.code === '40001', scenario);
      assert.equal(await queryStatus(db, previous.titles[0]), 'CANCELADO');
      assert.equal(await value(db, 'SELECT count(*)::int value FROM private.nfse_service_receivables WHERE service_id=$1', [active.serviceId]),
        ['changed-due', 'changed-replay-plan'].includes(scenario) ? 1 : 0);
      assert.equal(await value(db, 'SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'), 0);
    } finally { await db.close(); }
  }
});
