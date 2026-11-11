import assert from 'node:assert/strict';
import test from 'node:test';
import { installNfseSharedVisibility } from './nfse_fiscal_review_shared.fixture.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fixture = await readFile(new URL('./nfse_academic_queue.fixture.sql', import.meta.url), 'utf8');
const migrations = await Promise.all([
  '20261108225453_nfse_models_private_store.sql', '20261108225236_nfse_receipt_amount_projection.sql',
  '20261108233250_nfse_model_reference_month.sql', '20261109020017_nfse_academic_queue_store.sql',
  '20261109020019_nfse_academic_queue_prepare.sql', '20261109020021_nfse_academic_queue_reads.sql',
  '20261110132800_nfse_queue_logical_removal.sql', '20261110132801_nfse_queue_realtime.sql',
  '20261110190702_nfse_fiscal_review_store.sql', '20261110190706_nfse_fiscal_review_rpc.sql',
  '20261111013732_nfse_academic_description_render.sql', '20261111123000_nfse_fiscal_review_payment_dates.sql',
].map(readMigration));
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-12' };
const cpf = (prefix) => {
  let value = prefix;
  for (const length of [10, 11]) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (length - index), 0);
    value += String((sum * 10 % 11) % 10);
  }
  return value;
};
const cnpj = (prefix) => {
  let value = prefix;
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const remainder = [...value].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
    value += String(remainder < 2 ? 0 : 11 - remainder);
  }
  return value;
};
const studentDocument = cpf('000000001');
const issuerDocument = cnpj('999999990001');
const definition = { modelId: id(61), modelVersion: 1, recipient: { mode: 'STUDENT', confirmed: true },
  competenceDate: '2026-11-09', serviceDate: '2026-11-09', classificationConfirmed: true, receiptsConfirmed: true };

test('real fiscal review is append-only, scopes current facts and never changes financial preparations', async (t) => {
  const db = new PGlite(); let documentId;
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
  const get = (changes = {}, modelId = id(61)) => value(
    'SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,$6) value',
    [...Object.values({ ...scope, ...changes }), documentId, modelId]);
  const save = (input = {}, changes = {}) => value(
    'SELECT public.save_nfse_fiscal_review_secure($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [...Object.values({ ...scope, ...changes }), documentId, input.request ?? id(100),
      input.revision ?? 0, input.token, input.definition ?? definition]);
  const finance = () => value(`SELECT jsonb_build_object(
    'titles',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.contas_receber c),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.financial_payment_events e),
    'components',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.financial_payment_components c),
    'documents',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM private.nfse_queue_documents q),
    'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id) FROM private.nfse_receipt_reservations r)) value`);
  try {
    await db.exec(fixture);
    await installNfseSharedVisibility(db);
    await db.exec(`
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.empresas VALUES('${id(2)}','MATRIZ SINTETICA','${issuerDocument}');
      INSERT INTO public.polos(id,status,company_id,nome,cnpj,cidade,estado) VALUES
        ('${id(1)}','ativo','${id(2)}','MATRIZ SINTETICA','${issuerDocument}','CIDADE SINTETICA','SE'),
        ('${id(3)}','ativo','${id(2)}','OUTRO POLO SINTETICO','${cnpj('999999990002')}','OUTRA CIDADE','SE');
      INSERT INTO public.cursos VALUES('${id(4)}','CURSO SINTETICO','TECNICO');
      INSERT INTO public.turmas VALUES('${id(20)}','${id(1)}','${id(4)}','T-SYN','TURMA SINTETICA');
      INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj,cidade,uf) VALUES
        ('${id(30)}','ALUNO SINTETICO','Aluno','${studentDocument}','CIDADE SINTETICA','SE');
      INSERT INTO public.matriculas VALUES('${id(40)}','${id(30)}','${id(20)}');
      INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,data_vencimento,
        valor,valor_pago,descricao,origem_pagamento,forma_pagamento) VALUES
        ('${id(200)}','${id(1)}','${id(40)}','PAGO','2026-11-08','2026-10-10',9000,100.10,'RECEBIMENTO SINTETICO','LOCAL','PIX'),
        ('${id(201)}','${id(1)}','${id(40)}','PENDENTE',NULL,'2026-10-10',9000,0,'COMPONENTE SINTETICO','LOCAL','PIX');
      INSERT INTO public.financial_payment_events VALUES('${id(301)}','RECEIVABLE','${id(201)}','${id(1)}','2026-11-09',NULL);
      INSERT INTO public.financial_payment_components VALUES('${id(401)}','${id(301)}',2520);
      SET test.actor='${id(11)}';
    `);
    // Applied production modules provide the actual authorization, receipt amount,
    // effective-component projection, preparation and removal contracts.
    for (let index = 0; index < 3; index++) await db.exec(migrations[index]);
    await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      VALUES($1,$2,'HOMOLOGACAO',$3,$4,$4),($5,$2,'HOMOLOGACAO',$6,$4,$4)`,
    [id(60), id(1), { name: 'MODELO HISTORICO', active: true, serviceDescription: 'Curso REF. {{mes_referencia}}',
      nationalServiceCode: '080101', nbsCode: '122020000', issTreatment: 'TRIBUTAVEL' }, id(11), id(61),
    { name: 'MODELO NOVO TREINAMENTO', active: true, serviceDescription: 'Treinamento REF. {{mes_referencia}}',
      nationalServiceCode: '080201', nbsCode: '122020000', issTreatment: 'TRIBUTAVEL' }]);
    await db.exec(`CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,service_date date,status text,
      model_id uuid,model_snapshot jsonb,partner_id uuid,amount numeric,service_description text,receivable_id uuid);
      CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,definition jsonb,version int);
      INSERT INTO private.nfse_configurations VALUES('${id(1)}','HOMOLOGACAO',
        '{"municipalityCode":"2803401","municipalRegistration":"","opSimpNac":"3","regEspTrib":"0","regApTribSN":null}',1);`);
    for (const migration of migrations.slice(3)) await db.exec(migration);
    const prepared = await value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
      [...Object.values(scope), id(90), [`${id(20)}:${id(30)}`], id(60), 1, '2026-11']);
    documentId = prepared.data.documentIds[0];
    const initialFinance = await finance();
    let initial; let saved;
    await t.test('getter separates payment month from explicit fiscal dates and shows new selected model only in review', async () => {
      initial = (await get()).data;
      assert.equal(initial.revision, 0); assert.equal(initial.reviewStatus, 'NOT_REVIEWED');
      assert.equal(initial.canTransmit, false); assert.equal(initial.reviewComplete, false);
      assert.equal(initial.preparation.amount, '125.30'); assert.equal(initial.preparation.receiptCount, 2);
      assert.equal(initial.preparation.paymentMonth, '2026-11'); assert.equal(initial.preparation.originalModel.nationalServiceCode, '080101');
      assert.equal(initial.service.nationalServiceCode, '080201');
      assert.equal(initial.service.description, 'Treinamento REF. novembro de 2026');
      assert.equal(initial.service.competenceDate, null); assert.equal(initial.service.serviceDate, null);
      assert.deepEqual(initial.preparation.paymentDates, ['2026-11-08', '2026-11-09']);
      assert.equal(initial.recipient.document, studentDocument); assert.equal(initial.recipient.confirmed, false);
      assert.match(initial.basisToken, /^[0-9a-f]{64}$/);
      assert(initial.checks.some((check) => check.code === 'COMPETENCE_REQUIRED'));
      const originalModel = (await get({}, null)).data;
      assert.equal(originalModel.reviewStatus, 'BLOCKED');
      assert(originalModel.checks.some((check) => check.code === 'MODEL_SERVICE_NOT_APPROVED'));
    });
    await t.test('academic reference is the latest real day and rejects missing or cross-month evidence', async () => {
      const reference = dates => value('SELECT private.nfse_academic_payment_reference($1,$2) value',
        [{ financial: { currentReceipts: dates.map(paymentDate => ({ paymentDate })) } }, '2026-11']);
      assert.equal(await reference(['2026-11-09', '2026-11-08', '2026-11-09']), '2026-11-09');
      for (const dates of [[], ['2026-10-31'], ['2026-11'], [null], ['2026-11-31']])
        await assert.rejects(reference(dates));
      assert.equal(await value("SELECT has_function_privilege('authenticated','private.nfse_academic_payment_reference(jsonb,text)','EXECUTE') value"), false);
    });
    await t.test('authorization precedes private facts and replay; no direct table or anonymous RPC access', async () => {
      await db.exec("SET test.source_blocked='true'");
      for (const changes of [{ context: id(99) }, { polo: id(3) }, { environment: 'PRODUCAO' }]) {
        // Production has no matching document and never discloses the homologation snapshot.
        await assert.rejects(get(changes), (error) => error.code === '42501');
      }
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(get(), (error) => error.code === '42501');
      await assert.rejects(save({ token: initial.basisToken }), (error) => error.code === '42501');
      await db.exec("UPDATE public.test_context SET allowed=true; SET test.source_blocked='false'");
      const privileges = (await db.query(`SELECT
        has_table_privilege('authenticated','private.nfse_fiscal_review_revisions','SELECT') table_read,
        has_function_privilege('anon','public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid)','EXECUTE') anon_read,
        has_function_privilege('authenticated','public.save_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,jsonb)','EXECUTE') save`)).rows[0];
      assert.deepEqual(privileges, { table_read: false, anon_read: false, save: true });
    });
    await t.test('save requires explicit dates and confirmations; rejects browser values and document identity', async () => {
      for (const change of [
        { competenceDate: null }, { serviceDate: null }, { competenceDate: '2026-02-31' },
        { competenceDate: '2026-11-08' }, { serviceDate: '2026-11-30' }, { competenceDate: '2026-10-09' },
        { recipient: { mode: 'STUDENT', confirmed: false } }, { recipient: { mode: 'OTHER', confirmed: true } },
        { recipient: { mode: 'STUDENT', confirmed: true, document: 'CLIENT_SUPPLIED' } },
        { classificationConfirmed: false }, { receiptsConfirmed: false }, { amount: '1.00' },
      ]) await assert.rejects(save({ token: initial.basisToken, definition: { ...definition, ...change } }), (error) => error.code === '22023');
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'), 0);
    });
    await t.test('confirmed revision is immutable, replays exactly and never authorizes transmission or changes finance', async () => {
      saved = await save({ token: initial.basisToken });
      await db.exec("SET test.source_blocked='true'");
      assert.deepEqual(await save({ token: initial.basisToken }), saved);
      await assert.rejects(save({ token: initial.basisToken, definition: { ...definition, serviceDate: '2026-10-13' } }), (error) => error.code === '22023');
      await db.exec("SET test.source_blocked='false'");
      const current = (await get()).data;
      assert.equal(current.revision, 1); assert.equal(current.reviewStatus, 'CONFIRMED');
      assert.equal(current.reviewComplete, true); assert.equal(current.canTransmit, false);
      assert.equal(current.service.competenceDate, '2026-11-09'); assert.equal(current.service.serviceDate, '2026-11-09');
      assert.equal(current.recipient.confirmed, true);
      assert(current.checks.some((check) => check.code === 'REVIEW_CONFIRMED' && check.status === 'PASSED'));
      assert.deepEqual(current.preparation.paymentDates, ['2026-11-08', '2026-11-09']);
      assert.deepEqual(await finance(), initialFinance);
      await assert.rejects(db.exec('UPDATE private.nfse_fiscal_review_revisions SET revision=2'), (error) => error.code === '55000');
      await assert.rejects(save({ request: id(101), token: current.basisToken, revision: 0 }), (error) => error.code === '40001');
    });
    await t.test('model, issuer configuration and student changes invalidate existing confirmation', async () => {
      for (const [mutate, restore, code] of [
        ["UPDATE private.nfse_models SET version=2 WHERE id='" + id(61) + "'", "UPDATE private.nfse_models SET version=1 WHERE id='" + id(61) + "'", 'MODEL_CHANGED'],
        ['UPDATE private.nfse_configurations SET version=2', 'UPDATE private.nfse_configurations SET version=1', 'CONFIGURATION_CHANGED'],
        ["UPDATE public.parceiros SET nome='ALUNO SINTETICO ALTERADO'", "UPDATE public.parceiros SET nome='ALUNO SINTETICO'", 'RECIPIENT_CHANGED'],
      ]) {
        await db.exec(mutate); const stale = (await get()).data;
        assert.equal(stale.reviewStatus, 'STALE'); assert.equal(stale.reviewComplete, false); assert.equal(stale.recipient.confirmed, false);
        assert(stale.checks.some((check) => check.code === code));
        await assert.rejects(save({ request: id(102), token: initial.basisToken, revision: 1 }), (error) => error.code === '40001');
        await db.exec(restore); assert.equal((await get()).data.reviewStatus, 'CONFIRMED');
      }
    });
    await t.test('missing student role yields a stable recipient object and explicit registration blockers', async () => {
      await db.exec("UPDATE public.parceiros SET tipo='OUTRO'");
      const current = (await get()).data;
      assert.equal(current.reviewStatus, 'STALE'); assert.equal(current.recipient.mode, 'STUDENT');
      assert.equal(current.recipient.studentId, id(30)); assert.equal(current.recipient.name, null);
      assert.equal(current.recipient.document, null); assert.equal(current.recipient.confirmed, false);
      assert.deepEqual(current.recipient.address, { street: null, number: null, complement: null,
        district: null, city: null, state: null, postalCode: null });
      assert(current.checks.some((check) => check.code === 'RECIPIENT_NAME_REQUIRED'));
      assert(current.checks.some((check) => check.code === 'RECIPIENT_DOCUMENT_INVALID'));
      await db.exec("UPDATE public.parceiros SET tipo='Aluno'");
      assert.equal((await get()).data.reviewStatus, 'CONFIRMED');
    });
    await t.test('receipt amount, date, origin and component reversal invalidate review without rewriting snapshot', async () => {
      for (const [mutate, restore] of [
        ["UPDATE public.contas_receber SET valor_pago=101 WHERE id='" + id(200) + "'", "UPDATE public.contas_receber SET valor_pago=100.10 WHERE id='" + id(200) + "'"],
        ["UPDATE public.contas_receber SET data_pagamento='2026-11-10' WHERE id='" + id(200) + "'", "UPDATE public.contas_receber SET data_pagamento='2026-11-08' WHERE id='" + id(200) + "'"],
        ["UPDATE public.contas_receber SET origem_pagamento='IMPORTED' WHERE id='" + id(200) + "'", "UPDATE public.contas_receber SET origem_pagamento='LOCAL' WHERE id='" + id(200) + "'"],
        ['UPDATE public.financial_payment_events SET reversed_at=now()', 'UPDATE public.financial_payment_events SET reversed_at=NULL'],
      ]) {
        await db.exec(mutate); const stale = (await get()).data;
        assert.equal(stale.reviewStatus, 'STALE'); assert.equal(stale.canTransmit, false);
        assert(stale.checks.some((check) => check.code === 'SOURCE_CHANGED'));
        assert.deepEqual(stale.preparation.paymentDates, []);
        assert.equal(stale.service.competenceDate, definition.competenceDate);
        await db.exec(restore);
      }
      assert.equal((await get()).data.reviewStatus, 'CONFIRMED');
      assert.deepEqual(await finance(), initialFinance);
    });
    await t.test('new unreserved payments do not inflate or invalidate the old preparation; resave appends a revision', async () => {
      await db.exec(`INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,valor,valor_pago,
        descricao,origem_pagamento,forma_pagamento) VALUES('${id(202)}','${id(1)}','${id(40)}','PAGO','2026-11-10',500,500,
        'NOVO RECEBIMENTO SINTETICO','LOCAL','PIX')`);
      const current = (await get()).data;
      assert.equal(current.reviewStatus, 'CONFIRMED'); assert.equal(current.preparation.amount, '125.30');
      const before = await finance();
      const next = await save({ request: id(103), revision: 1, token: current.basisToken,
        definition });
      assert.equal(next.data.revision, 2); assert.equal((await get()).data.service.serviceDate, '2026-11-09');
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'), 2);
      assert.deepEqual(await finance(), before);
    });
    await t.test('logical removal blocks review while preserving its historical idempotent acknowledgement', async () => {
      const before = await finance();
      await value('SELECT public.remove_nfse_queue_documents_secure($1,$2,$3,$4,$5,$6) value',
        [...Object.values(scope), id(150), [documentId]]);
      const removed = (await get()).data;
      assert.equal(removed.reviewStatus, 'BLOCKED'); assert.equal(removed.canTransmit, false);
      assert(removed.checks.some((check) => check.code === 'PREPARATION_REMOVED'));
      assert.deepEqual(removed.preparation.paymentDates, []);
      await assert.rejects(save({ request: id(104), revision: 2, token: removed.basisToken }), (error) => error.code === '22023');
      assert.deepEqual(await save({ token: initial.basisToken }), saved);
      assert.deepEqual(await finance(), before);
    });
    await t.test('a single effective receipt day is returned without saving or confirming fiscal dates', async () => {
      await db.exec(`INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj) VALUES
        ('${id(31)}','SEGUNDO ALUNO SINTETICO','Aluno','${cpf('000000002')}');
        INSERT INTO public.matriculas VALUES('${id(41)}','${id(31)}','${id(20)}');
        INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,valor,valor_pago,
          descricao,origem_pagamento,forma_pagamento) VALUES
          ('${id(203)}','${id(1)}','${id(41)}','PAGO','2026-11-12',75,75,'UNICO DIA SINTETICO','LOCAL','PIX');`);
      const next = await value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [...Object.values(scope), id(91), [`${id(20)}:${id(31)}`], id(61), 1, '2026-11']);
      documentId = next.data.documentIds[0];
      const before = await finance();
      const current = (await get()).data;
      assert.deepEqual(current.preparation.paymentDates, ['2026-11-12']);
      assert.equal(current.service.competenceDate, null); assert.equal(current.service.serviceDate, null);
      assert.equal(current.recipient.confirmed, false); assert.equal(current.reviewComplete, false);
      assert.equal(current.canTransmit, false); assert.equal(current.revision, 0);
      assert.deepEqual(await finance(), before);
    });
  } finally { await db.close(); }
});

