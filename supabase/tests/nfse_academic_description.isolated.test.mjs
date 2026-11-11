import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = [id(10), id(1), 'HOMOLOGACAO', '2026-12'];
const template = 'REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.';
const baseMigrations = ['20261108225453_nfse_models_private_store.sql','20261108225236_nfse_receipt_amount_projection.sql',
  '20261108233250_nfse_model_reference_month.sql','20261109020017_nfse_academic_queue_store.sql',
  '20261109020019_nfse_academic_queue_prepare.sql','20261109020021_nfse_academic_queue_reads.sql',
  '20261110132800_nfse_queue_logical_removal.sql','20261110132801_nfse_queue_realtime.sql',
  '20261110190702_nfse_fiscal_review_store.sql','20261110190706_nfse_fiscal_review_rpc.sql'];

test('academic descriptions freeze the exact selected enrollment and effective receipts', async t => {
  const db = new PGlite();
  const value = async (query, args = []) => (await db.query(query, args)).rows[0].value;
  const prepare = (request, classId = 20) => value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
    [...scope,id(request),[`${id(classId)}:${id(30)}`],id(60),'2026-11']);
  const financial = () => value(`SELECT jsonb_build_object('titles',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.contas_receber c),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.financial_payment_events e)) value`);
  const render = (text, context) => value('SELECT private.render_nfse_academic_description($1,$2) value',[text,context]);
  const receipt = (receiptId, enrollment, parcel, date = '2026-11-08') => db.query(`INSERT INTO public.contas_receber
    (id,polo_id,matricula_id,status,data_pagamento,data_vencimento,valor,valor_pago,descricao,parcela_numero,tipo_lancamento)
    VALUES($1,$2,$3,'PAGO',$4,'2026-09-10',100,100,'Texto livre não autoriza inferir parcela', $5,'PARCELA')`,[id(receiptId),id(1),id(enrollment),date,parcel]);
  let historical, prepared, context, snapshot;
  try {
    await db.exec(await readFile(new URL('./nfse_academic_queue.fixture.sql',import.meta.url),'utf8'));
    await db.exec(`ALTER TABLE public.matriculas ADD COLUMN data_matricula timestamptz;
      ALTER TABLE public.contas_receber ADD COLUMN parcela_numero integer, ADD COLUMN tipo_lancamento text;
      ALTER TABLE public.parceiros ADD COLUMN status text DEFAULT 'ativo', ADD COLUMN polo_id uuid, ADD COLUMN polo_ids uuid[];
      CREATE TABLE public.documentos_templates(id text PRIMARY KEY,conteudo jsonb);
      CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,definition jsonb,version integer);
      CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,service_date date,status text,
        model_id uuid,model_snapshot jsonb,partner_id uuid,amount numeric,service_description text,receivable_id uuid);
      INSERT INTO public.documentos_templates VALUES('academicos_config','{"matriculaPrefix":"SYN-","matriculaDigits":4,"yearFormat":"yy","usePoloCode":false}');
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.polos(id,status,nome,cnpj) VALUES('${id(1)}','ativo','UNIDADE SINTÉTICA','00.000.000/0001-91');
      INSERT INTO public.cursos VALUES('${id(4)}','Técnico em Enfermagem sintético','TECNICO'),('${id(5)}','Curso EAD sintético','EAD');
      INSERT INTO public.turmas VALUES('${id(20)}','${id(1)}','${id(4)}','T-SYN','Turma escolhida'),
        ('${id(21)}','${id(1)}','${id(5)}','E-SYN','Outra turma');
      INSERT INTO public.parceiros(id,nome,tipo,polo_id,cpf_cnpj) VALUES('${id(30)}','ALUNO SINTÉTICO','Aluno','${id(1)}','00000000191');
      INSERT INTO public.matriculas VALUES('${id(39)}','${id(30)}','${id(21)}','2025-02-01Z'),
        ('${id(40)}','${id(30)}','${id(20)}','2026-02-01Z'),('${id(42)}','${id(30)}','${id(20)}','2026-03-01Z');
      SET test.actor='${id(11)}';`);
    const formatter = await sql('20260621173000_secure_validator_identity_fields.sql');
    await db.exec(formatter.slice(0,formatter.indexOf('CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo')));
    for (const name of baseMigrations) await db.exec(await sql(name));
    await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      VALUES($1,$2,'HOMOLOGACAO',$3,$4,$4)`,[id(60),id(1),{name:'MODELO FISCAL SINTÉTICO',active:true,
      nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:'SERVIÇOS EDUCACIONAIS',
      serviceOptions:{includeIbsCbs:true},valuesOptions:{ibscbs:{cst:'000',classificationCode:'000001'}}},id(11)]);
    await db.exec(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      SELECT '${id(61)}',polo_id,'PRODUCAO',definition,created_by,updated_by FROM private.nfse_models WHERE id='${id(60)}';
      INSERT INTO private.nfse_configurations VALUES('${id(1)}','PRODUCAO',
        '{"municipalityCode":"2803401","municipalRegistration":"","opSimpNac":"3","regApTribSN":"1","regEspTrib":"0"}',1);`);
    await receipt(199,39,8);
    historical = await prepare(89,21);
    const old = await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[historical.data.documentIds[0]]);
    for (const name of ['20261111013732_nfse_academic_description_render.sql','20261111013738_nfse_academic_description_context.sql',
      '20261111013745_nfse_academic_description_prepare.sql','20261111013752_nfse_academic_description_reads.sql']) await db.exec(await sql(name));
    await receipt(200,40,3); await receipt(201,42,4);
    await db.exec(`INSERT INTO public.financial_payment_events VALUES('${id(300)}','RECEIVABLE','${id(200)}','${id(1)}','2026-11-09',NULL);
      INSERT INTO public.financial_payment_components VALUES('${id(400)}','${id(300)}',4000),('${id(401)}','${id(300)}',6000);`);
    const before = await financial();
    await t.test('new preparation captures exact course, enrollment numbers, installments and effective payment dates', async () => {
      prepared = await prepare(90);
      assert.match(prepared.data.message,/revisão fiscal e a prévia/);
      assert(!prepared.data.message.includes('desabilitada'));
      snapshot = await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[prepared.data.documentIds[0]]);
      context = snapshot.academic.descriptionContext;
      assert.equal(snapshot.version,2); assert.equal(context.courseName,'Técnico em Enfermagem sintético');
      assert.equal(context.courseType,'TECNICO'); assert.equal(snapshot.academic.courseType,'TECNICO');
      assert.deepEqual(context.entries.map(e => e.receiptId),[id(201),id(400),id(401)]);
      assert.deepEqual([...new Set(context.entries.map(e => e.enrollmentId))],[id(42),id(40)]);
      assert.deepEqual(context.entries.map(e => e.enrollmentNumber),['SYN-260066','SYN-260064','SYN-260064']);
      assert.deepEqual(context.entries.map(e => e.installmentNumber),[4,3,3]);
      assert.deepEqual(context.entries.map(e => e.paymentDate),['2026-11-08','2026-11-09','2026-11-09']);
      assert(!snapshot.service.description.includes('EAD')); assert(!snapshot.service.description.includes('SYN-250039'));
      assert.equal((snapshot.service.description.match(/nº 3/g)||[]).length,1,'Partial components identify one installment');
      assert.match(snapshot.service.description,/SERVIÇOS EDUCACIONAIS\nREFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO Técnico/);
      assert(!snapshot.service.description.includes('curso técnico Técnico'));
      assert.equal(snapshot.model.serviceOptions.includeIbsCbs,true); assert.equal(snapshot.model.valuesOptions.ibscbs.cst,'000');
      assert.deepEqual(await financial(),before); assert.equal(prepared.data.totalAmount,'200.00');
    });
    await t.test('review shows frozen canonical description; old untransmitted preparations require safe re-preparation', async () => {
      const review=await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',
        [...scope,prepared.data.documentIds[0]]);
      assert.equal(review.data.service.description,snapshot.service.description);
      assert(!review.data.checks.some(c=>c.code==='ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED'));
      assert(!review.data.checks.some(c=>['REAL_EMISSION_NOT_ENABLED','EXTERNAL_HABILITATION_UNCONFIRMED'].includes(c.code)));
      const legacy=await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',
        [...scope,historical.data.documentIds[0]]);
      const pending=legacy.data.checks.find(c=>c.code==='ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED');
      assert.equal(pending.status,'BLOCKED'); assert.match(pending.message,/prepare novamente/);
      assert.equal(legacy.data.reviewComplete,false); assert.equal(legacy.data.service.description,old.service.description);
    });
    await t.test('production bridge uses reviewed frozen academic facts, including payment month rather than competence month', async () => {
      const prodScope=[id(10),id(1),'PRODUCAO','2026-12'];
      const production=await value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
        [...prodScope,id(92),[`${id(20)}:${id(30)}`],id(61),'2026-11']);
      const documentId=production.data.documentIds[0];
      const review=await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',[...prodScope,documentId]);
      assert(!review.data.checks.some(c=>['SOURCE_CHANGED','ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED'].includes(c.code)));
      await value('SELECT public.save_nfse_fiscal_review_secure($1,$2,$3,$4,$5,$6,0,$7,$8) value',
        [...prodScope,documentId,id(93),review.data.basisToken,{modelId:id(61),modelVersion:1,
          recipient:{mode:'STUDENT',confirmed:true},competenceDate:'2026-10-15',serviceDate:'2026-10-15',
          classificationConfirmed:true,receiptsConfirmed:true}]);
      const confirmed=await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',[...prodScope,documentId]);
      assert.equal(confirmed.data.reviewComplete,true);assert.equal(confirmed.data.reviewStatus,'CONFIRMED');
      assert.equal(confirmed.data.canTransmit,false,'Review RPC never supplies the executor dispatch capability');
      assert(confirmed.data.checks.every(check=>check.status==='PASSED'),'A complete review has no artificial global blocker');
      const basis=await value('SELECT private.nfse_queue_operation_basis($1,$2,$3,$4,$5) value',
        ['ACADEMIC_QUEUE',documentId,id(1),'PRODUCAO','2026-12']);
      assert.equal(basis.snapshot.source.serviceDescription,snapshot.service.description);
      assert.match(basis.snapshot.source.serviceDescription,/novembro de 2026/);
      assert(!basis.snapshot.source.serviceDescription.includes('outubro'));
      await db.query('UPDATE public.contas_receber SET parcela_numero=9 WHERE id=$1',[id(201)]);
      await assert.rejects(value('SELECT private.nfse_queue_operation_basis($1,$2,$3,$4,$5) value',
        ['ACADEMIC_QUEUE',documentId,id(1),'PRODUCAO','2026-12']),e=>e.code==='40001');
      await db.query('UPDATE public.contas_receber SET parcela_numero=4 WHERE id=$1',[id(201)]);
    });
    await t.test('exact replay and old snapshots stay unchanged after academic/model edits', async () => {
      await db.exec(`UPDATE public.cursos SET nome='Nome posterior' WHERE id='${id(4)}';
        UPDATE public.documentos_templates SET conteudo='{"matriculaPrefix":"CHANGED-"}';
        UPDATE public.matriculas SET data_matricula='2027-01-01Z' WHERE id='${id(40)}';`);
      await db.exec("SET test.source_blocked='true'");
      assert.deepEqual(await prepare(90),prepared); assert.deepEqual(await prepare(89,21),historical);
      await db.exec("SET test.source_blocked='false'");
      assert.deepEqual(await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[historical.data.documentIds[0]]),old);
      assert.deepEqual(await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[prepared.data.documentIds[0]]),snapshot);
      assert.equal(await render(template,context),snapshot.service.description.split('\n')[1]);
      const changed=await value('SELECT private.nfse_fiscal_review_basis($1,$2) value',[prepared.data.documentIds[0],id(60)]);
      assert(changed.issues.includes('SOURCE_CHANGED'),'Live enrollment/course edits require revalidation before dispatch');
    });
    await t.test('renderer handles multiple payment months and never substitutes fiscal competence', async () => {
      const multi = structuredClone(context); multi.entries[0].paymentDate='2026-10-08';
      const result=await render(template,multi);
      assert.match(result,/outubro de 2026/); assert.match(result,/novembro de 2026/); assert(!result.includes('dezembro'));
      assert.equal(await value('SELECT private.nfse_queue_description($1,$2,$3) value',[{academic:{descriptionContext:multi}},template,'2026-12']),result);
      assert.equal(await value('SELECT private.nfse_queue_description($1,$2,$3) value',[old,'Antigo {{mes_referencia}}','2026-11']),'Antigo novembro de 2026');
    });
    await t.test('unknown/incomplete variables and expanded overflow are explicit failures, never truncation', async () => {
      for (const text of ['{{nome}}', '{{curso}}', 'X'.repeat(1900)]) {
        await assert.rejects(render(text,context),e=>e.code==='22023');
      }
      await assert.rejects(render(template,{...context,entries:[{...context.entries[0],installmentLabel:null}]}),e=>e.code==='22023');
    });
    await t.test('missing structural installment or mismatched enrollment blocks atomically, without guessing from text', async () => {
      // New independent student/class avoids overlap with existing reservations.
      await db.exec(`INSERT INTO public.parceiros(id,nome,tipo) VALUES('${id(31)}','OUTRO ALUNO SINTÉTICO','Aluno');
        INSERT INTO public.matriculas VALUES('${id(43)}','${id(31)}','${id(20)}','2026-02-01Z');`);
      await receipt(202,43,null);
      const count=await value('SELECT count(*)::int value FROM private.nfse_queue_documents');
      const bad=()=>value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
        [...scope,id(91),[`${id(20)}:${id(31)}`],id(60),'2026-11']);
      await assert.rejects(bad(),e=>e.code==='22023'&&/parcela/.test(e.message));
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_queue_documents'),count);
      await db.query('UPDATE public.contas_receber SET parcela_numero=7 WHERE id=$1',[id(202)]);
      await db.query('UPDATE public.matriculas SET turma_id=$1 WHERE id=$2',[id(21),id(43)]);
      await assert.rejects(value('SELECT private.nfse_academic_description_context($1,$2,$3,$4) value',[id(1),id(20),id(31),
        [{receiptId:id(202),sourceReceivableId:id(202),enrollmentId:id(43),paymentDate:'2026-11-08'}]]),e=>e.code==='22023');
    });
    await t.test('preview is scoped and illustrative, not invented student data; Services keeps literal-only contract', async () => {
      const result=await value('SELECT public.preview_nfse_model_description_secure($1,$2,$3,$4,$5) value',[...scope,template]);
      assert.equal(result.data.requiresAcademicContext,true); assert.match(result.data.description,/\[curso da turma selecionada\]/);
      assert(!result.data.description.includes('SYN-')); assert(!result.data.description.includes('Técnico em Enfermagem'));
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(value('SELECT public.preview_nfse_model_description_secure($1,$2,$3,$4,$5) value',[...scope,template]),e=>e.code==='42501');
      const partnerSql=await sql('20261110212834_nfse_partner_service_description_2000.sql');
      assert.match(partnerSql,/position\('\{\{' IN v_description\) > 0/);
      assert.equal(await value('SELECT private.render_nfse_model_description($1,$2) value',['SERVIÇO LITERAL','2026-11']),'SERVIÇO LITERAL');
      assert.equal(await value("SELECT has_function_privilege('authenticated','private.nfse_academic_description_context(uuid,uuid,uuid,jsonb)','EXECUTE') value"),false);
      assert.doesNotMatch(await sql('20261111013745_nfse_academic_description_prepare.sql'),/FUNCTION public.get_nfse_queue_secure/,
        'Description preparation must not replace the current financial queue/operation projection');
    });
  } finally { await db.close(); }
});
