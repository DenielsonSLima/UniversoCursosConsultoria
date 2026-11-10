import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const studentId = '00000000-0000-4000-8000-000000000006';
const activityId = '00000000-0000-4000-8000-000000000101';
const credit = {
  schemaVersion: 1,
  activities: [{ id: activityId, titulo: 'Atividade <script> sintética', cargaHoraria: 4, dataSource: '2026-08-19' }],
  eligibleActivityIdsByStudent: { [studentId]: [activityId] },
};
const compile = async (contents, stubs) => {
  const result = await build({
    stdin: { contents, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
    bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent',
    plugins: [{ name: 'isolated-extra-class-contract', setup(builder) {
      for (const [filter, source] of stubs) {
        builder.onResolve({ filter }, ({ path }) => ({ path, namespace: 'extra-fixture' }));
        builder.onLoad({ filter, namespace: 'extra-fixture' }, () => ({ contents: source, loader: 'js' }));
      }
    } }],
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  return module.exports;
};

test('cliente pede evidência canônica por turma/disciplina e rejeita payload inválido', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  globalThis.__extraClientRpc = (name, args) => {
    calls.push({ name, args });
    return { abortSignal: (receivedSignal) => {
      assert.equal(receivedSignal, signal);
      return Promise.resolve({ data: credit, error: null });
    } };
  };
  const api = await compile(`export { getDiarioExtraClasseCredito } from './diario-extra-classe.service';`, [
    [/\/lib\/supabase$/, 'export const supabase={rpc:(...args)=>globalThis.__extraClientRpc(...args)};'],
  ]);
  assert.deepEqual(await api.getDiarioExtraClasseCredito('turma-sintetica', 'disciplina-sintetica', signal), credit);
  assert.deepEqual(calls, [{ name: 'get_diario_extra_classe_credito', args: {
    p_turma_id: 'turma-sintetica', p_disciplina_id: 'disciplina-sintetica',
  } }]);
  globalThis.__extraClientRpc = async () => ({ data: { ...credit, schemaVersion: 2 }, error: null });
  await assert.rejects(api.getDiarioExtraClasseCredito('turma', 'disciplina'), /versão desconhecida/u);
  globalThis.__extraClientRpc = async () => ({ data: null, error: new Error('Acesso negado') });
  await assert.rejects(api.getDiarioExtraClasseCredito('turma', 'disciplina'), /Acesso negado/u);
  delete globalThis.__extraClientRpc;
});

test('conteúdo extra tem data/carga legíveis e preserva conteúdo HTML como texto', async () => {
  const ui = await compile(`import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import Conteudo from './DiarioExtraClasseConteudo';
    export const render=(credit)=>renderToStaticMarkup(<table><tbody><Conteudo activity={credit.activities[0]} originLabel="Extra-classe — complemento da aula 1 (19/08)"/></tbody></table>);`, []);
  const html = ui.render(credit);
  assert.match(html, /complemento da aula 1/u);
  assert.match(html, /19\/08/u);
  assert.match(html, /4H/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script>|<input|<button/u);
});

test('diário intercala complementos pela cronologia do banco e preserva histórico documental', async () => {
  const ui = await compile(`import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import Conteudo from './DiarioConteudoTab';
    export const render=(credit)=>renderToStaticMarkup(<Conteudo aulas={[
      {id:'primeira',titulo:'Primeira aula',dataLabel:'18/08',dataAula:'2026-08-18',cargaHoraria:4,sessoes:[]},
      {id:'segunda',titulo:'Segunda aula',dataLabel:'20/08',dataAula:'2026-08-20',cargaHoraria:4,sessoes:[]}
    ]} extraClassCredit={credit} localTitulos={{}} localPraticas={{}}/>);`, [
    [/\/historico\/DiarioDocumentaryContext$/, 'export const useDiarioDocumentary=()=>globalThis.__extraDocumentary || null;'],
  ]);
  const linked = { ...credit, activities: [{ ...credit.activities[0], aulaOrigemId: 'primeira' }], contentOrder: [
    { tipo: 'AULA', id: 'primeira' }, { tipo: 'EXTRA_CLASSE', id: activityId }, { tipo: 'AULA', id: 'segunda' },
  ] };
  const html = ui.render(linked);
  assert.ok(html.indexOf('Primeira aula') < html.indexOf('Atividade &lt;script&gt; sintética'));
  assert.ok(html.indexOf('Atividade &lt;script&gt; sintética') < html.indexOf('Segunda aula'));
  assert.match(html, /complemento da aula 1 \(18\/08\)/u);
  globalThis.__extraDocumentary = { students: {} };
  assert.doesNotMatch(ui.render(linked), /Atividade &lt;script&gt;/u);
  delete globalThis.__extraDocumentary;
});

test('evento extra atualiza somente crédito, resultados e fechamento da disciplina aberta', async () => {
  const handlers = [];
  const invalidated = [];
  const refreshed = [];
  globalThis.__extraUseEffect = (effect) => { globalThis.__extraCleanup = effect(); };
  globalThis.__extraQueryClient = {
    invalidateQueries: (options) => invalidated.push(options.queryKey),
    refetchQueries: (options) => refreshed.push(options.queryKey),
  };
  const channel = {
    on: (_kind, filter, callback) => { handlers.push({ filter, callback }); return channel; },
    subscribe: () => channel,
  };
  globalThis.__extraRealtime = { channel: () => channel, removeChannel: () => {} };
  const hooks = await compile(`export { useDiarioRealtime } from './hooks/useDiarioRealtime';`, [
    [/^react$/, 'export const useEffect=(effect)=>globalThis.__extraUseEffect(effect);'],
    [/^@tanstack\/react-query$/, 'export const useQueryClient=()=>globalThis.__extraQueryClient;'],
    [/\/lib\/supabase$/, 'export const supabase=globalThis.__extraRealtime;'],
  ]);
  hooks.useDiarioRealtime('turma-sintetica', 'disciplina-sintetica');
  const activity = handlers.find((handler) => handler.filter.table === 'atividades_extra_classe');
  assert.ok(activity);
  assert.equal(activity.filter.filter, 'turma_id=eq.turma-sintetica');
  activity.callback({ new: { disciplina_id: 'outra-disciplina' }, old: {} });
  assert.deepEqual(invalidated, []);
  activity.callback({ new: { disciplina_id: 'disciplina-sintetica' }, old: {} });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(invalidated, [
    ['diario-extra-classe-credito', 'turma-sintetica', 'disciplina-sintetica'],
    ['diario-notas-resultados', 'turma-sintetica', 'disciplina-sintetica'],
    ['diario-fechamento', 'turma-sintetica', 'disciplina-sintetica'],
  ]);
  assert.deepEqual(refreshed, invalidated);
  globalThis.__extraCleanup();
  for (const key of ['__extraUseEffect', '__extraQueryClient', '__extraRealtime', '__extraCleanup']) delete globalThis[key];
});
