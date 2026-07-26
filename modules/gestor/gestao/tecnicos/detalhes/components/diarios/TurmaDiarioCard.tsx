import React from 'react';
import {
  BookOpen,
  CalendarRange,
  FileCheck2,
  FilePlus2,
  Gauge,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import {
  DiarioExportMode,
  TurmaDiarioDisciplina,
} from './turma-diarios.types';

interface TurmaDiarioCardProps {
  disciplina: TurmaDiarioDisciplina;
  onOpen: () => void;
  onOpenPdf: (mode: DiarioExportMode) => void;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Não planejada';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const TurmaDiarioCard: React.FC<TurmaDiarioCardProps> = ({
  disciplina,
  onOpen,
  onOpenPdf,
}) => {
  const isUnassigned = disciplina.professor === 'Não atribuído';
  const isClosed = disciplina.periodoStatus === 'FECHADO' || disciplina.bloqueioDiario === 'TOTAL';
  const isReview = disciplina.bloqueioDiario === 'PROFESSOR';
  const isAwaitingReview = !isClosed && !isReview && disciplina.progressoPercent >= 100;
  const isExcess = disciplina.horasStatus === 'EXCESSO';

  return (
    <article className="group flex min-h-[342px] flex-col overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white shadow-[0_12px_34px_-24px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_22px_50px_-28px_rgba(37,99,235,0.45)]">
      <div className="h-1.5 bg-gradient-to-r from-[#0879d8] via-[#2563eb] to-[#001a33]" />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <BookOpen size={19} />
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
            isClosed
              ? 'bg-slate-100 text-slate-600'
              : isReview
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                : isAwaitingReview
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
          }`}>
            {isClosed && <LockKeyhole size={10} />}
            {isClosed ? 'Fechado' : isReview ? 'Em revisão' : isAwaitingReview ? 'Aguardando revisão' : 'Em andamento'}
          </span>
        </div>

        <h5 className="min-h-[44px] text-[15px] font-black leading-[1.35] text-[#001a33]">
          {disciplina.nome}
        </h5>

        <div className="mt-3 flex min-h-[34px] items-start gap-2 text-[11px] leading-4 text-slate-500">
          <UserRound size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            <span className="font-semibold text-slate-400">Professor(a)</span>
            <strong className={`ml-1 font-bold ${isUnassigned ? 'text-rose-600' : 'text-slate-700'}`}>
              {disciplina.professor}
            </strong>
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            <CalendarRange size={13} className="text-blue-600" />
            Período das aulas
          </div>
          <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-end gap-2 text-xs font-bold text-slate-700">
            <span>
              <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">
                Primeira aula
              </span>
              {formatDate(disciplina.primeiraAula)}
            </span>
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-right">
              <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">
                Última aula
              </span>
              {formatDate(disciplina.ultimaAula)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-100 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <Gauge size={11} /> Presença geral
            </div>
            <p className="mt-1 text-sm font-black text-[#001a33]">
              {disciplina.presencaGeralPercent === null
                ? 'Sem lançamento'
                : `${disciplina.presencaGeralPercent}%`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Carga lançada</p>
            <p className={`mt-1 text-sm font-black ${isExcess ? 'text-rose-600' : 'text-[#001a33]'}`}>
              {disciplina.horasRealizadas}h / {disciplina.cargaHoraria}h
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${
              isExcess ? 'bg-rose-500' : 'bg-blue-600'
            }`}
            style={{ width: `${disciplina.progressoPercent}%` }}
          />
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-blue-800"
          >
            <BookOpen size={13} />
            {isClosed ? 'Visualizar diário' : 'Acessar diário'}
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenPdf('PREENCHIDO')}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
            >
              <FileCheck2 size={12} /> PDF preenchido
            </button>
            <button
              type="button"
              onClick={() => onOpenPdf('EM_BRANCO')}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <FilePlus2 size={12} /> PDF em branco
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

export default TurmaDiarioCard;
