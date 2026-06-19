// File: modules/gestor/financeiro/receber/livres/LivresReceberTab.tsx

import React from 'react';
import { Hammer, Calendar, Award } from 'lucide-react';

const LivresReceberTab: React.FC = () => {
  return (
    <div className="p-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-350 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
        <Award size={36} />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Cursos Livres — Recebíveis</h4>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Submódulo em Desenvolvimento</p>
      </div>
      <p className="text-slate-400 text-xs max-w-md leading-relaxed font-medium">
        Este submódulo está sendo preparado para gerenciar todas as cobranças, boletos e conciliações financeiras dos alunos de Cursos Livres.
      </p>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-sm">
        <Hammer size={12} className="text-amber-500 animate-bounce" /> Em breve integração com Asaas
      </div>
    </div>
  );
};

export default LivresReceberTab;
