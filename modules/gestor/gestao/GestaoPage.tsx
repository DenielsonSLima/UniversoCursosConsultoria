// File: modules/gestor/gestao/GestaoPage.tsx

import React, { useEffect, useState } from 'react';
import { BarChart3, Briefcase, Award, MonitorPlay, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import GestaoResumo from './resumo/GestaoResumo';
import GestaoTecnicos from './tecnicos/GestaoTecnicos';
import GestaoLivres from './livres/GestaoLivres';
import GestaoEspecializacao from './especializacao/GestaoEspecializacao';
import GestaoEad from './ead/GestaoEad';

interface GestaoPageProps {
  poloId?: string;
  poloNome?: string;
  isMatriz: boolean;
  onRequestScrollTop?: () => void;
}

const GestaoPage: React.FC<GestaoPageProps> = ({ poloId, isMatriz, onRequestScrollTop }) => {
  const [activeTab, setActiveTab] = useState<'resumo' | 'tecnicos' | 'livres' | 'especializacao' | 'ead'>('resumo');
  const [isDetailView, setIsDetailView] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isMatriz && activeTab === 'ead') {
      setActiveTab('resumo');
      setIsDetailView(false);
    }
  }, [activeTab, isMatriz]);

  useEffect(() => {
    onRequestScrollTop?.();
  }, [activeTab, isDetailView, onRequestScrollTop]);

  useEffect(() => {
    const summaryScope = poloId || 'matriz-global';
    const invalidateGestaoResumo = () => {
      queryClient.invalidateQueries({ queryKey: ['gestao-resumo-kpis', summaryScope] });
    };

    const channel = supabase
      .channel('gestao-kpis-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, invalidateGestaoResumo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' }, invalidateGestaoResumo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscricoes_online' }, invalidateGestaoResumo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cursos' }, invalidateGestaoResumo)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={18} /> },
    { id: 'tecnicos', label: 'Técnicos', icon: <Briefcase size={18} /> },
    { id: 'livres', label: 'Livres', icon: <Zap size={18} /> },
    { id: 'especializacao', label: 'Especialização', icon: <Award size={18} /> },
    ...(isMatriz ? [{ id: 'ead', label: 'EAD', icon: <MonitorPlay size={18} /> }] : []),
  ] as const;

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      {/* Navegação Geral do Módulo - Oculta apenas se estiver em Detalhes */}
      {!isDetailView && (
        <div className="mb-8">
          <div className="inline-flex flex-wrap gap-2 rounded-2xl bg-white p-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#001a33] text-white shadow-md'
                    : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo Dinâmico */}
      <div className="min-h-[500px]">
        {activeTab === 'resumo' && <GestaoResumo poloId={poloId} />}
        {activeTab === 'tecnicos' && <GestaoTecnicos onToggleDetails={setIsDetailView} poloId={poloId} />}
        {activeTab === 'livres' && <GestaoLivres onToggleDetails={setIsDetailView} poloId={poloId} />}
        {activeTab === 'especializacao' && <GestaoEspecializacao onToggleDetails={setIsDetailView} poloId={poloId} />}
        {isMatriz && activeTab === 'ead' && <GestaoEad onToggleDetails={setIsDetailView} />}
      </div>
    </div>
  );
};

export default GestaoPage;
