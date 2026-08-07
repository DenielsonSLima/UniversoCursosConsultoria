// File: modules/gestor/financeiro/FinanceiroPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  FileText,
  Landmark,
  Layers,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { FinanceiroTabId } from '../access-control';

// Submodule Tab Imports
import ResumoTab from './resumo/ResumoTab';
import ReceberTab from './receber/ReceberTab';
import DespesasTab from './despesas/DespesasTab';
import EmprestimosTab from './emprestimos/EmprestimosTab';
import TransferenciasTab from './transferencias/TransferenciasTab';
import ConciliacaoBancariaTab from './conciliacao-bancaria/ConciliacaoBancariaTab';
import OutrosDebitosTab from './outros-debitos/OutrosDebitosTab';
import OutrosCreditosTab from './outros-creditos/OutrosCreditosTab';
import FinancialUnderlineTabs from './components/FinancialUnderlineTabs';

type FinancialTab = FinanceiroTabId;

interface FinanceiroPageProps {
  poloId?: string | null;
  isMatriz: boolean;
  allowedTabs?: FinancialTab[];
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ poloId, isMatriz, allowedTabs }) => {
  const [activeTab, setActiveTab] = useState<FinancialTab>('resumo');

  const tabs = useMemo(() => [
    { id: 'resumo' as const, label: 'Resumo', icon: <Layers size={14} /> },
    { id: 'receber' as const, label: 'Contas a Receber', icon: <TrendingUp size={14} /> },
    { id: 'despesas' as const, label: 'Contas a Pagar', icon: <TrendingDown size={14} /> },
    { id: 'emprestimos' as const, label: 'Empréstimos', icon: <Landmark size={14} /> },
    { id: 'transferencias' as const, label: 'Transferências', icon: <ArrowRightLeft size={14} /> },
    { id: 'conciliacao-bancaria' as const, label: 'Conciliação Bancária', icon: <FileText size={14} /> },
    { id: 'outros-debitos' as const, label: 'Outros Débitos', icon: <TrendingDown size={14} className="rotate-90" /> },
    { id: 'outros-creditos' as const, label: 'Outros Créditos', icon: <TrendingUp size={14} className="-rotate-90" /> },
  ], []);
  const visibleTabs = useMemo(() => {
    if (!allowedTabs) return tabs;
    return tabs.filter(tab => allowedTabs.includes(tab.id));
  }, [allowedTabs, tabs]);

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'resumo');
    }
  }, [activeTab, visibleTabs]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'resumo':
        return <ResumoTab poloId={poloId} />;
      case 'receber':
        return <ReceberTab poloId={poloId} isMatriz={isMatriz} />;
      case 'despesas':
        return <DespesasTab poloId={poloId} />;
      case 'emprestimos':
        return <EmprestimosTab poloId={poloId} isMatriz={isMatriz} />;
      case 'transferencias':
        return <TransferenciasTab poloId={poloId} />;
      case 'conciliacao-bancaria':
        return <ConciliacaoBancariaTab poloId={poloId} />;
      case 'outros-debitos':
        return <OutrosDebitosTab poloId={poloId} />;
      case 'outros-creditos':
        return <OutrosCreditosTab poloId={poloId} />;
      default:
        return null;
    }
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="max-w-7xl mx-auto animate-fadeIn pb-12">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <Lock size={26} />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Acesso negado</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">
            Seu usuário não possui permissão para nenhuma aba financeira.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* ABA DE NAVEGAÇÃO PRINCIPAL */}
      <div className="mb-8">
        <FinancialUnderlineTabs
          items={visibleTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Seções do módulo financeiro"
        />
      </div>

      {/* CONTEÚDO PRINCIPAL DAS ABAS */}
      <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-xl min-h-[450px]">
        {renderActiveTab()}
      </div>
    </div>
  );
};

export default FinanceiroPage;
