import React from 'react';
import { CircleDollarSign, HandCoins, Landmark, ReceiptText, WalletCards } from 'lucide-react';
import type { ConveniosResumo } from '../convenios.types';
import { formatConvenioCurrency } from '../convenios.presentation';

const ConveniosKpis: React.FC<{ resumo: ConveniosResumo }> = ({ resumo }) => {
  const items = [
    { label: 'Saldo inicial', value: formatConvenioCurrency(resumo.saldoInicial), icon: Landmark, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Créditos', value: formatConvenioCurrency(resumo.creditos), icon: HandCoins, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Despesas pagas', value: formatConvenioCurrency(resumo.despesasPagas), icon: ReceiptText, tone: 'bg-rose-50 text-rose-700' },
    { label: 'Comprometido', value: formatConvenioCurrency(resumo.despesasPendentes), icon: CircleDollarSign, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Saldo projetado', value: formatConvenioCurrency(resumo.saldoProjetado), icon: WalletCards, tone: resumo.saldoProjetado < 0 ? 'bg-rose-50 text-rose-700' : 'bg-cyan-50 text-cyan-800' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="flex min-h-24 items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 truncate text-base font-black text-[#001a33]">{value}</p></div>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
        </div>
      ))}
    </div>
  );
};

export default ConveniosKpis;
