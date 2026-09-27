// PostgreSQL/WASM local: banco novo em memória, sem conexão com Supabase.
// CAIXA_TEST_PGLITE_MODULE permite usar uma instalação temporária externa.
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

const migrations = [
  '20260927203000_create_caixa_workspace_v2_core.sql',
  '20260927214500_fix_caixa_workspace_v2_rateio_payment_quality.sql',
].map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';
const poloC = '00000000-0000-0000-0000-000000000003';
const poloD = '00000000-0000-0000-0000-000000000004';
const poloE = '00000000-0000-0000-0000-000000000005';
const poloInvalido = '00000000-0000-0000-0000-000000000099';

const decimalText = /^-?\d+\.\d{2}$/;

test('core v2 fecha shape, corte, rateio misto, incompletude e privilégios', {
  skip: pgliteUnavailable
    ? 'PGlite não instalado; informe CAIXA_TEST_PGLITE_MODULE para executar o PostgreSQL isolado.'
    : false,
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA internal_contas;
      CREATE TABLE public.polos (id uuid PRIMARY KEY, status text NOT NULL);
      CREATE TABLE public.contas_pagar (
        id uuid, polo_id uuid, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, despesa_lancamento_id uuid,
        emprestimo_parcela_id uuid
      );
      CREATE TABLE public.despesas_lancamentos (
        id uuid, polo_id uuid, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, rateio_modo text, excluido_em timestamptz
      );
      CREATE TABLE public.despesas_lancamentos_rateios (
        despesa_lancamento_id uuid, polo_id uuid, valor_total numeric,
        data_pagamento date, status text, created_at timestamptz
      );
      INSERT INTO public.polos VALUES
        ('${poloA}', 'ativo'),
        ('${poloB}', 'ativo'),
        ('${poloC}', 'ativo'),
        ('${poloD}', 'ativo'),
        ('${poloE}', 'ativo');
    `);
    for (const migration of migrations) await db.exec(migration);
    await db.exec(`
      INSERT INTO public.despesas_lancamentos VALUES (
        '10000000-0000-0000-0000-000000000001', '${poloA}', 100, 50,
        (date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month' + interval '10 days')::date,
        NULL, 'PAGO',
        date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '2 months',
        'TODOS', NULL
      );
      INSERT INTO public.despesas_lancamentos_rateios VALUES
        (
          '10000000-0000-0000-0000-000000000001', '${poloA}', 50,
          (date_trunc('month', timezone('America/Maceio', now())::date)
            - interval '1 month' + interval '4 days')::date,
          'PAGO',
          date_trunc('month', timezone('America/Maceio', now())::date)
            - interval '2 months'
        ),
        (
          '10000000-0000-0000-0000-000000000001', '${poloB}', 50,
          NULL, 'PENDENTE',
          date_trunc('month', timezone('America/Maceio', now())::date)
            - interval '2 months'
        );
      INSERT INTO public.contas_pagar VALUES (
        '20000000-0000-0000-0000-000000000001', '${poloA}', 70, NULL,
        (date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month' + interval '12 days')::date,
        NULL, 'PENDENTE',
        date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '2 months',
        NULL, NULL
      );
      INSERT INTO public.contas_pagar VALUES
        (
          '30000000-0000-0000-0000-000000000001', '${poloC}', 11, NULL,
          timezone('America/Maceio', now())::date,
          NULL, 'PENDENTE', now() - interval '1 day', NULL, NULL
        ),
        (
          '30000000-0000-0000-0000-000000000002', '${poloC}', 13, NULL,
          timezone('America/Maceio', now())::date + 7,
          NULL, 'PENDENTE', now() - interval '1 day', NULL, NULL
        ),
        (
          '30000000-0000-0000-0000-000000000003', '${poloC}', 17, NULL,
          timezone('America/Maceio', now())::date + 8,
          NULL, 'PENDENTE', now() - interval '1 day', NULL, NULL
        );
    `);

    const { rows: [clock] } = await db.query(`SELECT
      timezone('America/Maceio', now())::date::text AS hoje,
      to_char(
        (date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month')::date,
        'YYYY-MM-DD'
      ) AS competencia_passada,
      to_char(timezone('America/Maceio', now())::date + 7, 'YYYY-MM-DD') AS d7,
      to_char(timezone('America/Maceio', now())::date + 8, 'YYYY-MM-DD') AS d8,
      date_trunc('month', timezone('America/Maceio', now())::date + 7)
        = date_trunc('month', timezone('America/Maceio', now())::date)
        AS d7_mesma_competencia,
      date_trunc('month', timezone('America/Maceio', now())::date + 8)
        = date_trunc('month', timezone('America/Maceio', now())::date)
        AS d8_mesma_competencia
    `);
    const { rows: [current] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        NULL, timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    assert.deepEqual(Object.keys(current.payload).sort(), [
      'meta', 'regras', 'secoes', 'versao',
    ]);
    assert.equal(current.payload.versao, 2);
    assert.equal(current.payload.meta.timezone, 'America/Maceio');
    assert.equal(current.payload.meta.data_corte, clock.hoje);
    assert.equal(current.payload.meta.data_institucional, clock.hoje);
    assert.equal(current.payload.meta.criterio_posicao, 'POSICAO_REEXPRESSA_NO_CORTE');
    assert.equal(current.payload.meta.criterio_historico, 'POSICAO_REEXPRESSA_NO_CORTE');
    assert.match(current.payload.meta.snapshot_id, /^caixa-v2-[a-f0-9]{32}$/);
    const currentPayables = current.payload.secoes.compromissos.dados.contas_a_pagar;
    assert.equal(currentPayables.completo, true);
    assert.equal(currentPayables.motivo, null);
    assert.equal(current.payload.regras.compromissos_abertos_impactam_realizado, false);
    assert.equal(current.payload.regras.compromissos_abertos_impactam_posicoes, false);
    assert.deepEqual(current.payload.secoes.posicoes, {
      disponivel: false,
      completo: false,
      motivo: 'ETAPA_POSTERIOR',
      observacao: 'Seção reservada para uma etapa posterior do contrato v2.',
      dados: null,
    });

    const { rows: [sameStatement] } = await db.query(`SELECT
      internal_contas.get_caixa_workspace_v2_core(
        NULL, timezone('America/Maceio', now())::date, 6
      ) AS primeiro,
      internal_contas.get_caixa_workspace_v2_core(
        NULL, timezone('America/Maceio', now())::date, 6
      ) AS segundo
    `);
    assert.equal(
      sameStatement.primeiro.meta.snapshot_id,
      sameStatement.segundo.meta.snapshot_id,
    );

    const fontes = [
      current.payload.secoes.compromissos.dados,
      currentPayables.dados,
      current.payload.secoes.compromissos.dados.agenda_financeira.dados,
      current.payload.secoes.qualidade_dados.dados,
    ];
    for (const origem of fontes) {
      assert.ok(Array.isArray(origem.fontes_consideradas));
      assert.ok(Array.isArray(origem.fontes_indisponiveis));
      assert.ok(origem.fontes_consideradas.every(
        (item) => typeof item === 'object' && typeof item.fonte === 'string',
      ));
      assert.ok(origem.fontes_indisponiveis.every(
        (item) => typeof item === 'object' && typeof item.fonte === 'string',
      ));
    }

    const { rows: [poloCAtual] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloC}', timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    const poloCPayables = poloCAtual.payload.secoes.compromissos.dados
      .contas_a_pagar.dados;
    const poloCAgenda = poloCAtual.payload.secoes.compromissos.dados
      .agenda_financeira.dados;
    assert.deepEqual(poloCAgenda.hoje, {
      data: clock.hoje, valor: '11.00', quantidade: 1,
    });
    assert.deepEqual(poloCAgenda.proximos_sete_dias, {
      periodo_inicio: poloCAgenda.dias[1].data,
      periodo_fim_exclusivo: clock.d8,
      valor: '13.00',
      quantidade: 1,
    });
    assert.equal(poloCAgenda.dias.length, 8);
    assert.equal(poloCAgenda.dias.at(-1).data, clock.d7);
    assert.equal(poloCAgenda.dias.at(-1).valor, '13.00');
    assert.ok(!poloCAgenda.dias.some((dia) => dia.data === clock.d8));
    assert.equal(poloCPayables.em_atraso.valor, '0.00');
    const esperadoAVencer = (clock.d7_mesma_competencia ? 13 : 0)
      + (clock.d8_mesma_competencia ? 17 : 0);
    assert.equal(
      poloCPayables.a_vencer_competencia.valor,
      esperadoAVencer.toFixed(2),
    );

    const { rows: [past] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        NULL,
        (date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month')::date,
        6
      ) AS payload
    `);
    assert.equal(past.payload.meta.competencia, clock.competencia_passada);
    const pastPayables = past.payload.secoes.compromissos.dados.contas_a_pagar;
    const pastPayableData = pastPayables.dados;
    assert.equal(pastPayables.completo, false);
    assert.equal(pastPayables.motivo, 'DADOS_INCOMPLETOS');
    assert.ok(
      pastPayableData.motivos_incompletude.includes(
        'CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA',
      ),
    );
    assert.deepEqual(
      pastPayableData.contas_competencia,
      { valor: '170.00', quantidade: 2 },
    );
    assert.deepEqual(
      pastPayableData.pagas_competencia,
      { valor: '50.00', quantidade: 0, criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE' },
    );
    assert.equal(pastPayableData.em_atraso.valor, '120.00');
    assert.equal(pastPayableData.em_atraso.quantidade, 2);
    assert.equal(past.payload.regras.rateio_economico_duplica_baixa_fisica, false);

    const { rows: [pastPoloA] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloA}',
        (date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month')::date,
        6
      ) AS payload
    `);
    const pastPoloAData = pastPoloA.payload.secoes.compromissos.dados
      .contas_a_pagar.dados;
    assert.equal(past.payload.meta.escopo_tipo, 'GLOBAL');
    assert.equal(pastPoloA.payload.meta.escopo_tipo, 'POLO');
    assert.equal(pastPoloA.payload.meta.polo_id, poloA);
    assert.deepEqual(
      pastPoloAData.contas_competencia,
      { valor: '120.00', quantidade: 2 },
    );
    assert.deepEqual(
      pastPoloAData.pagas_competencia,
      { valor: '50.00', quantidade: 1, criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE' },
    );
    assert.equal(pastPoloAData.em_atraso.valor, '70.00');
    assert.equal(pastPoloAData.em_atraso.quantidade, 1);
    assert.match(pastPoloAData.em_atraso.data_mais_antiga, /^\d{4}-\d{2}-\d{2}$/);

    const pastAgenda = past.payload.secoes.compromissos.dados.agenda_financeira.dados;
    const monetaryValues = [
      pastPayableData.contas_competencia.valor,
      pastPayableData.pagas_competencia.valor,
      pastPayableData.a_vencer_competencia.valor,
      pastPayableData.em_atraso.valor,
      pastAgenda.hoje.valor,
      pastAgenda.proximos_sete_dias.valor,
      ...pastAgenda.dias.map((dia) => dia.valor),
    ];
    assert.ok(monetaryValues.every((value) => decimalText.test(value)));
    assert.equal(pastAgenda.hoje.data, clock.hoje);
    assert.equal(pastAgenda.dias.length, 8);

    await db.exec(`
      INSERT INTO public.contas_pagar VALUES (
        '20000000-0000-0000-0000-000000000002', '${poloA}', 25, 10,
        timezone('America/Maceio', now())::date,
        NULL, 'PENDENTE', now(), NULL, NULL
      );
    `);
    const { rows: [incomplete] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        NULL, timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    const quality = incomplete.payload.secoes.qualidade_dados;
    assert.equal(quality.completo, false);
    assert.equal(quality.motivo, 'DADOS_INCOMPLETOS');
    assert.ok(
      quality.dados.motivos_incompletude.includes(
        'PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO',
      ),
    );
    assert.equal(incomplete.payload.secoes.fluxo.dados, null);
    assert.equal(incomplete.payload.secoes.fluxo.motivo, 'ETAPA_POSTERIOR');

    const { rows: [partialPoloA] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloA}', timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    const partialToday = partialPoloA.payload.secoes.compromissos.dados
      .agenda_financeira.dados.hoje;
    const partialPayables = partialPoloA.payload.secoes.compromissos.dados
      .contas_a_pagar;
    assert.deepEqual(partialToday, {
      data: clock.hoje, valor: '15.00', quantidade: 1,
    });
    assert.notEqual(partialToday.valor, '25.00');
    assert.equal(partialPayables.completo, false);
    assert.ok(partialPayables.dados.motivos_incompletude.includes(
      'PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO',
    ));
    assert.deepEqual(partialPayables.dados.pagas_competencia, {
      valor: '0.00',
      quantidade: 0,
      criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE',
    });

    await db.exec(`
      INSERT INTO public.contas_pagar VALUES (
        '40000000-0000-0000-0000-000000000001', '${poloD}', 40, NULL,
        timezone('America/Maceio', now())::date,
        timezone('America/Maceio', now())::date,
        'PAGO', now() - interval '1 day', NULL, NULL
      );
    `);
    const { rows: [paidWithoutValue] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloD}', timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    const paidWithoutValuePayables = paidWithoutValue.payload.secoes
      .compromissos.dados.contas_a_pagar;
    const paidWithoutValueQuality = paidWithoutValue.payload.secoes
      .qualidade_dados;
    assert.equal(paidWithoutValuePayables.completo, false);
    assert.equal(paidWithoutValuePayables.dados.pagas_competencia.valor, '0.00');
    assert.ok(paidWithoutValuePayables.dados.motivos_incompletude.includes(
      'PAGAMENTOS_SEM_VALOR',
    ));
    assert.equal(paidWithoutValueQuality.dados.pagamentos_sem_valor, 1);
    assert.equal(paidWithoutValueQuality.completo, false);

    await db.exec(`
      INSERT INTO public.despesas_lancamentos VALUES (
        '50000000-0000-0000-0000-000000000001', '${poloA}', 60, 60,
        timezone('America/Maceio', now())::date,
        timezone('America/Maceio', now())::date,
        'PAGO', now() - interval '1 day', 'TODOS', NULL
      );
      INSERT INTO public.despesas_lancamentos_rateios VALUES (
        '50000000-0000-0000-0000-000000000001', '${poloE}', NULL,
        timezone('America/Maceio', now())::date,
        'PAGO', now() - interval '1 day'
      );
    `);
    const { rows: [paidRateioWithoutValue] } = await db.query(`
      SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloE}', timezone('America/Maceio', now())::date, 6
      ) AS payload
    `);
    const rateioWithoutValuePayables = paidRateioWithoutValue.payload.secoes
      .compromissos.dados.contas_a_pagar;
    const rateioWithoutValueQuality = paidRateioWithoutValue.payload.secoes
      .qualidade_dados;
    assert.equal(rateioWithoutValuePayables.completo, false);
    assert.equal(rateioWithoutValuePayables.dados.pagas_competencia.valor, '0.00');
    assert.ok(rateioWithoutValuePayables.dados.motivos_incompletude.includes(
      'PAGAMENTOS_SEM_VALOR',
    ));
    assert.equal(rateioWithoutValueQuality.dados.pagamentos_sem_valor, 1);
    assert.equal(rateioWithoutValueQuality.completo, false);

    await assert.rejects(
      db.query(`SELECT internal_contas.get_caixa_workspace_v2_core(
        NULL,
        (date_trunc('month', timezone('America/Maceio', now())::date)
          + interval '1 month')::date,
        6
      )`),
      (error) => error.code === '22023',
    );
    for (const meses of [0, 13]) {
      await assert.rejects(
        db.query(`SELECT internal_contas.get_caixa_workspace_v2_core(
          NULL, timezone('America/Maceio', now())::date, ${meses}
        )`),
        (error) => error.code === '22023',
      );
    }
    await assert.rejects(
      db.query(`SELECT internal_contas.get_caixa_workspace_v2_core(
        '${poloInvalido}', timezone('America/Maceio', now())::date, 6
      )`),
      (error) => error.code === '22023',
    );

    const { rows: [security] } = await db.query(`SELECT
      has_function_privilege('anon',
        'internal_contas.get_caixa_workspace_v2_core(uuid,date,integer)',
        'EXECUTE') AS anon,
      has_function_privilege('authenticated',
        'internal_contas.get_caixa_workspace_v2_core(uuid,date,integer)',
        'EXECUTE') AS authenticated,
      has_function_privilege('service_role',
        'internal_contas.get_caixa_workspace_v2_core(uuid,date,integer)',
        'EXECUTE') AS service,
      has_function_privilege('postgres',
        'internal_contas.get_caixa_workspace_v2_core(uuid,date,integer)',
        'EXECUTE') AS postgres,
      proconfig, provolatile, prosecdef
      FROM pg_proc
      WHERE oid = 'internal_contas.get_caixa_workspace_v2_core(uuid,date,integer)'::regprocedure
    `);
    assert.deepEqual(security, {
      anon: false,
      authenticated: false,
      service: false,
      postgres: true,
      proconfig: ['search_path=""'],
      provolatile: 's',
      prosecdef: false,
    });
  } finally {
    await db.close();
  }
});
