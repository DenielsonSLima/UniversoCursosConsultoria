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
  ReceivableKpis,
  ReceivableStatusCounts,
  StatusScope,
} from './modalidade-receber.types';
import { formatEnrollment } from './modalidade-receber.enrollment';
import {
  formatCurrency,
  formatReceivableDate,
  paymentGatewayLabel,
  paymentMethodLabel,
  paymentOriginLabel,
  receivableClassLabel,
  receivableCourseTitle,
  receivableLaunchLabel,
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
  turmaId: string;
  turmaLabel: string;
  kpis: ReceivableKpis;
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
  turmaId,
  turmaLabel,
  kpis,
  statusCounts,
  toast,
}: UseModalidadeReceberReportParams) => {
  const [receivables, setReceivables] = useState<ContasReceber[] | null>(null);

  useEffect(() => {
    setReceivables(null);
  }, [debouncedSearch, dueStart, dueEnd, statusScope, turmaId, modality, poloId]);

  const loadReceivables = useCallback(async () => {
    try {
      const rows = await financeiroService.getReceivablesExportByModality(modality, {
        poloId: poloId || undefined,
        turmaId: turmaId || undefined,
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
  }, [dueEnd, dueStart, modality, poloId, search, statusScope, toast, turmaId]);

  const reportPoloId = useMemo(() => {
    if (poloId && poloId !== 'todos') return poloId;
    if (typeof window === 'undefined') return undefined;
    return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || undefined;
  }, [poloId]);

  const columns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Aluno' },
    { label: 'Curso / turma' },
    { label: 'Parcela', align: 'center' },
    { label: 'Recebimento' },
    { label: 'Datas' },
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
        <p className="font-black text-[#001a33]">{receivableCourseTitle(item)}</p>
        {receivableClassLabel(item) ? (
          <p className="mt-0.5 font-bold text-slate-500">Turma: {receivableClassLabel(item)}</p>
        ) : null}
        {item.asaasInvoiceUrl && item.status !== 'PAGO' ? (
          <p className="mt-0.5 font-bold text-blue-600">Cobrança {paymentGatewayLabel(item)} vinculada</p>
        ) : null}
      </div>,
      <div className="text-center">
        <p className="font-black text-[#001a33]">
          {receivableLaunchLabel(item, 'fraction')}
        </p>
        {item.tipoLancamento && !['PARCELA', 'MATRICULA', 'REMATRICULA', 'DEPENDENCIA'].includes(item.tipoLancamento) ? (
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {item.tipoLancamento}
          </p>
        ) : null}
      </div>,
      <div>
        <p className="text-slate-500">Forma: {paymentMethodLabel(item)}</p>
        <p className="mt-0.5 text-slate-500">Origem: {paymentOriginLabel(item)}</p>
      </div>,
      <div>
        <p className="text-slate-500">Emissão: {formatReceivableDate(item.dataEmissao || '')}</p>
        <p className="mt-0.5 font-bold text-slate-700">Venc.: {formatReceivableDate(item.dataVencimento)}</p>
        {item.status === 'PAGO' ? (
          <p className="mt-0.5 font-bold text-emerald-700">Pago: {formatReceivableDate(item.dataPagamento || '')}</p>
        ) : null}
      </div>,
      <FinancialReportStatusBadge status={item.status} />,
      <div>
        <p className="font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        {typeof item.descontoAplicado === 'number' && item.descontoAplicado > 0 ? (
          <p className="mt-1 text-[9px] font-bold text-emerald-700">
            Desconto: {formatCurrency(item.descontoAplicado)}
          </p>
        ) : null}
        {typeof item.jurosAplicados === 'number' && item.jurosAplicados > 0 ? (
          <p className="text-[9px] font-bold text-amber-700">
            Juros: {formatCurrency(item.jurosAplicados)}
          </p>
        ) : null}
        {typeof item.multaAplicada === 'number' && item.multaAplicada > 0 ? (
          <p className="text-[9px] font-bold text-rose-700">
            Multa: {formatCurrency(item.multaAplicada)}
          </p>
        ) : null}
        {item.valorPago !== undefined ? (
          <p className="mt-1 whitespace-nowrap text-[10px] font-bold text-emerald-700">
            Recebido: {formatCurrency(item.valorPago)}
          </p>
        ) : null}
      </div>,
    ],
  })), [receivables]);

  const expectedCount = receivables?.length ?? (
    statusScope === 'pending'
      ? statusCounts.pending
      : statusScope === 'received'
        ? statusCounts.received
        : statusScope === 'overdue'
          ? statusCounts.overdue
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
      { label: 'Turma', value: turmaLabel || 'Todas as turmas' },
      { label: 'Registros', value: `${expectedCount} cobrança(s)` },
    ];
  }, [dueEnd, dueStart, expectedCount, search, statusScope, title, turmaLabel]);

  const summaryCards = useMemo<FinancialReportSummaryCard[]>(() => [
    { label: 'Total previsto', value: formatCurrency(kpis.total), tone: 'slate' },
    { label: 'Recebido', value: formatCurrency(kpis.recebido), tone: 'emerald' },
    { label: 'A receber', value: formatCurrency(kpis.aReceber), tone: 'amber' },
    { label: 'Vencidos', value: kpis.vencidos, tone: 'rose' },
  ], [kpis]);

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
