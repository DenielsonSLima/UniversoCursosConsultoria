import React from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Loader2,
  MessageSquareText,
  Save,
  Star,
  UserRound,
} from 'lucide-react';
import {
  AtividadeExtraClasseRecord,
  AtividadeExtraClasseResposta,
  CorrectionDraft,
} from './atividadesExtraClasse.types';
import {
  getRespostaAnswers,
  getSafeAtividadeHttpUrl,
  isAtividadeRespostaAtrasada,
} from './atividadesExtraClasse.utils';

interface AtividadeRespostaRevisaoProps {
  atividade: AtividadeExtraClasseRecord;
  canCorrect: boolean;
  corrigirPending: boolean;
  draft: CorrectionDraft | undefined;
  matricula: string | null;
  nomeAluno: string;
  onBack: () => void;
  onGoAtividades: () => void;
  onSave: () => void;
  resposta: AtividadeExtraClasseResposta;
  setDraft: (draft: CorrectionDraft) => void;
}

const AtividadeRespostaRevisao: React.FC<AtividadeRespostaRevisaoProps> = ({
  atividade,
  canCorrect,
  corrigirPending,
  draft,
  matricula,
  nomeAluno,
  onBack,
  onGoAtividades,
  onSave,
  resposta,
  setDraft,
}) => {
  const answers = getRespostaAnswers(resposta);
  const safeAnexoUrl = getSafeAtividadeHttpUrl(resposta.anexo_url);
  const corrigida = resposta.status === 'CORRIGIDA';
  const atrasada = isAtividadeRespostaAtrasada(resposta, atividade.prazo_entrega);
  const nota = draft?.nota ?? (resposta.nota ?? '');
  const feedback = draft?.feedback ?? (resposta.feedback || '');

  return (
    <div className="space-y-5">
      <nav aria-label="Caminho da análise" className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
        <button type="button" onClick={onGoAtividades} className="shrink-0 text-blue-700 hover:text-blue-900">
          Atividades
        </button>
        <ChevronRight size={13} className="shrink-0 text-slate-300" />
        <button type="button" onClick={onBack} className="max-w-52 truncate text-blue-700 hover:text-blue-900">
          {atividade.titulo}
        </button>
        <ChevronRight size={13} className="shrink-0 text-slate-300" />
        <span className="truncate text-slate-500">{nomeAluno}</span>
      </nav>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              aria-label="Voltar para respostas"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-600">Análise da resposta</p>
              <h3 className="mt-1 truncate text-xl font-black tracking-tight text-[#001a33]">{nomeAluno}</h3>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {[atividade.titulo, matricula].filter(Boolean).join(' • ')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {atrasada && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-rose-700">
                Entregue com atraso
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
              corrigida ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {corrigida ? <CheckCircle2 size={11} /> : <FileText size={11} />}
              {corrigida ? 'Corrigida' : 'Para revisar'}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <CalendarClock size={18} />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Enviado em</p>
                <p className="mt-0.5 text-xs font-black text-slate-700">
                  {resposta.entregue_em
                    ? new Date(resposta.entregue_em).toLocaleString('pt-BR')
                    : 'Data não registrada'}
                </p>
              </div>
            </div>

            {resposta.resposta_texto && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  <FileText size={14} />
                  Resposta em texto
                </div>
                <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">
                  {resposta.resposta_texto}
                </p>
              </div>
            )}

            {answers.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  <MessageSquareText size={14} />
                  Perguntas e respostas
                </div>
                <div className="space-y-3">
                  {answers.map((answer, index) => (
                    <div key={`${resposta.id}-answer-${index}`} className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black leading-relaxed text-slate-500">
                        {index + 1}. {answer.pergunta || `Pergunta ${index + 1}`}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">
                        {answer.resposta || 'Sem resposta registrada'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {safeAnexoUrl && (
              <a
                href={safeAnexoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100"
              >
                <span className="inline-flex items-center gap-2">
                  <LinkIcon size={15} />
                  Abrir link do trabalho
                </span>
                <span className="text-[9px] uppercase tracking-[0.14em]">HTTPS</span>
              </a>
            )}

            {!resposta.resposta_texto && answers.length === 0 && !safeAnexoUrl && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <UserRound size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-xs font-bold text-slate-500">O envio não possui conteúdo disponível para análise.</p>
              </div>
            )}
          </div>

          <aside className="h-max rounded-[1.4rem] border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 lg:sticky lg:top-5">
            <div className="flex items-center gap-2">
              <Star size={17} className="text-amber-500" />
              <h4 className="text-sm font-black text-[#001a33]">{corrigida ? 'Revisar correção' : 'Corrigir atividade'}</h4>
            </div>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">
              A nota e o feedback serão exibidos ao aluno após salvar.
            </p>

            <label className="mt-5 block">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Nota de 0 a 10</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={nota}
                  disabled={!canCorrect}
                  onChange={(event) => setDraft({ nota: event.target.value, feedback: String(feedback) })}
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-base font-black text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-100"
                  placeholder="—"
                />
                <span className="text-xs font-black text-slate-400">/ 10</span>
              </div>
            </label>

            <label className="mt-4 block">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Feedback para o aluno</span>
              <textarea
                rows={7}
                value={feedback}
                disabled={!canCorrect}
                onChange={(event) => setDraft({ nota: String(nota), feedback: event.target.value })}
                placeholder="Registre pontos fortes e o que pode ser melhorado..."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold leading-relaxed text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-100"
              />
            </label>

            <button
              type="button"
              onClick={onSave}
              disabled={!canCorrect || corrigirPending}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {corrigirPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {corrigida ? 'Salvar revisão' : 'Salvar correção'}
            </button>
            {!canCorrect && (
              <p className="mt-3 text-center text-[10px] font-bold leading-relaxed text-amber-700">
                Esta disciplina está disponível somente para consulta neste período.
              </p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
};

export default AtividadeRespostaRevisao;
