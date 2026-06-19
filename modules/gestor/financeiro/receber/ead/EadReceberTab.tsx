// File: modules/gestor/financeiro/receber/ead/EadReceberTab.tsx

import React from 'react';
import { Hammer, Laptop } from 'lucide-react';

const EadReceberTab: React.FC = () => {
  return (
    <div className="p-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-350 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
        <Laptop size={36} />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Cursos EAD — Recebíveis</h4>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Submódulo em Desenvolvimento</p>
      </div>
      <p className="text-slate-400 text-xs max-w-md leading-relaxed font-medium">
        Este submódulo será integrado com a plataforma de ensino a distância para automação de matrículas e liberação financeira automática de acessos.
      </p>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-sm">
        <Hammer size={12} className="text-amber-500 animate-bounce" /> Em sincronia com a plataforma EAD
      </div>
    </div>
  );
};

export default EadReceberTab;
