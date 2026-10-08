import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// CONTRACT_EDITOR_JSDOM_PATH can point to an existing external JSDOM install.
// This test uses an in-memory DOM and mocks IO; it never opens a browser or saves remotely.
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.CONTRACT_EDITOR_JSDOM_PATH || 'jsdom');
const bundlePath = resolve(`tmp/contract-closing-editor-interaction-${process.pid}.mjs`);
mkdirSync('tmp', { recursive: true });
await build({
  entryPoints: [resolve(import.meta.dirname, 'components/ContratoAlunoTemplateEditor.tsx')],
  outfile: bundlePath, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'mock-template-io', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, ({ path }) => ({ path, external: true }));
    builder.onResolve({ filter: /useContratoAlunoTemplate$/ }, () => ({ path: 'query', namespace: 'mock' }));
    builder.onResolve({ filter: /empresas\.service$/ }, () => ({ path: 'company', namespace: 'mock' }));
    builder.onResolve({ filter: /marca-dagua\.service$/ }, () => ({ path: 'watermark', namespace: 'mock' }));
    builder.onResolve({ filter: /LocalQrCodeImage$/ }, () => ({ path: 'qr', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'js', contents:
      path === 'query' ? 'export const useContratoAlunoTemplate=()=>globalThis.contractEditorQueries;'
        : path === 'company' ? 'export const empresasService={getCompanyPrincipal:async()=>null};'
          : path === 'watermark' ? 'export const marcaDaguaService={getCompaniesWithWatermark:async()=>[]};'
            : "import React from 'react';export const LocalQrCodeImage=()=>React.createElement('span',null,'QR');",
    }));
  } }],
});
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { ContratoAlunoTemplateEditor } = await import(pathToFileURL(bundlePath).href);
const saved = [];
const content = {
  status: 'EM_REVISAO', tituloDocumento: 'Contrato de teste', cabecalho: '', corpo: 'Texto de teste.',
  destaquesCriticos: [], destaquesAtencao: [], observacaoEscopo: '', fonte: 'MINUTA_TECNICA',
  rodape: 'Cidade, data.\nCONTRATANTE: Aluno Exemplo\nCONTRATADA: Instituição Exemplo\nTESTEMUNHAS:\n1: _____\n2: _____',
  qr: { habilitado: true, rotulo: 'Validar', caminhoValidacao: '/validar', modoValidade: 'SEM_VENCIMENTO', diasValidade: null },
};
globalThis.contractEditorQueries = {
  templateQuery: { data: { revisao: 1, status: 'EM_REVISAO', conteudo: content } },
  saveMutation: { mutate: (value) => saved.push(structuredClone(value)), isPending: false },
  approveMutation: { isPending: false },
};
const root = createRoot(document.getElementById('root'));
const button = (label) => {
  const found = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
  assert.ok(found, `Botão ${label} deve existir.`); return found;
};
const input = (label) => {
  const found = [...document.querySelectorAll('label')].find((node) => node.textContent.startsWith(label))?.querySelector('input');
  assert.ok(found, `Campo ${label} deve existir.`); return found;
};
const click = async (element) => React.act(async () => element.click());
const type = async (element, value) => {
  await React.act(async () => {
    element.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
};
const pointer = async (element, type, patch = {}) => React.act(async () => {
  const event = new window.Event(type, { bubbles: true });
  Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, ...patch });
  element.dispatchEvent(event);
});
const key = async (element, value, shiftKey = false) => React.act(async () => {
  element.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: value, shiftKey }));
});
const captures = new WeakMap();
window.HTMLElement.prototype.setPointerCapture = function(id) { captures.set(this, id); };
window.HTMLElement.prototype.hasPointerCapture = function(id) { return captures.get(this) === id; };
window.HTMLElement.prototype.releasePointerCapture = function() { captures.delete(this); };

try {
  await React.act(async () => root.render(React.createElement(ContratoAlunoTemplateEditor, { modalidade: 'TECNICO' })));
  const page = document.querySelector('[data-contract-page]');
  page.getBoundingClientRect = () => ({ width: 794 * 0.58, height: 1123 * 0.58 });
  const qr = document.querySelector('[data-contract-closing-element="qr"]');
  assert.ok(button('Salvar versão').disabled);
  await type(input('Horizontal'), '165');
  assert.equal(button('Salvar versão').disabled, false, 'Digitar um número habilita Salvar sem exigir blur prévio.');
  await React.act(async () => { button('Salvar versão').focus(); button('Salvar versão').click(); });
  assert.equal(saved.at(-1).layoutEncerramento.elements.qr.x, 165);
  await click(button('Restaurar posição de QR Code'));
  await pointer(qr, 'pointerdown');
  await pointer(qr, 'pointermove', { clientX: 100 - 10 * 794 / 210 * 0.58, clientY: 100 + 10 * 1123 / 297 * 0.58 });
  await pointer(qr, 'pointerup');
  assert.equal(input('Horizontal').value, '162');
  assert.equal(input('Vertical').value, '220.5');
  await key(qr, 'ArrowRight');
  await key(qr, 'ArrowDown', true);
  assert.equal(input('Horizontal').value, '162.5');
  assert.equal(input('Vertical').value, '225.5');
  await pointer(qr, 'pointerdown');
  await pointer(qr, 'pointercancel');
  await pointer(qr, 'pointermove', { clientY: 999 });
  assert.equal(input('Vertical').value, '225.5');

  // Blur on a pointer click must commit the most recent number before Save's onClick.
  await type(input('Horizontal'), '156.55');
  await React.act(async () => { button('Salvar versão').focus(); button('Salvar versão').click(); });
  assert.equal(saved.at(-1).layoutEncerramento.elements.qr.x, 156.6);
  assert.equal(saved.at(-1).layoutEncerramento.elements.qr.y, 225.5);
  assert.deepEqual(saved.at(-1).layoutEncerramento.elements.contratante, { x: 18, y: 221, width: 62 });

  await type(input('Horizontal'), '18');
  await React.act(async () => input('Horizontal').blur());
  assert.ok(button('Salvar versão').disabled, 'Colisão QR/assinatura bloqueia salvamento.');
  assert.match(document.querySelector('[role="alert"]').textContent, /Afaste os elementos/);
  await click(button('Restaurar posição de QR Code'));
  assert.equal(input('Horizontal').value, '172');
  assert.equal(input('Vertical').value, '210.5');
  await click(button('Prévia A4'));
  assert.equal(input('Horizontal').value, '172', 'Prévia isolada mantém os controles de posição.');
  console.log('PASS: editor real — pointer, zoom, teclado, cancelamento, inputs, salvar e colisões.');
} finally {
  await React.act(async () => root.unmount());
  dom.window.close();
  rmSync(bundlePath, { force: true });
}
