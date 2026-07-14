import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import AlunoAtividadeExtraClasseCard from './AlunoAtividadeExtraClasseCard';
import { useAlunoAtividadesExtraClasse } from './useAlunoAtividadesExtraClasse';

interface AlunoAtividadesExtraClasseTabProps {
  alunoId: string;
  turmaId: string;
}

const AlunoAtividadesExtraClasseTab: React.FC<AlunoAtividadesExtraClasseTabProps> = ({
  alunoId,
  turmaId,
}) => {
  const {
    atividades,
    getAtividadeDraftAnexo,
    getAtividadeDraftResposta,
    getAtividadeDraftTexto,
    isError,
    isLoading,
    retryLoad,
    submitAtividadeMutation,
    submitError,
    updateAtividadeDraft,
  } = useAlunoAtividadesExtraClasse(alunoId, turmaId);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-blue-500" />
          <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Atividades extra-classe</h4>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
          {atividades.length} atividade(s)
        </span>
      </div>

      {submitError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
          {submitError}
        </div>
      )}

      {isLoading ? (
        <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
          Carregando atividades extra-classe...
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
          <p>Não consegui carregar as atividades desta turma.</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : atividades.length === 0 ? (
        <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
          Nenhuma atividade extra-classe publicada para esta turma.
        </div>
      ) : (
        <div className="space-y-4">
          {atividades.map((atividade) => (
            <AlunoAtividadeExtraClasseCard
              key={atividade.id}
              atividade={atividade}
              getAtividadeDraftAnexo={getAtividadeDraftAnexo}
              getAtividadeDraftResposta={getAtividadeDraftResposta}
              getAtividadeDraftTexto={getAtividadeDraftTexto}
              isSubmitting={
                submitAtividadeMutation.isPending
                && submitAtividadeMutation.variables?.id === atividade.id
              }
              onSubmit={(item) => submitAtividadeMutation.mutate(item)}
              updateAtividadeDraft={updateAtividadeDraft}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AlunoAtividadesExtraClasseTab;
