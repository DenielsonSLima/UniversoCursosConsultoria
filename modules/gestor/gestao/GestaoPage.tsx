// File: modules/gestor/gestao/GestaoPage.tsx

import React, { useEffect, useState } from 'react';
import { BarChart3, Briefcase, Award, MonitorPlay, Sparkles, Zap } from 'lucide-react';
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

const GestaoPage: React.FC<GestaoPageProps> = ({ poloId, poloNome, isMatriz, onRequestScrollTop }) => {
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
    if (isDetailView) {
      onRequestScrollTop?.();
    }
  }, [isDetailView, onRequestScrollTop]);

  useEffect(() => {
    const channel = supabase
      .channel('gestao-kpis-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['gestao-resumo-kpis', poloId || 'matriz-global'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['gestao-resumo-kpis', poloId || 'matriz-global'] });
      })
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
      {/* Header Geral do Módulo - Oculto apenas se estiver em Detalhes */}
      {!isDetailView && (
        <div className="mb-8">
          <div className="rounded-[1.8rem] border border-[#dce6f2] bg-gradient-to-r from-[#001a33] via-[#012b57] to-[#014c86] p-6 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Módulo de Gestão</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight mt-1">Gestão de Turmas</h2>
            <p className="text-sm font-bold text-slate-200 mt-2 max-w-3xl">
              {isMatriz
                ? 'Acompanhe a estrutura e desempenho das turmas por modalidade em um painel visual único.'
                : `Visual do polo: ${poloNome || 'selecionado'}.`}
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">
              <Sparkles size={12} />
              Layout atualizado para leitura rápida
            </div>
          </div>

          {/* Navegação de Abas Principal */}
          <div className="mt-4 inline-flex flex-wrap gap-2 rounded-2xl bg-white p-1.5">
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
