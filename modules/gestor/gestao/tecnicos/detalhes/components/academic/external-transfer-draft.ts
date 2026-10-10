import { getMaceioIsoDate } from '../../../technicalClassDates';
import {
  isExternalTransferFinancialPlan, isTransferDate,
  type ExternalTransferCredit, type ExternalTransferFinancialPlan, type ExternalTransferInput,
  type ExternalTransferPreview, type ExternalTransferScheduleItem,
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
  reason: string;
  notes: string;
  transferDate: string;
  credits: Record<string, ExternalCreditDraft>;
  items: ExternalTransferScheduleItem[] | null;
}
export const createExternalTransferDraft = (studentId = '', today = getMaceioIsoDate()): ExternalTransferDraft => ({
  studentId, institution: '', reason: '', notes: '', transferDate: today, credits: {}, items: null,
});
export const applyExternalTransferDefaults = (draft: ExternalTransferDraft, context: ExternalTransferPreview): ExternalTransferDraft => ({
  ...draft, items: globalThis.structuredClone(context.financeiro.itens),
});
export const externalTransferFinancialError = (draft: ExternalTransferDraft, maximum: number, maximumCycles: 1 | 2 = 2): string | null => {
  if (draft.items === null) return 'Consulte o cronograma padrão da turma.';
  if (!isExternalTransferFinancialPlan({ versao: 3, itens: draft.items }, maximumCycles, maximum)) {
    return 'Confira cada cobrança: ciclo permitido, data válida, valor positivo, desconto menor que o valor e multa/juros abaixo de 100%.';
  }
  return null;
};
export const externalTransferPlan = (draft: ExternalTransferDraft, maximum: number, maximumCycles: 1 | 2 = 2): ExternalTransferFinancialPlan | null => (
  externalTransferFinancialError(draft, maximum, maximumCycles) || !draft.items
    ? null : { versao: 3, itens: globalThis.structuredClone(draft.items) }
);
export const sameExternalTransferPlan = (left: ExternalTransferFinancialPlan, right: ExternalTransferFinancialPlan) => {
  if (left.itens.length !== right.itens.length) return false;
  const amounts = ['valor', 'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtrasoPercentual'] as const;
  return left.itens.every((item, index) => {
    const compared = right.itens[index];
    return item.itemId === compared.itemId && item.cicloNumero === compared.cicloNumero && item.tipo === compared.tipo
      && item.ordem === compared.ordem && item.vencimento === compared.vencimento
      && amounts.every((key) => Number(item[key]) === Number(compared[key]));
  });
};
export const updateExternalTransferItem = (items: ExternalTransferScheduleItem[], id: string, patch: Partial<ExternalTransferScheduleItem>) => (
  items.map((item) => item.itemId === id ? { ...item, ...patch, itemId: item.itemId } : item)
);
export const reorderExternalTransferItems = (items: ExternalTransferScheduleItem[]) => {
  const order = { 1: 0, 2: 0 };
  return items.map((item) => ({ ...item, ordem: ++order[item.cicloNumero] }));
};
export const removeExternalTransferItem = (items: ExternalTransferScheduleItem[], id: string) => (
  reorderExternalTransferItems(items.filter((item) => item.itemId !== id))
);
export const moveExternalTransferItem = (items: ExternalTransferScheduleItem[], id: string, direction: -1 | 1) => {
  const index = items.findIndex((item) => item.itemId === id);
  const current = items[index];
  const next = items[index + direction];
  if (!current || current.tipo !== 'PARCELA' || !next || next.tipo !== 'PARCELA' || next.cicloNumero !== current.cicloNumero) return items;
  const changed = [...items];
  [changed[index], changed[index + direction]] = [changed[index + direction], changed[index]];
  return reorderExternalTransferItems(changed);
};
export const changeExternalTransferItemCycle = (items: ExternalTransferScheduleItem[], id: string, cycle: 1 | 2) => {
  const selected = items.find((item) => item.itemId === id);
  if (!selected || selected.tipo !== 'PARCELA' || selected.cicloNumero === cycle) return items;
  const remaining = items.filter((item) => item.itemId !== id);
  const insertion = remaining.reduce((last, item, index) => item.cicloNumero === cycle ? index + 1 : last, 0);
  remaining.splice(insertion || (cycle === 2 ? remaining.length : 0), 0, { ...selected, cicloNumero: cycle });
  return reorderExternalTransferItems(remaining);
};
export const externalTransferOriginError = (draft: ExternalTransferDraft, today = getMaceioIsoDate()): string | null => {
  if (!draft.studentId || !draft.institution.trim() || !draft.reason.trim()) return 'Informe aluno, escola anterior e motivo da transferência.';
  if (!isTransferDate(draft.transferDate) || draft.transferDate > today) return 'Informe a data efetiva, sem data futura.';
  return null;
};
export const externalTransferCreditsError = (draft: ExternalTransferDraft, disciplineIds?: Set<string>): string | null => {
  if (disciplineIds && Object.entries(draft.credits).some(([id, credit]) => credit.selected && !disciplineIds.has(id))) {
    return 'Uma disciplina selecionada não pertence à grade atual. Recarregue as disciplinas antes de continuar.';
  }
  for (const credit of Object.values(draft.credits).filter((item) => item.selected)) {
    if (credit.mediaFinal !== '' && (!Number.isFinite(Number(credit.mediaFinal)) || Number(credit.mediaFinal) < 0 || Number(credit.mediaFinal) > 10)) return 'A média deve ficar entre 0 e 10.';
    if (credit.frequenciaPercent !== '' && (!Number.isFinite(Number(credit.frequenciaPercent)) || Number(credit.frequenciaPercent) < 0 || Number(credit.frequenciaPercent) > 100)) return 'A frequência deve ficar entre 0 e 100.';
  }
  return null;
};
export const externalTransferDraftError = (draft: ExternalTransferDraft, today = getMaceioIsoDate()): string | null => (
  externalTransferOriginError(draft, today) || externalTransferCreditsError(draft)
);
export const buildExternalTransferInput = (draft: ExternalTransferDraft, turmaId: string, preview: ExternalTransferPreview, requestId: string): ExternalTransferInput => {
  const error = externalTransferDraftError(draft);
  const financeiro = externalTransferPlan(draft, preview.quantidadeMaxima, preview.maxCiclos);
  if (error || !financeiro) throw new Error(error || 'Confira o cronograma antes de receber.');
  if (!sameExternalTransferPlan(financeiro, preview.financeiro)) throw new Error('O plano mudou. Refaça a conferência financeira.');
  return {
    requestId, alunoId: draft.studentId, turmaDestinoId: turmaId,
    instituicaoOrigem: draft.institution.trim(), cursoOrigem: null,
    motivo: draft.reason.trim(), observacao: draft.notes.trim() || null,
    dataTransferencia: draft.transferDate, financeiro: globalThis.structuredClone(preview.financeiro),
    expectedRegraFingerprint: preview.regraFingerprint,
    aproveitamentos: Object.entries(draft.credits).filter(([, item]) => item.selected).map(([disciplinaId, item]) => ({
      disciplinaId, situacao: item.situacao,
      mediaFinal: item.mediaFinal === '' ? null : Number(item.mediaFinal),
      frequenciaPercent: item.frequenciaPercent === '' ? null : Number(item.frequenciaPercent),
    })),
  };
};
