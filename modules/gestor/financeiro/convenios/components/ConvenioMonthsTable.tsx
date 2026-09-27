import React from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import type { ConvenioFinanceiroMes } from '../convenios.types';
import {
  convenioStatusClass,
  convenioStatusLabel,
  formatConvenioCompetencia,
  formatConvenioCurrency,
} from '../convenios.presentation';

interface ConvenioMonthsTableProps {
  items: ConvenioFinanceiroMes[];
  onOpen: (mes: ConvenioFinanceiroMes) => void;
  onCloseMonth: (mes: ConvenioFinanceiroMes) => void;
}

const ConvenioMonthsTable: React.FC<ConvenioMonthsTableProps> = ({ items, onOpen, onCloseMonth }) => {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
      <table className="w-full text-left">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            {['Convênio', 'Competência', 'Créditos', 'Despesas', 'Saldo projetado', 'Status', 'Ações'].map((label) => <th key={label} className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((mes) => (
            <tr key={mes.id} className="transition-colors hover:bg-slate-50/70">
              <td className="px-4 py-3"><button type="button" onClick={() => onOpen(mes)} className="max-w-[240px] text-left"><span className="block truncate text-sm font-black text-[#001a33]">{mes.nome}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{mes.parceiroNome || mes.poloNome}</span></button></td>
              <td className="px-4 py-3 text-xs font-bold text-slate-700">{formatConvenioCompetencia(mes.competencia)}</td>
              <td className="px-4 py-3 text-sm font-black text-emerald-700">{formatConvenioCurrency(mes.creditos)}</td>
              <td className="px-4 py-3"><span className="block text-sm font-black text-rose-700">{formatConvenioCurrency(mes.despesasPagas)}</span><span className="text-[9px] font-bold text-amber-700">{formatConvenioCurrency(mes.despesasPendentes)} pendente</span></td>
              <td className={`px-4 py-3 text-sm font-black ${mes.saldoProjetado < 0 ? 'text-rose-700' : 'text-[#001a33]'}`}>{formatConvenioCurrency(mes.saldoProjetado)}</td>
              <td className="px-4 py-3"><span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${convenioStatusClass(mes.status)}`}>{convenioStatusLabel(mes.status)}</span></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2">{mes.status === 'ABERTO' ? <button type="button" onClick={() => onCloseMonth(mes)} aria-label={`Finalizar ${mes.nome}`} className="rounded-lg border border-cyan-200 p-2 text-cyan-800 hover:bg-cyan-50"><LockKeyhole size={14} /></button> : null}<button type="button" onClick={() => onOpen(mes)} aria-label={`Abrir ${mes.nome}`} className="rounded-lg bg-[#001a33] p-2 text-white hover:bg-blue-950"><ArrowRight size={14} /></button></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ConvenioMonthsTable;
