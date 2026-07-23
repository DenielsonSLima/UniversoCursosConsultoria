import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContasReceber } from '../../../financeiro.service';
import { financeiroService } from '../../../financeiro.service';
import {
  FinancialReportColumn,
  FinancialReportFilter,
  FinancialReportRow,
  FinancialReportStatusBadge,
  FinancialReportSummaryCard,
} from '../../../components/FinancialReportPreview';
import type {
  CourseModality,
  GroupMode,
  ReceivableStatusCounts,
  StatusScope,
} from './modalidade-receber.types';
import { formatEnrollment } from './modalidade-receber.enrollment';
import {
  formatCurrency,
  formatOptionalCurrency,
  formatReceivableDate,
  getPersistedGatewayFee,
  getPersistedGatewayNet,
  groupModeLabels,
  paymentGatewayLabel,
  paymentMethodLabel,
  statusScopeLabels,
} from './modalidade-receber.utils';

interface ReportToast {
  error: (title: string, message?: string) => void;
}

interface UseModalidadeReceberReportParams {
  modality: CourseModality;
  poloId?: string | null;
  title: string;
  search: string;
  debouncedSearch: string;
  dueStart: string;
  dueEnd: string;
  statusScope: StatusScope;
  groupMode: GroupMode;
  statusCounts: ReceivableStatusCounts;
  toast: ReportToast;
}

export const useModalidadeReceberReport = ({
  modality,
  poloId,
  title,
  search,
  debouncedSearch,
  dueStart,
  dueEnd,
  statusScope,
  groupMode,
  statusCounts,
  toast,
}: UseModalidadeReceberReportParams) => {
  const [receivables, setReceivables] = useState<ContasReceber[] | null>(null);

  useEffect(() => {
    setReceivables(null);
  }, [debouncedSearch, dueStart, dueEnd, statusScope, modality, poloId]);

  const loadReceivables = useCallback(async () => {
    try {
      const rows = await financeiroService.getReceivablesExportByModality(modality, {
        poloId: poloId || undefined,
        search: search.trim(),
        dueStart,
        dueEnd,
        statusScope,
      });
      setReceivables(rows);
    } catch (error: any) {
      toast.error('Erro ao preparar o extrato', error?.message || 'Não foi possível carregar todos os registros do relatório.');
      throw error;
    }
  }, [dueEnd, dueStart, modality, poloId, search, statusScope, toast]);

  const reportPoloId = useMemo(() => {
    if (poloId && poloId !== 'todos') return poloId;
    if (typeof window === 'undefined') return undefined;
    return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || undefined;
  }, [poloId]);

  const columns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Aluno' },
    { label: 'Cobrança' },
    { label: 'Turma / unidade' },
    { label: 'Vencimento' },
    { label: 'Situação', align: 'center' },
    { label: 'Valor', align: 'right' },
  ], []);

  const rows = useMemo<FinancialReportRow[]>(() => (receivables || []).map((item) => ({
    id: item.id || `${item.clienteId}-${item.dataVencimento}-${item.descricao}`,
    cells: [
      <div>
        <p className="font-black text-[#001a33]">{item.clienteNome || 'Aluno não informado'}</p>
        <p className="mt-0.5 text-slate-500">CPF: {item.clienteCpfCnpj || 'não informado'}</p>
        <p className="mt-0.5 font-bold text-slate-500">Matrícula: {formatEnrollment(item)}</p>
      </div>,
      <div>
        <p className="font-bold text-slate-700">{item.descricao}</p>
        <p className="mt-0.5 font-black uppercase tracking-wider text-slate-400">
          {item.tipoLancamento || 'Mensalidade'} {item.parcelaNumero !== undefined ? `· Parcela ${item.parcelaNumero}` : ''}
        </p>
        {item.asaasInvoiceUrl && item.status !== 'PAGO' ? (
          <p className="mt-0.5 font-bold text-blue-600">Cobrança {paymentGatewayLabel(item)} vinculada</p>
        ) : null}
      </div>,
      <div>
        <p className="font-bold text-slate-700">{item.turmaNome || item.cursoNome || 'Turma não informada'}</p>
        <p className="mt-0.5 font-bold uppercase tracking-wide text-slate-500">{item.poloNome || 'Unidade não informada'}</p>
        <p className="mt-0.5 text-slate-400">{item.poloCidade || 'Cidade não informada'} / {item.poloUf || 'UF'}</p>
      </div>,
      <div>
        <p className="font-bold text-slate-700">{formatReceivableDate(item.dataVencimento)}</p>
        {item.status === 'PAGO' ? (
          <p className="mt-0.5 font-bold text-emerald-700">Pago em {formatReceivableDate(item.dataPagamento || '')}</p>
        ) : null}
        <p className="mt-0.5 text-slate-500">{paymentMethodLabel(item)}</p>
      </div>,
      <FinancialReportStatusBadge status={item.status} />,
      <div>
        <p className="font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        <p className="mt-1 text-[9px] font-bold text-slate-500">Taxa: {formatOptionalCurrency(getPersistedGatewayFee(item), 'Não informado')}</p>
        <p className="text-[9px] font-bold text-emerald-700">Líquido: {formatOptionalCurrency(getPersistedGatewayNet(item), 'Não informado')}</p>
        {item.valorPago !== undefined ? (
          <p className="mt-1 whitespace-nowrap text-[10px] font-bold text-emerald-700">Rec.: {formatCurrency(item.valorPago)}</p>
        ) : null}
      </div>,
    ],
  })), [receivables]);

  const totals = useMemo(() => {
    const source = receivables || [];
    const total = source.reduce((sum, item) => sum + item.valor, 0);
    const recebido = source
      .filter((item) => item.status === 'PAGO')
      .reduce((sum, item) => sum + (item.valorPago ?? item.valor), 0);
    const aReceber = source
      .filter((item) => ['PENDENTE', 'VENCIDO', 'SUSPENSO'].includes(item.status))
      .reduce((sum, item) => sum + item.valor, 0);
    const vencidos = source.filter((item) => item.status === 'VENCIDO').length;
    return { total, recebido, aReceber, vencidos };
  }, [receivables]);

  const expectedCount = receivables?.length ?? (
    statusScope === 'pending'
      ? statusCounts.pending
      : statusScope === 'received'
        ? statusCounts.received
        : statusScope === 'canceled'
          ? statusCounts.canceled
          : statusCounts.all
  );

  const filters = useMemo<FinancialReportFilter[]>(() => {
    const filterDate = (value?: string) => value ? formatReceivableDate(value) : 'Sem limite';
    return [
      { label: 'Modalidade', value: title },
      { label: 'Situação', value: statusScopeLabels[statusScope] },
      { label: 'Busca', value: search.trim() || 'Todos os alunos' },
      { label: 'Vencimento', value: `${filterDate(dueStart)} até ${filterDate(dueEnd)}` },
      { label: 'Agrupamento', value: groupModeLabels[groupMode] },
      { label: 'Registros', value: `${expectedCount} cobrança(s)` },
    ];
  }, [dueEnd, dueStart, expectedCount, groupMode, search, statusScope, title]);

  const summaryCards = useMemo<FinancialReportSummaryCard[]>(() => [
    { label: 'Total previsto', value: formatCurrency(totals.total), tone: 'slate' },
    { label: 'Recebido', value: formatCurrency(totals.recebido), tone: 'emerald' },
    { label: 'A receber', value: formatCurrency(totals.aReceber), tone: 'amber' },
    { label: 'Vencidos', value: totals.vencidos, tone: 'rose' },
  ], [totals]);

  return {
    columns,
    rows,
    filters,
    summaryCards,
    reportPoloId,
    loadReceivables,
  };
};

export type ModalidadeReceberReport = ReturnType<typeof useModalidadeReceberReport>;
