import { getMaceioIsoDate } from '../../../technicalClassDates';
import {
  isExternalTransferRate, isTransferDate,
  type ExternalTransferCredit, type ExternalTransferFinancialPlan,
  type ExternalTransferInput, type ExternalTransferPreview, type ExternalTransferConditions,
} from './external-transfer.contract';

export interface ExternalCreditDraft {
  selected: boolean;
  mediaFinal: string;
  frequenciaPercent: string;
  situacao: ExternalTransferCredit['situacao'];
}

export interface ExternalTransferDraft {
  studentId: string;
  institution: string;
  course: string;
  reason: string;
  notes: string;
  transferDate: string;
  credits: Record<string, ExternalCreditDraft>;
  cycle: 1 | 2;
  installments: string;
  firstDueDate: string;
  cycle2Reason: string;
  chargeMonthly: boolean;
  chargeDiscount: boolean;
  chargeFine: boolean;
  chargeInterest: boolean;
  conditions: ExternalTransferConditions | null;
}

export const createExternalTransferDraft = (studentId = '', today = getMaceioIsoDate()): ExternalTransferDraft => ({
  studentId, institution: '', course: '', reason: '', notes: '', transferDate: today,
  credits: {}, cycle: 1, installments: '', firstDueDate: '', cycle2Reason: '',
  chargeMonthly: true, chargeDiscount: false, chargeFine: false, chargeInterest: false, conditions: null,
});

export const applyExternalTransferDefaults = (draft: ExternalTransferDraft, context: ExternalTransferPreview): ExternalTransferDraft => ({
  ...draft, cycle: context.financeiro.cicloNumero,
  installments: String(context.financeiro.quantidadeParcelas),
  firstDueDate: context.financeiro.primeiroVencimento,
  cycle2Reason: context.financeiro.justificativaCiclo2 || '',
  chargeMonthly: context.financeiro.cobrarMensalidades,
  chargeDiscount: Number(context.financeiro.condicoes.descontoPontualidade) > 0,
  chargeFine: Number(context.financeiro.condicoes.multaAtrasoPercentual) > 0,
  chargeInterest: Number(context.financeiro.condicoes.jurosAtrasoPercentual) > 0,
  conditions: { ...context.financeiro.condicoes },
});

const amountValid = (value: string, maximum = 9999999.99) => /^\d+(?:\.\d{1,2})?$/.test(value)
  && Number.isFinite(Number(value)) && Number(value) <= maximum;

export const externalTransferFinancialError = (draft: ExternalTransferDraft, maximum: number, maximumCycles: 1 | 2 = 2): string | null => {
  if (draft.cycle > maximumCycles) return 'A turma de destino permite somente o 1º ciclo financeiro.';
  const quantity = Number(draft.installments);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximum) return `Informe uma quantidade inteira de parcelas entre 1 e ${maximum}.`;
  if (!isTransferDate(draft.firstDueDate)) return 'Informe o primeiro vencimento financeiro.';
  if (draft.cycle === 2 && (draft.cycle2Reason.trim().length < 10 || draft.cycle2Reason.trim().length > 1000)) return 'Justifique a continuidade no 2º ciclo com 10 a 1000 caracteres.';
  const terms = draft.conditions;
  if (!terms) return 'Consulte os padrões financeiros da turma.';
  if (![terms.valorMatricula, terms.valorMensalidade, terms.valorRematricula, terms.descontoPontualidade].every((value) => amountValid(value))) return 'Informe valores monetários válidos, com até duas casas decimais.';
  if (!isExternalTransferRate(terms.multaAtrasoPercentual) || !isExternalTransferRate(terms.jurosAtrasoPercentual)) return 'Multa e juros devem ser de 0% até menos de 100%, com até seis casas decimais.';
  if (draft.chargeMonthly && Number(terms.valorMensalidade) <= 0) return 'Informe o valor da mensalidade ou desative as mensalidades.';
  if (terms.cobrarMatricula && Number(terms.valorMatricula) <= 0) return 'Informe o valor da matrícula ou desative a taxa.';
  if (terms.cobrarRematricula && Number(terms.valorRematricula) <= 0) return 'Informe o valor da rematrícula ou desative a taxa.';
  return null;
};

export const externalTransferPlan = (
  draft: ExternalTransferDraft,
  maximum: number,
  maximumCycles: 1 | 2 = 2,
): ExternalTransferFinancialPlan | null => {
  if (externalTransferFinancialError(draft, maximum, maximumCycles) || !draft.conditions) return null;
  return {
    cicloNumero: draft.cycle,
    quantidadeParcelas: Number(draft.installments),
    primeiroVencimento: draft.firstDueDate,
    justificativaCiclo2: draft.cycle === 2 ? draft.cycle2Reason.trim() : null,
    cobrarMensalidades: draft.chargeMonthly,
    condicoes: {
      ...draft.conditions,
      descontoPontualidade: draft.chargeDiscount ? draft.conditions.descontoPontualidade : '0.00',
      multaAtrasoPercentual: draft.chargeFine ? draft.conditions.multaAtrasoPercentual : '0.00',
      jurosAtrasoPercentual: draft.chargeInterest ? draft.conditions.jurosAtrasoPercentual : '0.00',
    },
  };
};

export const sameExternalTransferPlan = (left: ExternalTransferFinancialPlan, right: ExternalTransferFinancialPlan) => (
  left.cicloNumero === right.cicloNumero && left.quantidadeParcelas === right.quantidadeParcelas
  && left.primeiroVencimento === right.primeiroVencimento && left.justificativaCiclo2 === right.justificativaCiclo2
  && left.cobrarMensalidades === right.cobrarMensalidades
  && Object.keys(left.condicoes).every((key) => {
    const field = key as keyof ExternalTransferConditions;
    const leftValue = left.condicoes[field];
    const rightValue = right.condicoes[field];
    return typeof leftValue === 'string' && typeof rightValue === 'string'
      ? Number(leftValue) === Number(rightValue) : leftValue === rightValue;
  })
);

export const externalTransferDraftError = (draft: ExternalTransferDraft, today = getMaceioIsoDate()): string | null => {
  if (!draft.studentId || !draft.institution.trim() || !draft.reason.trim()) {
    return 'Informe aluno, instituição de origem e motivo da transferência.';
  }
  if (!isTransferDate(draft.transferDate) || draft.transferDate > today) return 'Informe a data efetiva, sem data futura.';
  for (const credit of Object.values(draft.credits).filter((item) => item.selected)) {
    if (credit.mediaFinal !== '' && (!Number.isFinite(Number(credit.mediaFinal))
      || Number(credit.mediaFinal) < 0 || Number(credit.mediaFinal) > 10)) return 'A média deve ficar entre 0 e 10.';
    if (credit.frequenciaPercent !== '' && (!Number.isFinite(Number(credit.frequenciaPercent))
      || Number(credit.frequenciaPercent) < 0 || Number(credit.frequenciaPercent) > 100)) return 'A frequência deve ficar entre 0 e 100.';
  }
  return null;
};

export const buildExternalTransferInput = (
  draft: ExternalTransferDraft,
  turmaId: string,
  preview: ExternalTransferPreview,
  requestId: string,
): ExternalTransferInput => {
  const error = externalTransferDraftError(draft);
  const financeiro = externalTransferPlan(draft, preview.quantidadeMaxima, preview.maxCiclos);
  if (error || !financeiro) throw new Error(error || 'Confira o plano financeiro antes de receber.');
  if (!sameExternalTransferPlan(financeiro, preview.financeiro)) {
    throw new Error('O plano mudou. Refaça a conferência financeira.');
  }
  return {
    requestId, alunoId: draft.studentId, turmaDestinoId: turmaId,
    instituicaoOrigem: draft.institution.trim(), cursoOrigem: draft.course.trim() || null,
    motivo: draft.reason.trim(), observacao: draft.notes.trim() || null,
    dataTransferencia: draft.transferDate, financeiro: globalThis.structuredClone(preview.financeiro),
    expectedRegraFingerprint: preview.regraFingerprint,
    aproveitamentos: Object.entries(draft.credits).filter(([, item]) => item.selected)
      .map(([disciplinaId, item]) => ({
        disciplinaId, situacao: item.situacao,
        mediaFinal: item.mediaFinal === '' ? null : Number(item.mediaFinal),
        frequenciaPercent: item.frequenciaPercent === '' ? null : Number(item.frequenciaPercent),
      })),
  };
};
