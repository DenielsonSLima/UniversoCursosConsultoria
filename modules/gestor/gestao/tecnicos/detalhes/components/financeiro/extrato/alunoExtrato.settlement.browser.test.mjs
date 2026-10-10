import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  accountId, accounts, createFixture, entry, financeStub, issuedReceivable,
  paidFixture, poloId, silentSupabaseStub, toastStub,
} from './alunoExtrato.settlement.browser.fixture.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../../../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../extrato-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const output = resolve(process.env.ALUNO_EXTRATO_ARTIFACTS || '/tmp/aluno-extrato');
const compileOnly = process.env.ALUNO_EXTRATO_COMPILE_ONLY === '1';
const browserTest = compileOnly ? test.skip : test;
let browser, javascript, css;

before(async () => {
  await mkdir(output, { recursive: true });
  const result = await build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: directory },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', nodePaths: dependencies ? [dependencies] : [],
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'controlled-finance-boundaries', setup(plugin) {
      const stubs = {
        rpc: silentSupabaseStub,
        academic: 'export const formatMatricula=()=>"TEST-0001";',
        pdf: 'export const financialReportValueToText=()=>"";',
        toast: toastStub,
        finance: financeStub,
      };
      for (const [filter, path] of [
        [/lib\/supabase$/, 'rpc'], [/lib\/academicUtils$/, 'academic'],
        [/shared\/ToastNotification$/, 'toast'], [/financial-report\.vector-pdf\.resources$/, 'pdf'],
        [/financeiro\.service$/, 'finance'],
      ]) plugin.onResolve({ filter }, () => ({ path, namespace: 'controlled' }));
      plugin.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({ contents: stubs[path], loader: 'tsx', resolveDir: root }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await requireTool('postcss')([requireTool('tailwindcss')({ ...config, content: [
    resolve(directory, '*.tsx'),
    resolve(root, 'modules/gestor/financeiro/receber/components/manual-settlement/*.tsx'),
    resolve(root, 'modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableAmountSummary.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  if (compileOnly) return;
  browser = await chromium.launch({ headless: true, ...(process.env.EAD_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });
test('compile the real settlement hook, modal and form without launching a browser', { skip: !compileOnly }, () => {
  assert.ok(javascript.length > 0);
});

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://portal.test/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><main id="root" style="padding:24px"></main></body></html>' })
    : route.abort('blockedbyclient'));
  await page.goto('https://portal.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => { Object.assign(window, value); window.mount(); }, {
    fixture: createFixture(), paidFixture: paidFixture(), accounts,
    canSettle: true, failSettlements: 0, holdSettlement: false, ...options,
  });
  await page.getByRole('table').waitFor();
  return { page, context, errors };
}

const installment = (page, name = 'Parcela sintética 1/12') => page.getByRole('row').filter({ hasText: name });
const confirmButton = page => page.getByRole('dialog').getByRole('button', { name: /^Confirmar R\$/ });

async function startSettlement(page, discount = '20,00') {
  await installment(page).getByRole('button', { name: 'Receber', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar recebimento' });
  await dialog.waitFor();
  await page.waitForFunction(() => window.accountCalls.length > 0);
  await dialog.getByRole('combobox', { name: /Conta bancária \/ caixa/ }).click();
  await page.getByRole('option', { name: /CAIXA SINTÉTICO/ }).click();
  if (discount) await dialog.getByLabel(/^Desconto concedido/).fill(discount);
  await confirmButton(page).waitFor({ state: 'visible' });
  return dialog;
}

browserTest('Receber uses the real modal and reconciles both modules after success without a realtime event', async () => {
  const { page, context, errors } = await open({ holdSettlement: true });
  try {
    const dialog = await startSettlement(page);
    assert.match(await dialog.innerText(), /ESTUDANTE DE TESTE/);
    assert.match(await dialog.innerText(), /R\$\s*280,00/);
    assert.match(await dialog.innerText(), /integração bancária confirmar/);
    await page.screenshot({ path: resolve(output, 'settlement-form.png'), fullPage: true });
    await confirmButton(page).evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.settlementCalls.length === 1 && typeof window.releaseSettlement === 'function');
    assert.equal(await dialog.getByRole('button', { name: 'Confirmando...' }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1);
    const [call] = await page.evaluate(() => window.settlementCalls);
    assert.equal(call.receivableId, issuedReceivable().id);
    assert.equal(call.payload.contaBancariaId, accountId);
    assert.equal(call.payload.valorDesconto, '20,00');
    assert.equal(call.payload.valorPago, '280,00');
    assert.equal(call.payload.formaPagamento, 'DINHEIRO');
    assert.match(call.payload.idempotencyKey, /^[0-9a-f-]{36}$/i);
    assert.match(call.payload.dataPagamento, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(await page.evaluate(() => window.accountCalls), [poloId]);
    await page.evaluate(() => window.releaseSettlement());
    await dialog.waitFor({ state: 'detached' });
    await installment(page).getByText('PAGO', { exact: true }).waitFor();
    await page.getByText('1 paga(s), 0 pendente(s), 1 lançamento(s) no total.', { exact: true }).waitFor();
    assert.match(await installment(page).innerText(), /Recebido: R\$\s*280,00/);
    assert.doesNotMatch(await installment(page).innerText(), /Retomar emissão|Emissão não concluída/);
    assert.equal(await page.getByRole('button', { name: 'Receber', exact: true }).count(), 0);
    const invalidations = await page.evaluate(() => window.invalidations);
    for (const key of [
      ['turma-financeiro-extrato-aluno', createFixture().matriculaId],
      ['matricula-tecnica-financeiro', 'turma', createFixture().turmaId],
      ['financeiro', 'receivables'], ['financeiro-aluno-receivables'],
      ['financeiro-resumo-kpis'], ['financeiro', 'contas-bancarias-saldos'],
      ['aluno-financeiro'], ['turma-financeiro', createFixture().turmaId],
    ]) assert.ok(invalidations.some(value => JSON.stringify(value) === JSON.stringify(key)), `Missing invalidation: ${key}`);
    assert.equal(await page.evaluate(() => window.otherQueryInvalidated()), false);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('backend error keeps the form and retries with the same idempotency key and amount', async () => {
  const { page, context, errors } = await open({ failSettlements: 1 });
  try {
    const dialog = await startSettlement(page);
    await confirmButton(page).click();
    await dialog.getByRole('alert').filter({ hasText: 'Servidor não confirmou o recebimento' }).waitFor();
    assert.match(await installment(page).innerText(), /PENDENTE/);
    assert.equal(await page.getByText('1 paga(s), 0 pendente(s), 1 lançamento(s) no total.', { exact: true }).count(), 0);
    await confirmButton(page).click();
    await installment(page).getByText('PAGO', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.settlementCalls);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('account failure blocks confirmation even when a previously selected account remains cached', async () => {
  const { page, context, errors } = await open();
  try {
    const dialog = await startSettlement(page);
    assert.equal(await confirmButton(page).isEnabled(), true);
    await page.evaluate(async () => { window.accountError = true; await window.refetchAccounts(); });
    await dialog.getByRole('alert').filter({ hasText: 'Consulta de contas negada.' }).waitFor();
    assert.equal(await confirmButton(page).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('an unconfirmed server result keeps the title pending and exposes the failure', async () => {
  const { page, context, errors } = await open({ unconfirmedResult: true });
  try {
    const dialog = await startSettlement(page);
    await confirmButton(page).click();
    await dialog.getByRole('alert').filter({ hasText: 'O servidor não confirmou o recebimento' }).waitFor();
    assert.match(await installment(page).innerText(), /PENDENTE/);
    assert.equal(await page.getByText('1 paga(s), 0 pendente(s), 1 lançamento(s) no total.', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('initial account read failure remains visible and cannot submit a settlement', async () => {
  const { page, context, errors } = await open({ accountError: true });
  try {
    await installment(page).getByRole('button', { name: 'Receber', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('alert').filter({ hasText: 'Consulta de contas negada.' }).waitFor();
    assert.equal(await confirmButton(page).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('account options exclude inactive and physically foreign accounts despite shared visibility', async () => {
  const { page, context, errors } = await open();
  try {
    await installment(page).getByRole('button', { name: 'Receber', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /Conta bancária \/ caixa/ }).click();
    await page.getByRole('option', { name: /CAIXA SINTÉTICO/ }).waitFor();
    assert.equal(await page.getByRole('option').count(), 1);
    assert.equal(await page.getByRole('option', { name: /INATIVA|OUTRO POLO/ }).count(), 0);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('Gestão read permission alone never exposes receiving or loads bank accounts', async () => {
  const { page, context, errors } = await open({ canSettle: false });
  try {
    assert.equal(await installment(page).getByRole('button', { name: 'Receber', exact: true }).count(), 0);
    assert.equal(await installment(page).getByRole('button', { name: 'Abrir boleto', exact: true }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.accountCalls), []);
    assert.deepEqual(await page.evaluate(() => window.settlementCalls), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

browserTest('business restrictions and an eligibility change keep receiving blocked', async () => {
  const restricted = [
    issuedReceivable({ id: 'missing', descricao: 'Sem capability', operation_capabilities: null }),
    issuedReceivable({ id: 'paid', descricao: 'Já paga', status: 'PAGO' }),
    issuedReceivable({ id: 'canceled', descricao: 'Cancelada', status: 'CANCELADO' }),
    issuedReceivable({ id: 'proesc', descricao: 'Proesc', operation_capabilities: {
      sourceSystem: 'PROESC', provenanceKind: 'PROESC_HISTORY', canSettle: true,
    } }),
    issuedReceivable({ id: 'conflict', descricao: 'Conflitante', operation_capabilities: {
      sourceSystem: 'CONFLICT', provenanceKind: 'CONFLICT', canSettle: true,
    } }),
    issuedReceivable({ id: 'canceling', descricao: 'Cancelamento em curso', banese_cancellation: {
      state: 'PROCESSING', reason: 'TRANCAMENTO_FUTURO', movementId: 'synthetic-movement', cutoffDate: '2026-10-01',
    } }),
  ];
  const { page, context, errors } = await open({ fixture: createFixture([issuedReceivable(), ...restricted]) });
  try {
    assert.equal(await page.getByRole('button', { name: 'Receber', exact: true }).count(), 1);
    const dialog = await startSettlement(page);
    await page.evaluate(async () => {
      window.fixture.recebiveis[0].operation_capabilities.canSettle = false;
      await window.refreshStatement();
    });
    await installment(page).getByRole('button', { name: 'Receber', exact: true }).waitFor({ state: 'detached' });
    if (await dialog.count()) assert.equal(await confirmButton(page).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Receber', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.settlementCalls.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
