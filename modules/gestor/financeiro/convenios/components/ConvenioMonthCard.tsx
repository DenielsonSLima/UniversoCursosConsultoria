import React from 'react';
import { ArrowRight, CalendarDays, Handshake, LockKeyhole, Trash2 } from 'lucide-react';
import type { ConvenioFinanceiroMes } from '../convenios.types';
import {
  convenioStatusClass,
  convenioStatusLabel,
  formatConvenioCompetencia,
  formatConvenioCurrency,
} from '../convenios.presentation';

interface ConvenioMonthCardProps {
  mes: ConvenioFinanceiroMes;
  onOpen: (mes: ConvenioFinanceiroMes) => void;
  onCloseMonth: (mes: ConvenioFinanceiroMes) => void;
  onDelete: (mes: ConvenioFinanceiroMes) => void;
}

const ConvenioMonthCard: React.FC<ConvenioMonthCardProps> = ({ mes, onOpen, onCloseMonth, onDelete }) => (
  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
    <div className="border-b border-slate-100 bg-gradient-to-br from-cyan-50/80 via-white to-white p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(mes)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700"><Handshake size={13} /> Convênio</p>
          <h4 className="mt-1 truncate text-base font-black uppercase tracking-tight text-[#001a33]">{mes.nome}</h4>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{mes.parceiroNome || mes.poloNome}</p>
        </button>
        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${convenioStatusClass(mes.status)}`}>
          {convenioStatusLabel(mes.status)}
        </span>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs font-black text-slate-700"><CalendarDays size={14} className="text-cyan-700" /> {formatConvenioCompetencia(mes.competencia)}</p>
    </div>

    <button type="button" onClick={() => onOpen(mes)} className="grid grid-cols-2 gap-2 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500">
      {[
        ['Saldo inicial', mes.saldoInicial, 'text-slate-800'],
        ['Créditos', mes.creditos, 'text-emerald-700'],
        ['Despesas pagas', mes.despesasPagas, 'text-rose-700'],
        ['Comprometido', mes.despesasPendentes, 'text-amber-700'],
      ].map(([label, value, color]) => (
        <span key={String(label)} className="rounded-xl bg-slate-50 p-3">
          <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</span>
          <strong className={`mt-1 block text-sm font-black ${color}`}>{formatConvenioCurrency(Number(value))}</strong>
        </span>
      ))}
    </button>

    <div className="mt-auto border-t border-slate-100 px-5 py-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <span>
          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Saldo projetado</span>
          <strong className={`mt-1 block text-lg font-black ${mes.saldoProjetado < 0 ? 'text-rose-700' : 'text-[#001a33]'}`}>{formatConvenioCurrency(mes.saldoProjetado)}</strong>
        </span>
        <span className="text-right text-[9px] font-bold uppercase tracking-wide text-slate-400">{mes.quantidadeDespesas} despesa(s)</span>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onDelete(mes)} aria-label={`Excluir convênio ${mes.nome}`} className="mr-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-700 hover:bg-rose-50"><Trash2 size={13} /> Excluir</button>
        {mes.status === 'ABERTO' ? (
          <button type="button" onClick={() => onCloseMonth(mes)} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-cyan-800 hover:bg-cyan-100"><LockKeyhole size={13} /> Finalizar</button>
        ) : null}
        <button type="button" onClick={() => onOpen(mes)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-blue-950">Abrir <ArrowRight size={13} /></button>
      </div>
    </div>
  </article>
);

export default ConvenioMonthCard;
