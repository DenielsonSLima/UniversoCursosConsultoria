import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261009145431_carteirinha_current_public_policy.sql');
const schema = await read('./fixtures/carteirinha-current-policy-schema.sql');
const helpers = await read('./fixtures/carteirinha-current-policy-helpers.sql');
const oldFields = ['studentName', 'className', 'issuedAt', 'expiresAt'];
const addedFields = ['studentCpf', 'studentBirthDate', 'maskedMotherName', 'maskedEnrollmentNumber'];
const currentFields = [...oldFields, ...addedFields];
const snapshot = { studentName: 'ALUNO H***', className: 'Turma congelada',
  issuedAt: '2026-01-02T12:00:00+00:00', expiresAt: '2090-12-31T23:59:59+00:00' };
const frozen = { studentName: 'ALUNO EMISSAO SINTETICO', studentCpf: '12345678909',
  studentBirthDate: '1999-04-01', motherName: 'MAE EMISSAO SINTETICA' };
const signature = 'public.dados_publicos_carteirinha_atual(public.documentos_validacao)';

test('real CIE validator adopts current visibility without reissuing the historical document', async t => {
  const db = new PGlite();
  const validate = async (code = 'CIE-SYNTHETIC') => (await db.query(
    'select public.validar_documento_por_codigo($1) as result', [code],
  )).rows[0].result;
  const row = async () => (await db.query('select to_jsonb(document) as document from public.documentos_validacao document')).rows[0].document;
  const policy = async (fields, version = 2) => db.query(
    'update public.documentos_validacao_politicas set campos_publicos = $1, versao = $2', [fields, version],
  );
  const reset = async (type = 'carteirinha') => {
    await db.exec(`reset role;
      truncate public.documentos_validacao, public.documentos_validacao_politicas;
      update public.matriculas set status = 'ATIVO';
      update public.turmas set data_previsao_termino = '2099-12-31';`);
    await db.query(`insert into public.documentos_validacao_politicas
      values ($1, $2, true, true, true, 2)`, [type, currentFields]);
    await db.query(`insert into public.documentos_validacao values (
      '70000000-0000-0000-0000-000000000001', $1, 'CIE-SYNTHETIC', 'ATIVO', true,
      1, $2, $3, '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
      '2090-12-31T23:59:59Z', $4, '2026-01-02T12:00:00Z', '2026-02-02T12:00:00Z', '2026', 2
    )`, [type, oldFields, snapshot, frozen]);
  };
  const scenario = (name, body) => t.test(name, async () => { await reset(); await body(); });
  try {
    await db.exec(schema);
    await db.exec(helpers);
    await reset();
    const beforeMigration = await row();
    await db.exec(migration);
    assert.deepEqual(await row(), beforeMigration, 'migration must not rewrite or backfill emissions');

    await scenario('newly enabled fields appear for an old card, masked and sourced from the issued data', async () => {
      const original = await row();
      const actual = await validate();
      assert.equal(actual.status, 'ACTIVE');
      assert.equal(actual.studentCpf, '***.***.***-09');
      assert.equal(actual.studentBirthDate, '**/**/1999');
      assert.equal(actual.maskedMotherName, 'MAE E***');
      assert.equal(actual.studentName, snapshot.studentName);
      assert.equal(actual.className, snapshot.className);
      assert.equal(actual.schemaVersion, 2);
      assert.deepEqual(actual.visibleFields, [...currentFields].sort());
      assert.ok(!JSON.stringify(actual).includes('12345678909'));
      assert.ok(!JSON.stringify(actual).includes('1999-04-01'));
      assert.deepEqual(await row(), original);
    });

    await scenario('missing emission keys use registration values but explicit raw or public null stays null', async () => {
      await db.query('update public.documentos_validacao set dados_emissao = $1', [{}]);
      const registered = await validate();
      assert.equal(registered.studentCpf, '***.***.***-00');
      assert.equal(registered.studentBirthDate, '**/**/2000');
      assert.equal(registered.maskedMotherName, 'MARIA S***');
      await db.query('update public.documentos_validacao set dados_emissao = $1', [{ studentCpf: null, motherName: null }]);
      const rawNull = await validate();
      assert.equal(rawNull.studentCpf, null);
      assert.equal(rawNull.maskedMotherName, null);
      await db.query('update public.documentos_validacao set dados_emissao = $1, dados_publicos_snapshot = $2',
        [frozen, { ...snapshot, studentCpf: null, studentBirthDate: null, maskedMotherName: '' }]);
      const publicNull = await validate();
      assert.equal(publicNull.studentCpf, null);
      assert.equal(publicNull.studentBirthDate, null);
      assert.equal(publicNull.maskedMotherName, '');
    });

    await scenario('removing fields from current policy hides them immediately without modifying the document', async () => {
      const original = await row();
      await validate();
      await policy(['className'], 3);
      const reduced = await validate();
      assert.deepEqual(reduced, { type: 'carteirinha', status: 'ACTIVE', code: 'CIE-SYNTHETIC',
        className: snapshot.className, visibleFields: ['className'], schemaVersion: 3 });
      assert.deepEqual(await row(), original);
    });

    await scenario('issued timestamps and expiry remain canonical despite conflicting emission payload values', async () => {
      await policy([...currentFields, 'lastIssuedAt', 'issueCount']);
      await db.query('update public.documentos_validacao set dados_emissao = $1',
        [{ ...frozen, issuedAt: '2099-01-01', lastIssuedAt: '2099-01-01', expiresAt: '2099-12-31', issueCount: 999 }]);
      const original = await row();
      const actual = await validate();
      assert.equal(Date.parse(actual.issuedAt), Date.parse(original.emitido_em));
      assert.equal(Date.parse(actual.lastIssuedAt), Date.parse(original.ultima_emissao_em));
      assert.equal(Date.parse(actual.expiresAt), Date.parse(original.validade_ate));
      assert.equal(actual.issueCount, 2);
      await db.exec("update public.turmas set data_previsao_termino = '2080-01-01'");
      assert.ok(Date.parse((await validate()).expiresAt) < Date.parse(original.validade_ate));
      assert.deepEqual(await row(), original);
    });

    await scenario('revocation, expiry, enrollment and public lookup gates retain their existing behavior', async () => {
      await db.exec("update public.documentos_validacao set status = 'REVOGADO'");
      assert.equal((await validate()).status, 'REVOKED');
      await db.exec("update public.documentos_validacao set status = 'ATIVO', validade_ate = now() - interval '1 day'");
      assert.equal((await validate()).status, 'EXPIRED');
      await db.exec("update public.documentos_validacao set validade_ate = '2090-12-31'; update public.matriculas set status = 'CANCELADO'");
      assert.equal((await validate()).status, 'REVOKED');
      await db.exec('update public.documentos_validacao set validacao_publica = false');
      assert.equal(await validate(), null);
      await db.exec('update public.documentos_validacao set validacao_publica = true; update public.documentos_validacao_politicas set consulta_publica_ativa = false');
      assert.equal(await validate(), null);
    });

    await scenario('other documents keep the original emission/current-policy intersection and frozen schema version', async () => {
      for (const type of ['cracha', 'certificado_ead', 'declaracao_matricula']) {
        await reset(type);
        const actual = await validate();
        assert.deepEqual(actual.visibleFields, [...oldFields].sort());
        assert.equal(actual.schemaVersion, 1);
        for (const key of addedFields) assert.equal(Object.hasOwn(actual, key), false);
        await policy(['studentName', 'studentCpf'], 3);
        assert.deepEqual((await validate()).visibleFields, ['studentName']);
      }
    });

    await scenario('public validator remains callable while helper is inaccessible to anonymous and authenticated clients', async () => {
      const functions = await db.query(`select proname, prosecdef, proconfig from pg_proc
        where pronamespace = 'public'::regnamespace and proname in
        ('validar_documento_por_codigo', 'dados_publicos_carteirinha_atual') order by proname`);
      assert.deepEqual(functions.rows.map(item => [item.proname, item.prosecdef, item.proconfig]), [
        ['dados_publicos_carteirinha_atual', false, ['search_path=""']],
        ['validar_documento_por_codigo', true, ['search_path=""']],
      ]);
      for (const role of ['anon', 'authenticated']) {
        const permissions = (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as helper,
          has_function_privilege($1, 'public.validar_documento_por_codigo(text)', 'EXECUTE') as validator`, [role, signature])).rows[0];
        assert.deepEqual(permissions, { helper: false, validator: true });
        await db.exec(`set role ${role}`);
        try {
          assert.equal((await validate()).studentCpf, '***.***.***-09');
          await assert.rejects(db.query('select public.dados_publicos_carteirinha_atual(null::public.documentos_validacao)'),
            error => error.code === '42501');
        } finally { await db.exec('reset role'); }
      }
    });
  } finally { await db.close(); }
});
