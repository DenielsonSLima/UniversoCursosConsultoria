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
    archiveMutation,
    corrigirMutation,
    correctionDrafts,
    createMutation,
    disciplinaSelecionada,
    disciplinas,
    form,
    hasLoadError,
    loading,
    removeToast,
    setCorrectionDrafts,
    setForm,
    toasts,
  } = useAtividadesExtraClasse(props);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-black text-[#001a33]">Atividades Extra-classe</h3>
          <p className="text-xs font-semibold text-slate-500">
            Complemente a carga horária com texto, vídeo, perguntas e envios dos alunos.
          </p>
        </div>
        <span className="inline-flex w-max items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
          <ClipboardCheck size={14} />
          {atividades.length} publicadas
        </span>
      </div>

      <AtividadeExtraClasseForm
        createPending={createMutation.isPending}
        disciplinaIdRestrita={props.disciplinaIdRestrita}
        disciplinaSelecionada={disciplinaSelecionada}
        disciplinas={disciplinas}
        disabled={props.readOnly}
        form={form}
        onSubmit={() => createMutation.mutate()}
        setForm={setForm}
      />

      {props.readOnly && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-800">
          {props.readOnlyMessage || 'Este período está fechado. As atividades ficam disponíveis apenas para consulta.'}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-emerald-600" size={30} />
          <span className="ml-3 text-sm font-bold text-slate-500">Carregando atividades...</span>
        </div>
      ) : hasLoadError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-xs font-bold text-red-700">
          Não consegui carregar as atividades extra-classe desta turma. Atualize a página ou tente novamente em instantes.
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
              corrigirPending={corrigirMutation.isPending}
              correctionDrafts={correctionDrafts}
              onArchive={(atividadeId) => archiveMutation.mutate(atividadeId)}
              onCorrigir={(resposta) => corrigirMutation.mutate(resposta)}
              readOnly={props.readOnly}
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
