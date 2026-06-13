
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDetalhes.tsx

import React, { useState } from 'react';
import { ArrowLeft, User, Users, FileText, DollarSign, KeyRound, FileBadge } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAlunoDados from './ParceiroAlunoDados';
import ParceiroAlunoCursos from './ParceiroAlunoCursos';
import ParceiroAlunoDocumentos from './ParceiroAlunoDocumentos';
import ParceiroAlunoFinanceiro from './ParceiroAlunoFinanceiro';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import FichaAlunoModal from './ficha/FichaAlunoModal';
import { parceirosService } from '../../../parceiros.service';

interface ParceiroAlunoDetalhesProps {
  alunoInicial: any;
  onBack: () => void;
}

const ParceiroAlunoDetalhes: React.FC<ParceiroAlunoDetalhesProps> = ({ alunoInicial, onBack }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'dados' | 'cursos' | 'docs' | 'financeiro' | 'acesso'>('dados');
  const [isFichaOpen, setIsFichaOpen] = useState(false);

  // Carregar dados reais usando React Query com initialData do parceiro selecionado
  const { data: alunoData = alunoInicial } = useQuery({
    queryKey: ['parceiro', alunoInicial.id],
    queryFn: () => parceirosService.getById(alunoInicial.id),
    initialData: alunoInicial,
  });

  const updateMutation = useMutation({
    mutationFn: (newData: any) => parceirosService.update(alunoData.id, newData),
    onSuccess: (updated) => {
      queryClient.setQueryData(['parceiro', alunoData.id], updated);
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      alert('Dados do aluno atualizados com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao atualizar dados do aluno.');
      console.error(err);
    }
  });

  const handleDataChange = async (newData: any) => {
    updateMutation.mutate(newData);
  };

  const tabs = [
    { id: 'dados', label: 'Dados do Aluno', icon: <User size={18} /> },
    { id: 'cursos', label: 'Cursos', icon: <Users size={18} /> },
    { id: 'docs', label: 'Documentos', icon: <FileText size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'acesso', label: 'Acesso', icon: <KeyRound size={18} /> },
  ];

  return (
    <div className="min-h-screen pb-20">
      
      {/* Header Normal (Não Sticky) - Fica no topo da página */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button 
                      onClick={onBack}
                      className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors bg-slate-50"
                  >
                      <ArrowLeft size={20} />
                  </button>
                  <div>
                      <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                          {alunoData.nome}
                      </h2>
                      <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">
                          Matrícula: {alunoData.id || 'Nova'} • Status: <span className={alunoData.status === 'ATIVO' ? 'text-emerald-600' : 'text-amber-600'}>{alunoData.status || 'ATIVO'}</span>
                      </p>
                  </div>
                </div>

                {/* Botão de Ficha Cadastral */}
                <button
                  onClick={() => setIsFichaOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-[#001a33] hover:text-white transition-colors border border-slate-200 hover:border-[#001a33] shadow-sm hover:shadow-lg hover:shadow-blue-900/20"
                >
                  <FileBadge size={16} /> Imprimir Ficha
                </button>
            </div>

            {/* Navegação de Abas */}
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-[#001a33] text-white shadow-lg shadow-blue-900/20' 
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

      {/* Conteúdo com Animação Isolada */}
      <div className="max-w-5xl mx-auto bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[600px] animate-fadeIn">
        {activeTab === 'dados' && (
            <ParceiroAlunoDados 
                aluno={alunoData} 
                onChange={handleDataChange} 
            />
        )}
        {activeTab === 'cursos' && (
            <ParceiroAlunoCursos alunoId={alunoData.id} />
        )}
        {activeTab === 'docs' && <ParceiroAlunoDocumentos alunoId={alunoData.id} />}
        {activeTab === 'financeiro' && <ParceiroAlunoFinanceiro />}
        {activeTab === 'acesso' && <ParceiroAcesso email={alunoData.email || `${alunoData.nome.toLowerCase().replace(/\s/g, '.')}@email.com`} />}
      </div>

      {isFichaOpen && (
        <FichaAlunoModal 
          aluno={alunoData}
          onClose={() => setIsFichaOpen(false)}
        />
      )}

    </div>
  );
};

export default ParceiroAlunoDetalhes;
