import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.EXPENSE_GROUPING_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261109003300_expense_month_supplier_groups.sql', import.meta.url), 'utf8');
const polo = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const actor = '00000000-0000-0000-0000-000000000099';
const supplier = '00000000-0000-0000-0000-000000000011';
const supplierB = '00000000-0000-0000-0000-000000000012';

test('agrupamento preserva escopo, filtros e pagamentos canônicos', async t => {
  const db = new PGlite();
  const read = async (group = 'mes', scope = 'todos', changes = {}) => (await db.query(
    'select * from public.get_despesas_economicas_agrupamento_secure($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    ['DESPESA_FIXA', polo, group, changes.category || null, changes.search || null,
      changes.start || null, changes.end || null, scope, changes.turma || null],
  )).rows;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''test.actor'',true),'''')::uuid';
      create function auth.role() returns text language sql stable as
        'select coalesce(nullif(current_setting(''test.role'',true),''''),''authenticated'')';
      create function public.is_financeiro_for_polo(uuid) returns boolean language sql stable as
        'select $1=''${polo}''::uuid and current_setting(''test.allowed'',true)=''yes''';
      create function public.gestor_has_financeiro_tab(text) returns boolean language sql stable as
        'select $1=''despesas'' and current_setting(''test.allowed'',true)=''yes''';
      create table public.test_items(polo_id uuid,tipo text,categoria_financeira_id uuid,descricao text,
        data_vencimento date,fornecedor_id uuid,fornecedor_nome text,valor numeric,status text,
        payment_summary jsonb,turma_id uuid);
      create function public.listar_despesas_economicas_detalhadas_secure(text,uuid,uuid,text,date,date,text,uuid)
        returns setof public.test_items language sql stable as $$
        select * from public.test_items x where x.tipo=$1 and x.polo_id=$2
          and ($3 is null or x.categoria_financeira_id=$3)
          and ($4 is null or x.descricao ilike '%'||$4||'%')
          and ($5 is null or x.data_vencimento >= $5) and ($6 is null or x.data_vencimento <= $6)
          and ($7 <> 'em_aberto' or x.status in ('PENDENTE','VENCIDO'))
          and ($8 is null or x.turma_id=$8) $$;
      set test.actor='${actor}'; set test.allowed='yes';`);
    const rows = [
      ['2026-12-05', supplier, 120, 'PAGO', 120],
      ['2027-01-05', supplier, 120, 'PENDENTE', 30],
      ['2027-01-20', supplierB, 80, 'PENDENTE', 0],
      ['2027-01-25', null, 10, 'PENDENTE', 0],
      ['2027-01-30', supplier, 500, 'CANCELADO', 500],
      ['2026-01-10', supplierB, 40, 'PENDENTE', 0],
    ];
    for (const [date, id, value, status, paid] of rows) await db.query(
      'insert into public.test_items values($1,$2,null,$3,$4,$5,$6,$7,$8,$9,null)',
      [polo, 'DESPESA_FIXA', 'INTERNET DE TESTE', date, id, id ? 'Empresa homônima' : null,
        value, status, JSON.stringify({ previouslyPaid: String(paid), hasEvents: paid > 0 })],
    );
    await db.query(`insert into public.test_items values($1,'DESPESA_FIXA',null,'Fora do polo','2027-01-05',null,null,999,'PAGO','{"previouslyPaid":"999"}',null)`, [other]);
    await db.exec(migration);

    await t.test('mês separa anos; cancelado não soma e parcial permanece pago', async () => {
      const groups = await read();
      assert.deepEqual(groups.map(r => r.grupo_chave), ['2026-01', '2026-12', '2027-01']);
      assert.equal(groups[2].grupo_nome, 'janeiro de 2027');
      assert.equal(Number(groups[2].total_value), 210);
      assert.equal(Number(groups[2].paid_value), 30);
      assert.equal(Number(groups[2].item_count), 4);
    });
    await t.test('fornecedor usa identidade e mantém ausência de vínculo', async () => {
      const groups = await read('fornecedor');
      assert.equal(groups.length, 3);
      const a = groups.find(r => r.grupo_chave === supplier);
      assert.equal(Number(a.total_value), 240);
      assert.equal(Number(a.paid_value), 150);
      assert.equal(groups.find(r => r.grupo_chave === '__sem_fornecedor__').grupo_nome, 'Fornecedor não informado');
    });
    await t.test('em aberto e filtros são repassados ao mesmo contrato de listagem', async () => {
      const groups = await read('mes', 'em_aberto', { start: '2027-01-01', end: '2027-01-31' });
      assert.equal(groups.length, 1);
      assert.equal(Number(groups[0].total_value), 210);
      assert.equal(Number(groups[0].item_count), 3);
      assert.deepEqual(await read('mes', 'todos', { search: 'ausente' }), []);
      assert.deepEqual(await read('mes', 'todos', { category: supplier }), []);
      assert.deepEqual(await read('mes', 'todos', { turma: supplier }), []);
    });
    await t.test('anon, operador revogado e outro polo são negados antes dos argumentos', async () => {
      await db.exec("set test.actor=''");
      await assert.rejects(read('inválido'), e => e.code === '42501');
      await db.exec(`set test.actor='${actor}'; set test.allowed='no'`);
      await assert.rejects(read(), e => e.code === '42501');
      await db.exec("set test.allowed='yes'");
      await assert.rejects(db.query('select * from public.get_despesas_economicas_agrupamento_secure($1,$2)', ['DESPESA_FIXA', other]), e => e.code === '42501');
    });
    await t.test('novo contrato é somente leitura, invoker e sem EXECUTE público', async () => {
      await assert.rejects(read('inválido'), e => e.code === '22023');
      const fn = (await db.query("select p.prosecdef,p.provolatile,has_function_privilege('anon',p.oid,'execute') anon_execute from pg_proc p where p.proname='get_despesas_economicas_agrupamento_secure'")).rows[0];
      assert.equal(fn.prosecdef, false);
      assert.equal(fn.provolatile, 's');
      assert.equal(fn.anon_execute, false);
      assert.equal((await db.query('select count(*) n from public.test_items')).rows[0].n, rows.length + 1);
    });
  } finally { await db.close(); }
});
