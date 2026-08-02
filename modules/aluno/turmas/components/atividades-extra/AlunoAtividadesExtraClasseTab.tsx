import React, { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import AlunoAtividadeExtraClasseCard from './AlunoAtividadeExtraClasseCard';
import { useAlunoAtividadesExtraClasse } from './useAlunoAtividadesExtraClasse';
import type { AtividadeExtraClasse } from './alunoAtividadesExtra.types';
import CurriculumModuleSection from '../turma-detail/CurriculumModuleSection';

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
  const modules = useMemo(() => {
    const grouped = new Map<string, { id: string; nome: string; ordem: number; itens: AtividadeExtraClasse[] }>();
    atividades.forEach((atividade) => {
      const module = atividade.disciplina?.modulo;
      const id = module?.id || 'atividades-gerais';
      const current = grouped.get(id) || {
        id,
        nome: module?.nome || 'Atividades gerais',
        ordem: Number(module?.ordem ?? Number.MAX_SAFE_INTEGER),
        itens: [],
      };
      current.itens.push(atividade);
      grouped.set(id, current);
    });
    return [...grouped.values()]
      .sort((a, b) => a.ordem - b.ordem)
      .map((module) => ({
        ...module,
        itens: [...module.itens].sort((a, b) => {
          const disciplineOrder = Number(a.disciplina?.ordem ?? Number.MAX_SAFE_INTEGER)
            - Number(b.disciplina?.ordem ?? Number.MAX_SAFE_INTEGER);
          if (disciplineOrder !== 0) return disciplineOrder;
          if (a.prazo_entrega && !b.prazo_entrega) return -1;
          if (!a.prazo_entrega && b.prazo_entrega) return 1;
          return String(a.prazo_entrega || '').localeCompare(String(b.prazo_entrega || ''))
            || a.titulo.localeCompare(b.titulo, 'pt-BR');
        }),
      }));
  }, [atividades]);

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
          {modules.map((module, moduleIndex) => (
            <CurriculumModuleSection
              key={module.id}
              title={module.nome}
              order={module.ordem}
              itemCount={module.itens.length}
              itemLabel="atividade"
              detail={`${module.itens.length} atividade${module.itens.length === 1 ? '' : 's'} publicada${module.itens.length === 1 ? '' : 's'}`}
              defaultOpen={moduleIndex === 0}
            >
              <div className="space-y-3">
          {module.itens.map((atividade) => (
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
            </CurriculumModuleSection>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlunoAtividadesExtraClasseTab;
