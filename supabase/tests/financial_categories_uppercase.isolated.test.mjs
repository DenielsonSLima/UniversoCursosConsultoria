import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261109021000_financial_category_names_uppercase.sql',import.meta.url),'utf8');

test('categorias existentes e novas ficam em maiúsculas sem trocar vínculos ou políticas', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create table public.categorias_financeiras(id integer primary key,nome text not null,tipo text,status text,updated_at timestamptz default now());
      alter table public.categorias_financeiras enable row level security;
      create policy leitura on public.categorias_financeiras for select using(false);
      create table public.titulos(id integer, categoria_id integer references public.categorias_financeiras(id),valor numeric);
      insert into public.categorias_financeiras(id,nome,tipo,status) values
        (1,' Alimentação ','DESPESA_VARIAVEL','ativo'),
        (2,'Transporte / Combustível','DESPESA_VARIAVEL','inativo'),
        (3,'Juros e Multas','OUTRO_DEBITO','ativo');
      insert into public.titulos values(1,1,123.45),(2,2,60.07);`);
    const before = (await db.query('select * from public.titulos order by id')).rows;
    const policies = (await db.query("select * from pg_policies where tablename='categorias_financeiras'")).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select nome from public.categorias_financeiras order by id')).rows.map(r=>r.nome),
      ['ALIMENTAÇÃO','TRANSPORTE / COMBUSTÍVEL','JUROS E MULTAS']);
    assert.deepEqual((await db.query('select * from public.titulos order by id')).rows,before);
    assert.equal((await db.query('select status from public.categorias_financeiras where id=2')).rows[0].status,'inativo');
    await db.exec("insert into public.categorias_financeiras(id,nome) values(4,'água / gás'); update public.categorias_financeiras set nome='pró-labore' where id=3;");
    assert.deepEqual((await db.query('select nome from public.categorias_financeiras where id>=3 order by id')).rows.map(r=>r.nome),['PRÓ-LABORE','ÁGUA / GÁS']);
    assert.deepEqual((await db.query("select * from pg_policies where tablename='categorias_financeiras'")).rows,policies);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.normalize_categoria_financeira_nome_uppercase()','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
