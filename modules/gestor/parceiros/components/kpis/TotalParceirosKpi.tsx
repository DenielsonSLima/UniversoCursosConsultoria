// File: modules/gestor/parceiros/components/kpis/TotalParceirosKpi.tsx

import React from 'react';
import { Building2, TrendingUp } from 'lucide-react';

interface TotalParceirosKpiProps {
  total: number;
}

const TotalParceirosKpi: React.FC<TotalParceirosKpiProps> = ({ total }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#001a33] to-[#003366] p-5 rounded-3xl text-white shadow-xl shadow-blue-900/10 group flex flex-col justify-center">
      <div className="relative z-10 w-full">
        <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                <Building2 size={18} className="text-blue-300" />
            </div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">Total de Parceiros</p>
        </div>
        <div className="flex items-end justify-between">
          <h3 className="text-3xl font-black tracking-tight leading-none">{total}</h3>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg">
            <TrendingUp size={12} /> {total} Ativos
          </span>
        </div>
      </div>
      {/* Elemento Decorativo */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 text-white/5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
        <Building2 size={120} />
      </div>
    </div>
  );
};

export default TotalParceirosKpi;
