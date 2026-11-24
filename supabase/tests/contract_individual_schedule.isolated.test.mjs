import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildContractSemanticRuns, contractSemanticPlainText } from '../../modules/shared/contrato-aluno/semantic-format.ts';

const migration = name => readFile(new URL(
  '../migrations/' + name + '.sql', import.meta.url,
), 'utf8');

function definition(source, name) {
  const escapedName = name.replaceAll('.', '\\.');
  const start = source.search(new RegExp('create(?: or replace)? function\\s+' + escapedName + '\\(', 'i'));
  assert.notEqual(start, -1, name);
  const tail = source.slice(start);
  const delimiter = /\bas\s+(\$[a-z_]*\$)/i.exec(tail);
  const end = tail.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length);
  return tail.slice(0, end + delimiter[1].length + 1);
}

const rule = {
  origem: 'TURMA',
  cobranca: {
    matricula: { habilitada: true, valor: 200 },
    mensalidade: { habilitada: true, quantidade: 12, valor: 279.90 },
    rematricula: { habilitada: true, valor: 100 },
  },
  encargos: { descontoPontualidade: 19.90, jurosAtrasoPercentual: 1, multaAtrasoPercentual: 2 },
  aplicacao: {
    matricula: { desconto: false, multaJuros: false },
    mensalidade: { desconto: true, multaJuros: true },
    rematricula: { desconto: false, multaJuros: true },
  },
  continuidade: { maxCiclos: 2 },
  vencimento: { diaBase: 15 },
};

const dates = (year, month, count) => Array.from({ length: count }, (_, index) =>
  new Date(Date.UTC(year, month - 1 + index, 15)).toISOString().slice(0, 10));
const dueDates = items => items.map(item => item.vencimento);
const cycleTwo = plan => plan.itens.filter(item => item.cicloNumero === 2);

const monthlyItem = vencimento => ({
  tipo: 'PARCELA', valor: 279.90, vencimento,
  detalhesBoleto: { desconto: { valor: 19.90 }, juros: { percentualMes: 1 }, multa: { percentual: 2 } },
});
const renewalItem = vencimento => ({
  tipo: 'REMATRICULA', valor: 100, vencimento,
  detalhesBoleto: { juros: { percentualMes: 1 }, multa: { percentual: 2 } },
});
const reviewedCycle = (cycle, items) => ({
  cycle_number: cycle, state: 'LOCAL_CREATED', modoMatricula: cycle === 1 ? 'OMITIR' : null,
  item_count: items.length, expected_installment_count: items.filter(i => i.tipo === 'PARCELA').length,
  reviewed_items: items,
});

test('the contract extends the agreed schedule and presents amounts and charges by group', async t => {
  const modulePath = process.env.PGLITE_MODULE_PATH;
  const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema internal_academic;');
    for (const [file, name] of [
      ['20260622161000_integrate_enrollment_receivables', 'public.data_vencimento_mensal'],
      ['20260807050000_create_secretaria_documentos_contrato_preceptor_calendario', 'public.formatar_valor_brl_documento'],
      ['20260902024657_suggest_manual_cycle_due_from_last_boleto', 'internal_academic.technical_manual_cycle_due_from_last_boleto'],
      ['20261010190000_external_transfer_schedule_contract', 'internal_academic.normalize_transfer_schedule'],
    ]) await db.exec(definition(await migration(file), name));
    for (const name of [
      '20261013120000_contract_individual_financial_plan',
      '20261013120100_contract_financial_summary',
    ]) await db.exec(await migration(name));

    const plan = async (input = rule, runs = [], firstDue = '2026-09-15', entry = null) => (await db.query(
      'select internal_academic.contract_financial_plan($1, $2, $3, $4) as value',
      [input, entry, JSON.stringify(runs), firstDue],
    )).rows[0].value;
    const summary = async value => (await db.query(
      'select internal_academic.contract_financial_summary($1) as value', [value],
    )).rows[0].value;

    const octoberInstallments = dates(2026, 10, 12);
    const c1 = reviewedCycle(1, octoberInstallments.map(monthlyItem));
    const baseline = await plan(rule, [c1]);
    assert.ok(cycleTwo(baseline).every(item => item.vencimento === null));

    // The migration replaces the external receipt wrapper as well.
    await db.exec('create table internal_academic.contract_external_enrollment_receipts(amount numeric);');
    await db.exec(await migration('20261124000739_contract_financial_schedule_presentation'));

    await t.test('24 monthly installments with a separate renewal and an in-person enrollment payment', async () => {
      const result = await plan(rule, [c1]);
      assert.deepEqual(dueDates(result.itens.filter(item => item.cicloNumero === 1)), octoberInstallments);
      assert.equal(cycleTwo(result)[0].tipo, 'REMATRICULA');
      assert.deepEqual(dueDates(cycleTwo(result)), ['2027-10-15', ...dates(2027, 11, 12)]);
      result.itens.unshift({
        cicloNumero: 1, tipo: 'MATRICULA', ordem: 0, valor: 200, vencimento: null,
        origem: 'RECEBIMENTO_EXTERNO_DECLARADO', descontoPontualidade: 0,
        jurosAtrasoPercentual: 0, multaAtrasoPercentual: 0, dataPagamento: '2026-09-15',
      });
      const finance = await summary(result);
      assert.equal(finance.quantidadeParcelas, 24);
      assert.equal(finance.valorTotalMensalidades, 6717.60);
      assert.equal(finance.valorTotalContrato, 7017.60);
      assert.equal(finance.vencimentosPendentesConfirmacao, false);
      assert.match(finance.planoPagamentoExibicao, /\nCiclo 1\nMatrícula de R\$ 200,00, já recebida presencialmente em 15\/09\/2026/u);
      assert.match(finance.planoPagamentoExibicao, /\n\nCiclo 2\n1 rematrícula de R\$ 100,00 \(vencimento em 15\/10\/2027\)\.\n12 mensalidades de R\$ 279,90 \(mensalmente no dia 15, de 15\/11\/2027 a 15\/10\/2028\)/u);
      const lateTerms = 'Juros de 1% ao mês, proporcionais aos dias de atraso.\n'
        + 'Multa única de 2% sobre o valor principal da cobrança em atraso';
      assert.equal(finance.condicoesExibicao, [
        '\n24 mensalidades dos ciclos 1 e 2',
        'Desconto de pontualidade de R$ 19,90 por cobrança, para pagamento até o vencimento.',
        lateTerms + '.\n',
        '1 rematrícula do ciclo 2',
        'Sem desconto de pontualidade.',
        lateTerms,
      ].join('\n'));
      const body = 'Total das mensalidades: R$ 6.717,60. Valor total do contrato: R$ 7.017,60.\n\n'
        + 'Plano de pagamento:' + finance.planoPagamentoExibicao + '.\n\n'
        + 'I - Descontos de pontualidade e encargos por atraso observarão as condições desta matrícula:'
        + finance.condicoesExibicao + '.';
      const runs = buildContractSemanticRuns(body, { snapshot: { financeiro: finance } });
      assert.equal(contractSemanticPlainText(runs), body);
      const bold = runs.filter(run => run.bold).map(run => run.text).join('');
      for (const label of ['Plano de pagamento:', 'Ciclo 1', 'Ciclo 2', 'Matrícula de R$ 200,00',
        '1 rematrícula de R$ 100,00', '12 mensalidades de R$ 279,90', '24 mensalidades dos ciclos 1 e 2',
        'R$ 6.717,60', 'R$ 7.017,60', '15/10/2027', '15/11/2027', '15/10/2028',
        'Desconto de pontualidade de R$ 19,90', 'Juros de 1% ao mês', 'Multa única de 2%',
        '1 rematrícula do ciclo 2', 'Sem desconto de pontualidade']) {
        assert.ok(bold.includes(label), label);
      }
      assert.ok(!bold.includes('sobre o valor principal'));
      assert.deepEqual(runs.filter(run => run.bold && run.accent).map(run => run.text.trim()).filter(label =>
        /^(?:I - Descontos|24 mensalidades|Desconto de pontualidade|Juros de|Multa única|1 rematrícula do ciclo|Sem desconto)/u.test(label)), [
        'I - Descontos de pontualidade e encargos por atraso',
        '24 mensalidades dos ciclos 1 e 2',
        'Desconto de pontualidade de R$ 19,90',
        'Juros de 1% ao mês',
        'Multa única de 2%',
        '1 rematrícula do ciclo 2',
        'Sem desconto de pontualidade',
        'Juros de 1% ao mês',
        'Multa única de 2%',
      ]);
      assert.ok(!buildContractSemanticRuns('Plano de pagamento: ciclo 1: 12 mensalidades.').some(run => run.bold));
    });

    await t.test('separate terms within the same cycle identify the affected installments', async () => {
      const differentTerms = structuredClone(c1);
      differentTerms.reviewed_items.at(-1).detalhesBoleto.desconto.valor = 5;
      const finance = await summary(await plan(rule, [differentTerms]));
      assert.match(finance.condicoesExibicao, /1 mensalidade do ciclo 1\n[^\n]+cobrança nº 12 do ciclo 1 \(15\/09\/2027\)\.\nDesconto de pontualidade de R\$ 5,00/u);
      assert.match(finance.condicoesExibicao, /23 mensalidades dos ciclos 1 e 2\n[^\n]+cobrança nº 1 do ciclo 1 \(15\/10\/2026\)/u);
    });

    await t.test('reviewed and transferred dates take precedence over projections', async () => {
      const explicit = reviewedCycle(2, [renewalItem('2027-11-04'), monthlyItem('2027-12-06')]);
      const reviewed = await plan(rule, [c1, explicit]);
      assert.deepEqual(dueDates(cycleTwo(reviewed)), ['2027-11-04', '2027-12-06']);
      assert.match((await summary(reviewed)).condicoesExibicao, /13 mensalidades dos ciclos 1 e 2/u);
      const transfer = {
        initial_cycle: 2, rule_snapshot: rule,
        financial_plan: { versao: 3, itens: [{
          itemId: '00000000-0000-4000-8000-000000000001', cicloNumero: 2,
          tipo: 'PARCELA', ordem: 1, valor: '145.00', vencimento: '2027-08-07',
          descontoPontualidade: '0.00', jurosAtrasoPercentual: '0.00', multaAtrasoPercentual: '0.00',
        }] },
      };
      const transferred = await plan(rule, [], null, transfer);
      assert.deepEqual(dueDates(cycleTwo(transferred)), ['2027-08-07']);
    });

    await t.test('end of month, waived renewal and missing first-cycle dates', async () => {
      const monthEndRule = { ...rule, vencimento: { diaBase: 31 } };
      const reviewed = reviewedCycle(1, [monthlyItem('2027-01-31'), monthlyItem('2026-12-31')]);
      assert.deepEqual(dueDates(cycleTwo(await plan(monthEndRule, [reviewed])).slice(0, 2)),
        ['2027-02-28', '2027-03-28']);
      assert.deepEqual(dueDates(cycleTwo(await plan(monthEndRule, [], '2026-01-31')).slice(0, 2)),
        ['2027-02-28', '2027-03-31']);
      const noRenewal = { ...rule, cobranca: { ...rule.cobranca, rematricula: { habilitada: false } } };
      assert.deepEqual(dueDates(cycleTwo(await plan(noRenewal, [c1]))), dates(2027, 10, 12));
      const missingDates = await plan(rule, [], null);
      assert.ok(cycleTwo(missingDates).every(item => item.vencimento === null));
      assert.equal((await summary(missingDates)).vencimentosPendentesConfirmacao, true);
    });
  } finally {
    await db.close();
  }
});
