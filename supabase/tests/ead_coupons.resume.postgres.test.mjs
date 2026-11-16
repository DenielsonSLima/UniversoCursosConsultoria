import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createCouponHarness } from './fixtures/ead-coupons.harness.mjs';

// Dedicated disposable PostgreSQL only. Never accept a hosted/production URL.
const url = process.env.EAD_COUPON_TEST_DATABASE_URL;
test('coupon resumption: independent PostgreSQL sessions', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/ead_coupon_concurrency');
  const driver = await import(process.env.EAD_COUPON_PG_MODULE
    ? pathToFileURL(resolve(process.env.EAD_COUPON_PG_MODULE)).href : 'pg');
  const { Client } = driver.default || driver;
  const clients = await Promise.all(Array.from({ length: 4 }, async () => {
    const c = new Client({ connectionString: url }); await c.connect();
    await c.query("set statement_timeout='15s'"); return c;
  }));
  const [admin, first, second, gate] = clients;
  const db = { query: (...args) => admin.query(...args), exec: sql => admin.query(sql), close: async () => {} };
  let h;
  const waitForLock = async client => {
    for (let i = 0; i < 100; i++) {
      const state = (await admin.query('select wait_event_type from pg_stat_activity where pid=$1', [client.processID])).rows[0];
      if (state?.wait_event_type === 'Lock') return;
      await new Promise(r => setTimeout(r, 20));
    }
    assert.fail('The competing session did not demonstrably wait on a PostgreSQL lock');
  };
  try {
    h = await createCouponHarness(db);
    const { ids, id } = h;
    const saved = await h.rpc('ead_coupons_save', { p_polo_id: ids.polo, p_request_id: randomUUID(),
      p_coupon: { code: 'CONCORRENTE', discountPercent: 100, totalLimit: null, perStudentLimit: 2,
        startsAt: '2020-01-01', endsAt: '2099-01-01', active: true, allCourses: true, courseIds: [] } });
    assert.equal(saved.error, null);
    const seed = async n => {
      await h.asService();
      const a = (await admin.query(`select public.ead_prepare_checkout_attempt($1,$2,$3,'banese_card','sandbox','BOLETO',200,'2090-01-07','SYNTHETIC',null,null,false) value`, [id(n), ids.turma, randomUUID()])).rows[0].value;
      const tx = randomUUID(), remote = `SYNTHETIC-NONPAYABLE-${tx}`;
      await admin.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,provider_code,environment,remote_payment_id,remote_status,amount) values($1,$2,$3,'banese_card','sandbox',$4,'CANCELED',200)`, [tx,a.receivableId,a.inscricaoId,remote]);
      await admin.query("update public.ead_checkout_attempts set transaction_id=$2,state='EXPIRED',canceled_at=now() where id=$1",[a.attemptId,tx]);
      await admin.query("update public.contas_receber set status='CANCELADO',gateway_status='CANCELED',gateway_creation_token=null,gateway_payment_id=$2 where id=$1",[a.receivableId,remote]);
      await admin.query("update public.inscricoes_online set status='CANCELADO',gateway_payment_id=$2 where id=$1",[a.inscricaoId,remote]);
      await admin.query(`insert into public.banese_ead_checkout_expiration_jobs(receivable_id,matricula_id,inscription_id,transaction_id,attempt_id,environment,state,snapshot,expected_receivable_updated_at,expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,canceled_at,remote_status) values($1,$2,$3,$4,$5,'sandbox','DONE','{}',now(),now(),now(),current_date,now(),'CANCELED')`,[a.receivableId,a.matriculaId,a.inscricaoId,tx,a.attemptId]);
      await h.asStudent(id(n)); return a;
    };
    const redeem = (client, request = randomUUID()) => client.query("select public.ead_coupon_redeem_free('CONCORRENTE',$1,$2) value",[ids.turma,request]);
    const counts = async a => (await admin.query(`select (select count(*)::int from public.ead_coupon_redemptions where matricula_id=$1) redemptions,(select count(*)::int from public.contas_receber where matricula_id=$1) receipts,(select status from public.matriculas where id=$1) status`,[a.matriculaId])).rows[0];
    await t.test('same request in two sessions produces one audited redemption', async () => {
      const a = await seed(1), request = randomUUID();
      const results = await Promise.all([redeem(first,request),redeem(second,request)]);
      assert.equal(results[0].rows[0].value.matriculaId,a.matriculaId);
      assert.deepEqual(results[0].rows[0].value,results[1].rows[0].value);
      assert.deepEqual(await counts(a),{redemptions:1,receipts:1,status:'ATIVO'});
    });
    await t.test('different requests racing for same enrollment cannot double redeem', async () => {
      const a = await seed(2);
      const results = await Promise.allSettled([redeem(first),redeem(second)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409');
      assert.deepEqual(await counts(a),{redemptions:1,receipts:1,status:'ATIVO'});
    });
    await t.test('payment owns receipt lock first: redemption waits then refuses stale eligibility', async () => {
      const a = await seed(3);
      assert.equal((await h.rpc('ead_coupon_quote',{p_code:'CONCORRENTE',p_course_id:ids.course})).error,null);
      await second.query('begin');
      await second.query('select id from public.contas_receber where id=$1 for update',[a.receivableId]);
      await second.query("update public.contas_receber set status='PAGO',valor_pago=200,data_pagamento=current_date where id=$1",[a.receivableId]);
      const pending = redeem(first).then(value=>({value}),error=>({error}));
      await waitForLock(first); await second.query('commit');
      assert.equal((await pending).error?.code,'PT409');
      assert.deepEqual(await counts(a),{redemptions:0,receipts:1,status:'PENDENTE'});
    });
    await t.test('redemption owns locks first: late payment waits and then opens review', async () => {
      const a = await seed(4);
      await admin.query(`create function public.test_coupon_gate() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(729941);return new;end;$$; create trigger test_coupon_gate before update of status on public.matriculas for each row when(new.status='ATIVO') execute function public.test_coupon_gate()`);
      await gate.query('begin'); await gate.query('select pg_advisory_xact_lock(729941)');
      const free = redeem(first).then(value=>({value}),error=>({error}));
      await waitForLock(first);
      const paid = second.query("update public.contas_receber set status='PAGO',valor_pago=200,data_pagamento=current_date where id=$1",[a.receivableId]).then(value=>({value}),error=>({error}));
      await waitForLock(second); await gate.query('commit');
      assert.ok((await free).value); assert.ok((await paid).value);
      assert.deepEqual(await counts(a),{redemptions:1,receipts:1,status:'ATIVO'});
      const review = (await admin.query("select state,evidence->>'code' code from public.ead_payment_reviews where attempt_id=$1",[a.attemptId])).rows;
      assert.deepEqual(review,[{state:'OPEN',code:'PAYMENT_AFTER_COUPON_FREE_RESUMPTION'}]);
      await admin.query('drop trigger test_coupon_gate on public.matriculas;drop function public.test_coupon_gate()');
    });
  } finally {
    await Promise.all(clients.map(async c => { try { await c.query('rollback'); } finally { await c.end(); } }));
  }
});
