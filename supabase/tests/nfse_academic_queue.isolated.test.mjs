import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture = await readFile(new URL('./nfse_academic_queue.fixture.sql',import.meta.url),'utf8');
const modelStore = await readMigration('20261108225453_nfse_models_private_store.sql');
const amountMigration = await readMigration('20261108225236_nfse_receipt_amount_projection.sql');
const referenceMigration = await readMigration('20261108233250_nfse_model_reference_month.sql');
const migrations = await Promise.all(['20261109020017_nfse_academic_queue_store.sql',
  '20261109020019_nfse_academic_queue_prepare.sql','20261109020021_nfse_academic_queue_reads.sql',
  '20261110132800_nfse_queue_logical_removal.sql','20261110132801_nfse_queue_realtime.sql'].map(readMigration));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12,'0')}`;
const candidate = (classId,studentId) => `${id(classId)}:${id(studentId)}`;
const scope = {context:id(10),polo:id(1),environment:'HOMOLOGACAO',month:'2026-12'};

test('academic preparation reserves canonical receipts atomically without fiscal dispatch',async t=>{
  const db = new PGlite();
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const prepare = (changes={},input={}) => value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [...Object.values({...scope,...changes}),input.request??id(100),input.ids??[candidate(20,30)],input.model??id(60),input.version??1,input.paymentMonth??'2026-11']);
  const list = (changes={},status='PREPARADO',page=1,size=25) => value(
    'SELECT public.get_nfse_queue_secure($1,$2,$3,$4,$5,$6,$7) value',[...Object.values({...scope,...changes}),status,page,size]);
  const counts = () => value(`SELECT jsonb_build_object('batches',(SELECT count(*) FROM private.nfse_preparation_batches),
    'documents',(SELECT count(*) FROM private.nfse_queue_documents),'claims',(SELECT count(*) FROM private.nfse_receipt_reservations),
    'titles',(SELECT count(*) FROM public.contas_receber),'events',(SELECT count(*) FROM public.financial_payment_events)) value`);
  const receipt = async (receiptId,enrollment,amount='100.00',options={}) => db.query(`INSERT INTO public.contas_receber
    (id,polo_id,matricula_id,turma_id,status,data_pagamento,data_vencimento,valor,valor_pago,descricao,origem_pagamento,forma_pagamento)
    VALUES($1,$2,$3,NULL,$4,$5,'2026-09-10',9999,$6,'Recebimento sintético','LOCAL','PIX')`,
    [id(receiptId),id(options.polo??1),id(enrollment),options.status??'PAGO',options.date??'2026-11-08',amount]);
  const event = async (eventId,sourceId,componentId,cents) => {
    await db.query('INSERT INTO public.financial_payment_events VALUES($1,$2,$3,$4,$5,NULL)',
      [id(eventId),'RECEIVABLE',id(sourceId),id(1),'2026-11-09']);
    await db.query('INSERT INTO public.financial_payment_components VALUES($1,$2,$3)',[id(componentId),id(eventId),cents]);
  };
  let first;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.empresas VALUES('${id(2)}','Matriz sintética','00.000.000/0001-00');
      INSERT INTO public.polos(id,status,company_id,nome,cnpj,cidade,estado) VALUES
        ('${id(1)}','ativo','${id(2)}','Filial sintética','00.000.000/0002-00','Cidade própria','SE'),
        ('${id(3)}','ativo','${id(2)}','Polo estrangeiro','00.000.000/0003-00','Outra cidade','SE');
      INSERT INTO public.cursos VALUES('${id(4)}','Curso sintético','TECNICO');
      INSERT INTO public.turmas VALUES('${id(20)}','${id(1)}','${id(4)}','T-A','Turma A'),
        ('${id(21)}','${id(1)}','${id(4)}','T-B','Turma B'),('${id(22)}','${id(3)}','${id(4)}','T-X','Estrangeira');
      INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj,email,cidade) VALUES
        ('${id(30)}','ALUNO ALFA SINTÉTICO','Aluno',NULL,'alfa@example.invalid','Cidade Alfa'),
        ('${id(31)}','ALUNO BETA SINTÉTICO','Aluno',NULL,NULL,'Cidade Beta'),
        ('${id(32)}','ALUNO GAMA SINTÉTICO','Aluno',NULL,NULL,NULL);
      INSERT INTO public.matriculas VALUES('${id(40)}','${id(30)}','${id(20)}'),
        ('${id(41)}','${id(31)}','${id(21)}'),('${id(42)}','${id(32)}','${id(20)}'),
        ('${id(43)}','${id(30)}','${id(20)}'),('${id(44)}','${id(30)}','${id(22)}');
      SET test.actor='${id(11)}';`);
    await db.exec(modelStore);
    // Use the actual selector displayed by the frontend as the independent
    // aggregate oracle, including its environment-agnostic receipt selection.
    await db.exec(amountMigration);
    await db.exec(referenceMigration);
    await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      VALUES($1,$2,'HOMOLOGACAO',$3,$4,$4),($5,$2,'PRODUCAO',$3,$4,$4)`,
    [id(60),id(1),{name:'Modelo sintético',active:true,serviceDescription:'Curso REF. {{mes_referencia}}',
      nationalServiceCode:'080101',nbsCode:'123456789',issTreatment:'TRIBUTAVEL'},id(11),id(61)]);
    for (const migration of migrations) await db.exec(migration);
    await receipt(200,40,'100.10'); await receipt(201,43,'25.20'); await receipt(202,41,'90.00');
    await receipt(203,42,'40.00'); await receipt(204,44,'500.00',{polo:3});
    const initialTitles = await value('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c');
    await t.test('one immutable document per class/student includes every enrollment and backend total',async()=>{
      first=await prepare(); assert.equal(first.data.documentCount,1); assert.equal(first.data.receiptCount,2);
      assert.equal(first.data.totalAmount,'125.30'); assert.equal(first.data.documentIds.length,1);
      assert.deepEqual(first.scope,{contextKey:scope.context,poloId:scope.polo,environment:scope.environment,month:scope.month});
      assert.equal(await value('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c').then(JSON.stringify),JSON.stringify(initialTitles));
      const snapshot=await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[first.data.documentIds[0]]);
      assert.equal(snapshot.issuer.cnpj,'00.000.000/0002-00'); assert.equal(snapshot.issuer.legalName,null);
      assert.equal(snapshot.issuer.address.city,'Cidade própria'); assert.equal(snapshot.issuer.address.street,null);
      assert.equal(snapshot.recipient.name,'ALUNO ALFA SINTÉTICO'); assert.equal(snapshot.recipient.confirmed,false);
      assert.equal(snapshot.financial.paymentMonth,'2026-11'); assert.equal(snapshot.financial.totalAmount,'125.30');
      assert.equal(snapshot.service.description,'Curso REF. novembro de 2026');
      assert.equal(snapshot.service.competence,null); assert.equal(snapshot.service.serviceDate,null);
      assert.equal(snapshot.fiscalReadiness.ready,false);
      assert(snapshot.fiscalReadiness.blockingReasons.includes('RECIPIENT_DOCUMENT_REQUIRED'));
      assert.deepEqual(snapshot.financial.receipts.map(r=>r.receiptId),[id(200),id(201)]);
      assert.equal(snapshot.financial.receipts[0].receivedAmount,'100.10');
    });
    await t.test('exact request replay does not read payments or repeat reservations',async()=>{
      const before=await counts(); await db.exec("SET test.source_blocked='true'");
      assert.deepEqual(await prepare(),first); await db.exec("SET test.source_blocked='false'");
      assert.deepEqual(await counts(),before);
      for(const input of [{ids:[candidate(21,31)]},{version:2},{paymentMonth:'2026-10'}])
        await assert.rejects(prepare({},input),e=>e.code==='22023');
    });
    await t.test('overlap rejects the whole batch, never a partial total or new candidate',async()=>{
      const before=await counts();
      await assert.rejects(prepare({}, {request:id(101),ids:[candidate(20,30),candidate(21,31)]}),e=>e.code==='23505');
      assert.deepEqual(await counts(),before);
      await receipt(205,40,'1.00');
      await assert.rejects(prepare({}, {request:id(102)}),e=>e.code==='23505');
      assert.equal((await list()).data.totalAmount,'125.30');
    });
    await t.test('reservations are isolated by fiscal environment',async()=>{
      const production=await prepare({environment:'PRODUCAO'},{request:id(103),model:id(61)});
      assert.equal(production.data.totalAmount,'126.30'); assert.equal(production.data.receiptCount,3);
      assert.equal((await list({environment:'PRODUCAO'})).data.totalItems,1);
      assert.equal((await list({month:'2026-11'})).data.totalItems,0);
    });
    await t.test('snapshots and totals survive subsequent name/model/payment changes',async()=>{
      await db.exec(`UPDATE public.parceiros SET nome='Nome posterior' WHERE id='${id(30)}';
        UPDATE private.nfse_models SET definition=definition || '{"name":"Modelo posterior"}',version=2 WHERE id='${id(60)}';
        UPDATE public.contas_receber SET valor_pago=900 WHERE id='${id(200)}'`);
      const rows=(await list()).data.rows;
      assert.equal(rows[0].studentName,'ALUNO ALFA SINTÉTICO'); assert.equal(rows[0].modelLabel,'Modelo sintético');
      assert.equal(rows[0].amount,'125.30'); assert.deepEqual(await prepare(),first);
      await assert.rejects(prepare({}, {request:id(104),ids:[candidate(21,31)]}),e=>e.code==='40001');
    });
    await t.test('revoked context, foreign polo and anonymous identity fail before replay or source reads',async()=>{
      await db.exec("SET test.source_blocked='true'; UPDATE public.test_context SET allowed=false");
      await assert.rejects(prepare(),e=>e.code==='42501'); await assert.rejects(list(),e=>e.code==='42501');
      await db.exec('UPDATE public.test_context SET allowed=true');
      await assert.rejects(prepare({context:id(99)}),e=>e.code==='42501');
      await assert.rejects(prepare({polo:id(3)}),e=>e.code==='42501');
      await db.exec("SET test.actor=''"); await assert.rejects(prepare(),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'; SET test.source_blocked='false'`);
    });
    await t.test('partial component identity retains physical source/event and never uses title face value',async()=>{
      await receipt(210,41,'0',{status:'PENDENTE'}); await event(310,210,410,1234);
      await db.query('INSERT INTO public.financial_payment_components VALUES($1,$2,$3)',[id(411),id(310),4566]);
      const result=await prepare({}, {request:id(110),ids:[candidate(21,31)],version:2});
      assert.equal(result.data.totalAmount,'148.00'); assert.equal(result.data.receiptCount,3);
      const reservations=await db.query(`SELECT receipt_id,source_receivable_id,payment_event_id,amount::text
        FROM private.nfse_receipt_reservations WHERE document_id=$1 ORDER BY receipt_id`,[result.data.documentIds[0]]);
      assert.deepEqual(reservations.rows.map(r=>r.receipt_id),[id(202),id(410),id(411)]);
      assert.equal(reservations.rows[1].source_receivable_id,id(210));
      assert.equal(reservations.rows[1].payment_event_id,id(310)); assert.equal(reservations.rows[1].amount,'12.34');
      assert.equal((await list()).data.totalAmount,'273.30');
    });
    await t.test('legacy-to-components conversion cannot invoice a previously reserved source again',async()=>{
      await event(320,200,420,10010);
      await assert.rejects(prepare({}, {request:id(111),version:2}),e=>e.code==='23505');
    });
    await t.test('component-to-legacy fallback after reversal also remains reserved',async()=>{
      await db.exec(`UPDATE public.financial_payment_events SET reversed_at=now() WHERE id='${id(310)}';
        UPDATE public.contas_receber SET status='PAGO',valor_pago=58,data_pagamento='2026-11-09' WHERE id='${id(210)}'`);
      await assert.rejects(prepare({}, {request:id(112),ids:[candidate(21,31)],version:2}),e=>e.code==='23505');
    });
    await t.test('foreign/stale candidate and duplicate IDs reject every write',async()=>{
      const before=await counts();
      for(const ids of [[candidate(22,30)],[candidate(20,99)],[candidate(20,32),candidate(20,99)],
        [candidate(20,32),candidate(20,32)],['invalid'],[null],[]])
        await assert.rejects(prepare({}, {request:id(113),ids,version:2}),e=>['22023','40001'].includes(e.code));
      assert.deepEqual(await counts(),before);
    });
    await t.test('read-only queue exposes snapshots labels and exact totals without raw fiscal data',async()=>{
      const result=await list({},'TODOS',2,1);
      assert.equal(result.data.totalItems,2); assert.equal(result.data.rows.length,1);
      assert.equal(result.data.totalAmount,'273.30'); assert.equal(result.data.providerEnabled,false);
      assert.deepEqual(result.data.summary,{preparedCount:2,preparedAmount:'273.30'});
      const row=result.data.rows[0]; assert.equal(row.status,'PREPARADO');
      for(const key of ['snapshot','cnpj','document','accessKey','number','xml','recipient']) assert(!(key in row));
      await db.exec('BEGIN READ ONLY'); assert.equal((await list()).data.totalItems,2); await db.exec('ROLLBACK');
      for(const [status,page,size] of [['EMITIDA',1,25],['PREPARADO',0,25],['PREPARADO',1,101]])
        await assert.rejects(list({},status,page,size),e=>e.code==='22023');
    });
    await t.test('failed reservation rolls back the batch and every document/claim',async()=>{
      const before=await counts();
      await db.exec(`CREATE FUNCTION private.test_reservation_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN RAISE EXCEPTION 'SYNTHETIC_FAILURE'; END$$;
        CREATE TRIGGER test_reservation_failure BEFORE INSERT ON private.nfse_receipt_reservations
        FOR EACH ROW EXECUTE FUNCTION private.test_reservation_failure()`);
      await assert.rejects(prepare({}, {request:id(114),ids:[candidate(20,32)],version:2}),/SYNTHETIC_FAILURE/);
      assert.deepEqual(await counts(),before);
      await db.exec('DROP TRIGGER test_reservation_failure ON private.nfse_receipt_reservations');
    });
    await t.test('non-cent receipts and inactive models cannot be prepared',async()=>{
      await db.exec(`UPDATE public.contas_receber SET valor_pago=40.001 WHERE id='${id(203)}'`);
      await assert.rejects(prepare({}, {request:id(115),ids:[candidate(20,32)],version:2}),e=>e.code==='40001');
      await db.exec(`UPDATE public.contas_receber SET valor_pago=40 WHERE id='${id(203)}';
        UPDATE private.nfse_models SET definition=definition || '{"active":false}' WHERE id='${id(60)}'`);
      await assert.rejects(prepare({}, {request:id(115),ids:[candidate(20,32)],version:2}),e=>e.code==='40001');
      await db.exec(`UPDATE private.nfse_models SET definition=definition || '{"active":true}' WHERE id='${id(60)}'`);
    });
    await t.test('financing is excluded by physical source even for an effective component',async()=>{
      await db.exec(`INSERT INTO public.emprestimos_financeiros VALUES('${id(203)}')`);
      await event(330,203,430,4000);
      // The current selector can show the effective loan component alongside a
      // legitimate receipt. Preparation must refuse, never shrink that amount.
      await receipt(221,42,'5.00');
      await assert.rejects(prepare({}, {request:id(116),ids:[candidate(20,32)],version:2}),e=>e.code==='40001');
      await db.exec(`DELETE FROM public.contas_receber WHERE id='${id(221)}'`);
      await db.exec(`DELETE FROM public.emprestimos_financeiros WHERE conta_receber_id='${id(203)}'`);
    });
    await t.test('an inconsistent effective source cannot shrink a mixed candidate total',async()=>{
      await receipt(222,42,'0',{status:'PENDENTE'}); await event(332,222,432,1000);
      await db.exec(`UPDATE public.financial_payment_events SET polo_id='${id(3)}' WHERE id='${id(332)}'`);
      const shown=await value(`SELECT public.get_nfse_receipt_students_secure($1,$2,'2026-11-01',NULL,NULL,NULL,1,1,$3,false) value`,
        [scope.context,scope.polo,[candidate(20,32)]]);
      assert.equal(shown.selection.selectedAmount,'50.00');
      const before=await counts();
      await assert.rejects(prepare({}, {request:id(118),ids:[candidate(20,32)],version:2}),e=>e.code==='40001');
      assert.deepEqual(await counts(),before);
      await db.exec(`DELETE FROM public.financial_payment_components WHERE id='${id(432)}';
        DELETE FROM public.financial_payment_events WHERE id='${id(332)}'; DELETE FROM public.contas_receber WHERE id='${id(222)}'`);
    });
    await t.test('authenticated multi-student batch returns two exact documents and order-independent replay',async()=>{
      await db.exec(`INSERT INTO public.parceiros(id,nome,tipo) VALUES('${id(33)}','ALUNO DELTA SINTÉTICO','Aluno');
        INSERT INTO public.matriculas VALUES('${id(45)}','${id(33)}','${id(21)}')`);
      await receipt(220,45,'17.35');
      const before=await counts();
      await db.exec('SET ROLE authenticated');
      const input={request:id(117),ids:[candidate(21,33),candidate(20,32)],version:2};
      const result=await prepare({},input);
      assert.equal(result.data.documentCount,2); assert.equal(result.data.receiptCount,2);
      assert.equal(result.data.totalAmount,'57.35');
      assert.deepEqual(await prepare({}, {...input,ids:[...input.ids].reverse()}),result);
      assert.equal((await list()).data.totalItems,4);
      await db.exec('RESET ROLE');
      const after=await counts(); assert.equal(after.batches,before.batches+1);
      assert.equal(after.documents,before.documents+2); assert.equal(after.claims,before.claims+2);
      assert.equal(after.titles,before.titles); assert.equal(after.events,before.events);
      const snapshots=await db.query('SELECT amount::text,snapshot FROM private.nfse_queue_documents WHERE batch_id=$1 ORDER BY amount',
        [result.data.id]);
      assert.deepEqual(snapshots.rows.map(r=>r.amount),['17.35','40.00']);
    });
    await t.test('transaction isolation cannot retain a stale reservation snapshot after waiting for a lock',async()=>{
      await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await assert.rejects(prepare(),e=>e.code==='25001');
      await db.exec('ROLLBACK');
    });
    await t.test('private records are immutable and only guarded public RPCs are executable',async()=>{
      for(const table of ['nfse_preparation_batches','nfse_queue_documents','nfse_receipt_reservations']) {
        await assert.rejects(db.exec(`DELETE FROM private.${table}`),e=>e.code==='55000');
        await assert.rejects(db.exec(`UPDATE private.${table} SET created_at=now()`),e=>e.code==='55000');
        const acl=await value(`SELECT jsonb_build_object('rls',relrowsecurity,'read',has_table_privilege('authenticated',oid,'SELECT'),
          'write',has_table_privilege('authenticated',oid,'INSERT')) value FROM pg_class WHERE oid=$1::regclass`,[`private.${table}`]);
        assert.deepEqual(acl,{rls:true,read:false,write:false});
      }
      for(const signature of ['public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text)',
        'public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer)']) {
        const acl=await value(`SELECT jsonb_build_object('anon',has_function_privilege('anon',$1,'EXECUTE'),
          'auth',has_function_privilege('authenticated',$1,'EXECUTE'),'service',has_function_privilege('service_role',$1,'EXECUTE'),
          'definer',prosecdef,'path',proconfig @> ARRAY['search_path=""']) value FROM pg_proc WHERE oid=$1::regprocedure`,[signature]);
        assert.deepEqual(acl,{anon:false,auth:true,service:false,definer:true,path:true});
      }
    });
    const remove = (ids,request=id(700),changes={}) => value(
      'SELECT public.remove_nfse_queue_documents_secure($1,$2,$3,$4,$5,$6) value',
      [...Object.values({...scope,...changes}),request,ids]);
    const removalCounts = () => value(`SELECT jsonb_build_object(
      'requests',(SELECT count(*) FROM private.nfse_queue_removal_requests),
      'removed',(SELECT count(*) FROM private.nfse_queue_removals),
      'events',(SELECT count(*) FROM public.nfse_queue_change_events)) value`);
    const immutableState = () => value(`SELECT jsonb_build_object(
      'documents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.nfse_queue_documents t),
      'batches',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.nfse_preparation_batches t),
      'claims',(SELECT jsonb_agg(to_jsonb(t) ORDER BY document_id,receipt_id) FROM private.nfse_receipt_reservations t),
      'titles',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.contas_receber t),
      'payments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.financial_payment_events t)) value`);
    const targetRows=(await list()).data.rows.filter(row=>[id(32),id(33)].includes(row.studentId));
    const targets=targetRows.map(row=>row.id);
    assert.equal(targets.length,2);
    let removed;
    await t.test('removal rejects empty, repeated, foreign or partially stale selections atomically',async()=>{
      const before=await removalCounts();
      for(const ids of [[],null,[null],[targets[0],targets[0]],Array.from({length:101},(_,i)=>id(800+i))])
        await assert.rejects(remove(ids),e=>e.code==='22023');
      for(const ids of [[id(999)],[targets[0],id(999)]])
        await assert.rejects(remove(ids),e=>e.code==='40001');
      for(const changes of [{month:'2026-10'},{environment:'PRODUCAO'}])
        await assert.rejects(remove(targets,id(700),changes),e=>e.code==='40001');
      await assert.rejects(remove(targets,id(700),{polo:id(3)}),e=>e.code==='42501');
      assert.deepEqual(await removalCounts(),before);
      assert.equal((await list()).data.totalItems,4);
    });
    await t.test('a ready or future issued document is rejected, not fiscally cancelled',async()=>{
      await db.exec('BEGIN; ALTER TABLE private.nfse_queue_documents DISABLE TRIGGER nfse_queue_immutable');
      await db.query(`UPDATE private.nfse_queue_documents SET snapshot=jsonb_set(snapshot,'{fiscalReadiness,ready}','true') WHERE id=$1`,[targets[0]]);
      await assert.rejects(remove(targets),e=>e.code==='40001');
      await db.exec('ROLLBACK');
      await db.exec(`BEGIN; ALTER TABLE private.nfse_queue_documents DROP CONSTRAINT nfse_queue_documents_status_check;
        ALTER TABLE private.nfse_queue_documents DISABLE TRIGGER nfse_queue_immutable`);
      await db.query("UPDATE private.nfse_queue_documents SET status='EMITIDA' WHERE id=$1",[targets[0]]);
      await assert.rejects(remove(targets),e=>e.code==='40001');
      await db.exec('ROLLBACK');
    });
    await t.test('two removals preserve every original record and update backend count/total',async()=>{
      const before=await immutableState();
      const eventsBefore=(await removalCounts()).events;
      await db.exec('SET ROLE authenticated');
      removed=await remove(targets);
      assert.equal(removed.data.removedCount,2);
      assert.deepEqual(removed.data.documentIds,[...targets].sort());
      assert.deepEqual(removed.data.paymentMonths,['2026-11']);
      assert.equal((await list()).data.totalItems,2);
      assert.equal((await list()).data.totalAmount,'273.30');
      await db.exec('RESET ROLE');
      assert.deepEqual(await immutableState(),before);
      assert.equal((await removalCounts()).events,eventsBefore+1);
    });
    await t.test('replay is exact and order independent without another realtime event',async()=>{
      const before=await removalCounts();
      assert.deepEqual(await remove([...targets].reverse()),removed);
      await assert.rejects(remove([targets[0]]),e=>e.code==='22023');
      assert.deepEqual(await removalCounts(),before);
      // Another operator cannot partially remove a mixed already-removed batch.
      await assert.rejects(remove([targets[0],first.data.documentIds[0]],id(701)),e=>e.code==='40001');
      assert.equal((await list()).data.totalItems,2);
    });
    await t.test('current permission is mandatory before removal replay',async()=>{
      await db.exec(`UPDATE public.test_context SET allowed=false WHERE id='${scope.context}'`);
      await assert.rejects(remove(targets),e=>e.code==='42501');
      await db.exec('SET ROLE authenticated');
      assert.equal(await value('SELECT count(*)::int value FROM public.nfse_queue_change_events'),0);
      await db.exec('RESET ROLE');
      await db.exec(`UPDATE public.test_context SET allowed=true WHERE id='${scope.context}'`);
      await db.exec("SET test.actor=''");
      await assert.rejects(remove(targets),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);
    });
    await t.test('released receipts can be prepared again while historical claims remain immutable',async()=>{
      const oldClaims=(await counts()).claims;
      const regenerated=await prepare({}, {request:id(702),ids:[candidate(21,33),candidate(20,32)],version:2});
      assert.equal(regenerated.data.documentCount,2);
      assert(regenerated.data.documentIds.every(document=>!targets.includes(document)));
      assert.equal((await counts()).claims,oldClaims+2);
      assert.equal((await list()).data.totalItems,4);
      await assert.rejects(prepare({}, {request:id(703),ids:[candidate(21,33)],version:2}),e=>e.code==='23505');
      await assert.rejects(remove(regenerated.data.documentIds,id(704),{environment:'PRODUCAO'}),e=>e.code==='40001');
    });
    await t.test('a failed removal rolls back audit, marker and realtime event together',async()=>{
      const before=await removalCounts();
      await db.exec(`CREATE FUNCTION private.fail_test_removal() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN RAISE EXCEPTION 'SYNTHETIC_REMOVAL_FAILURE'; END$$;
        CREATE TRIGGER test_removal_failure BEFORE INSERT ON private.nfse_queue_removals
        FOR EACH ROW EXECUTE FUNCTION private.fail_test_removal()`);
      await assert.rejects(remove([first.data.documentIds[0]],id(705)),/SYNTHETIC_REMOVAL_FAILURE/);
      assert.deepEqual(await removalCounts(),before);
      await db.exec('DROP TRIGGER test_removal_failure ON private.nfse_queue_removals');
    });
    await t.test('removal and original records stay private and immutable; event has no financial payload',async()=>{
      for(const table of ['nfse_queue_removals','nfse_queue_removal_requests']) {
        await assert.rejects(db.exec(`DELETE FROM private.${table}`),e=>e.code==='55000');
        await assert.rejects(db.exec(`UPDATE private.${table} SET created_at=now()`),e=>e.code==='55000');
        assert.equal(await value("SELECT has_table_privilege('authenticated',$1,'SELECT') value",[`private.${table}`]),false);
      }
      const signature='public.remove_nfse_queue_documents_secure(uuid,uuid,text,text,uuid,uuid[])';
      assert.equal(await value("SELECT has_function_privilege('anon',$1,'EXECUTE') value",[signature]),false);
      assert.equal(await value("SELECT has_function_privilege('service_role',$1,'EXECUTE') value",[signature]),false);
      await db.exec('SET ROLE authenticated');
      const events=await value('SELECT jsonb_agg(to_jsonb(t)) value FROM public.nfse_queue_change_events t');
      assert(events.length>0);
      for(const event of events) assert.deepEqual(Object.keys(event).sort(),['created_at','environment','id','month','polo_id','version']);
      await assert.rejects(db.exec(`INSERT INTO public.nfse_queue_change_events(polo_id,environment,month)
        VALUES('${id(1)}','HOMOLOGACAO','2026-12')`),e=>e.code==='42501');
      await db.exec('RESET ROLE');
    });
    await t.test('stale transaction snapshots cannot release reservations',async()=>{
      await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await assert.rejects(remove(targets),e=>e.code==='25001');
      await db.exec('ROLLBACK');
    });
  } finally { await db.close(); }
});
