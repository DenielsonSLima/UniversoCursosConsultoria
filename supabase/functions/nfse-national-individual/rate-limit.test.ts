import assert from 'node:assert/strict';
import {isRateLimitExceeded} from '../_shared/http.ts';
import type {IndividualCommand} from './contract.ts';
import {individualCommandRateLimited,individualEntryRateLimited} from './rate-limit.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope = {contextKey:uuid(1),poloId:uuid(2),environment:'PRODUCAO' as const,month:'2026-11'};
const command = (action: IndividualCommand['action'], n=3): IndividualCommand => ({
  scope,action,requestId:uuid(n),previewId:uuid(4),
  ...(action==='OBSERVE_CANCEL'?{cancelPreviewId:uuid(5)}:{}),
});
const ip = () => `synthetic-${crypto.randomUUID()}`;

Deno.test('forty automatic ledger reads do not consume the original eight fiscal commands',()=>{
  const address=ip(),actor=uuid(6);
  for(let n=0;n<40;n++) {
    assert.equal(individualEntryRateLimited(address,isRateLimitExceeded),false);
    assert.equal(individualCommandRateLimited(address,command(n%2?'OBSERVE_CANCEL':'OBSERVE'),actor,isRateLimitExceeded),false);
  }
  for(let n=0;n<8;n++) {
    assert.equal(individualEntryRateLimited(address,isRateLimitExceeded),false);
    assert.equal(individualCommandRateLimited(address,command('ISSUE'),actor,isRateLimitExceeded),false);
  }
  assert.equal(individualCommandRateLimited(address,command('ISSUE'),actor,isRateLimitExceeded),true,'ninth ISSUE remains blocked');
  assert.equal(individualCommandRateLimited(address,command('OBSERVE'),actor,isRateLimitExceeded),false,'fiscal throttling does not stop ledger observation');
});

Deno.test('fiscal commands retain the exact shared IP bucket across actors, scopes and actions',()=>{
  const address=ip();
  for(const action of ['PREVIEW','PREVIEW_QUEUE','ISSUE','RECONCILE','CANCEL_PREVIEW','CANCEL','RETRY_CANCEL','RECONCILE_CANCEL'] as const) {
    assert.equal(individualCommandRateLimited(address,command(action),uuid(10),isRateLimitExceeded),false);
  }
  assert.equal(isRateLimitExceeded(`nfse-individual:${address}`,8,60_000),true,'same legacy key and threshold');
  assert.equal(individualCommandRateLimited(address,{...command('CANCEL'),scope:{...scope,poloId:uuid(11)}},uuid(12),isRateLimitExceeded),true);
});

Deno.test('read budget binds verified actor and scope, not request IDs or a supplied actor field',()=>{
  const address=ip(),verified=uuid(20);
  for(let n=0;n<120;n++) {
    const input={...command(n%2?'OBSERVE':'OBSERVE_CANCEL',100+n),actorId:uuid(1000+n)};
    assert.equal(individualCommandRateLimited(address,input,verified,isRateLimitExceeded),false);
  }
  assert.equal(individualCommandRateLimited(address,command('OBSERVE',999),verified,isRateLimitExceeded),true);
  assert.equal(individualCommandRateLimited(address,command('OBSERVE'),uuid(21),isRateLimitExceeded),false,'another verified actor has an independent read budget');
  assert.equal(individualCommandRateLimited(address,{...command('OBSERVE'),scope:{...scope,poloId:uuid(22)}},verified,isRateLimitExceeded),false,'authorized scopes are independent');
});

Deno.test('several operators can observe behind one IP while total reads and entry abuse remain bounded',()=>{
  const address=ip();
  for(let n=0;n<240;n++) {
    assert.equal(individualEntryRateLimited(address,isRateLimitExceeded),false);
    assert.equal(individualCommandRateLimited(address,command('OBSERVE'),uuid(30+Math.floor(n/80)),isRateLimitExceeded),false);
  }
  assert.equal(individualCommandRateLimited(address,command('OBSERVE'),uuid(40),isRateLimitExceeded),true,'IP read cap applies across actors');
  for(let n=0;n<8;n++) {
    assert.equal(individualEntryRateLimited(address,isRateLimitExceeded),false,'read cap leaves entry room for fiscal commands');
    assert.equal(individualCommandRateLimited(address,command('CANCEL'),uuid(41),isRateLimitExceeded),false);
  }
  const abusive=ip();
  for(let n=0;n<256;n++)assert.equal(individualEntryRateLimited(abusive,isRateLimitExceeded),false);
  assert.equal(individualEntryRateLimited(abusive,isRateLimitExceeded),true);
});
