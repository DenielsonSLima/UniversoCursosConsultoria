import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read = name => readFile(new URL(name, import.meta.url), 'utf8');

test('avulso sem tipo torna-se elegível e mantém guardas acadêmicas, pagamento e banco no PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(await read('./other_credit_untyped_cancellation.fixture.sql'));
    const before = await db.query(`SELECT internal_other_credit_cancellation.eligible(
      jsonb_populate_record(NULL::public.contas_receber, '{"categoria":"OUTROS_CREDITOS",
        "status":"PENDENTE","origem_pagamento":"LOCAL",
        "polo_id":"11111111-1111-4111-8111-111111111111"}'::jsonb)) AS eligible`);
    assert.equal(before.rows[0].eligible, false, 'reproduz a exclusão anterior do avulso sem tipo');
    await db.exec(await read('../migrations/20261105193000_other_credit_untyped_cancellation.sql'));
    await db.exec(await read('./other_credit_untyped_cancellation.contract.sql'));
    const result = await db.query('SELECT count(*)::int AS count FROM public.contas_receber');
    assert.equal(result.rows[0].count, 0, 'contrato não deve criar ou alterar lançamentos reais');
  } finally {
    await db.close();
  }
});
