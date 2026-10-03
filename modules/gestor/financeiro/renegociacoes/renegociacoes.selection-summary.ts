import type { RenegociacaoIdentity } from './renegociacoes.types';

export interface RenegociacaoSelectionSummary {
  version: 1;
  asOf: string;
  identity: RenegociacaoIdentity;
  receivableIds: string[];
  count: number;
  totals: {
    principalCents: number;
    punctualDiscountCents: number | null;
    discountedPrincipalCents: number | null;
    interestCents: number;
    penaltyCents: number;
    grossDebtCents: number;
    payableCents: number | null;
  };
  discount: { status: 'KNOWN' | 'UNAVAILABLE'; message: string; appliedToProposal: false };
  payableStatus: 'KNOWN' | 'UNAVAILABLE';
  payableMessage: string;
}

type Row = Record<string, unknown>;
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('O servidor retornou um resumo financeiro inválido.');
  return value as Row;
};
const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`O servidor não retornou ${field}.`);
  return value;
};
const cents = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`O servidor retornou ${field} inválido no resumo da seleção.`);
  return value;
};
const availability = (value: unknown): 'KNOWN' | 'UNAVAILABLE' => {
  if (value !== 'KNOWN' && value !== 'UNAVAILABLE') throw new Error('A condição financeira não foi confirmada.');
  return value;
};

export const canonicalSelectionIds = (ids: readonly string[]): string[] => [...new Set(ids)].sort();
export const selectionIdsKey = (ids: readonly string[]): string => JSON.stringify(canonicalSelectionIds(ids));

export const parseSelectionSummary = (
  value: unknown,
  expectedIdentity: RenegociacaoIdentity,
  expectedIds: readonly string[],
  expectedAsOf?: string | null,
): RenegociacaoSelectionSummary => {
  const result = row(Array.isArray(value) && value.length === 1 ? value[0] : value);
  if (result.version !== 1) throw new Error('A versão do resumo financeiro não é suportada.');
  const sourceIdentity = row(result.identity);
  const identity = {
    poloId: text(sourceIdentity.poloId, 'o polo'),
    alunoId: text(sourceIdentity.alunoId, 'o aluno'),
    matriculaId: text(sourceIdentity.matriculaId, 'a matrícula'),
    turmaId: text(sourceIdentity.turmaId, 'a turma'),
  };
  for (const field of ['poloId', 'alunoId', 'matriculaId', 'turmaId'] as const) {
    if (identity[field] !== expectedIdentity[field])
      throw new Error('O resumo retornado não pertence à seleção atual.');
  }
  if (!Array.isArray(result.receivableIds)) throw new Error('O servidor não confirmou as parcelas do resumo.');
  const ids = result.receivableIds.map((id) => text(id, 'a parcela selecionada'));
  const count = cents(result.count, 'a quantidade de parcelas');
  if (!count || count !== ids.length || new Set(ids).size !== ids.length || selectionIdsKey(ids) !== selectionIdsKey(expectedIds))
    throw new Error('As parcelas do resumo não correspondem à seleção atual.');
  const asOf = text(result.asOf, 'a data-base');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || (expectedAsOf && expectedAsOf !== asOf))
    throw new Error('A data-base do resumo mudou. Atualize as parcelas.');
  const discountRow = row(result.discount);
  const discountStatus = availability(discountRow.status);
  const payableStatus = availability(result.payableStatus);
  if (discountStatus === 'UNAVAILABLE' && payableStatus === 'KNOWN')
    throw new Error('O total não pode ser confirmado sem comprovar o desconto.');
  if (discountRow.appliedToProposal !== false)
    throw new Error('O resumo não pode conceder desconto automaticamente à proposta.');
  const totals = row(result.totals);
  const conditionalCents = (field: string, status: 'KNOWN' | 'UNAVAILABLE') => {
    if (status === 'KNOWN') return cents(totals[field], field);
    if (totals[field] !== null) throw new Error('Um valor não comprovado deve permanecer indisponível.');
    return null;
  };
  return {
    version: 1, asOf, identity, receivableIds: canonicalSelectionIds(ids), count,
    totals: {
      principalCents: cents(totals.principalCents, 'o principal'),
      punctualDiscountCents: conditionalCents('punctualDiscountCents', discountStatus),
      discountedPrincipalCents: conditionalCents('discountedPrincipalCents', discountStatus),
      interestCents: cents(totals.interestCents, 'os juros'),
      penaltyCents: cents(totals.penaltyCents, 'a multa'),
      grossDebtCents: cents(totals.grossDebtCents, 'o valor com encargos'),
      payableCents: conditionalCents('payableCents', payableStatus),
    },
    discount: { status: discountStatus, message: text(discountRow.message, 'a condição de desconto'), appliedToProposal: false },
    payableStatus, payableMessage: text(result.payableMessage, 'a condição do total'),
  };
};
