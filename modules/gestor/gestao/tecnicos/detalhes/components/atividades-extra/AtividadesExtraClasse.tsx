import React from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import ToastNotification from '../../../../../parceiros/components/shared/ToastNotification';
import AtividadeExtraClasseCard from './AtividadeExtraClasseCard';
import AtividadeExtraClasseForm from './AtividadeExtraClasseForm';
import {
  AtividadeExtraClasseRecord,
  AtividadesExtraClasseProps,
} from './atividadesExtraClasse.types';
import { useAtividadesExtraClasse } from './useAtividadesExtraClasse';

const AtividadesExtraClasse: React.FC<AtividadesExtraClasseProps> = (props) => {
  const {
    atividades,
    accessMessage,
    archiveMutation,
    canCreate,
    canOperateAtividade,
    canRemoveAtividade,
    corrigirMutation,
    correctionDrafts,
    createAsDraft,
    createMutation,
    disciplinaSelecionada,
    disciplinas,
    form,
    hasLoadError,
    loading,
    publishMutation,
    realtimeError,
    removeToast,
    retryLoad,
    setCorrectionDrafts,
    setForm,
    toasts,
  } = useAtividadesExtraClasse(props);
  const publicadasCount = atividades.filter((atividade) => atividade.status === 'PUBLICADA').length;
  const rascunhosCount = atividades.filter((atividade) => atividade.status === 'RASCUNHO').length;

  return (
    <div className="space-y-6 ">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-black text-[#001a33]">Atividades Extra-classe</h3>
          <p className="text-xs font-semibold text-slate-500">
            Complemente a carga horária com texto, vídeo, perguntas e envios dos alunos.
          </p>
        </div>
        <span className="inline-flex w-max items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
          <ClipboardCheck size={14} />
          {publicadasCount} publicadas{rascunhosCount > 0 ? ` • ${rascunhosCount} rascunho(s)` : ''}
        </span>
      </div>

      <AtividadeExtraClasseForm
        createPending={createMutation.isPending}
        disciplinaIdRestrita={props.disciplinaIdRestrita}
        disciplinaSelecionada={disciplinaSelecionada}
        disciplinas={disciplinas}
        disabled={!canCreate}
        form={form}
        onSubmit={() => createMutation.mutate()}
        setForm={setForm}
        submitLabel={createAsDraft ? 'Salvar rascunho' : 'Publicar atividade'}
      />

      {accessMessage && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-800">
          {accessMessage}
        </div>
      )}

      {realtimeError && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-800">
          {realtimeError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-emerald-600" size={30} />
          <span className="ml-3 text-sm font-bold text-slate-500">Carregando atividades...</span>
        </div>
      ) : hasLoadError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-xs font-bold text-red-700">
          <p>Não consegui carregar as atividades extra-classe desta turma.</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : atividades.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <ClipboardCheck size={34} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma atividade extra-classe publicada</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Crie a primeira atividade para liberar respostas dos alunos.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {atividades.map((atividade: AtividadeExtraClasseRecord) => (
            <AtividadeExtraClasseCard
              key={atividade.id}
              archivePending={archiveMutation.isPending}
              atividade={atividade}
              canCorrect={canOperateAtividade(atividade)}
              canPublish={atividade.status === 'RASCUNHO' && canOperateAtividade(atividade)}
              canRemove={canRemoveAtividade(atividade)}
              corrigirPending={corrigirMutation.isPending}
              correctionDrafts={correctionDrafts}
              onPublish={(atividadeId) => publishMutation.mutate(atividadeId)}
              onRemove={() => archiveMutation.mutate(atividade)}
              onCorrigir={(resposta) => corrigirMutation.mutate(resposta)}
              publishPending={publishMutation.isPending && publishMutation.variables === atividade.id}
              setCorrectionDrafts={setCorrectionDrafts}
            />
          ))}
        </div>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default AtividadesExtraClasse;
