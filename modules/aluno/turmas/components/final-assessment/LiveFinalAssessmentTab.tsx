import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../../gestor/components/ToastNotification';
import { useCursoLivreFinalAssessment } from './useCursoLivreFinalAssessment';

interface LiveFinalAssessmentTabProps {
  alunoId: string;
  matriculaId: string;
  turmaId: string;
}

const formatDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Maceio',
  }).format(date);
};

const draftKey = (attemptId: string) => `curso-livre-prova-respostas:${attemptId}`;

const releaseReasonLabel = (reason: string | null) => ({
  MATRICULA_INATIVA: 'A matrícula precisa estar ativa para liberar a prova.',
  AVALIACAO_NAO_PUBLICADA: 'A avaliação final ainda não foi publicada para esta turma.',
  PROFESSOR_NAO_ATRIBUIDO: 'A turma ainda não possui o professor responsável.',
  CRONOGRAMA_INCOMPLETO: 'O cronograma precisa completar a carga horária oficial do curso.',
  ULTIMA_AULA_NAO_DEFINIDA: 'A data da última aula ainda não foi registrada.',
  AGUARDANDO_ULTIMA_AULA: 'A prova será liberada no início da última aula programada.',
  INTERVALO_NOVA_TENTATIVA: 'A nova tentativa ficará disponível após o intervalo definido para esta avaliação.',
  LIBERADA: 'A prova está liberada.',
}[reason || ''] || 'A liberação ainda não foi autorizada pelo cronograma oficial.');

const readAnswerDraft = (attemptId: string) => {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.sessionStorage.getItem(draftKey(attemptId)) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, answer]) => typeof answer === 'number' && Number.isInteger(answer)),
    ) as Record<string, number>;
  } catch {
    return {};
  }
};

const LiveFinalAssessmentTab: React.FC<LiveFinalAssessmentTabProps> = ({
  alunoId,
  matriculaId,
  turmaId,
}) => {
  const { query, startMutation, submitMutation, start, submit } = useCursoLivreFinalAssessment({
    alunoId,
    matriculaId,
    turmaId,
  });
  const { toasts, removeToast, toast } = useToast();
  const workspace = query.data;
  const attempt = workspace?.tentativa || null;
  const [answers, setAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    const retryAt = workspace?.liberacao.novaTentativaEm;
    if (!retryAt || workspace?.liberacao.podeIniciar) return undefined;
    const retryAtMs = new Date(retryAt).getTime();
    if (!Number.isFinite(retryAtMs)) return undefined;
    const remainingMs = retryAtMs - Date.now();
    if (remainingMs <= 0) {
      void query.refetch();
      return undefined;
    }
    const timeoutId = window.setTimeout(
      () => { void query.refetch(); },
      Math.min(remainingMs + 1_000, 2_147_000_000),
    );
    return () => window.clearTimeout(timeoutId);
  }, [query.refetch, workspace?.liberacao.novaTentativaEm, workspace?.liberacao.podeIniciar]);

  useEffect(() => {
    if (!attempt?.id || attempt.status !== 'EM_ANDAMENTO') {
      setAnswers({});
      return;
    }
    setAnswers(readAnswerDraft(attempt.id));
  }, [attempt?.id, attempt?.status]);

  const answeredCount = useMemo(() => (
    attempt?.questoes.filter((question) => Number.isInteger(answers[question.id])).length || 0
  ), [answers, attempt?.questoes]);
  const canSubmit = Boolean(
    attempt?.status === 'EM_ANDAMENTO'
    && attempt.questoes.length > 0
    && answeredCount === attempt.questoes.length,
  );

  const chooseAnswer = (questionId: string, optionIndex: number) => {
    if (!attempt?.id) return;
    setAnswers((current) => {
      const next = { ...current, [questionId]: optionIndex };
      window.sessionStorage.setItem(draftKey(attempt.id), JSON.stringify(next));
      return next;
    });
  };

  const startAttempt = async () => {
    try {
      await start();
      toast.success('Prova iniciada', 'As questões desta tentativa foram emitidas pelo servidor.');
    } catch (error) {
      toast.error('Não foi possível iniciar', error instanceof Error ? error.message : 'O servidor não liberou uma nova tentativa.');
    }
  };

  const submitAttempt = async () => {
    if (!attempt || !canSubmit) {
      toast.error('Respostas pendentes', 'Responda todas as questões antes de entregar a prova.');
      return;
    }
    try {
      await submit(attempt.id, answers);
      window.sessionStorage.removeItem(draftKey(attempt.id));
      toast.success('Prova entregue', 'A correção e a situação acadêmica foram confirmadas pelo servidor.');
    } catch (error) {
      toast.error('Prova não entregue', error instanceof Error ? error.message : 'O servidor não confirmou a entrega.');
    }
  };

  if (query.isLoading) {
    return <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50"><Loader2 className="animate-spin text-amber-600" size={27} /></div>;
  }

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-rose-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><div><p className="text-xs font-black uppercase tracking-wide">Prova final indisponível</p><p className="mt-1 text-xs font-semibold">A consulta falhou; nenhum bloqueio ou resultado foi presumido.</p></div></div>
        <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"><RefreshCw size={14} /> Recarregar</button>
      </div>
    );
  }

  if (!workspace?.avaliacao) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center"><ClipboardCheck className="mx-auto text-slate-300" size={28} /><h4 className="mt-3 text-sm font-black text-[#001a33]">Avaliação ainda não publicada</h4><p className="mt-1 text-xs font-semibold text-slate-500">A prova aparecerá aqui quando a configuração oficial estiver disponível para esta matrícula.</p></div>
    );
  }

  const isRetryInterval = workspace.liberacao.motivo === 'INTERVALO_NOVA_TENTATIVA';
  const releaseLabel = formatDateTime(
    isRetryInterval ? workspace.liberacao.novaTentativaEm : workspace.liberacao.liberadaEm,
  );
  const isFinished = attempt?.status === 'APROVADA' || attempt?.status === 'REPROVADA';
  const canStart = workspace.liberacao.podeIniciar && (!attempt || attempt.status === 'REPROVADA');

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 bg-amber-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white"><ClipboardCheck size={21} /></div><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Curso Livre · Prova final</p><h4 className="mt-1 text-base font-black text-[#001a33]">{workspace.avaliacao.titulo}</h4><p className="mt-1 text-xs font-semibold text-slate-500">{workspace.avaliacao.quantidadeSorteada} questões · aprovação a partir de {workspace.avaliacao.notaMinimaPercentual}%</p></div></div>
          <div className="rounded-xl border border-white bg-white px-3 py-2 text-left sm:text-right"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Versão oficial</p><p className="mt-0.5 text-sm font-black text-[#001a33]">v{workspace.avaliacao.versao}</p></div>
        </div>
      </section>

      {!workspace.liberacao.liberada && attempt?.status !== 'APROVADA' ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500"><LockKeyhole size={19} /></div><div><p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Prova bloqueada</p><p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{releaseReasonLabel(workspace.liberacao.motivo)}</p>{releaseLabel ? <p className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-amber-700"><CalendarClock size={14} /> {isRetryInterval ? 'Nova tentativa em' : 'Liberação informada'}: {releaseLabel}</p> : null}</div></div>
        </section>
      ) : null}

      {isFinished && attempt ? (
        <section className={`rounded-2xl border p-5 ${attempt.status === 'APROVADA' ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3">{attempt.status === 'APROVADA' ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={23} /> : <XCircle className="mt-0.5 shrink-0 text-rose-600" size={23} />}<div><p className={`text-[10px] font-black uppercase tracking-widest ${attempt.status === 'APROVADA' ? 'text-emerald-700' : 'text-rose-700'}`}>{attempt.status === 'APROVADA' ? 'Aprovado' : 'Não aprovado'}</p><h5 className="mt-1 text-lg font-black text-[#001a33]">Nota {attempt.notaPercentual ?? '--'}%</h5><p className="mt-1 text-xs font-semibold text-slate-600">{attempt.acertos ?? '--'} acertos de {attempt.total ?? workspace.avaliacao.quantidadeSorteada} questões.</p></div></div>{workspace.certificado ? <div className="flex items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-700"><Award size={15} /> Certificado {workspace.certificado.status.toLowerCase()}</div> : null}</div>
        </section>
      ) : null}

      {canStart ? (
        <button type="button" disabled={startMutation.isPending} onClick={() => void startAttempt()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/15 hover:bg-slate-800 disabled:opacity-50 sm:w-auto">{startMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />} {attempt?.status === 'REPROVADA' ? 'Iniciar nova tentativa' : 'Iniciar prova final'}</button>
      ) : null}

      {attempt?.status === 'EM_ANDAMENTO' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900 sm:flex-row sm:items-center sm:justify-between"><span>Responda a tentativa emitida pelo servidor e entregue ao concluir.</span><span className="shrink-0 font-black">{answeredCount}/{attempt.questoes.length} respondidas</span></div>
          {attempt.questoes.map((question, questionIndex) => (
            <fieldset key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <legend className="sr-only">Questão {questionIndex + 1}</legend>
              <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xs font-black text-amber-700">{questionIndex + 1}</span><p className="pt-1 text-sm font-bold leading-relaxed text-[#001a33]">{question.enunciado}</p></div>
              <div className="mt-4 space-y-2 pl-0 sm:pl-11">{question.opcoes.map((option, optionIndex) => <label key={`${question.id}-${optionIndex}`} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${answers[question.id] === optionIndex ? 'border-blue-300 bg-blue-50 text-blue-900 ring-2 ring-blue-100' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200'}`}><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === optionIndex} onChange={() => chooseAnswer(question.id, optionIndex)} className="h-4 w-4 shrink-0 accent-blue-600" /><span>{option}</span></label>)}</div>
            </fieldset>
          ))}
          <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur"><button type="button" disabled={!canSubmit || submitMutation.isPending} onClick={() => void submitAttempt()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{submitMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />} Entregar prova</button></div>
        </div>
      ) : null}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default LiveFinalAssessmentTab;
