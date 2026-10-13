import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sql = readFileSync(new URL('../migrations/20261013123000_contract_v4_pagination.sql', import.meta.url), 'utf8');
const normalized = value => value.replace(/\\r\\n|\\n/gu, '\n').replace(/\s+/gu, ' ').trim();

test('V4 pagination preserves clauses, bounds physical lines and reserves the configured closing', async t => {
  const modulePath = process.env.PGLITE_MODULE_PATH;
  const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(sql);
  const paginate = async (body, footer = 'Assinaturas') => (await db.query(
    'select public.paginar_contrato_aluno_v4($1,$2,$3,$4) value',
    ['Cabeçalho configurado', 'Título configurado', body, footer],
  )).rows[0].value;
  const count = async body => (await db.query('select public.estimar_linhas_contrato_v4($1) value', [body])).rows[0].value;
  try {
    await t.test('empty, full original contract, long paragraphs and Unicode conserve all words', async () => {
      const full = readFileSync(new URL('../migrations/20260809210000_create_full_technical_contract_draft.sql', import.meta.url), 'utf8')
        .match(/'corpo', \$minuta\$\n([\s\S]*?)\n\$minuta\$,/u)[1]
        .replace(/\{\{[^}]+\}\}/gu, 'Informação sintética');
      for (const body of ['', full, 'responsabilidade '.repeat(2200), 'ação\r\n'.repeat(120),
        'Cláusula com número e acentuação.\n\n'.repeat(130), 'cláusula\\n'.repeat(120),
        Array(550).fill('responsabilidade').join('\u00a0'), `${'W'.repeat(35)} `.repeat(90)]) {
        const pages = await paginate(body);
        assert.equal(normalized(pages.map(p => p.body).join(' ')), normalized(body));
        assert.ok(pages.every(p => p.header === 'Cabeçalho configurado' && p.title === 'Título configurado'));
        assert.equal(pages.at(-1).footer, 'Assinaturas');
        assert.ok(pages.slice(0, -1).every(p => p.footer === null));
        for (let i = 0; i < pages.length; i += 1) {
          const budget = i === pages.length - 1 ? (i === 0 ? 24 : 27) : (i === 0 ? 39 : 41);
          assert.ok(await count(pages[i].body) <= budget, `page ${i + 1} exceeds ${budget} lines`);
        }
        assert.deepEqual(await paginate(body), pages);
      }
    });
    await t.test('normal paragraphs are never split across pages', async () => {
      const paragraphs = Array.from({ length: 70 }, (_, n) => `Cláusula ${n}: ` + 'Condição individual preservada. '.repeat(15));
      const pages = await paginate(paragraphs.join('\n\n'));
      for (const paragraph of paragraphs) assert.ok(pages.some(p => p.body.includes(paragraph.trim())));
    });
    await t.test('QR reserves the closing even when textual footer is absent', async () => {
      const pages = await paginate('Linha\n'.repeat(38), null);
      assert.equal(pages.length, 2);
      assert.equal(pages.at(-1).body, '');
      assert.equal(pages.at(-1).footer, null);
    });
    await t.test('impossible word is rejected, helper functions remain private', async () => {
      await assert.rejects(paginate('W'.repeat(1000)), /palavra maior/u);
      const rows = (await db.query(`select proname,has_function_privilege('anon',oid,'execute') anon,
        has_function_privilege('authenticated',oid,'execute') authenticated
        from pg_proc where proname in ('estimar_linhas_contrato_v4','paginar_contrato_aluno_v4')`)).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => !row.anon && !row.authenticated));
    });
  } finally { await db.close(); }
});
