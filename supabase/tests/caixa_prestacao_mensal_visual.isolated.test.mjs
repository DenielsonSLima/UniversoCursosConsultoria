// PostgreSQL/WASM local, sem conexão nem operação remota.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.CAIXA_TEST_PGLITE_MODULE;
let PGlite;
let pgliteUnavailable = false;
try {
  ({ PGlite } = await import(modulePath || '@electric-sql/pglite'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  pgliteUnavailable = true;
}

const migration = readFileSync(new URL(
  '../migrations/20260927234500_create_caixa_prestacao_mensal_visual_secure.sql',
  import.meta.url,
), 'utf8');
const signature = 'public.get_caixa_prestacao_mensal_visual_secure(uuid,date)';
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';

const expectCode = (operation, code) => assert.rejects(
  operation,
  (error) => error.code === code,
);

test('payload visual é chart-ready, isolado e mantém ACL da prestação mensal', {
  skip: pgliteUnavailable
    ? 'PGlite não instalado; informe CAIXA_TEST_PGLITE_MODULE para executar.'
    : false,
}, async () => {
  const db = new PGlite();
  const setAccess = async ({
    role = 'authenticated', global = true, allowedPolo = poloA,
  } = {}) => db.query(`SELECT
    set_config('test.actor_role', $1, false),
    set_config('test.global_scope', $2, false),
    set_config('test.allowed_polo', $3, false)
  `, [role, String(global), allowedPolo]);
  const call = async (polo = poloA) => {
    const { rows } = await db.query(`SELECT ${signature.split('(')[0]}(
      $1::uuid, '2026-09-01'::date
    ) AS payload`, [polo]);
    return rows[0].payload;
  };

  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;

      CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(
        p_polo_id uuid DEFAULT NULL,
        p_competencia date DEFAULT CURRENT_DATE,
        p_meses_historico integer DEFAULT 6
      ) RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
      AS $fixture$
      DECLARE
        v_role text := current_setting('test.actor_role', true);
        v_allowed_polo text := current_setting('test.allowed_polo', true);
        v_global boolean := coalesce(
          current_setting('test.global_scope', true), 'false'
        ) = 'true';
        v_factor numeric := CASE WHEN p_polo_id = '${poloB}'::uuid THEN 2 ELSE 1 END;
      BEGIN
        IF p_meses_historico <> 6 THEN
          RAISE EXCEPTION 'A visualização deve requisitar seis meses.'
            USING ERRCODE = '22023';
        END IF;
        IF v_role IS DISTINCT FROM 'service_role'
          AND (
            v_role IS DISTINCT FROM 'authenticated'
            OR (p_polo_id IS NULL AND NOT v_global)
            OR (p_polo_id IS NOT NULL AND p_polo_id::text IS DISTINCT FROM v_allowed_polo)
          ) THEN
          RAISE EXCEPTION 'Escopo negado pela prestação mensal canônica.'
            USING ERRCODE = '42501';
        END IF;
        RETURN pg_catalog.jsonb_build_object(
          'versao', 2,
          'sentinela_payload_integral', 'preservada',
          'meta', pg_catalog.jsonb_build_object(
            'polo_id', p_polo_id,
            'competencia', p_competencia,
            'historico_recebido', p_meses_historico
          ),
          'serie_mensal', pg_catalog.jsonb_build_array(
            jsonb_build_object('competencia','2026-04-01','rotulo','Abr/2026','entradas',100*v_factor,'saidas',50*v_factor,'resultado',50*v_factor,'inadimplencia',10*v_factor),
            jsonb_build_object('competencia','2026-05-01','rotulo','Mai/2026','entradas',0,'saidas',80*v_factor,'resultado',-80*v_factor,'inadimplencia',20*v_factor),
            jsonb_build_object('competencia','2026-06-01','rotulo','Jun/2026','entradas',40*v_factor,'saidas',0,'resultado',40*v_factor,'inadimplencia',0),
            jsonb_build_object('competencia','2026-07-01','rotulo','Jul/2026','entradas',200*v_factor,'saidas',100*v_factor,'resultado',100*v_factor,'inadimplencia',50*v_factor),
            jsonb_build_object('competencia','2026-08-01','rotulo','Ago/2026','entradas',0,'saidas',0,'resultado',0,'inadimplencia',0),
            jsonb_build_object('competencia','2026-09-01','rotulo','Set/2026','entradas',50*v_factor,'saidas',25*v_factor,'resultado',25*v_factor,'inadimplencia',5*v_factor)
          ),
          'receitas_por_modalidade', jsonb_build_array(
            jsonb_build_object('codigo','A','rotulo','Receita A','valor',30*v_factor,'quantidade',1),
            jsonb_build_object('codigo','B','rotulo','Receita B','valor',70*v_factor,'quantidade',2),
            jsonb_build_object('codigo','Z','rotulo','Sem valor','valor',0,'quantidade',0)
          ),
          'despesas_por_categoria', jsonb_build_array(
            jsonb_build_object('codigo','X','rotulo','Despesa X','valor',1*v_factor,'quantidade',1),
            jsonb_build_object('codigo','Y','rotulo','Despesa Y','valor',1*v_factor,'quantidade',1),
            jsonb_build_object('codigo','W','rotulo','Despesa W','valor',1*v_factor,'quantidade',1)
          ),
          'contas', jsonb_build_array(
            jsonb_build_object('id','a','banco','Banco A','conta','1','titular','A','natureza','BANCARIA','valor_exibido',60*v_factor),
            jsonb_build_object('id','b','banco','Banco B','conta','2','titular','B','natureza','BANCARIA','valor_exibido',-10*v_factor),
            jsonb_build_object('id','c','banco','Caixa','conta','3','titular','C','natureza','CAIXA_INTERNO','valor_exibido',40*v_factor),
            jsonb_build_object('id','d','banco','Zero','conta','4','titular','D','natureza','BANCARIA','valor_exibido',0)
          )
        );
      END;
      $fixture$;
    `);
    await db.exec(migration);
    await setAccess();

    const payload = await call();
    const { rows: [canonical] } = await db.query(`SELECT
      public.get_caixa_prestacao_mensal_secure(
        $1::uuid, '2026-09-01'::date, 6
      ) AS payload
    `, [poloA]);
    const { visualizacoes, ...preservedPayload } = payload;
    assert.deepEqual(preservedPayload, canonical.payload);
    assert.equal(payload.sentinela_payload_integral, 'preservada');
    assert.equal(payload.meta.historico_recebido, 6);
    assert.equal(payload.visualizacoes.versao, 1);
    assert.equal(payload.visualizacoes.janela_meses, 6);

    const movement = payload.visualizacoes.movimentacao;
    assert.equal(movement.meses.length, 6);
    assert.equal(movement.view_box, '0 0 100 100');
    assert.equal(movement.dominio_minimo, '-80.00');
    assert.equal(movement.dominio_maximo, '200.00');
    assert.equal(movement.base_y, 71.43);
    assert.equal(movement.meses[0].x, 8.33);
    assert.equal(movement.meses[1].resultado_y, 100);
    assert.equal(movement.meses[3].entradas_altura, 71.43);
    assert.deepEqual({
      entrada_x: movement.meses[0].entrada_x,
      saida_x: movement.meses[0].saida_x,
      entrada_y: movement.meses[0].entrada_y,
      saida_y: movement.meses[0].saida_y,
      largura: movement.meses[0].largura,
    }, {
      entrada_x: 2.83,
      saida_x: 8.83,
      entrada_y: 35.72,
      saida_y: 53.57,
      largura: 5,
    });
    assert.equal(movement.meses[0].entradas_valor, '100.00');
    assert.equal(movement.resultado_pontos.split(' ').length, 6);
    assert.equal(movement.inadimplencia_pontos.split(' ').length, 6);
    assert.match(movement.resultado_pontos, /^8\.33,53\.57 /);

    const receipts = payload.visualizacoes.composicao.receitas;
    assert.equal(receipts.total, '100.00');
    assert.deepEqual(receipts.itens.map((item) => [
      item.codigo, item.percentual, item.inicio_percentual,
      item.comprimento_percentual,
    ]), [
      ['A', 30, 0, 30],
      ['B', 70, 30, 70],
    ]);
    assert.deepEqual(receipts.itens.map((item) => [
      item.offset_percentual, item.gap_percentual,
    ]), [[0, 70], [-30, 30]]);
    const expenses = payload.visualizacoes.composicao.despesas.itens;
    assert.deepEqual(expenses.map((item) => item.inicio_percentual), [0, 33.33, 66.67]);
    assert.deepEqual(expenses.map((item) => item.comprimento_percentual), [33.33, 33.34, 33.33]);
    assert.equal(expenses.reduce((sum, item) => sum + item.comprimento_percentual, 0), 100);

    const balances = payload.visualizacoes.saldos_por_conta;
    assert.equal(balances.total_positivo, '100.00');
    assert.deepEqual(balances.itens.map((item) => item.id), ['a', 'c']);
    assert.deepEqual(balances.itens.map((item) => item.valor), ['60.00', '40.00']);
    assert.deepEqual(balances.itens.map((item) => item.comprimento_percentual), [60, 40]);

    await expectCode(() => call(poloB), '42501');
    await setAccess({ global: false });
    await expectCode(() => call(null), '42501');
    await setAccess({ role: '', global: false });
    await expectCode(() => call(poloA), '42501');
    await setAccess({ role: 'service_role', global: false, allowedPolo: '' });
    const servicePayload = await call(poloB);
    assert.equal(servicePayload.visualizacoes.saldos_por_conta.total_positivo, '200.00');

    const { rows: [acl] } = await db.query(`SELECT
      has_function_privilege('anon', '${signature}', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') AS authenticated,
      has_function_privilege('service_role', '${signature}', 'EXECUTE') AS service,
      proconfig, provolatile, prosecdef
      FROM pg_proc WHERE oid = '${signature}'::regprocedure
    `);
    assert.deepEqual(acl, {
      anon: false,
      authenticated: true,
      service: true,
      proconfig: ['search_path=""'],
      provolatile: 's',
      prosecdef: true,
    });
  } finally {
    await db.close();
  }
});
