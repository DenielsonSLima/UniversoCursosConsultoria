import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.NFSE_ACCOUNTING_PGLITE_MODULE || process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite }=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const xml=(document='<CPF>00100200300</CPF>',code='2801108')=>`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><DPS><infDPS><toma>${document}<end><endNac><cMun>${code}</cMun></endNac></end></toma></infDPS></DPS></infNFSe></NFSe>`;
test('issued recipient projection is read-only, XML-backed and fails closed',async()=>{
 const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('./nfse_issued_period.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`create table public.catalogo_municipios_ibge(codigo_ibge text,nome text,uf text,ativo boolean);
    insert into public.catalogo_municipios_ibge values('2801108','Canhoba','SE',true);`);
  const sql=await readFile(new URL('../migrations/20261112140440_nfse_issued_recipient_details.sql',import.meta.url),'utf8');
  await db.exec(sql);
  const fields=async value=>(await db.query('select private.nfse_issued_recipient_details($1) data',[value])).rows[0].data;
  assert.deepEqual(await fields(xml()),{recipientDocument:'00100200300',recipientCity:'Canhoba',recipientState:'SE'});
  assert.equal((await fields(xml('<CNPJ>00100203000100</CNPJ>'))).recipientDocument,'00100203000100');
  assert.equal((await fields(xml('<CPF>00100200300</CPF>','0000000'))).recipientCity,null);
  for(const invalid of [null,'<broken','<!DOCTYPE NFSe>'+xml(),xml().replace('http://www.sped.fazenda.gov.br/nfse','https://wrong'),xml('<CPF>00100200300</CPF><CNPJ>00100203000100</CNPJ>')])
    assert.deepEqual(await fields(invalid),{});
  assert.equal((await db.query("select has_function_privilege('authenticated','private.nfse_issued_recipient_details(text)','EXECUTE') allowed")).rows[0].allowed,false);
 } finally {await db.close();}
});
