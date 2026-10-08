import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Run: node --test supabase/tests/t46-canonical-cycle-reset-ui.test.mjs
// An older local checkout may validate fetched, unmodified main sources with
// T46_UI_SOURCE_DIR=/absolute/path/to/the/financeiro/directory. No API is called.
// T46_UI_STATES_FILE optionally validates captured, anonymized RPC cycle states.
const root = resolve(import.meta.dirname, '../..');
const sourceDirectory = process.env.T46_UI_SOURCE_DIR || resolve(root,
  'modules/gestor/gestao/tecnicos/detalhes/components/financeiro');
mkdirSync(join(root, 'tmp'), { recursive: true });
const temporaryDirectory = mkdtempSync(join(root, 'tmp/t46-reset-ui-test-'));
after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
const bundlePath = join(temporaryDirectory, 'actual-components.mjs');
buildSync({
  stdin: {
    contents: `
      export { default as Status, getFinanceiroSituationLabel } from './FinanceiroCicloManualStatus';
      export { requireMatriculaTecnicaCicloManual as parse } from './matricula-tecnica-ciclo-manual.parser';
    `,
    resolveDir: sourceDirectory,
    sourcefile: 't46-reset-ui-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
  outfile: bundlePath, logLevel: 'silent',
});
const { Status, getFinanceiroSituationLabel, parse } = await import(pathToFileURL(bundlePath).href);

const cleanCycle = () => ({
  habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 0, cicloMaximo: 2,
  proximoCicloNumero: 1, primeiroVencimentoSugerido: null,
  criterioElegibilidade: 'MANUAL_APOS_EMISSAO', estado: 'ELEGIVEL', podeGerar: true,
  bloqueio: null, politica: { revisao: 1, fingerprint: 'a'.repeat(64) },
  cicloGerado: null, matriculaLocal: null, correcaoEmissao: null,
});
const syntheticCorrection = {
  operationId: '11111111-1111-4111-8111-111111111111',
  matriculaId: '22222222-2222-4222-8222-222222222222',
  status: 'WAITING_CONSENT', fingerprint: 'b'.repeat(64), firstDueDate: '2030-01-15',
  installmentCount: 12, activeTotal: '3358.80', historicalCycle2Count: 13,
  localFeeDisposition: 'PRESERVED_PAID',
};
const render = (cycle, statusAcademico = 'ATIVO') => renderToStaticMarkup(
  createElement(Status, {
    cicloManual: parse(cycle), statusAcademico, disabled: false,
    onGenerate: () => assert.fail('Renderização não pode emitir boletos.'),
    onResume: () => assert.fail('Renderização não pode retomar boletos.'),
  }),
);

test('reset canônico volta ao botão C1 existente, sem aviso ou histórico especial', () => {
  for (const correctionMetadata of [{}, { correcaoEmissao: null }]) {
    const cycle = cleanCycle();
    delete cycle.correcaoEmissao;
    Object.assign(cycle, correctionMetadata);
    const parsed = parse(cycle);
    const markup = render(parsed);
    assert.match(markup, /Gerar e emitir 1º ciclo/);
    assert.match(markup, /1º ciclo elegível/);
    assert.equal((markup.match(/<button\b/g) || []).length, 1);
    assert.doesNotMatch(markup, /corrigid|correção|histórico|dispensada|Retomar emissão/);
    assert.doesNotMatch(markup.match(/<button\b[^>]*>/)?.[0] || '', /\bdisabled=/);
    assert.equal(getFinanceiroSituationLabel({ cicloManual: parsed }),
      'Elegível para gerar e emitir 1º ciclo');
  }
});

test('correção residual impede declarar um reset C1 concluído', () => {
  assert.throws(() => parse({ ...cleanCycle(), correcaoEmissao: syntheticCorrection }),
    /Correção financeira não pode liberar um novo ciclo/);
});

test('projeção limpa conserva bloqueios acadêmicos e não inicia emissão ao renderizar', () => {
  for (const academicStatus of ['TRANCADO', 'CANCELADO', 'TRANSFERIDO', 'CONCLUIDO']) {
    const markup = render(cleanCycle(), academicStatus);
    assert.doesNotMatch(markup, /Gerar e emitir|Revisar correção|Retomar emissão/);
    assert.match(markup, /situação acadêmica não permite emitir cobranças/);
  }
});

test('reset não transforma estado incoerente ou saldo C2 existente em C1 elegível', () => {
  for (const patch of [
    { podeGerar: false },
    { cicloBaseHistorico: 1 },
    { proximoCicloNumero: 2 },
    { cicloGerado: { numero: 2, status: 'EMITIDO_BANESE', quantidadeItens: 13,
      total: '3358.80', emitidosBanese: 13, pendentesEmissao: 0, emRevisao: 0 } },
  ]) assert.throws(() => parse({ ...cleanCycle(), ...patch }), /ciclo incoerente/);
});

if (process.env.T46_UI_STATES_FILE) {
  test('três projeções reais capturadas passam no parser e oferecem somente emissão padrão C1', () => {
    const states = JSON.parse(readFileSync(process.env.T46_UI_STATES_FILE, 'utf8'));
    assert.equal(states.length, 3);
    for (const state of states) {
      const parsed = parse(state);
      assert.equal(parsed.estado, 'ELEGIVEL');
      assert.equal(parsed.proximoCicloNumero, 1);
      assert.equal(parsed.cicloGerado, null);
      assert.equal(parsed.matriculaLocal, null);
      assert.ok(parsed.correcaoEmissao == null);
      const markup = render(parsed);
      assert.match(markup, /Gerar e emitir 1º ciclo/);
      assert.equal((markup.match(/<button\b/g) || []).length, 1);
      assert.doesNotMatch(markup, /corrigid|correção|histórico|dispensada|Retomar emissão/);
      assert.doesNotMatch(markup.match(/<button\b[^>]*>/)?.[0] || '', /\bdisabled=/);
    }
  });
}
