import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
const { db,id }=await createFixture();
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
let checks=0;
try {
  for(const name of ['v2_invoice_observations','financial_snapshots','portal_payment_confirmations']) {
    assert.equal(await scalar(`select relrowsecurity value from pg_class where oid=$1::regclass`,[`internal_proesc.${name}`]),true);checks++;
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal(await scalar(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') value`,[role,`internal_proesc.${name}`]),false);checks++;
    }
  }
  const indexes=(await db.query(`select ci.relname name,i.indisvalid valid,i.indisready ready
    from pg_index i join pg_class ci on ci.oid=i.indexrelid
    where i.indrelid='internal_proesc.v2_invoice_observations'::regclass order by ci.relname`)).rows;
  assert.deepEqual(indexes.map(x=>x.name),['proesc_v2_invoice_link_time','proesc_v2_invoice_source_latest',
    'proesc_v2_invoice_staged_task_id','v2_invoice_observations_pkey','v2_invoice_observations_run_id_unit_id_invoice_id_key']);checks++;
  assert.ok(indexes.every(x=>x.valid&&x.ready));checks++;
  assert.equal(await scalar(`select count(*)::int value from pg_trigger where
    tgrelid='internal_proesc.v2_invoice_observations'::regclass and not tgisinternal`),0);checks++;
  const hashes=(await db.query(`select p.proname,md5(p.prosrc) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='internal_proesc' and p.proname in
    ('invalidate_settled_polling','guard_compacted_snapshot_keeper','guard_packed_item_keeper') order by 1`)).rows;
  assert.deepEqual(hashes,[
    {proname:'guard_compacted_snapshot_keeper',hash:'443b4c912b976a1010e802cbfa5c8299'},
    {proname:'guard_packed_item_keeper',hash:'c3260c9881aeacc138b8c253a4320b16'},
    {proname:'invalidate_settled_polling',hash:'bdaa3feb03edf9b275782bc04b9b2ad6'},
  ]);checks++;
  for(const name of ['01_payload_storage','02_payload_readers','03_payload_writer','04_payload_activation_gate'])
    await db.exec(readFileSync(new URL(`../review-drafts/proesc-v2-growth/${name}.draft.sql`,import.meta.url),'utf8'));
  assert.equal(await scalar('select enabled value from internal_proesc.v2_payload_storage_control'),false);checks++;
  const insert=async(n)=>db.query(`insert into internal_proesc.financial_snapshots(id,link_id,principal_cents,
    source_status,verification,evidence_kind) values($1,$2,10000,'OPEN','VERIFIED','API_PAYMENT_TOTAL')`,[id(n),id(50)]);
  await insert(51);assert.equal(await scalar('select last_snapshot_id value from internal_proesc.settled_polling_state'),id(51));checks++;
  await db.exec("update internal_proesc.settled_polling_state set receivable_sha256='synthetic'");
  await insert(52);assert.equal(await scalar('select last_snapshot_id value from internal_proesc.settled_polling_state'),id(52));checks++;
  assert.equal(await scalar('select receivable_sha256 value from internal_proesc.settled_polling_state'),null);checks++;
  await db.query('insert into internal_proesc.compacted_snapshot_observations values($1)',[id(51)]);
  await db.query('insert into internal_proesc.packed_item_snapshot_refs values($1)',[id(52)]);
  await assert.rejects(db.query('update internal_proesc.financial_snapshots set principal_cents=9999 where id=$1',[id(51)]),/imutável/);checks++;
  await assert.rejects(db.query('update internal_proesc.financial_snapshots set principal_cents=9999 where id=$1',[id(52)]),/imutável/);checks++;
  console.log(JSON.stringify({result:'PASS',checks,scope:'Exact observed RLS/ACL for three private tables, five observation indexes and three real snapshot triggers; synthetic dependent tables, not all receivable triggers'}));
} finally {await db.close();}
