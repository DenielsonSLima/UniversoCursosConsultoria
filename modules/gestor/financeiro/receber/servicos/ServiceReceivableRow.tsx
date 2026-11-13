import React from 'react';
import { CheckCircle2, Clock3, ExternalLink } from 'lucide-react';
import { ReceivableAmountSummary } from '../components/modalidade-receber/ReceivableAmountSummary';
import { FinancialPaymentBalance, hasPartialPayment } from '../../settlements/financial-payment.presentation';
import { formatReceivableDate, paymentMethodLabel, paymentOriginLabel } from '../components/modalidade-receber/modalidade-receber.utils';
import { canOpenServiceCharge, canReceiveService, serviceReceiptBlockReason, serviceReceiptStatus } from './service-receivable.presentation';
import type { ServiceReceivable } from './servicos-receber.contract';

export interface ServiceReceivableActions {
  onReceive: (item: ServiceReceivable) => void;
  onBolepix: (id: string) => void;
}
interface Props extends ServiceReceivableActions { item: ServiceReceivable; index?: number; compactPartner?: boolean }

export function ServiceReceivableActionButtons({ item, onReceive, onBolepix }: Props) {
  const reason = serviceReceiptBlockReason(item);
  return <div className="grid w-full max-w-[180px] grid-cols-2 gap-2">
    {canReceiveService(item) ? <button type="button" onClick={() => onReceive(item)} title="Confirmar recebimento manual"
      className="col-span-2 rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700">
      {hasPartialPayment(item.paymentSummary) ? 'Receber saldo' : 'Receber'}</button> : null}
    {reason ? <p role="status" className="col-span-2 text-[10px] font-bold text-slate-500">{reason}</p> : null}
    {item.paymentSummary?.hasEvents || item.status === 'PAGO' ? <button type="button" onClick={() => onReceive(item)}
      className="col-span-2 rounded-xl border border-emerald-200 px-3 py-2 text-[10px] font-black text-emerald-700">Histórico de pagamentos</button> : null}
    {canOpenServiceCharge(item) ? <button type="button" onClick={() => onBolepix(item.id!)} title="Abrir cobrança"
      className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-blue-200 px-2 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50"><ExternalLink size={12} />Abrir</button> : null}
  </div>;
}

function Status({ item }: { item: ServiceReceivable }) {
  return <span className={`inline-flex max-w-[220px] items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
    item.status === 'PAGO' ? 'bg-emerald-50 text-emerald-700' : item.status === 'VENCIDO' ? 'bg-rose-50 text-rose-600'
      : ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO'].includes(item.status) ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
    {item.status === 'PAGO' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}{serviceReceiptStatus(item)}</span>;
}
const installment = (item: ServiceReceivable) => item.nfseInstallmentNumber && item.nfseInstallmentCount
  ? `Parcela ${item.nfseInstallmentNumber}/${item.nfseInstallmentCount}` : 'Serviço';
const invoice = (item: ServiceReceivable) => item.nfseNumber ? `NFS-e nº ${item.nfseNumber}` : 'NFS-e vinculada';
function Dates({ item }: { item: ServiceReceivable }) {
  return <div className="space-y-2">{[
    ['Emissão', item.dataEmissao], ['Vencimento', item.dataVencimento],
    ...(item.status === 'PAGO' ? [['Pagamento', item.dataPagamento]] : []),
  ].map(([label, date]) => <div key={label}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="whitespace-nowrap text-[11px] font-bold text-slate-700">{formatReceivableDate(date || '')}</p></div>)}</div>;
}

export const ServiceReceivableRow: React.FC<Props> = ({ item, index = 0, compactPartner = false, ...actions }: Props) => {
  return <tr className={`${index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/45'} align-top transition-colors hover:bg-emerald-50/70`}>
    <td className="px-5 py-5"><div className="space-y-1.5">
      <p className="break-words text-xs font-black leading-tight text-[#001a33]">{compactPartner ? installment(item) : item.clienteNome || 'Parceiro'}</p>
      {!compactPartner ? <p className="text-[10px] font-bold text-slate-400">CPF/CNPJ: {item.clienteCpfCnpj || 'não informado'}</p> : null}
      <p className="text-[10px] font-bold text-slate-500">{item.poloNome}</p></div></td>
    <td className="px-5 py-5"><div className="space-y-1.5">
      <p className="break-words text-xs font-black leading-snug text-[#001a33]">{item.nfseFiscalDescription || item.descricao}</p>
      <p className="text-[10px] font-bold text-slate-500">{invoice(item)}</p>
      <p className="text-[10px] font-bold text-slate-400">{item.categoriaFinanceiraNome || 'Serviços'}</p>
      {!compactPartner ? <p className="text-[10px] font-bold text-slate-400">{installment(item)}</p> : null}</div></td>
    <td className="px-5 py-5"><div className="space-y-2"><Status item={item} />
      <p className="text-[10px] font-bold text-slate-500">Forma: {paymentMethodLabel(item)}</p>
      <p className="text-[10px] font-bold text-slate-500">Origem: {paymentOriginLabel(item)}</p></div></td>
    <td className="px-5 py-5"><Dates item={item} /></td>
    <td className="financial-data-money py-5 pl-3 pr-2"><ReceivableAmountSummary item={item} compact /><FinancialPaymentBalance summary={item.paymentSummary} /></td>
    <td className="py-5 pl-2 pr-3"><ServiceReceivableActionButtons item={item} {...actions} /></td>
  </tr>;
}

export const ServiceReceivableCard: React.FC<Props> = ({ item, ...actions }: Props) => {
  return <article className="financial-data-surface financial-data-card rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="font-black text-[#001a33]">{installment(item)}</p>
      <p className="mt-1 text-[10px] font-bold text-slate-400">{invoice(item)}</p></div><Status item={item} /></div>
    <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="break-words text-xs font-black text-[#001a33]">{item.nfseFiscalDescription || item.descricao}</p>
      <p className="mt-1 text-[10px] font-bold text-slate-500">{item.categoriaFinanceiraNome || 'Serviços'}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-xs"><Dates item={item} /><div><p className="text-[9px] font-black uppercase text-slate-400">Valor</p>
      <ReceivableAmountSummary item={item} /><FinancialPaymentBalance summary={item.paymentSummary} /></div></div>
    <div className="mt-4 rounded-xl border border-slate-100 px-3 py-2"><p className="text-[10px] font-bold text-slate-500">Forma: {paymentMethodLabel(item)}</p>
      <p className="mt-1 text-[10px] font-bold text-slate-500">Origem: {paymentOriginLabel(item)}</p></div>
    <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Unidade</p>
      <p className="text-xs font-bold text-slate-700">{item.poloNome}</p></div>
    <div className="mt-4"><ServiceReceivableActionButtons item={item} {...actions} /></div>
  </article>;
}
