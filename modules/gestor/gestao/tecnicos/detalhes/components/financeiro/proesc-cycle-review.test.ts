import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceiroCicloManualStatus from './FinanceiroCicloManualStatus';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';
import {
  requireEligibleProescCycleReview,
  requireProescCycleReview,
} from './proesc-cycle-review.parser';

const result = () => ({
  classification: 'C1', eligible: true,
  observedAt: '2026-09-13T18:00:00Z', validUntil: '2026-09-13T18:05:00Z',
  reason: 'Somente o primeiro ciclo foi identificado no Proesc.',
  source: 'API_SCHEDULE_REVIEW',
});

test('prévia só aceita conferência vigente de C1 elegível enviada pelo servidor', () => {
  const review = requireProescCycleReview(result());
  assert.equal(requireEligibleProescCycleReview(review, Date.parse('2026-09-13T18:04:59Z')), review);
  assert.throws(() => requireEligibleProescCycleReview(review, Date.parse('2026-09-13T18:05:00Z')), /expirou/);
});

test('FULL e UNKNOWN permanecem sem geração, preservando a razão do servidor', () => {
  for (const classification of ['FULL', 'UNKNOWN']) {
    const review = requireProescCycleReview({ ...result(), classification, eligible: false, validUntil: null });
    assert.throws(() => requireEligibleProescCycleReview(review), /Somente o primeiro ciclo/);
    assert.throws(() => requireProescCycleReview({ ...result(), classification }), /conferência válida/);
  }
});

test('resposta ausente, sem origem comprovada ou com validade excessiva falha fechada', () => {
  for (const invalid of [null, {},
    { ...result(), source: 'INFERIDO_CLIENTE' },
    { ...result(), eligible: 'true' },
    { ...result(), observedAt: null },
    { ...result(), validUntil: null },
    { ...result(), validUntil: '2026-09-13T18:05:01Z' },
    { ...result(), validUntil: '2026-09-13T18:00:00Z' },
  ]) assert.throws(() => requireProescCycleReview(invalid), /conferência válida/);
});

test('bloqueio de importação oferece somente conferir; geração só aparece após elegibilidade canônica', () => {
  const blocked = {
    habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 1, cicloMaximo: 2,
    proximoCicloNumero: 2, primeiroVencimentoSugerido: null, criterioElegibilidade: 'HISTORICO_EXTERNO',
    estado: 'BLOQUEADO', podeGerar: false,
    bloqueio: { codigo: 'PROESC_REVIEW_REQUIRED', mensagem: 'Confira os ciclos no Proesc.' },
    politica: { revisao: 1, fingerprint: 'synthetic' }, cicloGerado: null,
    conferenciaProesc: { necessaria: true },
  };
  for (const eligible of [false, true]) {
    const state = requireMatriculaTecnicaCicloManual(eligible
      ? { ...blocked, estado: 'ELEGIVEL', podeGerar: true, bloqueio: null } : blocked);
    const html = renderToStaticMarkup(createElement(FinanceiroCicloManualStatus, {
      cicloManual: state, disabled: false,
      onGenerate: () => assert.fail('Não pode gerar ao renderizar'),
      onResume: () => assert.fail('Não pode retomar ao renderizar'),
      onReviewProesc: () => assert.fail('Não pode consultar ao renderizar'),
    }));
    assert.match(html, /Conferir ciclos Proesc/);
    if (eligible) assert.match(html, /Gerar e emitir 2º ciclo/);
    else assert.doesNotMatch(html, /Gerar e emitir/);
  }
  assert.throws(() => requireMatriculaTecnicaCicloManual({
    ...blocked, conferenciaProesc: { necessaria: false },
  }), /estado manual de ciclo incompleto/);
});
