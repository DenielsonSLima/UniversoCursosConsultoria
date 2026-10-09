import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const storage=readFileSync(`${root}/supabase/review-drafts/proesc-v2-growth/01_payload_storage.draft.sql`,'utf8');
const readers=readFileSync(`${root}/supabase/review-drafts/proesc-v2-growth/02_payload_readers.draft.sql`,'utf8');
const cases=[
  ['unknown reader in other application schema',`create function internal_academic.unreviewed_invoice() returns jsonb language sql as $$ select normalized from internal_proesc.v2_invoice_observations limit 1 $$`],
  ['unreviewed overload of allowlisted name',`create function internal_proesc.v2_monitor_state(text) returns jsonb language sql as $$ select normalized from internal_proesc.v2_invoice_observations limit 1 $$`],
  ['view in other application schema',`create view internal_academic.unreviewed_invoice_view as select normalized from internal_proesc.v2_invoice_observations`],
  ['unknown reader in primary schema',`create function internal_proesc.unreviewed_invoice() returns jsonb language sql as $$ select normalized from internal_proesc.v2_invoice_observations limit 1 $$`],
  ['SQL-standard body with catalog dependency',`create function internal_academic.unreviewed_sql_body() returns jsonb language sql return (select normalized from internal_proesc.v2_invoice_observations limit 1)`],
  ['procedure reader',`create procedure internal_academic.unreviewed_invoice_procedure() language plpgsql as $$ begin perform normalized from internal_proesc.v2_invoice_observations limit 1; end $$`],
  ['custom observation trigger using NEW.normalized',`create function internal_academic.unreviewed_invoice_trigger() returns trigger language plpgsql as $$ begin perform new.normalized; return new; end $$;
    create trigger unreviewed_observation_reader before insert on internal_proesc.v2_invoice_observations for each row execute function internal_academic.unreviewed_invoice_trigger()`],
];
const results=[];
for(const [name,sql] of cases) {
  const {db}=await createFixture();
  try {
    await db.exec(storage); await db.exec(sql);
    let blocked=false,message;
    try { await db.exec(readers); }
    catch(error) { blocked=true;message=error.message;await db.exec('rollback'); }
    results.push({name,blocked,message});
    console.log(`${blocked?'PASS':'FAIL'} ${name}${message?`: ${message}`:''}`);
  } finally {await db.close();}
}
console.log(JSON.stringify({draftSHA256:createHash('sha256').update(readers).digest('hex'),results},null,2));

const {db}=await createFixture();
try {
  for (const file of ['01_payload_storage.draft.sql','02_payload_readers.draft.sql',
    '03_payload_writer.draft.sql','04_payload_activation_gate.draft.sql']) {
    await db.exec(readFileSync(`${root}/supabase/review-drafts/proesc-v2-growth/${file}`,'utf8'));
  }
  const setMode=async(value)=>(await db.query('select internal_proesc.v2_set_payload_storage_enabled($1) as v',[value])).rows[0].v;
  await assert.rejects(setMode(true),/Validate payload constraints/);
  await db.exec(`alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_payload_identity_fk;
    alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_one_payload;`);
  assert.equal((await setMode(true)).enabled,true);
  for (const [name,sql,cleanup] of [
    ['post-install SQL body',cases[4][1],'drop function internal_academic.unreviewed_sql_body()'],
    ['post-install overload',cases[1][1],'drop function internal_proesc.v2_monitor_state(text)'],
    ['post-install procedure',cases[5][1],'drop procedure internal_academic.unreviewed_invoice_procedure()'],
    ['post-install custom trigger',cases[6][1],`drop trigger unreviewed_observation_reader on internal_proesc.v2_invoice_observations;
      drop function internal_academic.unreviewed_invoice_trigger()`],
  ]) {
    await db.exec(sql);
    await assert.rejects(setMode(true),/Unreviewed V2 observation|trigger/i);
    assert.equal((await setMode(false)).enabled,false,'Emergency OFF must work despite reader drift');
    assert.equal((await db.query('select enabled from internal_proesc.v2_payload_storage_control')).rows[0].enabled,false);
    console.log(`PASS ${name} blocks activation while emergency OFF remains available`);
    await db.exec(cleanup);
  }
  await db.exec('grant select on internal_proesc.v2_invoice_payloads to authenticated');
  await assert.rejects(setMode(true),/Unexpected public payload/);
  assert.equal((await setMode(false)).enabled,false);
  await db.exec('revoke select on internal_proesc.v2_invoice_payloads from authenticated');
  console.log('PASS activation rejects unintended table access and leaves OFF available');
  await db.exec('delete from internal_proesc.v2_payload_storage_control');
  await assert.rejects(setMode(false),/control|singleton|missing|not found|no rows/i);
  console.log('PASS missing singleton cannot produce false success');
} finally {await db.close();}
assert.ok(results.every(r=>r.blocked),'All unreviewed readers must block installation');
