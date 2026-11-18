import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Defina PGLITE_MODULE_PATH para @electric-sql/pglite/dist/index.js.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const db = new PGlite();
try {
  // Testa o wrapper real com contrato controlado. O contrato financeiro e suas
  // regras de acesso permanecem na RPC canônica, não são reimplementados aqui.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION public.get_relatorio_movimentacao_financeira_secure(
      uuid, text, date, date, uuid, text, text, text
    ) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
      IF $7 = 'NEGADO' THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
      IF $2 <> 'EXTRATO_CONTA' THEN RAISE EXCEPTION 'Tipo incorreto'; END IF;
      RETURN current_setting('test.payload')::jsonb;
    END $$;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261118000100_extrato_pdf_chronological.sql', import.meta.url), 'utf8'));
  const movements = [
    {id:'c',data:'2026-11-30',valor:10,saldo_apos:1065},
    {id:'b',data:'2026-11-01',valor:25,saldo_apos:1075},
    {id:'a',data:'2026-11-01',valor:100,saldo_apos:1100},
  ];
  const base = {meta:{tipo:'EXTRATO_CONTA'},completo:true,resumo:{saldo_abertura:1000,saldo_fechamento:1065},movimentos:movements};
  const set = payload => db.query("select set_config('test.payload', $1, false)", [JSON.stringify(payload)]);
  const get = async () => (await db.query('select public.get_extrato_financeiro_pdf_secure() as result')).rows[0].result;
  await set(base);
  const ordered = await get();
  assert.deepEqual(ordered.movimentos, [movements[2],movements[1],movements[0]]);
  assert.deepEqual(ordered.resumo, base.resumo);
  // Categoria/busca pode omitir movimentos: saldo canônico não pode ser recalculado.
  await set({...base,movimentos:[movements[0],movements[2]]});
  assert.deepEqual((await get()).movimentos,[movements[2],movements[0]]);
  await set({...base,movimentos:[]}); assert.deepEqual((await get()).movimentos,[]);
  await set({...base,completo:false}); await assert.rejects(get,/extrato completo/);
  await set(base);
  await assert.rejects(() => db.query("select public.get_extrato_financeiro_pdf_secure(p_status=>'NEGADO')"), error => error.code === '42501');
  const privileges = (await db.query(`select
    has_function_privilege('anon','public.get_extrato_financeiro_pdf_secure(uuid,date,date,uuid,text,text,text)','EXECUTE') as anon,
    has_function_privilege('authenticated','public.get_extrato_financeiro_pdf_secure(uuid,date,date,uuid,text,text,text)','EXECUTE') as authenticated`)).rows[0];
  assert.deepEqual(privileges, {anon:false,authenticated:true});
  assert.equal((await db.query("select prosecdef from pg_proc where proname='get_extrato_financeiro_pdf_secure'")).rows[0].prosecdef,false);
  console.log('PASS: ASC/data+id, same-day tie, canonical balances, filtered gaps, empty, truncation, propagated42501, invoker/grants.');
} finally { await db.close(); }
