import React from 'react';
import { ArrowRightLeft, ChevronLeft, ChevronRight, Landmark, Loader2 } from 'lucide-react';
import type { TransferenciaConta } from '../../financeiro.service';

interface TransferenciasListProps {
  isLoading: boolean;
  isError: boolean;
  transferencias: TransferenciaConta[];
  pageItems: TransferenciaConta[];
  currentPage: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  openReverseModal: (transfer: TransferenciaConta) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

export default function TransferenciasList({
  isLoading, isError, transferencias, pageItems, currentPage, totalPages, setPage, openReverseModal,
}: TransferenciasListProps) {
  return (
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 className="animate-spin text-[#001a33]" size={22} />
            <span className="text-sm font-bold text-slate-500">Carregando transferências...</span>
          </div>
        ) : isError ? (
          <div className="py-20 text-center text-sm font-bold text-rose-700">
            Não foi possível carregar as transferências.
          </div>
        ) : transferencias.length === 0 ? (
          <div className="py-20 text-center">
            <ArrowRightLeft className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-black uppercase tracking-wider text-slate-500">Nenhuma transferência encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Data / descrição', 'Origem', 'Destino', 'Valor', 'Ações'].map((head) => (
                    <th key={head} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((transfer, index) => (
                  <tr
                    key={transfer.id}
                    className={`${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#eef6ff]'
                    } transition-colors hover:bg-[#dfeeff]`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-xs font-black text-[#001a33]">{formatDate(transfer.dataTransferencia)}</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{transfer.observacao || 'Transferência interna'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                          <Landmark size={16} />
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase text-[#001a33]">{transfer.contaOrigemNome}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {transfer.poloNome || 'Polo não informado'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            Ag. {transfer.contaOrigemAgencia || '-'} / Conta {transfer.contaOrigemConta || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <Landmark size={16} />
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase text-[#001a33]">{transfer.contaDestinoNome}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {transfer.poloDestinoNome || 'Polo não informado'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            Ag. {transfer.contaDestinoAgencia || '-'} / Conta {transfer.contaDestinoConta || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-lg font-black text-[#001a33]">{formatCurrency(transfer.valor)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openReverseModal(transfer)}
                          className="inline-flex items-center gap-1 rounded-xl border border-amber-200 px-3 py-2 text-[10px] font-black uppercase text-amber-700 hover:bg-amber-50"
                        >
                          <ArrowRightLeft size={13} /> Estornar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-400">
            Mostrando {pageItems.length} de {transferencias.length} lançamento(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-slate-500">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

  );
}
