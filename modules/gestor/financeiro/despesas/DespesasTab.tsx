// File: modules/gestor/financeiro/despesas/DespesasTab.tsx

import React, { useState } from 'react';
import { Building, ShoppingBag } from 'lucide-react';
import DespesasFixasTab from './fixas/DespesasFixasTab';
import DespesasVariaveisTab from './variaveis/DespesasVariaveisTab';

type ExpenseType = 'fixas' | 'variaveis';

const DespesasTab: React.FC = () => {
  const [activeExpenseTab, setActiveExpenseTab] = useState<ExpenseType>('fixas');

  const subtabs = [
    { id: 'fixas' as const, label: 'Despesas Fixas', icon: <Building size={14} /> },
    { id: 'variaveis' as const, label: 'Despesas Variáveis', icon: <ShoppingBag size={14} /> },
  ];

  const renderSubTab = () => {
    switch (activeExpenseTab) {
      case 'fixas':
        return <DespesasFixasTab />;
      case 'variaveis':
        return <DespesasVariaveisTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h3 className="text-xl font-black text-rose-600 uppercase tracking-tight mb-2">Despesas & Contas a Pagar</h3>
        <p className="text-slate-500 text-xs font-bold uppercase">Gestão operacional de custos fixos e variáveis.</p>
      </div>

      {/* Subtabs header */}
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveExpenseTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
              activeExpenseTab === tab.id
                ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                : 'text-slate-500 hover:bg-slate-50 border-transparent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {renderSubTab()}
      </div>
    </div>
  );
};

export default DespesasTab;
