import React from 'react';
import {
  Link as LinkIcon,
  MessageSquareText,
  Send,
  Video,
} from 'lucide-react';
import { AtividadeExtraClasse } from './alunoAtividadesExtra.types';
import {
  formatAlunoAtividadeDate,
  formatAlunoAtividadeHoras,
  getAtividadeRespostaAtual,
  getPerguntaTexto,
  getSafeAlunoAtividadeHttpUrl,
  isAlunoAtividadeEntregaAtrasada,
  isAlunoAtividadePrazoEncerrado,
} from './alunoAtividadesExtra.utils';

interface AlunoAtividadeExtraClasseCardProps {
  atividade: AtividadeExtraClasse;
  getAtividadeDraftAnexo: (atividade: AtividadeExtraClasse) => string;
  getAtividadeDraftResposta: (atividade: AtividadeExtraClasse, index: number) => string;
  getAtividadeDraftTexto: (atividade: AtividadeExtraClasse) => string;
  isSubmitting: boolean;
  onSubmit: (atividade: AtividadeExtraClasse) => void;
  updateAtividadeDraft: (
    atividadeId: string,
    patch: { texto?: string; anexoUrl?: string; respostas?: Record<number, string> },
  ) => void;
}

const AlunoAtividadeExtraClasseCard: React.FC<AlunoAtividadeExtraClasseCardProps> = ({
  atividade,
  getAtividadeDraftAnexo,
  getAtividadeDraftResposta,
  getAtividadeDraftTexto,
  isSubmitting,
  onSubmit,
  updateAtividadeDraft,
}) => {
  const perguntas = Array.isArray(atividade.perguntas) ? atividade.perguntas : [];
  const respostaAtual = getAtividadeRespostaAtual(atividade);
  const corrigida = respostaAtual?.status === 'CORRIGIDA';
  const entregue = Boolean(respostaAtual);
  const prazoEncerrado = isAlunoAtividadePrazoEncerrado(atividade.prazo_entrega);
  const entregaAtrasada = isAlunoAtividadeEntregaAtrasada(respostaAtual, atividade.prazo_entrega);
  const podeEditar = !corrigida && !prazoEncerrado && !isSubmitting;
  const safeVideoUrl = getSafeAlunoAtividadeHttpUrl(atividade.video_url);
  const safeAnexoUrl = getSafeAlunoAtividadeHttpUrl(respostaAtual?.anexo_url, true);
  const aceitaTexto = ['TEXTO', 'MISTO'].includes(atividade.tipo_resposta);
  const aceitaLink = ['ENVIO', 'MISTO'].includes(atividade.tipo_resposta);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
              {atividade.disciplina?.nome || 'Disciplina não identificada'}
            </span>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
              {formatAlunoAtividadeHoras(atividade.carga_horaria_compensacao)}h
            </span>
            <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
              Prazo: {formatAlunoAtividadeDate(atividade.prazo_entrega)}
            </span>
            {entregue && (
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                corrigida ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
              }`}>
                {corrigida ? 'Corrigida' : 'Entregue'}
              </span>
            )}
            {respostaAtual?.entregue_em && (
              <span className="text-[10px] font-bold text-slate-400">
                Enviada em {new Date(respostaAtual.entregue_em).toLocaleString('pt-BR')}
              </span>
            )}
            {prazoEncerrado && !entregue && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                Atrasada
              </span>
            )}
            {entregaAtrasada && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                Entregue com atraso
              </span>
            )}
          </div>
          <h5 className="text-base font-black leading-tight text-[#001a33]">{atividade.titulo}</h5>
          {atividade.tema && <p className="mt-1 text-xs font-bold text-slate-500">Tema: {atividade.tema}</p>}
        </div>

        {corrigida && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800 lg:w-56">
            <p className="text-[9px] font-black uppercase tracking-widest">Correção</p>
            <p className="mt-1 font-black">Nota: {respostaAtual.nota ?? '--'}</p>
            {respostaAtual.corrigido_em && (
              <p className="mt-1 text-[10px] font-bold text-emerald-700">
                Corrigida em {new Date(respostaAtual.corrigido_em).toLocaleString('pt-BR')}
              </p>
            )}
            {respostaAtual.feedback && (
              <p className="mt-2 whitespace-pre-wrap font-semibold leading-relaxed">{respostaAtual.feedback}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {atividade.texto && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <MessageSquareText size={13} />
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
              className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-black text-blue-700"
            >
              <Video size={16} />
              Abrir vídeo da atividade
            </a>
          )}

          {['PERGUNTAS', 'MISTO'].includes(atividade.tipo_resposta) && perguntas.length > 0 && (
            <div className="space-y-3">
              {perguntas.map((pergunta, index) => (
                <label key={`${atividade.id}-pergunta-${index}`} className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {index + 1}. {getPerguntaTexto(pergunta, index)}
                  </span>
                  <textarea
                    rows={3}
                    disabled={!podeEditar}
                    value={getAtividadeDraftResposta(atividade, index)}
                    onChange={(event) => updateAtividadeDraft(atividade.id, {
                      respostas: { [index]: event.target.value },
                    })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="Sua resposta"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${aceitaTexto && aceitaLink ? 'lg:grid-cols-[1fr_260px]' : ''}`}>
        {aceitaTexto && (
          <textarea
            rows={4}
            disabled={!podeEditar}
            value={getAtividadeDraftTexto(atividade)}
            onChange={(event) => updateAtividadeDraft(atividade.id, { texto: event.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Resposta em texto"
          />
        )}

        <div className="space-y-3">
          {aceitaLink && (
            <div className="relative">
            <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              disabled={!podeEditar}
              value={getAtividadeDraftAnexo(atividade)}
              onChange={(event) => updateAtividadeDraft(atividade.id, { anexoUrl: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Link do trabalho (HTTPS)"
            />
            {!podeEditar && safeAnexoUrl && (
              <a
                href={safeAnexoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-[10px] font-black uppercase tracking-widest text-blue-700 underline"
              >
                Abrir link do trabalho (HTTPS)
              </a>
            )}
            {podeEditar && (
              <p className="mt-1 text-[9px] font-bold text-slate-400">
                Informe um link HTTPS compartilhável. Este campo não envia arquivos.
              </p>
            )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onSubmit(atividade)}
            disabled={!podeEditar}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {corrigida ? 'Atividade corrigida' : prazoEncerrado ? 'Prazo encerrado' : entregue ? 'Atualizar envio' : 'Enviar atividade'}
          </button>
        </div>
      </div>

      {prazoEncerrado && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          O prazo foi encerrado. A resposta permanece disponível para consulta, mas não pode mais ser enviada ou alterada.
        </div>
      )}
    </article>
  );
};

export default AlunoAtividadeExtraClasseCard;
