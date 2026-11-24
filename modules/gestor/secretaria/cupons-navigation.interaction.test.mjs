import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('Secretaria ordena cada coluna e preserva a navegação e as permissões', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/cupons-navigation-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  let root;
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  try {
    const outfile = resolve(temp, 'navigation.mjs');
    await build({ entryPoints: [resolve(base, 'modules/gestor/secretaria/components/SecretariaDashboard.tsx')],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { default: Dashboard } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const navigation = [];
    const render = async props => act(async () => root.render(React.createElement(Dashboard, {
      onNavigate: id => navigation.push(id), ...props,
    })));
    const couponButton = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Cupons EAD'));
    const sectionTitles = id => [...document.querySelectorAll('section[aria-labelledby="secretaria-section-' + id + '"] h4')]
      .map(title => title.textContent);
    await render({ showEadCoupons: true });
    assert.deepEqual(sectionTitles('atendimento'), [
      'Busca de Aluno 360º', 'Carnês dos Alunos', 'Cupons EAD', 'Declaração de IRPF',
      'Dependências Acadêmicas', 'Recebimentos', 'Solicitações Acadêmicas', 'Transferência',
    ]);
    assert.deepEqual(sectionTitles('documentos'), [
      'Atestado de Conclusão', 'Boletim Escolar', 'Certificados', 'Contratos de Aluno',
      'Declaração de Frequência', 'Declaração de Matrícula', 'Ficha de Matrícula', 'Histórico Escolar',
    ]);
    assert.deepEqual(sectionTitles('identificacao'), [
      'Assinaturas', 'Carteirinha Estudantil', 'Crachá de Estágio', 'Crachá de Preceptor',
      'Histórico de Emissões', 'Pasta de Identificação', 'SES', 'Termo de Estágio',
    ]);
    await render({});
    assert.equal(couponButton(), undefined, 'a rota nova fica escondida por padrão');
    assert(document.body.textContent.includes('Carnês dos Alunos'));
    await render({ showEadCoupons: true, allowedTabs: ['cupons-ead', 'alunos'] });
    assert(couponButton());
    await act(async () => couponButton().click());
    assert.deepEqual(navigation, ['cupons-ead']);
    await render({ showEadCoupons: false, allowedTabs: ['cupons-ead', 'alunos'] });
    assert.equal(couponButton(), undefined);
    await render({ showEadCoupons: true, allowedTabs: ['alunos'] });
    assert.equal(couponButton(), undefined, 'lista de operações continua respeitada');
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});
