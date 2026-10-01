import assert from 'node:assert/strict';
import { parseTrancamentoFinancialPreview } from './trancamento-financeiro.contract.ts';

declare const Deno: { test(name: string, run: () => void): void };

const preview = {
  policy: 'TRANCAMENTO_FUTURO_V1',
  cutoffDate: '2026-09-30',
  academicStatus: 'ATIVO',
  paidPreserved: 2,
  throughCutoffPreserved: 3,
  futureLocalSuspended: 1,
  futureProescPreserved: 2,
  futureBaneseToCancel: 9,
  futureBaneseReview: 0,
  baneseCancellation: {
    pending: 0,
    processing: 0,
    reviewRequired: 0,
    canceled: 0,
  },
  livePaymentsVerified: false,
  canceledExcludedFromOpenTotals: true,
};

Deno.test('prévia preserva corte e separa fila, revisão e cancelado confirmado', () => {
  assert.deepEqual(parseTrancamentoFinancialPreview(preview), preview);
});

Deno.test('prévia nunca declara consulta Banese ao vivo', () => {
  assert.throws(() => parseTrancamentoFinancialPreview({
    ...preview,
    livePaymentsVerified: true,
  }));
});

Deno.test('contagens negativas ou contrato sem exclusão de cancelados falham fechado', () => {
  assert.throws(() => parseTrancamentoFinancialPreview({
    ...preview,
    futureBaneseToCancel: -1,
  }));
  assert.throws(() => parseTrancamentoFinancialPreview({
    ...preview,
    canceledExcludedFromOpenTotals: false,
  }));
  for (const malformed of [null, '', false]) {
    assert.throws(() => parseTrancamentoFinancialPreview({
      ...preview,
      futureBaneseToCancel: malformed,
    }));
  }
  assert.throws(() => parseTrancamentoFinancialPreview({
    ...preview,
    cutoffDate: '2026-02-31',
  }));
});
