import {
  ChevronRight,
  Image as ImageIcon,
  MonitorPlay,
  Pin,
} from 'lucide-react';

import type { MatriculaAluno, ProgressDisplayState } from '../../turmas.types';
import {
  getMatriculaModalidade,
  hasEadAccess,
  hasTechnicalAcademicAccess,
  isEadMatricula,
} from '../../turmas.utils';
import CourseStatusBadge from '../CourseStatusBadge';

type AlunoMobileCourseCardProps = {
  isPinned: boolean;
  matricula: MatriculaAluno;
  percent: number;
  progressState?: ProgressDisplayState;
  onOpen: (matricula: MatriculaAluno) => void;
  onOpenEad: (matricula: MatriculaAluno) => void;
  onTogglePinned: (matricula: MatriculaAluno) => void;
};

const modalityLabel = (value: string) => {
  if (value === 'TECNICO') return 'Técnico';
  if (value === 'ESPECIALIZACAO') return 'Especialização';
  if (value === 'LIVRE') return 'Curso livre';
  if (value === 'EAD') return 'EAD';
  return 'Curso';
};

const AlunoMobileCourseCard = ({
  isPinned,
  matricula,
  percent,
  progressState,
  onOpen,
  onOpenEad,
  onTogglePinned,
}: AlunoMobileCourseCardProps) => {
  const turma = matricula.turmas;
  const curso = turma?.cursos;
  const modality = getMatriculaModalidade(matricula);
  const ead = isEadMatricula(matricula);
  const locked = ead && !hasEadAccess(matricula);
  const waitingForTechnicalStart = modality === 'TECNICO' && !hasTechnicalAcademicAccess(matricula);
  const progressLabel = progressState?.isLoading
    ? 'Carregando'
    : progressState?.isError
      ? 'Indisponível'
      : waitingForTechnicalStart
        ? 'Aguardando início'
        : locked
          ? 'Bloqueado'
          : `${percent}% concluído`;

  const openCourse = () => {
    if (ead && !locked && curso?.id) {
      onOpenEad(matricula);
      return;
    }
    onOpen(matricula);
  };

  return (
    <article className={`relative overflow-hidden rounded-[1.5rem] border bg-white shadow-sm md:hidden ${
      isPinned ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200/80'
    }`}>
      <div className="flex gap-3 p-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.2rem] bg-slate-100">
          {curso?.imagem_url ? (
            <img
              src={curso.imagem_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={25} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">
                {modalityLabel(modality)}
              </span>
              <h3 className="mt-1 line-clamp-2 text-sm font-black leading-snug text-[#001a33]">
                {curso?.nome || turma?.nome || 'Curso'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onTogglePinned(matricula)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                isPinned
                  ? 'border-blue-200 bg-blue-600 text-white'
                  : 'border-slate-100 bg-slate-50 text-slate-400 active:border-blue-200 active:text-blue-700'
              }`}
              aria-label={isPinned ? 'Remover curso dos fixados' : 'Fixar curso no topo'}
            >
              <Pin size={14} fill={isPinned ? 'currentColor' : 'none'} />
            </button>
          </div>

          <p className="mt-1 line-clamp-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {turma?.nome || 'Matrícula vinculada'}
          </p>
          <div className="mt-2 origin-left">
            <CourseStatusBadge status={matricula.status} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
        <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider">
          <span className="text-slate-400">Progresso</span>
          <span className={progressState?.isError ? 'text-rose-600' : 'text-blue-600'}>{progressLabel}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label={`Progresso em ${curso?.nome || turma?.nome || 'curso'}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressState?.isLoading || progressState?.isError || locked || waitingForTechnicalStart ? undefined : percent}
          aria-valuetext={progressLabel}
        >
          <div
            className={`h-full rounded-full ${
              progressState?.isLoading
                ? 'w-1/3 animate-pulse bg-blue-300 motion-reduce:animate-none'
                : progressState?.isError || locked || waitingForTechnicalStart
                  ? 'bg-slate-300'
                  : 'bg-blue-600'
            }`}
            style={progressState?.isLoading ? undefined : {
              width: progressState?.isError || locked || waitingForTechnicalStart ? '0%' : `${percent}%`,
            }}
          />
        </div>

        <button
          type="button"
          onClick={openCourse}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-sm active:bg-blue-700"
        >
          <span>{waitingForTechnicalStart ? 'Ver matrícula' : locked ? 'Ver status' : ead ? 'Acessar curso' : 'Abrir curso'}</span>
          {ead && !locked ? <MonitorPlay size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
    </article>
  );
};

export default AlunoMobileCourseCard;
