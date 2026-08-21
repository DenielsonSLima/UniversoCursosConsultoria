// File: modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx

import React, { useState } from 'react';
import { ArrowLeft, User, BookOpen, FileText, DollarSign, KeyRound } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import ParceiroProfessorDados from './ParceiroProfessorDados';
import { parceirosService } from '../../../parceiros.service';
import ToastNotification, { useToast } from '../../shared/ToastNotification';

interface ParceiroProfessorDetalhesProps {
  professorInicial: any;
  onBack: () => void;
}

const ParceiroProfessorDetalhes: React.FC<ParceiroProfessorDetalhesProps> = ({ professorInicial, onBack }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
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
      if (updated?.professorAccessInviteSent) {
        toast.success(
          'Professor atualizado e convite enviado',
          updated.institutionalProfileLinkMessage || `${updated.nome || professorData.nome} receberá um e-mail para criar a própria senha de acesso.`,
          {
            avatarUrl: updated.foto || professorData.foto,
            avatarName: updated.nome || professorData.nome,
            contextLabel: 'Primeiro acesso',
          },
        );
        return;
      }
      if (updated?.institutionalProfileLinked) {
        toast.success(
          'Professor atualizado e acesso vinculado',
          `${updated.nome || professorData.nome} poderá escolher Professor ou Gestor ao entrar no portal institucional.`,
          {
            avatarUrl: updated.foto || professorData.foto,
            avatarName: updated.nome || professorData.nome,
            contextLabel: 'Acesso institucional',
          },
        );
        return;
      }
      if (updated?.institutionalProfileLinkError) {
        toast.error(
          'Professor atualizado, acesso pendente',
          `Os dados foram salvos, mas o vínculo com o acesso institucional não foi concluído: ${updated.institutionalProfileLinkError}`,
          {
            avatarUrl: updated.foto || professorData.foto,
            avatarName: updated.nome || professorData.nome,
            contextLabel: 'Acesso institucional',
          },
        );
        return;
      }
      if (updated?.institutionalProfileLinkState === 'requires_global_configuration_access') {
        toast.success(
          'Professor atualizado',
          updated.institutionalProfileLinkMessage || 'Caso também seja Gestor, um gestor global com acesso a Configurações deve concluir o vínculo de acesso.',
          {
            avatarUrl: updated.foto || professorData.foto,
            avatarName: updated.nome || professorData.nome,
            contextLabel: 'Acesso institucional',
          },
        );
        return;
      }
      toast.success('Professor atualizado', `${updated.nome || professorData.nome} teve os dados salvos com sucesso.`, {
        avatarUrl: updated.foto || professorData.foto,
        avatarName: updated.nome || professorData.nome,
        contextLabel: 'Cadastro do professor',
      });
    },
    onError: (err: any) => {
      toast.error('Professor não atualizado', err?.message || 'Revise os dados e tente salvar novamente.', {
        avatarUrl: professorData.foto,
        avatarName: professorData.nome,
        contextLabel: 'Cadastro do professor',
      });
      console.error(err);
    }
  });

  const handleDataChange = async (newData: any) => {
    updateMutation.mutate(newData);
  };

  const handlePhotoUploaded = (fotoUrl: string, nextData: any) => {
    const updatedProfessor = { ...professorData, ...nextData, foto: fotoUrl };
    queryClient.setQueryData(['parceiro', professorData.id], updatedProfessor);
    queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    toast.success('Foto do professor atualizada', `${updatedProfessor.nome || 'Professor'} agora tem uma foto de perfil no cadastro.`, {
      avatarUrl: fotoUrl,
      avatarName: updatedProfessor.nome,
      contextLabel: 'Perfil do professor',
    });
  };

  const handlePhotoUploadError = (message: string) => {
    toast.error('Foto não enviada', message, {
      avatarUrl: professorData.foto,
      avatarName: professorData.nome,
      contextLabel: 'Perfil do professor',
    });
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
      <div className="max-w-5xl mx-auto bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[600px] ">
        {activeTab === 'dados' && (
            <ParceiroProfessorDados
              data={professorData}
              onChange={handleDataChange}
              onPhotoUploaded={handlePhotoUploaded}
              onPhotoUploadError={handlePhotoUploadError}
            />
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
        {activeTab === 'acesso' && (
          <ParceiroAcesso
            parceiroId={professorData.id}
            tipo="Professor"
            email={professorData.email || null}
          />
        )}
      </div>

      <ToastNotification toasts={toasts} onRemove={removeToast} />

    </div>
  );
};

export default ParceiroProfessorDetalhes;
