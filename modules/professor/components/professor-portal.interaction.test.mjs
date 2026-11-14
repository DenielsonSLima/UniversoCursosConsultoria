import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { build } from 'esbuild';

const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE || 'tmp/lgpd-test-runtime/node_modules/jsdom/lib/api.js')).href);
const wait = () => new Promise((resolveWait) => setTimeout(resolveWait, 20));

test('shell mantém contexto de filiais iguais, atalhos, foco; perfil conserva campos e rascunho; envio bloqueia repetição', async () => {
  await mkdir('tmp', { recursive: true });
  const temp = await mkdtemp(resolve('tmp/professor-portal-interaction-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const fixture = globalThis.__professorPortalFixture = {
    profile: { id: 'teacher-test', nome: 'DOCENTE SINTÉTICO', nomeCompleto: 'DOCENTE SINTÉTICO',
      email: 'teacher@example.invalid', cpf: 'documento sintético', telefone: 'contato anterior', contato1: 'contato anterior',
      rgUfEmissao: 'SE', tipoConta: 'POUPANÇA', especialidade: 'Especialidade sintética' },
    failSave: true, saves: [], passwords: [],
  };
  const output = resolve(temp, 'ui.mjs');
  const compiled = await build({
    stdin: { contents: `export {default as Shell} from './modules/professor/components/ProfessorShell';
      export {default as Perfil} from './modules/professor/perfil/PerfilPage';
      export {ProfessorMessageComposer as Composer} from './modules/professor/comunicacao/ProfessorMessageComposer';`,
      resolveDir: process.cwd(), loader: 'tsx' },
    outfile: output, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'isolated-transports', setup(builder) {
      builder.onResolve({ filter: /(?:parceiros\.service|login\.service|lib\/supabase|GoogleIdentityCard|ProfessorSignaturePanel)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
        const content = path.endsWith('parceiros.service') ? `export const parceirosService={
          getById:async()=>structuredClone(globalThis.__professorPortalFixture.profile),
          update:async(id,data)=>{const f=globalThis.__professorPortalFixture;f.saves.push({id,data});
            if(f.failSave)throw new Error('Falha sintética de gravação');
            f.profile={...f.profile,...data};return structuredClone(f.profile)}};`
          : path.endsWith('login.service') ? `export const loginService={updatePassword:async(value)=>{globalThis.__professorPortalFixture.passwords.push(value);return null}};`
          : path.endsWith('lib/supabase') ? `export const supabase={channel:()=>{const c={on:()=>c,subscribe:()=>c};return c},removeChannel:async()=>{}};`
          : 'export default function Placeholder(){return null}';
        return { loader: 'js', contents: content };
      });
    } }],
  });
  await writeFile(output, compiled.outputFiles.find((file) => file.path.endsWith('.mjs')).contents);
  const { Shell, Perfil, Composer } = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const render = async (node) => {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, node)));
    await act(wait);
  };
  const button = (label) => [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
  const fill = async (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  const polos = [
    { id: 'unit-a', nome: 'UNIDADE SINTÉTICA', cidade: 'JAPOATÃ', estado: 'SE' },
    { id: 'unit-b', nome: 'UNIDADE SINTÉTICA', cidade: 'PROPRIÁ', estado: 'SE' },
  ];
  const routes = [];
  const Harness = () => {
    const [menu, setMenu] = React.useState(false);
    const [polo, setPolo] = React.useState('unit-a');
    return React.createElement(Shell, {
      activeModule: 'inicio', activePolos: polos, contentScrollRef: React.createRef(),
      currentPolo: polos.find((item) => item.id === polo), currentPoloId: polo,
      isMobileMenuOpen: menu, isPoloSelectorOpen: false,
      professorEmail: 'teacher@example.invalid', professorNome: 'Docente sintético',
      onModuleChange: (id) => routes.push(id), onMobileMenuChange: setMenu,
      onPoloChange: setPolo, onPoloSelectorChange() {}, onLogout() {},
    }, React.createElement('p', null, 'Conteúdo sintético'));
  };
  try {
    await render(React.createElement(Harness));
    assert.equal(document.querySelector('.professor-shell-polo small').textContent, 'JAPOATÃ / SE');
    const picker = document.querySelector('[aria-label="Unidade de trabalho"]');
    await act(async () => picker.focus());
    await fill(picker, 'propria');
    await act(async () => document.querySelector('[role="option"]').click());
    assert.equal(document.querySelector('.professor-shell-polo small').textContent, 'PROPRIÁ / SE');
    await act(async () => button('Planejar').click());
    assert.deepEqual(routes, ['plano-curso']);
    const more = document.querySelector('[aria-label="Abrir todos os módulos"]');
    await act(async () => more.click());
    assert(document.querySelector('[role="dialog"]'));
    await act(wait);
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Fechar menu');
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);

    await render(React.createElement(Perfil, { professorId: 'teacher-test' }));
    await act(async () => button('Alterar dados').click());
    assert.equal(document.querySelectorAll('select').length, 0);
    assert.equal(document.querySelectorAll('input[name]').length, 12);
    assert.equal(document.querySelector('input[name="email"]'), null);
    assert.equal(document.querySelector('[aria-label="Tipo de conta"]').value, 'POUPANÇA');
    await fill(document.querySelector('input[name="nomeCompleto"]'), 'Rascunho preservado');
    await fill(document.querySelector('input[name="telefone"]'), 'novo contato sintético');
    await act(async () => client.setQueryData(['professor-perfil', 'teacher-test'], { ...fixture.profile, nomeCompleto: 'Versão remota' }));
    assert.equal(document.querySelector('input[name="nomeCompleto"]').value, 'Rascunho preservado');
    await act(async () => { button('Salvar dados').click(); button('Salvar dados').click(); });
    assert.equal(fixture.saves.length, 1);
    assert.equal(document.querySelector('input[name="nomeCompleto"]').value, 'Rascunho preservado');
    fixture.failSave = false;
    await act(async () => button('Salvar dados').click());
    assert.equal(fixture.saves[1].data.contato1, 'novo contato sintético');
    assert.equal(fixture.saves[1].data.email, undefined);
    await act(async () => button('Segurança').click());
    await fill(document.getElementById('professor-new-password'), 'curta');
    await act(async () => button('Alterar senha').click());
    assert.equal(fixture.passwords.length, 0);
    assert.match(document.querySelector('[role="alert"]').textContent, /8 caracteres/);
    await fill(document.getElementById('professor-new-password'), 'Sintetica123');
    await fill(document.getElementById('professor-confirm-password'), 'Sintetica123');
    await act(async () => { button('Alterar senha').click(); button('Alterar senha').click(); });
    assert.deepEqual(fixture.passwords, ['Sintetica123']);

    let sent = 0;
    const composer = (uploading) => React.createElement(Composer, {
      fileInputRef: React.createRef(), messageText: 'Mensagem sintética', pendingFile: null, uploading,
      onFile() {}, onFileError() {}, onMessage() {}, onSend: () => sent++,
    });
    await render(composer(true));
    await act(async () => document.querySelector('[aria-label="Mensagem"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(sent, 0);
    assert(document.querySelector('[aria-label="Enviar mensagem"]').disabled);
    await render(composer(false));
    await act(async () => document.querySelector('[aria-label="Enviar mensagem"]').click());
    assert.equal(sent, 1);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    delete globalThis.__professorPortalFixture;
    await rm(temp, { recursive: true, force: true });
  }
});
