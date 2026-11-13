import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../../../', import.meta.url));
const jsdom = process.env.NFSE_TEST_JSDOM_MODULE || process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('EAD trust access follows Gestão permissions, expires without regrant and refreshes the same class', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/ead-trust-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  dom.window.scrollTo = () => {};
  const realNow = Date.now;
  let now = Date.parse('2026-11-12T12:00:00.000Z');
  Date.now = () => now;
  let root;
  const clients = [];
  const channels = [];
  const reads = [];
  const rpcReads = [];
  const minimalResponses = [];
  const trustSignals = [];
  let heldTrust;
  const grants = [];
  const scheduled = new Map();
  let timerId = 0;
  dom.window.setTimeout = (callback, delay = 0) => {
    const id = ++timerId; scheduled.set(id, { at: now + Number(delay), callback }); return id;
  };
  dom.window.clearTimeout = id => scheduled.delete(id);
  const row = { matriculaId: 'enrollment-synthetic', alunoId: 'student-synthetic', nome: 'Aluno sintético pendente', status: 'PENDENTE',
    email: 'private-marker', cpfCnpj: 'document-marker', valorPago: 9876.54, progressoPercentual: 75,
    aulasConcluidas: 3, totalAulas: 4, atividadesConcluidas: 2, totalAtividades: 3, certificadoStatus: 'certificate-marker',
    acessoTemporarioAte: null };
  globalThis.__eadTrustRows = [row];
  globalThis.__eadTrustReads = reads;
  globalThis.__eadTrustSupabase = {
    rpc(name, payload) {
      rpcReads.push({ name, payload });
      let data;
      if (name === 'ead_get_turma_dashboard') data = { cursoNome: 'Curso EAD sintético', area: 'EAD', valor: 100,
        alunosLiberados: 7, alunosConcluidos: 3, configuracao: { conteudos: [] } };
      else if (name === 'ead_get_turma_alunos') { reads.push(payload.p_turma_id); data = globalThis.__eadTrustRows; }
      else if (name === 'ead_get_turma_trust_access') {
        reads.push(payload.p_turma_id);
        data = globalThis.__eadTrustRows.map(item => ({ matriculaId: item.matriculaId, nome: item.nome, status: item.status,
          acessoTemporarioAte: item.acessoTemporarioAte,
          acessoTemporarioAtivo: item.acessoTemporarioAtivo ?? Boolean(item.acessoTemporarioAte && Date.parse(item.acessoTemporarioAte) > now) }));
        minimalResponses.push(data);
      } else {
        assert.equal(name, 'ead_liberar_por_confianca'); grants.push({ name, payload });
        data = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        globalThis.__eadTrustRows = [{ ...row, acessoTemporarioAte: data }];
      }
      const request = name === 'ead_get_turma_trust_access' && heldTrust ? heldTrust.promise : Promise.resolve({ data, error: null });
      request.abortSignal = signal => { if (name === 'ead_get_turma_trust_access') trustSignals.push(signal); return request; };
      return request;
    },
    from(table) { assert.equal(table, 'inscricoes_online'); return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }) }; },
    channel(name) {
      const channel = { name, handlers: [], removed: false,
        on(_kind, filter, callback) { this.handlers.push({ filter, callback }); return this; },
        subscribe(callback) { this.status = callback; callback?.('SUBSCRIBED'); return this; } };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { channel.removed = true; },
  };
  try {
    const outfile = resolve(temp, 'detail.mjs');
    const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx')],
      bundle: true, write: false, outfile, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
      loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-ead-trust', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const supabase=globalThis.__eadTrustSupabase;' }));
      } }] });
    await writeFile(outfile, compiled.outputFiles[0].contents);
    const { default: Detail } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const turma = { id: 'class-synthetic', cursoId: 'course-synthetic', codigo: 'EAD-SYN', nome: 'Turma EAD sintética',
      cursoNome: 'Curso EAD sintético', status: 'EM_ANDAMENTO', dataInicio: '2026-11-01', dataPrevisaoTermino: '2027-01-01' };
    const settle = async (ms = 25) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
    let mountReadStart = 0, fullAllowed = false;
    const mount = async (tabs, modules = ['gestao']) => {
      if (root) { await act(async () => root.unmount()); root = null; }
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
      clients.push(client);
      mountReadStart = rpcReads.length;
      fullAllowed = modules.includes('gestao') && (tabs.includes('alunos') || tabs.includes('financeiro'));
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Detail, {
        turma, onBack() {}, permissions: { modules, financeiroTabs: [], allPolos: false, tabs: { gestao: tabs } },
      }))));
      await settle(); return client;
    };
    const panel = () => document.querySelector('section[aria-label="Acesso EAD por confiança"]');
    const grantButtons = () => [...document.querySelectorAll('button')].filter(button => button.textContent.includes('Liberar por confiança'));
    const sectionButton = label => [...document.querySelectorAll('nav[aria-label="Seções da turma"] button')].find(button => button.textContent === label);
    const assertMinimal = () => {
      assert.equal(document.querySelectorAll('section[aria-label="Acesso EAD por confiança"]').length, 1);
      assert(panel().textContent.includes(row.nome));
      for (const marker of ['private-marker', 'document-marker', 'certificate-marker', '9.876,54', '75%']) assert(!panel().textContent.includes(marker));
      const recent = rpcReads.slice(mountReadStart);
      assert(recent.some(read => read.name === 'ead_get_turma_trust_access' && read.payload.p_turma_id === turma.id));
      assert.equal(recent.some(read => read.name === 'ead_get_turma_alunos'), fullAllowed,
        'Gestão-only profiles read the minimal RPC, never the full student RPC');
      assert.deepEqual(Object.keys(minimalResponses.at(-1)[0]).sort(),
        ['matriculaId', 'nome', 'status', 'acessoTemporarioAte', 'acessoTemporarioAtivo'].sort());
    };
    await mount(['alunos']);
    assertMinimal(); assert.equal(grantButtons().length, 1); assert.equal(sectionButton('Financeiro'), undefined);
    assert.equal(sectionButton('Alunos').getAttribute('aria-current'), 'page');
    await act(async () => grantButtons()[0].click()); await settle();
    assert.equal(grants.length, 1); assert.deepEqual(grants[0].payload, { p_matricula_id: row.matriculaId });
    assert(panel().textContent.includes('Por confiança até')); assert.equal(grantButtons().length, 0);
    assert.equal(globalThis.__eadTrustRows[0].status, 'PENDENTE', 'Trust never marks the enrollment paid or active');
    now += 24 * 60 * 60 * 1000;
    await act(async () => { for (const [id, task] of [...scheduled]) if (task.at <= now + 1) { scheduled.delete(id); task.callback(); } });
    assert(panel().textContent.includes('Prazo encerrado')); assert.equal(grantButtons().length, 0);
    assert.equal(grants.length, 1, 'Expiration cannot call the grant RPC again');
    await mount(['resumo']);
    assert(panel().textContent.includes('Prazo encerrado')); assert.equal(grantButtons().length, 0, 'Reopening an expired grant never offers a new grant');
    globalThis.__eadTrustRows = [{ ...row, acessoTemporarioAte: 'invalid-deadline' }];
    await mount(['resumo']); assert(panel().textContent.includes('Prazo indisponível')); assert.equal(grantButtons().length, 0);
    globalThis.__eadTrustRows = [{ ...row, acessoTemporarioAte: new Date(now + 60_000).toISOString(), acessoTemporarioAtivo: false }];
    await mount(['resumo']); assert(panel().textContent.includes('Liberação temporária encerrada')); assert.equal(grantButtons().length, 0);
    globalThis.__eadTrustRows = [row];
    await mount(['resumo']); assertMinimal(); assert.equal(grantButtons().length, 1);
    assert.equal(sectionButton('Alunos'), undefined); assert.equal(sectionButton('Financeiro'), undefined);
    await mount(['configuracoes']); assertMinimal(); assert.equal(grantButtons().length, 1);
    await mount([]); assertMinimal(); assert.equal(grantButtons().length, 1);
    assert(document.body.textContent.includes('Nenhuma área da turma liberada'));
    await mount(['alunos', 'financeiro']); assertMinimal(); assert.equal(grantButtons().length, 1);
    await act(async () => sectionButton('Financeiro').click()); await settle(); assert.equal(panel(), null);
    await act(async () => sectionButton('Alunos').click()); await settle(); assertMinimal();
    await mount(['resumo'], ['financeiro']); assert.equal(panel(), null); assert.equal(grantButtons().length, 0);
    const client = await mount(['resumo']);
    const channel = channels.at(-1);
    assert.equal(channel.name, `gestao-ead-turma-${turma.id}`);
    assert(channel.handlers.some(item => item.filter.table === 'gestao_realtime_events' && item.filter.filter === `turma_id=eq.${turma.id}`));
    let before = reads.length;
    await act(async () => channel.status('SUBSCRIBED')); await settle(350);
    assert(reads.length > before, 'A reconnected subscription reads canonical data without clicking');
    globalThis.__eadTrustRows = [{ ...row, acessoTemporarioAte: new Date(now + 1000).toISOString() }];
    before = reads.length;
    await act(async () => channel.handlers.find(item => item.filter.table === 'gestao_realtime_events').callback({ new: { turma_id: turma.id } }));
    await settle(350); assert(reads.length > before); assert(panel().textContent.includes('Por confiança até'));
    before = reads.length; await act(async () => window.dispatchEvent(new dom.window.Event('focus'))); await settle(350);
    assert(reads.length > before, 'Focus catches up the same scoped query');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    before = reads.length; await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange'))); await settle(350);
    assert.equal(reads.length, before, 'Hidden visibility does not request a refresh');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange'))); await settle(350);
    assert(reads.length > before, 'Returning to the visible page refreshes the same class');
    assert.equal(grants.length, 1, 'Events and profiles never create an automatic grant');
    let releaseTrust;
    heldTrust = { promise: new Promise(done => { releaseTrust = done; }) };
    await act(async () => channel.handlers[0].callback({ new: { turma_id: turma.id } })); await settle(350);
    const pendingSignal = trustSignals.at(-1); assert.equal(pendingSignal.aborted, false);
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Detail, {
      turma, onBack() {}, permissions: { modules: [], financeiroTabs: [], allPolos: false, tabs: { gestao: ['resumo'] } },
    })))); await settle();
    assert.equal(pendingSignal.aborted, true, 'Losing Gestão permission cancels the in-flight minimal read');
    assert.equal(panel(), null);
    await act(async () => releaseTrust({ data: minimalResponses.at(-1), error: null })); await settle();
    assert.equal(panel(), null, 'A late minimal response cannot reopen the restricted panel');
    heldTrust = null;
    await act(async () => root.unmount()); root = null;
    assert.equal(channel.removed, true); assert.equal(scheduled.size, 0, 'Unmount clears the deadline timer');
    before = reads.length; channel.status('SUBSCRIBED'); channel.handlers[0].callback({ new: { turma_id: turma.id } });
    window.dispatchEvent(new dom.window.Event('focus')); await settle(350);
    assert.equal(reads.length, before, 'Disposed listeners cannot refetch or grant');
    assert.deepEqual(new Set(reads), new Set([turma.id])); client.clear();
  } finally {
    if (root) await act(async () => root.unmount());
    clients.forEach(client => client.clear()); Date.now = realNow; dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.__eadTrustRows; delete globalThis.__eadTrustReads; delete globalThis.__eadTrustSupabase;
    await rm(temp, { recursive: true, force: true });
  }
});
