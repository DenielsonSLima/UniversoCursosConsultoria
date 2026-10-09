import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const model = { v: 2, validityDays: 30,
  textContent: '<p>Modelo salvo {{ALUNO_NOME}}, {{ALUNO_NASCIMENTO}}.</p><p>Segundo parágrafo configurado.</p><p>Terceiro parágrafo configurado.</p>',
  absoluteFields: [
    { id: 'signature', type: 'image', value: 'data:image/png;base64,SIGNATURE', x: 225, y: 867, width: 220 },
    { id: 'qr', type: 'qrcode', x: 622, y: 760, width: 120 },
  ],
};
const student = n => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const enrollment = n => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const signature = 'public.obter_declaracao_matricula_aluno_pdf(uuid)';

test('student declaration RPC serves the saved official model without exposing configuration tables', async t => {
  const db = new PGlite();
  const login = async n => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [n ? student(n) : '']);
    await db.exec('set role authenticated');
  };
  const call = async n => (await db.query(`select ${signature.replace('(uuid)', '($1)')} as value`, [enrollment(n)])).rows[0].value;
  const admin = async () => db.exec('reset role');
  const configure = async (value = model) => {
    await admin();
    await db.query("insert into public.documentos_templates(id,conteudo) values('declaracao',$1) on conflict(id) do update set conteudo=excluded.conteudo", [value]);
  };
  try {
    await db.exec(await read('./fixtures/declaration-identity-schema.sql'));
    await db.exec(await read('../migrations/20261009130712_declaration_student_identity.sql'));
    await db.exec(await read('./fixtures/student-declaration-boundaries.sql'));
    await db.exec(await read('../migrations/20261009173251_student_enrollment_declaration_pdf.sql'));
    await configure();

    await t.test('student sees no configuration rows but receives the exact global model, birth date, QR and signature', async () => {
      await db.query("insert into public.documentos_templates(id,conteudo) values($1,$2)",
        ['declaracao_10000000-0000-0000-0000-000000000001', { ...model, textContent: 'MODELO LEGADO' }]);
      await login(1);
      assert.deepEqual((await db.query('select * from public.documentos_templates')).rows, []);
      const result = await call(1);
      assert.deepEqual(result.preview.template, model);
      assert.equal(result.emission.aluno_id, student(1));
      assert.equal(result.emission.dados_emissao.studentBirthDate, '2000-02-07');
      assert.equal(result.emission.dados_emissao.studentDocumentType, 'RG (ANTIGO)');
      assert.equal(result.preview.watermark.watermarkOpacity, 0);
      assert.equal(result.preview.watermark.watermarkRotate, false);
      assert.equal(result.preview.watermark.watermarkScale, 100);
      assert.equal(result.preview.polo.logoUrl, 'data:image/png;base64,LOGO');
    });

    await t.test('reopening refreshes saved layout while preserving the issued identity, code, dates and counters', async () => {
      await login(1);
      const before = (await call(1)).emission;
      await configure({ ...model, textContent: '<p>Modelo atualizado {{ALUNO_NASCIMENTO}}.</p>' });
      await db.query("update public.parceiros set tipo_documento='CIN', rg='12345678909' where id=$1", [student(1)]);
      await login(1);
      const after = await call(1);
      assert.equal(after.preview.template.textContent, '<p>Modelo atualizado {{ALUNO_NASCIMENTO}}.</p>');
      for (const key of ['id', 'codigo', 'emitido_em', 'ultima_emissao_em', 'quantidade_emissoes', 'dados_emissao']) {
        assert.deepEqual(after.emission[key], before[key]);
      }
    });

    await t.test('foreign enrollment, unauthenticated and unknown user fail before producing any document', async () => {
      await login(1);
      await assert.rejects(call(2), /próprio aluno/);
      await login(null);
      await assert.rejects(call(1), /não autorizado/);
      await login(999);
      await assert.rejects(call(1), /não autorizado/);
      await admin();
      assert.equal((await db.query('select count(*)::int as total from public.documentos_validacao')).rows[0].total, 1);
    });

    await t.test('inactive enrollment fails even when it already has a valid code', async () => {
      await admin();
      await db.query("update public.matriculas set status='TRANCADO' where id=$1", [enrollment(1)]);
      await login(1);
      await assert.rejects(call(1), /matrícula ativa/);
      await admin();
      await db.query("update public.matriculas set status='ATIVO' where id=$1", [enrollment(1)]);
    });

    await t.test('missing or malformed global configuration fails instead of substituting a generic model', async () => {
      for (const invalid of [null, { textContent: '' }, { textContent: 'saved', absoluteFields: {} }]) {
        await configure(invalid);
        await login(2);
        await assert.rejects(call(2), /modelo oficial/);
      }
      await admin();
      assert.equal((await db.query('select count(*)::int as total from public.documentos_validacao')).rows[0].total, 1);
      await db.exec("delete from public.documentos_templates where id='declaracao'");
      await login(2);
      assert.equal((await call(2)).preview.template.textContent, 'MODELO LEGADO');
      await admin();
      await db.exec('delete from public.documentos_templates');
      await login(3);
      await assert.rejects(call(3), /modelo oficial/);
      await configure();
    });

    await t.test('new CIN identity and legacy emission fallbacks remain individual and read-only', async () => {
      await login(2);
      const cin = await call(2);
      assert.equal(cin.emission.dados_emissao.studentDocumentType, 'CIN');
      await admin();
      await db.query("update public.documentos_validacao set dados_emissao=$1 where matricula_id=$2", [{ studentName: 'LEGACY SNAPSHOT' }, enrollment(1)]);
      await login(1);
      const legacy = await call(1);
      assert.deepEqual(legacy.emission.dados_emissao, { studentName: 'LEGACY SNAPSHOT' });
      assert.equal(legacy.emission.aluno.data_nascimento, '2000-02-07');
      assert.equal(legacy.emission.aluno.tipo_documento, 'CIN');
    });

    await t.test('existing revocation and expiration guards are propagated without administrative reissue', async () => {
      await admin();
      await db.query("update public.documentos_validacao set status='REVOGADO' where matricula_id=$1", [enrollment(1)]);
      await login(1);
      await assert.rejects(call(1), /revogado/);
      await admin();
      await db.query("update public.documentos_validacao set status='ATIVO',validade_ate=now()-interval '1 day' where matricula_id=$1", [enrollment(1)]);
      await login(1);
      await assert.rejects(call(1), /expirado/);
    });

    await t.test('RPC is security definer with empty search path and no anonymous execute grant', async () => {
      await admin();
      const row = (await db.query(`select prosecdef,proconfig,has_function_privilege('anon',$1,'EXECUTE') as anon,
        has_function_privilege('authenticated',$1,'EXECUTE') as authenticated from pg_proc where oid=$1::regprocedure`, [signature])).rows[0];
      assert.equal(row.prosecdef, true);
      assert.ok(row.proconfig.some(value => value === 'search_path=""'));
      assert.equal(row.anon, false);
      assert.equal(row.authenticated, true);
    });
  } finally { await db.close(); }
});
