import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  LayoutGrid,
  Loader2,
  Route,
} from 'lucide-react';
import ToastNotification from '../../../../../parceiros/components/shared/ToastNotification';
import AtividadeExtraClasseCard from './AtividadeExtraClasseCard';
import AtividadeExtraClasseDetalhe from './AtividadeExtraClasseDetalhe';
import AtividadeRespostaRevisao from './AtividadeRespostaRevisao';
import {
  AtividadeAlunoComResposta,
  AtividadeExtraClasseRecord,
  AtividadesExtraClasseProps,
} from './atividadesExtraClasse.types';
import { useAtividadesExtraClasse } from './useAtividadesExtraClasse';

type AtividadesView =
  | { kind: 'LIST' }
  | { kind: 'DETAIL'; atividadeId: string }
  | { kind: 'REVIEW'; atividadeId: string; alunoId: string };

const LIST_VIEW: AtividadesView = { kind: 'LIST' };

const AtividadesExtraClasse: React.FC<AtividadesExtraClasseProps> = (props) => {
  const {
    atividades,
    alunosPorDisciplina,
    accessMessage,
    archiveMutation,
    canOperateAtividade,
    canRemoveAtividade,
    corrigirMutation,
    correctionDrafts,
    hasLoadError,
    loading,
    publishMutation,
    realtimeError,
    removeToast,
    retryLoad,
    setCorrectionDrafts,
    toasts,
  } = useAtividadesExtraClasse(props);
  const [view, setView] = useState<AtividadesView>(LIST_VIEW);

  const selectedAtividade = view.kind === 'LIST'
    ? null
    : atividades.find((atividade) => atividade.id === view.atividadeId) || null;
  const selectedResposta = view.kind === 'REVIEW'
    ? selectedAtividade?.respostas?.find((resposta) => resposta.aluno_id === view.alunoId) || null
    : null;
  const selectedRosterStudent = view.kind === 'REVIEW' && selectedAtividade
    ? (alunosPorDisciplina[selectedAtividade.disciplina_id] || [])
      .find((aluno) => aluno.id === view.alunoId) || null
    : null;

  useEffect(() => {
    if (view.kind !== 'LIST' && !selectedAtividade && !loading) {
      setView(LIST_VIEW);
    }
    if (view.kind === 'REVIEW' && !selectedResposta && !loading) {
      setView({ kind: 'DETAIL', atividadeId: view.atividadeId });
    }
  }, [loading, selectedAtividade, selectedResposta, view]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view.kind]);

  const publicadasCount = atividades.filter((atividade) => atividade.status === 'PUBLICADA').length;
  const rascunhosCount = atividades.filter((atividade) => atividade.status === 'RASCUNHO').length;

  const listCards = useMemo(() => atividades.map((atividade) => {
    const alunos = alunosPorDisciplina[atividade.disciplina_id] || [];
    const rosterIds = new Set(alunos.map((aluno) => aluno.id));
    const historicalRespondents = (atividade.respostas || [])
      .filter((resposta) => !rosterIds.has(resposta.aluno_id)).length;
    return {
      atividade,
      totalAlunos: alunos.length + historicalRespondents,
    };
  }), [alunosPorDisciplina, atividades]);

  const openReview = (atividade: AtividadeExtraClasseRecord, aluno: AtividadeAlunoComResposta) => {
    if (!aluno.resposta || aluno.resposta.status === 'PENDENTE') return;
    setView({ kind: 'REVIEW', atividadeId: atividade.id, alunoId: aluno.id });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={30} />
          <span className="ml-3 text-sm font-bold text-slate-500">Carregando atividades e alunos...</span>
        </div>
      );
    }

    if (hasLoadError) {
      return (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-xs font-bold text-red-700">
          <p>Não consegui carregar as atividades e os alunos desta turma.</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    if (selectedAtividade && view.kind === 'REVIEW' && selectedResposta) {
      const responseStudentName = selectedRosterStudent?.nome
        || selectedResposta.aluno?.nome
        || 'Aluno não identificado';
      return (
        <AtividadeRespostaRevisao
          atividade={selectedAtividade}
          canCorrect={canOperateAtividade(selectedAtividade)}
          corrigirPending={corrigirMutation.isPending && corrigirMutation.variables?.id === selectedResposta.id}
          draft={correctionDrafts[selectedResposta.id]}
          matricula={selectedRosterStudent?.matricula || null}
          nomeAluno={responseStudentName}
          onBack={() => setView({ kind: 'DETAIL', atividadeId: selectedAtividade.id })}
          onGoAtividades={() => setView(LIST_VIEW)}
          onSave={() => corrigirMutation.mutate(selectedResposta)}
          resposta={selectedResposta}
          setDraft={(draft) => setCorrectionDrafts((current) => ({
            ...current,
            [selectedResposta.id]: draft,
          }))}
        />
      );
    }

    if (selectedAtividade && view.kind === 'DETAIL') {
      return (
        <AtividadeExtraClasseDetalhe
          archivePending={archiveMutation.isPending && archiveMutation.variables?.id === selectedAtividade.id}
          atividade={selectedAtividade}
          alunos={alunosPorDisciplina[selectedAtividade.disciplina_id] || []}
          canPublish={selectedAtividade.status === 'RASCUNHO' && canOperateAtividade(selectedAtividade)}
          canRemove={canRemoveAtividade(selectedAtividade)}
          onBack={() => setView(LIST_VIEW)}
          onOpenResposta={(aluno) => openReview(selectedAtividade, aluno)}
          onPublish={() => publishMutation.mutate(selectedAtividade.id)}
          onRemove={() => archiveMutation.mutate(selectedAtividade, {
            onSuccess: () => setView(LIST_VIEW),
          })}
          publishPending={publishMutation.isPending && publishMutation.variables === selectedAtividade.id}
        />
      );
    }

    if (atividades.length === 0) {
      return (
        <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <ClipboardCheck size={34} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma atividade marcada na grade</p>
          <p className="mx-auto mt-1 max-w-lg text-xs font-semibold leading-relaxed text-slate-500">
            {props.modo === 'PROFESSOR'
              ? 'O gestor precisa marcar uma aula como atividade em Grade & Profs antes que ela apareça aqui.'
              : 'Volte para Grade & Profs, abra a disciplina e use “Marcar extra-classe” no planejamento.'}
          </p>
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LayoutGrid size={18} className="text-blue-600" />
              <h3 className="text-lg font-black text-[#001a33]">Atividades da turma</h3>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Abra um card para acompanhar todos os alunos e revisar cada resposta.
            </p>
          </div>
          <span className="inline-flex w-max items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
            <ClipboardCheck size={14} />
            {publicadasCount} publicadas{rascunhosCount > 0 ? ` • ${rascunhosCount} rascunho(s)` : ''}
          </span>
        </div>

        <div className="mt-5 grid gap-4 2xl:grid-cols-2">
          {listCards.map(({ atividade, totalAlunos }) => (
            <AtividadeExtraClasseCard
              key={atividade.id}
              atividade={atividade}
              totalAlunos={totalAlunos}
              onOpen={() => setView({ kind: 'DETAIL', atividadeId: atividade.id })}
            />
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-5">
      {view.kind === 'LIST' && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
            <Route size={17} />
          </span>
          <div>
            <p className="text-xs font-black text-emerald-900">Fluxo conectado à Grade & Profs</p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-emerald-800/80">
              A atividade só aparece aqui depois que uma aula é marcada como extra-classe na grade.
            </p>
          </div>
        </div>
      )}

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

      {renderContent()}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default AtividadesExtraClasse;
