import { useState } from 'react';
import { formatCentsInput } from '../renegociacoes.model';
import type { RenegociacaoScheduleEntry } from '../renegociacoes.types';

export interface ScheduleDraftEntry {
  sequence: number;
  dueDate: string;
  amount: string;
}

// Apenas conversão de entrada; composição, soma e regras financeiras são validadas no servidor.
const parseAmount = (value: string) => {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};

export const useRenegociacaoScheduleDraft = (entries: RenegociacaoScheduleEntry[] = []) => {
  const [draft, setDraft] = useState<ScheduleDraftEntry[] | null>(null);
  const canonical = entries.filter((entry) => entry.kind === 'INSTALLMENT').map((entry) => ({
    sequence: entry.sequence, dueDate: entry.dueDate, amount: formatCentsInput(entry.amountCents),
  }));
  const rows = draft || canonical;
  const changed = JSON.stringify(rows) !== JSON.stringify(canonical);
  const parsed = rows.map((row) => ({
    sequence: row.sequence, dueDate: row.dueDate, amountCents: parseAmount(row.amount),
  }));
  const valid = parsed.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) && row.amountCents !== null);
  return {
    rows,
    changed,
    valid,
    payload: valid ? parsed.map((row) => ({ ...row, amountCents: row.amountCents! })) : null,
    update: (sequence: number, field: 'dueDate' | 'amount', value: string) =>
      setDraft(rows.map((row) => row.sequence === sequence ? { ...row, [field]: value } : row)),
    reset: () => setDraft(null),
  };
};
