import React from 'react';
import {
  Archive,
  ClipboardCheck,
  FileText,
  Link as LinkIcon,
  Loader2,
  MessageSquareText,
  Save,
  Send,
  Star,
  Trash2,
  Video,
} from 'lucide-react';
import {
  AtividadeExtraClasseRecord,
  AtividadeExtraClasseResposta,
  CorrectionDraft,
} from './atividadesExtraClasse.types';
import {
  formatAtividadeDate,
  formatAtividadeHoras,
  getAtividadePerguntaTexto,
  getRespostaAnswers,
  getSafeAtividadeHttpUrl,
  isAtividadePrazoEncerrado,
  isAtividadeRespostaAtrasada,
} from './atividadesExtraClasse.utils';

interface AtividadeExtraClasseCardProps {
  archivePending: boolean;
  atividade: AtividadeExtraClasseRecord;
  corrigirPending: boolean;
  canCorrect: boolean;
  canPublish: boolean;
  canRemove: boolean;
  correctionDrafts: Record<string, CorrectionDraft>;
  onPublish: (atividadeId: string) => void;
  onRemove: () => void;
  onCorrigir: (resposta: AtividadeExtraClasseResposta) => void;
  publishPending: boolean;
  setCorrectionDrafts: React.Dispatch<React.SetStateAction<Record<string, CorrectionDraft>>>;
}

const AtividadeExtraClasseCard: React.FC<AtividadeExtraClasseCardProps> = ({
  archivePending,
  atividade,
  canCorrect,
  canPublish,
  canRemove,
  corrigirPending,
  correctionDrafts,
  onPublish,
  onRemove,
  onCorrigir,
  publishPending,
  setCorrectionDrafts,
}) => {
  const perguntas = Array.isArray(atividade.perguntas) ? atividade.perguntas : [];
  const respostas = Array.isArray(atividade.respostas) ? atividade.respostas : [];
  const prazoEncerrado = isAtividadePrazoEncerrado(atividade.prazo_entrega);
  const safeVideoUrl = getSafeAtividadeHttpUrl(atividade.video_url);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
              <ClipboardCheck size={11} /> Extra-classe
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
              atividade.status === 'RASCUNHO'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}>
              {atividade.status === 'RASCUNHO' ? 'Rascunho' : 'Publicada'}
            </span>
            <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {atividade.disciplina?.nome || 'Disciplina não identificada'}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
              {formatAtividadeHoras(atividade.carga_horaria_compensacao)}h
            </span>
            <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
              Prazo: {formatAtividadeDate(atividade.prazo_entrega)}
            </span>
            {prazoEncerrado && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                Prazo encerrado
              </span>
            )}
          </div>
          <h4 className="text-base font-black leading-tight text-[#001a33]">{atividade.titulo}</h4>
          {atividade.tema && <p className="mt-1 text-xs font-bold text-slate-500">Tema: {atividade.tema}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {atividade.status === 'RASCUNHO' && (
            <button
              type="button"
              onClick={() => onPublish(atividade.id)}
              disabled={!canPublish || publishPending}
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Publicar
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove || archivePending}
            className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            {atividade.status === 'RASCUNHO' ? <Trash2 size={14} /> : <Archive size={14} />}
            {atividade.status === 'RASCUNHO' ? 'Excluir rascunho' : 'Arquivar'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {atividade.texto && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <FileText size={13} />
              Enunciado
            </div>
            <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">{atividade.texto}</p>
          </div>
        )}

        <div className="space-y-3">
          {safeVideoUrl && (
            <a
              href={safeVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Video size={16} />
              Abrir vídeo da atividade
            </a>
          )}

          {perguntas.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <MessageSquareText size={13} />
                Perguntas
              </div>
              <div className="space-y-2">
                {perguntas.map((pergunta, index) => (
                  <p key={`${atividade.id}-pergunta-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                    {index + 1}. {getAtividadePerguntaTexto(pergunta, index)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h5 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Respostas dos alunos</h5>
          <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {respostas.length} envio(s)
          </span>
        </div>

        {respostas.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs font-bold text-slate-500">
            Nenhum aluno respondeu esta atividade ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {respostas.map((resposta) => {
              const draft = correctionDrafts[resposta.id] || {};
              const answers = getRespostaAnswers(resposta);
              const isCorrigida = resposta.status === 'CORRIGIDA';
              const entregaAtrasada = isAtividadeRespostaAtrasada(resposta, atividade.prazo_entrega);
              const safeAnexoUrl = getSafeAtividadeHttpUrl(resposta.anexo_url);

              return (
                <div key={resposta.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-[#001a33]">{resposta.aluno?.nome || 'Aluno não identificado'}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                          isCorrigida ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {isCorrigida ? 'Corrigida' : 'Entregue'}
                        </span>
                        {entregaAtrasada && (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700">
                            Entregue com atraso
                          </span>
                        )}
                        {resposta.entregue_em && (
                          <span className="text-[9px] font-bold text-slate-400">
                            Enviada em {new Date(resposta.entregue_em).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {resposta.resposta_texto && (
                        <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">{resposta.resposta_texto}</p>
                      )}
                      {safeAnexoUrl && (
                        <a
                          href={safeAnexoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-blue-700"
                        >
                          <LinkIcon size={13} />
                          Abrir link do trabalho (HTTPS)
                        </a>
                      )}
                      {answers.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {answers.map((answer, index) => (
                            <div key={`${resposta.id}-answer-${index}`} className="rounded-xl bg-white px-3 py-2 text-xs">
                              <p className="font-black text-slate-500">{index + 1}. {answer.pergunta || `Pergunta ${index + 1}`}</p>
                              <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-600">{answer.resposta || 'Sem resposta registrada'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-full space-y-2 lg:w-72">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={draft.nota ?? (resposta.nota ?? '')}
                          disabled={!canCorrect}
                          onChange={(event) => {
                            const nota = event.target.value;
                            setCorrectionDrafts((prev) => ({
                              ...prev,
                              [resposta.id]: { nota, feedback: prev[resposta.id]?.feedback ?? resposta.feedback ?? '' },
                            }));
                          }}
                          placeholder="Nota"
                          className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700 outline-none focus:border-emerald-500"
                        />
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <Star size={12} />
                          / 10
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={draft.feedback ?? (resposta.feedback || '')}
                        disabled={!canCorrect}
                        onChange={(event) => {
                          const feedback = event.target.value;
                          setCorrectionDrafts((prev) => ({
                            ...prev,
                            [resposta.id]: { nota: prev[resposta.id]?.nota ?? (resposta.nota ?? ''), feedback },
                          }));
                        }}
                        placeholder="Feedback para o aluno"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => onCorrigir(resposta)}
                        disabled={!canCorrect || corrigirPending}
                        className="inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                      >
                        {corrigirPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar correção
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
};

export default AtividadeExtraClasseCard;
