// File: modules/gestor/financeiro/FinanceiroPage.tsx

import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  FileText,
  Handshake,
  Landmark,
  Layers,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { FinanceiroTabId } from '../access-control';

import FinancialUnderlineTabs from './components/FinancialUnderlineTabs';
import { canOpenFinancialSection } from './financeiro-sections';
import { useFinancialSection } from './hooks/useFinancialSection';

const FinanceiroResumoTab = lazy(() => import('./resumo/FinanceiroResumoTab'));
const ReceberTab = lazy(() => import('./receber/ReceberTab'));
const DespesasTab = lazy(() => import('./despesas/DespesasTab'));
const EmprestimosTab = lazy(() => import('./emprestimos/EmprestimosTab'));
const ConveniosTab = lazy(() => import('./convenios/ConveniosTab'));
const TransferenciasTab = lazy(() => import('./transferencias/TransferenciasTab'));
const ConciliacaoBancariaTab = lazy(() => import('./conciliacao-bancaria/ConciliacaoBancariaTab'));
const OutrosDebitosTab = lazy(() => import('./outros-debitos/OutrosDebitosTab'));
const OutrosCreditosTab = lazy(() => import('./outros-creditos/OutrosCreditosTab'));
const RenegociacoesTab = lazy(() => import('./renegociacoes/RenegociacoesTab'));

type FinancialTab = FinanceiroTabId;

interface FinanceiroPageProps {
  poloId?: string | null;
  poloName?: string;
  isMatriz: boolean;
  allowedTabs?: FinancialTab[];
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ poloId, poloName, isMatriz, allowedTabs }) => {
  const [activeTab, setActiveTab] = useFinancialSection();

  const tabs = useMemo(() => [
    { id: 'resumo' as const, label: 'Resumo', icon: <Layers size={14} /> },
    { id: 'receber' as const, label: 'A Receber', icon: <TrendingUp size={14} /> },
    { id: 'despesas' as const, label: 'A Pagar', icon: <TrendingDown size={14} /> },
    { id: 'renegociacoes' as const, label: 'Renegociações', icon: <Handshake size={14} /> },
    { id: 'emprestimos' as const, label: 'Empréstimos', icon: <Landmark size={14} /> },
    { id: 'convenios' as const, label: 'Convênios', icon: <Handshake size={14} /> },
    { id: 'transferencias' as const, label: 'Transferências', icon: <ArrowRightLeft size={14} /> },
    { id: 'outros-debitos' as const, label: 'Outros Débitos', icon: <TrendingDown size={14} className="rotate-90" /> },
    { id: 'outros-creditos' as const, label: 'Outros Créditos', icon: <TrendingUp size={14} className="-rotate-90" /> },
    { id: 'conciliacao-bancaria' as const, label: 'Conciliação', icon: <FileText size={14} /> },
  ], []);
  const visibleTabs = useMemo(() => {
    if (!allowedTabs) return tabs;
    return tabs.filter(tab => canOpenFinancialSection(tab.id, allowedTabs));
  }, [allowedTabs, tabs]);
  const visibleTabIds = useMemo(() => visibleTabs.map((tab) => tab.id).filter((id): id is FinancialTab => id !== 'renegociacoes'), [visibleTabs]);
  const effectiveActiveTab = visibleTabs.some(tab => tab.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id || 'resumo';

  useEffect(() => {
    if (activeTab !== effectiveActiveTab) {
      setActiveTab(effectiveActiveTab, true);
    }
  }, [activeTab, effectiveActiveTab, setActiveTab]);

  const renderActiveTab = () => {
    switch (effectiveActiveTab) {
      case 'resumo':
        return (
          <FinanceiroResumoTab
            poloId={poloId}
            poloName={poloName}
            availableTabs={visibleTabIds}
            onNavigate={setActiveTab}
          />
        );
      case 'receber':
        return <ReceberTab poloId={poloId} isMatriz={isMatriz} />;
      case 'renegociacoes':
        return (
          <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Carregando renegociações…</p>}>
            <RenegociacoesTab key={poloId || 'sem-polo'} poloId={poloId} isMatriz={isMatriz} onNavigateToReceivables={() => setActiveTab('receber')} />
          </Suspense>
        );
      case 'despesas':
        return <DespesasTab poloId={poloId} />;
      case 'emprestimos':
        return <EmprestimosTab poloId={poloId} isMatriz={isMatriz} />;
      case 'convenios':
        return <ConveniosTab poloId={poloId} />;
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
      <div className="mb-4 md:mb-6">
        <FinancialUnderlineTabs
          items={visibleTabs}
          value={effectiveActiveTab}
          onChange={setActiveTab}
          ariaLabel="Seções do módulo financeiro"
          idPrefix="financeiro"
          mobileMode="scroll"
          showHorizontalScrollbar
        />
      </div>

      {/* CONTEÚDO PRINCIPAL DAS ABAS */}
      <div
        id={`financeiro-${effectiveActiveTab}-panel`}
        role="tabpanel"
        aria-labelledby={`financeiro-${effectiveActiveTab}-tab`}
        tabIndex={0}
        className="min-h-[450px] rounded-3xl border border-slate-100 bg-slate-50/40 p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:p-6"
      >
        <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Carregando seção financeira…</p>}>
          {renderActiveTab()}
        </Suspense>
      </div>
    </div>
  );
};

export default FinanceiroPage;
