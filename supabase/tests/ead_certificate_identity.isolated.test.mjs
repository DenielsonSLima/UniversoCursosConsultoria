import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newDatabase, submit, state, emit, applyIdentityMigration,
} from './fixtures/ead-certificate-test-harness.mjs';

const keys = ['studentDocumentType', 'studentCpf', 'studentRg',
  'studentRgIssuer', 'studentRgState', 'studentRgIssueDate'];
const identityOf = snapshot => Object.fromEntries(keys.filter(key =>
  Object.hasOwn(snapshot, key)).map(key => [key, snapshot[key]]));
const updateStudent = (db, type = 'CIN', rg = null) => db.query(`UPDATE parceiros
  SET tipo_documento=$1,cpf_cnpj='12345678901',rg=$2,orgao_emissor='SSP',
    rg_uf_emissao='SE',rg_data_emissao='2020-01-02'`, [type, rg]);
const reopen = db => db.exec(`UPDATE certificados_academicos
  SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL`);

test('primeira emissão EAD congela identidade declarada idêntica nos dois snapshots', async () => {
  const db = await newDatabase();
  try {
    await updateStudent(db, 'CNI');
    await submit(db);
    const issued = await state(db);
    const expected = { studentDocumentType: 'CNI', studentCpf: '12345678901',
      studentRg: null, studentRgIssuer: 'SSP', studentRgState: 'SE', studentRgIssueDate: '2020-01-02' };
    assert.deepEqual(identityOf(issued.documents[0].dados_emissao), expected);
    assert.deepEqual(identityOf(issued.certificates[0].metadados), expected);
    assert.equal(issued.documents[0].dados_emissao.eadCurriculum.version, 1);
    assert.equal(issued.documents[0].dados_emissao.eadCurriculumTable.version, 2);
    assert.equal(issued.documents[0].quantidade_emissoes, 1);
    await updateStudent(db, 'RG (ANTIGO)', '98.765.432-X');
    await submit(db);
    assert.deepEqual(await state(db), issued);
  } finally { await db.close(); }
});

test('RG antigo, tipo ausente e identificação legada ambígua nunca viram CIN pelo CPF', async () => {
  for (const [type, rg] of [['RG (ANTIGO)', '98.765.432-X'], [null, null],
    ['CARTEIRA NACIONAL DE IDENTIFICAÇÃO', null]]) {
    const db = await newDatabase();
    try {
      await updateStudent(db, type, rg);
      await submit(db);
      const issued = await state(db);
      assert.equal(issued.documents[0].dados_emissao.studentDocumentType, type);
      assert.equal(issued.documents[0].dados_emissao.studentRg, rg);
      assert.equal(issued.documents[0].dados_emissao.studentCpf, '12345678901');
      assert.deepEqual(identityOf(issued.certificates[0].metadados), identityOf(issued.documents[0].dados_emissao));
    } finally { await db.close(); }
  }
});

test('documento reutilizado conserva identidade original e não mistura cadastro atualizado', async () => {
  const db = await newDatabase();
  try {
    await updateStudent(db, 'RG (ANTIGO)', '98.765.432-X');
    await submit(db);
    const original = await state(db);
    await updateStudent(db, 'CIN', null);
    await db.exec("UPDATE parceiros SET cpf_cnpj='99999999999'");
    await reopen(db);
    await db.exec(`UPDATE certificados_academicos SET metadados=metadados ||
      '{"studentDocumentType":"CIN","studentCpf":"99999999999"}'::jsonb`);
    await emit(db);
    const after = await state(db);
    assert.deepEqual(after.documents, original.documents);
    assert.deepEqual(identityOf(after.certificates[0].metadados), identityOf(original.documents[0].dados_emissao));
    assert.equal(after.certificates[0].codigo_validacao, original.certificates[0].codigo_validacao);
    assert.equal(after.certificates[0].emitido_em, original.certificates[0].emitido_em);
    const beforeReplay = await state(db);
    await emit(db);
    assert.deepEqual(await state(db), beforeReplay);
  } finally { await db.close(); }
});

test('reutilização legada mantém chaves ausentes e NULL explícito, sem enriquecer documento', async () => {
  const db = await newDatabase({ identity: false });
  try {
    await submit(db);
    await db.exec(`UPDATE documentos_validacao SET dados_emissao=dados_emissao ||
      '{"studentDocumentType":null}'::jsonb`);
    const original = await state(db);
    await applyIdentityMigration(db);
    await updateStudent(db, 'CIN', null);
    await reopen(db);
    await db.exec(`UPDATE certificados_academicos SET metadados=metadados ||
      '{"studentDocumentType":"CIN","studentRg":"valor posterior","studentRgIssuer":"novo"}'::jsonb`);
    await emit(db);
    const after = await state(db);
    assert.deepEqual(after.documents, original.documents);
    assert.deepEqual(identityOf(after.certificates[0].metadados),
      { studentDocumentType: null, studentCpf: '00000000000' });
  } finally { await db.close(); }
});

test('nova migração não altera registros anteriores nem funções de outras modalidades', async () => {
  const db = await newDatabase({ identity: false });
  try {
    await submit(db);
    const before = await state(db);
    const query = `SELECT oid::text, proacl::text, pg_get_functiondef(oid) AS definition
      FROM pg_proc WHERE proname IN ('emitir_documento_validacao_interno',
        'finalizar_certificado_academico','p1_finalizar_certificado_academico_20260719') ORDER BY oid`;
    const functions = await db.query(query);
    await applyIdentityMigration(db);
    assert.deepEqual(await state(db), before);
    assert.deepEqual(await db.query(query), functions);
    await emit(db);
    assert.deepEqual(await state(db), before);
    await assert.rejects(db.exec(`SET ROLE authenticated;
      SELECT internal_academic.ead_emitir_certificado_automatico('55555555-5555-4555-8555-555555555555')`),
    /permission denied/);
    await db.exec('RESET ROLE');
  } finally { await db.close(); }
});

test('falha após emissor continua atômica sem certificado, identidade ou documento parcial', async () => {
  const db = await newDatabase();
  try {
    await updateStudent(db);
    await db.exec(`CREATE FUNCTION reject_identity_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.dados_emissao ? 'studentDocumentType' THEN
        RAISE EXCEPTION 'Falha sintética de persistência da identidade'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_identity_snapshot BEFORE UPDATE ON documentos_validacao
      FOR EACH ROW EXECUTE FUNCTION reject_identity_snapshot()`);
    const before = await state(db);
    await assert.rejects(submit(db), /Falha sintética de persistência/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});
