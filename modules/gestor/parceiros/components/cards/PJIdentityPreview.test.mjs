import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('./PJIdentityPreview.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  packages: 'external',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports,
);
const { PJIdentityPreview } = module.exports;
const render = (data) => renderToStaticMarkup(React.createElement(PJIdentityPreview, { data }));
const heading = (html) => html.match(/<h3\b[^>]*>(.*?)<\/h3>/s)?.[1];

const razaoSocial = 'EMPRESA DE COMUNICACOES LTDA';

test('fantasia é o título e razão social permanece visível sem abrir tooltip', () => {
  const html = render({ nome: razaoSocial, razaoSocial, nomeFantasia: '  MARCA TESTE  ' });
  assert.equal(heading(html), 'MARCA TESTE');
  assert.match(html, /<p\b[^>]*>EMPRESA DE COMUNICACOES LTDA<\/p>/);
  assert.doesNotMatch(html, /role="tooltip"/);
});

test('cadastro legado sem fantasia conserva razão social como título', () => {
  const html = render({ nome: razaoSocial });
  assert.equal(heading(html), razaoSocial);
  assert.doesNotMatch(html, /<p\b/);
});

test('fantasia com espaços é tratada como ausente', () => {
  const html = render({ nome: razaoSocial, nomeFantasia: '   ' });
  assert.equal(heading(html), razaoSocial);
  assert.doesNotMatch(html, /<p\b/);
});

test('nomes iguais não repetem razão social em linha secundária', () => {
  const html = render({ nome: 'MARCA TESTE', nomeFantasia: '  Marca Teste  ' });
  assert.equal(heading(html), 'Marca Teste');
  assert.doesNotMatch(html, /<p\b/);
  assert.equal((html.match(/Marca Teste/g) || []).length, 1);
});
