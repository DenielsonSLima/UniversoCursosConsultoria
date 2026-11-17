import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../migrations/20261117133452_nfse_accounting_tax_summary.sql',import.meta.url),'utf8');
test('RPC CBS/IBS é read-only com autorização por unidade, ambiente e escopo',()=>{
  assert.match(sql,/STABLE SECURITY DEFINER SET search_path=''/);
  assert.equal((sql.match(/PERFORM private.authorize_nfse_model_scope/g)||[]).length,2);
  assert.match(sql,/v.environment=p_environment/);
  assert.match(sql,/v.polo_id=v_polo\."poloId"/);
  assert.match(sql,/TO authenticated/);
  assert.doesNotMatch(sql,/\b(INSERT INTO|UPDATE\s+private\.|DELETE FROM)\b/i);
});
test('totais fiscais vêm exclusivamente dos caminhos canônicos de XML autorizado',()=>{
  assert.match(sql,/nf:IBSCBS\/nf:totCIBS\/nf:gCBS\/nf:vCBS/);
  assert.match(sql,/nf:IBSCBS\/nf:totCIBS\/nf:gIBS\/nf:vIBSTot/);
  assert.match(sql,/THEN private.nfse_accounting_xml_fields_v3\(v_raw.authorized_xml\)/);
  assert.match(sql,/v_raw.issue_state='AUTHORIZED' AND NOT v_raw.cancelled_confirmed/);
  assert.match(sql,/INTO v_taxes FROM jsonb_array_elements\(v_valid_rows\)/);
  for(const key of ['cbsAmount','ibsAmount']) assert(sql.includes(`count(*)>0 AND count(*)=count(value->>'${key}')`));
  assert.match(sql,/octet_length\(p_xml\)>4500000/);
  assert.match(sql,/<!DOCTYPE/); assert.match(sql,/<!ENTITY/);
  assert.doesNotMatch(sql,/coalesce\(sum\(\(value->>'(?:cbsAmount|ibsAmount)'/);
});
