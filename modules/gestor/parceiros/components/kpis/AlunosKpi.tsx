// File: modules/gestor/parceiros/components/kpis/AlunosKpi.tsx

import React from 'react';
import { GraduationCap } from 'lucide-react';

interface AlunosKpiProps {
  total: number;
  ativos: number;
  inativos: number;
}

const AlunosKpi: React.FC<AlunosKpiProps> = ({ total, ativos, inativos }) => {
  return (
    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-emerald-100 transition-all duration-300 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:scale-110 pointer-events-none"></div>
      
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
             <GraduationCap size={18} />
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Desc. Alunos</p>
        </div>
        <h3 className="text-3xl font-black text-[#001a33] leading-none">{total}</h3>
      </div>
      
      <div className="relative z-10 flex items-center gap-5 mt-auto border-t border-slate-50 pt-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Ativos</span>
          <span className="text-sm font-bold text-emerald-600 leading-none">{ativos}</span>
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

export default AlunosKpi;
