import React from 'react';
import type { DespesaBaixaParams, DespesaLancamento } from '../despesas.service';
import type { ContaBancaria } from '../../financeiro.service';
import { FinancialPaymentModal } from '../../settlements/FinancialPaymentModal';
import type { FinancialPaymentResult } from '../../settlements/financial-payment.types';

interface DespesaBaixaModalProps {
  item: DespesaLancamento;
  contas: ContaBancaria[];
  poloId: string;
  onConfirm: (params: DespesaBaixaParams) => Promise<FinancialPaymentResult>;
  onClose: () => void;
  onReversed: () => Promise<void>;
  isPending: boolean;
  tone?: 'emerald' | 'indigo';
}

export default function DespesaBaixaModal({ item, contas, poloId, onConfirm, onClose, isPending, onReversed }: DespesaBaixaModalProps) {
  return <FinancialPaymentModal sourceKind="EXPENSE" sourceId={item.id} poloId={item.poloId || poloId}
    description={item.descricao} partnerName={item.fornecedorNome} accounts={contas}
    onReversed={onReversed} readOnly={item.status === 'PAGO'} onClose={() => { if (!isPending) onClose(); }} onConfirm={onConfirm} />;
}
