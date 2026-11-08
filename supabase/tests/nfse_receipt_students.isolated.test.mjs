import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A fresh WASM database only: no connection URL, remote client or production data.
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261108005455_nfse_receipt_students_read.sql', import.meta.url), 'utf8');
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const candidate = (classId, studentId) => `${id(classId)}:${id(studentId)}`;

test('NFS-e reads the complete authorized payment-month source without enabling fiscal writes', async t => {
  const db = new PGlite();
  const read = async (params = {}) => {
    const values = { context: id(100), polo: id(1), month: '2026-11-01', course: 'TECNICO',
      classId: null, search: null, page: 1, pageSize: 10, selected: [], includeGroups: true, ...params };
    return (await db.query(`SELECT public.get_nfse_receipt_students_secure(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result`, Object.values(values))).rows[0].result;
  };
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA internal_financial_payments;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
      CREATE TABLE public.test_context(id uuid PRIMARY KEY, actor uuid, allowed boolean, all_polos boolean, polos uuid[]);
      INSERT INTO public.test_context VALUES ('${id(100)}','${id(101)}',true,false,ARRAY['${id(1)}'::uuid]);
      CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
        $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
      CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
        LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)='ativo'$$;
      CREATE FUNCTION public.financeiro_normalize_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS
        $$SELECT lower(translate(coalesce($1,''),'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç','AAAAEEIOOOUUCaaaaeeiooouuc'))$$;
      CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
      CREATE TABLE public.cursos(id uuid PRIMARY KEY,nome text,modalidade text);
      CREATE TABLE public.turmas(id uuid PRIMARY KEY,polo_id uuid,curso_id uuid,codigo text,nome text);
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,tipo text);
      CREATE TABLE public.matriculas(id uuid PRIMARY KEY,aluno_id uuid,turma_id uuid);
      CREATE TABLE public.test_cash(id uuid PRIMARY KEY,polo_id uuid,matricula_id uuid,turma_id uuid,
        status text,data_pagamento date,data_vencimento date,valor_recebido numeric,reversed boolean DEFAULT false);
      CREATE FUNCTION internal_financial_payments.cash_receivables() RETURNS SETOF public.test_cash
        LANGUAGE sql STABLE AS $$SELECT * FROM public.test_cash WHERE NOT reversed$$;
      CREATE FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date)
        RETURNS TABLE(id uuid,valor_recebido numeric) LANGUAGE plpgsql STABLE AS $$
        BEGIN
          IF current_setting('test.source_blocked',true)='true' THEN RAISE EXCEPTION 'SOURCE_READ'; END IF;
          RETURN QUERY SELECT c.id,c.valor_recebido FROM internal_financial_payments.cash_receivables() c
            WHERE c.polo_id=$1 AND c.status='PAGO' AND c.data_pagamento >= $2 AND c.data_pagamento < $3;
        END; $$;
      INSERT INTO public.polos VALUES ('${id(1)}','ativo'),('${id(2)}','ativo'),('${id(3)}','inativo');
      INSERT INTO public.cursos VALUES ('${id(10)}','Curso técnico sintético','TECNICO'),('${id(11)}','Curso livre sintético','LIVRE');
      INSERT INTO public.turmas VALUES
        ('${id(20)}','${id(1)}','${id(10)}','T-A','Turma A'),
        ('${id(21)}','${id(1)}','${id(10)}','T-B','Turma B'),
        ('${id(22)}','${id(1)}','${id(11)}','T-C','Turma C'),
        ('${id(23)}','${id(2)}','${id(10)}','T-X','Turma externa');
      INSERT INTO public.parceiros VALUES
        ('${id(30)}','ÁLUNO ALFA SINTÉTICO','Aluno'),('${id(31)}','ALUNO BETA SINTÉTICO','Aluno'),
        ('${id(32)}','ALUNO GAMA SINTÉTICO','Aluno'),('${id(33)}','ALUNO DELTA SINTÉTICO','Aluno'),
        ('${id(34)}','ALUNO SEM PAGAMENTO POSITIVO','Aluno');
      INSERT INTO public.matriculas VALUES
        ('${id(40)}','${id(30)}','${id(20)}'),('${id(41)}','${id(31)}','${id(20)}'),
        ('${id(42)}','${id(32)}','${id(21)}'),('${id(43)}','${id(33)}','${id(22)}'),
        ('${id(44)}','${id(34)}','${id(20)}'),('${id(45)}','${id(30)}','${id(20)}');
      SET test.actor='${id(101)}';
    `);
    await db.exec(migration);
    const payments = [
      [200,40,20,'PAGO','2026-11-03','2026-09-10','100.00',false],
      [201,40,20,'PAGO','2026-11-04','2026-10-10','50.00',false],
      // Effective component IDs: there is deliberately no contas_receber table to join.
      [202,45,20,'PAGO','2026-11-05','2026-11-10','12.34',false],
      [203,45,20,'PAGO','2026-11-06','2026-11-10','37.66',false],
      [204,41,20,'PAGO','2026-11-03','2026-11-10','80.00',false],
      [205,42,21,'PAGO','2026-11-03','2026-11-10','40.00',false],
      [206,43,22,'PAGO','2026-11-03','2026-11-10','60.00',false],
      [207,40,20,'PAGO','2026-12-01','2026-11-10','999.00',false],
      [208,40,20,'PAGO','2026-10-31','2026-11-10','888.00',false],
      [209,40,20,'PENDENTE','2026-11-03','2026-11-10','1000.00',false],
      [210,40,20,'PAGO','2026-11-03','2026-11-10','5000.00',true],
      [211,44,20,'PAGO','2026-11-03','2026-11-10','0.00',false],
      [212,44,20,'PAGO','2026-11-03','2026-11-10','-20.00',false],
      [213,41,20,'PAGO','2026-11-03','2026-11-10',null,false],
    ];
    for (const [receipt, enrollment, classId, ...rest] of payments) {
      await db.query('INSERT INTO public.test_cash VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id(receipt),id(1),id(enrollment),id(classId),...rest]);
    }

    await t.test('effective payment month includes arrears and partial components, not due month', async () => {
      const result = await read();
      assert.deepEqual(result.scope, {contextId:id(100),poloId:id(1),paymentMonth:'2026-11',basis:'PAYMENT_DATE'});
      assert.equal(result.totalGroups,2); assert.equal(result.totalStudents,3);
      assert.equal(result.groups[0].receivedAmount,'280.00');
      assert.equal(result.groups[0].students[0].receivedAmount,'200.00');
      assert.equal(result.groups[0].students[0].receiptCount,4);
      assert.equal(result.excludedUnknownCount,1);
      assert.deepEqual(result.selection,{ids:[],selectedCount:0,selectedAmount:'0.00',valid:true,unavailableIds:[],groups:[]});
    });
    await t.test('class paging never truncates students and filters use canonical identities', async () => {
      const first = await read({pageSize:1}); const second = await read({pageSize:1,page:2});
      assert.equal(first.groups.length,1); assert.equal(first.groups[0].studentCount,2);
      assert.equal(first.groups[0].students.length,2); assert.equal(second.groups[0].id,id(21));
      assert.equal((await read({search:'aluno alfa'})).totalStudents,1);
      assert.equal((await read({search:'%'})).totalStudents,0);
      assert.equal((await read({classId:id(21)})).totalStudents,1);
      assert.equal((await read({course:''})).totalGroups,3);
      assert.equal((await read({course:null})).totalStudents,4);
      assert.equal((await read({course:'LIVRE'})).groups[0].id,id(22));
      assert.deepEqual(first.classes.map(row=>row.id),[id(20),id(21)]);
    });
    await t.test('selection spans every page, class and course despite active search filters', async () => {
      const selected=[candidate(20,30),candidate(21,32),candidate(22,33),candidate(20,30)];
      const result=await read({selected,pageSize:1,search:'beta'});
      assert.equal(result.totalStudents,1); assert.equal(result.selection.selectedCount,3);
      assert.equal(result.selection.selectedAmount,'300.00'); assert.equal(result.selection.groups.length,3);
      assert.deepEqual(result.selection.groups.flatMap(group=>group.students.map(student=>student.id)), selected.slice(0,3));
      assert.equal((await read({selected,includeGroups:false})).groups.length,0);
      assert.equal((await read({selected,includeGroups:false})).selection.groups.length,3);
    });
    await t.test('stale or foreign selection is invalid, never a misleading partial total', async () => {
      const foreign=candidate(23,30);
      const result=await read({selected:[candidate(20,30),foreign]});
      assert.equal(result.selection.valid,false); assert.equal(result.selection.selectedAmount,null);
      assert.deepEqual(result.selection.ids,[candidate(20,30)]);
      assert.deepEqual(result.selection.unavailableIds,[foreign]);
      await db.exec(`UPDATE public.test_cash SET reversed=true WHERE id='${id(205)}'`);
      const reversed=await read({selected:[candidate(21,32)]});
      assert.equal(reversed.selection.valid,false); assert.equal(reversed.selection.groups.length,0);
      await db.exec(`UPDATE public.test_cash SET reversed=false WHERE id='${id(205)}'`);
    });
    await t.test('numeric precision is preserved and non-finite values are not selectable', async () => {
      await db.query('INSERT INTO public.test_cash VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id(220),id(1),id(40),id(20),'PAGO','2026-11-07','2026-11-01','9007199254740993.12',false]);
      assert.equal((await read({selected:[candidate(20,30)]})).selection.selectedAmount,'9007199254741193.12');
      await db.exec(`UPDATE public.test_cash SET valor_recebido='NaN' WHERE id='${id(220)}'`);
      const invalid=await read(); assert.equal(invalid.excludedUnknownCount,2);
      assert.equal(invalid.groups[0].receivedAmount,'280.00');
      await db.exec(`DELETE FROM public.test_cash WHERE id='${id(220)}'`);
    });
    await t.test('pilot/context/polo denial happens before the source is read', async () => {
      await db.exec("SET test.source_blocked='true'");
      await assert.rejects(read(), /SOURCE_READ/);
      await assert.rejects(read({context:id(999)}), error=>error.code==='42501');
      await assert.rejects(read({polo:id(2)}), error=>error.code==='42501');
      await db.exec(`SET test.actor='${id(999)}'`);
      await assert.rejects(read(), error=>error.code==='42501');
      await db.exec("SET test.actor=''");
      await assert.rejects(read(), error=>error.code==='42501');
      await db.exec(`SET test.actor='${id(101)}'; SET test.source_blocked='false'`);
    });
    await t.test('bounds reject malformed month, selection, pagination and foreign classes', async () => {
      for (const params of [{month:null},{month:'2026-11-02'},{month:'infinity'},
        {page:0},{pageSize:26},{course:'INVALID'},{includeGroups:null},{search:'x'.repeat(121)},
        {selected:['invalid']},{selected:[null]},{selected:Array(1001).fill(candidate(20,30))}]) {
        await assert.rejects(read(params), error=>error.code==='22023');
      }
      await assert.rejects(read({classId:id(23)}), error=>error.code==='42501');
      await db.exec('UPDATE public.test_context SET all_polos=true');
      assert.equal((await read({polo:id(2)})).totalStudents,0);
      await assert.rejects(read({polo:id(3)}), error=>error.code==='42501');
    });
    await t.test('only authenticated callers can execute the new API', async () => {
      const signature='public.get_nfse_receipt_students_secure(uuid,uuid,date,text,uuid,text,integer,integer,text[],boolean)';
      const grants=(await db.query(`SELECT has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
        has_function_privilege('anon',$1,'EXECUTE') anon,
        has_function_privilege('service_role',$1,'EXECUTE') service_role`,[signature])).rows[0];
      assert.deepEqual(grants,{authenticated:true,anon:false,service_role:false});
      await db.exec('SET ROLE authenticated');
      assert.equal((await read()).totalStudents,3);
      await db.exec('RESET ROLE');
      assert.equal((await db.query("SELECT count(*)::integer amount FROM public.test_cash")).rows[0].amount,payments.length);
    });
  } finally { await db.close(); }
});
