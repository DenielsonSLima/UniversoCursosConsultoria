import type React from 'react';
import { ReceiptText, WalletCards } from 'lucide-react';
import {
  dashboardSettlementGuidance,
  getDashboardSettlementBlock,
  type DashboardStudentReceivable,
} from './dashboard-student-finance.model';

interface DashboardStudentFinanceResultsProps {
  receivables: DashboardStudentReceivable[];
  activePoloId?: string | null;
  canSettle: boolean;
  onSettle: (receivable: DashboardStudentReceivable) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (dateValue: string) => {
  if (!dateValue) return 'Sem vencimento';
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-BR');
};

const getStatusTone = (status: string) => {
  if (status === 'PAGO') return 'bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700';
  if (status === 'PENDENTE') return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
};

const DashboardStudentFinanceResults: React.FC<DashboardStudentFinanceResultsProps> = ({
  receivables,
  activePoloId,
  canSettle,
  onSettle,
}) => {
  if (receivables.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">
        <ReceiptText size={22} className="mx-auto text-slate-300" />
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Nenhuma parcela encontrada para essa busca.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {receivables.map((receivable) => {
        const settlementBlock = getDashboardSettlementBlock(
          receivable,
          canSettle,
          activePoloId,
        );

        return (
          <article key={receivable.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-[#001a33]">{receivable.clienteNome}</h3>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  CPF: {receivable.clienteCpf || 'não informado'} • {receivable.poloNome || 'unidade não informada'}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-600">{receivable.descricao}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {receivable.hasRemoteCharge && (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                      Título bancário integrado
                    </span>
                  )}
                  {receivable.tipoLancamento && (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                      {receivable.tipoLancamento}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-sm font-bold text-[#001a33]">{formatCurrency(receivable.valor)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  Vence em {formatDate(receivable.dataVencimento)}
                </p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${getStatusTone(receivable.status)}`}>
                  {receivable.status}
                </span>
              </div>
            </div>

            {canSettle && settlementBlock === null && (
              <button
                type="button"
                onClick={() => onSettle(receivable)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-700 sm:w-auto"
              >
                <WalletCards size={15} />
                Registrar baixa
              </button>
            )}

            {canSettle && settlementBlock && settlementBlock !== 'permission' && (
              <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[10px] font-bold leading-4 text-amber-800">
                {dashboardSettlementGuidance(settlementBlock)}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default DashboardStudentFinanceResults;
