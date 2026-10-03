// Local PostgreSQL/WASM; real V1, known-subtotals patch and V2 migration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const db = new PGlite();
const poloA = '00000000-0000-4000-8000-000000000001';
const poloB = '00000000-0000-4000-8000-000000000002';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const signature = 'public.get_caixa_composicao_mensal_secure(uuid,date)';
const call = (polo = poloA, month = '2026-10-15', version = 2) => scalar(
  `select public.get_caixa_composicao_mensal${version === 2 ? '_v2' : ''}_secure($1,$2) value`, [polo, month]);
const config = (key, value) => scalar('select set_config($1,$2,false) value', [`test.${key}`, String(value)]);
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);
const add = async (kind, id, delta, status = 'NAO_DISCRIMINADA', options = {}) => {
  const { polo = poloA, date = '2026-10-02', known = false, base = 100 } = options;
  await db.query(`insert into test_caixa.movements values($1,$2,$3,$4,$5,$6,$6,$6,$6,$7,$8,100)`,
    [kind, id, polo, date, base, known ? 0 : null, delta, status]);
};
const fingerprint = () => scalar(`select md5(coalesce(string_agg(to_jsonb(m)::text,'' order by kind,id),'')) value
  from test_caixa.movements m`);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA test_caixa;
    CREATE TABLE test_caixa.movements(kind text,id integer,polo_id uuid,date date,
      valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,total numeric,PRIMARY KEY(kind,id));
    CREATE FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
      IF current_setting('test.fail_core',true)='true' THEN
        RAISE EXCEPTION 'Core must not execute before authorization' USING ERRCODE='XX001';
      END IF;
      RETURN QUERY SELECT m.valor_base,m.juros,m.multa,m.acrescimo,m.desconto,
        m.diferenca_nao_discriminada,m.composicao_status,m.total FROM test_caixa.movements m
        WHERE m.kind='R' AND ($1 IS NULL OR m.polo_id=$1) AND m.date>=$2 AND m.date<$3;
    END $$;
    CREATE FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_pago numeric)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT m.valor_base,m.juros,m.multa,m.acrescimo,m.desconto,m.diferenca_nao_discriminada,
        m.composicao_status,m.total FROM test_caixa.movements m
      WHERE m.kind='D' AND ($1 IS NULL OR m.polo_id=$1) AND m.date>=$2 AND m.date<$3
    $$;
    CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(uuid,date,integer)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
    DECLARE v_start date:=date_trunc('month',$2)::date; BEGIN
      IF current_setting('test.authorized',true) IS DISTINCT FROM 'true'
        OR ($1 IS NULL AND current_setting('test.global',true) IS DISTINCT FROM 'true')
        OR ($1 IS NOT NULL AND $1::text IS DISTINCT FROM current_setting('test.polo',true)) THEN
        RAISE EXCEPTION 'Denied' USING ERRCODE='42501';
      END IF;
      IF $3<>1 THEN RAISE EXCEPTION 'Unexpected months'; END IF;
      RETURN (SELECT jsonb_build_object('resumo_competencia',jsonb_build_object(
        'entradas_recebidas_brutas',coalesce(sum(total) FILTER(WHERE kind='R'),0),
        'saidas_pagas',coalesce(sum(total) FILTER(WHERE kind='D'),0),
        'quantidade_recebimentos',count(*) FILTER(WHERE kind='R'),
        'quantidade_pagamentos',count(*) FILTER(WHERE kind='D')))
        FROM test_caixa.movements WHERE ($1 IS NULL OR polo_id=$1)
          AND date>=v_start AND date<v_start+interval '1 month');
    END $$;
    REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date) FROM PUBLIC;
  `);
  await db.exec(migration('20261002003956_create_caixa_composicao_mensal_secure.sql'));
  await db.exec(migration('20261002011300_caixa_composition_known_subtotals.sql'));
  const v1Before = await scalar('select pg_get_functiondef($1::regprocedure) value', [signature]);
  await db.exec(migration('20261003040108_caixa_composition_classification_v2.sql'));
  assert.equal(await scalar('select pg_get_functiondef($1::regprocedure) value', [signature]), v1Before);
  await config('authorized', true);
  await config('polo', poloA);

  // Empty stays complete, has no disclaimer and gains zero classification counts.
  const empty = await call();
  for (const section of ['recebimentos', 'despesas']) {
    assert.equal(empty[section].completo, true);
    assert.equal(empty[section].observacao, null);
    assert.equal(empty[section].dados.quantidade_sem_detalhamento, 0);
    assert.equal(empty[section].dados.quantidade_com_diferenca, 0);
  }
  // Maria-style zero net does not invent individual components; +20/-20 must
  // stay two discrepancies even though their aggregate cancels to zero.
  await add('R', 1, 0);
  await add('R', 2, 20);
  await add('R', 3, -20);
  await add('R', 4, null);
  await add('R', 5, 0, 'CONCILIADO', { known: true });
  await add('R', 6, 1, 'CALCULADO_REGRA_INFORMADA_PROESC', { known: true });
  await add('R', 7, 0, 'PARCIAL_POR_API_PROESC', { known: true });
  await add('R', 8, 0, null, { known: true });
  await add('R', 9, 0, 'NAO_DISCRIMINADA_PELO_GATEWAY', { known: true });
  await add('R', 10, 0, 'CONCILIADO', { known: true, base: null });
  await add('D', 1, 0);
  await add('D', 2, null);
  await add('D', 3, -5);
  await add('D', 4, 0, 'CONCILIADO', { known: true });
  await add('R', 11, 0, 'NAO_DISCRIMINADA', { polo: poloB });
  await add('R', 12, 0, 'NAO_DISCRIMINADA', { date: '2026-09-30' });
  await add('R', 13, 0, 'NAO_DISCRIMINADA', { date: '2026-11-01' });
  const before = await fingerprint();
  const old = await call(poloA, '2026-10-15', 1);
  const result = await call();
  assert.equal(result.versao, 2);
  assert.equal(result.periodo_inicio, '2026-10-01');
  assert.equal(result.periodo_fim_exclusivo, '2026-11-01');
  assert.equal(result.recebimentos.dados.quantidade_sem_detalhamento, 5);
  assert.equal(result.recebimentos.dados.quantidade_com_diferenca, 4);
  assert.equal(result.despesas.dados.quantidade_sem_detalhamento, 1);
  assert.equal(result.despesas.dados.quantidade_com_diferenca, 2);
  for (const section of ['recebimentos', 'despesas']) {
    const { quantidade_sem_detalhamento: noDetail, quantidade_com_diferenca: difference, ...data } = result[section].dados;
    assert.equal(noDetail + difference, data.quantidade_a_conferir);
    assert.deepEqual(data, old[section].dados);
    assert.equal(result[section].completo, old[section].completo);
    assert.equal(result[section].motivo, old[section].motivo);
    assert.equal(result[section].disponivel, old[section].disponivel);
    assert.match(result[section].observacao, /Diferença líquida zero não comprova/);
    assert.doesNotMatch(result[section].observacao, /\d/);
  }
  assert.equal(result.recebimentos.dados.base, null);
  assert.equal(result.recebimentos.dados.diferenca_a_conferir, null);
  assert.equal(await fingerprint(), before);
  assert.equal((await call(poloA, '2026-09-01')).recebimentos.dados.quantidade, 1);
  assert.equal((await call(poloA, '2026-11-01')).recebimentos.dados.quantidade, 1);
  await config('global', true);
  assert.equal((await call(null)).recebimentos.dados.quantidade_sem_detalhamento, 6);
  await config('global', false);

  // Authorization precedes privileged cores; both denied polo and global fail.
  await config('fail_core', true);
  await rejects(call(poloB), '42501');
  await rejects(call(null), '42501');
  await config('authorized', false);
  await rejects(call(), '42501');
  await config('authorized', true);
  await config('fail_core', false);
  await rejects(call(poloA, null), '22023');
  const acl = await scalar(`select jsonb_build_object(
    'authenticated',has_function_privilege('authenticated','public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE'),
    'anon',has_function_privilege('anon','public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE'),
    'service',has_function_privilege('service_role','public.get_caixa_composicao_mensal_v2_secure(uuid,date)','EXECUTE'),
    'definer',p.prosecdef,'config',p.proconfig) value FROM pg_proc p
    WHERE p.oid='public.get_caixa_composicao_mensal_v2_secure(uuid,date)'::regprocedure`);
  assert.deepEqual(acl, { authenticated: true, anon: false, service: false, definer: true, config: ['search_path=""'] });
  await db.exec('SET ROLE authenticated');
  assert.equal((await call()).versao, 2);
  await db.exec('RESET ROLE');
  await db.exec('SET ROLE anon');
  await rejects(call(), '42501');
  await db.exec('RESET ROLE');
  // Fail closed if the canonical V1 incomplete predicate/count ever drifts.
  await db.exec(v1Before.replace("'quantidade_a_conferir', v_recebimentos_a_conferir",
    "'quantidade_a_conferir', v_recebimentos_a_conferir + 1"));
  await rejects(call(), 'P0001');
  await db.exec(v1Before);
  // Only unknown, zero-net components remain NULL in both versions.
  await db.exec("DELETE FROM test_caixa.movements WHERE NOT(kind='R' AND id=1)");
  const zeroOnly = await call();
  for (const key of ['juros', 'multa', 'acrescimo', 'desconto']) assert.equal(zeroOnly.recebimentos.dados[key], null);
  assert.equal(zeroOnly.recebimentos.completo, false);
  assert.equal(zeroOnly.recebimentos.dados.diferenca_a_conferir, '0.00');
  assert.equal(zeroOnly.recebimentos.dados.quantidade_sem_detalhamento, 1);
  assert.equal(zeroOnly.recebimentos.dados.quantidade_com_diferenca, 0);
  console.log('PASS Caixa composition V2: classification, parity, NULLs, scope, ACL, drift, immutability');
} finally {
  await db.close();
}
