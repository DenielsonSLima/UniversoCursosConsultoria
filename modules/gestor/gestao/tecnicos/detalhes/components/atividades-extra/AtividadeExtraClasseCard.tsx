import React from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { AtividadeExtraClasseRecord } from './atividadesExtraClasse.types';
import {
  formatAtividadeDate,
  formatAtividadeHoras,
  isAtividadePrazoEncerrado,
} from './atividadesExtraClasse.utils';

interface AtividadeExtraClasseCardProps {
  atividade: AtividadeExtraClasseRecord;
  onOpen: () => void;
  totalAlunos: number;
}

const AtividadeExtraClasseCard: React.FC<AtividadeExtraClasseCardProps> = ({
  atividade,
  onOpen,
  totalAlunos,
}) => {
  const respostas = atividade.respostas || [];
  const entregues = respostas.filter((resposta) => resposta.status !== 'PENDENTE').length;
  const corrigidas = respostas.filter((resposta) => resposta.status === 'CORRIGIDA').length;
  const aguardando = Math.max(totalAlunos - entregues, 0);
  const progresso = totalAlunos > 0 ? Math.min((entregues / totalAlunos) * 100, 100) : 0;
  const prazoEncerrado = isAtividadePrazoEncerrado(atividade.prazo_entrega);

  return (
    <article className="group overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6"
        aria-label={`Abrir atividade ${atividade.titulo}`}
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">
                <GraduationCap size={12} />
                {atividade.disciplina?.nome || 'Disciplina não identificada'}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                atividade.status === 'RASCUNHO'
                  ? 'border border-slate-200 bg-slate-100 text-slate-600'
                  : 'border border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}>
                {atividade.status === 'RASCUNHO' ? 'Rascunho' : 'Publicada'}
              </span>
              {prazoEncerrado && (
                <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-rose-700">
                  Prazo encerrado
                </span>
              )}
            </div>

            <h4 className="truncate text-base font-black tracking-tight text-[#001a33] sm:text-lg">
              {atividade.titulo}
            </h4>
            {atividade.tema && atividade.tema !== atividade.titulo && (
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                {atividade.tema}
              </p>
            )}

            <div className="mt-4 grid gap-2 text-[11px] font-bold text-slate-600 sm:grid-cols-3">
              <span className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                <CalendarDays size={15} className="shrink-0 text-amber-500" />
                <span className="truncate">{formatAtividadeDate(atividade.prazo_entrega)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                <UserRoundCheck size={15} className="shrink-0 text-violet-500" />
                <span className="truncate">{atividade.professor?.nome || 'Professor a definir'}</span>
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                <Clock3 size={15} className="shrink-0 text-emerald-500" />
                {formatAtividadeHoras(atividade.carga_horaria_compensacao)}h
              </span>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 xl:w-72">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Participação
                </p>
                <p className="mt-1 text-sm font-black text-[#001a33]">
                  {entregues} de {totalAlunos} entregaram
                </p>
              </div>
              <UsersRound size={21} className="text-blue-500" />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 size={12} />
                {corrigidas} corrigidas
              </span>
              <span className="text-amber-700">{aguardando} aguardando</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Clique para acompanhar a turma
          </span>
          <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
            Ver respostas
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </button>
    </article>
  );
};

export default AtividadeExtraClasseCard;
