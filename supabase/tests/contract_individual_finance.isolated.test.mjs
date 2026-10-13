import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional offline PostgreSQL runtime; never connects to Supabase.
const modulePath = process.env.PGLITE_MODULE_PATH;
const moduleUrl = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleUrl);
const db = new PGlite();
const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
function definition(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, `function ${name} exists`);
  const tail = source.slice(start);
  const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(tail);
  const end = tail.indexOf(`${tag[1]};`, tag.index + tag[0].length);
  return tail.slice(0, end + tag[1].length + 1);
}
const rule = {
  origem: 'TURMA', identidade: { efetivaFingerprint: 'synthetic-fingerprint' },
  cobranca: {
    matricula: { habilitada: true, valor: '180.00' },
    mensalidade: { habilitada: true, quantidade: 10, valor: '310.25' },
    rematricula: { habilitada: true, valor: '90.00' },
  },
  encargos: { descontoPontualidade: '15.25', jurosAtrasoPercentual: '1.5', multaAtrasoPercentual: '2' },
  aplicacao: {
    matricula: { desconto: false, multaJuros: false },
    mensalidade: { desconto: true, multaJuros: true },
    rematricula: { desconto: false, multaJuros: true },
  },
  continuidade: { maxCiclos: 2 }, vencimento: { diaBase: 12 },
};
const clone = (value) => structuredClone(value);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function plan(input = rule, entry = null, runs = [], due = '2027-01-12') {
  return (await db.query('select internal_academic.contract_financial_plan($1,$2,$3,$4) as result',
    [input, entry, runs, due])).rows[0].result;
}
async function summary(input) {
  return (await db.query('select internal_academic.contract_financial_summary($1) as result', [input])).rows[0].result;
}
async function freeze(snapshot = { curso: { modalidade: 'TECNICO' }, financeiro: { antigo: true } }) {
  return (await db.query('select internal_academic.freeze_contract_individual_finance($1,$2) as result',
    [id(1), snapshot])).rows[0].result;
}
function reviewed(kind, number, value, overrides = {}) {
  return {
    chave: kind === 'PARCELA' ? `ciclo-1-parc-${number}` : 'matricula', tipo: kind,
    numero: number, valor: value, vencimento: `2027-${String(number + 1).padStart(2, '0')}-12`,
    detalhesBoleto: { desconto: { valor: '5.00' }, juros: { percentualMes: '0.5' }, multa: null },
    ...overrides,
  };
}
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log(`ok ${passed} - ${label}`); }
const rejectsPlan = (fn) => assert.rejects(fn, (error) => error.code === '55000');
try {
  await db.exec(await read('supabase/tests/contract_individual_finance.fixture.sql'));
  await db.exec(definition(await read('supabase/migrations/20260622161000_integrate_enrollment_receivables.sql'), 'public.data_vencimento_mensal'));
  await db.exec(definition(await read('supabase/migrations/20260807050000_create_secretaria_documentos_contrato_preceptor_calendario.sql'), 'public.formatar_valor_brl_documento'));
  await db.exec(definition(await read('supabase/migrations/20261010190000_external_transfer_schedule_contract.sql'), 'internal_academic.normalize_transfer_schedule'));
  for (const name of ['20261013120000_contract_individual_financial_plan.sql',
    '20261013120100_contract_financial_summary.sql', '20261013120200_freeze_contract_individual_finance.sql']) {
    await db.exec(await read(`supabase/migrations/${name}`));
  }

  await check('full unissued plan includes both cycles and separate fees', async () => {
    const result = await summary(await plan());
    assert.equal(result.quantidadeParcelas, 20);
    assert.equal(result.valorTotalMensalidades, 6205);
    assert.equal(result.valorTotalContrato, 6475);
    assert.equal(result.quantidadeMatriculas, 1);
    assert.equal(result.quantidadeRematriculas, 1);
    assert.match(result.condicoesExibicao, /1,5% ao mês, proporcionais aos dias/);
    assert.match(result.condicoesExibicao, /multa única de 2%/);
    assert.match(result.condicoesExibicao, /matrícula\(s\).*sem desconto de pontualidade; sem juros por atraso; sem multa por atraso/);
    assert.match(result.planoPagamentoExibicao, /rematrícula\(s\).*R\$ 90,00/);
    assert.match(result.planoPagamentoExibicao, /mensalmente no dia 12/);
    assert.equal(result.vencimentosPendentesConfirmacao, true);
    assert.equal(result.primeiroVencimento, '2027-02-12');
    if (process.env.CONTRACT_FINANCE_OUTPUT) await writeFile(process.env.CONTRACT_FINANCE_OUTPUT,
      JSON.stringify(result, null, 2));
  });
  await check('one-cycle waived fees never become obligations', async () => {
    const input = clone(rule);
    input.continuidade.maxCiclos = 1;
    input.cobranca.matricula.habilitada = false;
    input.cobranca.rematricula.habilitada = false;
    const result = await summary(await plan(input));
    assert.equal(result.quantidadeParcelas, 10);
    assert.equal(result.valorTotalContrato, 3102.5);
    assert.equal(result.quantidadeMatriculas, 0);
    assert.equal(result.quantidadeRematriculas, 0);
    assert.equal(result.primeiroVencimento, '2027-01-12');
  });
  await check('legacy transfer initial partial count is preserved after its cycle exists', async () => {
    const entry = { initial_cycle: 1, installment_count: 3, first_due_date: '2027-03-12', rule_snapshot: rule, financial_plan: {} };
    const result = await summary(await plan(rule, entry));
    assert.equal(result.quantidadeParcelas, 13);
    assert.equal(result.quantidadeCiclos, 2);
    const c2 = await summary(await plan(rule, { ...entry, initial_cycle: 2 }));
    assert.equal(c2.quantidadeParcelas, 3);
    assert.equal(c2.quantidadeMatriculas, 0);
    assert.equal(c2.quantidadeRematriculas, 1);
    assert.equal(c2.quantidadeCiclos, 1);
  });
  await check('V3 transfer uses the exact independent schedule, including empty and fee-only plans', async () => {
    const item = { itemId: id(40), cicloNumero: 2, tipo: 'REMATRICULA', ordem: 1,
      vencimento: '2026-01-05', valor: '75.00', descontoPontualidade: '0.00',
      jurosAtrasoPercentual: '0.00', multaAtrasoPercentual: '0.00' };
    const entry = { initial_cycle: 2, installment_count: 10, first_due_date: '2026-01-05',
      rule_snapshot: rule, financial_plan: { versao: 3, itens: [item,
        { ...item, itemId: id(41), tipo: 'PARCELA', ordem: 2, valor: '205.00', vencimento: '2026-02-02' },
        { ...item, itemId: id(42), tipo: 'PARCELA', ordem: 3, valor: '160.00', vencimento: '2026-03-21' }] } };
    const result = await summary(await plan(rule, entry));
    assert.equal(result.quantidadeParcelas, 2);
    assert.equal(result.valorParcela, null);
    assert.equal(result.valorTotalContrato, 440);
    assert.match(result.diaVencimento, /individuais/);
    assert.match(result.planoPagamentoExibicao, /R\$ 205,00/);
    entry.financial_plan.itens[2].valor = '205.00';
    const irregular = await summary(await plan(rule, entry));
    assert.match(irregular.planoPagamentoExibicao, /02\/02\/2026, 21\/03\/2026/);
    entry.financial_plan.itens = [item];
    assert.equal((await summary(await plan(rule, entry))).valorTotalContrato, 75);
    entry.financial_plan.itens = [];
    assert.equal((await summary(await plan(rule, entry))).valorTotalContrato, 0);
  });
  await check('reviewed cycle replaces only its own future projection, preserving omission and varying terms', async () => {
    const run = { cycle_number: 1, state: 'LOCAL_CREATED', item_count: 2,
      modoMatricula: 'OMITIR', expected_installment_count: 2,
      reviewed_items: [reviewed('PARCELA', 1, '210.00'), reviewed('PARCELA', 2, '220.00')] };
    const result = await summary(await plan(rule, null, [run]));
    assert.equal(result.quantidadeParcelas, 12);
    assert.equal(result.quantidadeMatriculas, 0);
    assert.equal(result.valorTotalContrato, 3622.5);
    assert.match(result.condicoesExibicao, /0,5% ao mês/);
    assert.match(result.condicoesExibicao, /1,5% ao mês/);
    assert.equal(result.valorParcela, null);
    await rejectsPlan(() => plan(rule, null, [{ ...run, modoMatricula: null }]));
    const waived = reviewed('MATRICULA', 0, '180.00', { dispensaComprovada: true });
    run.item_count = 3; run.reviewed_items.unshift(waived);
    assert.equal((await summary(await plan(rule, null, [run]))).valorTotalContrato, result.valorTotalContrato);
  });
  await check('missing future quantities, incomplete and generating cycles fail clearly', async () => {
    const input = clone(rule); delete input.cobranca.mensalidade.quantidade;
    await rejectsPlan(() => plan(input));
    const input2 = clone(rule); delete input2.continuidade.maxCiclos;
    await rejectsPlan(() => plan(input2));
    const excessiveFine = clone(rule); excessiveFine.encargos.multaAtrasoPercentual = '2.01';
    await rejectsPlan(() => plan(excessiveFine));
    await rejectsPlan(() => plan(rule, null, [{ cycle_number: 1, state: 'GENERATING', reviewed_items: [] }]));
    await rejectsPlan(() => plan(rule, null, [{ cycle_number: 1, state: 'LOCAL_CREATED', item_count: 12,
      expected_installment_count: 12, reviewed_items: [reviewed('PARCELA', 1, '210')] }]));
    assert.equal((await plan(rule, null, [], null)).itens.every((item) => item.vencimento === null), true);
  });

  await db.query('insert into public.cursos values ($1,$2)', [id(5), 'TECNICO']);
  await db.query('insert into public.turmas values ($1,$2,$3,$4,$5)', [id(2), id(5), id(3), '2027-01-12', rule]);
  await db.query('insert into public.matriculas values ($1,$2,$3,$4)', [id(1), id(2), id(4), '2027-01-12']);
  const override = clone(rule); override.origem = 'INDIVIDUAL'; override.cobranca.mensalidade.valor = '225.00';
  override.cobranca.mensalidade.quantidade = 6;
  await db.query('insert into public.matriculas_tecnicas_financeiro_config values ($1,$2,$3,$4)', [id(1), '2027-01-12', false, override]);
  await db.query('insert into test_contract.scope(allowed_polo) values ($1)', [id(3)]);
  await check('loader consumes effective enrollment terms and class fallback from canonical resolver', async () => {
    assert.equal((await freeze()).financeiro.valorTotalContrato, 6475);
    await db.exec('update public.matriculas_tecnicas_financeiro_config set override_ativo=true');
    assert.equal((await freeze()).financeiro.valorTotalContrato, 2970);
    await db.exec('update public.matriculas_tecnicas_financeiro_config set override_ativo=false');
  });
  await check('missing regular configuration fails instead of inventing an enrollment rule', async () => {
    await db.exec('begin');
    await db.exec('delete from public.matriculas_tecnicas_financeiro_config');
    await rejectsPlan(() => freeze());
    await db.exec('rollback');
  });
  await check('authorization is enforced and other modalities keep their existing snapshots', async () => {
    await db.exec('update test_contract.scope set allowed_polo=null');
    await assert.rejects(() => freeze(), (error) => error.code === '42501');
    await db.query('update test_contract.scope set allowed_polo=$1', [id(3)]);
    await db.exec("update public.cursos set modalidade='LIVRE'");
    assert.deepEqual((await freeze()).financeiro, { antigo: true });
    await db.exec("update public.cursos set modalidade='TECNICO'");
  });
  await check('internal/imported history cannot silently generate a new complete contract plan', async () => {
    await db.exec('update test_contract.scope set internal_transfer=true');
    await rejectsPlan(() => freeze());
    await db.exec('update test_contract.scope set internal_transfer=false, imported=true');
    await rejectsPlan(() => freeze());
    await db.exec('update test_contract.scope set imported=false');
  });
  const items = [reviewed('MATRICULA', 0, '180.00'), reviewed('PARCELA', 1, '210.00')];
  await db.query(`insert into internal_academic.technical_manual_cycle_runs
    (matricula_id,turma_id,cycle_number,state,item_count,expected_installment_count,reviewed_items,receivable_ids)
    values ($1,$2,1,$3,2,1,$4,$5)`,
    [id(1), id(2), 'LOCAL_CREATED', items, [id(10), id(11)]]);
  const policy = { aplicarDesconto: true, aplicarMultaJuros: true, descontoPontualidade: 5,
    jurosAtrasoPercentual: 0.5, multaAtrasoPercentual: 0 };
  for (let n = 0; n < items.length; n++) await db.query(`insert into public.contas_receber
    (id,matricula_id,turma_id,origem_cronograma_id,valor,data_vencimento,status,regra_financeira_tecnica_snapshot)
    values ($1,$2,$3,$4,$5,$6,'PENDENTE',$7)`,
  [id(10 + n), id(1), id(2), items[n].chave, items[n].valor, items[n].vencimento, policy]);
  await check('ledger-corroborated local obligations remain included until a proven waiver', async () => {
    const before = (await freeze()).financeiro;
    assert.equal(before.quantidadeMatriculas, 1);
    await db.query("update public.contas_receber set status='CANCELADO' where id=$1", [id(10)]);
    await rejectsPlan(() => freeze());
    await db.query('update public.contas_receber set test_waived=true where id=$1', [id(10)]);
    const after = (await freeze()).financeiro;
    assert.equal(after.quantidadeMatriculas, 0);
    assert.equal(before.valorTotalContrato - after.valorTotalContrato, 180);
  });
  await check('current canonical due-date correction wins over stale reviewed date', async () => {
    await db.query("update public.contas_receber set data_vencimento='2026-12-12' where id=$1", [id(11)]);
    assert.equal((await freeze()).financeiro.primeiroVencimento, '2026-12-12');
    await db.query('update public.contas_receber set test_integrity=false where id=$1', [id(11)]);
    await assert.rejects(() => freeze(), (error) => error.code === '23514');
    await db.query('update public.contas_receber set test_integrity=true where id=$1', [id(11)]);
  });
  await check('absent enrollment item needs explicit OMITIR proof, never a missing boleto or LOCAL mode', async () => {
    await db.query('delete from public.contas_receber where id=$1', [id(10)]);
    await db.query(`update internal_academic.technical_manual_cycle_runs set item_count=1,
      reviewed_items=$1, receivable_ids=$2, request_id=$3`, [[items[1]], [id(11)], id(99)]);
    await rejectsPlan(() => freeze());
    await db.query('insert into internal_academic.technical_financial_requests values ($1,$2,$3)',
      [id(99), 'GERACAO_CICLO_TECNICO_MANUAL', { ciclo: { numero: 1, quantidadeItens: 1, modoMatricula: 'REGISTRO_SEM_BOLETO' } }]);
    await rejectsPlan(() => freeze());
    await db.query('update internal_academic.technical_financial_requests set response=$1',
      [{ ciclo: { numero: 1, quantidadeItens: 1, modoMatricula: 'OMITIR' } }]);
    assert.equal((await freeze()).financeiro.quantidadeMatriculas, 0);
  });
  await check('wiring is private and touches only new preparation, leaving historical snapshot logic intact', async () => {
    const result = await db.query(`select pg_get_functiondef(
      'public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)'::regprocedure) as body,
      has_function_privilege('authenticated','internal_academic.freeze_contract_individual_finance(uuid,jsonb)','execute') as callable`);
    assert.match(result.rows[0].body, /freeze_contract_individual_finance\(v_target.matricula_id, v_snapshot\)/);
    assert.equal(result.rows[0].callable, false);
    const migration = await read('supabase/migrations/20261013120200_freeze_contract_individual_finance.sql');
    assert.doesNotMatch(migration, /update\s+(?:public\.)?documentos_validacao/i);
  });
  console.log(`${passed} contract finance checks passed`);
} finally {
  await db.close();
}
