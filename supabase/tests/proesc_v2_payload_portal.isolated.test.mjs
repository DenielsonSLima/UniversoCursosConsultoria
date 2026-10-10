import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const drafts=['01_payload_storage.draft.sql','02_payload_readers.draft.sql','03_payload_writer.draft.sql'].map(name=>({name,text:readFileSync(`${root}/supabase/review-drafts/proesc-v2-growth/${name}`,'utf8')}));
let groups=0;
const results=[];

async function run(mode) {
  const {db,id,actor,enrollment,classId,person,revision,personHash}=await createFixture();
  const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].v;
  const row={invoiceId:'901',personId:'11',sourceEnrollmentId:'22',sourceClassId:'123',personHash,
    unitId:'3145',dueDate:'2026-09-15',principalCents:27990,paidCents:26000,paymentDate:'2026-09-15',
    sourceStatus:'PAGAMENTO PARCIAL',groupId:'99',order:1,groupTotal:12,
    financialConfiguration:{fineRate:'2',interestRate:'0.033'},reviewReasons:['PARTIAL_PAYMENT_REQUIRES_REVIEW']};
  const queryProof=async(canonical)=>scalar(`select jsonb_build_object(
    'portalStatus','PAGA','evidenceReference','synthetic-evidence-reference','approvalReference','synthetic-approval-reference',
    'evidenceSha256',repeat('a',64),'linkId',l.id,'observationId',o.id,
    'observationHash',md5(${canonical?'internal_proesc.v2_invoice_evidence(o)':'to_jsonb(o)'}::text),
    'latestSnapshotId',s.id,'latestSnapshotHash',md5(to_jsonb(s)::text),
    'expectedBefore',internal_proesc.receivable_fingerprint(c),'portalInvoiceId','901','portalDueDate','2026-09-15',
    'principalCents',27990,'paidCents',26000,'paymentDate','2026-09-15') as v
    from internal_proesc.obligation_links l join public.contas_receber c on c.id=l.receivable_id
    join internal_proesc.v2_invoice_observations o on o.link_id=l.id
    join internal_proesc.financial_snapshots s on s.id=o.snapshot_id where o.id='${id(50)}'`);
  const confirm=(payload,request=id(80),who=actor)=>scalar('select internal_proesc.confirm_portal_payment($1,$2,$3::jsonb) as v',[who,request,JSON.stringify(payload)]);
  const withRollback=async(name,body)=>{
    await db.exec('begin');
    try{await body();groups++;console.log(`PASS ${mode}: ${name}`);}finally{await db.exec('rollback');}
  };
  try {
    await db.exec(`
      alter table public.usuarios_sistema add column personalizar_permissoes boolean,add column permissoes jsonb,
        add column perfil_acesso_id uuid,add column status text,add column perfil text,add column polo_ids jsonb,add column context text;
      create table public.perfis_acesso(id uuid primary key,permissoes jsonb);
      create table internal_proesc.archived_receipt_requests(request_id uuid primary key);
      create table internal_proesc.administrative_archive_requests(request_id uuid primary key);
      update public.usuarios_sistema set status='ativo',perfil='gestor',permissoes='{"allPolos":true,"modules":["configuracoes"]}',polo_ids='[]';
    `);
    await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,valor,valor_pago,data_vencimento,status,origem_pagamento)
      values($1,$2,$3,$4,279.90,0,'2026-09-15','PENDENTE','SISTEMA_ANTERIOR')`,[id(30),enrollment,classId,person]);
    await db.query(`insert into internal_proesc.obligation_links(id,matricula_id,turma_id,receivable_id,source_unit_id,source_class_id,source_key,auto_enabled)
      values($1,$2,$3,$4,'3145','123','901',true)`,[id(31),enrollment,classId,id(30)]);
    await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,created_at,finished_at)
      values($1,$2,$3,'FULL','COMPLETE','2026-10-08','2026-10-08')`,[id(40),actor,revision]);
    await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
      values($1,$2,'invoices','3145',2026,9)`,[id(41),id(40)]);
    await db.query(`insert into internal_proesc.v2_enrollment_links(unit_id,source_enrollment_id,source_person_id,source_class_id,person_hash,matricula_id,first_run_id,first_observed_at,last_observed_at)
      values('3145','22','11','123',$1,$2,$3,'2026-10-08','2026-10-08')`,[personHash,enrollment,id(40)]);
    await db.query(`insert into internal_proesc.v2_people_observations(run_id,task_id,unit_id,person_id,person_hash,enrollments,matched,review,observed_at)
      values($1,$2,'3145','11',$3,'[{"sourceEnrollmentId":"22","sourceClassId":"123"}]',1,0,'2026-10-08')`,[id(40),id(41),personHash]);
    await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,principal_cents,received_cents,payment_date,
      source_status,verification,evidence_kind,accounting_lines,review_reasons,components)
      values($1,$2,'2026-10-08',27990,26000,'2026-09-15','UNKNOWN','REVIEW','API_V2_INVOICE_REVIEW','[]','["PROVIDER_PAYMENT_STATUS_REQUIRES_REVIEW"]','{}')`,[id(60),id(31)]);
    if(mode==='canonical') {
      for(const draft of drafts) await db.exec(draft.text);
      const payloadId=await scalar('select internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) as v',['3145','901',JSON.stringify(row)]);
      await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,link_id,snapshot_id,source_status,
        normalized,normalized_payload_id,result,observed_at) values($1,$2,$3,'3145','901',$4,$5,'PAGAMENTO PARCIAL',null,$6,'REVIEW','2026-10-08')`,
        [id(50),id(40),id(41),id(31),id(60),payloadId]);
    } else {
      await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,link_id,snapshot_id,source_status,
        normalized,result,observed_at) values($1,$2,$3,'3145','901',$4,$5,'PAGAMENTO PARCIAL',$6,'REVIEW','2026-10-08')`,
        [id(50),id(40),id(41),id(31),id(60),JSON.stringify(row)]);
    }
    const proof=await queryProof(mode==='canonical');
    if(mode==='legacy-manifest-after-migration') for(const draft of drafts) await db.exec(draft.text);
    const canonical=mode!=='legacy';
    const addNewer=async(changed=false)=>{
      await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,created_at,finished_at)
        values($1,$2,$3,'RECENT','COMPLETE','2026-10-09','2026-10-09')`,[id(70),actor,revision]);
      await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
        values($1,$2,'invoices','3145',2026,9)`,[id(71),id(70)]);
      const payload=changed?{...row,paidCents:26100}:row;
      if(canonical) {
        const payloadId=await scalar('select internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) as v',['3145','901',JSON.stringify(payload)]);
        await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,link_id,snapshot_id,source_status,
          normalized,normalized_payload_id,result,observed_at) values($1,$2,$3,'3145','901',$4,$5,'PAGAMENTO PARCIAL',null,$6,'REVIEW','2026-10-09')`,
          [id(72),id(70),id(71),id(31),id(60),payloadId]);
      } else {
        await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,link_id,snapshot_id,source_status,
          normalized,result,observed_at) values($1,$2,$3,'3145','901',$4,$5,'PAGAMENTO PARCIAL',$6,'REVIEW','2026-10-09')`,
          [id(72),id(70),id(71),id(31),id(60),JSON.stringify(payload)]);
      }
    };
    await withRollback('real portal confirmation applies once, preserves observation FK and replays',async()=>{
      const result=await confirm(proof);assert.equal(result.result,'APPLIED');
      const receipt=await scalar(`select jsonb_build_object('status',status,'paid',valor_pago,'date',data_pagamento,'principal',valor) as v from public.contas_receber where id='${id(30)}'`);
      assert.deepEqual(receipt,{status:'PAGO',paid:260,date:'2026-09-15',principal:279.90});
      assert.equal(await scalar('select count(*)::int as v from internal_proesc.financial_snapshots'),2);
      assert.equal(await scalar('select observation_id as v from internal_proesc.portal_payment_confirmations'),id(50));
      assert.equal((await confirm(proof)).replayed,true);
      assert.equal(await scalar('select count(*)::int as v from internal_proesc.reconciliation_events'),1);
      results.push({mode,receipt,result:{...result,receivableId:undefined,snapshotId:undefined}});
    });
    await withRollback('same payload in newer RECENT observation still permits proof',async()=>{
      await addNewer(false);assert.equal((await confirm(proof)).result,'APPLIED');
    });
    await withRollback('newer changed observation rejects prior proof',async()=>{
      await addNewer(true);await assert.rejects(confirm(proof),/nova conferência/);
    });
    await withRollback('tampered observation hash fails closed',async()=>{
      await assert.rejects(confirm({...proof,observationHash:'b'.repeat(32)}),/nova conferência/);
    });
    await withRollback('missing FULL proof cannot be replaced by RECENT',async()=>{
      await db.exec(`update internal_proesc.v2_runs set mode='RECENT' where id='${id(40)}'`);
      await assert.rejects(confirm(proof),/nova conferência/);
    });
    await withRollback('divergent replay is rejected',async()=>{
      await confirm(proof);await assert.rejects(confirm({...proof,paidCents:26100}),/Replay da conferência divergente/);
    });
    await withRollback('invalid actor is rejected before replay lookup',async()=>{
      await confirm(proof);await assert.rejects(confirm(proof,id(80),id(9999)),/Solicitante financeiro global real obrigatório/);
    });
    await withRollback('calculated composition candidate preserves positive and negative payload decisions',async()=>{
      const cfg={fineRate:'2',interestRate:'0.033',earlyDiscountCents:1990,fixedDiscountCents:0,earlyDiscountPercentage:'7.1'};
      const paid={...row,sourceStatus:'PAGA',reviewReasons:[],financialConfiguration:cfg};
      await db.exec(`update public.contas_receber set status='PAGO',valor_pago=260,data_pagamento='2026-09-15',tipo_lancamento='PARCELA',polo_id='${id(90)}';
        update public.turmas set codigo='ENF-T35-INT-MAT',polo_id='${id(90)}';
        update internal_proesc.class_scopes set class_code='ENF-T35-INT-MAT',polo_id='${id(90)}';
        update internal_proesc.financial_snapshots set source_status='PAID',verification='VERIFIED',evidence_kind='API_V2_INVOICE_PAID',review_reasons='[]',
          components='{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}';
        update internal_proesc.v2_invoice_observations set source_status='PAGA',result='APPLIED';`);
      const replacePayload=async(payload)=>{
        if(canonical) {
          const pid=await scalar('select internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) as v',['3145','901',JSON.stringify(payload)]);
          await db.query('update internal_proesc.v2_invoice_observations set normalized=null,normalized_payload_id=$1 where id=$2',[pid,id(50)]);
        } else await db.query('update internal_proesc.v2_invoice_observations set normalized=$1 where id=$2',[JSON.stringify(payload),id(50)]);
      };
      const candidate=()=>scalar('select internal_proesc.v2_calculated_composition_candidate($1,$2) as v',[id(30),id(60)]);
      await replacePayload(paid); assert.equal(await candidate(),true);
      await replacePayload({...paid,paidCents:null});assert.equal(await candidate(),false);
      await replacePayload({...paid,financialConfiguration:{...cfg,earlyDiscountCents:1991}});assert.equal(await candidate(),false);
      await replacePayload(paid);assert.equal(await candidate(),true);
    });
  } finally {await db.close();}
}
try {
  for(const mode of ['legacy','legacy-manifest-after-migration','canonical']) await run(mode);
  const core=results.map(({mode,...value})=>value);
  assert.deepEqual(core[0],core[1]);assert.deepEqual(core[0],core[2]);
  console.log(JSON.stringify({result:'PASS',groups,parityModes:results.map(r=>r.mode),drafts:drafts.map(({name,text})=>({name,sha256:createHash('sha256').update(text).digest('hex')})),
    limits:['Isolated synthetic fixture; actual database RBAC/triggers not fully reproduced','Single backend; no concurrency proof','No production calls']},null,2));
}catch(error){console.error(JSON.stringify({result:'FAIL',message:error.message,code:error.code,where:error.where},null,2));process.exitCode=1;}
