
import React from 'react';
import { Building2, ArrowRight, Wallet } from 'lucide-react';

interface CompanySelectionProps {
  companies: any[];
  onSelect: (company: any) => void;
}

const CompanySelection: React.FC<CompanySelectionProps> = ({ companies, onSelect }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {companies.map((company) => (
        <div 
          key={company.id}
          onClick={() => onSelect(company)}
          className="group bg-white rounded-[2rem] border border-slate-100 p-6 cursor-pointer hover:border-teal-300 hover:shadow-xl hover:shadow-teal-900/10 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between"
        >
          {/* Header Card */}
          <div>
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                <Building2 size={24} />
              </div>
              <div className="bg-slate-50 px-2 py-1 rounded-md border border-slate-100 group-hover:bg-teal-50 group-hover:border-teal-100 transition-colors">
                <span className="text-[10px] font-bold text-slate-500 uppercase group-hover:text-teal-700">
                  {company.contasCount} Contas
                </span>
              </div>
            </div>

            <h3 className="text-lg font-black text-[#001a33] mb-1 group-hover:text-teal-700 transition-colors relative z-10">
              {company.nomeFantasia}
            </h3>
            <p className="text-xs text-slate-500 font-medium relative z-10 mb-6">
              CNPJ: {company.cnpj}
            </p>
          </div>

          {/* Footer Card */}
          <div className="pt-4 border-t border-slate-100 relative z-10 flex items-center gap-2">
            <button 
              className="flex-1 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400 group-hover:text-teal-600 transition-colors"
            >
              <span>Definir Saldos</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Decorative BG */}
          <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-teal-50 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-2xl"></div>
        </div>
      ))}
    </div>
  );
};

export default CompanySelection;
