import React from 'react';
import { Banknote, CheckCircle2, Copy, ExternalLink, Link as LinkIcon, RefreshCw } from 'lucide-react';
import type { ContasReceber } from '../financeiro.types';
import { ReceivableAmountSummary } from '../receber/components/modalidade-receber/ReceivableAmountSummary';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import { formatDate, statusClass, origemLabel } from './outros-creditos.presentation';

type RowModel = Pick<OutrosCreditosModel,
  | 'syncMutation'
  | 'refreshMutation'
  | 'copyLink'
  | 'openReceiveModal'
>;

export const OtherCreditRow: React.FC<{
  item: ContasReceber; index: number; model: RowModel;
}> = ({ item, index, model }) => {
  const {
    syncMutation, refreshMutation, copyLink, openReceiveModal,
  } = model;
  return (
    <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/45'} transition-colors hover:bg-emerald-50/75`}>
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
          {item.status}
        </span>
        <p className="mt-1 text-[10px] font-bold text-slate-500">Origem: {origemLabel(item)}</p>
        <p className="text-[10px] font-bold text-slate-500">Forma: {item.formaPagamento || (item.asaasPaymentId || item.asaasPaymentLinkId ? 'Link bancário' : 'Não definida')}</p>
        {item.asaasStatus && <p className="text-[10px] font-black uppercase text-blue-500">Gateway: {item.asaasStatus}</p>}
      </td>
      <td className="px-5 py-4">
        <ReceivableAmountSummary item={item} compact />
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => openReceiveModal(item)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#062849]"
            >
              <CheckCircle2 size={13} /> Receber
            </button>
          )}
          {!item.asaasPaymentId && !item.asaasPaymentLinkId && item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => syncMutation.mutate(item.id!)}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <LinkIcon size={13} /> Gerar link
            </button>
          )}
          {(item.asaasPaymentId || item.asaasPaymentLinkId) && item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => refreshMutation.mutate(item.id!)}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Atualizar
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
