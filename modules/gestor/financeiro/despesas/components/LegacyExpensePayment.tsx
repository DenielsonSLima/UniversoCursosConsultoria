import React, { useRef, useState } from 'react';
import type { ContaBancaria } from '../../financeiro.service';
import type { DespesaLancamento } from '../despesas.types';
import type { LegacyDespesaBaixaParams } from '../despesas-legacy-payment.model';
import { settleLegacyExpense } from '../despesas-legacy-payment.service';
import LegacyDespesaBaixaModal from './LegacyDespesaBaixaModal';

export function LegacyExpensePayment({ item, contas, poloId, onClose, onConfirmed, tone }: {
  item: DespesaLancamento; contas: ContaBancaria[]; poloId: string; onClose: () => void;
  onConfirmed: () => Promise<void>; tone?: 'emerald' | 'indigo';
}) {
  const submitting = useRef(false);
  const attempt = useRef<LegacyDespesaBaixaParams | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const confirm = async (params: LegacyDespesaBaixaParams) => {
    if (submitting.current) return;
    submitting.current = true;
    attempt.current ??= Object.freeze({ ...params });
    setPending(true); setError('');
    try {
      await settleLegacyExpense(item, attempt.current);
      await onConfirmed();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String((failure as { message?: string })?.message || 'Não foi possível confirmar a baixa integral.'));
    } finally { submitting.current = false; setPending(false); }
  };
  return <LegacyDespesaBaixaModal item={item} contas={contas} poloId={item.poloId || poloId} tone={tone}
    onClose={() => { if (!submitting.current) onClose(); }} onConfirm={confirm} isPending={pending} locked={attempt.current !== null} error={error} />;
}
