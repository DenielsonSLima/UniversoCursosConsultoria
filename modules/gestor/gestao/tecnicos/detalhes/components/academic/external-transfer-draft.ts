import { getMaceioIsoDate } from '../../../technicalClassDates';
import {
  isTransferDate,
  type ExternalTransferCredit, type ExternalTransferFinancialPlan,
  type ExternalTransferInput, type ExternalTransferPreview,
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
}

export const createExternalTransferDraft = (studentId = '', today = getMaceioIsoDate()): ExternalTransferDraft => ({
  studentId, institution: '', course: '', reason: '', notes: '', transferDate: today,
  credits: {}, cycle: 1, installments: '', firstDueDate: '', cycle2Reason: '',
});

export const externalTransferPlan = (
  draft: ExternalTransferDraft,
  maximum: number,
): ExternalTransferFinancialPlan | null => {
  const quantity = Number(draft.installments);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximum
    || !isTransferDate(draft.firstDueDate)
    || (draft.cycle === 2 && (draft.cycle2Reason.trim().length < 10 || draft.cycle2Reason.trim().length > 1000))) return null;
  return {
    cicloNumero: draft.cycle,
    quantidadeParcelas: quantity,
    primeiroVencimento: draft.firstDueDate,
    justificativaCiclo2: draft.cycle === 2 ? draft.cycle2Reason.trim() : null,
  };
};

export const sameExternalTransferPlan = (left: ExternalTransferFinancialPlan, right: ExternalTransferFinancialPlan) => (
  left.cicloNumero === right.cicloNumero && left.quantidadeParcelas === right.quantidadeParcelas
  && left.primeiroVencimento === right.primeiroVencimento && left.justificativaCiclo2 === right.justificativaCiclo2
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
  const financeiro = externalTransferPlan(draft, preview.quantidadeMaxima);
  if (error || !financeiro) throw new Error(error || 'Confira o plano financeiro antes de receber.');
  if (!sameExternalTransferPlan(financeiro, preview.financeiro)) {
    throw new Error('O plano mudou. Refaça a conferência financeira.');
  }
  return {
    requestId, alunoId: draft.studentId, turmaDestinoId: turmaId,
    instituicaoOrigem: draft.institution.trim(), cursoOrigem: draft.course.trim() || null,
    motivo: draft.reason.trim(), observacao: draft.notes.trim() || null,
    dataTransferencia: draft.transferDate, financeiro,
    expectedRegraFingerprint: preview.regraFingerprint,
    aproveitamentos: Object.entries(draft.credits).filter(([, item]) => item.selected)
      .map(([disciplinaId, item]) => ({
        disciplinaId, situacao: item.situacao,
        mediaFinal: item.mediaFinal === '' ? null : Number(item.mediaFinal),
        frequenciaPercent: item.frequenciaPercent === '' ? null : Number(item.frequenciaPercent),
      })),
  };
};
