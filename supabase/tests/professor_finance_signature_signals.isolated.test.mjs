import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(runtime ? pathToFileURL(resolve(runtime, 'dist/index.js')).href : '@electric-sql/pglite');
const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

test('sinais financeiros e de assinatura invalidam somente audiência docente antiga/nova sem valores', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA portal_private;
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY,tipo text);
      CREATE TABLE public.signals(topic text,kind text,actor uuid,polo uuid);
      CREATE FUNCTION public.insert_portal_realtime_signal(text,text,uuid,uuid)
        RETURNS void LANGUAGE sql AS $$ INSERT INTO public.signals VALUES($1,$2,$3,$4) $$;
      CREATE TABLE public.despesas_lancamentos(id uuid PRIMARY KEY,fornecedor_id uuid,polo_id uuid,valor numeric);
      CREATE TABLE public.contas_pagar(LIKE public.despesas_lancamentos INCLUDING ALL);
      CREATE TABLE public.assinaturas_pessoas(id uuid PRIMARY KEY,parceiro_id uuid,assinatura_path text);
      CREATE TABLE public.assinatura_eletronica_envelopes(id uuid PRIMARY KEY,status text);
      CREATE TABLE public.assinatura_eletronica_participantes(id uuid PRIMARY KEY,envelope_id uuid,parceiro_id uuid,status text);
    `);
    await db.exec(readFileSync(new URL('../migrations/20261114033000_professor_finance_signature_signals.sql', import.meta.url), 'utf8'));
    await db.query('INSERT INTO parceiros VALUES($1,$2),($3,$2),($4,$5)', [id(1),'Professor',id(2),id(3),'Aluno']);
    await db.query('INSERT INTO despesas_lancamentos VALUES($1,$2,$3,100)', [id(10),id(1),id(20)]);
    await db.query('UPDATE despesas_lancamentos SET valor=120 WHERE id=$1', [id(10)]);
    await db.query('UPDATE despesas_lancamentos SET fornecedor_id=$1,polo_id=$2 WHERE id=$3', [id(2),id(21),id(10)]);
    let rows = (await db.query('SELECT * FROM signals')).rows;
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((row) => row.actor), [id(1),id(1),id(1),id(2)]);
    assert.ok(rows.every((row) => row.kind === 'PROFESSOR_POLO' && row.topic.endsWith(':financeiro')));
    assert.ok(rows.every((row) => !('valor' in row)));
    await db.query('DELETE FROM despesas_lancamentos WHERE id=$1', [id(10)]);
    assert.equal((await db.query('SELECT * FROM signals')).rows.at(-1).actor, id(2));
    await db.query('INSERT INTO contas_pagar VALUES($1,$2,$3,10)', [id(11),id(3),id(20)]);
    assert.equal((await db.query('SELECT * FROM signals')).rows.length, 5, 'Aluno não recebe tópico de professor');

    await db.exec('TRUNCATE signals');
    await db.query('INSERT INTO assinatura_eletronica_envelopes VALUES($1,$2)', [id(30),'ABERTO']);
    await db.query('INSERT INTO assinatura_eletronica_participantes VALUES($1,$2,$3,$4)', [id(31),id(30),id(1),'PENDENTE']);
    await db.query('UPDATE assinatura_eletronica_participantes SET status=$1 WHERE id=$2', ['ASSINADO',id(31)]);
    await db.query('UPDATE assinatura_eletronica_participantes SET parceiro_id=$1 WHERE id=$2', [id(2),id(31)]);
    await db.query('UPDATE assinatura_eletronica_envelopes SET status=$1 WHERE id=$2', ['CONCLUIDO',id(30)]);
    await db.query('DELETE FROM assinatura_eletronica_participantes WHERE id=$1', [id(31)]);
    rows = (await db.query('SELECT * FROM signals')).rows;
    assert.deepEqual(rows.map((row) => row.actor), [id(1),id(1),id(1),id(2),id(2),id(2)]);
    assert.ok(rows.every((row) => row.kind === 'PROFESSOR' && row.polo === null && row.topic.endsWith(':assinaturas')));
    await db.query('INSERT INTO assinaturas_pessoas VALUES($1,$2,$3)', [id(40),id(1),'privado/assinatura']);
    assert.equal((await db.query('SELECT * FROM signals')).rows.at(-1).actor,id(1));
    for (const signature of ['emit_professor_finance_scope(uuid,uuid)','emit_professor_finance_row()', 'emit_professor_signature_scope(uuid)','emit_professor_signature_row()']) {
      const result = await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed", [`portal_private.${signature}`]);
      assert.equal(result.rows[0].allowed, false, 'Cliente não pode forjar sinais');
    }
  } finally { await db.close(); }
});
