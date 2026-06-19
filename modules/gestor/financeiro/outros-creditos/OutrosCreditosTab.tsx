// File: modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx

import React from 'react';
import { Hammer, TrendingUp } from 'lucide-react';

const OutrosCreditosTab: React.FC = () => {
  return (
    <div className="p-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-350 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
        <TrendingUp size={36} />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Outros Créditos</h4>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Submódulo em Desenvolvimento</p>
      </div>
      <p className="text-slate-400 text-xs max-w-md leading-relaxed font-medium">
        Este submódulo registrará receitas financeiras extraordinárias, rendimentos de aplicações bancárias, juros recebidos de clientes e outras entradas esporádicas.
      </p>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-sm">
        <Hammer size={12} className="text-amber-500 animate-bounce" /> Em estruturação
      </div>
    </div>
  );
};

export default OutrosCreditosTab;
