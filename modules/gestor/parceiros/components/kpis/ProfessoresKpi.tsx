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
    <div className="relative overflow-hidden bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all duration-300 group flex flex-col justify-center">
      <div className="relative z-10 w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100/50">
            <Users size={18} />
          </div>
          <p className="text-slate-500 text-xs font-medium">Professores</p>
        </div>
        <div className="flex items-end justify-between">
          <h3 className="text-3xl font-bold text-[#001a33] tracking-tight leading-none">{total}</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-2.5 py-1 rounded-lg border border-purple-100/50">
              {ativos} Ativos
            </span>
            <span className="text-[10px] font-bold bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-100">
              {inativos} Inativos
            </span>
          </div>
        </div>
      </div>
      {/* Elemento Decorativo */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 text-purple-500/5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
        <Users size={120} />
      </div>
    </div>
  );
};

export default ProfessoresKpi;
