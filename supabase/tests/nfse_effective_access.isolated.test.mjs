import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('NFS-e respeita permissão efetiva sem lista piloto e mantém autorização', async t => {
  const db = new PGlite();
  const allowed = async (context = id(1)) => (await db.query('select public.get_nfse_access_secure($1) value', [context])).rows[0].value;
  const user = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
  try {
    await db.exec(`create schema auth;create schema private;
      create role anon;create role authenticated;create role service_role;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.gestor_schedule_allows_access() returns boolean language sql as
        $$select coalesce(nullif(current_setting('test.schedule',true),'')::boolean,true)$$;
      create function public.is_active_status(text) returns boolean language sql as $$select lower(trim($1))='ativo'$$;
      create table public.perfis_acesso(id uuid primary key,permissoes jsonb);
      create table public.usuarios_sistema(id uuid primary key,auth_user_id uuid,status text,perfil text,
        perfil_acesso_id uuid,personalizar_permissoes boolean,permissoes jsonb);
      create table private.nfse_access_grants(usuario_id uuid primary key,auth_user_id uuid);
      revoke all on schema private from public,anon,authenticated;
      revoke all on private.nfse_access_grants from public,anon,authenticated;
      insert into public.perfis_acesso values('${id(90)}','{"modules":["emissor-nfse"]}');
      insert into public.usuarios_sistema values
        ('${id(1)}','${id(11)}','Ativo','Gestor',null,true,'{"modules":["emissor-nfse"]}'),
        ('${id(2)}','${id(12)}','Ativo','Gestor','${id(90)}',false,'{"modules":[]}'),
        ('${id(3)}','${id(13)}','Ativo','Gestor','${id(90)}',true,'{"modules":[]}');`);
    await db.exec(await readFile(new URL('../migrations/20261112134516_nfse_effective_module_access.sql', import.meta.url), 'utf8'));
    await t.test('módulo explicitamente liberado funciona sem grant legado', async () => {
      await user(11);assert.equal(await allowed(),true);
      assert.equal((await db.query('select count(*)::int count from private.nfse_access_grants')).rows[0].count,0);
    });
    await t.test('perfil herdado e preferência individual preservados', async () => {
      await user(12);assert.equal(await allowed(id(2)),true);
      await user(13);assert.equal(await allowed(id(3)),false);
    });
    await t.test('revogar módulo/perfil bloqueia mesmo com grant antigo', async () => {
      await user(11);await db.exec(`insert into private.nfse_access_grants values('${id(1)}','${id(11)}');
        update public.usuarios_sistema set permissoes='{"modules":[]}' where id='${id(1)}';`);
      assert.equal(await allowed(),false);
      await db.exec(`update public.usuarios_sistema set permissoes='{"modules":["emissor-nfse"]}' where id='${id(1)}';
        update public.perfis_acesso set permissoes='{"modules":[]}' where id='${id(90)}';`);
      await user(12);assert.equal(await allowed(id(2)),false);
      await db.exec(`update public.perfis_acesso set permissoes='{"modules":["emissor-nfse"]}' where id='${id(90)}';`);
    });
    await t.test('contexto de outra pessoa, nulo ou anônimo não autorizam', async () => {
      await user(11);assert.equal(await allowed(id(2)),false);assert.equal(await allowed(null),false);
      await user(null);assert.equal(await allowed(),false);
    });
    await t.test('inatividade, perfil não gestor e horário bloqueiam', async () => {
      await user(11);
      await db.exec(`update public.usuarios_sistema set status='Inativo' where id='${id(1)}'`);assert.equal(await allowed(),false);
      await db.exec(`update public.usuarios_sistema set status='Ativo',perfil='Aluno' where id='${id(1)}'`);assert.equal(await allowed(),false);
      await db.exec(`update public.usuarios_sistema set perfil='Gestor' where id='${id(1)}';set test.schedule='false'`);assert.equal(await allowed(),false);
      await db.exec("set test.schedule='true'");assert.equal(await allowed(),true);
    });
    await t.test('permissões malformadas não liberam e clientes não acessam lista privada', async () => {
      await user(11);
      for (const malformed of [null,{}, { modules:'emissor-nfse' }, { modules:['financeiro'] }]) {
        await db.query('update public.usuarios_sistema set permissoes=$1 where id=$2',[malformed,id(1)]);
        assert.equal(await allowed(),false);
      }
      await db.exec(`update public.usuarios_sistema set permissoes='{"modules":["emissor-nfse"]}' where id='${id(1)}'`);
      assert.equal((await db.query("select has_function_privilege('anon','public.get_nfse_access_secure(uuid)','EXECUTE') value")).rows[0].value,false);
      assert.equal((await db.query("select has_function_privilege('authenticated','public.get_nfse_access_secure(uuid)','EXECUTE') value")).rows[0].value,true);
      assert.equal((await db.query("select has_schema_privilege('authenticated','private','USAGE') value")).rows[0].value,false);
    });
    await t.test('ações fiscais continuam validando polo ativo, ambiente e contexto', async () => {
      await db.exec(`create table public.polos(id uuid primary key,status text);
        insert into public.polos values('${id(101)}','ativo'),('${id(102)}','ativo'),('${id(103)}','inativo');
        create function public.portal_listar_perfis() returns table(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
        language sql as $$select 'GESTOR','${id(1)}'::uuid,false,array['${id(101)}'::uuid,'${id(103)}'::uuid]$$;`);
      const original = await readFile(new URL('../migrations/20261108225453_nfse_models_private_store.sql',import.meta.url),'utf8');
      const start = original.indexOf('CREATE FUNCTION private.authorize_nfse_model_scope(');
      const end = original.indexOf('CREATE FUNCTION public.get_nfse_models_secure');
      await db.exec(original.slice(start,end));
      const scope = (polo=id(101),context=id(1),environment='PRODUCAO') => db.query('select private.authorize_nfse_model_scope($1,$2,$3,$4)',[context,polo,environment,'2026-11']);
      await user(11);await scope();
      await assert.rejects(()=>scope(id(102)),/Polo fora/);
      await assert.rejects(()=>scope(id(103)),/Polo fora/);
      await assert.rejects(()=>scope(id(101),id(2)),/não autorizado/);
      await assert.rejects(()=>scope(id(101),id(1),'OUTRO'),/inválido/);
      await db.exec(`update public.usuarios_sistema set permissoes='{"modules":[]}' where id='${id(1)}'`);
      await assert.rejects(()=>scope(),/não autorizado/);
    });
  } finally {await db.close();}
});
