import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, stop } from 'esbuild';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../../', import.meta.url));

test('React DOM: Financeiro escolhe sem cobrança ou BolePix; só a confirmação executa uma operação', async () => {
  const { JSDOM } = require(process.env.EAD_JSDOM_PATH ? resolve(process.env.EAD_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'ead-enrollment-smoke-'));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', '__eadSmokeClient']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const fake = { calls: [], finish: null, rpc: async (name, args) => {
    fake.calls.push({ name, args });
    return new Promise(resolveResult => { fake.finish = resolveResult; });
  }, functions: { invoke: async (name, { body }) => {
    fake.calls.push({ name, body });
    return new Promise(resolveResult => { fake.finish = resolveResult; });
  } } };
  globalThis.__eadSmokeClient = fake;
  let reactRoot;
  let act;
  let client;
  try {
    const output = join(temporary, 'components.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export { default as Modal } from './modules/gestor/gestao/ead/detalhes/components/AdicionarAlunoEadModal';
      export { EadEnrollmentAction } from './modules/gestor/gestao/ead/detalhes/components/EadEnrollmentAction';
      export { EadFinanceiroPanel } from './modules/gestor/gestao/ead/detalhes/components/EadFinanceiroPanel';
      export { useMatricularAlunoEadMutation } from './modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadMutations';
    `, resolveDir: rootDirectory, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
      name: 'synthetic-client', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'synthetic', namespace: 'smoke' }));
        builder.onLoad({ filter: /.*/, namespace: 'smoke' }, () => ({ contents: 'export const supabase = globalThis.__eadSmokeClient;', loader: 'js' }));
      },
    }] });
    const components = require(output);
    const { React, createRoot, QueryClient, QueryClientProvider, Modal, EadEnrollmentAction, EadFinanceiroPanel, useMatricularAlunoEadMutation } = components;
    act = components.act;
    const h = React.createElement;
    const aluno = { id: '00000000-0000-4000-8000-000000000001', nome: 'Aluno sintético', email: 'qa@example.com' };
    const turma = '00000000-0000-4000-8000-000000000002';
    const curso = '00000000-0000-4000-8000-000000000003';
    let outcome;
    let lastError;
    let canEnroll = true;
    let courseValue = 129.9;
    let unsafeMutation;
    const permissions = { modules: ['gestao', 'financeiro'], financeiroTabs: [], allPolos: false };
    function Harness() {
      const [open, setOpen] = React.useState(true);
      const mutation = useMatricularAlunoEadMutation(turma, curso, [aluno], canEnroll, {
        onSuccess: (_name, result) => { outcome = result; setOpen(false); }, onError: error => { lastError = error; },
      });
      unsafeMutation = mutation;
      return h(React.Fragment, null, h('button', { onClick: () => setOpen(true) }, 'Abrir'),
        h(EadEnrollmentAction, { permissions: canEnroll ? permissions : { ...permissions, modules: ['gestao', 'caixa'] }, onClick: () => setOpen(true) }), h(Modal, {
        open: open && canEnroll, cursoNome: 'Curso sintético', valor: courseValue, search: '', alunos: [aluno],
        isLoading: false, isFetching: false, isSearchSettling: false, isError: false,
        pendingAlunoId: mutation.isPending ? mutation.variables?.alunoId : null, onSearchChange() {},
        onClose: () => setOpen(false), onRetry() {}, onMatricular: input => mutation.mutate(input),
      }));
    }
    const flush = () => new Promise(resolveTick => setTimeout(resolveTick, 5));
    const click = async element => { assert.ok(element); await act(async () => { element.click(); await flush(); }); };
    const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const container = document.createElement('div'); document.body.appendChild(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    reactRoot = createRoot(container);
    await act(async () => { reactRoot.render(h(QueryClientProvider, { client }, h(Harness))); await flush(); });
    await click(button('Selecionar'));
    assert.equal(fake.calls.length, 0);
    assert.match(document.body.textContent, /Como deseja adicionar o aluno/);
    assert.match(document.body.textContent, /129,90/);
    assert.match(document.body.textContent, /sem acesso às aulas/);
    await click(button('Voltar'));
    assert.equal(fake.calls.length, 0);
    await click(button('Selecionar'));
    const confirm = button('Confirmar e gerar cobrança');
    await act(async () => { confirm.click(); confirm.click(); await flush(); });
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].name, 'payment-checkout');
    assert.equal(fake.calls[0].body.turmaId, turma);
    assert.equal(fake.calls[0].body.courseId, curso);
    assert.equal(fake.calls[0].body.alunoId, aluno.id);
    assert.equal(fake.calls[0].body.managerEnrollment, true);
    assert.equal(fake.calls[0].body.method, 'BOLETO');
    assert.equal('valor' in fake.calls[0].body, false, 'Preço não vem do navegador');
    assert.match(fake.calls[0].body.requestId, /^[0-9a-f-]{36}$/);
    assert.ok(document.querySelector('[aria-label="Fechar"]').disabled);
    await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush(); });
    assert.ok(document.querySelector('[role="dialog"]'));
    await act(async () => { fake.finish({ data: { matriculaId: 'matricula', receivableId: 'titulo', awaitingConfirmation: true }, error: null }); await flush(); });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(outcome.mode, 'GERAR_COBRANCA');
    assert.equal(outcome.checkout.awaitingConfirmation, true);
    await click(button('Abrir'));
    assert.ok(button('Selecionar'), 'Reabrir limpa a confirmação anterior');
    assert.equal(fake.calls.length, 1);
    await click(button('Selecionar'));
    await click(button('Confirmar e gerar cobrança'));
    await act(async () => { fake.finish({ data: null, error: { message: 'Falha transitória sintética' } }); await flush(); });
    assert.match(lastError.message, /Falha transitória/);
    assert.ok(!button('Confirmar e gerar cobrança').disabled, 'Falha libera nova tentativa explícita');
    await click(button('Confirmar e gerar cobrança'));
    assert.equal(fake.calls.length, 3, 'Submission ref reseta após erro, sem fechar o modal');
    await act(async () => { fake.finish({ data: { matriculaId: 'matricula', receivableId: 'titulo' }, error: null }); await flush(); });
    assert.equal(fake.calls[1].body.requestId, fake.calls[2].body.requestId, 'Retry mantém a identidade da solicitação');
    courseValue = 0;
    await click(button('Abrir'));
    await click(button('Selecionar'));
    assert.ok(button('Confirmar e gerar cobrança').disabled, 'Cobrança exige preço positivo');
    const freeMode = document.querySelector('input[value="SEM_COBRANCA"]');
    await click(freeMode);
    assert.equal(fake.calls.length, 3, 'Escolher sem cobrança ainda não executa nada');
    assert.match(document.body.textContent, /Acesso imediato, sem cobrança/);
    assert.match(document.body.textContent, /Nenhum valor será lançado/);
    const freeConfirm = button('Confirmar sem cobrança');
    assert.equal(freeConfirm.disabled, false, 'Sem cobrança funciona no curso sem preço');
    await act(async () => { freeConfirm.click(); freeConfirm.click(); await flush(); });
    assert.equal(fake.calls.length, 4);
    assert.equal(fake.calls[3].name, 'ead_adicionar_aluno_sem_cobranca_secure');
    assert.equal(fake.calls[3].args.p_aluno_id, aluno.id);
    assert.equal(fake.calls[3].args.p_turma_id, turma);
    assert.equal(fake.calls[3].args.p_confirm, true);
    assert.match(fake.calls[3].args.p_request_id, /^[0-9a-f-]{36}$/);
    assert.equal('p_amount' in fake.calls[3].args, false, 'Sem cobrança não envia preço');
    await act(async () => { fake.finish({ data: { success: true, mode: 'SEM_COBRANCA', status: 'ATIVO', matriculaId: 'matricula-gratuita' }, error: null }); await flush(); });
    assert.equal(outcome.mode, 'SEM_COBRANCA');
    assert.equal(document.querySelector('[role="dialog"]'), null);
    canEnroll = false;
    await act(async () => { reactRoot.render(h(QueryClientProvider, { client }, h(Harness))); await flush(); });
    assert.equal(button('Adicionar aluno'), undefined, 'Caixa/gestão sem Financeiro não oferecem matrícula');
    await act(async () => { unsafeMutation.mutate({ alunoId: aluno.id, mode: 'SEM_COBRANCA', requestId: crypto.randomUUID() }); await flush(); });
    assert.match(lastError.message, /Financeiro obrigatório/);
    assert.equal(fake.calls.length, 4, 'A mutação também bloqueia disparo programático sem permissão');
    await act(async () => { reactRoot.render(h(EadFinanceiroPanel, { resumo: { valor: 129.9 }, alunos: [{ matriculaId: 'sem-cobranca', nome: 'Aluno sintético', status: 'ATIVO' }], pagamentos: [], isLoading: false, isError: false })); await flush(); });
    assert.match(container.textContent, /Sem cobrança vinculada/);
    assert.doesNotMatch(container.textContent, /129,90|Manual/);
    assert.equal([...container.querySelectorAll('span')].some(node => node.textContent === 'Confirmado'), false);

  } finally {
    if (reactRoot && act) await act(async () => reactRoot.unmount());
    client?.clear(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
    stop();
  }
});
