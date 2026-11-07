// File: modules/gestor/financeiro/despesas/DespesasTab.tsx

import React, { useState } from 'react';
import { Building, ShoppingBag } from 'lucide-react';
import DespesasFixasTab from './fixas/DespesasFixasTab';
import DespesasVariaveisTab from './variaveis/DespesasVariaveisTab';
import FinancialUnderlineTabs from '../components/FinancialUnderlineTabs';

type ExpenseType = 'fixas' | 'variaveis';

interface DespesasTabProps {
  poloId?: string | null;
}

const DespesasTab: React.FC<DespesasTabProps> = ({ poloId }) => {
  const [activeExpenseTab, setActiveExpenseTab] = useState<ExpenseType>('fixas');
  const [actionsContainer, setActionsContainer] = useState<HTMLDivElement | null>(null);

  const subtabs = [
    { id: 'fixas' as const, label: 'Despesas fixas', icon: <Building size={14} /> },
    { id: 'variaveis' as const, label: 'Despesas variáveis', icon: <ShoppingBag size={14} /> },
  ];

  const renderSubTab = () => {
    switch (activeExpenseTab) {
      case 'fixas':
        return <DespesasFixasTab poloId={poloId} actionsContainer={actionsContainer} />;
      case 'variaveis':
        return <DespesasVariaveisTab poloId={poloId} actionsContainer={actionsContainer} />;
      default:
        return null;
    }
  };

  return (
    <div className="financial-section-workspace space-y-6 animate-fadeIn">
      <h3 className="sr-only">Contas a Pagar</h3>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <FinancialUnderlineTabs
            compact
            items={subtabs}
            value={activeExpenseTab}
            onChange={setActiveExpenseTab}
            ariaLabel="Tipos de despesas"
            indicatorClassName="bg-rose-600"
            activeIconClassName="text-rose-600"
          />
        </div>
        <div ref={setActionsContainer} className="ml-auto shrink-0" />
      </div>

      <div>
        {renderSubTab()}
      </div>
    </div>
  );
};

export default DespesasTab;
