import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FinancialReportColumn, FinancialReportFilter, FinancialReportRow, FinancialReportSummaryCard } from '../../components/FinancialReportPreview';
import { FinancialReportStatusBadge } from '../../components/FinancialReportPreview';
import { ReceivableAmountSummary } from '../components/modalidade-receber/ReceivableAmountSummary';
import { formatCurrency, formatReceivableDate, paymentMethodLabel, paymentOriginLabel } from '../components/modalidade-receber/modalidade-receber.utils';
import { serviceReceiptStatus } from './service-receivable.presentation';
import { serviceReceivablesService } from './servicos-receber.service';
import { serviceReceivablesKeys, type ServiceReceivablesExport, type ServiceReceivablesFilters } from './servicos-receber.contract';

const labels = { ALL: 'Todos', PENDING: 'Pendentes', UPCOMING: 'A vencer', RECEIVED: 'Recebidos', OVERDUE: 'Vencidos', CANCELLED: 'Cancelados' };
export const serviceReportColumns: FinancialReportColumn[] = [
  { label: 'Parceiro' }, { label: 'Serviço / NFS-e' }, { label: 'Parcela', align: 'center' }, { label: 'Recebimento' },
  { label: 'Datas' }, { label: 'Situação', align: 'center' }, { label: 'Valor', align: 'right' },
];

export function serviceReportRows(snapshot: ServiceReceivablesExport | null): FinancialReportRow[] {
  return (snapshot?.rows || []).map(item => ({ id: item.id!, cells: [
    <div><p className="font-black text-[#001a33]">{item.clienteNome || 'Parceiro'}</p><p>CPF/CNPJ: {item.clienteCpfCnpj || 'não informado'}</p><p>{item.poloNome}</p></div>,
    <div><p className="font-black text-[#001a33]">{item.nfseFiscalDescription || item.descricao}</p><p>{item.nfseNumber ? `NFS-e nº ${item.nfseNumber}` : 'NFS-e vinculada'}</p></div>,
    item.nfseInstallmentNumber && item.nfseInstallmentCount ? `${item.nfseInstallmentNumber}/${item.nfseInstallmentCount}` : '—',
    <div><p>Forma: {paymentMethodLabel(item)}</p><p>Origem: {paymentOriginLabel(item)}</p></div>,
    <div><p>Emissão: {formatReceivableDate(item.dataEmissao || '')}</p><p>Venc.: {formatReceivableDate(item.dataVencimento)}</p>
      {item.status === 'PAGO' ? <p>Pago: {formatReceivableDate(item.dataPagamento || '')}</p> : null}</div>,
    <FinancialReportStatusBadge status={item.status} label={serviceReceiptStatus(item)} />,
    <ReceivableAmountSummary item={item} compact />,
  ] }));
}

export function useServiceReceivablesReport(filters: ServiceReceivablesFilters) {
  const client = useQueryClient(), key = JSON.stringify(filters);
  const currentKey = useRef(key), mounted = useRef(true); currentKey.current = key;
  const [prepared, setPrepared] = useState<{ key: string; snapshot: ServiceReceivablesExport } | null>(null);
  const snapshot = prepared?.key === key ? prepared.snapshot : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const capturedKey = key;
    const next = await client.fetchQuery({ queryKey: serviceReceivablesKeys.export(filters),
      queryFn: ({ signal }) => serviceReceivablesService.exportSnapshot(filters, signal), staleTime: 0, gcTime: 0, retry: false });
    if (!mounted.current || currentKey.current !== capturedKey) throw new Error('Os filtros mudaram. Abra o extrato novamente.');
    setPrepared({ key: capturedKey, snapshot: next });
  }, [client, filters, key]);
  const rows = useMemo(() => serviceReportRows(snapshot), [snapshot]);
  const reportFilters: FinancialReportFilter[] = [
    { label: 'Origem', value: 'Serviços NFS-e' }, { label: 'Situação', value: labels[filters.statusScope] },
    { label: 'Busca', value: filters.search || 'Todos os parceiros' },
    { label: 'Vencimento', value: `${filters.dueStart ? formatReceivableDate(filters.dueStart) : 'Sem limite'} até ${filters.dueEnd ? formatReceivableDate(filters.dueEnd) : 'Sem limite'}` },
    { label: 'Unidade', value: filters.poloId && filters.poloId !== 'todos' ? 'Unidade selecionada' : 'Todas as unidades' },
    { label: 'Registros', value: snapshot ? `${snapshot.totalItems} cobrança(s)` : 'Preparando' },
  ];
  const totals = snapshot?.summary;
  const summaryCards: FinancialReportSummaryCard[] = totals ? [
    { label: 'Total previsto', value: formatCurrency(totals.allValue), tone: 'slate' },
    { label: 'Recebido', value: formatCurrency(totals.receivedValue), tone: 'emerald' },
    { label: 'A receber', value: formatCurrency(totals.pendingValue), tone: 'amber' },
    { label: 'Vencidos', value: totals.overdueCount, tone: 'rose' },
  ] : [];
  return { load, rows, filters: reportFilters, summaryCards, issuedAt: snapshot ? new Date(snapshot.generatedAt) : undefined,
    poloId: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : undefined };
}

