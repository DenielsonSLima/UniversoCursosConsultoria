import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { build } from 'esbuild';

const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE || 'tmp/lgpd-test-runtime/node_modules/jsdom/lib/api.js')).href);

test('perfil aguarda cadastro completo e encaminha unidade financeira e permissões sem usar resumo como edição', async () => {
  await mkdir('tmp', { recursive: true });
  const temp = await mkdtemp(resolve('tmp/professor-profile-interaction-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  let resolveProfile;
  globalThis.__professorProfileRequest = new Promise((done) => { resolveProfile = done; });
  const output = resolve(temp, 'ui.mjs');
  const built = await build({ entryPoints: ['modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx'], outfile: output,
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'isolated-profile-boundaries', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', external: true }));
      builder.onResolve({ filter: /(?:ParceiroProfessor(?:Dados|Turmas|Documentos|Financeiro)|ProfessorPixEditor|ParceiroAcesso)$/ }, (args) => ({ path: args.path.split('/').pop(), namespace: 'tab' }));
      builder.onLoad({ filter: /.*/, namespace: 'tab' }, (args) => ({ loader: 'js', contents: `import React from 'react';export default function Panel(props){return React.createElement('div',{'data-panel':${JSON.stringify(args.path)},'data-props':JSON.stringify(props)},${args.path === 'ProfessorPixEditor' ? "React.createElement('button',{disabled:!props.canEdit,onClick:()=>props.onSave({tipoChavePix:'EMAIL',chavePix:'pix@example.com'})},'Salvar Pix de teste')" : 'null'})}` }));
      builder.onResolve({ filter: /parceiros\.service$/ }, () => ({ path: 'service', namespace: 'mock' }));
      builder.onResolve({ filter: /professor-pix\.service$/ }, () => ({ path: 'pix', namespace: 'mock' }));
      builder.onResolve({ filter: /ToastNotification$/ }, () => ({ path: 'toast', namespace: 'mock' }));
      builder.onResolve({ filter: /partner-email-update$/ }, () => ({ path: 'email', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: args.path === 'service'
        ? 'export const parceirosService={getById:()=>globalThis.__professorProfileRequest,update:async(_,data)=>data};'
        : args.path === 'pix' ? 'export async function saveProfessorPix(id,pix){globalThis.__pixSaved={id,...pix};globalThis.__professorProfileRequest=Promise.resolve({...globalThis.__loadedProfessor,...pix});return {id,...pix};}'
        : args.path === 'toast' ? 'export default function Toast(){return null};export function useToast(){return {toasts:[],removeToast(){},toast:{success(){},error(){},warning(){}}}}'
          : 'export class PartnerEmailPartialSaveError extends Error {};' }));
    } }] });
  await writeFile(output, built.outputFiles.find((item) => item.path.endsWith('.mjs')).contents);
  const { default: Profile } = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Profile, {
      professorInicial: { id: 'teacher', nome: 'Resumo' }, onBack() {}, poloId: null,
      financialPoloId: 'selected-unit', financeCacheScope: 'identity-context', allowedFinancialTabs: ['outros-creditos'],
      canEditPix: true,
    }))));
    assert.match(document.querySelector('[role="status"]').textContent, /cadastro completo/);
    assert.equal(document.querySelector('[data-panel]'), null);
    globalThis.__loadedProfessor = { id: 'teacher', nome: 'Cadastro completo', telefone: 'contato', status: 'ATIVO' };
    await act(async () => { resolveProfile(globalThis.__loadedProfessor); await new Promise((done) => setTimeout(done, 10)); });
    assert.equal(JSON.parse(document.querySelector('[data-panel]').dataset.props).data.telefone, 'contato');
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    assert.equal(tabs.length, 5);
    await act(async () => tabs.find((node) => node.textContent === 'Financeiro').click());
    const financial = JSON.parse(document.querySelector('[data-panel="ParceiroProfessorFinanceiro"]').dataset.props);
    assert.equal(financial.poloId, 'selected-unit');
    assert.equal(financial.cacheScope, 'identity-context');
    assert.deepEqual(financial.allowedFinancialTabs, ['outros-creditos']);
    const pix = JSON.parse(document.querySelector('[data-panel="ProfessorPixEditor"]').dataset.props);
    assert.equal(pix.professor.telefone, 'contato');
    assert.equal(pix.canEdit, true);
    await act(async () => { document.querySelector('[data-panel="ProfessorPixEditor"] button').click(); await new Promise((done) => setTimeout(done, 10)); });
    assert.deepEqual(globalThis.__pixSaved, { id: 'teacher', tipoChavePix: 'EMAIL', chavePix: 'pix@example.com' });
    const cached = client.getQueryData(['parceiro', 'teacher', 'identity-context']);
    assert.equal(cached.telefone, 'contato', 'Salvar Pix não pode substituir o cadastro pelo retorno parcial');
    assert.equal(cached.tipoChavePix, 'EMAIL');
    await act(async () => tabs.find((node) => node.textContent === 'Turmas e disciplinas').click());
    const academic = JSON.parse(document.querySelector('[data-panel]').dataset.props);
    assert.equal(academic.poloId, null, 'Global acadêmico não deve virar escopo físico da Matriz');
    assert.equal(academic.professorId, 'teacher');
    await act(async () => tabs.find((node) => node.textContent === 'Turmas e disciplinas').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    assert.equal(document.querySelector('[role=tab][aria-selected=true]').textContent, 'Dados do professor');
  } finally {
    await act(async () => root.unmount());
    client.clear(); dom.window.close(); delete globalThis.__professorProfileRequest;
    delete globalThis.__pixSaved; delete globalThis.__loadedProfessor;
    await rm(temp, { recursive: true, force: true });
  }
});
