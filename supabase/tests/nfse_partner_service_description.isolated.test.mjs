import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fixture = await readFile(new URL('./nfse_partner_services.fixture.sql', import.meta.url), 'utf8');
const migrations = await Promise.all(['20261108225453_nfse_models_private_store.sql',
  '20261108234843_nfse_partner_services_store.sql', '20261108234906_nfse_partner_services_save.sql',
  '20261110212834_nfse_partner_service_description_2000.sql'].map(readMigration));
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = [id(10), id(1), 'HOMOLOGACAO', '2026-11'];
const definition = { partnerId: id(20), modelId: id(30), modelVersion: 1, serviceDate: '2026-11-10',
  serviceDescription: 'SERVIÇO SINTÉTICO', amount: '1.00', generateReceivable: false,
  existingReceivableId: null, dueDate: null, categoryId: null };

test('partner service description accepts 2000 characters while preserving preparation guards', async (t) => {
  const db = new PGlite();
  const save = async (request, changes = {}) => (await db.query(
    'SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
    [...scope, id(request), { ...definition, ...changes }])).rows[0].value;
  const counts = async () => (await db.query(`SELECT jsonb_build_object(
    'services',(SELECT count(*) FROM private.nfse_partner_services),
    'requests',(SELECT count(*) FROM private.nfse_partner_service_requests),
    'receivables',(SELECT count(*) FROM public.contas_receber)) value`)).rows[0].value;
  let historical; let expanded;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.polos VALUES('${id(1)}','ativo');
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.parceiros(id,nome,tipo,status,polo_id,polo_ids)
        VALUES('${id(20)}','PARCEIRO SINTÉTICO','PJ','ativo','${id(1)}',ARRAY[]::uuid[]);
      SET test.actor='${id(11)}';`);
    await db.exec(migrations[0]);
    await db.exec(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      VALUES('${id(30)}','${id(1)}','HOMOLOGACAO','{"name":"MODELO SINTÉTICO","active":true}',
      '${id(11)}','${id(11)}');`);
    await db.exec(migrations[1]); await db.exec(migrations[2]);
    historical = await save(50);
    await assert.rejects(save(51, { serviceDescription: 'x'.repeat(1001) }), (error) => error.code === '22023');
    await db.exec(migrations[3]);

    await t.test('the deployed save RPC persists exactly 2000 literal characters without a financial write', async () => {
      expanded = await save(51, { serviceDescription: 'x'.repeat(2000) });
      assert.equal(expanded.data.receivableAction, 'NONE'); assert.equal(expanded.data.receivableId, null);
      const stored = (await db.query('SELECT service_description FROM private.nfse_partner_services WHERE id=$1',
        [expanded.data.id])).rows[0].service_description;
      assert.equal(stored, 'x'.repeat(2000));
      assert.deepEqual(await counts(), { services: 2, requests: 2, receivables: 0 });
    });
    await t.test('2001 characters, empty content and unresolved tokens never write', async () => {
      const before = await counts();
      for (const serviceDescription of ['x'.repeat(2001), '   ', '{{mes_referencia}}', 'texto}}']) {
        await assert.rejects(save(52, { serviceDescription }), (error) => error.code === '22023');
      }
      assert.deepEqual(await counts(), before);
    });
    await t.test('the table CHECK also prevents descriptions above 2000 independently of the RPC', async () => {
      await assert.rejects(db.query('UPDATE private.nfse_partner_services SET service_description=$1 WHERE id=$2',
        ['x'.repeat(2001), expanded.data.id]), (error) => error.code === '23514'
          && error.constraint === 'nfse_partner_services_service_description_check');
      assert.equal((await db.query('SELECT length(service_description) length FROM private.nfse_partner_services WHERE id=$1',
        [expanded.data.id])).rows[0].length, 2000);
    });
    await t.test('old and new replays stay immutable and divergent requests are rejected', async () => {
      const before = await counts();
      assert.deepEqual(await save(50), historical);
      assert.deepEqual(await save(51, { serviceDescription: 'x'.repeat(2000) }), expanded);
      await assert.rejects(save(51, { serviceDescription: 'y'.repeat(2000) }), (error) => error.code === '22023');
      assert.deepEqual(await counts(), before);
    });
    await t.test('current authorization still precedes replay and validation', async () => {
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(save(50), (error) => error.code === '42501');
      await assert.rejects(save(52, { serviceDescription: 'x'.repeat(2001) }), (error) => error.code === '42501');
      assert.deepEqual(await counts(), { services: 2, requests: 2, receivables: 0 });
    });
  } finally { await db.close(); }
});
