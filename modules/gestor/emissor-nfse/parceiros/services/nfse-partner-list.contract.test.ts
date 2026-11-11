import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseContractError } from '../../services/nfse.errors';
import { createNfsePartnerServices } from './nfse-partner-services.service-core';
import { createPartnerRemovalAttempt, parsePartnerRemoval, partnerRemovalInput, partnerServiceFilters } from './nfse-partner-list.contract';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';
import { NFSE_PARTNER_SERVICE_FILTERS as empty } from '../types/nfse-partner-services.types';
import type { NfseScope } from '../../types/nfse.types';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
test('filters and query identity cover every server input without hiding non-PJ records', async () => {
  assert.deepEqual(partnerServiceFilters(empty), {p_search:null,p_date_from:null,p_date_to:null,p_partner_type:null});
  const filters = {...empty, search:' Teste ',dateFrom:'2026-11-01',dateTo:'2026-11-30',partnerType:'PJ' as const};
  const service = createNfsePartnerServices(async (name,args) => {
    assert.equal(name,'get_nfse_partner_services_v2_secure');
    assert.equal(args.p_search,'Teste'); assert.equal(args.p_partner_type,'PJ'); assert.equal(args.p_date_to,'2026-11-30');
    return {version:1,scope,data:{rows:[],page:2,pageSize:50,totalItems:51,totalAmount:'50.00'}};
  });
  assert.equal((await service.list(scope,2,undefined,filters)).totalItems,51);
  for (const changed of [{search:'Other'},{dateFrom:'2026-11-02'},{dateTo:'2026-11-29'},{partnerType:'PF' as const}]) {
    assert.notDeepEqual(nfsePartnerServicesKeys.list(scope,1,filters),nfsePartnerServicesKeys.list(scope,1,{...filters,...changed}));
  }
  for (const changed of [{search:'x'.repeat(101)},{dateFrom:'2026-02-30'},{dateFrom:'0002-01-01'},
    {dateFrom:'2026-11-20',dateTo:'2026-11-01'}]) assert.throws(()=>partnerServiceFilters({...empty,...changed}),NfseContractError);
});
test('removal validates selected ids, scope echo and full server acknowledgment', async () => {
  const input={requestId:id(9),serviceIds:[id(4),id(3)]};
  assert.deepEqual(partnerRemovalInput(input).p_service_ids,[id(3),id(4)]);
  for (const serviceIds of [[],[id(3),id(3)],['bad'],Array.from({length:101},(_,i)=>id(i))])
    assert.throws(()=>partnerRemovalInput({...input,serviceIds}),NfseContractError);
  const result={id:id(10),serviceIds:[id(3),id(4)],removedCount:2,message:'Preservado'};
  assert.equal(parsePartnerRemoval(result,input.serviceIds).removedCount,2);
  for (const changed of [{removedCount:1},{serviceIds:[id(3)]},{serviceIds:[id(3),id(5)]}])
    assert.throws(()=>parsePartnerRemoval({...result,...changed},input.serviceIds),NfseContractError);
  const service=createNfsePartnerServices(async(name,args)=>{
    assert.equal(name,'remove_nfse_partner_services_secure'); assert.deepEqual(args.p_service_ids,[id(3),id(4)]);
    return {version:1,scope,data:result};
  });
  assert.equal((await service.remove(scope,input)).removedCount,2);
  const crossed=createNfsePartnerServices(async()=>({version:1,scope:{...scope,poloId:id(99)},data:result}));
  await assert.rejects(crossed.remove(scope,input),NfseContractError);
});
test('uncertain response reuses original idempotency key only for same context and selection',()=>{
  let n=50; const attempt=createPartnerRemovalAttempt(()=>id(n++));
  const a=attempt(scope,[id(3),id(4)]); assert.deepEqual(attempt(scope,[id(4),id(3)]),a);
  assert.notEqual(attempt(scope,[id(3)]).requestId,a.requestId);
  const b=attempt(scope,[id(3)]); assert.notEqual(attempt({...scope,environment:'HOMOLOGACAO'},[id(3)]).requestId,b.requestId);
});
