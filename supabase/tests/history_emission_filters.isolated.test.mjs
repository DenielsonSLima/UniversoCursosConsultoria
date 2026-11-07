import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const { unaccent } = await import(modulePath
  ? pathToFileURL(resolve(dirname(modulePath), 'contrib/unaccent.js')).href : '@electric-sql/pglite/contrib/unaccent');
const migration = await readFile(new URL('../migrations/20261107190000_history_emission_filters.sql', import.meta.url), 'utf8');
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;

test('history filters run before pagination and preserve identity, compatibility and scope', async t => {
  const db = new PGlite({ extensions: { unaccent } });
  const search = async (params = {}) => {
    const values = { polo: id(1), document: null, turma: null, text: '', offset: 0, limit: 10,
      modalidade: null, curso: null, ...params };
    return (await db.query(`select public.search_secretaria_emissions_filtered_secure(
      $1,$2,$3,$4,$5,$6,$7,$8) as result`, Object.values(values))).rows[0].result;
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions; create schema internal_academic;
      create extension unaccent with schema extensions;
      create function auth.role() returns text language sql as $$select current_setting('test.role', true)$$;
      create function public.is_gestor_for_polo(uuid) returns boolean language sql as
        $$select $1::text = current_setting('test.polo', true)$$;
      create function public.gestor_has_tab(text,text) returns boolean language sql as
        $$select coalesce(current_setting('test.allowed',true),'false') = 'true'$$;
      create function public.gestor_effective_permissions() returns jsonb language sql as $$select '{}'::jsonb$$;
      create function internal_academic.project_contract_identity_emission(jsonb) returns jsonb
        language sql as $$select $1 || '{"identityProjection":true}'::jsonb$$;
      create table public.cursos(id uuid primary key,nome text,modalidade text);
      create table public.turmas(id uuid primary key,curso_id uuid,nome text,codigo text);
      create table public.matriculas(id uuid primary key,turma_id uuid,status text);
      create table public.parceiros(id uuid primary key,nome text,cpf_cnpj text,rg text,tipo_documento text,
        rg_uf_emissao text,rg_data_emissao date,data_nascimento date,foto_url text,sexo text,
        nacionalidade text,naturalidade text,orgao_emissor text,titulo_eleitor text,reservista text,
        nome_mae text,nome_pai text,escola_ensino_medio text,ano_conclusao_ensino_medio integer);
      create table public.documentos_validacao(id uuid primary key,codigo text,documento text,
        aluno_id uuid,matricula_id uuid,polo_id uuid,status text,ultima_emissao_em timestamptz,dados_emissao jsonb);
      set test.role='service_role';
    `);
    await db.exec(migration);
    for (const [key, modalidade] of [[10,'TECNICO'],[11,'TECNICO'],[12,'EAD']]) {
      await db.query('insert into public.cursos values ($1,$2,$3)', [id(key),`Curso ${key}`,modalidade]);
      await db.query('insert into public.turmas values ($1,$2,$3,$4)', [id(key+10),id(key),`Turma ${key}`,`T${key}`]);
      await db.query('insert into public.matriculas values ($1,$2,$3)', [id(key+20),id(key+10),'ATIVO']);
    }
    await db.query('insert into public.parceiros(id,nome,cpf_cnpj) values ($1,$2,$3)',
      [id(40),'ÉRICA ATUAL FICTÍCIA','123.456.789-09']);
    for (let index = 0; index < 24; index++) {
      await db.query('insert into public.documentos_validacao values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id(100+index), `CIE-${index}`,index % 2 ? 'contrato_aluno':'carteirinha',id(40),id(30+index%3),
          index === 23 ? id(2):id(1), index === 22 ? 'REVOGADO':'ATIVO',
          `2026-01-${String(index+1).padStart(2,'0')}T12:00:00Z`,
          index === 0 ? {} : {studentName:'NOME CONGELADO FICTÍCIO',studentCpf:'98765432100',documentTemplateSnapshot:{marker:'keep'}}]);
    }
    await t.test('name, accents, current registration and frozen names all match', async () => {
      assert.equal((await search({text:'  erica atual  '})).total,22);
      assert.equal((await search({text:'congelado'})).total,21);
      assert.equal((await search({text:'inexistente'})).total,0);
      assert.equal((await search({text:'%'})).total,0, 'wildcards are literal text');
    });
    await t.test('CPF accepts formatting and snapshots; code retains punctuation', async () => {
      assert.equal((await search({text:'12345678909'})).total,22);
      assert.equal((await search({text:'987.654.321-00'})).total,21);
      assert.equal((await search({text:'CIE-0'})).total,1);
    });
    await t.test('modality, course, class, document and text intersect before offset and limit', async () => {
      const all = await search({modalidade:'TECNICO',curso:id(10),turma:id(20),document:'carteirinha',text:'erica'});
      assert.equal(all.total,4);
      const page = await search({modalidade:'TECNICO',curso:id(10),turma:id(20),document:'carteirinha',text:'erica',offset:2,limit:1});
      assert.equal(page.total,4);assert.equal(page.items.length,1);assert.equal(page.items[0].id,all.items[2].id);
      assert.equal((await search({modalidade:'EAD',curso:id(10)})).total,0);
      assert.equal((await search({curso:id(10),turma:id(21)})).total,0);
      assert.ok((await search({modalidade:'EAD'})).items.every(row=>row.matricula.turma.id===id(22)));
    });
    await t.test('legacy RPC and complete payload remain compatible', async () => {
      const current = await search();
      const old = (await db.query('select public.search_secretaria_emissions_secure($1) result',[id(1)])).rows[0].result;
      assert.equal(old.total,current.total);assert.deepEqual(old.items.slice(0,10),current.items);
      assert.ok(current.items.every(row=>row.identityProjection && row.dados_emissao.documentTemplateSnapshot.marker==='keep'));
    });
    await t.test('anonymous, missing identity and other polo cannot query the API', async () => {
      await db.exec(`set test.role='authenticated';set test.allowed='true';set test.polo='${id(1)}';`);
      assert.equal((await search()).total,22);
      await assert.rejects(search({polo:id(2)}), /nao autorizado/);
      await db.exec("set test.allowed='false'");
      await assert.rejects(search(), /nao autorizado/);
      await db.exec("set test.role=''");
      await assert.rejects(search(), /nao autorizado/);
      const access = await db.query(`select has_function_privilege('anon',
        'public.search_secretaria_emissions_filtered_secure(uuid,text,uuid,text,integer,integer,text,uuid)','EXECUTE') as allowed`);
      assert.equal(access.rows[0].allowed,false);
    });
  } finally { await db.close(); }
});
