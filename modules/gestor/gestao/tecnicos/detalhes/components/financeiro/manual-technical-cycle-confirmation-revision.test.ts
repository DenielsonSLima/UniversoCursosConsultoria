import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualPreviewItem,
  CicloFinanceiroTecnicoManualRevisao,
  CicloManualModoMatricula,
} from './matricula-tecnica-ciclo-manual.types';
import {
  revisionFromPreview,
  startCicloManualIssuance,
} from './manual-technical-cycle-confirmation';

const item = (
  chave: string,
  tipo: CicloFinanceiroTecnicoManualPreviewItem['tipo'],
  numero: number,
  vencimento: string,
): CicloFinanceiroTecnicoManualPreviewItem => ({
  chave,
  tipo,
  numero,
  descricao: tipo === 'MATRICULA' ? 'Matrícula' : `Mensalidade ${numero}`,
  valor: tipo === 'MATRICULA' ? '100.00' : '279.90',
  vencimento,
  destinoCobranca: 'BANESE',
  detalhesBoleto: {
    valorNominal: tipo === 'MATRICULA' ? '100.00' : '279.90',
    valorEmDia: tipo === 'MATRICULA' ? '100.00' : '269.90',
    desconto: tipo === 'MATRICULA' ? null : { valor: '10.00', validoAte: vencimento },
    multa: { percentual: '2.00', valor: '5.60', iniciaEm: vencimento },
    juros: { percentualMes: '1.00', valorDia: '0.09', iniciaEm: vencimento },
    instrucaoBoleto: 'Termos canônicos',
    mensagensBoleto: ['Termos canônicos'],
  },
});

const preview = (modoMatricula: CicloManualModoMatricula): CicloFinanceiroTecnicoManualPreview => {
  const enrollment = item('matricula', 'MATRICULA', 0, '2026-09-05');
  if (modoMatricula === 'REGISTRO_SEM_BOLETO') enrollment.destinoCobranca = 'LOCAL';
  const installments = [
    item('parcela-1', 'PARCELA', 1, '2026-10-05'),
    item('parcela-2', 'PARCELA', 2, '2026-11-05'),
  ];
  const omitted = modoMatricula === 'OMITIR';
  return {
    modoMatricula,
    cicloNumero: 1,
    sourceVencimento: 'INDIVIDUAL',
    dataOrigem: '2026-09-05',
    primeiroVencimento: omitted ? '2026-10-05' : '2026-09-05',
    quantidadeItens: omitted ? 2 : 3,
    quantidadeBancaria: modoMatricula === 'BOLETO' ? 3 : 2,
    quantidadeLocal: modoMatricula === 'REGISTRO_SEM_BOLETO' ? 1 : 0,
    matriculaSemBoleto: omitted ? enrollment : null,
    total: omitted ? '559.80' : '659.80',
    itens: omitted ? installments : [enrollment, ...installments],
    termos: {
      descontoPontualidade: '10.00',
      jurosAtrasoPercentual: '1.00',
      multaAtrasoPercentual: '2.00',
      instrucaoBoleto: 'Termos canônicos',
      aplicacao: {
        matricula: { desconto: false, multaJuros: true },
        mensalidade: { desconto: true, multaJuros: true },
        rematricula: { desconto: false, multaJuros: true },
      },
    },
    regraEfetivaFingerprint: 'regra-v1',
    politicaFingerprint: 'politica-v1',
    cronogramaFingerprint: `cronograma-${modoMatricula}`,
  };
};

test('handler real confirma os três modos sem edição com itens canônicos', async () => {
  for (const mode of ['BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR'] as const) {
    const currentPreview = preview(mode);
    const started = { current: false };
    const snapshots: CicloFinanceiroTecnicoManualPreview[] = [];
    let calls = 0;
    let revision: CicloFinanceiroTecnicoManualRevisao | null = null;
    const result = startCicloManualIssuance({
      canSettleEnrollment: true,
      externalHistory: false,
      externalHistoryConfirmed: false,
      firstDueDate: currentPreview.primeiroVencimento,
      issuanceStarted: started,
      onConfirm: async (_preview, _date, confirmed) => {
        calls += 1;
        revision = confirmed;
      },
      openSettlement: mode === 'REGISTRO_SEM_BOLETO',
      positiveAmounts: true,
      preview: currentPreview,
      previewReady: true,
      setIssuanceSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    assert.ok(result);
    await result;
    assert.equal(calls, 1);
    assert.equal(started.current, false);
    assert.deepEqual(snapshots, [currentPreview]);
    assert.equal(revision?.modoMatricula, mode);
    assert.equal(revision?.emitirMatricula, mode === 'BOLETO');
    assert.deepEqual(
      new Set(revision?.itens.map(({ chave }) => chave)),
      new Set(['matricula', 'parcela-1', 'parcela-2']),
    );
  }
});

test('handler envia a prévia recalculada e isola a revisão de mutações posteriores', async () => {
  const afterRecalculation = preview('REGISTRO_SEM_BOLETO');
  const recalculated = afterRecalculation.itens.find(({ chave }) => chave === 'parcela-1')!;
  recalculated.valor = '289.90';
  recalculated.vencimento = '2026-12-31';
  recalculated.detalhesBoleto.desconto = { valor: '15.00', validoAte: '2026-12-31' };
  let revision: CicloFinanceiroTecnicoManualRevisao | null = null;
  const result = startCicloManualIssuance({
    canSettleEnrollment: false,
    externalHistory: false,
    externalHistoryConfirmed: false,
    firstDueDate: '2026-09-05',
    issuanceStarted: { current: false },
    onConfirm: async (_preview, _date, confirmed) => { revision = confirmed; },
    openSettlement: false,
    positiveAmounts: true,
    preview: afterRecalculation,
    previewReady: true,
    setIssuanceSnapshot: () => undefined,
  });
  afterRecalculation.itens[1].valor = '999.00';
  afterRecalculation.itens[1].detalhesBoleto.desconto!.valor = '99.00';

  assert.ok(result);
  await result;
  assert.deepEqual(revision?.itens[1], {
    chave: 'parcela-1',
    valor: '289.90',
    vencimento: '2026-12-31',
    descontoPontualidade: '15.00',
    jurosAtrasoPercentual: '1.00',
    multaAtrasoPercentual: '2.00',
  });
});

test('mock bancário fica pendente e o guard aceita somente um clique', async () => {
  let releaseBank!: () => void;
  const bank = new Promise<void>((resolve) => { releaseBank = resolve; });
  const started = { current: false };
  let calls = 0;
  let pending = false;
  const dependencies = {
    canSettleEnrollment: false,
    externalHistory: false,
    externalHistoryConfirmed: false,
    firstDueDate: '2026-09-05',
    issuanceStarted: started,
    onConfirm: () => {
      calls += 1;
      pending = true;
      return bank.finally(() => { pending = false; });
    },
    openSettlement: false,
    positiveAmounts: true,
    preview: preview('BOLETO'),
    previewReady: true,
    setIssuanceSnapshot: () => undefined,
  };

  const firstClick = startCicloManualIssuance(dependencies);
  const duplicateClick = startCicloManualIssuance(dependencies);
  assert.ok(firstClick);
  assert.equal(duplicateClick, null);
  assert.equal(calls, 1);
  assert.equal(pending, true);
  assert.equal(started.current, true);

  releaseBank();
  await firstClick;
  assert.equal(pending, false);
  assert.equal(started.current, false);
});

test('guards recusam prévia suja/inválida e histórico sem confirmação', () => {
  let calls = 0;
  const base = {
    canSettleEnrollment: false,
    externalHistory: false,
    externalHistoryConfirmed: false,
    firstDueDate: '2026-09-05',
    issuanceStarted: { current: false },
    onConfirm: async () => { calls += 1; },
    openSettlement: false,
    positiveAmounts: true,
    preview: preview('BOLETO'),
    previewReady: true,
    setIssuanceSnapshot: () => undefined,
  };
  assert.equal(startCicloManualIssuance({ ...base, previewReady: false }), null);
  assert.equal(startCicloManualIssuance({ ...base, positiveAmounts: false }), null);
  assert.equal(startCicloManualIssuance({
    ...base, externalHistory: true, externalHistoryConfirmed: false,
  }), null);
  assert.equal(calls, 0);
});

test('falha síncrona ou assíncrona libera a trava para nova tentativa', async () => {
  for (const failure of ['sync', 'async'] as const) {
    const started = { current: false };
    const pending = startCicloManualIssuance({
      canSettleEnrollment: false,
      externalHistory: false,
      externalHistoryConfirmed: false,
      firstDueDate: '2026-09-05',
      issuanceStarted: started,
      onConfirm: () => {
        if (failure === 'sync') throw new Error('Falha simulada');
        return Promise.reject(new Error('Falha simulada'));
      },
      openSettlement: false,
      positiveAmounts: true,
      preview: preview('REGISTRO_SEM_BOLETO'),
      previewReady: true,
      setIssuanceSnapshot: () => undefined,
    });
    assert.ok(pending);
    await assert.rejects(pending, /Falha simulada/);
    assert.equal(started.current, false);
  }
});

test('diálogo usa o handler integrado sem mutar a revisão da query', () => {
  const source = readFileSync(
    new URL('./FinanceiroCicloManualDialog.tsx', import.meta.url),
    'utf8',
  );
  const startIssuance = source.slice(
    source.indexOf('const startIssuance ='),
    source.indexOf('\n\n  const dialog ='),
  );
  assert.match(source, /import \{\s*startCicloManualIssuance,/);
  assert.match(startIssuance, /startCicloManualIssuance\(\{/);
  for (const dependency of [
    'issuanceStarted: issuanceStartedRef', 'onConfirm', 'preview', 'previewReady',
    'setIssuanceSnapshot',
  ]) assert.match(startIssuance, new RegExp(dependency));
  assert.doesNotMatch(startIssuance, /seedPreview|revisionState\.apply|revisionState\.revision\s*=/);
  assert.equal(revisionFromPreview(preview('OMITIR')).itens.length, 3);
});
