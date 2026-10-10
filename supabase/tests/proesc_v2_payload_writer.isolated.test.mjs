import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const dir = `${root}/supabase/review-drafts/proesc-v2-growth`;
const drafts = ['01_payload_storage.draft.sql','02_payload_readers.draft.sql','03_payload_writer.draft.sql']
  .map((name) => ({ name, text: readFileSync(`${dir}/${name}`, 'utf8') }));
const { db,id,actor,enrollment,classId,person,revision,personHash } = await createFixture();
const scalar = async (q,p=[]) => (await db.query(q,p)).rows[0].v;
let groups=0;
async function test(name,run) { await run(); groups++; console.log(`PASS ${name}`); }

try {
  // createFixture compiles all four real reader bodies with SQL dependency fixtures.
  for (const draft of drafts) await db.exec(draft.text);
  await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,valor,valor_pago,
    data_vencimento,status,origem_pagamento,updated_at) values($1,$2,$3,$4,279.90,0,'2026-09-15','PENDENTE','SISTEMA_ANTERIOR',now())`,
    [id(30),enrollment,classId,person]);
  await db.query(`insert into internal_proesc.obligation_links(id,matricula_id,turma_id,receivable_id,source_unit_id,source_class_id,source_key,auto_enabled)
    values($1,$2,$3,$4,'3145','123','901',true)`,[id(31),enrollment,classId,id(30)]);
  const base = { invoiceId:'901',personId:'11',sourceEnrollmentId:'22',sourceClassId:'123',personHash,
    unitId:'3145',dueDate:'2026-09-15',principalCents:27990,paidCents:0,paymentDate:null,
    sourceStatus:'EM ABERTO',groupId:'99',order:1,groupTotal:12,
    financialConfiguration:{fineRate:'2',interestRate:'0.033'},reviewReasons:[] };
  const task=async(n,mode='RECENT')=>{
    const run=id(100+n*10), tid=id(101+n*10);
    await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
      values($1,$2,$3,$4,'COMPLETE',now())`,[run,actor,revision,mode]);
    await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
      values($1,$2,'invoices','3145',2026,9)`,[tid,run]);
    return { run,tid };
  };
  const stage=async(t,payload,second)=>{
    await db.query(`select internal_proesc.v2_stage_invoice(t,$2::jsonb,$3::timestamptz)
      from internal_proesc.v2_tasks t where id=$1`,[t.tid,JSON.stringify(payload),`2026-10-09T20:00:${String(second).padStart(2,'0')}Z`]);
    return scalar(`select id as v from internal_proesc.v2_invoice_observations where task_id=$1`,[t.tid]);
  };
  const apply=async(o)=>scalar('select internal_proesc.v2_apply_invoice($1,$2) as v',[actor,o]);
  const t0=await task(0,'FULL');
  await db.query(`insert into internal_proesc.v2_enrollment_links(unit_id,source_enrollment_id,source_person_id,source_class_id,person_hash,matricula_id,first_run_id,first_observed_at,last_observed_at)
    values('3145','22','11','123',$1,$2,$3,now(),now())`,[personHash,enrollment,t0.run]);
  await db.query(`insert into internal_proesc.v2_people_observations(run_id,task_id,unit_id,person_id,person_hash,enrollments,matched,review,observed_at)
    values($1,$2,'3145','11',$3,'[{"sourceEnrollmentId":"22","sourceClassId":"123"}]',1,0,now())`,[t0.run,t0.tid,personHash]);
  const legacyId=await stage(t0,base,0);
  await test('flag OFF writer still uses inline payload and correct OPEN projection',async()=>{
    assert.equal(await scalar('select normalized_payload_id as v from internal_proesc.v2_invoice_observations where id=$1',[legacyId]),null);
    assert.equal(await apply(legacyId),'OPEN_CONFIRMED');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads'),0);
  });
  const snapshotsBefore=await scalar('select count(*)::int as v from internal_proesc.financial_snapshots');
  await db.exec('update internal_proesc.v2_payload_storage_control set enabled=true');
  const ta=await task(1),tb=await task(2),ta2=await task(3);
  const oa=await stage(ta,base,1);
  const b={...base,financialConfiguration:{...base.financialConfiguration,fineRate:'3'}};
  const ob=await stage(tb,b,2),oa2=await stage(ta2,base,3);
  await test('flag ON preserves A-B-A observations while sharing only canonical A',async()=>{
    const rows=(await db.query(`select id,normalized,normalized_payload_id from internal_proesc.v2_invoice_observations where id=any($1::uuid[]) order by observed_at`,[[oa,ob,oa2]])).rows;
    assert.equal(rows.length,3); assert.ok(rows.every(r=>r.normalized===null));
    assert.equal(rows[0].normalized_payload_id,rows[2].normalized_payload_id);
    assert.notEqual(rows[0].normalized_payload_id,rows[1].normalized_payload_id);
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads'),2);
  });
  await test('all financial snapshots and timestamps retained for A-B-A',async()=>{
    for(const o of [oa,ob,oa2]) assert.equal(await apply(o),'OPEN_CONFIRMED');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.financial_snapshots'),snapshotsBefore+3);
    assert.equal(await scalar(`select count(distinct snapshot_id)::int as v from internal_proesc.v2_invoice_observations where id=any($1::uuid[])`,[[oa,ob,oa2]]),3);
    assert.equal(await scalar(`select bool_and(s.observed_at=o.observed_at) as v from internal_proesc.v2_invoice_observations o join internal_proesc.financial_snapshots s on s.id=o.snapshot_id`),true);
  });
  await test('same-run replay rejects duplicates without creating canonical orphans',async()=>{
    const before=await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads');
    await assert.rejects(stage(ta,base,1),/duplicate key/);
    await assert.rejects(stage(ta,{...base,financialConfiguration:{fineRate:'4'}},1),/duplicate key/);
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads'),before);
  });
  await test('repeat apply returns prior result and creates no financial event or snapshot',async()=>{
    const before=await scalar('select count(*)::int as v from internal_proesc.financial_snapshots');
    assert.equal(await apply(oa2),'OPEN_CONFIRMED');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.financial_snapshots'),before);
  });
  await test('turning flag OFF after canonical writes preserves mixed readers and subsequent inline writes',async()=>{
    await db.exec('update internal_proesc.v2_payload_storage_control set enabled=false');
    const t=await task(4); const o=await stage(t,base,4);
    assert.deepEqual(await scalar('select normalized as v from internal_proesc.v2_invoice_observations where id=$1',[o]),base);
    assert.equal(await apply(o),'OPEN_CONFIRMED');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads'),2);
    for (const oid of [legacyId,oa,ob,oa2,o]) assert.equal((await scalar('select internal_proesc.v2_invoice_normalized(o) as v from internal_proesc.v2_invoice_observations o where id=$1',[oid])).invoiceId,'901');
  });
  await test('stale observation remains REVIEW and cannot alter current projection',async()=>{
    await db.exec('update internal_proesc.v2_payload_storage_control set enabled=true');
    const t=await task(5); const o=await stage(t,base,0);
    const before=await scalar('select count(*)::int as v from internal_proesc.financial_snapshots');
    assert.equal(await apply(o),'REVIEW');
    assert.equal(await scalar('select reason as v from internal_proesc.v2_invoice_observations where id=$1',[o]),'STALE_SOURCE_OBSERVATION');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.financial_snapshots'),before);
  });
  console.log(JSON.stringify({result:'PASS',groups,drafts:drafts.map(({name,text})=>({name,sha256:createHash('sha256').update(text).digest('hex')})),
    limits:['Only OPEN apply executed; paid/candidate/portal require dedicated parity tests', 'Single backend PGlite, not native concurrent sessions', 'Isolated fixture dependencies, not full production RBAC/integration']},null,2));
} catch (error) {
  console.error(JSON.stringify({ result:'FAIL', message:error.message, code:error.code, detail:error.detail, where:error.where },null,2));
  process.exitCode=1;
} finally { await db.close(); }
