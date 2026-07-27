// File: modules/gestor/gestao/GestaoPage.tsx

import React, { useEffect, useState } from 'react';
import { BarChart3, Briefcase, Award, MonitorPlay, Zap } from 'lucide-react';
import GestaoResumo from './resumo/GestaoResumo';
import GestaoTecnicos from './tecnicos/GestaoTecnicos';
import GestaoLivres from './livres/GestaoLivres';
import GestaoEspecializacao from './especializacao/GestaoEspecializacao';
import GestaoEad from './ead/GestaoEad';
import { useGestaoRealtime } from './hooks/useGestaoRealtime';
import type { GestorPermissions } from '../access-control';

interface GestaoPageProps {
  poloId?: string;
  activePoloId?: string;
  poloNome?: string;
  isMatriz: boolean;
  onRequestScrollTop?: () => void;
  permissions: GestorPermissions;
}

const GestaoPage: React.FC<GestaoPageProps> = ({ poloId, activePoloId, isMatriz, onRequestScrollTop, permissions }) => {
  useGestaoRealtime(poloId);
  const [activeTab, setActiveTab] = useState<'resumo' | 'tecnicos' | 'livres' | 'especializacao' | 'ead'>('resumo');
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

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={14} /> },
    { id: 'tecnicos', label: 'Técnicos', icon: <Briefcase size={14} /> },
    { id: 'livres', label: 'Livres', icon: <Zap size={14} /> },
    { id: 'especializacao', label: 'Especialização', icon: <Award size={14} /> },
    ...(isMatriz ? [{ id: 'ead', label: 'EAD', icon: <MonitorPlay size={14} /> }] : []),
  ] as const;

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
                  onClick={() => setActiveTab(tab.id as any)}
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
        {activeTab === 'resumo' && <GestaoResumo poloId={poloId} />}
        {activeTab === 'tecnicos' && <GestaoTecnicos onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} />}
        {activeTab === 'livres' && <GestaoLivres onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} />}
        {activeTab === 'especializacao' && <GestaoEspecializacao onToggleDetails={setIsDetailView} poloId={poloId} creationPoloId={activePoloId || poloId} permissions={permissions} />}
        {isMatriz && activeTab === 'ead' && <GestaoEad onToggleDetails={setIsDetailView} permissions={permissions} />}
      </div>
    </div>
  );
};

export default GestaoPage;
