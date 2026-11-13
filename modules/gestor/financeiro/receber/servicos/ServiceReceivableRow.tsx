import React from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { formatDate, statusClass } from '../../outros-creditos/outros-creditos.presentation';
import { ReceivableAmountSummary } from '../components/modalidade-receber/ReceivableAmountSummary';
import { FinancialPaymentBalance, hasPartialPayment } from '../../settlements/financial-payment.presentation';
import type { ServiceReceivable } from './servicos-receber.contract';

export const ServiceReceivableRow: React.FC<{
  item: ServiceReceivable; onReceive: (item: ServiceReceivable) => void; onBolepix: (id: string) => void;
}> = ({ item, onReceive, onBolepix }) => {
  const cancellationPending = item.nfseCancellationState === 'PENDING';
  const cancellationReview = item.nfseCancellationState === 'REVIEW_REQUIRED';
  const open = ['PENDENTE', 'VENCIDO'].includes(item.status) && !item.nfseFiscalCancelledAt
    && !cancellationPending && !cancellationReview;
  const bankIssued = Boolean(item.id && (item.asaasPaymentId || item.boletoNossoNumero || item.nossoNumeroAsaas)
    && ['banese', 'banese_card'].includes(item.gatewayProvider || ''));
  const statusLabel = item.status === 'PAGO' ? 'Recebido'
    : cancellationPending ? 'Cancelando cobrança' : cancellationReview ? 'Revisar cancelamento'
    : ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'].includes(item.status) ? item.status
      : hasPartialPayment(item.paymentSummary) ? 'Baixa parcial' : item.status;
  return <tr className="bg-white even:bg-emerald-50/40">
    <td className="px-4 py-4"><p className="text-sm font-medium text-[#001a33]">{item.clienteNome || 'Parceiro'}</p>
      <p className="mt-1 text-xs text-slate-500">{item.poloNome}</p></td>
    <td className="px-4 py-4"><p className="text-sm text-slate-700">{item.descricao}</p>
      <p className="mt-1 text-xs text-slate-500">{item.categoriaFinanceiraNome || 'Serviços'}</p>
      <p className="mt-1 text-xs text-slate-500">{item.nfseNumber ? `NFS-e nº ${item.nfseNumber}` : 'NFS-e vinculada'}</p>
      {item.nfseInstallmentNumber && item.nfseInstallmentCount && <p className="mt-1 text-xs text-slate-500">Parcela {item.nfseInstallmentNumber}/{item.nfseInstallmentCount}</p>}
    </td>
    <td className="px-4 py-4 text-xs text-slate-600">{formatDate(item.dataVencimento)}</td>
    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${statusClass(item.status)}`}>
      {statusLabel}</span>
      {cancellationReview && <p className="mt-1 text-xs text-amber-800">{item.nfseCancellationReason === 'PAYMENT_HISTORY'
        ? 'Existe baixa ou pagamento registrado. Confira o histórico.' : 'O cancelamento precisa de conferência.'}</p>}
    </td>
    <td className="financial-data-money px-4 py-4"><ReceivableAmountSummary item={item} compact /><FinancialPaymentBalance summary={item.paymentSummary} /></td>
    <td className="px-4 py-4"><div className="flex flex-wrap gap-2">
      {open && <button type="button" onClick={() => onReceive(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#001a33] px-3 py-2 text-xs font-medium text-white"><CheckCircle2 size={14} />{hasPartialPayment(item.paymentSummary) ? 'Receber saldo' : 'Receber'}</button>}
      {(item.paymentSummary?.hasEvents || item.status === 'PAGO') && <button type="button" onClick={() => onReceive(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">Histórico</button>}
      {bankIssued && <button type="button" onClick={() => onBolepix(item.id!)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"><FileText size={14} />BolePix</button>}
    </div></td>
  </tr>;
};
