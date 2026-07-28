import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  Trash2,
  UserRound,
  UserRoundCheck,
  UsersRound,
  Video,
} from 'lucide-react';
import { DiarioStudent } from '../diarios/diario-classe.service';
import {
  AtividadeAlunoComResposta,
  AtividadeAlunoFiltro,
  AtividadeExtraClasseRecord,
} from './atividadesExtraClasse.types';
import {
  buildAtividadeStudents,
  filterAtividadeStudents,
  formatAtividadeDate,
  formatAtividadeHoras,
  getAtividadeStudentCounts,
  getAtividadePerguntaTexto,
  getSafeAtividadeHttpUrl,
  isAtividadeRespostaAtrasada,
} from './atividadesExtraClasse.utils';

interface AtividadeExtraClasseDetalheProps {
  archivePending: boolean;
  atividade: AtividadeExtraClasseRecord;
  alunos: DiarioStudent[];
  canPublish: boolean;
  canRemove: boolean;
  onBack: () => void;
  onOpenResposta: (aluno: AtividadeAlunoComResposta) => void;
  onPublish: () => void;
  onRemove: () => void;
  publishPending: boolean;
}

const filterLabels: Record<AtividadeAlunoFiltro, string> = {
  TODOS: 'Todos',
  AGUARDANDO: 'Aguardando',
  REVISAR: 'Para revisar',
  CORRIGIDOS: 'Corrigidos',
};

const getInitials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const AtividadeExtraClasseDetalhe: React.FC<AtividadeExtraClasseDetalheProps> = ({
  archivePending,
  atividade,
  alunos,
  canPublish,
  canRemove,
  onBack,
  onOpenResposta,
  onPublish,
  onRemove,
  publishPending,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AtividadeAlunoFiltro>('TODOS');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const respostas = atividade.respostas || [];
  const perguntas = atividade.perguntas || [];
  const safeVideoUrl = getSafeAtividadeHttpUrl(atividade.video_url);

  const activityStudents = useMemo(() => {
    return buildAtividadeStudents(alunos, respostas);
  }, [alunos, respostas]);

  const counts = useMemo(() => getAtividadeStudentCounts(activityStudents), [activityStudents]);

  const visibleStudents = useMemo(
    () => filterAtividadeStudents(activityStudents, filter, search),
    [activityStudents, filter, search],
  );

  return (
    <div className="space-y-5">
      <nav aria-label="Caminho da atividade" className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
        <button type="button" onClick={onBack} className="text-blue-700 hover:text-blue-900">
          Atividades
        </button>
        <ChevronRight size={13} className="shrink-0 text-slate-300" />
        <span className="truncate text-slate-500">{atividade.titulo}</span>
      </nav>

      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50/60 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:text-blue-700"
                aria-label="Voltar para atividades"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">
                    {atividade.disciplina?.nome || 'Disciplina'}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                    atividade.status === 'RASCUNHO'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {atividade.status === 'RASCUNHO' ? 'Rascunho' : 'Publicada'}
                  </span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-[#001a33] sm:text-2xl">{atividade.titulo}</h3>
                {atividade.tema && <p className="mt-1 text-xs font-semibold text-slate-500">Tema: {atividade.tema}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {atividade.status === 'RASCUNHO' && (
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={!canPublish || publishPending}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Publicar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirmRemove) onRemove();
                  else setConfirmRemove(true);
                }}
                disabled={!canRemove || archivePending}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-50 ${
                  confirmRemove
                    ? 'border-rose-200 bg-rose-600 text-white hover:bg-rose-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
                }`}
              >
                {atividade.status === 'RASCUNHO' ? <Trash2 size={14} /> : <Archive size={14} />}
                {confirmRemove
                  ? atividade.status === 'RASCUNHO' ? 'Confirmar exclusão' : 'Confirmar arquivamento'
                  : atividade.status === 'RASCUNHO' ? 'Excluir rascunho' : 'Arquivar'}
              </button>
              {confirmRemove && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
              <CalendarDays size={17} className="text-amber-500" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Entrega</p>
                <p className="text-xs font-black text-slate-700">{formatAtividadeDate(atividade.prazo_entrega)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
              <UserRoundCheck size={17} className="text-violet-500" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Professor</p>
                <p className="truncate text-xs font-black text-slate-700">{atividade.professor?.nome || 'A definir'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
              <Clock3 size={17} className="text-emerald-500" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Carga horária</p>
                <p className="text-xs font-black text-slate-700">{formatAtividadeHoras(atividade.carga_horaria_compensacao)} horas</p>
              </div>
            </div>
          </div>
        </div>

        {(atividade.texto || safeVideoUrl || perguntas.length > 0) && (
          <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                <FileText size={14} />
                Orientações
              </div>
              <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">
                {atividade.texto || 'Sem orientações adicionais.'}
              </p>
            </div>
            <div className="space-y-3">
              {safeVideoUrl && (
                <a href={safeVideoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-black text-blue-700 hover:bg-blue-100">
                  <Video size={16} />
                  Abrir vídeo
                </a>
              )}
              {perguntas.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    <MessageSquareText size={14} />
                    {perguntas.length} pergunta(s)
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
        )}
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-blue-600" />
              <h4 className="text-base font-black text-[#001a33]">Respostas dos alunos</h4>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Acompanhe toda a turma e abra cada envio para analisar.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar aluno ou matrícula..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {([
            ['TODOS', counts.total],
            ['AGUARDANDO', counts.aguardando],
            ['REVISAR', counts.revisar],
            ['CORRIGIDOS', counts.corrigidos],
          ] as Array<[AtividadeAlunoFiltro, number]>).map(([status, count]) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              aria-pressed={filter === status}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                filter === status
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
              }`}
            >
              <span className="block text-lg font-black">{count}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.14em]">{filterLabels[status]}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {visibleStudents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <ClipboardCheck size={28} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-500">Nenhum aluno encontrado neste filtro.</p>
            </div>
          ) : visibleStudents.map((student) => {
            const resposta = student.resposta;
            const corrigida = resposta?.status === 'CORRIGIDA';
            const hasSubmission = resposta?.status === 'ENTREGUE' || resposta?.status === 'CORRIGIDA';
            const atrasada = hasSubmission ? isAtividadeRespostaAtrasada(resposta, atividade.prazo_entrega) : false;

            return (
              <button
                key={student.id}
                type="button"
                onClick={() => hasSubmission && onOpenResposta(student)}
                disabled={!hasSubmission}
                className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/30 disabled:cursor-default disabled:hover:border-slate-100 disabled:hover:bg-white sm:p-4"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                  corrigida
                    ? 'bg-emerald-100 text-emerald-700'
                    : hasSubmission
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                }`}>
                  {getInitials(student.nome) || <UserRound size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[#001a33]">{student.nome}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">
                    {[student.matricula, student.matriculaStatus].filter(Boolean).join(' • ') || 'Matrícula não identificada'}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  {hasSubmission && resposta.entregue_em && (
                    <span className="block text-[9px] font-bold text-slate-400">
                      {new Date(resposta.entregue_em).toLocaleString('pt-BR')}
                    </span>
                  )}
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                    corrigida
                      ? 'bg-emerald-50 text-emerald-700'
                      : hasSubmission
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}>
                    {corrigida ? <CheckCircle2 size={11} /> : hasSubmission ? <FileText size={11} /> : <Clock3 size={11} />}
                    {corrigida ? 'Corrigida' : hasSubmission ? (atrasada ? 'Entregue com atraso' : 'Para revisar') : 'Não enviado'}
                  </span>
                </span>
                {hasSubmission && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-[0.12em] text-blue-700">
                    <span className="hidden md:inline">Analisar</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default AtividadeExtraClasseDetalhe;
