import React, { useEffect, useState } from 'react';
import type { DespesaBaixaParams, DespesaLancamento } from '../despesas.service';
import type { ContaBancaria } from '../../financeiro.service';
import { FinancialPaymentModal } from '../../settlements/FinancialPaymentModal';
import type { FinancialPaymentResult } from '../../settlements/financial-payment.types';
import { canonicalPaymentAmount } from '../../settlements/financial-payment.form';
import { previewEstimatedExpensePayment } from '../despesas-estimativas-pagamento.service';
import DespesaEstimatedPaymentFields from './DespesaEstimatedPaymentFields';
import DespesaWithoutChargeModal from './DespesaWithoutChargeModal';
import { readExpenseWithoutChargeSession } from '../despesas-sem-cobranca.service';

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
  const [realAmount, setRealAmount] = useState('');
  const [withoutCharge, setWithoutCharge] = useState(false);
  const estimated = Boolean(item.valorEstimado && !item.valorConfirmadoEm && ['PENDENTE', 'VENCIDO'].includes(item.status));
  useEffect(() => {
    let active = true;
    void readExpenseWithoutChargeSession(item.id).then(session => {
      if (active && session.attempt) setWithoutCharge(true);
    }).catch(() => { /* O fluxo aberto apresenta o erro de sessão pela sua própria consulta. */ });
    return () => { active = false; };
  }, [item.id]);
  const canonicalRealAmount = canonicalPaymentAmount(realAmount);
  if (withoutCharge || item.valorSemCobrancaEm) return <DespesaWithoutChargeModal item={item} onResolved={onReversed}
    onBack={() => setWithoutCharge(false)} onClose={() => { if (!isPending) onClose(); }} />;
  return <FinancialPaymentModal sourceKind="EXPENSE" sourceId={item.id} poloId={item.poloId || poloId}
    description={item.descricao} partnerName={item.fornecedorNome} accounts={contas}
    paymentInputExtras={estimated ? { expenseEstimate: { realAmount: canonicalRealAmount, version: item.valorEstimadoVersao } } : undefined}
    previewPayment={estimated ? previewEstimatedExpensePayment : undefined}
    previewEnabled={!estimated || Boolean(canonicalRealAmount && Number(canonicalRealAmount) > 0)}
    beforeEditor={estimated ? form => <DespesaEstimatedPaymentFields form={form}
      originalEstimate={item.valorEstimadoOriginal ?? item.valorBase} value={realAmount} onChange={setRealAmount}
      onWithoutCharge={() => setWithoutCharge(true)} /> : undefined}
    onReversed={onReversed} readOnly={item.status === 'PAGO'} onClose={() => { if (!isPending) onClose(); }} onConfirm={onConfirm} />;
}
