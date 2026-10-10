import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { installCaixaFixture } from './fixtures/proesc-v2-growth.caixa.fixture.mjs';
const migration=readFileSync(new URL('../migrations/20261009224423_prepare_proesc_v2_payload_storage_off.sql',import.meta.url),'utf8');
const validation=readFileSync(new URL('../migrations/20261009224508_validate_proesc_v2_payload_constraints_off.sql',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(validation).digest('hex'),
 'c2b537c9bf85683274e51e0492fc43a37b464016edbe8f835bb89786114d15de','Applied validation SQL is immutable');
let checks=1;
for(const mode of ['off','on','missing','drift']) {
 const f=await createFixture();const {db}=f;
 const value=async query=>(await db.query(query)).rows[0].value;
 try {
  await installCaixaFixture(f);await db.exec(migration);
  if(mode==='on')await db.exec('update internal_proesc.v2_payload_storage_control set enabled=true');
  if(mode==='missing')await db.exec('delete from internal_proesc.v2_payload_storage_control');
  if(mode==='drift')await db.exec(`create or replace function internal_proesc.v2_monitor_state(p_polo_id uuid)
   returns jsonb language sql as $$select '{}'::jsonb$$`);
  if(mode==='off') {
   await db.exec(validation);
   assert.equal(await value('select enabled value from internal_proesc.v2_payload_storage_control'),false);checks++;
   assert.equal(await value(`select count(*)::int value from pg_constraint where conrelid=
    'internal_proesc.v2_invoice_observations'::regclass and conname in
    ('v2_invoice_payload_identity_fk','v2_invoice_one_payload') and convalidated`),2);checks++;
   await db.exec(validation);
   assert.equal(await value('select count(*)::int value from internal_proesc.v2_invoice_payloads'),0);checks++;
  } else {
   await assert.rejects(db.exec(validation));checks++;await db.exec('ROLLBACK');
   assert.equal(await value(`select count(*)::int value from pg_constraint where conrelid=
    'internal_proesc.v2_invoice_observations'::regclass and conname in
    ('v2_invoice_payload_identity_fk','v2_invoice_one_payload') and not convalidated`),2);checks++;
  }
 }finally{await db.close();}
}
console.log(JSON.stringify({result:'PASS',checks,
 scope:'Applied OFF validation: success/replay, ON/missing singleton/reader drift fail closed with rollback'}));
