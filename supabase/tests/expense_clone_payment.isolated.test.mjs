import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const date = (value) => value instanceof Date ? value.toISOString().slice(0,10) : value;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migrations = [
  '20261109021100_expense_explicit_payment_date.sql',
  '20261109021200_expense_rateio_explicit_payment_date.sql',
  '20261109021300_expense_rateio_replay_payment_date.sql',
  '20261109021400_expense_convenio_payment_date.sql',
];

test('clonagem usa criação nova com datas independentes, autorização e replay imutável', async t => {
  const db = new PGlite();
  const base = {
    p_request_id: id(101), p_polo_id: id(1), p_tipo: 'DESPESA_VARIAVEL',
    p_descricao: 'SERVIÇO (7/12)', p_valor_base: 1234.56,
    p_data_lancamento: '2026-11-01', p_data_vencimento: '2026-11-05', p_data_pagamento: '2026-11-08',
    p_juros_valor: 2.34, p_multa_valor: 1.01, p_desconto_valor: 3.21,
    p_baixa_imediata: true, p_conta_bancaria_id: id(51), p_forma_pagamento: 'DINHEIRO',
  };
  const call = (params = base, name = 'criar_despesa_secure') => {
    const keys = Object.keys(params);
    return db.query(`select * from public.${name}(${keys.map((k,i) => `${k} => $${i+1}`).join(',')})`, Object.values(params));
  };
  try {
    await db.exec(await read('./expense_clone_payment.fixture.sql'));
    await db.exec(await read('./expense_clone_legacy.baseline.sql'));
    for (const file of migrations) await db.exec(await read(`../migrations/${file}`));
    await db.exec(`set test.actor='${id(99)}'; set test.role='authenticated'; set test.allowed='yes';`);

    await t.test('origem paga preservada; clone não traz fornecedor nem histórico e conserva centavos', async () => {
      const { p_data_pagamento, ...old } = base;
      const original = (await call({ ...old, p_request_id:id(100), p_descricao:'ORIGEM', p_fornecedor_id:id(11) })).rows[0];
      assert.equal(date(original.data_pagamento), '2026-11-01', 'chamadas antigas mantêm a data original');
      const clone = (await call()).rows[0];
      assert.notEqual(clone.id, original.id);
      assert.equal(clone.fornecedor_id, null);
      assert.equal(date(clone.data_lancamento), '2026-11-01');
      assert.equal(date(clone.data_vencimento), '2026-11-05');
      assert.equal(date(clone.data_pagamento), '2026-11-08');
      assert.equal(Number(clone.valor), 1234.70);
      assert.equal(clone.status, 'PAGO');
      assert.equal((await db.query('select count(*) from financial_payment_events')).rows[0].count, 0);
      assert.deepEqual((await db.query('select * from despesas_lancamentos where id=$1',[original.id])).rows[0], original);
    });
    await t.test('duplo clique reaproveita o clone, inclusive com descrição de parcela', async () => {
      const before = (await db.query('select count(*) from despesas_lancamentos')).rows[0].count;
      await call();
      assert.equal((await db.query('select count(*) from despesas_lancamentos')).rows[0].count, before);
      await assert.rejects(call({ ...base, p_data_pagamento:'2026-11-09' }), /idempotência/);
      await assert.rejects(call({ ...base, p_fornecedor_id:id(11) }), /idempotência/);
    });
    await t.test('pendente fica sem pagamento e falha atômica não cria linha', async () => {
      const row = (await call({ ...base, p_request_id:id(102), p_baixa_imediata:false, p_data_pagamento:null })).rows[0];
      assert.equal(row.status,'PENDENTE'); assert.equal(date(row.data_pagamento),null);
      assert.equal(row.forma_pagamento,null); assert.equal(row.conta_bancaria_id,null);
      await assert.rejects(call({ ...base, p_request_id:id(103), p_desconto_valor:99999 }), /desconto/i);
      assert.equal((await db.query('select count(*) from despesas_lancamentos where request_id=$1',[id(103)])).rows[0].count,0);
    });
    await t.test('rateio preserva a mesma data no pai e nos polos; replay não recalcula', async () => {
      const { p_valor_base, ...p } = base;
      const params = { ...p, p_valor:p_valor_base, p_request_id:id(104), p_rateio_modo:'SELECIONADOS', p_rateio_polo_ids:[id(2)] };
      const row = (await call(params,'criar_despesa_rateada_matriz_secure')).rows[0];
      assert.equal(date(row.data_pagamento),'2026-11-08');
      const child = (await db.query('select * from despesas_lancamentos_rateios where despesa_lancamento_id=$1',[row.id])).rows[0];
      assert.equal(date(child.data_pagamento),date(row.data_pagamento));
      await call(params,'criar_despesa_rateada_matriz_secure');
      await assert.rejects(call({ ...params,p_data_pagamento:'2026-11-09' },'criar_despesa_rateada_matriz_secure'),/idempotência/);
    });
    await t.test('convênio mantém vínculo único e considera a data no hash do replay', async () => {
      const params = { ...base,p_request_id:id(105),p_convenio_mes_id:id(61) };
      const result = (await call(params,'criar_despesa_convenio_secure')).rows[0].criar_despesa_convenio_secure;
      assert.equal(date((await db.query('select data_pagamento from despesas_lancamentos where id=$1',[result.despesa_id])).rows[0].data_pagamento),'2026-11-08');
      await call(params,'criar_despesa_convenio_secure');
      assert.equal((await db.query('select count(*) from convenios_financeiros_despesas')).rows[0].count,1);
      await assert.rejects(call({ ...params,p_data_pagamento:'2026-11-09' },'criar_despesa_convenio_secure'),/idempotência/);
    });
    await t.test('nega falta de identidade e polo incorreto antes de retornar replay', async () => {
      await db.exec("set test.actor='';");
      await assert.rejects(call(),/Autenticação/);
      await db.exec(`set test.actor='${id(99)}';`);
      await assert.rejects(call({ ...base,p_polo_id:id(2) }),/Acesso não autorizado/);
      const grants = (await db.query(`select
        has_function_privilege('anon',oid,'execute') anon,
        has_function_privilege('authenticated',oid,'execute') authenticated,
        proname from pg_proc where pronamespace='public'::regnamespace
          and proargnames @> ARRAY['p_data_pagamento']::text[]`)).rows;
      assert.equal(grants.length,4);
      assert.ok(grants.every(g => !g.anon));
      assert.equal(grants.find(g => g.proname.endsWith('_raw')).authenticated,false);
    });
  } finally { await db.close(); }
});
