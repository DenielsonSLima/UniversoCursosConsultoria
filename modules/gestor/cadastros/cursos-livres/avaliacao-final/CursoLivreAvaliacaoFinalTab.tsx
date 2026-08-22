import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Plus, RefreshCw, Save } from 'lucide-react';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import QuestaoCursoLivreEditor from './QuestaoCursoLivreEditor';
import type {
  AvaliacaoCursoLivreDraft,
  QuestaoCursoLivreGestao,
} from './avaliacao-curso-livre.types';
import { useAvaliacaoCursoLivreGestao } from './useAvaliacaoCursoLivreGestao';

interface CursoLivreAvaliacaoFinalTabProps {
  cursoId: string;
}

const DEFAULT_MINIMUM_BANK = 50;
const DEFAULT_DRAW_COUNT = 10;
const MAX_QUESTIONS = 500;
const MAX_OPTIONS = 8;
const MAX_RETRY_HOURS = 720;

const createEmptyDraft = (): AvaliacaoCursoLivreDraft => ({
  titulo: 'Avaliação final',
  notaMinimaPercentual: 70,
  intervaloNovaTentativaHoras: 0,
  questoes: [],
});

const createEmptyQuestion = (): QuestaoCursoLivreGestao => ({
  id: globalThis.crypto.randomUUID(),
  enunciado: '',
  opcoes: ['', '', '', ''],
  respostaCorreta: 0,
  ativa: true,
});

const getDraftError = (draft: AvaliacaoCursoLivreDraft) => {
  if (!draft.titulo.trim()) return 'Informe o título da avaliação.';
  if (draft.notaMinimaPercentual < 0 || draft.notaMinimaPercentual > 100) return 'A nota mínima deve ficar entre 0% e 100%.';
  if (draft.intervaloNovaTentativaHoras < 0 || draft.intervaloNovaTentativaHoras > MAX_RETRY_HOURS) {
    return `O intervalo entre tentativas deve ficar entre 0 e ${MAX_RETRY_HOURS} horas.`;
  }
  if (draft.questoes.length > MAX_QUESTIONS) return `A avaliação aceita no máximo ${MAX_QUESTIONS} questões.`;
  const invalidIndex = draft.questoes.findIndex((question) => (
    !question.enunciado.trim()
    || question.opcoes.length < 2
    || question.opcoes.length > MAX_OPTIONS
    || question.opcoes.some((option) => !option.trim())
    || new Set(question.opcoes.map((option) => option.trim().toLocaleLowerCase('pt-BR'))).size !== question.opcoes.length
    || question.respostaCorreta < 0
    || question.respostaCorreta >= question.opcoes.length
  ));
  return invalidIndex >= 0 ? `Revise o enunciado, as alternativas e o gabarito da questão ${invalidIndex + 1}.` : null;
};

const CursoLivreAvaliacaoFinalTab: React.FC<CursoLivreAvaliacaoFinalTabProps> = ({ cursoId }) => {
  const { query, mutation, save } = useAvaliacaoCursoLivreGestao(cursoId);
  const { toasts, removeToast, toast } = useToast();
  const [draft, setDraft] = useState<AvaliacaoCursoLivreDraft>(createEmptyDraft);
  const loadedRevision = useRef<string | null>(null);
  const assessment = query.data?.avaliacao || null;

  useEffect(() => {
    if (!query.data) return;
    const revisionKey = assessment ? `${assessment.id}:${assessment.revisao}` : `${cursoId}:empty`;
    if (loadedRevision.current === revisionKey) return;
    loadedRevision.current = revisionKey;
    setDraft(assessment ? {
      titulo: assessment.titulo,
      notaMinimaPercentual: assessment.notaMinimaPercentual,
      intervaloNovaTentativaHoras: assessment.intervaloNovaTentativaHoras,
      questoes: assessment.questoes,
    } : createEmptyDraft());
  }, [assessment, cursoId, query.data]);

  const activeQuestions = useMemo(() => draft.questoes.filter((question) => question.ativa).length, [draft.questoes]);
  const minimumBank = assessment?.minimoBanco || DEFAULT_MINIMUM_BANK;
  const drawCount = assessment?.quantidadeSorteada || DEFAULT_DRAW_COUNT;
  const isPublished = assessment?.status === 'PUBLICADA';

  const updateQuestion = (index: number, question: QuestaoCursoLivreGestao) => {
    setDraft((current) => ({
      ...current,
      questoes: current.questoes.map((item, currentIndex) => currentIndex === index ? question : item),
    }));
  };

  const persist = async (publish: boolean) => {
    const draftError = getDraftError(draft);
    if (draftError) {
      toast.error('Rascunho incompleto', draftError);
      return;
    }
    if (publish && activeQuestions < minimumBank) {
      toast.error('Banco insuficiente', `Cadastre pelo menos ${minimumBank} questões ativas antes de publicar.`);
      return;
    }
    try {
      const createVersion = !assessment || isPublished;
      await save({
        cursoId,
        avaliacaoId: createVersion ? null : assessment.id,
        expectedRevisao: createVersion ? null : assessment.revisao,
        publicar: publish,
        config: {
          titulo: draft.titulo.trim(),
          notaMinimaPercentual: draft.notaMinimaPercentual,
          intervaloNovaTentativaHoras: draft.intervaloNovaTentativaHoras,
        },
        questoes: draft.questoes.map((question) => {
          const normalized = {
            ...question,
            enunciado: question.enunciado.trim(),
            opcoes: question.opcoes.map((option) => option.trim()),
          };
          if (!createVersion) return normalized;
          const { id: _publishedQuestionId, ...newVersionQuestion } = normalized;
          return newVersionQuestion;
        }),
      });
      toast.success(
        publish ? 'Avaliação publicada' : 'Rascunho salvo',
        publish ? 'A versão publicada será aplicada às novas tentativas.' : 'As alterações permanecem restritas à Gestão.',
      );
    } catch (error) {
      toast.error('Avaliação não salva', error instanceof Error ? error.message : 'O servidor não confirmou a operação.');
    }
  };

  if (query.isLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-amber-600" size={28} /></div>;
  }

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col gap-4 rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={20} /><div><p className="text-sm font-black">Não foi possível carregar a avaliação final.</p><p className="mt-1 text-xs font-semibold">Nenhum estado vazio foi presumido. Recarregue o contrato oficial.</p></div></div>
        <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"><RefreshCw size={14} /> Recarregar</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <section className="overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-sm">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-amber-50 to-white p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20"><ClipboardCheck size={23} /></div>
            <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Avaliação final</h4><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{assessment?.status || 'Novo rascunho'}</span></div><p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">O servidor controla liberação, sorteio, correção e emissão do certificado. Aqui você mantém somente o banco autoral.</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-white bg-white/80 px-3 py-2"><p className="text-lg font-black text-[#001a33]">{activeQuestions}</p><p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Ativas</p></div>
            <div className="rounded-xl border border-white bg-white/80 px-3 py-2"><p className="text-lg font-black text-[#001a33]">{minimumBank}</p><p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Mínimo</p></div>
            <div className="rounded-xl border border-white bg-white/80 px-3 py-2"><p className="text-lg font-black text-[#001a33]">{drawCount}</p><p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Por prova</p></div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-amber-100 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <label className="space-y-2 sm:col-span-2 lg:col-span-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Título</span><input value={draft.titulo} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, titulo: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>
          <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nota mínima (%)</span><input type="number" min="0" max="100" step="1" value={draft.notaMinimaPercentual} onChange={(event) => setDraft((current) => ({ ...current, notaMinimaPercentual: Number(event.target.value) }))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>
          <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nova tentativa após (h)</span><input type="number" min="0" max="720" step="1" value={draft.intervaloNovaTentativaHoras} onChange={(event) => setDraft((current) => ({ ...current, intervaloNovaTentativaHoras: Number(event.target.value) }))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h5 className="text-sm font-black uppercase tracking-wide text-[#001a33]">Banco de questões</h5><p className="mt-1 text-xs font-semibold text-slate-500">Cada tentativa recebe a seleção oficial do servidor.</p></div>
        <button type="button" disabled={draft.questoes.length >= MAX_QUESTIONS} onClick={() => setDraft((current) => current.questoes.length >= MAX_QUESTIONS ? current : ({ ...current, questoes: [...current.questoes, createEmptyQuestion()] }))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={15} /> Nova questão</button>
      </div>

      {draft.questoes.length ? <div className="space-y-4">{draft.questoes.map((question, index) => <QuestaoCursoLivreEditor key={question.id || `question-${index}`} index={index} question={question} onChange={(next) => updateQuestion(index, next)} onRemove={() => setDraft((current) => ({ ...current, questoes: current.questoes.filter((_, currentIndex) => currentIndex !== index) }))} />)}</div> : <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center"><ClipboardCheck className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-black text-[#001a33]">O banco ainda está vazio.</p><p className="mt-1 text-xs font-semibold text-slate-500">Adicione questões e salve o rascunho para continuar depois.</p></div>}

      <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">{activeQuestions >= minimumBank ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-500" />}{activeQuestions >= minimumBank ? 'Banco pronto para validação do servidor.' : `Faltam ${minimumBank - activeQuestions} questões ativas para publicar.`}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={mutation.isPending} onClick={() => void persist(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Save size={14} /> {isPublished ? 'Salvar como rascunho' : 'Salvar rascunho'}</button><button type="button" disabled={mutation.isPending || activeQuestions < minimumBank} onClick={() => void persist(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{mutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} {isPublished ? 'Atualizar publicação' : 'Publicar avaliação'}</button></div>
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default CursoLivreAvaliacaoFinalTab;
