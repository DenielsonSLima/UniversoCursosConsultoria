import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { installCaixaFixture } from './fixtures/proesc-v2-growth.caixa.fixture.mjs';
const names=['01_payload_storage','02_payload_readers','03_payload_writer','04_payload_activation_gate'];
const draft=(n)=>readFileSync(new URL(`../review-drafts/proesc-v2-growth/${n}.draft.sql`,import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/20261009223000_prepare_proesc_v2_payload_storage_off.sql',import.meta.url),'utf8');
const expected='-- Prepared for explicit installation approval. Atomic, OFF by default; no backfill or cleanup.\nBEGIN;\n'+
 names.map(n=>'-- Phase '+n+'\n'+draft(n).split('\n').slice(1).filter(l=>!['BEGIN;','COMMIT;'].includes(l)).join('\n').trim()).join('\n\n')+'\nCOMMIT;\n';
assert.equal(migration,expected,'Published migration must exactly combine the reviewed phases');
assert.ok(migration.split('\n').length<=501,'Migration stays within 500 physical lines');
assert.equal((migration.match(/^BEGIN;$/gm)||[]).length,1);
assert.equal((migration.match(/^COMMIT;$/gm)||[]).length,1);
let checks=4;
for(const failure of ['unknown-reader','metadata-drift','writer-drift',null]) {
 const f=await createFixture(),{db}=f;
 const value=async(sql)=>(await db.query(sql)).rows[0].value;
 try {
  await installCaixaFixture(f);
  if(failure==='unknown-reader') await db.exec(`create function internal_proesc.unreviewed_invoice()
    returns jsonb language sql as $$ select normalized from internal_proesc.v2_invoice_observations limit 1 $$`);
  if(failure==='metadata-drift') await db.exec(`create or replace function internal_proesc.v2_monitor_state(p_polo_id uuid)
    returns jsonb language sql as $$ select '{}'::jsonb $$`);
  if(failure==='writer-drift') {
   const writer=await value(`select pg_get_functiondef('internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)'::regprocedure) value`);
   await db.exec(writer.replace('AS $function$', 'AS $function$\n-- synthetic writer drift'));
  }
  const metadata=()=>value(`select jsonb_agg(to_jsonb(p) order by p.oid) value from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal_proesc'
    and p.proname in ('v2_apply_invoice','v2_stage_invoice','confirm_portal_payment',
      'v2_calculated_composition_candidate','v2_net_discount_candidate','v2_monitor_state')`);
  const beforeMetadata=await metadata();
  const before=await value(`select jsonb_agg(to_jsonb(o) order by id) value from internal_proesc.v2_invoice_observations o`);
  const stageBefore=await value(`select md5(prosrc) value from pg_proc where oid=
    'internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)'::regprocedure`);
  if(failure) {
   await assert.rejects(db.exec(migration),failure==='unknown-reader'?/Unreviewed V2 observation/:failure==='metadata-drift'?/Metadata reader drift/:/V2 writer drift/);checks++;
   await db.exec('ROLLBACK');
   assert.deepEqual(await metadata(),beforeMetadata,'Failed install must restore all adapted bodies and ACL metadata');checks++;
   assert.equal(await value("select to_regclass('internal_proesc.v2_invoice_payloads')::text value"),null);checks++;
   assert.equal(await value("select to_regclass('internal_proesc.v2_payload_storage_control')::text value"),null);checks++;
   assert.equal(await value(`select exists(select 1 from pg_attribute where attrelid=
    'internal_proesc.v2_invoice_observations'::regclass and attname='normalized_payload_id' and not attisdropped) value`),false);checks++;
   assert.equal(await value(`select attnotnull value from pg_attribute where attrelid=
    'internal_proesc.v2_invoice_observations'::regclass and attname='normalized'`),true);checks++;
   assert.deepEqual(await value('select jsonb_agg(to_jsonb(o) order by id) value from internal_proesc.v2_invoice_observations o'),before);checks++;
   assert.equal(await value(`select md5(prosrc) value from pg_proc where oid=
    'internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)'::regprocedure`),stageBefore);checks++;
  } else {
   await db.exec(migration);
   assert.equal(await value('select enabled value from internal_proesc.v2_payload_storage_control'),false);checks++;
   assert.equal(await value(`select count(*)::int value from pg_constraint where conrelid=
    'internal_proesc.v2_invoice_observations'::regclass and conname in
    ('v2_invoice_payload_identity_fk','v2_invoice_one_payload') and not convalidated`),2);checks++;
   assert.equal(await value('select count(*)::int value from internal_proesc.v2_invoice_payloads'),0);checks++;
   assert.deepEqual(await value(`select jsonb_agg(internal_proesc.v2_invoice_evidence(o) order by id) value
    from internal_proesc.v2_invoice_observations o`),before);checks++;
   await assert.rejects(value('select internal_proesc.v2_set_payload_storage_enabled(true) value'),/Validate payload constraints/);checks++;
   await db.exec(`alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_payload_identity_fk;
    alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_one_payload;`);
   assert.equal((await value('select internal_proesc.v2_set_payload_storage_enabled(true) value')).enabled,true);checks++;
   assert.equal((await value('select internal_proesc.v2_set_payload_storage_enabled(false) value')).enabled,false);checks++;
  }
 }finally{await db.close();}
}
console.log(JSON.stringify({result:'PASS',checks,scope:'Actual atomic migration, reader/hash failure rollback, untouched legacy evidence, OFF install and separately validated ON/OFF'}));
