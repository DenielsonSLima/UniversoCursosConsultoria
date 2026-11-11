import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const denies=(promise,code='22023')=>assert.rejects(promise,e=>e.code===code);
const cpf=base=>{let v=base;for(const n of [10,11])v+=String(([...v].reduce((s,d,i)=>s+Number(d)*(n-i),0)*10%11)%10);return v;};
const cnpj=base=>{let v=base;for(const w of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]){
  const r=[...v].reduce((s,d,i)=>s+Number(d)*w[i],0)%11;v+=String(r<2?0:11-r);}return v;};
const migrations=['20261111004615_nfse_queue_operation_basis.sql','20261111004617_nfse_operation_core_amounts.sql',
  '20261111004620_nfse_queue_preview.sql','20261111004622_nfse_queue_operation_bridge.sql','20261111004624_nfse_operation_read_models.sql',
  '20261111004626_nfse_queue_workspace_reads.sql','20261111004628_nfse_service_student_save.sql','20261111004631_nfse_service_partner_search.sql'];
test('normal prepared service and academic queue share durable production issue without changing finance',async t=>{
  const db=new PGlite();const issuer=cnpj('000000000001'),document=cpf('000000001');let row;let cancelled;let studentService;
  const call=async(name,args)=>(await db.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
  const op=(action,changes={})=>call('nfse_individual_operation_internal',Object.values({actor:id(11),context:id(10),polo:id(1),env:'PRODUCAO',
    month:'2026-11',request:id(50),action,preview:null,input:null,...changes}));
  const preview=(kind='PARTNER_SERVICE',source=id(40),changes={})=>op('PREVIEW_QUEUE',{input:{source:{kind,id:source},...(kind==='PARTNER_SERVICE'?{competenceDate:'2026-11-10'}:{})},...changes});
  const cancellation=(action,changes={})=>call('nfse_individual_cancellation_internal',Object.values({actor:id(11),context:id(10),polo:id(1),env:'PRODUCAO',
    month:'2026-11',request:id(50),action,preview:row.previewId,cancel:null,input:null,...changes}));
  const user=async()=>db.exec(`SET request.jwt.claim.sub='${id(11)}';SET request.jwt.claims='{"role":"authenticated"}'`);
  const server=async()=>db.exec(`SET request.jwt.claims='{"role":"service_role"}'`);
  try{
    await db.exec(await readFile(new URL('./nfse_individual_production.fixture.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('./nfse_queue_emission.fixture.sql',import.meta.url),'utf8'));
    const validator=await sql('20261110190702_nfse_fiscal_review_store.sql');
    await db.exec(validator.slice(validator.indexOf('CREATE FUNCTION private.nfse_review_valid_document'),validator.indexOf('CREATE FUNCTION private.nfse_fiscal_review_basis')));
    await db.query('INSERT INTO public.test_authorization VALUES($1,$2,$3,true)',[id(11),id(10),id(1)]);
    await db.query("INSERT INTO public.polos VALUES($1,$2,'ativo')",[id(1),issuer]);
    await db.query(`INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids) VALUES($1,'PESSOA SINTÉTICA',$2,'PF','ativo',$3,'{}'),
      ($4,'ALUNO SINTÉTICO',$5,'Aluno','ativo',$3,'{}'),($6,'ALUNO SEM ESCOPO',$5,'Aluno','ativo',NULL,'{}')`,[id(30),document,id(1),id(31),cpf('000000002'),id(32)]);
    const model={name:'MODELO SINTÉTICO',active:true,nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:'DESCRIÇÃO MODELO',complementaryInfo:'CNAE SINTÉTICO',issTreatment:'TRIBUTAVEL'};
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'PRODUCAO',$3,3,$4,$4)",[id(20),id(1),model,id(11)]);
    await db.query("INSERT INTO private.nfse_configurations VALUES($1,'PRODUCAO',$1,$2,3,$3)",[id(1),{municipalityCode:'2803401',portalAccess:'CERTIFICATE',opSimpNac:'3',regApTribSN:'1',regEspTrib:'0'},id(11)]);
    await db.query("INSERT INTO private.nfse_certificates VALUES($1,'PRODUCAO',$2,$3,now()-interval '1 day',now()+interval '1 year',repeat('a',64),$4)",[id(1),id(80),issuer,id(11)]);
    await db.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,service_description,amount,partner_snapshot,model_snapshot,receivable_action,created_by)
      VALUES($1,$2,'PRODUCAO',$3,$4,'2026-11-10','DESCRIÇÃO CONFIRMADA NA ORIGEM',1.00,$5,$6,'NONE',$7)`,[id(40),id(1),id(30),id(20),{name:'PESSOA SINTÉTICA'}, {...model,id:id(20),version:3},id(11)]);
    for(const name of ['20261111001718_nfse_individual_store.sql','20261111001720_nfse_individual_operations.sql','20261111001723_nfse_individual_cancellation.sql',
      '20261110212834_nfse_partner_service_description_2000.sql'])await db.exec(await sql(name));
    for(const name of migrations)await db.exec(await sql(name));
    await db.exec(await sql('20261111014713_nfse_cancel_preview_renewal.sql'));
    await user();
    await t.test('search/save accepts a scoped active student without creating or altering any receivable',async()=>{
      const list=await call('search_nfse_service_partners_secure',[id(10),id(1),'PRODUCAO','2026-11','ALUNO',null]);
      assert.equal(list.data.rows.length,1);assert.equal(list.data.rows[0].id,id(31));
      await denies(call('search_nfse_service_partners_secure',[id(10),id(1),'PRODUCAO','2026-11','A',null]));
      const input={partnerId:id(31),modelId:id(20),modelVersion:3,serviceDate:'2026-11-10',serviceDescription:'SERVIÇO DO ALUNO',amount:'260.00',generateReceivable:false};
      studentService=await call('save_nfse_partner_service_secure',[id(10),id(1),'PRODUCAO','2026-11',id(41),input]);
      assert.equal(studentService.data.receivableAction,'NONE');assert.equal((await db.query('SELECT count(*)::int n FROM public.contas_receber')).rows[0].n,0);
    });
    await server();
    await t.test('preview freezes canonical source, positive amount and description; arbitrary direct preview is refused',async()=>{
      await denies(op('PREVIEW',{input:{}}));row=await preview();assert.equal(row.snapshot.command.amount,'1.00');
      assert.equal(row.snapshot.source.serviceDescription,'DESCRIÇÃO CONFIRMADA NA ORIGEM');assert.equal(row.snapshot.model.version,3);
      assert.deepEqual(await preview(),row);await denies(preview('PARTNER_SERVICE',id(40),{request:id(51)}),'40001');
      await denies(op('PREVIEW_QUEUE',{input:{source:{kind:'PARTNER_SERVICE',id:id(40)},competenceDate:'2026-11-10',amount:'999.00'}}));
    });
    await t.test('an unleased expired preview renews the same DPS identity after revalidation',async()=>{
      await db.query("UPDATE private.nfse_individual_operations SET expires_at=now()-interval '1 minute' WHERE id=$1",[row.previewId]);
      const renewed=await preview();assert.equal(renewed.previewId,row.previewId);assert.equal(renewed.number,row.number);
      assert.equal(Date.parse(renewed.expiresAt)>Date.now(),true);row=renewed;
    });
    const prepare=async(target)=>{
      const command=target.snapshot.command;const recipient=target.snapshot.recipient;
      const dps=`DPS28034012${issuer}${target.series}${target.number.padStart(15,'0')}`;
      const fiscalInput={environment:'PRODUCAO',series:target.series,number:target.number,issuedAt:target.issuedAt,competence:command.competenceDate,
        issuer:{taxId:{type:'CNPJ',value:issuer}},recipient:{taxId:{type:'CPF',value:recipient.document},name:recipient.name},
        service:{nationalTaxCode:'080201',nbs:'122020000',description:target.snapshot.source.serviceDescription,complementaryInfo:'CNAE SINTÉTICO'},values:{serviceAmount:command.amount},
        review:{ibscbs:'DECLARED_CONFIRMED'},ibscbs:{cst:'000',classificationCode:'000001'}};
      return{dpsId:dps,fiscalInput,signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`};};
    await t.test('normal student service supports a non-R1 amount and canonical snapshot before lease',async()=>{
      const student=await preview('PARTNER_SERVICE',studentService.data.id,{request:id(52)});assert.equal(student.snapshot.command.amount,'260.00');
      const prepared=await prepare(student);await op('PREPARE',{request:id(52),preview:student.previewId,input:prepared});
      assert.equal((await op('CLAIM',{request:id(52),preview:student.previewId})).dispatch,true);
      assert.equal((await op('CLAIM',{request:id(52),preview:student.previewId})).dispatch,false);
    });
    await t.test('claim denies an orphan preview and source changes, then dispatches only once after exact preparation',async()=>{
      const input=await prepare(row);row=await op('PREPARE',{preview:row.previewId,input});
      await db.query("UPDATE private.nfse_partner_services SET service_description='ALTERADA' WHERE id=$1",[id(40)]);
      await denies(op('CLAIM',{preview:row.previewId}),'40001');
      await db.query("UPDATE private.nfse_partner_services SET service_description='DESCRIÇÃO CONFIRMADA NA ORIGEM' WHERE id=$1",[id(40)]);
      row=await op('CLAIM',{preview:row.previewId});assert.equal(row.dispatch,true);
      assert.equal((await op('CLAIM',{preview:row.previewId})).dispatch,false);
      await db.query(`INSERT INTO private.nfse_individual_operations(actor_id,context_id,polo_id,environment,month,request_id,command,snapshot,configuration_version,certificate_fingerprint)
        VALUES($1,$2,$3,'PRODUCAO','2026-11',$4,'{}','{}',3,repeat('a',64))`,[id(11),id(10),id(1),id(99)]);
      const orphan=(await db.query('SELECT id FROM private.nfse_individual_operations WHERE request_id=$1',[id(99)])).rows[0].id;
      await denies(op('CLAIM',{request:id(99),preview:orphan}),'42501');
    });
    const key='0'.repeat(49)+'1';
    await t.test('authorization appears in normal service, issued documents, workspace and original XML read',async()=>{
      row=await op('FINISH',{preview:row.previewId,input:{state:'AUTHORIZED',dpsId:row.dpsId,accessKey:key,number:'1',message:'Autorizada.',authorizedXml:`<NFSe Id="NFS${key}"><Signature/></NFSe>`}});
      await user();const services=await call('get_nfse_partner_services_secure',[id(10),id(1),'PRODUCAO','2026-11',1,50]);
      const service=services.data.rows.find(x=>x.id===id(40));assert.equal(service.state,'AUTHORIZED');assert.equal(service.operationId,row.previewId);
      const docs=await call('get_nfse_documents_secure',[id(10),id(1),'PRODUCAO','2026-11','EMITIDA',null,1,25]);
      assert.equal(docs.data.rows[0].id,row.previewId);assert.equal(docs.data.rows[0].retryable,false);
      const xml=await call('get_nfse_authorized_xml_secure',[id(10),id(1),'PRODUCAO','2026-11',row.previewId]);assert.equal(xml.data.xml,row.authorizedXml);
      assert.match(xml.data.sha256,/^[a-f0-9]{64}$/);assert.equal((await call('get_nfse_workspace_secure',[id(10),id(1),'PRODUCAO','2026-11'])).data.summary.issuedCount,1);
      await server();
    });
    await t.test('cancelled own note retains source binding and historical XML; neither rejection nor cancellation releases finance',async()=>{
      cancelled=await cancellation('PREVIEW',{input:{reasonCode:'1',justification:'Erro no valor informado.'}});
      const originalCancel={id:cancelled.cancelPreviewId,time:cancelled.occurredAt};
      await db.query("UPDATE private.nfse_individual_cancellations SET expires_at=now()-interval '1 minute' WHERE id=$1",[cancelled.cancelPreviewId]);
      cancelled=await cancellation('PREVIEW',{input:{reasonCode:'1',justification:'Erro no valor informado.'}});
      assert.equal(cancelled.cancelPreviewId,originalCancel.id);assert.equal(cancelled.occurredAt,originalCancel.time);
      assert.equal(Date.parse(cancelled.expiresAt)>Date.now(),true);
      const eventReferenceId=`PRE${key}101101`;const eventInput={environment:'PRODUCAO',accessKey:key,eventCode:'101101',reasonCode:'1',reason:cancelled.justification,
        author:{type:'CNPJ',value:issuer},occurredAt:cancelled.occurredAt};
      cancelled=await cancellation('PREPARE',{cancel:cancelled.cancelPreviewId,input:{eventInput,eventReferenceId,signedEventXml:`<pedRegEvento Id="${eventReferenceId}"><Signature/></pedRegEvento>`}});
      await cancellation('CLAIM',{cancel:cancelled.cancelPreviewId});
      await db.query("UPDATE private.nfse_individual_cancellations SET expires_at=now()-interval '1 minute' WHERE id=$1",[cancelled.cancelPreviewId]);
      const leased=await cancellation('PREVIEW',{input:{reasonCode:'1',justification:'Erro no valor informado.'}});
      assert.equal(leased.state,'PROCESSING');assert.equal(Date.parse(leased.expiresAt)<Date.now(),true);
      const eventId=`EVT${key}101101001`;
      await cancellation('FINISH',{cancel:cancelled.cancelPreviewId,input:{state:'CANCELLED',accessKey:key,eventCode:'101101',eventId,eventXml:`<evento Id="${eventId}"><Signature/></evento>`,message:'Cancelada.'}});
      await denies(preview('PARTNER_SERVICE',id(40),{request:id(54)}),'40001');
      await user();const service=(await call('get_nfse_partner_services_secure',[id(10),id(1),'PRODUCAO','2026-11',1,50])).data.rows.find(x=>x.id===id(40));
      assert.equal(service.state,'CANCELLED');assert.equal(service.cancelPreviewId,cancelled.cancelPreviewId);
      assert.equal((await db.query('SELECT count(*)::int n FROM public.contas_receber')).rows[0].n,0);
      await server();
    });
    await t.test('academic source needs a valid reviewed snapshot, keeps reservations after dispatch and rejects removal',async()=>{
      await db.query(`INSERT INTO private.nfse_queue_documents(id,batch_id,polo_id,environment,queue_month,payment_month,student_id,class_id,model_id,model_version,amount,receipt_count,snapshot,created_by)
        VALUES($1,$2,$3,'PRODUCAO','2026-11','2026-10',$4,$5,$6,3,279.90,1,$7,$8)`,[id(60),id(61),id(1),id(31),id(62),id(20),{recipient:{name:'ALUNO SINTÉTICO'},academic:{classLabel:'TURMA SINTÉTICA'},model:{name:model.name},fiscalReadiness:{blockingReasons:[]}},id(11)]);
      await db.query("INSERT INTO public.contas_receber(id,valor,status,polo_id,cliente_id) VALUES($1,279.90,'PAGO',$2,$3)",[id(70),id(1),id(31)]);
      await db.query("INSERT INTO private.nfse_receipt_reservations VALUES('PRODUCAO',$1,$1,$2,279.90)",[id(70),id(60)]);
      await denies(preview('ACADEMIC_QUEUE',id(60),{request:id(53)}));
      await db.query('INSERT INTO private.test_review_facts VALUES($1,$2)',[id(60),{issues:[],token:'f'.repeat(64),basis:{financial:{reserved:'279.90'}}}]);
      await db.query('INSERT INTO private.nfse_fiscal_review_revisions(document_id,revision,model_id,model_version,basis_fingerprint,definition) VALUES($1,1,$2,3,$3,$4)',[id(60),id(20),'f'.repeat(64),{competenceDate:'2026-11-10',serviceDate:'2026-11-10'}]);
      const academic=await preview('ACADEMIC_QUEUE',id(60),{request:id(53)});assert.equal(academic.snapshot.command.amount,'279.90');
      await op('PREPARE',{request:id(53),preview:academic.previewId,input:await prepare(academic)});
      assert.equal((await op('CLAIM',{request:id(53),preview:academic.previewId})).dispatch,true);
      await denies(db.query('INSERT INTO private.nfse_queue_removals VALUES($1)',[id(60)]),'55000');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_receipt_reservations')).rows[0].n,1);
      assert.equal((await db.query('SELECT valor::text,status FROM public.contas_receber WHERE id=$1',[id(70)])).rows[0].valor,'279.90');
    });
    await t.test('scope revocation denies historical replay and authorized XML read',async()=>{
      await db.exec('UPDATE public.test_authorization SET allowed=false');await denies(preview(),'42501');await user();
      await denies(call('get_nfse_authorized_xml_secure',[id(10),id(1),'PRODUCAO','2026-11',row.previewId]),'42501');
    });
  }finally{await db.close();}
});
