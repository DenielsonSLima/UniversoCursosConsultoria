import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fixture = name => readFile(new URL(name, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const eventXml = (key, environment = 'PRODUCAO') => `<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT${key}101101001"><nSeqEvento>001</nSeqEvento><pedRegEvento><infPedReg Id="PRE${key}101101"><tpAmb>${environment === 'PRODUCAO' ? '1' : '2'}</tpAmb><chNFSe>${key}</chNFSe><e101101><cMotivo>1</cMotivo><xMotivo>Motivo sintético confirmado.</xMotivo></e101101></infPedReg></pedRegEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></evento>`;
const current = ['20261108225453_nfse_models_private_store.sql','20261108225236_nfse_receipt_amount_projection.sql',
  '20261108233250_nfse_model_reference_month.sql','20261109020017_nfse_academic_queue_store.sql',
  '20261109020019_nfse_academic_queue_prepare.sql','20261109020021_nfse_academic_queue_reads.sql',
  '20261110132800_nfse_queue_logical_removal.sql','20261110132801_nfse_queue_realtime.sql',
  '20261111013732_nfse_academic_description_render.sql','20261111013738_nfse_academic_description_context.sql',
  '20261111013745_nfse_academic_description_prepare.sql','20261111110000_nfse_receipt_student_registration.sql'];

test('confirmed academic cancellation releases only eligibility, preserving all fiscal and payment history', async t => {
  const db = new PGlite();
  const value = async (query, args = []) => (await db.query(query, args)).rows[0].value;
  const prepare = (polo, request, environment = 'PRODUCAO') => value(
    'SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
    [id(10),id(polo),environment,'2026-12',id(request),[`${id(20+polo)}:${id(30+polo)}`],id(environment === 'PRODUCAO' ? 60 : 61),'2026-11']);
  const reader = (polo, environment = 'PRODUCAO', selected = []) => value(
    'SELECT public.get_nfse_receipt_students_secure($1,$2,$3,NULL,NULL,NULL,1,10,$4,true,$5) value',
    [id(10),id(polo),'2026-11-01',selected,environment]);
  const canonical = () => value(`SELECT jsonb_build_object(
    'payments',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.contas_receber r),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.financial_payment_events e),
    'documents',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM private.nfse_queue_documents q),
    'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id) FROM private.nfse_queue_operation_links l)) value`);
  const operation = async (document, n, environment = 'PRODUCAO') => {
    const q = await value('SELECT to_jsonb(q) value FROM private.nfse_queue_documents q WHERE id=$1',[document]);
    const key = String(n).padStart(50,'0');
    await db.query('INSERT INTO private.nfse_individual_operations VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id(n),q.polo_id,environment,q.queue_month,'AUTHORIZED',{accessKey:key,number:String(n)},`<NFSe Id="NFS${key}"/>`]);
    await db.query("INSERT INTO private.nfse_queue_operation_links VALUES('ACADEMIC_QUEUE',$1,$2)",[document,id(n)]);
    await db.query(`INSERT INTO private.nfse_individual_cancellations
      (id,operation_id,state,access_key,event_reference_id,event_input,signed_event_xml)
      VALUES($1,$2,'PROCESSING',$3,$4,$5,$6)`,[id(n+1000),id(n),key,`PRE${key}101101`,
      {environment,eventCode:'101101',accessKey:key},`<pedRegEvento Id="PRE${key}101101"><Signature/></pedRegEvento>`]);
    return { cancellation: id(n+1000), key, result: {state:'CANCELLED',code:'CONFIRMED',accessKey:key,eventCode:'101101',eventId:`EVT${key}101101001`} };
  };
  const finish = (c, changes = {}) => db.query(`UPDATE private.nfse_individual_cancellations
    SET state=$2,result=$3,event_xml=$4 WHERE id=$1`,
    [c.cancellation,changes.state ?? 'CANCELLED',changes.result ?? c.result,changes.xml ?? eventXml(c.key)]);
  let first, second, third, a, b, c, historical, homo;
  const fresh = new Map();
  try {
    await db.exec(await fixture('./nfse_academic_queue.fixture.sql'));
    for (const name of current) await db.exec(await sql(name));
    await db.exec(await fixture('./nfse_academic_cancel_release.fixture.sql'));
    const bridge = await sql('20261111004615_nfse_queue_operation_basis.sql');
    await db.exec(bridge.slice(bridge.indexOf('CREATE FUNCTION private.guard_nfse_queue_fiscal_removal'),bridge.indexOf("NOTIFY pgrst")));
    const formatter = await sql('20260621173000_secure_validator_identity_fields.sql');
    await db.exec(formatter.slice(0,formatter.indexOf('CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo')));
    const shared = await sql('20261111121000_nfse_shared_model_scope.sql');
    await db.exec(shared.slice(shared.indexOf('CREATE FUNCTION private.nfse_model_visible_to_polo'),shared.indexOf('CREATE FUNCTION private.nfse_model_projection')));
    const preparation = await sql('20261111121002_nfse_shared_model_preparation.sql');
    await db.exec(preparation.match(/CREATE OR REPLACE FUNCTION public\.prepare_nfse_batch_secure[\s\S]*?\$function\$;/)[0]);
    const dates = await sql('20261111123000_nfse_fiscal_review_payment_dates.sql');
    await db.exec(dates.slice(dates.indexOf('CREATE FUNCTION private.nfse_academic_payment_reference'),dates.indexOf('CREATE OR REPLACE FUNCTION public.get_nfse_fiscal_review_secure')));
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,
      ARRAY['${id(2)}','${id(3)}','${id(4)}']::uuid[]);
      INSERT INTO public.empresas VALUES('${id(9)}','EMPRESA SINTÉTICA','00.000.000/0001-91');
      INSERT INTO public.polos(id,status,company_id,nome,cnpj,is_matriz)
        VALUES('${id(1)}','ativo','${id(9)}','MATRIZ SINTÉTICA','00.000.000/0001-91',true);
      INSERT INTO public.cursos VALUES('${id(5)}','Curso técnico sintético','TECNICO');
      SET test.actor='${id(11)}';`);
    for (const p of [2,3,4]) {
      await db.query(`INSERT INTO public.polos(id,status,company_id,nome,cnpj) VALUES($1,'ativo',$2,'FILIAL SINTÉTICA','00.000.000/0002-72')`,[id(p),id(9)]);
      await db.query("INSERT INTO public.turmas VALUES($1,$2,$3,'SYN','TURMA SINTÉTICA')",[id(20+p),id(p),id(5)]);
      await db.query("INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj) VALUES($1,'ALUNO SINTÉTICO','Aluno','00000000191')",[id(30+p)]);
      await db.query("INSERT INTO public.matriculas VALUES($1,$2,$3,'2026-02-01Z')",[id(40+p),id(30+p),id(20+p)]);
      await db.query(`INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,data_vencimento,valor,valor_pago,parcela_numero,tipo_lancamento)
        VALUES($1,$2,$3,'PAGO','2026-11-09','2026-11-01',100,100,1,'PARCELA')`,[id(200+p),id(p),id(40+p)]);
    }
    for (const environment of ['PRODUCAO','HOMOLOGACAO']) await db.query(`INSERT INTO private.nfse_models
      (id,polo_id,environment,definition,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)`,
      [id(environment === 'PRODUCAO' ? 60 : 61),id(1),environment,{name:'MODELO COMPARTILHADO SINTÉTICO',active:true,
        nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:'SERVIÇOS EDUCACIONAIS'},id(11)]);
    first = await prepare(2,100); second = await prepare(3,101); third = await prepare(4,102);
    a = await operation(first.data.documentIds[0],500); b = await operation(second.data.documentIds[0],501);
    c = await operation(third.data.documentIds[0],502);
    historical = await canonical();
    await finish(a);
    for (const name of ['20261112011456_nfse_academic_cancel_release_store.sql',
      '20261112011503_nfse_academic_cancel_release_prepare.sql','20261112011509_nfse_academic_receipt_availability.sql']) await db.exec(await sql(name));
    await t.test('backfill and scoped reader expose only a proven cancelled origin; legacy10args remains compatible', async () => {
      assert.equal((await reader(2)).totalStudents,1); assert.equal((await reader(3)).totalStudents,0);
      assert.equal((await reader(4)).totalStudents,0); assert.equal((await reader(3,'HOMOLOGACAO')).totalStudents,1);
      const legacy = await value('SELECT public.get_nfse_receipt_students_secure($1,$2,$3) value',[id(10),id(3),'2026-11-01']);
      assert.equal(legacy.totalStudents,1); assert.equal(legacy.scope.environment,null);
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_academic_cancellation_releases')).rows[0].n,1);
      assert.deepEqual(await canonical(),historical);
    });
    await t.test('pending, rejected, absent, wrong-type, foreign-key and malformed event evidence never releases', async () => {
      for (const state of ['CANCELLATION_PENDING','CANCELLATION_REJECTED','BLOCKED','AWAITING_ANALYSIS']) {
        await finish(b,{state,result:{...b.result,state},xml:''}); assert.equal((await reader(3)).totalStudents,0);
      }
      for (const code of [undefined,'EVENT_NOT_FOUND','EVENT_PENDING']) {
        await finish(b,{result:{...b.result,code}}); assert.equal((await reader(3)).totalStudents,0);
      }
      for (const xml of ['', '<evento>',eventXml(b.key).replaceAll('101101','101103'),eventXml('9'.repeat(50)),
        eventXml(b.key,'HOMOLOGACAO'),eventXml(b.key).replace('001</nSeqEvento>','002</nSeqEvento>'),
        '<!DOCTYPE evento [<!ENTITY x "synthetic">]>'+eventXml(b.key)]) {
        await finish(b,{xml}); assert.equal((await reader(3)).totalStudents,0);
      }
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_academic_cancellation_releases')).rows[0].n,1);
    });
    await t.test('each of three branches may prepare a fresh identity after confirmed cancellation, never reusing a link', async () => {
      await finish(b); await finish(c);
      for (const [p, old, request] of [[2,first,110],[3,second,111],[4,third,112]]) {
        assert.equal((await reader(p)).totalStudents,1);
        const next = await prepare(p,request); assert.notEqual(next.data.documentIds[0],old.data.documentIds[0]);
        fresh.set(p,next);
        assert.equal(next.data.totalAmount,'100.00'); assert.equal((await reader(p)).totalStudents,0);
        assert.deepEqual(await prepare(p,request),next); assert.deepEqual(await prepare(p,request-10),old);
        await assert.rejects(prepare(p,request+10),e=>e.code==='23505');
        const q = await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[next.data.documentIds[0]]);
        assert.equal(q.model.id,id(60)); assert.equal(q.academic.descriptionContext.entries[0].paymentDate,'2026-11-09');
        assert.equal(await value('SELECT private.nfse_academic_payment_reference($1,$2) value',
          [{financial:{currentReceipts:q.financial.receipts}},'2026-11']),'2026-11-09');
      }
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_queue_operation_links')).rows[0].n,3);
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_receipt_reservations')).rows[0].n,6);
      assert.deepEqual((await canonical()).payments,historical.payments);
      await assert.rejects(db.query('INSERT INTO private.nfse_queue_removals(document_id,removal_id) VALUES($1,$2)',
        [first.data.documentIds[0],id(999)]),e=>e.code==='55000');
    });
    await t.test('release and second claim remain environment-scoped and exact physical/event overlap is fenced', async () => {
      homo = await prepare(3,130,'HOMOLOGACAO'); assert.equal((await reader(3,'HOMOLOGACAO')).totalStudents,0);
      await assert.rejects(prepare(3,131,'HOMOLOGACAO'),e=>e.code==='23505');
      assert.notEqual(homo.data.documentIds[0],second.data.documentIds[0]);
      const selected = await reader(3,'PRODUCAO',[`${id(23)}:${id(33)}`]);
      assert.equal(selected.selection.valid,false); assert.equal(selected.selection.selectedAmount,null);
      assert.equal(selected.selection.unavailableIds.length,1);
      await assert.rejects(db.query(`INSERT INTO private.nfse_receipt_reservations(environment,receipt_id,source_receivable_id,document_id,amount)
        VALUES('PRODUCAO',$1,$1,$2,100)`,[id(203),second.data.documentIds[0]]),e=>e.code==='23505');
    });
    await t.test('partial components cannot bypass an active physical claim; release permits one fresh full preparation', async () => {
      await db.query("INSERT INTO public.financial_payment_events VALUES($1,'RECEIVABLE',$2,$3,'2026-11-09',NULL)",[id(700),id(203),id(3)]);
      await db.query('INSERT INTO public.financial_payment_components VALUES($1,$2,4000),($3,$2,6000)',[id(701),id(700),id(702)]);
      assert.equal((await reader(3)).totalStudents,0);
      await assert.rejects(prepare(3,140),e=>e.code==='23505');
      const op = await operation(fresh.get(3).data.documentIds[0],503);
      await finish(op); assert.equal((await reader(3)).totalStudents,1);
      const next = await prepare(3,141); assert.equal(next.data.receiptCount,2); assert.equal(next.data.totalAmount,'100.00');
      assert.equal((await reader(3)).totalStudents,0);
      await db.query('UPDATE public.financial_payment_events SET reversed_at=now() WHERE id=$1',[id(700)]);
      assert.equal((await reader(3)).totalStudents,0);
      await assert.rejects(prepare(3,142),e=>e.code==='23505');
    });
    await t.test('failure rolls back cancellation, release and hint together; repeated proof cannot duplicate release', async () => {
      const op = await operation(homo.data.documentIds[0],504,'HOMOLOGACAO');
      const count = () => value("SELECT jsonb_build_object('releases',(SELECT count(*) FROM private.nfse_academic_cancellation_releases),\
        'hints',(SELECT count(*) FROM public.nfse_queue_change_events)) value");
      const before = await count();
      await db.exec(`CREATE FUNCTION private.test_release_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN RAISE EXCEPTION 'SYNTHETIC_RELEASE_FAILURE'; END;$$;
        CREATE TRIGGER zz_test_release_failure BEFORE INSERT ON private.nfse_academic_cancellation_releases
          FOR EACH ROW EXECUTE FUNCTION private.test_release_failure();`);
      await assert.rejects(finish(op,{xml:eventXml(op.key,'HOMOLOGACAO')}),/SYNTHETIC_RELEASE_FAILURE/);
      assert.deepEqual(await count(),before);
      assert.equal(await value('SELECT state value FROM private.nfse_individual_cancellations WHERE id=$1',[op.cancellation]),'PROCESSING');
      await db.exec('DROP TRIGGER zz_test_release_failure ON private.nfse_academic_cancellation_releases');
      await finish(op,{xml:eventXml(op.key,'HOMOLOGACAO')});
      assert.equal((await reader(3,'HOMOLOGACAO')).totalStudents,1);
      const released = (await count()).releases;
      await finish(op,{xml:eventXml(op.key,'HOMOLOGACAO')});
      assert.equal((await count()).releases,released);
      await assert.rejects(db.query(`INSERT INTO private.nfse_academic_cancellation_releases
        SELECT $1,operation_id,cancellation_id,polo_id,environment,queue_month,payment_month,event_id,event_xml_sha256,released_at
        FROM private.nfse_academic_cancellation_releases WHERE cancellation_id=$2`,[first.data.documentIds[0],op.cancellation]),e=>e.code==='55000');
      await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await assert.rejects(prepare(3,150,'HOMOLOGACAO'),e=>e.code==='25001'); await db.exec('ROLLBACK');
    });
    await t.test('untransmitted removal still releases only its own claim without deleting either historical reservation', async () => {
      const next = await prepare(3,151,'HOMOLOGACAO'); assert.equal((await reader(3,'HOMOLOGACAO')).totalStudents,0);
      const result = await value('SELECT public.remove_nfse_queue_documents_secure($1,$2,$3,$4,$5,$6) value',
        [id(10),id(3),'HOMOLOGACAO','2026-12',id(152),next.data.documentIds]);
      assert.equal(result.data.removedCount,1); assert.equal((await reader(3,'HOMOLOGACAO')).totalStudents,1);
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_receipt_reservations WHERE document_id=ANY($1::uuid[])',
        [[...homo.data.documentIds,...next.data.documentIds]]),2);
    });
    await t.test('current authorization still precedes replay and cross-polo reads; private release records are immutable', async () => {
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(prepare(2,100),e=>e.code==='42501'); await assert.rejects(reader(2),e=>e.code==='42501');
      await db.exec('UPDATE public.test_context SET allowed=true');
      await assert.rejects(reader(1),e=>e.code==='42501');
      await assert.rejects(db.exec('DELETE FROM private.nfse_academic_cancellation_releases'),e=>e.code==='55000');
      for (const role of ['anon','authenticated','service_role']) {
        const privileges = await value("SELECT jsonb_build_object('write',has_table_privilege($1,'private.nfse_academic_cancellation_releases','INSERT,UPDATE,DELETE'),\
          'read',has_table_privilege($1,'private.nfse_academic_cancellation_releases','SELECT'),\
          'proof',has_function_privilege($1,'private.nfse_academic_cancel_release_proven(uuid)','EXECUTE')) value",[role]);
        assert.deepEqual(privileges,{write:false,read:false,proof:false});
      }
      const variants = await value("SELECT count(*)::int value FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\
        WHERE n.nspname='public' AND p.proname='get_nfse_receipt_students_secure'");
      assert.equal(variants,1);
      await assert.rejects(reader(2,'INVALID'),e=>e.code==='22023');
    });
  } finally { await db.close(); }
});
