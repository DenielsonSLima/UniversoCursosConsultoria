import assert from 'node:assert/strict';
import {loadEadExpirationTestSetup} from './ead_checkout_expiration_test_setup.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// PostgreSQL/WASM only. This file never opens a Supabase or bank connection.
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const { pgcrypto } = await import(process.env.PGLITE_MODULE_PATH
  ? new URL('./contrib/pgcrypto.js', packageUrl).href
  : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const source = (name) => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
const fixture = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const functionSource = (sql, name) => {
  const start = sql.search(new RegExp('create(?: or replace)? function ' + name.replaceAll('.', '\\.') + '\\(', 'i'));
  assert.ok(start >= 0, name);
  const tail = sql.slice(start);
  const tag = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(tag + ';') + tag.length + 1);
};
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const polo = '00000000-0000-0000-0000-000000000001';
const course = '00000000-0000-0000-0000-000000000012';
const turma = '00000000-0000-0000-0000-000000000022';
const line = '0479' + '0'.repeat(43);
const barcode = '0479' + '0'.repeat(40);
const claim = (lane='ACTION') => scalar('select public.claim_banese_ead_checkout_expiration($1) value',[lane]);
const releaseReady = () => scalar('select internal_contas.ead_expiration_release_ready() value');
const facts = (n) => scalar([
  'select jsonb_build_object(',
  "'receipt',(select to_jsonb(c) from public.contas_receber c where id=$1),",
  "'enrollment',(select to_jsonb(m) from public.matriculas m where id=$1),",
  "'inscription',(select to_jsonb(i) from public.inscricoes_online i where id=$1),",
  "'transaction',(select to_jsonb(t) from public.payment_gateway_transactions t where id=$1)) value",
].join('\n'), [id(n)]);
const finish = (c, result, remote, situation, payments = 0, error = null) => scalar(
  'select public.finish_banese_ead_checkout_expiration($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
  [c.jobId, c.leaseToken, result, remote, situation, payments, 'a'.repeat(64), error,'2026-12-31'],
);
const readyAgain = (c) => db.query(
  "update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now()-interval '1 second' where id=$1",
  [c.jobId],
);
const expectBlocked = async (action) => {
  await db.exec('savepoint expected_block');
  await assert.rejects(action, (error) => error.code === 'PT409');
  await db.exec('rollback to expected_block');
};
const scenario = async (action) => {
  await db.exec('begin');
  try { await action(); } finally { await db.exec('rollback'); }
};

const addPurchase = async (n) => {
  await db.query("insert into public.parceiros(id,nome) values($1,'Aluno QA')",[id(n)]);
  await db.query("insert into public.matriculas(id,turma_id,aluno_id,status) values($1,$2,$1,'PENDENTE')", [id(n), turma]);
  await db.query([
    'insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,',
    'valor,data_vencimento,tipo_lancamento,origem_pagamento,gateway_provider,gateway_environment,',
    'gateway_payment_method,gateway_payment_id,gateway_boleto_nosso_numero,gateway_boleto_convenio,',
    'gateway_boleto_agencia,gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,',
    'gateway_submission_channel,gateway_submission_status,gateway_financial_terms,',
    'gateway_financial_terms_confirmed_at,gateway_status,updated_at)',
    "values($1,$2,$1,$3,$1,'PENDENTE',99.9,'2026-01-02','MATRICULA','GATEWAY_EAD','banese_card',",
    "'production','BOLETO',$4,$4,'1','001',$5,$6,'API','API_REGISTERED',",
    "'{\"nominalAmount\":99.9,\"dueDate\":\"2026-01-02\",\"discount\":null,\"penalty\":null,\"interest\":null}',",
    "now(),'PENDING',now())",
  ].join('\n'), [id(n), polo, turma, String(n).padStart(9, '0'), line, barcode]);
  await db.query([
    'insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,matricula_id,',
    'receivable_id,status,gateway_provider,gateway_environment,gateway_payment_id,valor,forma_pagamento)',
    "values($1,$2,$3,$1,$1,$1,'AGUARDANDO_PAGAMENTO','banese_card','production',$4,99.9,'BOLETO')",
  ].join('\n'), [id(n), course, turma, String(n).padStart(9, '0')]);
  await db.query([
    'insert into public.payment_gateway_transactions(id,receivable_id,remote_status,',
    'provider_code,environment,payment_method,remote_payment_id,bank_slip_our_number,',
    'bank_slip_digitable_line,bank_slip_barcode,inscricao_online_id,amount,installments,origin_polo_id)',
    "values($1,$1,'PENDING','banese_card','production','BOLETO',$2,$2,$3,$4,$1,99.9,1,$5)",
  ].join('\n'), [id(n), String(n).padStart(9, '0'), line, barcode, polo]);
  await db.query("insert into public.banese_reconciliation_queue(receivable_id,state,next_check_at) values($1,'READY',now())", [id(n)]);
};

// Synthetic preexisting jobs exercise recovery; readiness remains false throughout.
const seedJob = async (n, { intent = false, processing = false, mode = 'CANCEL' } = {}) => {
  const jobId = id(1000 + n);
  const leaseToken = processing ? id(2000 + n) : null;
  await db.query([
    'insert into public.banese_ead_checkout_expiration_jobs(id,receivable_id,matricula_id,',
    'inscription_id,transaction_id,environment,snapshot,expected_receivable_updated_at,',
    'expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,',
    'state,processing_mode,lease_token,lease_until,remote_mutation_started_at)',
    "select $2,c.id,c.matricula_id,i.id,t.id,'production',internal_contas.ead_expiration_identity(c.id),",
    "c.updated_at,t.updated_at,i.updated_at,'2026-01-08',$3,$4,$5,",
    "case when $5::uuid is null then null else now()+interval '2 minutes' end,",
    'case when $6 then now() else null end',
    'from public.contas_receber c join public.inscricoes_online i on i.receivable_id=c.id',
    'join public.payment_gateway_transactions t on t.receivable_id=c.id where c.id=$1',
  ].join('\n'), [id(n), jobId, processing ? 'PROCESSING' : 'RETRY', mode, leaseToken, intent]);
  if (processing) await db.query("update public.banese_reconciliation_queue set state='EXPIRATION_FENCED' where receivable_id=$1", [id(n)]);
  return { jobId, leaseToken };
};

try {
  await loadEadExpirationTestSetup(db);

  await addPurchase(1);
  await scalar('select internal_contas.ead_adopt_optional_attempt($1) value',[id(1)]);
  const original = await facts(1);
  assert.equal(await scalar("select enabled value from public.banese_ead_checkout_expiration_config where environment='production'"), false);
  await db.exec("update public.banese_ead_checkout_expiration_config set enabled=true,verified_local_holidays='{}',verified_polo_ids=array['00000000-0000-0000-0000-000000000001'::uuid] where environment='production'");
  await scenario(async () => {
    const eligible = await claim();
    assert.equal(eligible.claimed, true, 'Control: the same complete purchase is eligible before the release gate');
    assert.equal(eligible.mode, 'CANCEL');
  });
  await db.exec(source('20261005015530_ead_checkout_expiration_release_gate.sql'));
  assert.equal(await releaseReady(), false);
  assert.equal(await scalar('select internal_contas.ead_checkout_can_expire($1) value', [id(1)]), true);
  assert.equal((await claim()).claimed, false, 'Operator enable and verified calendar cannot authorize a new cancellation');
  assert.equal(await scalar('select count(*)::int value from public.banese_ead_checkout_expiration_jobs'), 0);
  assert.deepEqual(await facts(1), original);

  await scenario(async () => {
    await seedJob(1);
    assert.equal((await claim()).claimed, false, 'A preexisting job without a remote intent cannot bypass the release gate');
    assert.deepEqual(await facts(1), original);
  });
  await scenario(async () => {
    const c = await seedJob(1, { processing: true });
    await expectBlocked(() => scalar('select public.start_banese_ead_checkout_expiration_mutation($1,$2) value', [c.jobId, c.leaseToken]));
    assert.equal(await scalar('select remote_mutation_started_at value from public.banese_ead_checkout_expiration_jobs where id=$1', [c.jobId]), null);
    for (const [remote, situation] of [['EXPIRED', 4], ['CANCELED', 5]]) {
      await expectBlocked(() => finish(c, 'CANCELED', remote, situation));
    }
    assert.deepEqual(await facts(1), original, 'No new bank intent or local cancellation is persisted');
  });
  await scenario(async () => {
    const natural = await seedJob(1, { processing: true, mode: 'VERIFY' });
    await expectBlocked(() => finish(natural, 'CANCELED', 'EXPIRED', 4));
    assert.deepEqual(await facts(1), original, 'Natural remote expiry without a previous mutation cannot cancel the purchase locally');
  });

  await scenario(async () => {
    await seedJob(1, { intent: true });
    await db.exec("update public.banese_ead_checkout_expiration_config set enabled=false,verified_local_holidays=null where environment='production'");
    const c = await claim();
    assert.equal(c.claimed, true);
    assert.equal(c.mode, 'VERIFY', 'A remote intent is recovered without another PUT when configuration is disabled');
    await finish(c, 'CANCELED', 'CANCELED', 5);
    const canceled = await facts(1);
    assert.equal(canceled.receipt.status, 'CANCELADO');
    assert.equal(canceled.enrollment.status, 'PENDENTE');
    assert.equal(canceled.receipt.gateway_boleto_nosso_numero, original.receipt.gateway_boleto_nosso_numero);
    await readyAgain(c);
    const observed = await claim('OBSERVE');
    assert.equal(observed.claimed, true);
    assert.equal(observed.mode, 'OBSERVE');
    await finish(observed, 'OBSERVED_UNPAID', 'CANCELED', 5);
    assert.deepEqual(await facts(1), canceled, 'Observation preserves the original canceled history');
    await readyAgain(c);
    const late = await claim('OBSERVE');
    assert.equal(late.mode, 'OBSERVE');
    await finish(late, 'REVIEW_REQUIRED', 'PAID', 3, 1, 'LATE_PAYMENT_DETECTED');
    assert.equal(await scalar('select state value from public.banese_reconciliation_queue where receivable_id=$1', [id(1)]), 'QUARANTINED');
    assert.deepEqual(await facts(1), canceled, 'Existing late-payment observation remains available; recovery is still pending');
  });

  await scenario(async () => {
    await seedJob(1);
    await db.query("update public.payment_gateway_transactions set remote_status='PAID',updated_at=clock_timestamp() where id=$1", [id(1)]);
    await db.query([
      "update public.contas_receber set status='PAGO',gateway_status='PAID',origem_pagamento='BANESE',",
      "data_pagamento='2026-10-04',valor_pago=99.9,gateway_settlement_source='API',",
      "gateway_settlement_evidence='{\"paymentCount\":1}',updated_at=clock_timestamp() where id=$1",
    ].join('\n'), [id(1)]);
    await db.query("update public.matriculas set status='ATIVO' where id=$1", [id(1)]);
    await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1", [id(1)]);
    await db.exec("update public.banese_ead_checkout_expiration_config set enabled=false,verified_local_holidays=null where environment='production'");
    assert.equal(await scalar('select internal_contas.ead_checkout_can_expire($1) value', [id(1)]), false);
    const c = await claim();
    assert.equal(c.claimed, true);
    assert.equal(c.mode, 'VERIFY');
    assert.equal(c.localPaid, true);
    await finish(c, 'PAID', 'PAID', 3, 1);
    assert.equal((await facts(1)).enrollment.status, 'ATIVO');
    assert.equal((await facts(1)).receipt.status, 'PAGO');
  });

  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar("select has_function_privilege($1,'internal_contas.ead_expiration_release_ready()','execute') value", [role]), false);
  }
  assert.equal(await scalar("select has_function_privilege('service_role','public.claim_banese_ead_checkout_expiration(text)','execute') value"), true);
  assert.equal(await releaseReady(), false, 'Readiness is never replaced or enabled by this test');
  console.log('PASS EAD release gate: new jobs/PUT/local expiry blocked, operator flag cannot bypass readiness, prior intent/observation/canonical paid recover with flag off, ACL preserved');
} finally {
  await db.close();
}
