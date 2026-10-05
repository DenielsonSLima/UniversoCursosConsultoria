import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadEadExpirationTestSetup} from './ead_checkout_expiration_test_setup.mjs';

// PostgreSQL/WASM with synthetic identities; no Supabase, bank or HTTP calls.
const packageUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(packageUrl);
const {pgcrypto}=await import(process.env.PGLITE_MODULE_PATH
  ?new URL('./contrib/pgcrypto.js',packageUrl).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
const source=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo1='00000000-0000-0000-0000-000000000001';
const polo2='00000000-0000-0000-0000-000000000002';
const course='00000000-0000-0000-0000-000000000012';
const turma1='00000000-0000-0000-0000-000000000022';
const turma2=id(2200);
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};
const denied=action=>assert.rejects(action,error=>error.code==='42501');
const list=polo=>scalar('select public.ead_list_payment_reviews_secure($1) value',[polo]);
const context=async({global=false,module=true,tabs=['receber','despesas'],actor=id(999)}={})=>db.query(
  'update test_caixa.access_state set global_allowed=$1,scoped_allowed=true,module_allowed=$2,tabs=$3,actor=$4,role_name=\'authenticated\'',
  [global,module,tabs,actor]);
const seed=async(n,polo,turma,paid)=>{
  await db.exec('begin');
  try {
    await db.query("insert into public.parceiros(id,nome) values($1,'Aluno sintético')",[id(1000+n)]);
    await db.query('insert into public.matriculas(id,turma_id,aluno_id,status) values($1,$2,$3,$4)',
      [id(2000+n),turma,id(1000+n),paid?'ATIVO':'PENDENTE']);
    await db.query(`insert into public.ead_checkout_attempts(id,matricula_id,aluno_id,turma_id,curso_id,
      receivable_id,inscription_id,transaction_id,sequence_number,state)
      values($1,$2,$3,$4,$5,$6,$7,null,1,$8)`,
    [id(3000+n),id(2000+n),id(1000+n),turma,course,id(4000+n),id(5000+n),paid?'PAID':'OPEN']);
    await db.query(`insert into public.contas_receber(id,ead_checkout_attempt_id,polo_id,matricula_id,turma_id,
      cliente_id,status,valor,valor_pago,data_pagamento,data_vencimento,tipo_lancamento,origem_pagamento,
      gateway_provider,gateway_environment,gateway_status,gateway_payment_method,gateway_payment_id,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,99.9,$8,$9,'2026-09-10','MATRICULA',$10,'banese_card','production',$11,
        'BOLETO',$12,now())`,
    [id(4000+n),id(3000+n),polo,id(2000+n),turma,id(1000+n),paid?'PAGO':'PENDENTE',
      paid?99.9:0,paid?'2026-10-03':null,paid?'BANESE':'GATEWAY_EAD',paid?'PAID':'PENDING',String(n).padStart(9,'0')]);
    await db.query(`insert into public.inscricoes_online(id,ead_checkout_attempt_id,matricula_id,turma_id,
      aluno_id,curso_id,receivable_id,status,gateway_provider,gateway_environment,gateway_payment_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,'banese_card','production',$9)`,
    [id(5000+n),id(3000+n),id(2000+n),turma,id(1000+n),course,id(4000+n),paid?'PAGO':'AGUARDANDO_PAGAMENTO',
      String(n).padStart(9,'0')]);
    await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
      provider_code,environment,remote_payment_id,remote_status,payment_method,amount)
      values($1,$2,$3,'banese_card','production',$4,$5,'BOLETO',99.9)`,
    [id(6000+n),id(4000+n),id(5000+n),String(n).padStart(9,'0'),paid?'PAID':'PENDING']);
    if(paid) await db.query(`insert into public.ead_payment_reviews(id,attempt_id,receivable_id,polo_id,reason,evidence)
      values($1,$2,$3,$4,'DUPLICATE_PAYMENT','{}')`,[id(7000+n),id(3000+n),id(4000+n),polo]);
    else await db.query(`insert into public.banese_ead_checkout_expiration_jobs(id,receivable_id,matricula_id,
      inscription_id,transaction_id,attempt_id,environment,state,snapshot,expected_receivable_updated_at,
      expected_inscription_updated_at,expected_transaction_updated_at,first_expiration_day)
      values($1,$2,$3,$4,$5,$6,'production','REVIEW_REQUIRED',internal_contas.ead_expiration_identity($2),
        now(),now(),now(),'2026-09-16')`,
    [id(8000+n),id(4000+n),id(2000+n),id(5000+n),id(6000+n),id(3000+n)]);
    await db.exec('commit');
  } catch(error) {await db.exec('rollback');throw error;}
};

try {
  await loadEadExpirationTestSetup(db);
  // Use the published authorization guard. Supporting identity helpers use
  // explicit, revocable permissions and a concrete allowed polo, not any polo.
  await db.exec(functionSource(source('20260831134030_harden_receivables_filter_scope_rbac.sql'),
    'public.assert_receivables_filter_scope'));
  await db.exec(`alter table test_caixa.access_state add column module_allowed boolean default true,
    add column tabs text[] default array['receber','despesas'];
    create or replace function public.gestor_has_module(p_module text) returns boolean language sql stable as $$
      select module_allowed and p_module='financeiro' from test_caixa.access_state $$;
    create or replace function public.gestor_has_financeiro_tab(p_tab text) returns boolean language sql stable as $$
      select module_allowed and p_tab=any(tabs) from test_caixa.access_state $$;
    create or replace function public.is_gestor_global() returns boolean language sql stable as $$
      select global_allowed from test_caixa.access_state $$;
    create or replace function public.is_gestor_for_polo(p_polo uuid) returns boolean language sql stable as $$
      select global_allowed or (scoped_allowed and p_polo='${polo1}') from test_caixa.access_state $$;
    create or replace function public.gestor_has_any_global_module(p_modules text[]) returns boolean language sql stable as $$
      select module_allowed and global_allowed from test_caixa.access_state $$;
    create or replace function public.gestor_has_any_module_for_polo(p_modules text[],p_polo uuid)
      returns boolean language sql stable as $$ select module_allowed and
        (global_allowed or (scoped_allowed and p_polo='${polo1}')) from test_caixa.access_state $$;
    create or replace function public.is_financeiro_for_polo(p_polo uuid) returns boolean language sql stable as $$
      select module_allowed and (global_allowed or (scoped_allowed and p_polo='${polo1}')) from test_caixa.access_state $$;
    insert into public.turmas(id,curso_id,polo_id) values('${turma2}','${course}','${polo2}');`);
  await seed(1,polo1,turma1,true);await seed(2,polo2,turma2,true);
  await seed(3,polo1,turma1,false);await seed(4,polo2,turma2,false);
  await context();
  await denied(()=>list(null));
  assert.equal((await list(polo1)).length,2,'Control: explicit own polo already works');
  const signature='public.ead_list_payment_reviews_secure(uuid)';
  const metadata=await scalar('select to_jsonb(p)-\'prosrc\' value from pg_proc p where oid=$1::regprocedure',[signature]);
  await db.exec(source('20261005031239_scope_ead_payment_review_reader.sql'));
  assert.deepEqual(await scalar('select to_jsonb(p)-\'prosrc\' value from pg_proc p where oid=$1::regprocedure',[signature]),metadata);
  const own=await list(null);
  assert.equal(own.length,2);assert.ok(own.every(r=>r.poloId===polo1));
  assert.deepEqual(new Set(own.map(r=>r.source)),new Set(['PAYMENT_REVIEW','EXPIRATION_JOB']));
  await denied(()=>list(polo2));
  await context({global:true});assert.equal((await list(null)).length,4);
  assert.equal((await list(polo2)).length,2);
  for(const request of [{module:false},{module:null},{tabs:['despesas']},{tabs:null},{actor:null}]) {
    await context(request);await denied(()=>list(null));await denied(()=>list(polo1));
  }

  const expense=id(9001),request=id(9101);
  await db.query(`insert into public.despesas_lancamentos(id,polo_id,fornecedor_id,status,valor_pago,data_pagamento,
    descricao,anexo_bucket,anexo_path) values($1,$2,$3,'PAGO',99.9,'2026-10-04','Refund sintético','documentos','qa-refund.pdf')`,
  [expense,polo1,id(1001)]);
  const refund=(review=id(7001),requestId=request)=>scalar(
    'select public.ead_resolve_payment_review_secure($1,$2,$3,$4,$5,$6) value',
    [review,requestId,'LINK_CONFIRMED_REFUND',expense,'documentos/qa-refund.pdf','Refund comprovado']);
  await context({tabs:['receber']});await denied(()=>refund());
  assert.equal(await scalar('select state value from public.ead_payment_reviews where id=$1',[id(7001)]),'OPEN');
  assert.equal(await scalar("select count(*) value from public.sistema_eventos where entidade='ead_payment_reviews'"),0);
  await context();await denied(()=>refund(id(7002),id(9102)));
  await context({global:true});
  await assert.rejects(()=>refund(id(7002),id(9102)),error=>error.code==='PT409','Global cannot attach another polo/student expense');
  await context();assert.equal((await refund()).state,'RESOLVED');
  const facts=await scalar('select to_jsonb(r) value from public.ead_payment_reviews r where id=$1',[id(7001)]);
  await context({tabs:['receber']});assert.equal((await refund()).state,'RESOLVED','Existing scoped replay is read-only');
  assert.deepEqual(await scalar('select to_jsonb(r) value from public.ead_payment_reviews r where id=$1',[id(7001)]),facts);
  assert.equal(await scalar("select count(*) value from public.sistema_eventos where entidade='ead_payment_reviews'"),1);
  await context({module:false});await denied(()=>refund());
  await context();await db.exec('update test_caixa.access_state set scoped_allowed=false');await denied(()=>refund());
  for(const forbidden of ['anon','service_role']) assert.equal(
    await scalar('select has_function_privilege($1,$2,\'execute\') value',[forbidden,signature]),false);
  assert.equal(await scalar('select has_function_privilege(\'authenticated\',$1,\'execute\') value',[signature]),true);
  console.log('PASS: real scope guard reproduces local NULL denial; fix exposes only authorized rows in both branches, preserves OID/ACL, denies foreign polos/modules/tabs/students, and refund revocation/replay remains safe.');
} finally {await db.close();}
