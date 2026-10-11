import assert from 'node:assert/strict';
import test from 'node:test';
import { createInviteFixture, ids } from './fixtures/student-invite-state-harness.mjs';

const cas = 'public.portal_atualizar_acesso_aluno_por_gestor_cas';
const fields = ['tipo','status','email','cpf_cnpj','polo_id','polo_ids','auth_user_id',
  'auth_login_email','acesso_status','troca_senha_obrigatoria','senha_atualizada_em',
  'senha_temporaria_pendente','senha_temporaria_emitida_em','senha_temporaria_emissao_id',
  'senha_temporaria_emissao_iniciada_em','senha_temporaria_emissao_senha_alterada_em',
  'acesso_ativado_em','convite_enviado_em','aceitou_termos_uso','termos_uso_versao'];
const expected = row => Object.fromEntries(fields.map(key => [key,row[key] ?? null]));
const isolated = async (options, run) => {
  const f = await createInviteFixture(options);
  try { await run(f); } finally { await f.close(); }
};
const call = (f, snapshot = expected(f.snapshot), patch = {}, actor = ids.actor) => f.db.query(
  `SELECT ${cas}($1,$2,$3::jsonb,$4::jsonb) AS row`,[actor,ids.student,JSON.stringify(snapshot),JSON.stringify(patch)]);
const deny = (operation, code = '42501') => assert.rejects(operation,error => error.code === code);
const revoke = {
  status: f => f.db.query('UPDATE public.usuarios_sistema SET status=$1 WHERE id=$2',['Inativo',ids.actorRecord]),
  institutional: f => f.db.query(`UPDATE public.usuarios_sistema
    SET primeiro_acesso_institucional_pendente=true, acesso_institucional_origem='CONVITE',
      senha_institucional_criada_em=NULL WHERE id=$1`,[ids.actorRecord]),
  module: f => f.db.query('UPDATE public.usuarios_sistema SET permissoes=$1::jsonb WHERE id=$2',
    [JSON.stringify({allPolos:true,modules:[]}),ids.actorRecord]),
  scope: f => f.db.query('UPDATE public.usuarios_sistema SET context=$1,polo_ids=$2::uuid[],permissoes=$3::jsonb WHERE id=$4',
    [ids.other,`{${ids.other}}`,JSON.stringify({allPolos:false,modules:['parceiros']}),ids.actorRecord]),
  inherited: f => f.db.query('UPDATE public.perfis_acesso SET permissoes=$1::jsonb WHERE id=$2',
    [JSON.stringify({modules:[]}),ids.other]),
  matrix: f => f.db.query('UPDATE public.polos SET is_matriz=false WHERE id=$1',[ids.other]),
};
const inherited = async f => {
  await f.db.query('INSERT INTO public.perfis_acesso(id,permissoes) VALUES ($1,$2::jsonb)',
    [ids.other,JSON.stringify({modules:['parceiros']})]);
  await f.db.query('UPDATE public.usuarios_sistema SET perfil_acesso_id=$1,personalizar_permissoes=false WHERE id=$2',
    [ids.other,ids.actorRecord]);
};
const rejectedResponse = async (response, sent = false) => {
  assert.equal(response.status,403);
  const body = await response.json();
  assert.equal(body.success,false);
  assert.equal(body.code,'GESTOR_ACESSO_REVOGADO_DURANTE_ENVIO');
  assert.equal(body.recoveryLink,null);
  assert.equal(body.recoveryEmailSent,sent);
  assert.equal('userId' in body,false);
  return body;
};

for (const kind of Object.keys(revoke)) {
  test(`actor ${kind} revoked during generateLink cannot write or release the recovery`, () => isolated({},async f => {
    if(kind === 'inherited') await inherited(f);
    if(kind === 'matrix') {
      await f.db.query('INSERT INTO public.polos(id,is_matriz,status) VALUES ($1,true,$2)',[ids.other,'Ativo']);
      await f.db.query('UPDATE public.usuarios_sistema SET context=$1 WHERE id=$2',[ids.other,ids.actorRecord]);
    }
    let before;
    f.hooks.generateLink = async () => { before=await f.row(); await revoke[kind](f); };
    await rejectedResponse(await f.run());
    assert.deepEqual(await f.row(),before);
    assert.equal(f.counts.applied,2);
    assert.equal(f.counts.recovery,1);
  }));
}

test('revocation at the checkpoint prevents dispatch, including a manual fallback after HTTP failed', () => isolated({email:true},async f => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async () => { f.counts.emails+=1; await revoke.module(f);
    return new Response('{}',{status:503}); };
  try {
    const before=await f.row();
    await rejectedResponse(await f.run());
    assert.equal(f.counts.emails,1);
    assert.equal(f.counts.recovery,0);
    const after=await f.row();
    assert.equal(after.aceitou_termos_uso,before.aceitou_termos_uso);
    assert.equal(after.senha_atualizada_em,before.senha_atualizada_em);
    assert.equal(f.counts.applied,2);
  } finally {globalThis.fetch=originalFetch;}
}));

test('checkpoint revocation prevents a recovery from starting', () => isolated({},async f => {
  f.hooks.beforeCheckpoint=() => revoke.status(f);
  await rejectedResponse(await f.run());
  assert.equal(f.counts.recovery,0);
  assert.equal(f.counts.applied,2);
}));

test('email already accepted remains sent on final actor refusal, without final state mutation', () => isolated({email:true},async f => {
  let before;
  f.hooks.email=async () => {before=await f.row();await revoke.status(f);};
  const body=await rejectedResponse(await f.run(),true);
  assert.match(body.error,/já foi enviado/);
  assert.deepEqual(await f.row(),before);
  assert.equal(f.counts.emails,1);
  assert.equal(f.counts.applied,2);
}));

test('an invitation already accepted reports its delivery but cannot bind after revocation', () => isolated({unlinked:true},async f => {
  let before;
  f.hooks.invite=async () => { before=await f.row(); await revoke.status(f); };
  const response=await f.run();
  assert.equal(response.status,403);
  const body=await response.json();
  assert.equal(body.success,false);
  assert.equal(body.inviteSent,true);
  assert.equal(body.recoveryLink,null);
  assert.equal('userId' in body,false);
  assert.deepEqual(await f.row(),before);
  assert.equal(f.counts.invites,1);
  assert.equal(f.counts.applied,1);
}));

test('invitation checkpoint denies dispatch without binding when its actor is revoked', () => isolated({unlinked:true},async f => {
  f.hooks.beforeCheckpoint=() => revoke.status(f);
  await rejectedResponse(await f.run());
  assert.equal(f.counts.invites,0);
  assert.equal(f.counts.applied,1);
  assert.equal((await f.row()).auth_user_id,null);
}));

test('checkpoint has no UPDATE and the final RPC returns AFTER-trigger state', () => isolated({},async f => {
  await f.db.exec(`CREATE TABLE public.test_update_count(n integer); INSERT INTO public.test_update_count VALUES(0);
    CREATE FUNCTION public.test_count_update() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN UPDATE public.test_update_count SET n=n+1; RETURN NEW; END;$body$;
    CREATE TRIGGER test_count_update AFTER UPDATE ON public.parceiros FOR EACH ROW EXECUTE FUNCTION public.test_count_update();
    CREATE FUNCTION public.test_after_update() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN IF NEW.acesso_status='processando' THEN UPDATE public.parceiros SET acesso_status='pendente' WHERE id=NEW.id; END IF;
      RETURN NEW; END;$body$;
    CREATE TRIGGER test_after_update AFTER UPDATE OF acesso_status ON public.parceiros FOR EACH ROW EXECUTE FUNCTION public.test_after_update();`);
  const before=await f.row();
  assert.deepEqual((await call(f)).rows[0].row,before);
  assert.equal((await f.db.query('SELECT n FROM public.test_update_count')).rows[0].n,0);
  const result=(await call(f,expected(before),{acesso_status:'processando'})).rows[0].row;
  assert.equal(result.acesso_status,'pendente');
  assert.deepEqual(result,await f.row());
}));

test('RPC ACL, mandatory actor, role, complete snapshot and patch allowlist fail closed', () => isolated({},async f => {
  const signature=cas+'(uuid,uuid,jsonb,jsonb)';
  const {rows}=await f.db.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') anon,
    has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
    has_function_privilege('service_role',$1,'EXECUTE') service`,[signature]);
  assert.deepEqual(rows[0],{anon:false,authenticated:false,service:true});
  await f.db.exec('SET ROLE authenticated');
  await deny(() => call(f));
  await f.db.exec('RESET ROLE');
  await deny(() => call(f,expected(f.snapshot),{},null),'22023');
  await f.db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)");
  await deny(() => call(f));
  await f.db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)");
  const incomplete=expected(f.snapshot);delete incomplete.senha_atualizada_em;
  await deny(() => call(f,incomplete),'22023');
  await deny(() => call(f,expected(f.snapshot),{aceitou_termos_uso:true}),'22023');
  await deny(() => call(f,expected(f.snapshot),{encrypted_password:'not-allowed'}),'22023');
  await deny(() => call(f,expected(f.snapshot),{senha_atualizada_em:'invalid-date'}),'22023');
  assert.deepEqual(await f.row(),f.snapshot);
}));

test('revalidation under actor locks denies a changed second context before writes', () => isolated({},async f => {
  await f.db.exec(`ALTER FUNCTION public.portal_identidade_exigir_service_role_actor(uuid) RENAME TO test_original_actor;
    CREATE TABLE public.test_actor_reads(n integer);INSERT INTO public.test_actor_reads VALUES(0);
    CREATE FUNCTION public.portal_identidade_exigir_service_role_actor(p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $body$
    DECLARE n integer; BEGIN UPDATE public.test_actor_reads SET n=test_actor_reads.n+1 RETURNING test_actor_reads.n INTO n;
      IF n>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='GESTOR_PARCEIROS_NAO_AUTORIZADO'; END IF;
      RETURN public.test_original_actor(p_actor); END;$body$;`);
  await deny(() => call(f,expected(f.snapshot),{acesso_status:'processando'}));
  assert.deepEqual(await f.row(),f.snapshot);
}));

test('missing RPC never falls back to direct UPDATE or Auth dispatch', () => isolated({rpcMissing:true},async f => {
  const response=await f.run();
  assert.equal(response.status,500);
  assert.equal((await response.json()).recoveryLink,null);
  assert.equal(f.counts.applied,0);
  assert.equal(f.counts.recovery,0);
  assert.equal(f.counts.invites,0);
  assert.deepEqual(await f.row(),f.snapshot);
}));
