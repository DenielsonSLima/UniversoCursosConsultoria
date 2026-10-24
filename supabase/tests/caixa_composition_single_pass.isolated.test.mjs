// Local PostgreSQL/WASM. Compare the deployed V2 and the optimized V2 against
// the same fixtures, while counting physical report-core executions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const optimized = '20261024161437_caixa_composition_single_pass.sql';
const poloA = '00000000-0000-4000-8000-000000000001';
const poloB = '00000000-0000-4000-8000-000000000002';
const signature = (v) => `public.get_caixa_composicao_mensal${v === 2 ? '_v2' : ''}_secure(uuid,date)`;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const config = (key, value) => scalar('select set_config($1,$2,false) value', [`test.${key}`, String(value)]);
const call = (polo = poloA, month = '2026-10-01') => scalar(
  "select public.get_caixa_composicao_mensal_v2_secure($1,$2)-'gerado_em' value", [polo, month]);
const rejects = (operation, code) => assert.rejects(operation, (error) => error.code === code);
const fingerprint = () => scalar(`select md5(coalesce(string_agg(to_jsonb(m)::text,'' order by kind,id),'')) value
  from test_caixa.movements m`);
const coreCounts = () => scalar(`select jsonb_build_array(
  (select last_value from test_caixa.receipts_calls),
  (select last_value from test_caixa.expenses_calls)) value`);
const resetCounts = () => db.exec('ALTER SEQUENCE test_caixa.receipts_calls RESTART; ALTER SEQUENCE test_caixa.expenses_calls RESTART');

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA test_caixa;
    CREATE SEQUENCE test_caixa.receipts_calls;
    CREATE SEQUENCE test_caixa.expenses_calls;
    CREATE TABLE test_caixa.movements(kind text,id integer,polo_id uuid,date date,
      valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,total numeric,PRIMARY KEY(kind,id));
    CREATE FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
      IF current_setting('test.fail_core',true)='true' THEN
        RAISE EXCEPTION 'Core before authorization' USING ERRCODE='XX001'; END IF;
      PERFORM nextval('test_caixa.receipts_calls');
      RETURN QUERY SELECT m.valor_base,m.juros,m.multa,m.acrescimo,m.desconto,
        m.diferenca_nao_discriminada,m.composicao_status,m.total FROM test_caixa.movements m
        WHERE m.kind='R' AND ($1 IS NULL OR m.polo_id=$1) AND m.date>=$2 AND m.date<$3;
    END $$;
    CREATE FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_pago numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
      IF current_setting('test.fail_core',true)='true' THEN
        RAISE EXCEPTION 'Core before authorization' USING ERRCODE='XX001'; END IF;
      PERFORM nextval('test_caixa.expenses_calls');
      RETURN QUERY SELECT m.valor_base,m.juros,m.multa,m.acrescimo,m.desconto,
        m.diferenca_nao_discriminada,m.composicao_status,m.total FROM test_caixa.movements m
        WHERE m.kind='D' AND ($1 IS NULL OR m.polo_id=$1) AND m.date>=$2 AND m.date<$3;
    END $$;
    CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(uuid,date,integer)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
    DECLARE v_start date:=date_trunc('month',$2)::date; BEGIN
      IF current_setting('test.authorized',true) IS DISTINCT FROM 'true'
        OR ($1 IS NULL AND current_setting('test.global',true) IS DISTINCT FROM 'true')
        OR ($1 IS NOT NULL AND $1::text IS DISTINCT FROM current_setting('test.polo',true)) THEN
        RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
      IF $3<>1 THEN RAISE EXCEPTION 'Unexpected months'; END IF;
      RETURN (SELECT jsonb_build_object('resumo_competencia',jsonb_build_object(
        'entradas_recebidas_brutas',coalesce(sum(total) FILTER(WHERE kind='R'),0)
          +coalesce(nullif(current_setting('test.delta',true),''),'0')::numeric,
        'saidas_pagas',coalesce(sum(total) FILTER(WHERE kind='D'),0),
        'quantidade_recebimentos',count(*) FILTER(WHERE kind='R'),
        'quantidade_pagamentos',count(*) FILTER(WHERE kind='D')))
        FROM test_caixa.movements WHERE ($1 IS NULL OR polo_id=$1)
          AND date>=v_start AND date<v_start+interval '1 month');
    END $$;
    REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date) FROM PUBLIC;
  `);
  for (const name of [
    '20261002003956_create_caixa_composicao_mensal_secure.sql',
    '20261002011300_caixa_composition_known_subtotals.sql',
    '20261003040108_caixa_composition_classification_v2.sql',
  ]) await db.exec(migration(name));
  await config('authorized', true);
  await config('polo', poloA);
  const v1Before = await scalar('select pg_get_functiondef($1::regprocedure) value', [signature(1)]);
  const metadata = () => scalar('select to_jsonb(p)-\'prosrc\' value from pg_proc p where oid=$1::regprocedure', [signature(2)]);
  const metadataBefore = await metadata();
  const baselineEmpty = await call();

  // Include unknowns, zero net with opposing discrepancies, known subtotals,
  // a complete expense, another polo, month boundaries, and >300 movements.
  await db.query(`INSERT INTO test_caixa.movements VALUES
    ('R',1,$1,'2026-10-02',100,NULL,NULL,NULL,NULL,0,'NAO_DISCRIMINADA',100),
    ('R',2,$1,'2026-10-02',100,0,0,0,0,20,'CALCULADO_REGRA_INFORMADA_PROESC',100),
    ('R',3,$1,'2026-10-02',100,0,0,0,0,-20,'API_E_REGRA_INFORMADA_PROESC',100),
    ('R',4,$1,'2026-10-02',NULL,0,0,0,0,NULL,NULL,100),
    ('R',5,$1,'2026-10-02',100,0,0,0,0,0,'PARCIAL_POR_API_PROESC',100),
    ('R',6,$1,'2026-10-02',100,0,0,0,0,0,'NAO_DISCRIMINADA_PELO_GATEWAY',100),
    ('R',7,$2,'2026-10-02',100,0,0,0,0,0,'CONCILIADO',100),
    ('R',8,$1,'2026-09-30',100,0,0,0,0,0,'CONCILIADO',100),
    ('R',9,$1,'2026-11-01',100,0,0,0,0,0,'CONCILIADO',100),
    ('D',1,$1,'2026-10-02',100,0,0,0,0,0,'COMPOSICAO_EXPLICITA',100),
    ('D',2,$1,'2026-10-02',100,NULL,NULL,NULL,NULL,NULL,'NAO_DISCRIMINADA',100),
    ('D',3,$1,'2026-10-02',100,0,0,0,0,-5,'NAO_DISCRIMINADA',100)`, [poloA, poloB]);
  await db.query(`INSERT INTO test_caixa.movements
    SELECT 'R',n,$1,'2026-10-02',100,0,0,0,0,0,'CONCILIADO',100
    FROM generate_series(10,310) n`, [poloA]);
  await config('global', true);
  const scopes = [[poloA,'2026-10-15'],[null,'2026-10-01'],[poloA,'2026-09-01'],[poloA,'2026-11-01']];
  const expected = [];
  for (const [polo, month] of scopes) expected.push(await call(polo, month));
  await resetCounts();
  await call();
  assert.deepEqual(await coreCounts(), [2,2], 'old V2 repeats each report core');
  const rowsBefore = await fingerprint();

  await db.exec(migration(optimized));
  assert.equal(await scalar('select pg_get_functiondef($1::regprocedure) value', [signature(1)]), v1Before);
  assert.deepEqual(await metadata(), metadataBefore, 'owner, ACL, volatility, signature and search_path preserved');
  for (const [index, [polo, month]] of scopes.entries()) {
    await resetCounts();
    assert.deepEqual(await call(polo, month), expected[index]);
    assert.deepEqual(await coreCounts(), [1,1], 'optimized V2 reads each report core once');
  }
  assert.equal(await fingerprint(), rowsBefore);
  await db.exec('TRUNCATE test_caixa.movements');
  assert.deepEqual(await call(), baselineEmpty);
  for (const kind of ['R','D']) {
    await db.query(`INSERT INTO test_caixa.movements VALUES($1,1,$2,'2026-10-02',100,NULL,NULL,NULL,NULL,0,'NAO_DISCRIMINADA',100)`, [kind,poloA]);
  }
  const unknown = await call();
  for (const section of ['recebimentos','despesas']) {
    for (const key of ['juros','multa','acrescimo','desconto']) assert.equal(unknown[section].dados[key], null);
    assert.equal(unknown[section].dados.quantidade_sem_detalhamento, 1);
    assert.equal(unknown[section].dados.quantidade_com_diferenca, 0);
  }
  await config('delta', 1);
  await rejects(call(), 'P0001');
  await config('delta', 0);
  await config('fail_core', true);
  await config('global', false);
  await rejects(call(null), '42501');
  await rejects(call(poloB), '42501');
  await config('authorized', false);
  await rejects(call(), '42501');
  await config('authorized', true);
  await config('fail_core', false);
  await rejects(call(poloA,null), '22023');
  await db.exec('SET ROLE anon');
  await rejects(call(), '42501');
  await db.exec('RESET ROLE; SET ROLE authenticated');
  assert.equal((await call()).versao, 2);
  await db.exec('RESET ROLE');
  console.log('PASS single-pass V2: exact old/new payload parity, cores 2→1, V1/ACL unchanged, scope, NULLs, >300, guards, immutability');
} finally { await db.close(); }
