import React from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Landmark,
  ReceiptText,
  UsersRound,
  X,
} from 'lucide-react';
import type { EmprestimoFinanceiro, EmprestimoParcela } from '../emprestimos.types';

const formatCurrency = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
);

const formatDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—'
);

const statusClass = (status: string) => {
  if (status === 'PAGO' || status === 'QUITADO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'CANCELADO') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const statusLabel = (status: string) => (
  status === 'QUITADO' ? 'Quitado' : status.charAt(0) + status.slice(1).toLowerCase()
);

interface EmprestimoDetailsModalProps {
  emprestimo: EmprestimoFinanceiro;
  canSettle: boolean;
  onClose: () => void;
  onSettle: (parcela: EmprestimoParcela) => void;
}

const EmprestimoDetailsModal: React.FC<EmprestimoDetailsModalProps> = ({
  emprestimo,
  canSettle,
  onClose,
  onSettle,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm animate-fadeIn overscroll-contain">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-7 pb-4 pt-7">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
              <Landmark size={14} /> {emprestimo.rateioModo === 'SEM_RATEIO' ? 'Empréstimo próprio do polo' : 'Empréstimo centralizado com rateio'}
            </p>
            <h3 className="mt-1 truncate text-lg font-black uppercase tracking-tight text-[#001a33]">{emprestimo.descricao}</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Credor: {emprestimo.credorNome || 'Não informado'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar detalhes"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-7 py-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Crédito liberado', value: formatCurrency(emprestimo.valorLiberado), icon: CircleDollarSign, tone: 'text-emerald-600 bg-emerald-50' },
              { label: 'Total da dívida', value: formatCurrency(emprestimo.valorTotalDivida), icon: ReceiptText, tone: 'text-indigo-600 bg-indigo-50' },
              { label: 'Encargos informados', value: formatCurrency(emprestimo.valorEncargos), icon: Landmark, tone: 'text-amber-600 bg-amber-50' },
              { label: 'Parcelas', value: `${emprestimo.totalParcelas || emprestimo.parcelas.length}`, icon: CalendarDays, tone: 'text-slate-600 bg-slate-100' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon size={15} /></span>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-black text-[#001a33]">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(emprestimo.status)}`}>
              {statusLabel(emprestimo.status)}
            </span>
            <span className="text-xs font-semibold text-slate-600">Liberação: {formatDate(emprestimo.dataLiberacao)}</span>
            <span className="text-xs font-semibold text-slate-600">
              {emprestimo.rateioModo === 'SEM_RATEIO'
                ? 'Baixa é registrada pelo polo responsável.'
                : 'Baixa é registrada exclusivamente pela Matriz.'}
            </span>
          </div>

          {emprestimo.observacao && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Observação</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{emprestimo.observacao}</p>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <ReceiptText size={15} className="text-indigo-600" />
              <h4 className="text-xs font-black uppercase tracking-wide text-[#001a33]">
                {emprestimo.rateioModo === 'SEM_RATEIO' ? 'Parcelas próprias do polo' : 'Parcelas e rateio canônico'}
              </h4>
            </div>
            {emprestimo.parcelas.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm font-medium text-slate-400">
                Nenhuma parcela retornada pelo contrato financeiro.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {emprestimo.parcelas.map((parcela) => (
                  <div key={parcela.id} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-black text-indigo-700">{parcela.numero}</span>
                        <div>
                          <p className="text-sm font-black text-[#001a33]">Parcela {parcela.numero}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><Clock3 size={12} /> Vencimento: {formatDate(parcela.dataVencimento)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(parcela.status)}`}>
                          {statusLabel(parcela.status)}
                        </span>
                        <span className="text-base font-black text-[#001a33]">{formatCurrency(parcela.valorTotal)}</span>
                        {canSettle && (parcela.status === 'PENDENTE' || parcela.status === 'VENCIDO') && (
                          <button
                            type="button"
                            onClick={() => onSettle(parcela)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
                          >
                            <CheckCircle2 size={13} /> Dar baixa
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Principal: <strong className="text-[#001a33]">{formatCurrency(parcela.valorPrincipal)}</strong></p>
                      <p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Encargos: <strong className="text-[#001a33]">{formatCurrency(parcela.valorEncargos)}</strong></p>
                      <p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Pagamento: <strong className="text-[#001a33]">{formatDate(parcela.dataPagamento)}</strong></p>
                    </div>

                    {emprestimo.rateioModo !== 'SEM_RATEIO' && (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-700"><UsersRound size={12} /> Custo distribuído por polo</p>
                      {parcela.rateios.length === 0 ? (
                        <p className="text-xs font-medium text-slate-500">O rateio desta parcela ainda não foi retornado.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {parcela.rateios.map((rateio) => (
                            <div key={rateio.id || rateio.poloId} className="rounded-lg border border-white bg-white px-3 py-2 shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-bold text-slate-700">{rateio.poloNome || 'Polo'}</span>
                                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${statusClass(rateio.status)}`}>{statusLabel(rateio.status)}</span>
                              </div>
                              <p className="mt-1 text-sm font-black text-[#001a33]">{formatCurrency(rateio.valorTotal)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimoDetailsModal;
