import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const read = (file) => readFile(new URL(file, import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('descrições normalizam sem alterar dados financeiros nem quebrar retry legado', async t => {
  const db = new PGlite();
  const base = { p_request_id:id(100),p_polo_id:id(1),p_tipo:'DESPESA_VARIAVEL',
    p_descricao:'Doces cantina',p_valor_base:698,p_data_lancamento:'2026-11-06',p_data_vencimento:'2026-11-06' };
  const call = (name,p) => db.query(`select * from public.${name}(${Object.keys(p).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(p));
  const signatures = () => db.query(`select oid::regprocedure::text signature,proacl::text acl,proconfig
    from pg_proc where pronamespace='public'::regnamespace and proname in
    ('criar_despesa_secure','criar_despesa_com_desdobramento_secure','criar_despesa_rateada_matriz_secure','criar_despesa_rateada_matriz_secure_raw') order by 1`);
  try {
    await db.exec(await read('./expense_clone_payment.fixture.sql'));
    await db.exec('alter table public.despesas_lancamentos add column updated_at timestamptz default now();');
    for (const f of ['expense_clone_legacy.baseline.sql','expense_description_legacy_raw.baseline.sql',
      'expense_description_legacy_wrapper.baseline.sql','expense_description_legacy_split.baseline.sql']) await db.exec(await read(`./${f}`));
    for (const f of ['20261109021100_expense_explicit_payment_date.sql','20261109021200_expense_rateio_explicit_payment_date.sql',
      '20261109021300_expense_rateio_replay_payment_date.sql','20261109021400_expense_convenio_payment_date.sql']) await db.exec(await read(`../migrations/${f}`));
    await db.exec(`set test.actor='${id(99)}'; set test.role='authenticated'; set test.allowed='yes';`);
    const original = (await call('criar_despesa_secure',{...base,p_baixa_imediata:true,p_conta_bancaria_id:id(51),p_forma_pagamento:'PIX'})).rows[0];
    const rateio = {...base,p_request_id:id(101),p_valor:base.p_valor_base,p_rateio_modo:'SELECIONADOS',p_rateio_polo_ids:[id(2)]};
    delete rateio.p_valor_base;
    await call('criar_despesa_rateada_matriz_secure',rateio);
    const split={...base,p_request_id:id(102),p_valor_total:200.03,p_total_parcelas:2};delete split.p_valor_base;
    await call('criar_despesa_com_desdobramento_secure',split);
    const before=(await db.query("select id,to_jsonb(d)-'descricao'-'updated_at' preserved from despesas_lancamentos d order by id")).rows;
    const acl=(await signatures()).rows;
    await db.exec(await read('../migrations/20261109031500_expense_descriptions_uppercase.sql'));

    await t.test('backfill altera somente texto/metadados e mantém baixa, parcelas e rateio',async()=>{
      const after=(await db.query("select id,to_jsonb(d)-'descricao'-'updated_at' preserved from despesas_lancamentos d order by id")).rows;
      assert.deepEqual(after,before);
      assert.equal((await db.query('select descricao from despesas_lancamentos where id=$1',[original.id])).rows[0].descricao,'DOCES CANTINA');
      assert.equal((await db.query("select count(*) from despesas_lancamentos where descricao<>upper(btrim(descricao))")).rows[0].count,0);
    });
    await t.test('replay anterior à migration aceita a mesma intenção sem duplicar linhas',async()=>{
      await call('criar_despesa_secure',{...base,p_baixa_imediata:true,p_conta_bancaria_id:id(51),p_forma_pagamento:'PIX'});
      await call('criar_despesa_rateada_matriz_secure',rateio);
      await call('criar_despesa_com_desdobramento_secure',split);
      assert.equal((await db.query('select count(*) from despesas_lancamentos')).rows[0].count,4);
      await assert.rejects(call('criar_despesa_secure',{...base,p_valor_base:699,p_baixa_imediata:true,p_conta_bancaria_id:id(51),p_forma_pagamento:'PIX'}),/idempotência/);
    });
    await t.test('todas as sobrecargas novas e antigas recebem escrita normalizada com acentos',async()=>{
      await call('criar_despesa_secure',{...base,p_request_id:id(103),p_data_pagamento:null,p_descricao:' água / gás '});
      await call('criar_despesa_secure',{...base,p_request_id:id(103),p_data_pagamento:null,p_descricao:' água / gás '});
      await call('criar_despesa_rateada_matriz_secure',{...rateio,p_request_id:id(104),p_data_pagamento:null,p_descricao:'manutenção'});
      await call('criar_despesa_rateada_matriz_secure',{...rateio,p_request_id:id(104),p_data_pagamento:null,p_descricao:'manutenção'});
      const row=(await db.query('select descricao from despesas_lancamentos where request_id=$1',[id(103)])).rows[0];
      assert.equal(row.descricao,'ÁGUA / GÁS');
      await db.query("update despesas_lancamentos set descricao='pró-labore' where request_id=$1",[id(103)]);
      assert.equal((await db.query('select descricao from despesas_lancamentos where request_id=$1',[id(103)])).rows[0].descricao,'PRÓ-LABORE');
    });
    await t.test('assinaturas e grants permanecem; search_path é vazio; falta de identidade nega replay',async()=>{
      const after=(await signatures()).rows;
      assert.deepEqual(after.map(({proconfig,...r})=>r),acl.map(({proconfig,...r})=>r));
      assert.ok(after.every(r=>r.proconfig.includes('search_path=""')));
      await db.exec("set test.actor='';");
      await assert.rejects(call('criar_despesa_secure',base),/Autenticação/);
    });
  } finally { await db.close(); }
});
