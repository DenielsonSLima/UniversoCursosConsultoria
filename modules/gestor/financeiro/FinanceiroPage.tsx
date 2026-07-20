// File: modules/gestor/financeiro/FinanceiroPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  FileText,
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
import TransferenciasTab from './transferencias/TransferenciasTab';
import ConciliacaoBancariaTab from './conciliacao-bancaria/ConciliacaoBancariaTab';
import OutrosDebitosTab from './outros-debitos/OutrosDebitosTab';
import OutrosCreditosTab from './outros-creditos/OutrosCreditosTab';

type FinancialTab = FinanceiroTabId;

interface FinanceiroPageProps {
  poloId?: string | null;
  allowedTabs?: FinancialTab[];
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ poloId, allowedTabs }) => {
  const [activeTab, setActiveTab] = useState<FinancialTab>('resumo');

  const tabs = useMemo(() => [
    { id: 'resumo' as const, label: 'Resumo', icon: <Layers size={14} />, colorClass: 'bg-[#001a33] text-white shadow-md' },
    { id: 'receber' as const, label: 'Contas a Receber', icon: <TrendingUp size={14} />, colorClass: 'bg-emerald-600 text-white shadow-md' },
    { id: 'despesas' as const, label: 'Despesas', icon: <TrendingDown size={14} />, colorClass: 'bg-rose-600 text-white shadow-md' },
    { id: 'transferencias' as const, label: 'Transferências', icon: <ArrowRightLeft size={14} />, colorClass: 'bg-slate-800 text-white shadow-md' },
    { id: 'conciliacao-bancaria' as const, label: 'Conciliação Bancária', icon: <FileText size={14} className="text-blue-200" />, colorClass: 'bg-cyan-700 text-white shadow-md' },
    { id: 'outros-debitos' as const, label: 'Outros Débitos', icon: <TrendingDown size={14} className="rotate-90 text-rose-500" />, colorClass: 'bg-indigo-600 text-white shadow-md' },
    { id: 'outros-creditos' as const, label: 'Outros Créditos', icon: <TrendingUp size={14} className="-rotate-90 text-emerald-500" />, colorClass: 'bg-teal-600 text-white shadow-md' },
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
        return <ReceberTab poloId={poloId} />;
      case 'despesas':
        return <DespesasTab poloId={poloId} />;
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
      <div className="border-b border-slate-200 mb-8">
        <div className="flex gap-6 overflow-x-auto pb-px">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all relative shrink-0 ${
                  isActive 
                    ? 'text-[#001a33] font-extrabold' 
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className={isActive ? 'text-[#4169E1]' : 'text-slate-400'}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4169E1] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL DAS ABAS */}
      <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-xl min-h-[450px]">
        {renderActiveTab()}
      </div>
    </div>
  );
};

export default FinanceiroPage;
