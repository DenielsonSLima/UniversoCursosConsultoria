import React from 'react';
import ToastNotification from '../../../components/ToastNotification';
import { FinancialPaymentModal } from '../../settlements/FinancialPaymentModal';
import { OtherCreditPaymentModal } from '../../outros-creditos/OtherCreditPaymentModal';
import { isContaDisponivelNoPolo } from '../../financeiro.types';
import { useServicosReceber } from './useServicosReceber';
import { ServiceReceivablesToolbar } from './ServiceReceivablesToolbar';
import { ServiceReceivablesList } from './ServiceReceivablesList';
import { canReceiveService } from './service-receivable.presentation';

export default function ServicosReceberTab({ poloId }: { poloId?: string | null }) {
  const m = useServicosReceber(poloId);
  const error = m.list.error || m.summary.error || m.upcoming.error;
  const accounts = m.accountsQuery.isError ? [] : (m.accountsQuery.data || []).filter(account => account.ativo !== false
    && isContaDisponivelNoPolo(account, m.selected?.poloId));
  return <section className="financial-section-workspace space-y-4 animate-fadeIn" aria-label="Contas a receber de serviços">
    <ToastNotification toasts={m.toasts} onRemove={m.removeToast} />
    <ServiceReceivablesToolbar model={m} />
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Não foi possível consultar os serviços. <button type="button"
      onClick={() => { void m.list.refetch(); void m.summary.refetch(); void m.upcoming.refetch(); }} className="underline">Tentar novamente</button></div> : null}
    {!m.periodError ? <ServiceReceivablesList model={m} onReceive={item => { m.payment.reset(); m.setSelected(item); }} onBolepix={m.setBolepixId} /> : null}
    {m.selected ? <FinancialPaymentModal sourceKind="RECEIVABLE" sourceId={m.selected.id!} poloId={m.selected.poloId}
      description={m.selected.descricao} partnerName={m.selected.clienteNome} accounts={accounts}
      readOnly={!canReceiveService(m.selected) || m.selectionMissing}
      historyOnly={!canReceiveService(m.selected) || m.selectionMissing}
      onClose={() => m.setSelected(null)} onConfirm={payload => m.payment.mutateAsync(payload)} /> : null}
    {m.bolepixId ? <OtherCreditPaymentModal receivableId={m.bolepixId} onClose={() => m.setBolepixId(null)} /> : null}
  </section>;
}
