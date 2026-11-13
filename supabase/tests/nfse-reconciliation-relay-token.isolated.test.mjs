import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,migration,issue,uid,relayUrl} from './nfse-reconciliation-fixture.mjs';

test('protected relay material keeps its exact bounds without PostgreSQL regex-count errors',async()=>{
  const db=await fixture(process.argv[2]||process.env.NFSE_TEST_PGLITE_MODULE);
  const get=j=>db.query('SELECT public.get_nfse_reconciliation_material_internal($1,$2) value',[j.jobId,j.leaseToken]);
  const relay={url:relayUrl,key:'a'.repeat(64),protectionBypass:'synthetic-token._-ABC123'};
  const setRelay=value=>db.query("UPDATE vault.secrets SET decrypted_secret=$1 WHERE name='nfse_production_relay_config'",[JSON.stringify(value)]);
  try{
    await migration(db,'20261112220100_nfse_reconciliation_material.sql');
    const job=await issue(db,1);
    await db.query('INSERT INTO private.nfse_certificates VALUES($1,$2,$3)',[uid(501),uid(101),uid(601)]);
    await db.query('INSERT INTO vault.secrets VALUES($1,\'synthetic-test-cert\',$2)',[uid(601),JSON.stringify({
      privateKeyPem:'-----BEGIN RSA PRIVATE KEY-----synthetic',certificatePem:'-----BEGIN CERTIFICATE-----synthetic',chainPem:''})]);
    await db.query("INSERT INTO vault.secrets(name,decrypted_secret) VALUES('nfse_production_relay_config',$1)",[JSON.stringify(relay)]);
    // This is the observed production failure: a present bypass token reaches
    // a PostgreSQL regex quantifier that cannot compile, before any fiscal GET.
    await assert.rejects(get(job),error=>error.code==='2201B');
    await migration(db,'20261112224000_nfse_reconciliation_relay_token_validation.sql');
    const material=(await get(job)).rows[0].value;
    assert.equal(material.targetKind,'ISSUE');assert.equal(material.relay.protectionBypass,relay.protectionBypass);
    for(const protectionBypass of ['a','b'.repeat(255),'c'.repeat(256),'d'.repeat(4096)]){
      await setRelay({...relay,protectionBypass});
      assert.equal((await get(job)).rows[0].value.relay.protectionBypass.length,protectionBypass.length);
    }
    for(const protectionBypass of ['',null,'x'.repeat(4097),'has space','bad/token','line\nbreak','á']){
      await setRelay({...relay,protectionBypass});
      await assert.rejects(get(job),error=>error.code==='42501');
    }
    await setRelay({url:relayUrl,key:relay.key});assert.equal((await get(job)).rows[0].value.targetKind,'ISSUE');
    for(const invalid of [{url:'https://example.invalid/relay'},{key:'bad-key'},{unexpected:true}]){
      await setRelay({...relay,...invalid});await assert.rejects(get(job),error=>error.code==='42501');
    }
    await setRelay(relay);
    await assert.rejects(get({...job,leaseToken:uid(999)}),error=>error.code==='42501');
    await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)");
    await assert.rejects(get(job),error=>error.code==='42501');
    const privilege=(await db.query("SELECT has_function_privilege('authenticated','public.get_nfse_reconciliation_material_internal(uuid,uuid)','EXECUTE') ok")).rows[0].ok;
    assert.equal(privilege,false);
    const operation=(await db.query('SELECT state,authorized_xml FROM private.nfse_individual_operations WHERE id=$1',[uid(1)])).rows[0];
    assert.deepEqual(operation,{state:'PROCESSING',authorized_xml:null});
  }finally{await db.close();}
});
