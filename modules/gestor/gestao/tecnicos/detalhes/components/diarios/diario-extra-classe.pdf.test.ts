import assert from 'node:assert/strict';
import { composeDiarioPdfWithManifest } from './diario-pdf.ts';
import { createSnapshot, loadAssets } from './diario-pdf-server-boundary.fixtures.ts';
import { createExtraClassSnapshot, createLinkedExtraClassSnapshot, EXTRA_IDS } from './diario-extra-classe.fixtures.ts';
import { extraClassContentRows } from './diario-extra-classe.presentation.ts';
import { DEFAULT_DIARIO_TEMPLATE } from '../../../../../cadastros/modelos-documentos/diarios/diarios-template-defaults.ts';

declare const Deno: { test: (name: string, fn: () => Promise<void>) => void };
const nativeStrings = (commands: string) => [...commands.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
  .map((match) => match[1].replace(/\\([\\()])/g, '$1'));
const pages = (pdf: Awaited<ReturnType<typeof composeDiarioPdfWithManifest>>['pdf']) => (
  pdf.internal as unknown as { pages: string[][] }
).pages.slice(1).map((page) => page.join('\n'));

Deno.test('PDF inclui conteúdo e carga extra sem adicionar coluna ou presença na chamada', async () => {
  const snapshot = createExtraClassSnapshot();
  const before = JSON.stringify(snapshot);
  const built = await composeDiarioPdfWithManifest(snapshot, await loadAssets());
  const sourcePages = pages(built.pdf);
  const frequency = sourcePages.find((page) => page.includes('(Frequência 1.1)'))!;
  const content = sourcePages.find((page) => page.includes('(Conteúdo 1)'))!;
  const results = sourcePages.find((page) => page.includes('(Resultados 1)'))!;
  assert.equal(nativeStrings(frequency).filter((value) => value === 'P').length, 2);
  assert.equal(nativeStrings(frequency).filter((value) => value === 'F').length, 2);
  assert.ok(content.includes('(Atividade domiciliar sintética)') ||
    nativeStrings(content).join(' ').includes('[Atividade extra-classe] Atividade domiciliar sintética'));
  assert.ok(nativeStrings(content).includes('8h'));
  assert.ok(nativeStrings(results).includes('75%'));
  assert.ok(nativeStrings(results).includes('50%'));
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(extraClassContentRows(snapshot.extraClassCredit)[0], [
    '19/08', '[Atividade extra-classe] Atividade domiciliar sintética', '', '8h',
  ]);
  assert.ok(!frequency.includes(EXTRA_IDS.activity));
});

Deno.test('extensão vazia mantém páginas de capa/contracapa e manifesto sem alterações', async () => {
  const legacy = createSnapshot();
  const assets = await loadAssets();
  const original = await composeDiarioPdfWithManifest(legacy, assets);
  const empty = globalThis.structuredClone(legacy);
  empty.extraClassCredit = {
    schemaVersion: 1, activities: [],
    eligibleActivityIdsByStudent: Object.fromEntries(empty.students.map((student) => [student.id, []])),
  };
  const built = await composeDiarioPdfWithManifest(empty, assets);
  assert.deepEqual(pages(built.pdf), pages(original.pdf));
  assert.deepEqual(built.manifest, original.manifest);
  const withExtra = await composeDiarioPdfWithManifest(createExtraClassSnapshot(), assets);
  assert.equal(withExtra.manifest.targetPageIndex, original.manifest.targetPageIndex);
});

Deno.test('PDF intercala complemento entre aulas pela ordem canônica e identifica sua origem', async () => {
  const snapshot = createLinkedExtraClassSnapshot();
  const built = await composeDiarioPdfWithManifest(snapshot, await loadAssets());
  const content = pages(built.pdf).map((page) => nativeStrings(page).join(' ')).find((page) => page.includes('CONTEÚDO PROGRAMÁTICO E PRÁTICA PEDAGÓGICA'))!;
  assert.ok(content.indexOf('Primeira aula sintética') < content.indexOf('Atividade domiciliar sintética'));
  assert.ok(content.indexOf('Atividade domiciliar sintética') < content.indexOf('Segunda aula sintética'));
  assert.match(content, /complemento da aula 1 \(19\/08\)/u);
  assert.equal(built.manifest.instructionsPageIndex, null);
  assert.equal(DEFAULT_DIARIO_TEMPLATE.imprimirInstrucoes, false);
  assert.ok(pages(built.pdf)[1].includes('(REGISTRO DE VALIDAÇÃO E ASSINATURA ELETRÔNICA)'));
  assert.ok(!pages(built.pdf).some((page) => page.includes('(INSTRUÇÕES DE PREENCHIMENTO)')));
});
