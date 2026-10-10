import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
let checks=0;
for(const canonical of [false,true]) {
 const {db,id,actor,enrollment,classId,person,revision,personHash}=await createFixture();
 const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
 try {
  for(const name of ['01_payload_storage','02_payload_readers','03_payload_writer'])
   await db.exec(readFileSync(new URL(`../review-drafts/proesc-v2-growth/${name}.draft.sql`,import.meta.url),'utf8'));
  await db.query(`update public.turmas set codigo='ENF-T42-INT-MAT',polo_id=$1;
   `,[id(7)]);
  await db.query(`update internal_proesc.class_scopes set class_code='ENF-T42-INT-MAT',polo_id=$1`,[id(7)]);
  await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,
   valor,valor_pago,data_vencimento,data_pagamento,status,origem_pagamento,tipo_lancamento)
   values($1,$2,$3,$4,$5,279.90,260,'2026-10-05','2026-10-01','PAGO','SISTEMA_ANTERIOR','PARCELA')`,
   [id(11),enrollment,classId,person,id(7)]);
  await db.query(`insert into internal_proesc.obligation_links(id,matricula_id,turma_id,receivable_id,
   source_unit_id,source_class_id,source_key,auto_enabled) values($1,$2,$3,$4,'3145','123','456',true)`,
   [id(21),enrollment,classId,id(11)]);
  await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
   values($1,$2,$3,'FULL','COMPLETE',now())`,[id(100),actor,revision]);
  await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month,status)
   values($1,$2,'invoices','3145',2026,10,'COMPLETE')`,[id(101),id(100)]);
  await db.query(`insert into internal_proesc.v2_enrollment_links(unit_id,source_enrollment_id,
   source_person_id,source_class_id,person_hash,matricula_id,first_run_id,first_observed_at,last_observed_at)
   values('3145','22','11','123',$1,$2,$3,now(),now())`,[personHash,enrollment,id(100)]);
  await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,recorded_at,
   principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,components,accounting_lines,review_reasons)
   values($1,$2,now(),now(),27990,26000,'2026-10-01','PAID','VERIFIED','API_V2_INVOICE_PAID',
   '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}','[]','[]')`,[id(30),id(21)]);
  const row={invoiceId:'456',unitId:'3145',personId:'11',sourceEnrollmentId:'22',sourceClassId:'123',personHash,
   principalCents:27990,paidCents:26000,dueDate:'2026-10-05',paymentDate:'2026-10-01',sourceStatus:'PAGA',reviewReasons:[],
   financialConfiguration:{fineRate:'2',interestRate:'0.033',earlyDiscountCents:1990,fixedDiscountCents:0,earlyDiscountPercentage:'7.1'}};
  const setPayload=async payload=> {
   const payloadId=canonical?await scalar("select internal_proesc.v2_intern_invoice_payload('3145','456',$1::jsonb) value",[JSON.stringify(payload)]):null;
   await db.query(`update internal_proesc.v2_invoice_observations set normalized=$1::jsonb,normalized_payload_id=$2
    where id=$3`,[canonical?null:JSON.stringify(payload),payloadId,id(40)]);
  };
  await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,
   link_id,snapshot_id,source_status,normalized,result,observed_at)
   values($1,$2,$3,'3145','456',$4,$5,'PAGA',$6,'APPLIED',now())`,[id(40),id(100),id(101),id(21),id(30),JSON.stringify(row)]);
  await setPayload(row);
  const candidate=()=>scalar('select internal_proesc.v2_calculated_composition_candidate($1,$2) value',[id(11),id(30)]);
  assert.equal(await candidate(),true); checks++;
  const failures=[
   ['paid amount',()=>db.exec('update public.contas_receber set valor_pago=259')],
   ['gateway',()=>db.exec("update public.contas_receber set gateway_provider='BANESE'")],
   ['partial',()=>db.exec("update internal_proesc.v2_invoice_observations set source_status='PAGAMENTO PARCIAL'")],
   ['review',()=>db.exec("update internal_proesc.v2_invoice_observations set result='REVIEW'")],
   ['configuration',()=>setPayload({...row,financialConfiguration:{...row.financialConfiguration,fixedDiscountCents:1990}})],
   ['missing proof',()=>setPayload({...row,financialConfiguration:null})],
   ['identity',()=>setPayload({...row,personHash:'b'.repeat(64)})],
   ['scope',()=>db.exec("update internal_proesc.class_scopes set phase='REVIEW'")],
   ['disabled link',()=>db.exec('update internal_proesc.obligation_links set auto_enabled=false')],
   ['explicit components',()=>db.exec(`update internal_proesc.financial_snapshots set components='{"interestCents":0}'`)],
   ['snapshot mismatch',()=>db.exec('update internal_proesc.financial_snapshots set received_cents=25999')],
  ];
  for(const [label,mutate] of failures){await db.exec('BEGIN');await mutate();assert.equal(await candidate(),false,label);checks++;await db.exec('ROLLBACK');}
  assert.equal(await candidate(),true);checks++;
 }finally{await db.close();}
}
console.log(JSON.stringify({result:'PASS',checks,scope:'Actual calculated-composition SQL: canonical/legacy positive and eleven negative guard cases each'}));
