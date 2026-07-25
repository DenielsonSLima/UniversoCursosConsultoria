import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, KeyRound, ShieldCheck, Syringe, User } from 'lucide-react';
import PerfilDadosTab from './PerfilDadosTab';
import PerfilDocumentosTab from './PerfilDocumentosTab';
import PerfilGoogleTab from './PerfilGoogleTab';
import PerfilSenhaTab from './PerfilSenhaTab';
import PerfilVacinasTab from './PerfilVacinasTab';
import { alunoPerfilKeys, alunoPerfilService } from './perfil.service';
import { PerfilPageProps, PerfilTabId, PerfilUpdatePayload } from './perfil.types';
import { alunoVacinasService } from '../../shared/vacinas/vacinas.service';
import { SaveAlunoVacinaInput } from '../../shared/vacinas/vacinas.types';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import { useDocumentosAlunoRealtime } from '../../shared/documentos-aluno/use-documentos-aluno-realtime';

const tabs: Array<{ id: PerfilTabId; label: string; icon: React.ReactNode }> = [
  { id: 'perfil', label: 'Meu perfil', icon: <User size={15} /> },
  { id: 'documentos', label: 'Documentos', icon: <FileText size={15} /> },
  { id: 'vacinas', label: 'Vacinas', icon: <Syringe size={15} /> },
  { id: 'google', label: 'Acesso e Google', icon: <ShieldCheck size={15} /> },
  { id: 'senha', label: 'Alterar senha', icon: <KeyRound size={15} /> },
];

const PerfilPage: React.FC<PerfilPageProps> = ({
  alunoId,
  initialTab = 'perfil',
  technicalEnrollmentNotice = false,
  onTechnicalEnrollmentNoticeResolved,
}) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<PerfilTabId>(initialTab);
  useDocumentosAlunoRealtime(alunoId);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: alunoPerfilKeys.profile(alunoId),
    queryFn: () => alunoPerfilService.getProfile(alunoId),
  });

  const {
    data: documentosPainel,
    isLoading: loadingDocs,
    isError: documentsError,
    error: documentsQueryError,
    refetch: refetchDocuments,
  } = useQuery({
    queryKey: alunoPerfilKeys.documents(alunoId),
    queryFn: () => alunoPerfilService.getDocuments(alunoId),
  });

  const { data: vacinaContexts = [], isLoading: loadingVacinaContexts } = useQuery({
    queryKey: alunoPerfilKeys.vacinaContexts(alunoId),
    queryFn: () => alunoVacinasService.getCursoContexts(alunoId),
  });

  const { data: vacinas = [], isLoading: loadingVacinas } = useQuery({
    queryKey: alunoPerfilKeys.vacinas(alunoId),
    queryFn: () => alunoVacinasService.getAlunoVacinas(alunoId),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: PerfilUpdatePayload) => alunoPerfilService.updateProfile(alunoId, profile, payload),
    onSuccess: (updatedProfile) => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.profile(alunoId) });
      onTechnicalEnrollmentNoticeResolved?.();
      toast.success('Aluno atualizado', 'Seu cadastro foi salvo com sucesso.', {
        avatarUrl: updatedProfile?.foto || profile?.foto,
        avatarName: updatedProfile?.nomeCompleto || updatedProfile?.nome || profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Meu perfil de aluno',
      });
    },
    onError: (error) => {
      console.error(error);
      toast.error('Cadastro não atualizado', error instanceof Error ? error.message : 'Revise os dados e tente novamente.', {
        avatarUrl: profile?.foto,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Meu perfil de aluno',
      });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ documentoId, files }: { documentoId: string; files: File[] }) =>
      alunoPerfilService.uploadSeparateDocuments(documentoId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
      toast.success('Documento enviado', 'A secretaria fará a homologação do arquivo.', {
        avatarUrl: profile?.foto,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Documentos do aluno',
      });
    },
    onError: (error) => {
      console.error(error);
      toast.error('Documento não enviado', 'Certifique-se de que o arquivo seja PDF ou imagem.', {
        avatarUrl: profile?.foto,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Documentos do aluno',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: ({ documentoIds, file }: { documentoIds: string[]; file: File }) =>
      alunoPerfilService.uploadConsolidatedPdf(documentoIds, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
      toast.success('PDF recebido', 'A secretaria organizará as páginas de cada documento.', {
        avatarUrl: profile?.foto,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Documentos do aluno',
      });
    },
    onError: (error) => {
      console.error(error);
      toast.error(
        'PDF não enviado',
        error instanceof Error ? error.message : 'Revise o arquivo e tente novamente.',
        {
          avatarUrl: profile?.foto,
          avatarName: profile?.nomeCompleto || profile?.nome,
          contextLabel: 'Documentos do aluno',
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
    },
  });

  const cancelDocumentBatchMutation = useMutation({
    mutationFn: ({
      loteId,
      arquivos,
    }: {
      loteId: string;
      arquivos: Array<{ bucket: string; path: string }>;
    }) => alunoPerfilService.cancelDocumentBatch(loteId, arquivos),
    onSuccess: () => {
      toast.success(
        'Envio cancelado',
        'O envio incompleto foi liberado e você pode começar novamente.',
        {
          avatarUrl: profile?.foto,
          avatarName: profile?.nomeCompleto || profile?.nome,
          contextLabel: 'Documentos do aluno',
        },
      );
    },
    onError: (error) => {
      toast.error(
        'Não foi possível concluir a limpeza',
        error instanceof Error ? error.message : 'Atualize a tela e tente novamente.',
        {
          avatarUrl: profile?.foto,
          avatarName: profile?.nomeCompleto || profile?.nome,
          contextLabel: 'Documentos do aluno',
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.documents(alunoId) });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => alunoPerfilService.uploadProfilePhoto(alunoId, profile, file),
    onSuccess: (fotoUrl) => {
      queryClient.setQueryData(alunoPerfilKeys.profile(alunoId), (current: any) => ({ ...(current || profile || {}), foto: fotoUrl }));
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.profile(alunoId) });
      toast.success('Foto do aluno atualizada', 'Sua foto de perfil foi salva com sucesso.', {
        avatarUrl: fotoUrl,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Meu perfil de aluno',
      });
    },
    onError: (error: any) => {
      console.error(error);
      toast.error('Foto não enviada', error?.message || 'Erro ao enviar foto de perfil.', {
        avatarUrl: profile?.foto,
        avatarName: profile?.nomeCompleto || profile?.nome,
        contextLabel: 'Meu perfil de aluno',
      });
    },
  });

  const saveVacinaMutation = useMutation({
    mutationFn: (payload: SaveAlunoVacinaInput) => alunoVacinasService.saveAlunoVacina(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.vacinas(alunoId) });
      alert('Vacina enviada para análise da secretaria.');
    },
    onError: (error) => {
      console.error(error);
      alert('Erro ao salvar vacina.');
    },
  });

  const uploadVacinaMutation = useMutation({
    mutationFn: ({ payload, file }: { payload: SaveAlunoVacinaInput; file: File }) =>
      alunoVacinasService.uploadVacinaArquivo(payload, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alunoPerfilKeys.vacinas(alunoId) });
      alert('Comprovante de vacina enviado para análise.');
    },
    onError: (error) => {
      console.error(error);
      alert('Erro ao enviar comprovante da vacina.');
    },
  });

  if (documentsError) {
    return (
      <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-black text-red-700">Não foi possível carregar seus documentos.</p>
        <p className="mt-2 text-xs font-medium text-slate-500">
          {documentsQueryError instanceof Error
            ? documentsQueryError.message
            : 'Tente novamente em alguns instantes.'}
        </p>
        <button
          type="button"
          onClick={() => void refetchDocuments()}
          className="mt-5 min-h-11 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wider text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loadingProfile || loadingDocs || loadingVacinaContexts || loadingVacinas || !documentosPainel) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 animate-fadeIn sm:space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33] sm:text-2xl"><User size={22} className="shrink-0 text-blue-600" /> Meu Perfil</h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">Mantenha seus dados, documentos e formas de acesso atualizados.</p>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm [scrollbar-width:none]">
        <div className="flex min-w-max gap-1 lg:min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-wider transition lg:flex-1 lg:text-xs lg:tracking-widest ${
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'perfil' && (
        <PerfilDadosTab
          profile={profile}
          saving={updateProfileMutation.isPending}
          uploadingPhoto={uploadPhotoMutation.isPending}
          technicalEnrollmentNotice={technicalEnrollmentNotice}
          onSave={(payload) => updateProfileMutation.mutate(payload)}
          onPhotoUpload={(file) => uploadPhotoMutation.mutateAsync(file)}
        />
      )}

      {activeTab === 'documentos' && (
        <PerfilDocumentosTab
          painel={documentosPainel}
          cancellingLotId={
            cancelDocumentBatchMutation.isPending
              ? cancelDocumentBatchMutation.variables?.loteId || null
              : null
          }
          uploadingKey={
            uploadPdfMutation.isPending
              ? 'pdf_unico'
              : uploadDocumentMutation.isPending
                ? uploadDocumentMutation.variables?.documentoId || null
                : null
          }
          onUploadSeparado={(documentoId, files) =>
            uploadDocumentMutation.mutateAsync({ documentoId, files })}
          onUploadPdf={(file) => {
            const blockedDocumentIds = new Set(
              documentosPainel.lotesPdf
                .filter((lote) =>
                  ['preparando', 'aguardando_mapeamento'].includes(lote.status))
                .flatMap((lote) => lote.documentoIds),
            );
            const documentoIds = documentosPainel.itens
              .filter((item) =>
                ['nao_enviado', 'recusado'].includes(item.status)
                && !blockedDocumentIds.has(item.id))
              .map((item) => item.id);
            return uploadPdfMutation.mutateAsync({ documentoIds, file });
          }}
          onCancelLote={(loteId, arquivos) =>
            cancelDocumentBatchMutation.mutateAsync({ loteId, arquivos })}
        />
      )}

      {activeTab === 'vacinas' && (
        <PerfilVacinasTab
          alunoId={alunoId}
          contexts={vacinaContexts}
          registros={vacinas}
          saving={saveVacinaMutation.isPending}
          uploading={uploadVacinaMutation.isPending}
          onSave={(payload) => saveVacinaMutation.mutate(payload)}
          onUpload={(payload, file) => uploadVacinaMutation.mutate({ payload, file })}
        />
      )}

      {activeTab === 'google' && <PerfilGoogleTab />}

      {activeTab === 'senha' && <PerfilSenhaTab />}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default PerfilPage;
