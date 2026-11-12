import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('service partner search includes trade names while preserving authorization, scope, valid documents and limit', async t => {
  const db = new PGlite();
  const scope = [id(1), id(2), 'PRODUCAO', '2026-11'];
  const search = async (term, selected = null, explicitScope = scope) => (await db.query(
    'SELECT public.search_nfse_service_partners_secure($1,$2,$3,$4,$5,$6) AS result', [...explicitScope, term, selected])).rows[0].result;
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE SCHEMA private;CREATE SCHEMA extensions;
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,nome_fantasia text,cpf_cnpj text,tipo text,status text,polo_id uuid,polo_ids uuid[]);
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)='ativo'$$;
      CREATE FUNCTION extensions.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT translate($1,'ãáéíóúçÃÁÉÍÓÚÇ','aaeioucAAEIOUC')$$;
      CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
        IF current_setting('test.allowed',true) IS DISTINCT FROM 'true' OR $1<>'${id(1)}'::uuid OR $2<>'${id(2)}'::uuid
          OR $3<>'PRODUCAO' OR $4<>'2026-11' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
      END$$;SET test.allowed='true';`);
    const store = await sql('20261110190702_nfse_fiscal_review_store.sql');
    const start = store.indexOf('CREATE FUNCTION private.nfse_review_valid_document(');
    await db.exec(store.slice(start, store.indexOf('$function$;', start) + 12));
    await db.exec(await sql('20261111004631_nfse_service_partner_search.sql'));
    await db.query(`INSERT INTO public.parceiros VALUES
      ($1,'MUNICIPIO SINTETICO','Prefeitura São Teste','00.000.000/0001-91','PJ','ativo',$7,NULL),
      ($2,'ALUNO SINTETICO',NULL,'00000000191','Aluno','ativo',$7,NULL),
      ($3,'PJ OUTRA UNIDADE','Prefeitura São Externa','00000000000191','PJ','ativo',$8,NULL),
      ($4,'PJ INATIVA','Prefeitura São Inativa','00000000000191','PJ','inativo',$7,NULL),
      ($5,'PJ INVALIDA','Prefeitura São Invalida','00000000000000','PJ','ativo',$7,NULL),
      ($6,'PJ GLOBAL','Fantasia Global','00000000000191','PJ','ativo',NULL,NULL)`,
    [id(10), id(11), id(12), id(13), id(14), id(15), id(2), id(3)]);
    await t.test('reproduces the missing trade-name result before the incremental fix', async () => {
      assert.deepEqual((await search('prefeitura sao')).data.rows, []);
      await db.exec(await sql('20261112092832_nfse_service_partner_trade_name_search.sql'));
      assert.deepEqual((await search('prefeitura sao')).data.rows.map(row => row.id), [id(10)]);
      assert.equal((await search('MUNICIPIO')).data.rows[0].id, id(10));
    });
    await t.test('CPF and masked CNPJ search and selected identity remain canonical', async () => {
      assert.equal((await search('00.000.000/0001-91')).data.rows.some(row => row.id === id(10)), true);
      assert.equal((await search('00000000191')).data.rows.some(row => row.id === id(11)), true);
      assert.deepEqual((await search('', id(10))).data.rows.map(row => row.id), [id(10)]);
      assert.deepEqual((await search('', id(12))).data.rows, []);
      assert.deepEqual((await search('fantasia global')).data.rows.map(row => row.id), [id(15)]);
    });
    await t.test('scope, activity, document validity and minimum input fail closed', async () => {
      assert.deepEqual((await search('prefeitura')).data.rows.map(row => row.id), [id(10)]);
      await assert.rejects(search('a'), error => error.code === '22023');
      await assert.rejects(search('x'.repeat(101)), error => error.code === '22023');
      await assert.rejects(search('prefeitura', null, [id(1), id(3), 'PRODUCAO', '2026-11']), error => error.code === '42501');
      await db.exec("SET test.allowed='false'");
      await assert.rejects(search('', id(10)), error => error.code === '42501');
      await db.exec("SET test.allowed='true'");
    });
    await t.test('server pagination is capped at twenty and only authenticated can execute', async () => {
      for (let n = 20; n < 45; n++) await db.query('INSERT INTO public.parceiros VALUES($1,$2,NULL,$3,$4,$5,$6,NULL)',
        [id(n), `CATALOGO SINTETICO ${n}`, '00000000000191', 'PJ', 'ativo', id(2)]);
      const result = await search('CATALOGO');
      assert.equal(result.data.rows.length, 20); assert.equal(result.data.pageSize, 20); assert.deepEqual(result.scope,
        { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' });
      const grants = (await db.query(`SELECT has_function_privilege('authenticated',p.oid,'EXECUTE') app,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('service_role',p.oid,'EXECUTE') service
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_nfse_service_partners_secure'`)).rows;
      assert.deepEqual(grants, [{ app: true, anon: false, service: false }]);
    });
  } finally { await db.close(); }
});
