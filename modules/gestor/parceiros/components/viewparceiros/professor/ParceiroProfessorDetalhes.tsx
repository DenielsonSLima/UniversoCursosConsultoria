// File: modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx

import React, { useState } from 'react';
import { ArrowLeft, User, BookOpen, FileText, DollarSign, KeyRound } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import ParceiroProfessorDados from './ParceiroProfessorDados';
import { parceirosService } from '../../../parceiros.service';

interface ParceiroProfessorDetalhesProps {
  professorInicial: any;
  onBack: () => void;
}

const ParceiroProfessorDetalhes: React.FC<ParceiroProfessorDetalhesProps> = ({ professorInicial, onBack }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'dados' | 'turmas' | 'docs' | 'financeiro' | 'acesso'>('dados');

  // Carrega dados do professor usando React Query com initialData
  const { data: professorData = professorInicial } = useQuery({
    queryKey: ['parceiro', professorInicial.id],
    queryFn: () => parceirosService.getById(professorInicial.id),
    initialData: professorInicial,
  });

  const updateMutation = useMutation({
    mutationFn: (newData: any) => parceirosService.update(professorData.id, newData),
    onSuccess: (updated) => {
      queryClient.setQueryData(['parceiro', professorData.id], updated);
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      alert('Dados do professor atualizados com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao atualizar dados do professor.');
      console.error(err);
    }
  });

  const handleDataChange = async (newData: any) => {
    updateMutation.mutate(newData);
  };

  const tabs = [
    { id: 'dados', label: 'Dados do Professor', icon: <User size={18} /> },
    { id: 'turmas', label: 'Turmas/Disciplinas', icon: <BookOpen size={18} /> },
    { id: 'docs', label: 'Documentos', icon: <FileText size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'acesso', label: 'Acesso', icon: <KeyRound size={18} /> },
  ];

  return (
    <div className="min-h-screen pb-20">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button 
                    onClick={onBack}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200 transition-colors bg-slate-50"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                        {professorData.nome}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">
                        Professor • Documento: {professorData.cpf || 'Não informado'} • Status: <span className={professorData.status === 'ATIVO' ? 'text-emerald-600' : 'text-amber-600'}>{professorData.status || 'ATIVO'}</span>
                    </p>
                </div>
            </div>

            {/* Navegação de Abas */}
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-[#001a33] text-white shadow-lg shadow-purple-900/20' 
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[600px] animate-fadeIn">
        {activeTab === 'dados' && (
            <ParceiroProfessorDados data={professorData} onChange={handleDataChange} />
        )}
        {activeTab === 'turmas' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Turmas do Professor</div>
        )}
        {activeTab === 'docs' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Documentos (PDF, Imagens, Pendências)</div>
        )}
        {activeTab === 'financeiro' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Financeiro (A pagar/Receber)</div>
        )}
        {activeTab === 'acesso' && <ParceiroAcesso email={professorData.email || `${professorData.nome.toLowerCase().replace(/\s/g, '.')}@email.com`} />}
      </div>

    </div>
  );
};

export default ParceiroProfessorDetalhes;
