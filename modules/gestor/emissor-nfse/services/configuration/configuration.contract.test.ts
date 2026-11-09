import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseConfigurationService, configurationDefinition } from './configuration.service-core';
import type { NfseConfigurationDefinition } from './configuration.types';
import type { NfseScope } from '../../types/nfse.types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope: NfseScope = { contextKey:id(10),poloId:id(2),environment:'HOMOLOGACAO',month:'2026-11' };
const definition: NfseConfigurationDefinition = {
  municipalityCode:'2802908',municipalRegistration:'',portalAccess:'CERTIFICATE',credentialSource:'MATRIZ',
  opSimpNac:'1',regEspTrib:'0',regApTribSN:null,
};
const metadata = () => ({
  ...definition,poloId:scope.poloId,environment:scope.environment,cnpj:'00000000000200',
  municipalRegistration:null,version:1,configured:true,
  certificate:{configured:false,subject:null,expiresAt:null},portalLoginConfigured:false,canManage:true,
  readiness:{status:'BLOCKED',message:'Aguardando validação fiscal.'},
});
const envelope = (data: unknown) => ({version:1,scope,data});

test('configuration remains unavailable without its explicit rollout, even for a valid scope',async()=>{
  let calls=0;
  const service=createNfseConfigurationService(async()=>{calls++; return null;});
  await assert.rejects(service.get(scope));
  await assert.rejects(service.save(scope,{requestId:id(50),expectedVersion:0,definition}));
  assert.equal(calls,0);
});

test('getter projects declared metadata, excludes extra material and rejects scope mismatch',async()=>{
  const service=createNfseConfigurationService(async()=>envelope({...metadata(),secret:'synthetic-unexpected-field',
    certificate:{...metadata().certificate,privateKey:'synthetic-unexpected-field'}}),true);
  const result=await service.get(scope);
  assert.equal('secret' in result,false);
  assert.equal('privateKey' in result.certificate,false);
  const changed=createNfseConfigurationService(async()=>({...envelope(metadata()),scope:{...scope,month:'2026-10'}}),true);
  await assert.rejects(changed.get(scope));
});

test('configuration cannot fabricate readiness or certificate verification',async()=>{
  for (const changed of [{readiness:{status:'READY',message:'unexpected'}},
    {certificate:{configured:true,subject:null,expiresAt:null}},{portalLoginConfigured:true},
    {configured:false},{environment:'PRODUCAO'}]) {
    await assert.rejects(createNfseConfigurationService(async()=>envelope({...metadata(),...changed}),true).get(scope));
  }
});

test('parsed certificate metadata can be displayed while fiscal readiness stays blocked',async()=>{
  const service=createNfseConfigurationService(async()=>envelope({...metadata(),
    certificate:{configured:true,subject:'A1 · synthetic certificate',expiresAt:'2040-01-01T00:00:00Z'}}),true);
  const result=await service.get(scope);
  assert.equal(result.certificate.configured,true); assert.equal(result.readiness.status,'BLOCKED');
});

test('save submits exact metadata and expected revision, with no certificate payload',async()=>{
  let captured: Record<string,unknown> | undefined;
  const service=createNfseConfigurationService(async(name,args)=>{
    assert.equal(name,'save_nfse_configuration_secure'); captured=args;
    return envelope({id:scope.poloId,version:1,message:'Saved'});
  },true);
  await service.save(scope,{requestId:id(50),expectedVersion:0,
    definition:{...definition,password:'synthetic-unexpected-field'} as NfseConfigurationDefinition});
  assert.deepEqual(captured?.p_definition,definition);
  assert.equal(captured?.p_expected_version,0);
});

test('national regime enums include Other (9), optional Simples assessment and explicit contradictions',()=>{
  assert.equal(configurationDefinition({...definition,regEspTrib:'9'}).regEspTrib,'9');
  assert.equal(configurationDefinition({...definition,opSimpNac:'3'}).regApTribSN,null);
  assert.equal(configurationDefinition({...definition,opSimpNac:'3',regApTribSN:'2'}).regApTribSN,'2');
  for (const changed of [{regEspTrib:'7'},{regApTribSN:'1'},{municipalityCode:'0000000'},
    {municipalityCode:'9900000'},{municipalRegistration:'bad\nIM'},{municipalRegistration:'x'.repeat(16)}]) {
    assert.throws(()=>configurationDefinition({...definition,...changed} as NfseConfigurationDefinition));
  }
});
