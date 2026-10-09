import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { installCaixaFixture } from './fixtures/proesc-v2-growth.caixa.fixture.mjs';

const fixture=await createFixture();
const {db,actor}=fixture;
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].v;
const signature='public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)';
const source=(name)=>readFileSync(new URL(`../review-drafts/proesc-v2-growth/${name}.draft.sql`,import.meta.url),'utf8');
let checks=0;
const pass=(name)=>{checks++;console.log(`PASS ${name}`);};
try {
  const {polo,otherPolo}=await installCaixaFixture(fixture);
  const call=(context='MONTHLY',page=1,size=20,scope=polo,competencia='2026-09-01')=>scalar(
    'select public.get_caixa_review_pending_page_secure($1,$2,$3,$4,$5) v',[scope,competencia,context,page,size]);
  const stable=(response)=>{const copy=structuredClone(response);delete copy.data.geradoEm;return copy;};
  const metadata=()=>scalar(`select to_jsonb(p) v from pg_proc p where oid=$1::regprocedure`,[signature]);
  const beforeMetadata=await metadata();
  assert.equal(await scalar('select md5(prosrc) v from pg_proc where oid=$1::regprocedure',[signature]),
    '2e99bb1426b9f2d3a2a2683c1156de74');
  assert.equal(beforeMetadata.prosecdef,true);
  assert.equal(await scalar('select pg_get_userbyid(proowner) v from pg_proc where oid=$1::regprocedure',[signature]),'postgres');
  assert.deepEqual(beforeMetadata.proconfig,['search_path=""']);
  pass('captured reader hash, owner, SECURITY DEFINER and empty search_path');

  const expected=[];
  for(const mode of ['legacy','legacy-after-drafts','mixed','canonical']) {
    if(mode==='legacy-after-drafts') {
      for(const name of ['01_payload_storage','02_payload_readers','03_payload_writer','04_payload_activation_gate'])
        await db.exec(source(name));
    }
    if(mode==='mixed'||mode==='canonical') await db.exec(`update internal_proesc.v2_invoice_observations
      set normalized_payload_id=internal_proesc.v2_intern_invoice_payload(unit_id,invoice_id,normalized),normalized=null
      where normalized is not null ${mode==='mixed'?"and invoice_id='901'":''}`);
    const monthly=stable(await call());
    assert.equal(monthly.data.totalCount,3);assert.equal(monthly.data.totalNominal,'60.00');
    assert.deepEqual(monthly.data.items.map(x=>x.motivos[0].codigo),
      ['V2_PARTIAL_PAYMENT_REVIEW','V2_SUPERIOR_PAYMENT_REVIEW','V2_PAYMENT_STATUS_REVIEW']);
    assert.equal(monthly.data.items[0].alunoNome,'Pessoa sintética');
    assert.equal(monthly.data.items[0].valorNominal,'10.00');
    assert.equal(monthly.data.items[0].proescRef,'901');
    pass(`${mode}: partial/superior/missing-source reasons and deterministic latest observation`);
    const future=stable(await call('FUTURE'));
    assert.equal(future.data.totalCount,4);assert.equal(future.data.totalNominal,'100.00');
    assert.equal(future.data.items[3].motivos[0].codigo,'SOURCE_NO_PAYMENT_CONFIRMATION');
    const second=stable(await call('MONTHLY',2,2));
    assert.equal(second.data.items.length,1);assert.equal(second.data.totalPages,2);
    assert.equal(second.data.totalCount,3);assert.equal(second.data.totalNominal,'60.00');
    const empty=stable(await call('MONTHLY',4,2));
    assert.deepEqual(empty.data.items,[]);assert.equal(empty.data.totalCount,3);
    expected.push({monthly,future,second,empty});
    assert.equal(await scalar('select count(*)::int v from internal_proesc.v2_invoice_observations'),6);
    assert.deepEqual(await metadata(),beforeMetadata);
    pass(`${mode}: context, pagination, totals and reader metadata preserved`);
    for(const [context,page,size,competencia] of [
      ['INVALID',1,20,'2026-09-01'],['MONTHLY',0,20,'2026-09-01'],
      ['MONTHLY',1,101,'2026-09-01'],['MONTHLY',1,20,null],['MONTHLY',1,20,'infinity'],
    ]) await assert.rejects(call(context,page,size,polo,competencia),error=>error.code==='22023');
    pass(`${mode}: invalid filters fail closed`);
  }
  for(const actual of expected.slice(1)) assert.deepEqual(actual,expected[0]);
  pass('complete JSON parity across legacy, installed legacy, mixed and canonical forms');

  const identity=async(claims,permissions={})=>{
    await db.query("select set_config('request.jwt.claims',$1,false),set_config('fixture.caixa_permissions',$2,false)",
      [JSON.stringify(claims),JSON.stringify(permissions)]);
  };
  const asRole=async(role,body)=>{await db.exec(`set role ${role}`);try{return await body();}finally{await db.exec('reset role');}};
  await identity({role:'service_role'});
  await asRole('service_role',async()=>assert.equal((await call()).success,true));
  pass('service-role branch permitted through real captured authorizer');
  await asRole('anon',()=>assert.rejects(call(),error=>error.code==='42501'));
  pass('anon cannot execute reader');
  const claims={role:'authenticated',sub:actor};
  const scoped={gestor:true,modules:['financeiro'],polos:[polo],tabs:['receber']};
  for(const [name,jwt,permissions,scope] of [
    ['missing identity',{role:'authenticated'},scoped,polo],
    ['not gestor',claims,{...scoped,gestor:false},polo],
    ['wrong polo',claims,scoped,otherPolo],
    ['missing financeiro tab',claims,{...scoped,tabs:[]},polo],
    ['scoped permission does not grant global',claims,scoped,null],
    ['missing module',claims,{...scoped,modules:[]},polo],
  ]) {
    await identity(jwt,permissions);
    await asRole('authenticated',()=>assert.rejects(call('MONTHLY',1,20,scope),error=>error.code==='42501'));
    pass(`real authorizer rejects ${name} with synthetic helper inputs`);
  }
  for(const [name,permissions,scope] of [
    ['financeiro receiving tab',scoped,polo],
    ['caixa module',{...scoped,modules:['caixa'],tabs:[]},polo],
    ['global caixa',{gestor:true,globalModules:['caixa']},null],
    ['global financeiro',{gestor:true,globalModules:['financeiro'],tabs:['receber']},null],
  ]) {
    await identity(claims,permissions);
    await asRole('authenticated',async()=>assert.equal((await call('MONTHLY',1,20,scope)).data.totalCount,3));
    pass(`real authorizer accepts ${name} with synthetic helper inputs`);
  }
  await identity({role:'service_role'});
  await db.exec(`alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_payload_identity_fk;
    alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_one_payload;`);
  assert.equal((await scalar('select internal_proesc.v2_set_payload_storage_enabled(true) v')).enabled,true);
  const reader=readFileSync(new URL('./fixtures/proesc-v2-growth/fixture_caixa_review_reader.sql',import.meta.url),'utf8');
  await db.exec(reader.replace('A situação financeira precisa ser conferida','DRIFT A situação financeira precisa ser conferida'));
  await assert.rejects(scalar('select internal_proesc.v2_set_payload_storage_enabled(true) v'),/Metadata reader drift/);
  assert.equal((await scalar('select internal_proesc.v2_set_payload_storage_enabled(false) v')).enabled,false);
  await db.exec(reader);
  pass('post-install Caixa source drift blocks ON while OFF remains available');
  console.log(JSON.stringify({result:'PASS',checks,
    limits:['Synthetic position rows; upstream position calculation is not reproduced',
      'Real captured authorizer with stubbed auth/permission helpers; not a complete production RBAC proof',
      'Single backend; no concurrent flag-change proof in this test']},null,2));
}finally{await db.close();}
