import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const template = 'REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.';
const body = (source,name) => {
  const start = source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.','\\.')}\\(`));
  assert(start>=0); return source.slice(start,source.indexOf('$function$;',source.indexOf('AS $function$',start))+12);
};

test('formal academic description uses real course, enrollment and payment facts when installment numbering is absent',async t => {
  const db = new PGlite();
  const value = async (query,args=[]) => (await db.query(query,args)).rows[0].value;
  const render = (text,context) => value('SELECT private.render_nfse_academic_description($1,$2) value',[text,context]);
  const receipts = (polo,month,student) => value('SELECT jsonb_agg(receipt_snapshot ORDER BY receipt_id) value FROM private.nfse_academic_receipts($1,$2,$3)',
    [id(polo),month,[`${id(20+polo)}:${id(student)}`]]);
  const context = async (polo,month,student) => value('SELECT private.nfse_academic_description_context($1,$2,$3,$4) value',
    [id(polo),id(20+polo),id(student),await receipts(polo,month,student)]);
  const prepare = (polo,month,student,request) => value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,7,$8) value',
    [id(10),id(polo),'PRODUCAO','2026-12',id(request),[`${id(20+polo)}:${id(student)}`],id(60),month]);
  const unchanged = () => value(`SELECT jsonb_build_object('titles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.contas_receber r),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.financial_payment_events e),
    'model',(SELECT to_jsonb(m) FROM private.nfse_models m WHERE id='${id(60)}')) value`);
  let known, knownBytes, before;
  try {
    await db.exec(await readFile(new URL('./nfse_academic_queue.fixture.sql',import.meta.url),'utf8'));
    await db.exec(`ALTER TABLE public.polos ADD COLUMN is_matriz boolean DEFAULT false;
      ALTER TABLE public.matriculas ADD COLUMN data_matricula timestamptz;
      ALTER TABLE public.contas_receber ADD COLUMN parcela_numero integer,ADD COLUMN tipo_lancamento text;
      CREATE TABLE public.documentos_templates(id text PRIMARY KEY,conteudo jsonb);
      INSERT INTO public.documentos_templates VALUES('academicos_config','{"matriculaPrefix":"SYN-","matriculaDigits":4,"yearFormat":"yy","usePoloCode":false}');
      CREATE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid) LANGUAGE sql IMMUTABLE AS $$SELECT NULL::uuid WHERE false$$;
      CREATE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT NULL::text$$;`);
    const formatter = await sql('20260621173000_secure_validator_identity_fields.sql');
    await db.exec(formatter.slice(0,formatter.indexOf('CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo')));
    for (const name of ['20261108225453_nfse_models_private_store.sql','20261108225236_nfse_receipt_amount_projection.sql',
      '20261108233250_nfse_model_reference_month.sql','20261109020017_nfse_academic_queue_store.sql',
      '20261109020019_nfse_academic_queue_prepare.sql','20261109020021_nfse_academic_queue_reads.sql',
      '20261110132800_nfse_queue_logical_removal.sql','20261110132801_nfse_queue_realtime.sql',
      '20261111013732_nfse_academic_description_render.sql','20261111013738_nfse_academic_description_context.sql']) await db.exec(await sql(name));
    await db.exec(body(await sql('20261111121000_nfse_shared_model_scope.sql'),'private.nfse_model_visible_to_polo'));
    await db.exec(body(await sql('20261111121002_nfse_shared_model_preparation.sql'),'public.prepare_nfse_batch_secure'));
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(2)}','${id(3)}']::uuid[]);
      INSERT INTO public.empresas VALUES('${id(9)}','EMPRESA SINTÉTICA','00.000.000/0001-91');
      INSERT INTO public.polos(id,status,company_id,nome,cnpj,is_matriz) VALUES
        ('${id(1)}','ativo','${id(9)}','MATRIZ SINTÉTICA','00.000.000/0001-91',true),
        ('${id(2)}','ativo','${id(9)}','FILIAL AQ SINTÉTICA','00.000.000/0002-72',false),
        ('${id(3)}','ativo','${id(9)}','FILIAL PF SINTÉTICA','00.000.000/0003-53',false);
      INSERT INTO public.cursos VALUES('${id(5)}','Curso técnico sintético','TECNICO');
      SET test.actor='${id(11)}';`);
    for (const [polo,student,receipt,day,number] of [[2,30,200,'2026-11-10',3],[3,31,201,'2026-10-08',null],[2,32,202,'2026-11-11',null]]) {
      await db.query("INSERT INTO public.turmas VALUES($1,$2,$3,'SYN','TURMA SINTÉTICA') ON CONFLICT DO NOTHING",[id(20+polo),id(polo),id(5)]);
      await db.query("INSERT INTO public.parceiros(id,nome,tipo,cpf_cnpj) VALUES($1,'ALUNO SINTÉTICO','Aluno','00000000191')",[id(student)]);
      await db.query("INSERT INTO public.matriculas VALUES($1,$2,$3,'2026-02-01Z')",[id(40+student),id(student),id(20+polo)]);
      await db.query(`INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,data_vencimento,valor,valor_pago,descricao,parcela_numero,tipo_lancamento)
        VALUES($1,$2,$3,'PAGO',$4,'2026-09-01',260,260,'Parcela99 em texto livre não é fonte de numeração',$5,'PARCELA')`,[id(receipt),id(polo),id(40+student),day,number]);
    }
    await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,version,created_by,updated_by)
      VALUES($1,$2,'PRODUCAO',$3,7,$4,$4)`,[id(60),id(1),{name:'MODELO ÚNICO SINTÉTICO',active:true,
      nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:template},id(11)]);
    known = await context(2,'2026-11',30); knownBytes = await render(template,known);
    await db.query('UPDATE public.contas_receber SET parcela_numero=NULL WHERE id=$1',[id(200)]);
    before = await unchanged();
    await db.exec(await sql('20261112015247_nfse_academic_description_optional_installment.sql'));
    await t.test('complete historical contexts retain identical description bytes and known fees stay exact',async () => {
      assert.equal(await render(template,known),knownBytes);
      for (const label of ['taxa de matrícula','taxa de rematrícula']) {
        const fee = globalThis.structuredClone(known);fee.entries[0].installmentLabel=label;
        const result = await render(template,fee); assert(result.includes(label));assert(!result.includes('DATA(S) DE PAGAMENTO:'));
      }
    });
    await t.test('new AQ/PF preparations freeze factual fallback without modifying model v7 or finance',async () => {
      for (const [polo,month,student,request,day] of [[2,'2026-11',30,100,'10/11/2026'],[3,'2026-10',31,101,'08/10/2026']]) {
        const result = await prepare(polo,month,student,request);
        const snapshot = await value('SELECT snapshot value FROM private.nfse_queue_documents WHERE id=$1',[result.data.documentIds[0]]);
        const entry = snapshot.academic.descriptionContext.entries[0];
        assert.equal(entry.installmentNumber,null); assert.equal(entry.installmentLabel,null);
        assert.equal(snapshot.model.id,id(60));assert.equal(snapshot.model.version,7);
        assert.equal(snapshot.model.serviceDescription,template);
        assert(snapshot.service.description.includes('Curso técnico sintético'));
        assert(snapshot.service.description.includes(entry.enrollmentNumber));assert(snapshot.service.description.includes(day));
        assert(!snapshot.service.description.includes('MENSALIDADE(S)/PARCELA(S):'));
        assert(!snapshot.service.description.includes('nº 99'));assert(!snapshot.service.description.includes('09/2026'));
        assert(!snapshot.service.description.includes('{{'));
        await db.exec("SET test.source_blocked='true'");assert.deepEqual(await prepare(polo,month,student,request),result);
        await db.exec("SET test.source_blocked='false'");
        await assert.rejects(prepare(polo,month==='2026-11'?'2026-10':'2026-11',student,request),e=>e.code==='22023');
        await assert.rejects(prepare(polo,month,student===30?32:30,request),e=>e.code==='22023');
      }
      assert.deepEqual(await unchanged(),before);
    });
    await t.test('mixed labels keep known ordinals attached to their own enrollment, with actual dates for unknown entries',async () => {
      const missing = await context(2,'2026-11',32), mixed = { ...known,entries:[known.entries[0],missing.entries[0]] };
      const result = await render(template,mixed);
      assert(result.includes(`nº 3 — matrícula ${known.entries[0].enrollmentNumber} (pagamento em novembro de 2026)`));
      assert(!result.includes(`nº 3 — matrícula ${missing.entries[0].enrollmentNumber}`));
      assert(result.includes(`DATA(S) DE PAGAMENTO: matrícula ${missing.entries[0].enrollmentNumber} — 11/11/2026`));
      assert.equal((result.match(/nº 3/g)||[]).length,1);
    });
    await t.test('literal and custom academic templates preserve text without manufacturing an installment',async () => {
      const missing = await context(2,'2026-11',32);
      const custom = 'TEXTO FORMAL {{curso}}; matrícula {{matricula}}; referência {{parcelas}}; pagamentos {{meses_pagamento}}.';
      const rendered = await render(custom,missing);
      assert(rendered.startsWith('TEXTO FORMAL Curso técnico sintético'));
      assert(rendered.includes('pagamentos identificados por matrícula e data'));assert(!rendered.includes('nº'));
      assert((await render('SERVIÇOS EDUCACIONAIS',missing)).startsWith('SERVIÇOS EDUCACIONAIS'));
      assert((await render('Curso {{curso}}; matrícula {{matricula}}; pagamento {{meses_pagamento}}.',missing)).includes('11/11/2026'));
      await assert.rejects(render('Curso {{curso}}; matrícula {{matricula}}; pagamento {{meses_pagamento}}.',known),e=>e.code==='22023');
    });
    await t.test('missing enrollment/date, foreign sources, invalid variables and 2000-character overflow still fail',async () => {
      const missing = await context(2,'2026-11',32);
      for (const patch of [{enrollmentNumber:null},{paymentDate:null},{paymentDate:'2026-02-30'}]) {
        await assert.rejects(render(template,{...missing,entries:[{...missing.entries[0],...patch}]}));
      }
      await assert.rejects(render('{{nome}}',missing),e=>e.code==='22023');
      await assert.rejects(render('X'.repeat(1900),missing),e=>e.code==='22023');
      await assert.rejects(value('SELECT private.nfse_academic_description_context($1,$2,$3,$4) value',
        [id(3),id(22),id(32),await receipts(2,'2026-11',32)]),e=>e.code==='40001');
      await assert.rejects(value('SELECT private.nfse_academic_description_context($1,$2,$3,$4) value',
        [id(2),id(22),id(30),await receipts(2,'2026-11',32)]),e=>e.code==='22023');
      assert.deepEqual(await unchanged(),before);
    });
    await t.test('illustrative preview explains conditional numbering and stays authorized, private helpers are not RPCs',async () => {
      const result = await value('SELECT public.preview_nfse_model_description_secure($1,$2,$3,$4,$5) value',
        [id(10),id(2),'PRODUCAO','2026-12',template]);
      assert.match(result.data.description,/quando informadas/);assert.match(result.data.description,/datas reais quando não houver parcela/);
      assert.equal(result.data.requiresAcademicContext,true);assert(!result.data.description.includes('SYN-'));
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(value('SELECT public.preview_nfse_model_description_secure($1,$2,$3,$4,$5) value',
        [id(10),id(2),'PRODUCAO','2026-12',template]),e=>e.code==='42501');
      for (const signature of ['private.nfse_academic_description_context(uuid,uuid,uuid,jsonb)','private.render_nfse_academic_description(text,jsonb)']) {
        assert.equal(await value("SELECT has_function_privilege('authenticated',$1,'EXECUTE') value",[signature]),false);
      }
    });
    await t.test('generated ASCII separators pass the actual XML builder without rewriting captured snapshots',async () => {
      const missing = await context(2,'2026-11',32), mixed = { ...known,entries:[known.entries[0],missing.entries[0]] };
      const old = await render(template,missing);
      const history = await value('SELECT jsonb_agg(snapshot ORDER BY id) value FROM private.nfse_queue_documents');
      const entry = file => JSON.stringify(fileURLToPath(new URL(`../functions/${file}`,import.meta.url)));
      const result = await build({stdin:{contents:`
        export { xmlText } from ${entry('_shared/nfse-national/xml.ts')};
        export { buildNationalDps } from ${entry('_shared/nfse-national/dps.ts')};
        export { buildIndividualDps } from ${entry('nfse-national-individual/adapter.ts')};
        export { reviewedDeclaredIbsFixture } from ${entry('nfse-national-individual/adapter.fixture.ts')};`,loader:'ts',
        resolveDir:fileURLToPath(new URL('../../',import.meta.url))},
        bundle:true,write:false,platform:'node',format:'esm'});
      const fiscal = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
      assert.throws(()=>fiscal.xmlText(old),e=>e.code==='UNSUPPORTED_XML_TEXT');
      await db.exec(await sql('20261112025318_nfse_academic_description_latin1_separators.sql'));
      for (const facts of [missing,mixed]) {
        const description = await render(template,facts);
        assert([...description].every(char=>char.codePointAt(0)<=0xff));
        assert(description.includes(`matrícula ${missing.entries[0].enrollmentNumber} - 11/11/2026`));
        const row = fiscal.reviewedDeclaredIbsFixture();row.snapshot.source.serviceDescription=description;
        const xml = fiscal.buildNationalDps(fiscal.buildIndividualDps(row)).xml;
        assert(xml.includes(`<xDescServ>${fiscal.xmlText(description)}</xDescServ>`));
      }
      assert.equal(await render(template,known),knownBytes);
      assert.deepEqual(await value('SELECT jsonb_agg(snapshot ORDER BY id) value FROM private.nfse_queue_documents'),history);
      assert.deepEqual(await unchanged(),before);
      // The official description type is broader; retain our current composer
      // guard rather than asserting a false official prohibition of Unicode.
      const schema = await readFile(new URL('../functions/_shared/nfse-national/schemas/1.01/tiposSimples_v1.01.xsd',import.meta.url),'utf8');
      assert.match(schema,/<xs:simpleType name="TSDesc2000">\s*<xs:restriction base="TSStringComQuebraDeLinha">/);
      assert(schema.slice(schema.indexOf('<xs:simpleType name="TSStringComQuebraDeLinha">')).includes('[\\s\\S!-ÿ]'));
    });
  } finally { await db.close(); }
});
