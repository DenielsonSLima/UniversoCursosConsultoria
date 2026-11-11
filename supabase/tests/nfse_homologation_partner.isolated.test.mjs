import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const sql = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const issuer = '00000000000100';
// Algorithmic, synthetic check-digit fixtures: no person's registration is copied.
const cpf = (base) => {
  let value = base;
  for (const length of [10, 11]) {
    const sum = [...value].reduce((total, digit, i) => total + Number(digit) * (length - i), 0);
    value += String((sum * 10 % 11) % 10);
  }
  return value;
};
const cnpj = (base) => {
  let value = base;
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const remainder = [...value].reduce((total, digit, i) => total + Number(digit) * weights[i], 0) % 11;
    value += String(remainder < 2 ? 0 : 11 - remainder);
  }
  return value;
};
const legacy = () => ({ fiscalInput: { environment: 'HOMOLOGACAO', issuerMunicipalityCode: '2803401',
  issuer: { taxId: { type: 'CNPJ', value: issuer }, simpleNationalOption: '3', simpleNationalAssessment: '1', specialTaxRegime: '0' },
  recipient: { taxId: { type: 'CNPJ', value: issuer }, name: 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL' },
  values: { serviceAmount: '1.00' }, review: { ibscbs: 'SYNTHETIC_PILOT_OMISSION' } },
preview: { synthetic: true, serviceDescription: 'TESTE TÉCNICO SINTÉTICO SEM RECEBIMENTOS' } });
const partnerInput = (recipient) => {
  const result = legacy(); delete result.preview.synthetic;
  result.fiscalInput.recipient = { taxId: { type: recipient.document.length === 11 ? 'CPF' : 'CNPJ', value: recipient.document }, name: recipient.name };
  Object.assign(result.preview, { technicalTest: true, recipientSource: 'PARTNER', recipientPartnerId: recipient.partnerId,
    recipientName: recipient.name, recipientDocument: recipient.document });
  return result;
};
const rejected = (promise, code = '22023') => assert.rejects(promise, (error) => error.code === code);

test('canonical pilot recipient is resolved at the operation and the same request recovers without a second lease', async (t) => {
  const db = new PGlite();
  const command = async (action, changes = {}) => (await db.query(
    'SELECT public.nfse_homologation_pilot_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    Object.values({ actor: id(11), context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11',
      request: id(80), action, preview: null, input: null, ...changes }))).rows[0].value;
  const recipient = async (partner = id(30), changes = {}) => (await db.query(
    'SELECT public.get_nfse_homologation_recipient_internal($1,$2,$3,$4,$5,$6) value',
    Object.values({ actor: id(11), context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11', partner, ...changes }))).rows[0].value;
  const receiptBefore = { id: id(99), valor: '99.99', status: 'PAGO' };
  try {
    await db.exec(await readFile(new URL('./nfse_homologation_partner.fixture.sql', import.meta.url), 'utf8'));
    await db.query('INSERT INTO public.test_authorization VALUES($1,$2,$3,true)', [id(11), id(10), id(1)]);
    await db.query('INSERT INTO public.polos VALUES($1,$2),($3,$4)', [id(1), issuer, id(2), '00000000000200']);
    await db.query(`INSERT INTO public.parceiros VALUES($1,$2,$3,'PF','ativo',$4,'{}'),
      ($5,$6,$7,'PJ','ativo',NULL,'{}'),($8,'ALUNO SINTÉTICO',$9,'Aluno','ativo',NULL,'{}'),
      ($10,'CADASTRO OUTRO POLO',$3,'PF','ativo',$11,'{}'),($12,'INATIVO SINTÉTICO',$3,'PF','inativo',$4,'{}'),
      ($13,'DOCUMENTO INVÁLIDO','00000000000','PF','ativo',$4,'{}')`,
    [id(30), 'CADASTRO PF SINTÉTICO', cpf('000000001'), id(1), id(31), 'CADASTRO PJ SINTÉTICO', cnpj('000000000002'),
      id(32), cpf('000000002'), id(33), id(2), id(34), id(35)]);
    await db.query('INSERT INTO public.contas_receber VALUES($1,$2,$3)', Object.values(receiptBefore));
    await db.query(`INSERT INTO private.nfse_configurations VALUES($1,'HOMOLOGACAO',$1,$2,3);
      `, [id(1), { municipalityCode: '2803401', opSimpNac: '3', regApTribSN: '1', regEspTrib: '0' }]);
    await db.query(`INSERT INTO private.nfse_certificates VALUES($1,'HOMOLOGACAO',$2,now()-interval '1 day',now()+interval '1 year',repeat('a',64))`, [id(1), issuer]);
    const review = await sql('20261110190702_nfse_fiscal_review_store.sql');
    await db.exec(review.slice(review.indexOf('CREATE FUNCTION private.nfse_review_valid_document('), review.indexOf('CREATE FUNCTION private.nfse_fiscal_review_basis(')));
    await db.exec(await sql('20261110183131_nfse_homologation_pilot_ledger.sql'));
    await db.exec(`SET request.jwt.claims='{"role":"service_role"}'; SET request.jwt.claim.sub='${id(90)}'`);
    const historical = await command('PREVIEW', { request: id(70), input: legacy() });
    await db.exec(await sql('20261110235303_nfse_homologation_recipient.sql'));
    await db.exec(await sql('20261110235311_nfse_homologation_partner_preview.sql'));
    let row; let payload;
    await t.test('internal getter authorizes service role, actor, matrix and scoped active registration', async () => {
      assert.deepEqual(await recipient(), { partnerId: id(30), name: 'CADASTRO PF SINTÉTICO', document: cpf('000000001') });
      assert.equal((await recipient(id(31))).document, cnpj('000000000002'));
      for (const partner of [32, 33, 34, 35, 999]) await rejected(recipient(id(partner)));
      for (const changes of [{ actor: id(999) }, { context: id(999) }, { polo: id(2) }]) await rejected(recipient(id(30), changes), '42501');
      await rejected(recipient(id(30), { environment: 'PRODUCAO' }));
      await db.exec("SET request.jwt.claims='{\"role\":\"authenticated\"}'"); await rejected(recipient(), '42501');
      await db.exec("SET request.jwt.claims='{\"role\":\"service_role\"}'");
      assert.equal((await db.query('SELECT auth.uid() actor')).rows[0].actor, id(90));
    });
    await t.test('lookup does not reserve identities and legacy preview replay stays byte-shape compatible', async () => {
      assert.equal(await command('READ_BY_REQUEST'), null);
      assert.deepEqual(await command('READ_BY_REQUEST', { request: id(70) }), historical);
      await rejected(command('READ_BY_REQUEST', { request: id(70), input: { recipientPartnerId: id(30) } }));
      assert.deepEqual(await command('PREVIEW', { request: id(70), input: legacy() }), historical);
      assert.equal((await db.query('SELECT count(*)::int count FROM private.nfse_homologation_pilots')).rows[0].count, 1);
      const compatible = await command('PREVIEW', { request: id(71), input: legacy() });
      assert.equal(compatible.preview.synthetic, true); assert.equal(compatible.dispatch, false);
    });
    await t.test('new partner preview binds name, document and minimal NationalParty to the canonical registration', async () => {
      payload = partnerInput(await recipient()); row = await command('PREVIEW', { input: payload });
      assert.equal(row.preview.technicalTest, true); assert.equal('synthetic' in row.preview, false);
      assert.equal(row.fiscalInput.recipient.taxId.type, 'CPF'); assert.equal(row.dispatch, false);
      for (const field of ['name', 'address', 'municipalRegistration']) {
        const changed = globalThis.structuredClone(payload); changed.fiscalInput.recipient[field] = 'SYNTHETIC-DIVERGENCE';
        await rejected(command('PREVIEW', { request: id(81), input: changed }));
      }
      const ambiguous = globalThis.structuredClone(payload); ambiguous.preview.synthetic = false;
      await rejected(command('PREVIEW', { request: id(81), input: ambiguous }));
      const changed = globalThis.structuredClone(payload); changed.preview.recipientDocument = cpf('000000002');
      await rejected(command('PREVIEW', { request: id(81), input: changed }));
    });
    await t.test('lost preview responses recover immutable data before reading mutated partner/config/certificate', async () => {
      await db.query('UPDATE public.parceiros SET nome=$1,status=$2 WHERE id=$3', ['CADASTRO ALTERADO', 'inativo', id(30)]);
      await db.exec("UPDATE private.nfse_configurations SET version=4; UPDATE private.nfse_certificates SET expires_at=now()-interval '1 second'");
      assert.deepEqual(await command('READ_BY_REQUEST', { input: { recipientPartnerId: id(30) } }), row);
      assert.deepEqual(await command('PREVIEW', { input: payload }), row);
      await rejected(command('READ_BY_REQUEST', { input: { recipientPartnerId: id(31) } }));
      await rejected(command('READ_BY_REQUEST')); await rejected(command('READ_BY_REQUEST', { month: '2026-12', input: { recipientPartnerId: id(30) } }));
      await rejected(command('PREVIEW', { request: id(81), input: payload }));
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()+interval '1 year'");
      await rejected(command('CLAIM', { preview: row.previewId }), '40001');
      await db.exec('UPDATE private.nfse_configurations SET version=3');
      await rejected(command('PREVIEW', { request: id(81), input: payload }));
    });
    await t.test('the reviewed snapshot leases a single dispatch and all uncertain repeats keep the same DPS for GET recovery', async () => {
      const first = await command('CLAIM', { preview: row.previewId }); const again = await command('CLAIM', { preview: row.previewId });
      assert.equal(first.dispatch, true); assert.equal(again.dispatch, false);
      const dpsId = `DPS28034012${issuer}${row.fiscalInput.series}${row.fiscalInput.number.padStart(15, '0')}`;
      await command('FINISH', { preview: row.previewId, input: { state: 'AWAITING_CONFIRMATION', dpsId, message: 'Resultado sintético incerto' } });
      const read = await command('READ_BY_REQUEST', { input: { recipientPartnerId: id(30) } });
      assert.equal(read.state, 'AWAITING_CONFIRMATION'); assert.equal(read.dispatch, false);
      assert.deepEqual(read.fiscalInput, row.fiscalInput); assert.equal((await command('CLAIM', { preview: row.previewId })).dispatch, false);
      await rejected(command('FINISH', { preview: row.previewId, input: { state: 'AUTHORIZED', dpsId, message: 'Sem prova sintética' } }));
      const terminal = await command('FINISH', { preview: row.previewId, input: { state: 'REJECTED', dpsId, message: 'Rejeição sintética', codes: ['E0037'] } });
      assert.equal(terminal.state, 'REJECTED'); assert.equal((await command('CLAIM', { preview: row.previewId })).dispatch, false);
    });
    await t.test('revocation prevents cached reads; nothing changes canonical receipts or grants browser access', async () => {
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await rejected(command('READ_BY_REQUEST', { input: { recipientPartnerId: id(30) } }), '42501');
      await rejected(command('READ_BY_REQUEST', { environment: 'PRODUCAO', input: { recipientPartnerId: id(30) } }));
      assert.deepEqual((await db.query('SELECT * FROM public.contas_receber')).rows, [receiptBefore]);
      const acl = (await db.query(`SELECT
        has_function_privilege('authenticated','public.get_nfse_homologation_recipient_internal(uuid,uuid,uuid,text,text,uuid)','EXECUTE') browser,
        has_function_privilege('service_role','public.get_nfse_homologation_recipient_internal(uuid,uuid,uuid,text,text,uuid)','EXECUTE') executor`)).rows[0];
      assert.deepEqual(acl, { browser: false, executor: true });
    });
  } finally { await db.close(); }
});
