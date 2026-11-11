import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fixture = await readFile(new URL('./nfse_academic_queue.fixture.sql', import.meta.url), 'utf8');
const original = await readMigration('20261108225236_nfse_receipt_amount_projection.sql');
const registration = await readMigration('20261111110000_nfse_receipt_student_registration.sql');
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const candidate = (classId, studentId) => `${id(classId)}:${id(studentId)}`;

test('receipt registration is read-only and preserves authorization, totals, selection and pagination', async t => {
  const db = new PGlite();
  const read = (polo = 1, selected = [], includeGroups = true, page = 1) => db.query(
    'SELECT public.get_nfse_receipt_students_secure($1,$2,$3,NULL,NULL,NULL,$4,1,$5,$6) value',
    [id(10), id(polo), '2026-11-01', page, selected, includeGroups]).then(r => r.rows[0].value);
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.polos(id,status) VALUES('${id(1)}','ativo'),('${id(2)}','ativo');
      INSERT INTO public.cursos VALUES('${id(4)}','Curso sintético','TECNICO');
      INSERT INTO public.turmas VALUES('${id(20)}','${id(1)}','${id(4)}','T-A','Turma A'),
        ('${id(21)}','${id(1)}','${id(4)}','T-B','Turma B'),('${id(22)}','${id(2)}','${id(4)}','T-X','Turma X');
      INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj,cidade,uf) VALUES
        ('${id(30)}','Aluno sintético A','ALUNO','00100200300',' Cidade sintética ','se'),
        ('${id(31)}','Aluno sintético B','ALUNO',NULL,NULL,NULL),
        ('${id(32)}','Aluno sintético C','ALUNO','000.000.000-00',' Outra cidade ','ba');
      INSERT INTO public.matriculas VALUES('${id(40)}','${id(30)}','${id(20)}'),
        ('${id(41)}','${id(31)}','${id(21)}'),('${id(42)}','${id(32)}','${id(22)}');
      INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,valor_pago) VALUES
        ('${id(50)}','${id(1)}','${id(40)}','PAGO','2026-11-02',12.34),
        ('${id(51)}','${id(1)}','${id(41)}','PAGO','2026-11-02',10.00),
        ('${id(52)}','${id(2)}','${id(42)}','PAGO','2026-11-02',99.00);
      SET test.actor='${id(11)}';`);
    await db.exec(original);
    const before = await read(1, [candidate(20,30), candidate(21,31)]);
    const recordsBefore = (await db.query('SELECT jsonb_agg(to_jsonb(p) ORDER BY id) records FROM public.parceiros p')).rows[0].records;
    await db.exec(registration);
    const after = await read(1, [candidate(20,30), candidate(21,31)]);
    await t.test('same receipt identities and exact amounts, additional registration only', () => {
      const strip = value => JSON.parse(JSON.stringify(value), (key, item) =>
        ['studentCpf','studentCity','studentState'].includes(key) ? undefined : item);
      assert.deepEqual(strip(after), before);
      assert.equal(after.groups[0].students[0].studentCpf, '00100200300');
      assert.equal(after.groups[0].students[0].studentCity, 'Cidade sintética');
      assert.equal(after.groups[0].students[0].studentState, 'SE');
    });
    await t.test('selection outside current page gets registration and unknown stays null', async () => {
      const second = after.selection.groups[1].students[0];
      assert.equal(second.studentCpf, null);
      assert.equal(second.studentCity, null);
      assert.equal(second.studentState, null);
      const selection = await read(1, [candidate(20,30)], false);
      assert.deepEqual(selection.groups, []);
      assert.equal(selection.selection.groups[0].students[0].studentCpf, '00100200300');
      assert.equal((await read(1, [], true, 2)).groups[0].students[0].studentCity, null);
    });
    await t.test('no foreign student registration and no access before existing guards', async () => {
      const foreign = await read(1, [candidate(22,32)]);
      assert.deepEqual(foreign.selection.groups, []);
      assert.deepEqual(foreign.selection.unavailableIds, [candidate(22,32)]);
      assert(!JSON.stringify(foreign).includes('Outra cidade'));
      await assert.rejects(read(2), error => error.code === '42501');
      await db.exec("SET test.actor=''; SET test.source_blocked='true'");
      await assert.rejects(read(), error => error.code === '42501');
    });
    await t.test('existing grants and registration records are unchanged', async () => {
      const row = (await db.query(`SELECT has_function_privilege('anon',p.oid,'EXECUTE') anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') service_role, p.proconfig
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
        WHERE n.nspname='public' AND p.proname='get_nfse_receipt_students_secure'`)).rows[0];
      assert.equal(row.anon, false); assert.equal(row.authenticated, true); assert.equal(row.service_role, false);
      assert(row.proconfig.includes('search_path=""'));
      assert.deepEqual((await db.query('SELECT jsonb_agg(to_jsonb(p) ORDER BY id) records FROM public.parceiros p')).rows[0].records, recordsBefore);
    });
  } finally { await db.close(); }
});
