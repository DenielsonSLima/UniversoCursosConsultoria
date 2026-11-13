import assert from 'node:assert/strict';
import {fixture,migration,issue,cancel,authProof,cancelProof,uid,relayUrl} from './nfse-reconciliation-fixture.mjs';
const db=await fixture(process.argv[2]);
await migration(db,'20261112220100_nfse_reconciliation_material.sql');
await migration(db,'20261112224000_nfse_reconciliation_relay_token_validation.sql');
await migration(db,'20261112220200_nfse_reconciliation_proof.sql');
const get=j=>db.query(`SELECT public.get_nfse_reconciliation_material_internal($1,$2) value`,[j.jobId,j.leaseToken]);
const finish=(j,p)=>db.query(`SELECT public.complete_nfse_reconciliation_proof_internal($1,$2,$3) value`,[j.jobId,j.leaseToken,p]);
const j=await issue(db,1);
await assert.rejects(get(j),/credential/);
await db.query(`INSERT INTO private.nfse_certificates VALUES($1,$2,$3)`,[uid(501),uid(101),uid(601)]);
const material={privateKeyPem:'-----BEGIN RSA PRIVATE KEY-----synthetic',certificatePem:'-----BEGIN CERTIFICATE-----synthetic',chainPem:''};
await db.query(`INSERT INTO vault.secrets VALUES($1,'synthetic-test-cert',$2)`,[uid(601),JSON.stringify(material)]);
await assert.rejects(get(j),/transport/);
const protectedRelay={url:relayUrl,key:'a'.repeat(64),protectionBypass:'synthetic-valid-bypass._-0123'};
await db.query(`INSERT INTO vault.secrets(name,decrypted_secret) VALUES('nfse_production_relay_config',$1)`,[JSON.stringify(protectedRelay)]);
assert.equal((await get(j)).rows[0].value.targetKind,'ISSUE');
await assert.rejects(get({...j,leaseToken:uid(999)}),/lease/);
await db.exec(`SELECT set_config('request.jwt.claim.role','authenticated',false)`);
await assert.rejects(get(j),/Internal worker/); await assert.rejects(finish(j,authProof(1)),/Internal worker/);
await db.exec(`SELECT set_config('request.jwt.claim.role','service_role',false)`);
await db.query(`UPDATE vault.secrets SET decrypted_secret=$1 WHERE name='nfse_production_relay_config'`,[JSON.stringify({url:'https://example.invalid/evil',key:'a'.repeat(64)})]);
await assert.rejects(get(j),/transport/);
await db.query(`UPDATE vault.secrets SET decrypted_secret=$1 WHERE name='nfse_production_relay_config'`,[JSON.stringify(protectedRelay)]);
for(const p of [
 {...authProof(1),state:'REJECTED'}, {...authProof(1),dpsId:'DPSwrong'},
 {...authProof(1),accessKey:'0'.repeat(50)}, {...authProof(1),number:'2'},
 {...authProof(1),authorizedXml:authProof(1).authorizedXml.replace('<tpAmb>1','<tpAmb>2')},
 {...authProof(1),authorizedXml:authProof(1).authorizedXml.replace('<ds:Signature/>','')},
 {...authProof(1),authorizedXml:'<!DOCTYPE x><x/>'},
 {...authProof(1),authorizedXml:authProof(1).authorizedXml.replace('Id="DPS1"','Id="DPS2"')},
]) await assert.rejects(finish(j,p),/transition|proof|mismatch/);
assert.equal((await finish(j,authProof(1))).rows[0].value,true);
assert.equal((await db.query(`SELECT state FROM private.nfse_reconciliation_jobs WHERE id=$1`,[j.jobId])).rows[0].state,'DONE');
await assert.rejects(finish(j,authProof(1)),/lease/);
const cj=await cancel(db,1); assert.equal((await get(cj)).rows[0].value.targetKind,'CANCEL');
for(const p of [
 {...cancelProof(1),state:'PENDING'}, {...cancelProof(1),eventCode:'101103'},
 {...cancelProof(1),accessKey:'0'.repeat(50)}, {...cancelProof(1),eventId:'EVTbad'},
 {...cancelProof(1),eventXml:cancelProof(1).eventXml.replace('Id="PRE1"','Id="PRE2"')},
 {...cancelProof(1),eventXml:cancelProof(1).eventXml.replace('<tpAmb>1','<tpAmb>2')},
 {...cancelProof(1),eventXml:cancelProof(1).eventXml.replace('<ds:Signature/>','')},
 {...cancelProof(1),eventXml:'<!DOCTYPE x><x/>'},
]) await assert.rejects(finish(cj,p),/transition|proof|mismatch/);
assert.equal((await finish(cj,cancelProof(1))).rows[0].value,true);
assert.equal((await db.query(`SELECT state FROM private.nfse_individual_cancellations WHERE id=$1`,[uid(1001)])).rows[0].state,'CANCELLED');
const expired=await issue(db,2); await db.query(`UPDATE private.nfse_reconciliation_jobs SET lease_until=now()-interval '1 second' WHERE id=$1`,[expired.jobId]);
await assert.rejects(get(expired),/lease/); await assert.rejects(finish(expired,authProof(2)),/lease/);
assert.equal((await db.query(`SELECT has_function_privilege('authenticated','public.get_nfse_reconciliation_material_internal(uuid,uuid)','EXECUTE') ok`)).rows[0].ok,false);
assert.equal((await db.query(`SELECT has_function_privilege('authenticated','public.complete_nfse_reconciliation_proof_internal(uuid,uuid,jsonb)','EXECUTE') ok`)).rows[0].ok,false);
console.log('PASS material/proof: roles, lease, pinned relay, credentials, XML identity/environment/shape, terminal CAS, grants. Synthetic structural XML only; cryptographic signature validation belongs to executor.');
await db.close();
