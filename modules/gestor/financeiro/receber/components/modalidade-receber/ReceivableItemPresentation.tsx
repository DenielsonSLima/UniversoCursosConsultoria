import React from 'react';
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  ReceiptText,
  RefreshCw,
} from 'lucide-react';
import type { ContasReceber } from '../../../financeiro.service';
import { formatEnrollment } from './modalidade-receber.enrollment';
import {
  canReverseManualSettlement,
  formatCurrency,
  formatOptionalCurrency,
  formatReceivableDate,
  getPersistedGatewayFee,
  getPersistedGatewayNet,
  isPaidThroughAsaas,
  paymentGatewayCode,
  paymentGatewayLabel,
  paymentGatewayStatusClass,
  paymentGatewayStatusLabel,
  paymentMethodLabel,
  paymentOriginLabel,
} from './modalidade-receber.utils';

export interface ReceivableActionsContext {
  baneseDetailsPending: boolean;
  baneseDetailsReceivableId?: string;
  refreshPending: boolean;
  syncPending: boolean;
  onOpenPayment: (item: ContasReceber) => void;
  onCopyInvoiceUrl: (item: ContasReceber) => void | Promise<void>;
  onOpenCharge: (item: ContasReceber) => void;
  onRefresh: (receivableId: string) => void;
  onSync: (receivableId: string) => void;
  onOpenPaidReceipt: (item: ContasReceber) => void;
  onOpenReversal: (item: ContasReceber) => void;
}

interface ItemProps {
  item: ContasReceber;
  actions: ReceivableActionsContext;
}

export const ReceivableStatusBadge: React.FC<{ item: ContasReceber }> = ({ item }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
    item.status === 'PAGO'
      ? 'bg-emerald-50 text-emerald-700'
      : item.status === 'VENCIDO'
        ? 'bg-rose-50 text-rose-700'
        : item.status === 'SUSPENSO'
          ? 'bg-blue-50 text-blue-700'
          : item.status === 'CANCELADO'
            ? 'bg-slate-100 text-slate-500'
            : 'bg-amber-50 text-amber-700'
  }`}>
    {item.status === 'PAGO' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
    {item.status}
  </span>
);

export const ReceivableActionButtons: React.FC<ItemProps> = ({ item, actions }) => {
  if (item.status === 'PAGO') {
    const paidThroughAsaas = isPaidThroughAsaas(item);
    return (
      <div className="flex max-w-[190px] flex-col gap-2">
        <span className="text-[10px] font-bold text-slate-400">Recebido em {formatReceivableDate(item.dataPagamento || '')}</span>
        <button
          type="button"
          onClick={() => actions.onOpenPaidReceipt(item)}
          className={`inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
            paidThroughAsaas
              ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
          }`}
          title={paidThroughAsaas ? 'Abrir comprovante oficial do Asaas' : 'Imprimir recibo interno da Universo'}
        >
          {paidThroughAsaas ? <ExternalLink size={12} /> : <ReceiptText size={12} />}
          {paidThroughAsaas ? 'Comprovante Asaas' : 'Recibo Universo'}
        </button>
        {paidThroughAsaas && !item.asaasTransactionReceiptUrl && item.id ? (
          <button
            type="button"
            onClick={() => actions.onRefresh(item.id!)}
            disabled={actions.refreshPending}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
            title="Consultar novamente o comprovante no Asaas"
          >
            <RefreshCw className={actions.refreshPending ? 'animate-spin' : ''} size={12} />
            Atualizar Asaas
          </button>
        ) : null}
        {canReverseManualSettlement(item) ? (
          <button
            type="button"
            onClick={() => actions.onOpenReversal(item)}
            className="rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50"
            title="Estornar baixa manual"
          >
            Estornar baixa
          </button>
        ) : null}
      </div>
    );
  }

  if (!['PENDENTE', 'VENCIDO'].includes(item.status)) {
    return <span className="text-[10px] font-bold text-slate-400">Sem ação financeira</span>;
  }

  const loadingBaneseDetails = actions.baneseDetailsPending
    && actions.baneseDetailsReceivableId === item.id;
  const gatewayCode = paymentGatewayCode(item);
  const isBanese = ['banese_card', 'banese'].includes(gatewayCode || '');
  const hasExternalChargeUrl = !isBanese
    && Boolean(item.asaasInvoiceUrl || item.asaasBankSlipUrl);

  return (
    <div className="grid w-full max-w-[180px] grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => actions.onOpenPayment(item)}
        className="col-span-2 rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700"
        title="Confirmar recebimento manual"
      >
        Receber
      </button>
      {hasExternalChargeUrl || isBanese ? (
        <>
          {hasExternalChargeUrl ? (
            <button
              type="button"
              onClick={() => actions.onCopyInvoiceUrl(item)}
              className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 px-2 py-2 text-[10px] font-black uppercase text-emerald-700"
              title="Copiar link de cobrança"
            >
              <Copy size={12} /> Link
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => actions.onOpenCharge(item)}
            disabled={loadingBaneseDetails}
            className={`${hasExternalChargeUrl ? '' : 'col-span-2'} flex items-center justify-center gap-1 rounded-xl border border-blue-200 px-2 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50`}
            title={isBanese ? 'Abrir o PDF do boleto Banese em uma nova aba para imprimir' : 'Abrir cobrança'}
          >
            {loadingBaneseDetails
              ? <Loader2 className="animate-spin" size={12} />
              : <ExternalLink size={12} />}
            Abrir
          </button>
          {!isBanese ? (
            <button
              type="button"
              onClick={() => actions.onRefresh(item.id!)}
              disabled={actions.refreshPending}
              className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 py-2 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50"
              title="Consultar status atual no banco configurado"
            >
              <RefreshCw className={actions.refreshPending ? 'animate-spin' : ''} size={12} /> Atualizar
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          onClick={() => actions.onSync(item.id!)}
          disabled={actions.syncPending}
          className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={actions.syncPending ? 'animate-spin' : ''} size={12} />
          Enviar ao banco
        </button>
      )}
    </div>
  );
};

interface ReceivableRowProps extends ItemProps {
  index: number;
  compactStudent?: boolean;
}

export const ReceivableRow: React.FC<ReceivableRowProps> = ({
  item,
  index,
  compactStudent = false,
  actions,
}) => (
  <tr className={`${
    index % 2 === 0 ? 'bg-white' : compactStudent ? 'bg-emerald-50/45' : 'bg-slate-50/55'
  } align-top transition-colors hover:bg-emerald-50/70`}>
    <td className="px-5 py-5">
      {compactStudent ? (
        <div className="space-y-1.5">
          <p className="text-xs font-black uppercase tracking-wider text-[#001a33]">
            {item.parcelaNumero !== undefined ? `Parcela ${item.parcelaNumero}` : item.tipoLancamento || 'Cobrança'}
          </p>
          <p className="text-[10px] font-bold text-slate-500">Venc.: {formatReceivableDate(item.dataVencimento)}</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Matrícula: {formatEnrollment(item)}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="break-words text-sm font-black leading-tight text-[#001a33]">{item.clienteNome}</p>
          <p className="whitespace-nowrap text-[10px] font-bold text-slate-400">CPF: {item.clienteCpfCnpj || 'não informado'}</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Matrícula: {formatEnrollment(item)}</p>
        </div>
      )}
    </td>
    <td className="px-5 py-5">
      <div className="space-y-1.5">
        <p className="break-words text-xs font-bold leading-snug text-slate-700">{item.descricao}</p>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          {item.tipoLancamento || 'Mensalidade'} {item.parcelaNumero !== undefined ? `· Parcela ${item.parcelaNumero}` : ''}
        </p>
        <p className="text-[10px] font-black uppercase tracking-wider text-blue-500">
          {paymentGatewayLabel(item)}:{' '}
          <span className={paymentGatewayStatusClass(item.asaasStatus)}>{paymentGatewayStatusLabel(item)}</span>
        </p>
      </div>
    </td>
    <td className="px-5 py-5">
      <div className="space-y-1.5">
        <p className="break-words text-xs font-bold leading-snug text-slate-700">{item.turmaNome || item.cursoNome || 'Turma não informada'}</p>
        <p className="break-words text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.poloNome || 'Unidade não informada'}</p>
        <p className="text-[10px] font-medium leading-snug text-slate-400">
          CNPJ: {item.poloCnpj || 'não informado'} · {item.poloCidade || 'Cidade não informada'} / {item.poloUf || 'UF'}
        </p>
      </div>
    </td>
    <td className="px-5 py-5">
      <div className="space-y-2">
        <ReceivableStatusBadge item={item} />
        <p className="text-[10px] font-bold text-slate-500">Forma: {paymentMethodLabel(item)}</p>
        <p className="text-[10px] font-bold text-slate-500">Origem: {paymentOriginLabel(item)}</p>
        {['DELETED', 'CANCELED'].includes(String(item.asaasStatus || '').toUpperCase()) ? (
          <p className="text-[10px] font-bold text-rose-600">
            Cobrança cancelada/excluída no {paymentGatewayLabel(item)} após baixa manual.
          </p>
        ) : null}
        <p className="text-[10px] font-bold text-slate-400">Venc.: {formatReceivableDate(item.dataVencimento)}</p>
        {item.status === 'PAGO' ? (
          <p className="text-[10px] font-bold text-emerald-700">Pago: {formatReceivableDate(item.dataPagamento || '')}</p>
        ) : null}
      </div>
    </td>
    <td className="px-5 py-5">
      <p className="whitespace-nowrap text-sm font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
      <p className="mt-1 whitespace-nowrap text-[11px] font-black text-slate-500">Taxa: {formatOptionalCurrency(getPersistedGatewayFee(item))}</p>
      <p className="whitespace-nowrap text-[11px] font-black text-emerald-700">Líquido: {formatOptionalCurrency(getPersistedGatewayNet(item))}</p>
      {item.valorPago !== undefined ? (
        <p className="mt-1 whitespace-nowrap text-[10px] font-bold text-emerald-700">Rec.: {formatCurrency(item.valorPago)}</p>
      ) : null}
    </td>
    <td className="px-5 py-5"><ReceivableActionButtons item={item} actions={actions} /></td>
  </tr>
);

export const ReceivableCard: React.FC<ItemProps> = ({ item, actions }) => (
  <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-black text-[#001a33]">{item.clienteNome}</p>
        <p className="mt-1 text-[10px] font-bold text-slate-400">CPF: {item.clienteCpfCnpj || 'não informado'}</p>
      </div>
      <ReceivableStatusBadge item={item} />
    </div>
    <div className="mt-4 rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-700">{item.descricao}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{item.tipoLancamento || 'Mensalidade'}</p>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div>
        <p className="text-[9px] font-black uppercase text-slate-400">Vencimento</p>
        <p className="font-bold text-slate-700">{formatReceivableDate(item.dataVencimento)}</p>
      </div>
      <div>
        <p className="text-[9px] font-black uppercase text-slate-400">Valor</p>
        <p className="font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        <p className="mt-1 text-[11px] font-black text-slate-500">Taxa: {formatOptionalCurrency(getPersistedGatewayFee(item))}</p>
        <p className="text-[11px] font-black text-emerald-700">Líquido: {formatOptionalCurrency(getPersistedGatewayNet(item))}</p>
      </div>
    </div>
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Unidade</p>
      <p className="text-xs font-bold text-slate-700">{item.poloNome}</p>
      <p className="text-[10px] font-semibold text-slate-400">
        CNPJ: {item.poloCnpj || 'não informado'} · {item.poloCidade || 'Cidade não informada'} / {item.poloUf || 'UF'}
      </p>
    </div>
    <div className="mt-4"><ReceivableActionButtons item={item} actions={actions} /></div>
  </article>
);
