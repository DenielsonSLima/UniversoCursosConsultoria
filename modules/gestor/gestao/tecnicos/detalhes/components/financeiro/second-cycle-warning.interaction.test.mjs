import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.CYCLE_WARNING_JSDOM_PATH || 'jsdom');
import assert from 'node:assert/strict';
const base = resolve('modules/gestor/gestao/tecnicos/detalhes/components/financeiro') + '/';
mkdirSync('tmp', { recursive: true });
const bundlePath = resolve(`tmp/second-cycle-warning-${process.pid}.mjs`);
await build({
  entryPoints: [base + 'FinanceiroCicloManualDialog.tsx'],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  plugins: [
    {
      name: 'mock-io',
      setup(b) {
        b.onResolve({ filter: /^react(?:-dom)?$/ }, (a) => ({ path: a.path, external: true }));
        b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
        b.onResolve({ filter: /useMatriculaTecnicaCicloManual$/ }, () => ({
          path: 'query',
          namespace: 'mock',
        }));
        b.onResolve({ filter: /useCicloManualRevision$/ }, () => ({ path: 'revision', namespace: 'mock' }));
        b.onResolve({ filter: /lucide-react/ }, () => ({ path: 'icons', namespace: 'mock' }));
        b.onResolve(
          { filter: /FinanceiroCicloManual(EnrollmentOptions|ChargeRows|DatesSummary|IssuanceProgress)$/ },
          (a) => ({ path: a.path, namespace: 'mock' }),
        );
        b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({
          contents:
            a.path === 'supabase'
              ? `export const supabase={rpc:(...a)=>globalThis.rpc(...a)};`
              : a.path === 'query'
                ? `export const usePreviewCicloFinanceiroTecnicoManual=(_,enabled)=>{globalThis.previewEnabled=enabled;return globalThis.query;};`
                : a.path === 'revision'
                  ? `export const useCicloManualRevision=()=>globalThis.revision;`
                  : a.path === 'icons'
                    ? `export const AlertTriangle=()=>null,ArrowLeft=()=>null,CalendarDays=()=>null,Check=()=>null,CheckCircle2=()=>null,ChevronRight=()=>null,Fingerprint=()=>null,Loader2=()=>null,ReceiptText=()=>null,X=()=>null;`
                    : a.path.endsWith('EnrollmentOptions')
                      ? `import React from 'react'; export default p=>React.createElement('button',{onClick:()=>p.onModeChange('BOLETO')},'Modo boleto teste');`
                      : `export default ()=>null;`,
          loader: 'js',
        }));
      },
    },
  ],
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver'])
  globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
let root, host;
const cleanup = () => {
  if (root) React.act(() => root.unmount());
  host?.remove();
  root = null;
  host = null;
};
const render = (element) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  React.act(() => root.render(element));
  return { rerender: (next) => React.act(() => root.render(next)) };
};
const queryByRole = (role, options = {}) =>
  [...document.querySelectorAll(role === 'button' ? 'button' : `[role="${role}"]`)].find(
    (element) =>
      !options.name ||
      (typeof options.name === 'string'
        ? element.textContent.trim() === options.name
        : options.name.test(element.textContent)),
  );
const screen = {
  queryByRole: (...args) => queryByRole(...args) ?? null,
  getByRole: (...args) => {
    const element = queryByRole(...args);
    assert.ok(element, `Missing ${args}`);
    return element;
  },
};
const fireEvent = {
  click: (element) => React.act(() => element.click()),
  keyDown: (element, options) =>
    React.act(() =>
      element.dispatchEvent(new window.KeyboardEvent('keydown', { ...options, bubbles: true })),
    ),
};
const waitFor = async (assertion) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    try {
      return assertion();
    } catch (error) {
      if (attempt === 29) throw error;
    }
  }
};

const Dialog = (await import(pathToFileURL(bundlePath).href)).default;
const item = {
  chave: 'ciclo-2-parc-1',
  tipo: 'PARCELA',
  numero: 1,
  descricao: 'Nova mensalidade teste',
  valor: '120.00',
  vencimento: '2027-10-15',
  detalhesBoleto: { desconto: null, multa: null, juros: null },
};
const preview = {
  cicloNumero: 2,
  itens: [item],
  quantidadeItens: 1,
  total: '120.00',
  dataOrigem: '2027-10-15',
  primeiroVencimento: '2027-10-15',
  sourceVencimento: 'INDIVIDUAL',
  regraEfetivaFingerprint: 'r',
  politicaFingerprint: 'p',
  cronogramaFingerprint: 'c',
  termos: {
    descontoPontualidade: '0',
    jurosAtrasoPercentual: '0',
    multaAtrasoPercentual: '0',
    instrucaoBoleto: '',
    aplicacao: { matricula: {}, rematricula: {}, mensalidade: {} },
  },
};
const row = {
  matriculaId: 'm1',
  alunoNome: 'Aluno teste',
  matriculaExibicao: 'Teste 1',
  cicloManual: {
    proximoCicloNumero: 2,
    criterioElegibilidade: 'MANUAL_APOS_EMISSAO',
    primeiroVencimentoSugerido: '2027-10-15',
    estado: 'ELEGIVEL',
    podeGerar: true,
    cicloMaximo: 2,
  },
};
let issued = 0,
  closed = 0,
  reads = 0;
let statement = {
  matriculaId: 'm1',
  recebiveis: [
    {
      id: 'old',
      descricao: 'Mensalidade anterior teste',
      valor: '120',
      valor_pago: '20',
      data_vencimento: '2026-10-15',
      status: 'PENDENTE',
    },
    { id: 'paid', status: 'PAGO' },
    { id: 'cancel', status: 'CANCELADO' },
  ],
};
const reset = () => {
  cleanup();
  issued = closed = reads = 0;
  globalThis.query = { data: { preview }, isFetching: false, isError: false, isPlaceholderData: false };
  globalThis.revision = { revision: null, dirty: false, draft: null, seedPreview: () => {} };
  globalThis.rpc = async () => {
    reads++;
    return { data: statement, error: null };
  };
};
const props = () => ({
  row,
  turmaId: 't',
  pending: false,
  onClose: () => closed++,
  onConfirm: async () => {
    issued++;
  },
});
const review = () => {
  fireEvent.click(screen.getByRole('button', { name: /Ver composição/ }));
  fireEvent.click(screen.getByRole('button', { name: /Revisar geração/ }));
};
const open = () => fireEvent.click(screen.getByRole('button', { name: /Gerar e emitir BolePix/ }));
const ready = () =>
  waitFor(() => assert.equal(screen.getByRole('button', { name: 'Continuar' }).disabled, false));
const continueToWizard = async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => assert.ok(screen.getByRole('dialog')));
  assert.equal(issued, 0);
};
reset();
render(React.createElement(Dialog, props()));
assert.ok(screen.getByRole('alertdialog'));
assert.equal(screen.queryByRole('dialog'), null);
assert.equal(globalThis.previewEnabled, false);
await ready();
assert.equal(issued, 0);
assert.match(screen.getByRole('alertdialog').textContent, /Mensalidade anterior teste/);
assert.match(screen.getByRole('alertdialog').textContent, /Valor nominal/);
assert.match(screen.getByRole('alertdialog').textContent, /Valor pago informado/);
assert.equal(screen.queryByRole('dialog'), null);
const continueButton = screen.getByRole('button', { name: 'Continuar' });
fireEvent.click(continueButton);
fireEvent.click(continueButton);
await waitFor(() => assert.ok(screen.getByRole('dialog')));
assert.equal(issued, 0);
assert.equal(reads, 2);
assert.equal(globalThis.previewEnabled, true);
assert.equal(screen.queryByRole('alertdialog'), null);
review();
open();
await waitFor(() => assert.equal(issued, 1));
assert.equal(reads, 2);
assert.equal(screen.queryByRole('alertdialog'), null);
console.log(
  'PASS real DOM: warning before wizard, one continue/recheck, issuance only at final standard confirmation',
);
reset();
render(React.createElement(Dialog, props()));
await ready();
fireEvent.keyDown(document, { key: 'Escape' });
assert.equal(closed, 1);
assert.equal(issued, 0);
assert.equal(screen.queryByRole('dialog'), null);
console.log('PASS real DOM: Escape closes entry warning without opening wizard');
reset();
render(React.createElement(Dialog, props()));
await ready();
let release;
globalThis.rpc = () => new Promise((r) => (release = r));
const yes = screen.getByRole('button', { name: 'Continuar' });
fireEvent.click(yes);
fireEvent.click(yes);
fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
await React.act(async () => release({ data: statement, error: null }));
assert.equal(issued, 0);
assert.equal(closed, 1);
assert.equal(screen.queryByRole('dialog'), null);
console.log('PASS real DOM: cancel during pending recheck cannot continue or emit');
reset();
globalThis.query = { ...globalThis.query, data: undefined, isFetching: true };
render(React.createElement(Dialog, {
  ...props(), row: { ...row, cicloManual: { ...row.cicloManual, primeiroVencimentoSugerido: null } },
}));
assert.ok(screen.getByRole('alertdialog'));
assert.equal(globalThis.previewEnabled, false);
await continueToWizard();
assert.equal(globalThis.previewEnabled, false);
assert.equal(screen.getByRole('button', { name: /Ver composição/ }).disabled, true);
console.log('PASS real DOM: C2 without date or preview still requires entry warning');
reset();
const changed = render(React.createElement(Dialog, props()));
await continueToWizard();
review();
globalThis.query = { ...globalThis.query, isFetching: true };
changed.rerender(React.createElement(Dialog, props()));
assert.equal(screen.queryByRole('alertdialog'), null);
assert.equal(screen.getByRole('button', { name: /Gerar e emitir BolePix/ }).disabled, true);
globalThis.query = { ...globalThis.query, isFetching: false,
  data: { preview: { ...preview, cronogramaFingerprint: 'changed' } } };
changed.rerender(React.createElement(Dialog, props()));
assert.equal(screen.queryByRole('alertdialog'), null);
assert.equal(issued, 0);
console.log('PASS real DOM: editing/recalculating the wizard does not repeat entry confirmation');
reset();
globalThis.rpc = async () => ({ data: null, error: { message: 'permission denied' } });
render(React.createElement(Dialog, props()));
await waitFor(() => assert.ok(screen.getByRole('alert')));
assert.equal(screen.getByRole('button', { name: 'Continuar' }).disabled, true);
assert.equal(screen.queryByRole('dialog'), null);
assert.equal(issued, 0);
globalThis.rpc = async () => ({ data: statement, error: null });
fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
await continueToWizard();
console.log('PASS real DOM: read failure blocks entry until successful retry and explicit continue');
reset();
const selectionView = render(React.createElement(Dialog, props()));
await ready();
let finishOldRead;
globalThis.rpc = () => new Promise((done) => (finishOldRead = done));
fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
globalThis.rpc = async () => ({ data: { ...statement, matriculaId: 'm2' }, error: null });
selectionView.rerender(React.createElement(Dialog, {
  ...props(), row: { ...row, matriculaId: 'm2', alunoNome: 'Outro aluno teste' },
}));
await React.act(async () => finishOldRead({ data: statement, error: null }));
await ready();
assert.equal(issued, 0);
assert.equal(screen.queryByRole('dialog'), null);
assert.match(screen.getByRole('alertdialog').textContent, /Outro aluno teste/);
await continueToWizard();
console.log('PASS real DOM: changing enrollment discards late acknowledgement and requires its own warning');
reset();
render(React.createElement(Dialog, props()));
await ready();
const updated = { ...statement, recebiveis: [] };
globalThis.rpc = async () => ({ data: updated, error: null });
fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
await ready();
assert.equal(issued, 0);
assert.match(screen.getByRole('alert').textContent, /mudaram/);
assert.equal(screen.queryByRole('dialog'), null);
await continueToWizard();
console.log(
  'PASS real DOM: changed obligations require another acknowledgement, even when no open charges remain',
);
reset();
render(React.createElement(Dialog, props()));
await continueToWizard();
cleanup();
render(React.createElement(Dialog, props()));
assert.ok(screen.getByRole('alertdialog'));
assert.equal(screen.queryByRole('dialog'), null);
console.log('PASS real DOM: closing and reopening C2 requires a new warning');
reset();
globalThis.query.data.preview = { ...preview, cicloNumero: 1 };
render(
  React.createElement(Dialog, {
    ...props(),
    row: { ...row, cicloManual: { ...row.cicloManual, proximoCicloNumero: 1 } },
  }),
);
fireEvent.click(screen.getByRole('button', { name: 'Modo boleto teste' }));
review();
open();
await waitFor(() => assert.equal(issued, 1));
assert.equal(reads, 0);
assert.equal(screen.queryByRole('alertdialog'), null);
console.log('PASS real DOM: first-cycle regular flow unchanged, no statement query');
cleanup();

rmSync(bundlePath);
dom.window.close();
