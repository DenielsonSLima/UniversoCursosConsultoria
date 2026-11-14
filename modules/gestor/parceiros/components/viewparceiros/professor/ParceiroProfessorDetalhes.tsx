// File: modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx

import './professor-profile.css';
import React, { useState } from 'react';
import { ArrowLeft, User, BookOpen, FileText, DollarSign, KeyRound, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ParceiroAcesso from '../shared/ParceiroAcesso';
import ParceiroProfessorDados from './ParceiroProfessorDados';
import ParceiroProfessorTurmas from './ParceiroProfessorTurmas';
import ParceiroProfessorFinanceiro from './ParceiroProfessorFinanceiro';
import ParceiroProfessorDocumentos from './ParceiroProfessorDocumentos';
import type { FinanceiroTabId } from '../../../../access-control';
import { parceirosService } from '../../../parceiros.service';
import ToastNotification, { useToast } from '../../shared/ToastNotification';
import { invalidatePartnerEmailAccess, partnerEmailUpdateFeedback } from '../../../partner-email-feedback';
import { PartnerEmailPartialSaveError } from '../../../partner-email-update';

interface ParceiroProfessorDetalhesProps {
  professorInicial: any;
  onBack: () => void;
  poloId?: string | null;
  financeCacheScope?: string;
  financialPoloId?: string | null;
  allowedFinancialTabs?: readonly FinanceiroTabId[];
}

const ParceiroProfessorDetalhes: React.FC<ParceiroProfessorDetalhesProps> = ({ professorInicial, onBack, poloId, financialPoloId, financeCacheScope, allowedFinancialTabs = [] }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<'dados' | 'turmas' | 'docs' | 'financeiro' | 'acesso'>('dados');

  const profileKey = ['parceiro', professorInicial.id, financeCacheScope];
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => parceirosService.getById(professorInicial.id),
    placeholderData: professorInicial,
  });
  const professorData = profileQuery.data || professorInicial;

  const updateMutation = useMutation({
    mutationFn: (newData: any) => parceirosService.update(professorData.id, newData),
    onSuccess: async (updated) => {
      queryClient.setQueryData(profileKey, updated);
      const emailFeedback = partnerEmailUpdateFeedback(updated.emailUpdateResult);
      if (emailFeedback) {
        await invalidatePartnerEmailAccess(queryClient, professorData.id);
        toast[emailFeedback.type](emailFeedback.title, emailFeedback.message, {
          avatarUrl: updated.foto || professorData.foto, avatarName: updated.nome || professorData.nome, contextLabel: 'E-mail e acesso do professor',
        });
        return;
      }
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
          updated?.institutionalAccessPending
            ? 'Professor atualizado, primeiro acesso pendente'
            : 'Professor atualizado e acesso vinculado',
          updated.institutionalProfileLinkMessage
            || `${updated.nome || professorData.nome} poderá escolher Professor ou Gestor ao entrar no portal institucional.`,
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
    onError: async (err: any) => {
      await invalidatePartnerEmailAccess(queryClient, professorData.id);
      if (err instanceof PartnerEmailPartialSaveError) {
        toast.warning('E-mail corrigido, demais dados pendentes', err.message, {
          avatarUrl: professorData.foto, avatarName: professorData.nome, contextLabel: 'Cadastro do professor',
        });
        return;
      }
      toast.error('Professor não atualizado', err?.message || 'Revise os dados e tente salvar novamente.', {
        avatarUrl: professorData.foto,
        avatarName: professorData.nome,
        contextLabel: 'Cadastro do professor',
      });
      console.error(err);
    }
  });

  const handleDataChange = async (newData: any) => {
    return updateMutation.mutateAsync(newData);
  };

  const handlePhotoUploaded = (fotoUrl: string, nextData: any) => {
    const updatedProfessor = { ...professorData, ...nextData, foto: fotoUrl };
    queryClient.setQueryData(profileKey, updatedProfessor);
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
    { id: 'dados', label: 'Dados do professor', icon: User },
    { id: 'turmas', label: 'Turmas e disciplinas', icon: BookOpen },
    { id: 'docs', label: 'Documentos', icon: FileText },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'acesso', label: 'Acesso', icon: KeyRound },
  ] as const;
  const profileLoading = profileQuery.isPending || profileQuery.isPlaceholderData;

  return (
    <div className="professor-profile">
      <header className="professor-profile-header">
        <button type="button" onClick={onBack} aria-label="Voltar à lista de parceiros" className="professor-action professor-back"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <h2>{professorData.nome}</h2>
          <div className="professor-profile-meta">
            <span>Professor</span><span>CPF: {professorData.cpf || 'Não informado'}</span>
            <span className={`professor-status ${professorData.status === 'ATIVO' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
              {professorData.status || 'Não informado'}
            </span>
          </div>
        </div>
      </header>
      <div role="tablist" aria-label="Perfil do professor" className="professor-profile-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button type="button" role="tab" id={`professor-tab-${id}`} aria-controls={`professor-panel-${id}`}
            aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1} key={id} onClick={() => setActiveTab(id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((tab) => tab.id === id);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
              if (next === null) return;
              event.preventDefault(); setActiveTab(tabs[next].id);
              const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
              (buttons?.[next] as HTMLElement | undefined)?.focus();
            }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`professor-panel-${activeTab}`} aria-labelledby={`professor-tab-${activeTab}`} className="professor-profile-content">
        {profileLoading ? <p role="status" className="flex items-center gap-2 py-8 text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando cadastro completo…</p>
          : profileQuery.isError || !profileQuery.data ? <div role="alert" className="text-red-800">Não foi possível carregar o cadastro completo. A conexão será retomada automaticamente.</div>
          : <>
            {activeTab === 'dados' && <ParceiroProfessorDados data={professorData} onChange={handleDataChange}
              onPhotoUploaded={handlePhotoUploaded} onPhotoUploadError={handlePhotoUploadError} />}
            {activeTab === 'turmas' && <ParceiroProfessorTurmas professorId={professorData.id} poloId={poloId} cacheScope={financeCacheScope} />}
            {activeTab === 'docs' && <ParceiroProfessorDocumentos key={`${professorData.id}:${financeCacheScope}`} professorId={professorData.id} cacheScope={financeCacheScope} toast={toast} />}
            {activeTab === 'financeiro' && <ParceiroProfessorFinanceiro professorId={professorData.id} poloId={financialPoloId || poloId}
              cacheScope={financeCacheScope} allowedFinancialTabs={allowedFinancialTabs} />}
            {activeTab === 'acesso' && <ParceiroAcesso parceiroId={professorData.id} tipo="Professor" email={professorData.email || null} toast={toast} />}
          </>}
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default ParceiroProfessorDetalhes;
