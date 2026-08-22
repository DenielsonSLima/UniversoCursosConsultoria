// File: modules/gestor/gestao/GestaoPage.tsx

import React, { Suspense, useEffect, useState } from 'react';
import { BarChart3, Briefcase, Award, MonitorPlay, Zap } from 'lucide-react';
import GestaoResumo from './resumo/GestaoResumo';
import { useGestaoRealtime } from './hooks/useGestaoRealtime';
import type { GestorPermissions } from '../access-control';

const loadGestaoTecnicos = () => import('./tecnicos/GestaoTecnicos');
const loadGestaoLivres = () => import('./livres/GestaoLivres');
const loadGestaoEspecializacao = () => import('./especializacao/GestaoEspecializacao');
const loadGestaoEad = () => import('./ead/GestaoEad');

const GestaoTecnicos = React.lazy(loadGestaoTecnicos);
const GestaoLivres = React.lazy(loadGestaoLivres);
const GestaoEspecializacao = React.lazy(loadGestaoEspecializacao);
const GestaoEad = React.lazy(loadGestaoEad);

type GestaoTab = 'resumo' | 'tecnicos' | 'livres' | 'especializacao' | 'ead';

const preloadTab = (tab: GestaoTab) => {
  if (tab === 'tecnicos') void loadGestaoTecnicos();
  if (tab === 'livres') void loadGestaoLivres();
  if (tab === 'especializacao') void loadGestaoEspecializacao();
  if (tab === 'ead') void loadGestaoEad();
};

interface GestaoPageProps {
  poloId?: string;
  activePoloId?: string;
  poloNome?: string;
  isMatriz: boolean;
  onRequestScrollTop?: () => void;
  permissions: GestorPermissions;
  gestorContextId: string;
}

const GestaoPage: React.FC<GestaoPageProps> = ({ poloId, activePoloId, isMatriz, onRequestScrollTop, permissions, gestorContextId }) => {
  useGestaoRealtime(poloId);
  const [activeTab, setActiveTab] = useState<GestaoTab>('resumo');
  const [isDetailView, setIsDetailView] = useState(false);

  useEffect(() => {
    if (!isMatriz && activeTab === 'ead') {
      setActiveTab('resumo');
      setIsDetailView(false);
    }
  }, [activeTab, isMatriz]);

  useEffect(() => {
    onRequestScrollTop?.();
  }, [activeTab, isDetailView, onRequestScrollTop]);

  const tabs: Array<{ id: GestaoTab; label: string; icon: React.ReactNode }> = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={14} /> },
    { id: 'tecnicos', label: 'Técnicos', icon: <Briefcase size={14} /> },
    { id: 'livres', label: 'Livres', icon: <Zap size={14} /> },
    { id: 'especializacao', label: 'Especialização', icon: <Award size={14} /> },
    ...(isMatriz ? [{ id: 'ead' as const, label: 'EAD', icon: <MonitorPlay size={14} /> }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Navegação Geral do Módulo - Oculta apenas se estiver em Detalhes */}
      {!isDetailView && (
        <div className="border-b border-slate-200 mb-6">
          <div className="flex gap-6 overflow-x-auto pb-px">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onMouseEnter={() => preloadTab(tab.id)}
                  onFocus={() => preloadTab(tab.id)}
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
      )}

      {/* Conteúdo Dinâmico */}
      <div className="min-h-[500px]">
        <Suspense fallback={<div className="py-16 text-center text-sm font-bold text-slate-400">Carregando área de gestão...</div>}>
          {activeTab === 'resumo' && <GestaoResumo poloId={poloId} />}
          {activeTab === 'tecnicos' && <GestaoTecnicos onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} gestorContextId={gestorContextId} />}
          {activeTab === 'livres' && <GestaoLivres onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} gestorContextId={gestorContextId} />}
          {activeTab === 'especializacao' && <GestaoEspecializacao onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} gestorContextId={gestorContextId} />}
          {isMatriz && activeTab === 'ead' && <GestaoEad onToggleDetails={setIsDetailView} permissions={permissions} />}
        </Suspense>
      </div>
    </div>
  );
};

export default GestaoPage;
