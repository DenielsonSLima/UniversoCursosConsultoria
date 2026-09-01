import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  getCriterioElegibilidadeLabel,
  requireMatriculaTecnicaCicloManual,
} from './matricula-tecnica-ciclo-manual.parser';

const eligibleState = {
  habilitado: true,
  modo: 'MANUAL',
  cicloBaseHistorico: 1,
  cicloMaximo: 2,
  proximoCicloNumero: 2,
  criterioElegibilidade: 'PENULTIMA_SEM_ATRASO',
  estado: 'ELEGIVEL',
  podeGerar: true,
  bloqueio: null,
  politica: { revisao: 1, fingerprint: 'policy-fingerprint' },
  cicloGerado: null,
};

test('traduz os critérios canônicos de elegibilidade sem expor código técnico', () => {
  assert.equal(
    getCriterioElegibilidadeLabel('PENULTIMA_SEM_ATRASO'),
    'Penúltima parcela paga e nenhuma cobrança vencida',
  );
  assert.equal(
    getCriterioElegibilidadeLabel('QUITACAO_TOTAL'),
    'Ciclo anterior totalmente quitado',
  );
  assert.equal(getCriterioElegibilidadeLabel(null), null);
});

test('estado manual falha fechado para critério de elegibilidade desconhecido', () => {
  assert.doesNotThrow(() => requireMatriculaTecnicaCicloManual(eligibleState));
  assert.throws(
    () => requireMatriculaTecnicaCicloManual({
      ...eligibleState,
      criterioElegibilidade: 'CRITERIO_NAO_SUPORTADO',
    }),
    /estado manual de ciclo incompleto/i,
  );
});

test('prévia exige lista canônica completa sem recalcular valores no navegador', () => {
  const serviceSource = readFileSync(resolve(
    process.cwd(),
    'modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts',
  ), 'utf8');
  const start = serviceSource.indexOf('const requirePreview =');
  const end = serviceSource.indexOf('const requireGenerationResult =', start);
  assert.ok(start >= 0 && end > start);
  const previewParser = serviceSource.slice(start, end);

  assert.match(previewParser, /value\.quantidadeItens !== items\.length/);
  assert.match(previewParser, /typedItems\[0\]\?\.tipo === expectedLeadType/);
  assert.match(previewParser, /installments\.every\(\(item, index\) => item\.numero === index \+ 1\)/);
  assert.match(previewParser, /new Set\(keys\)\.size === keys\.length/);
  assert.match(previewParser, /typedItems\[0\]\?\.vencimento === value\.primeiroVencimento/);
  assert.match(previewParser, /isIsoCalendarDate\(value\.dataOrigem\)/);
  assert.match(previewParser, /const validTerms = isRecord\(terms\)/);
  assert.doesNotMatch(previewParser, /\.reduce\(|Number\(item\.valor\)|parseFloat\(item\.valor\)/);
});
