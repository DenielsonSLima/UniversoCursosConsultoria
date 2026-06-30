import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, KeyRound, ShieldCheck, User } from 'lucide-react';
import PerfilDadosTab from './PerfilDadosTab';
import PerfilDocumentosTab from './PerfilDocumentosTab';
import PerfilGoogleTab from './PerfilGoogleTab';
import PerfilSenhaTab from './PerfilSenhaTab';
import { alunoPerfilKeys, alunoPerfilService } from './perfil.service';
import { PerfilPageProps, PerfilTabId, PerfilUpdatePayload } from './perfil.types';

const tabs: Array<{ id: PerfilTabId; label: string; icon: React.ReactNode }> = [
  { id: 'perfil', label: 'Meu perfil', icon: <User size={15} /> },
  { id: 'documentos', label: 'Documentos', icon: <FileText size={15} /> },
  { id: 'google', label: 'Acesso e Google', icon: <ShieldCheck size={15} /> },
  { id: 'senha', label: 'Alterar senha', icon: <KeyRound size={15} /> },
];

const PerfilPage: React.FC<PerfilPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PerfilTabId>('perfil');

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: alunoPerfilKeys.profile(alunoId),
    queryFn: () => alunoPerfilService.getProfile(alunoId),
  });

  const { data: documentos = [], isLoading: loadingDocs } = useQuery({
    queryKey: alunoPerfilKeys.documents(alunoId),
    queryFn: () => alunoPerfilService.getDocuments(alunoId),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: PerfilUpdatePayload) => alunoPerfilService.updateProfile(alunoId, profile, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.profile(alunoId) });
      alert('Cadastro atualizado com sucesso!');
    },
    onError: (error) => {
      console.error(error);
      alert('Erro ao atualizar cadastro.');
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ docName, file }: { docName: string; file: File }) =>
      alunoPerfilService.uploadDocument(alunoId, docName, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
      alert('Documento enviado com sucesso! Aguarde a homologação da secretaria.');
    },
    onError: (error) => {
      console.error(error);
      alert('Erro ao enviar documento. Certifique-se de que o arquivo seja PDF ou imagem.');
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => alunoPerfilService.uploadProfilePhoto(alunoId, profile, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.profile(alunoId) });
      alert('Foto de perfil atualizada com sucesso!');
    },
    onError: (error: any) => {
      console.error(error);
      alert(error?.message || 'Erro ao enviar foto de perfil.');
    },
  });

  if (loadingProfile || loadingDocs) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="inline-grid rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:grid-cols-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
              activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'perfil' && (
        <PerfilDadosTab
          profile={profile}
          saving={updateProfileMutation.isPending}
          uploadingPhoto={uploadPhotoMutation.isPending}
          onSave={(payload) => updateProfileMutation.mutate(payload)}
          onPhotoUpload={(file) => uploadPhotoMutation.mutateAsync(file)}
        />
      )}

      {activeTab === 'documentos' && (
        <PerfilDocumentosTab
          documentos={documentos}
          uploading={uploadDocumentMutation.isPending}
          onUpload={(input) => uploadDocumentMutation.mutate(input)}
        />
      )}

      {activeTab === 'google' && <PerfilGoogleTab />}

      {activeTab === 'senha' && <PerfilSenhaTab />}
    </div>
  );
};

export default PerfilPage;
