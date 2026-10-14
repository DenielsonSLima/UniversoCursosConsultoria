import React from 'react';
import { Banknote, BookOpen, CheckCircle2, Copy, ExternalLink, Link as LinkIcon, QrCode, XCircle } from 'lucide-react';
import { FinancialPaymentBalance, hasPartialPayment } from '../settlements/financial-payment.presentation';
import type { ContasReceber } from '../financeiro.types';
import { ReceivableAmountSummary } from '../receber/components/modalidade-receber/ReceivableAmountSummary';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import { formatDate, statusClass, origemLabel } from './outros-creditos.presentation';
import { OtherCreditSelectionCheckbox } from './OtherCreditSelectionCheckbox';
import { otherCreditCancellationBlockReason } from './other-credit-cancellation.selection';
import type { OtherCreditCancellationModel } from './useOtherCreditCancellation';

type RowModel = Pick<OutrosCreditosModel,
  | 'syncMutation'
  | 'copyLink'
  | 'openReceiveModal'
  | 'openPaymentModal'
>;

export const OtherCreditRow: React.FC<{
  item: ContasReceber; index: number; model: RowModel; onOpenPlan?: (id: string) => void;
  cancellation?: Pick<OtherCreditCancellationModel, 'selectedIds' | 'pending' | 'selectionLocked' | 'reservedIds' | 'toggle' | 'open'>;
}> = ({ item, index, model, onOpenPlan, cancellation }) => {
  const {
    syncMutation, copyLink, openReceiveModal, openPaymentModal,
  } = model;
  const cancellationBlock = otherCreditCancellationBlockReason(item);
  const legacy = item.origemPagamento === 'SISTEMA_ANTERIOR' || item.gatewayProvider === 'proesc';
  const nativeBanese = !legacy && item.gatewayProvider === 'banese_card';
  return (
    <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/45'} transition-colors hover:bg-emerald-50/75`}>
      {cancellation ? <td className="w-12 px-4 py-4" title={cancellationBlock || undefined}>
        <OtherCreditSelectionCheckbox checked={cancellation.selectedIds.has(item.id!)}
          disabled={cancellation.selectionLocked || cancellation.reservedIds.has(item.id!) || Boolean(cancellationBlock)} label={`Selecionar ${item.descricao}`}
          onChange={() => cancellation.toggle([item])} />
      </td> : null}
      <td className="px-5 py-4">
        <p className="text-sm font-black text-[#001a33]">{item.descricao}</p>
        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
          {item.categoriaFinanceiraNome || 'Sem categoria específica'}
        </p>
      </td>
      <td className="px-5 py-4">
        <p className="text-xs font-bold text-slate-700">{item.clienteNome || 'Entrada sem parceiro'}</p>
        <p className="text-[10px] font-bold text-slate-400">{item.clienteCpfCnpj || 'CPF/CNPJ não vinculado'}</p>
        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
          {item.poloNome} {item.poloCidade ? `- ${item.poloCidade}/${item.poloUf}` : ''}
        </p>
      </td>
      <td className="px-5 py-4 text-xs font-bold text-slate-600">
        {formatDate(item.dataVencimento)}
        {item.dataPagamento && <p className="mt-1 text-[10px] text-emerald-700">Recebido: {formatDate(item.dataPagamento)}</p>}
      </td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(item.status)}`}>
          {item.status === 'PAGO' ? <CheckCircle2 size={12} /> : <Banknote size={12} />}
          {hasPartialPayment(item.paymentSummary) ? 'Baixa parcial' : item.status}
        </span>
        <p className="mt-1 text-[10px] font-bold text-slate-500">Origem: {origemLabel(item)}</p>
        <p className="text-[10px] font-bold text-slate-500">Forma: {item.formaPagamento || (item.asaasPaymentId || item.asaasPaymentLinkId ? 'Link bancário' : 'Não definida')}</p>
        {item.asaasStatus && <p className="text-[10px] font-black uppercase text-blue-500">Gateway: {item.asaasStatus}</p>}
      </td>
      <td className="px-5 py-4">
        <ReceivableAmountSummary item={item} compact />
        <FinancialPaymentBalance summary={item.paymentSummary} />
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {item.paymentSummary?.hasEvents ? <button type="button" onClick={() => openReceiveModal(item)} className="rounded-xl border border-emerald-200 px-3 py-2 text-[10px] font-black text-emerald-700">Histórico</button> : null}
          {item.outrosCreditosPlanoId && onOpenPlan ? (
            <button type="button" onClick={() => onOpenPlan(item.outrosCreditosPlanoId!)}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50">
              <BookOpen size={13} /> Abrir carnê
            </button>
          ) : null}
          {item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => openReceiveModal(item)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#062849]"
            >
              <CheckCircle2 size={13} /> {hasPartialPayment(item.paymentSummary) ? 'Receber saldo' : 'Receber'}
            </button>
          )}
          {!legacy && !item.outrosCreditosPlanoId && !item.asaasPaymentId && !item.asaasPaymentLinkId && item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => syncMutation.mutate(item.id!)}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <LinkIcon size={13} /> Gerar link
            </button>
          )}
          {cancellation && !cancellationBlock && (
            <button
              type="button" onClick={() => cancellation.open(item)} disabled={cancellation.selectionLocked || cancellation.reservedIds.has(item.id!)}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <XCircle size={13} /> Cancelar
            </button>
          )}
          {nativeBanese && (
            <button
              onClick={() => openPaymentModal(item)}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50"
            >
              <QrCode size={13} /> {item.status === 'PAGO' ? 'Comprovante' : 'Abrir caixa'}
            </button>
          )}
          <button
            onClick={() => copyLink(item)}
            className="rounded-xl border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"
            title="Copiar link bancário"
          >
            <Copy size={14} />
          </button>
          {item.asaasInvoiceUrl && (
            <a
              href={item.asaasInvoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-blue-200 p-2 text-blue-600 hover:bg-blue-50"
              title="Abrir cobrança"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
};
