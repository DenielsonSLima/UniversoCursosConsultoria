import React from 'react';
import {
  CheckCircle2,
  Landmark,
  ReceiptText,
} from 'lucide-react';
import type { EmprestimoFinanceiro } from '../emprestimos.types';
import {
  emprestimoStatusClass,
  emprestimoStatusLabel,
  formatEmprestimoContaCredito,
  formatEmprestimoCurrency,
  formatEmprestimoDate,
  getEmprestimoNextParcela,
} from '../emprestimos.presentation';

interface EmprestimosTableProps {
  items: EmprestimoFinanceiro[];
  canSettle: boolean;
  onOpen: (item: EmprestimoFinanceiro) => void;
  onSettle: (item: EmprestimoFinanceiro) => void;
}

const EmprestimosTable: React.FC<EmprestimosTableProps> = ({
  items,
  canSettle,
  onOpen,
  onSettle,
}) => {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
        <Landmark size={46} className="mx-auto mb-4 opacity-30" />
        <p className="text-sm font-black uppercase tracking-wider">Nenhum empréstimo encontrado</p>
        <p className="mt-1 text-xs font-medium">Os contratos do polo responsável aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Contrato</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Liberação</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Conta do crédito</th>
            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">Dívida</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Próxima parcela</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((item) => {
            const nextParcela = getEmprestimoNextParcela(item);
            return (
              <tr key={item.id} className="group transition-colors hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(item)} className="max-w-[250px] text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <p className="truncate text-sm font-black text-[#001a33] hover:text-indigo-700">{item.descricao}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{item.credorNome || 'Credor não informado'}</p>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">{formatEmprestimoDate(item.dataLiberacao)}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                    Crédito: {formatEmprestimoCurrency(item.valorLiberado)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[210px] truncate text-xs font-semibold text-slate-600" title={formatEmprestimoContaCredito(item.contaCredito)}>
                    {formatEmprestimoContaCredito(item.contaCredito)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(item.valorTotalDivida)}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{item.totalParcelas || item.parcelas.length} parcelas</p>
                </td>
                <td className="px-4 py-3">
                  {nextParcela ? (
                    <>
                      <p className="text-sm font-semibold text-slate-700">{formatEmprestimoDate(nextParcela.dataVencimento)}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-indigo-600"><ReceiptText size={11} /> {formatEmprestimoCurrency(nextParcela.valorTotal)}</p>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Sem parcelas abertas</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${emprestimoStatusClass(item.status)}`}>
                    {emprestimoStatusLabel(item.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => onOpen(item)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600">Abrir</button>
                    {canSettle && nextParcela && (
                      <button
                        type="button"
                        onClick={() => onSettle(item)}
                        title="Selecionar parcelas para dar baixa"
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wide text-indigo-600 transition-colors hover:bg-indigo-100"
                      >
                        Baixar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EmprestimosTable;
