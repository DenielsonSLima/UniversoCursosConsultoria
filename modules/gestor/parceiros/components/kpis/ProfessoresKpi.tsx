// File: modules/gestor/parceiros/components/kpis/ProfessoresKpi.tsx

import React from 'react';
import { Users } from 'lucide-react';

interface ProfessoresKpiProps {
  total: number;
  ativos: number;
  inativos: number;
}

const ProfessoresKpi: React.FC<ProfessoresKpiProps> = ({ total, ativos, inativos }) => {
  return (
    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-purple-100 transition-all duration-300 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/50 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:scale-110 pointer-events-none"></div>
      
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
             <Users size={18} />
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Professores</p>
        </div>
        <h3 className="text-3xl font-black text-[#001a33] leading-none">{total}</h3>
      </div>
      
      <div className="relative z-10 flex items-center gap-5 mt-auto border-t border-slate-50 pt-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Ativos</span>
          <span className="text-sm font-bold text-purple-600 leading-none">{ativos}</span>
        </div>
        <div className="w-px h-6 bg-slate-100"></div>
        <div className="flex flex-col">
           <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Inativos</span>
           <span className="text-sm font-bold text-slate-400 leading-none">{inativos}</span>
        </div>
      </div>
    </div>
  );
};

export default ProfessoresKpi;
