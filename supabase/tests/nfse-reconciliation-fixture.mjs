import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const issuer='12345678000199';
export const accessKey='123456782'+issuer+'0'.repeat(27);
export const relayUrl='https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay';
export function testModule(module){
 const value=module||process.env.NFSE_TEST_PGLITE_MODULE||'@electric-sql/pglite';
 return value.startsWith('/')?pathToFileURL(value).href:value;
}
export async function fixture(module){
 const {PGlite}=await import(testModule(module)); const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA vault;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE TABLE private.nfse_individual_operations(id uuid primary key,polo_id uuid,environment text,month text,state text,
 signed_dps_xml text,authorized_xml text,fiscal_input jsonb,dps_id text,snapshot jsonb,result jsonb,updated_at timestamptz default now());
 CREATE TABLE private.nfse_individual_cancellations(id uuid primary key,operation_id uuid references private.nfse_individual_operations(id),
 state text,signed_event_xml text,event_input jsonb,access_key text,event_reference_id text,event_xml text,result jsonb,updated_at timestamptz default now());
 CREATE TABLE private.nfse_certificates(id uuid,polo_id uuid,vault_secret_id uuid);
 CREATE TABLE vault.secrets(id uuid default gen_random_uuid(),name text,decrypted_secret text);
 CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets;
 CREATE FUNCTION private.resolve_nfse_production_certificate(p uuid,e text,i text) RETURNS SETOF private.nfse_certificates
 LANGUAGE sql AS $$ SELECT * FROM private.nfse_certificates WHERE polo_id=p $$;
 SELECT set_config('request.jwt.claim.role','service_role',false);`);
 await migration(db,'20261112220000_nfse_reconciliation_queue.sql');
 return db;
}
export async function migration(db,name){await db.exec(await fs.readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));}
export async function issue(db,n,state='PROCESSING'){
 await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,month,state,signed_dps_xml,fiscal_input,dps_id,snapshot)
 VALUES($1,$2,'PRODUCAO','2026-11',$3,'synthetic-signed','{}',$4,$5)`,[uid(n),uid(100+n),state,`DPS${n}`,{issuer:{cnpj:issuer}}]);
 await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=now()-interval '1 second' WHERE state='READY'`);
 return (await db.query(`SELECT public.claim_nfse_reconciliation_jobs_internal(20) jobs`)).rows[0].jobs.find(j=>j.operationId===uid(n));
}
export function authorized(n){return `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><infNFSe Id="NFS${accessKey}"><nNFSe>${n}</nNFSe><DPS><infDPS Id="DPS${n}"><tpAmb>1</tpAmb></infDPS></DPS></infNFSe><ds:Signature/></NFSe>`;}
export function authProof(n){return {state:'AUTHORIZED',dpsId:`DPS${n}`,authorizedXml:authorized(n),accessKey,number:String(n)};}
export async function cancel(db,n){
 await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml=$2,result=$3 WHERE id=$1`,[uid(n),authorized(n),{accessKey}]);
 await db.query(`INSERT INTO private.nfse_individual_cancellations(id,operation_id,state,signed_event_xml,event_input,access_key,event_reference_id)
 VALUES($1,$2,'CANCELLATION_PENDING','synthetic-signed','{}',$3,$4)`,[uid(1000+n),uid(n),accessKey,`PRE${n}`]);
 await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=now()-interval '1 second' WHERE state='READY'`);
 return (await db.query(`SELECT public.claim_nfse_reconciliation_jobs_internal(20) jobs`)).rows[0].jobs.find(j=>j.targetId===uid(1000+n));
}
export function cancelProof(n){return {state:'CONFIRMED',cancellationState:'CANCELLED',code:'CONFIRMED',accessKey,eventCode:'101101',eventId:`EVT${accessKey}101101001`,eventXml:`<evento xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><infEvento Id="EVT${accessKey}101101001"><pedRegEvento><infPedReg Id="PRE${n}"><chNFSe>${accessKey}</chNFSe><tpAmb>1</tpAmb><e101101/></infPedReg></pedRegEvento></infEvento><ds:Signature/></evento>`};}
