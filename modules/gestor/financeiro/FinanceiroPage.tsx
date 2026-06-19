// File: modules/gestor/financeiro/FinanceiroPage.tsx

import React, { useState } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, Layers, ArrowRightLeft, ShieldAlert
} from 'lucide-react';

// Submodule Tab Imports
import ResumoTab from './resumo/ResumoTab';
import ReceberTab from './receber/ReceberTab';
import DespesasTab from './despesas/DespesasTab';
import TransferenciasTab from './transferencias/TransferenciasTab';
import OutrosDebitosTab from './outros-debitos/OutrosDebitosTab';
import OutrosCreditosTab from './outros-creditos/OutrosCreditosTab';

type FinancialTab = 'resumo' | 'receber' | 'despesas' | 'transferencias' | 'outros-debitos' | 'outros-creditos';

const FinanceiroPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FinancialTab>('resumo');

  const tabs = [
    { id: 'resumo' as const, label: 'Resumo', icon: <Layers size={14} />, colorClass: 'bg-[#001a33] text-white shadow-md' },
    { id: 'receber' as const, label: 'Contas a Receber', icon: <TrendingUp size={14} />, colorClass: 'bg-emerald-600 text-white shadow-md' },
    { id: 'despesas' as const, label: 'Despesas', icon: <TrendingDown size={14} />, colorClass: 'bg-rose-600 text-white shadow-md' },
    { id: 'transferencias' as const, label: 'Transferências', icon: <ArrowRightLeft size={14} />, colorClass: 'bg-slate-800 text-white shadow-md' },
    { id: 'outros-debitos' as const, label: 'Outros Débitos', icon: <TrendingDown size={14} className="rotate-90 text-rose-500" />, colorClass: 'bg-indigo-600 text-white shadow-md' },
    { id: 'outros-creditos' as const, label: 'Outros Créditos', icon: <TrendingUp size={14} className="-rotate-90 text-emerald-500" />, colorClass: 'bg-teal-600 text-white shadow-md' },
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'resumo':
        return <ResumoTab />;
      case 'receber':
        return <ReceberTab />;
      case 'despesas':
        return <DespesasTab />;
      case 'transferencias':
        return <TransferenciasTab />;
      case 'outros-debitos':
        return <OutrosDebitosTab />;
      case 'outros-creditos':
        return <OutrosCreditosTab />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-10 mb-8 relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
         <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-blue-600/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

         <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                 <span className="bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase border border-emerald-500/30 flex items-center gap-2">
                   <DollarSign size={12} className="text-emerald-400" /> Finanças da Instituição
                 </span>
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">Módulo Financeiro</h2>
              <p className="text-slate-300 font-medium max-w-xl text-sm leading-relaxed">
                Acompanhe o resumo de mensalidades e controle de caixas de forma integrada com busca rápida de contas de alunos.
              </p>
            </div>
         </div>
      </div>

      {/* ABA DE NAVEGAÇÃO PRINCIPAL */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-transparent ${
                isActive 
                  ? tab.colorClass 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTEÚDO PRINCIPAL DAS ABAS */}
      <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-xl min-h-[450px]">
        {renderActiveTab()}
      </div>
    </div>
  );
};

export default FinanceiroPage;
