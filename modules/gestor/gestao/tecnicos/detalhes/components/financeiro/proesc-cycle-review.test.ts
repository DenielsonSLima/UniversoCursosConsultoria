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

test('conferência automática não acrescenta botão; geração só aparece após elegibilidade canônica', () => {
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
    }));
    assert.doesNotMatch(html, /Conferir ciclos Proesc/);
    assert.equal((html.match(/<button\b/g) || []).length, eligible ? 1 : 0);
    if (eligible) assert.match(html, /Gerar e emitir 2º ciclo/);
    else assert.doesNotMatch(html, /Gerar e emitir/);
  }
  assert.throws(() => requireMatriculaTecnicaCicloManual({
    ...blocked, conferenciaProesc: { necessaria: false },
  }), /estado manual de ciclo incompleto/);
});

test('conferência automática bloqueia nova geração sem bloquear retomada de emissão existente', () => {
  const eligible = requireMatriculaTecnicaCicloManual({
    habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 1, cicloMaximo: 2,
    proximoCicloNumero: 2, primeiroVencimentoSugerido: null, criterioElegibilidade: 'HISTORICO_EXTERNO',
    estado: 'ELEGIVEL', podeGerar: true, bloqueio: null,
    politica: { revisao: 1, fingerprint: 'synthetic' }, cicloGerado: null,
    conferenciaProesc: { necessaria: true },
  });
  const generated = requireMatriculaTecnicaCicloManual({
    ...eligible, conferenciaProesc: undefined,
    estado: 'JA_GERADO', podeGerar: false, proximoCicloNumero: null,
    cicloGerado: {
      numero: 2, status: 'EMISSAO_PARCIAL', quantidadeItens: 13, total: '3458.80',
      emitidosBanese: 4, pendentesEmissao: 9, emRevisao: 0,
    },
  });
  const render = (state: typeof eligible, reviewingProesc: boolean, disabled = false) => (
    renderToStaticMarkup(createElement(FinanceiroCicloManualStatus, {
      cicloManual: state, disabled, reviewingProesc,
      onGenerate: () => assert.fail('Renderização não pode emitir'),
      onResume: () => assert.fail('Renderização não pode retomar'),
    }))
  );
  const generating = render(eligible, true);
  assert.match(generating, /Gerar e emitir 2º ciclo/);
  assert.match(generating.match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled=""/);
  assert.doesNotMatch(render(eligible, false).match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled=/);

  const recovering = render(generated, true);
  assert.match(recovering, /Retomar emissão/);
  assert.doesNotMatch(recovering, /Gerar e emitir/);
  assert.doesNotMatch(recovering.match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled=/,
    'A consulta Proesc de outros alunos não bloqueia títulos já gerados');
  assert.match(render(generated, true, true).match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled=""/,
    'Uma operação de emissão em andamento continua protegendo contra acionamento repetido');
});
