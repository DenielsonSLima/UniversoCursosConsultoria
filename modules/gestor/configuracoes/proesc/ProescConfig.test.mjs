import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

function loadComponent(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const exports = {};
  const require = (name) => {
    if (name === 'react') return React;
    if (name === 'lucide-react') return icons;
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'exports', 'React', outputText)(require, exports, React);
  return exports.default;
}

const toastModule = { __esModule: true, default: () => null,
  useToast: () => ({ toasts: [], removeToast: () => {}, toast: { success() {}, error() {} } }) };

test('painel renderiza uma conexão V2, preserva histórico e não oferece controles V1', async () => {
  const calls = [];
  const queryOptions = [];
  const Card = loadComponent('./ProescConnectionCard.tsx', {
    '@tanstack/react-query': { useQuery: (options) => {
      queryOptions.push(options);
      return { data: { configured: true, wafConfigured: true }, isError: false, isLoading: false };
    } },
    '../../components/ToastNotification': toastModule,
    './proesc.service': { proescKeys: { connection: (version) => ['connection', version] },
      proescService: { connectionStatus: async (version) => { calls.push(version); return {}; } } },
  });
  const Config = loadComponent('./ProescConfig.tsx', {
    '../../components/ToastNotification': toastModule,
    './ProescConnectionCard': { __esModule: true, default: Card },
    './ProescResults': { __esModule: true, default: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(Config));
  assert.equal(queryOptions.length, 1);
  await queryOptions[0].queryFn();
  assert.deepEqual(calls, ['v2']);
  assert.equal((html.match(/aria-label="Token Proesc V2"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Chave WAF Proesc V2"/g) || []).length, 1);
  assert.match(html, /Histórico por turma/);
  assert.match(html, /registros anteriores da V1/);
  assert.doesNotMatch(html, /Token Proesc V1|Conexão Proesc V1|Remover conexão V1|v1\.0\/reference/);
  assert.match(html, /Testar token/);
});
