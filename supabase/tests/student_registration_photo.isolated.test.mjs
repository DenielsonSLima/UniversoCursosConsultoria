import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupRegistrationPhotoFixture, ids } from './student_registration_photo.fixture.mjs';

// PostgreSQL isolado em memória, sem credenciais, URL remota ou dados pessoais.
const modulePath = process.env.PGLITE_MODULE_PATH;
const moduleUrl = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleUrl);
const { pgcrypto } = await import(modulePath
  ? new URL('./contrib/pgcrypto.js', moduleUrl).href
  : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const migrationsDirectory = new URL('../migrations/', import.meta.url);
const photoA = 'https://example.invalid/student-photo-a.png';
const photoB = 'https://example.invalid/student-photo-b.png';
const batch = async (key, enrollmentIds = [ids.enrollment], document = 'ficha_matricula', model = ids.model) => (
  await db.query('select * from public.reemitir_fichas_validacao_lote_portal($1,$2,$3,$4,$5)',
    [document, enrollmentIds, key, document === 'ficha_matricula' ? model : null, ids.issuer])
).rows;
const photograph = async (url, student = ids.student) => db.query(
  'update public.parceiros set foto_url=$1 where id=$2', [url, student],
);
const emission = async (code) => (await db.query(
  'select * from public.documentos_validacao where codigo=$1', [code],
)).rows[0];
const state = async () => (await db.query(`select
  (select coalesce(jsonb_agg(d order by codigo),'[]') from public.documentos_validacao d) documents,
  (select coalesce(jsonb_agg(l order by idempotency_key),'[]')
    from public.documentos_validacao_reemissoes_idempotencia l) ledger`)).rows[0];
let passed = 0;
const check = async (name, run) => {
  await run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const expectCode = async (operation, code) => assert.rejects(operation, (error) => error.code === code);

try {
  await setupRegistrationPhotoFixture(db);
  let original;
  await check('reproduz ficha sem foto que não acompanha a foto cadastrada depois', async () => {
    const initial = (await batch('photo-regression-before-0001'))[0];
    await photograph(photoA);
    const repeated = (await batch('photo-regression-before-0002'))[0];
    assert.equal(repeated.codigo, initial.codigo);
    original = await emission(initial.codigo);
    assert.equal(original.dados_emissao.studentPhotoUrl, null);
  });

  const migrations = readdirSync(migrationsDirectory).filter((name) => (
    /^20260926200[012]00_.*photo.*\.sql$/.test(name)
  )).sort();
  assert.equal(migrations.length, 3, 'as três etapas da correção devem existir');
  const baseline = await state();
  for (const migration of migrations) {
    await db.exec(readFileSync(new URL(migration, migrationsDirectory), 'utf8'));
  }
  assert.deepEqual(await state(), baseline, 'aplicação não altera registros históricos');

  let firstPhoto;
  await check('nova solicitação com foto cria código próprio e mantém a ficha antiga', async () => {
    firstPhoto = (await batch('photo-regression-after-0001'))[0];
    assert.notEqual(firstPhoto.codigo, original.codigo);
    const current = await emission(firstPhoto.codigo);
    assert.equal(current.dados_emissao.studentPhotoUrl, photoA);
    assert.match(current.referencia_externa, /^student-photo:[a-f0-9]{64}$/);
    assert.deepEqual(await emission(original.codigo), original);
    for (const key of ['documentTemplateSnapshot', 'institutionSnapshot', 'watermarkSnapshot']) {
      assert.ok(current.dados_emissao[key], `novo snapshot inclui ${key}`);
      assert.deepEqual(current.dados_emissao[key], original.dados_emissao[key]);
    }
  });

  await check('foto igual reutiliza sua revisão sem criar outra linha', async () => {
    const before = (await state()).documents.length;
    const repeated = (await batch('photo-regression-after-0002'))[0];
    assert.equal(repeated.codigo, firstPhoto.codigo);
    assert.equal((await state()).documents.length, before);
  });

  await check('retry mantém resposta e foto originais mesmo após nova troca no cadastro', async () => {
    await photograph(photoB);
    const before = await state();
    assert.deepEqual((await batch('photo-regression-after-0001'))[0], firstPhoto);
    assert.deepEqual(await state(), before);
  });

  let secondPhoto;
  await check('troca da foto gera revisão com snapshot atual e mantém todas as anteriores', async () => {
    const previous = await emission(firstPhoto.codigo);
    secondPhoto = (await batch('photo-regression-after-0003'))[0];
    assert.notEqual(secondPhoto.codigo, firstPhoto.codigo);
    assert.equal((await emission(secondPhoto.codigo)).dados_emissao.studentPhotoUrl, photoB);
    assert.deepEqual(await emission(firstPhoto.codigo), previous);
    assert.deepEqual(await emission(original.codigo), original);
  });

  await check('reemissão histórica identifica a revisão selecionada e mantém foto congelada', async () => {
    const previous = await emission(firstPhoto.codigo);
    const prepared = (await db.query(`select * from public.preparar_reemissao_documento_validacao_portal(
      'ficha_matricula',$1,'photo-history-reissue-0001',$2,$3,$4)`,
    [ids.enrollment, ids.model, previous.referencia_externa, ids.issuer])).rows[0];
    const rows = (await db.query(`select * from public.reemitir_documento_validacao_portal(
      'ficha_matricula',$1,'photo-history-reissue-0001',$2,$3,$4)`,
    [ids.enrollment, ids.model, previous.referencia_externa, ids.issuer])).rows;
    assert.equal(rows[0].codigo, firstPhoto.codigo);
    assert.equal(rows[0].quantidade_emissoes, prepared.quantidade_emissoes);
    assert.deepEqual(rows[0].ultima_emissao_em, prepared.ultima_emissao_em);
    assert.deepEqual((await emission(firstPhoto.codigo)).dados_emissao, previous.dados_emissao);
  });

  await check('foto removida mantém emissão sem foto e não substitui foto de outra revisão', async () => {
    await photograph(null);
    const without = (await batch('photo-regression-without-0001'))[0];
    assert.equal((await emission(without.codigo)).dados_emissao.studentPhotoUrl, null);
    assert.equal((await emission(firstPhoto.codigo)).dados_emissao.studentPhotoUrl, photoA);
    await photograph('');
    assert.equal((await batch('photo-regression-without-0002'))[0].codigo, without.codigo);
    await photograph('/sem-foto-aluno.svg');
    assert.equal((await batch('photo-regression-without-0003'))[0].codigo, without.codigo);
  });

  await check('remoção de foto que existia na primeira ficha cria revisão vazia', async () => {
    await photograph(photoA, ids.student2);
    const withPhoto = (await batch('photo-second-student-0001', [ids.enrollment2]))[0];
    await photograph(null, ids.student2);
    const without = (await batch('photo-second-student-0002', [ids.enrollment2]))[0];
    assert.notEqual(without.codigo, withPhoto.codigo);
    assert.equal((await emission(without.codigo)).dados_emissao.studentPhotoUrl, null);
    assert.equal((await emission(withPhoto.codigo)).dados_emissao.studentPhotoUrl, photoA);
  });

  await check('mesma chave com outro modelo é rejeitada sem efeitos', async () => {
    const before = await state();
    await expectCode(() => batch('photo-regression-after-0001', [ids.enrollment],
      'ficha_matricula', '00000000-0000-0000-0000-000000000099'), '22023');
    assert.deepEqual(await state(), before);
  });

  await check('autorização precede replay de uma chave confirmada', async () => {
    await db.exec("update test_registration.access_state set allowed=false,role_name='authenticated'");
    const before = await state();
    await expectCode(() => batch('photo-regression-after-0001'), '42501');
    assert.deepEqual(await state(), before);
    await db.exec("update test_registration.access_state set allowed=true,role_name='service_role'");
  });

  await check('revogação da base não pode ser contornada por uma foto diferente', async () => {
    await db.query("update public.documentos_validacao set status='REVOGADO' where codigo=$1", [original.codigo]);
    await photograph('https://example.invalid/photo-after-revocation.png');
    const before = await state();
    await expectCode(() => batch('photo-revoked-base-0001'), '55000');
    assert.deepEqual(await state(), before);
    await db.query("update public.documentos_validacao set status='ATIVO' where codigo=$1", [original.codigo]);
  });

  await check('replay e emissão nova não ressuscitam uma revisão revogada', async () => {
    await db.query("update public.documentos_validacao set status='REVOGADO' where codigo=$1", [secondPhoto.codigo]);
    await photograph(photoB);
    const before = await state();
    await expectCode(() => batch('photo-regression-after-0003'), '55000');
    await expectCode(() => batch('photo-revoked-version-0001'), '55000');
    assert.deepEqual(await state(), before);
  });

  await check('erro num item reverte o lote inteiro', async () => {
    await photograph('https://example.invalid/photo-atomicity.png', ids.student2);
    const before = await state();
    await assert.rejects(() => batch('photo-atomic-batch-0001', [ids.enrollment2, ids.enrollment]));
    assert.deepEqual(await state(), before);
  });

  await check('Pasta preserva seu contrato de reemissão e snapshot', async () => {
    await photograph(null, ids.student2);
    const folder = (await batch('photo-folder-before-0001', [ids.enrollment2], 'pasta_identificacao'))[0];
    const before = await emission(folder.codigo);
    await photograph(photoA, ids.student2);
    const repeated = (await batch('photo-folder-after-0001', [ids.enrollment2], 'pasta_identificacao'))[0];
    assert.equal(repeated.codigo, folder.codigo);
    assert.deepEqual((await emission(folder.codigo)).dados_emissao, before.dados_emissao);
    assert.equal((await emission(folder.codigo)).referencia_externa, null);
  });

  await check('helpers de revisão não são endpoints públicos', async () => {
    const helpers = [
      'internal_academic.ficha_student_photo_reference(text)',
      'internal_academic.emitir_ficha_validacao_com_referencia(text,uuid,text,uuid,boolean,jsonb,text)',
    ];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const helper of helpers) {
        const privileges = (await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',
          [role, helper])).rows[0];
        assert.equal(privileges.allowed, false, `${role}: ${helper}`);
      }
    }
  });

  console.log(JSON.stringify({ passed, database: 'PostgreSQL isolado em memória',
    productionChanged: false, limitation: 'Autorização externa simulada; concorrência entre conexões e smoke remoto pendentes.' }));
} finally {
  await db.close();
}
