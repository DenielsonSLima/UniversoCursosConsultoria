import assert from 'node:assert/strict';
import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualPreviewItem,
  CicloFinanceiroTecnicoManualRevisao,
  CicloManualModoMatricula,
} from '../../../modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts';
import { startCicloManualIssuance } from '../../../modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-confirmation.ts';
import type {
  ManualCycleContext,
  ManualCycleIssuanceRequest,
} from './contract.ts';
import {
  type ManualCycleIssuanceDependencies,
  runManualCycleIssuance,
} from './orchestrator.ts';
import { parseManualCycleRevision } from './revision.ts';

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

const previewFor = (mode: CicloManualModoMatricula): CicloFinanceiroTecnicoManualPreview => {
  const enrollment = item('ciclo-1-matricula', 'MATRICULA', 0, '2026-09-05');
  if (mode === 'REGISTRO_SEM_BOLETO') enrollment.destinoCobranca = 'LOCAL';
  const installments = Array.from({ length: 12 }, (_, index) => {
    const dueDate = new Date(Date.UTC(2026, 9 + index, 5)).toISOString().slice(0, 10);
    return item(`ciclo-1-parc-${index + 1}`, 'PARCELA', index + 1, dueDate);
  });
  const omitted = mode === 'OMITIR';
  return {
    modoMatricula: mode,
    cicloNumero: 1,
    sourceVencimento: 'INDIVIDUAL',
    dataOrigem: '2026-09-05',
    primeiroVencimento: omitted ? '2026-10-05' : '2026-09-05',
    quantidadeItens: omitted ? 12 : 13,
    quantidadeBancaria: mode === 'BOLETO' ? 13 : 12,
    quantidadeLocal: mode === 'REGISTRO_SEM_BOLETO' ? 1 : 0,
    matriculaSemBoleto: omitted ? enrollment : null,
    total: omitted ? '3358.80' : '3458.80',
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
    regraEfetivaFingerprint: 'a'.repeat(64),
    politicaFingerprint: 'b'.repeat(64),
    cronogramaFingerprint: 'c'.repeat(64),
  };
};

const requestId = '22222222-2222-4222-8222-222222222222';
const enrollmentId = '11111111-1111-4111-8111-111111111111';

const contextFor = (
  preview: CicloFinanceiroTecnicoManualPreview,
  issued: number,
): ManualCycleContext => {
  let bankIndex = 0;
  const receivables = preview.itens.map((entry, index) => {
    const local = entry.destinoCobranca === 'LOCAL';
    const emitted = !local && bankIndex++ < issued;
    return {
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      chave: entry.chave,
      tipo: entry.tipo,
      numero: entry.numero,
      descricao: entry.descricao,
      valor: entry.valor,
      vencimento: entry.vencimento,
      status: 'PENDENTE',
      emissaoBanese: local ? 'NAO_APLICAVEL' : emitted ? 'EMITIDO' : 'PENDENTE',
      destinoCobranca: local ? 'LOCAL' as const : 'BANESE' as const,
      ...(local ? { localSemBoletoComprovado: true } : {}),
    };
  });
  const bankCount = preview.quantidadeBancaria ?? preview.quantidadeItens;
  const localCount = preview.quantidadeLocal ?? 0;
  return {
    requestId,
    replayed: false,
    matriculaId: enrollmentId,
    turmaId: '44444444-4444-4444-8444-444444444444',
    poloId: '55555555-5555-4555-8555-555555555555',
    ciclo: {
      numero: 1,
      cicloNumero: 1,
      status: issued === bankCount ? 'EMITIDO_BANESE' : 'EMISSAO_PARCIAL',
      quantidadeItens: preview.quantidadeItens,
      quantidadeBancaria: bankCount,
      quantidadeLocal: localCount,
      total: preview.total,
      emitidosBanese: issued,
      pendentesEmissao: bankCount - issued,
      emRevisao: 0,
      recebiveis: receivables,
    },
    cicloManual: { cicloGerado: { numero: 1 } },
  };
};

const runFakeBank = async (
  preview: CicloFinanceiroTecnicoManualPreview,
  revision: CicloFinanceiroTecnicoManualRevisao,
) => {
  const parsed = parseManualCycleRevision(revision);
  assert.ok(parsed);
  const request: ManualCycleIssuanceRequest = {
    action: 'generate',
    matriculaId: enrollmentId,
    cicloNumero: 1,
    primeiroVencimento: preview.primeiroVencimento,
    requestId,
    expectedRegraFingerprint: preview.regraEfetivaFingerprint,
    expectedPoliticaFingerprint: preview.politicaFingerprint,
    expectedCronogramaFingerprint: preview.cronogramaFingerprint,
    revisao: parsed,
  };
  let issued = 0;
  let issueCalls = 0;
  const load = () => Promise.resolve(contextFor(preview, issued));
  const dependencies: ManualCycleIssuanceDependencies = {
    preflight: () => Promise.resolve(),
    prepare: load,
    resume: load,
    reload: load,
    issueReceivable: () => {
      issueCalls += 1;
      issued += 1;
      return Promise.resolve();
    },
  };
  const result = await runManualCycleIssuance(request, dependencies);
  return { issueCalls, parsed, result };
};

for (const mode of ['BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR'] as const) {
  Deno.test(`clique final ${mode} atravessa parser e orquestrador com banco falso`, async () => {
    const preview = previewFor(mode);
    const started = { current: false };
    let confirmationCalls = 0;
    const resultHolder: {
      current: Awaited<ReturnType<typeof runFakeBank>> | null;
    } = { current: null };
    const pending = startCicloManualIssuance({
      canSettleEnrollment: false,
      externalHistory: false,
      externalHistoryConfirmed: false,
      firstDueDate: preview.primeiroVencimento,
      issuanceStarted: started,
      onConfirm: async (confirmedPreview, _date, revision) => {
        confirmationCalls += 1;
        resultHolder.current = await runFakeBank(confirmedPreview, revision);
      },
      openSettlement: false,
      positiveAmounts: true,
      preview,
      previewReady: true,
      setIssuanceSnapshot: () => undefined,
    });

    assert.ok(pending);
    await pending;
    assert.equal(confirmationCalls, 1);
    assert.equal(started.current, false);
    const bankResult = resultHolder.current;
    assert.ok(bankResult);
    assert.equal(bankResult.parsed.itens.length, 13);
    assert.equal(bankResult.result.ciclo.status, 'EMITIDO_BANESE');
    assert.equal(bankResult.issueCalls, mode === 'BOLETO' ? 13 : 12);
  });
}
