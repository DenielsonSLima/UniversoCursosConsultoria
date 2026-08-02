import React, { useMemo, useState } from 'react';
import { Calendar, ChevronRight, Clock, GraduationCap, Image as ImageIcon, MonitorPlay, Pin, Search } from 'lucide-react';
import type { MatriculaAluno, ProgressDisplayState } from '../turmas.types';
import {
  MODALITY_FILTERS,
  MODALITY_LABELS,
  MODALITY_ORDER,
  formatDate,
  getMatriculaModalidade,
  hasTechnicalAcademicAccess,
  hasEadAccess,
  isEadMatricula,
  normalizeText,
} from '../turmas.utils';
import { getStudentCourseAccessKey } from '../../cursos/courseAccessHistory';
import CourseStatusBadge from './CourseStatusBadge';
import AlunoMobileCourseCard from './mobile/AlunoMobileCourseCard';
import useAlunoMobileLayout from '../../hooks/useAlunoMobileLayout';

interface AlunoTurmasListProps {
  matriculas: MatriculaAluno[];
  progressByMatricula: Map<string, number>;
  progressStateByMatricula: Map<string, ProgressDisplayState>;
  pinnedCourseKeys: string[];
  onOpen: (matricula: MatriculaAluno) => void;
  onOpenEad: (matricula: MatriculaAluno) => void;
  onTogglePinned: (matricula: MatriculaAluno) => void;
}

const getCourseKey = (matricula: MatriculaAluno) => {
  const cursoId = matricula.turmas?.cursos?.id;
  if (!cursoId) return '';
  return getStudentCourseAccessKey({
    cursoId,
    turmaId: matricula.turmas?.id || matricula.turma_id || null,
  });
};

const AlunoTurmasList: React.FC<AlunoTurmasListProps> = ({
  matriculas,
  progressByMatricula,
  progressStateByMatricula,
  pinnedCourseKeys,
  onOpen,
  onOpenEad,
  onTogglePinned,
}) => {
  const isMobileLayout = useAlunoMobileLayout();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState('todos');

  const filtered = useMemo(() => {
    const search = normalizeText(searchTerm);
    return matriculas.filter((matricula) => {
      const turma = matricula.turmas;
      const curso = turma?.cursos;
      const modality = getMatriculaModalidade(matricula);
      const searchable = normalizeText([
        curso?.nome, turma?.nome, turma?.codigo, curso?.area, curso?.modalidade,
      ].filter(Boolean).join(' '));
      return (modalityFilter === 'todos' || modality === modalityFilter)
        && (!search || searchable.includes(search));
    });
  }, [matriculas, modalityFilter, searchTerm]);

  const { pinned, grouped } = useMemo(() => {
    const pinnedSet = new Set(pinnedCourseKeys);
    const pinnedItems: MatriculaAluno[] = [];
    const groups = new Map<string, MatriculaAluno[]>();
    filtered.forEach((matricula) => {
      if (pinnedSet.has(getCourseKey(matricula))) {
        pinnedItems.push(matricula);
        return;
      }
      const modality = getMatriculaModalidade(matricula);
      groups.set(modality, [...(groups.get(modality) || []), matricula]);
    });
    return {
      pinned: pinnedItems,
      grouped: Array.from(groups.entries()).sort(
        ([a], [b]) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b),
      ),
    };
  }, [filtered, pinnedCourseKeys]);

  const renderCard = (matricula: MatriculaAluno) => {
    const turma = matricula.turmas;
    const curso = turma?.cursos;
    const ead = isEadMatricula(matricula);
    const locked = ead && !hasEadAccess(matricula);
    const waitingForTechnicalStart = getMatriculaModalidade(matricula) === 'TECNICO'
      && !hasTechnicalAcademicAccess(matricula);
    const courseKey = getCourseKey(matricula);
    const isPinned = Boolean(courseKey && pinnedCourseKeys.includes(courseKey));
    const progressState = progressStateByMatricula.get(matricula.id);
    const fallbackPercent = progressState === undefined
      && String(matricula.status || '').toUpperCase() === 'CONCLUIDO' ? 100 : 0;
    const percent = progressByMatricula.get(matricula.id) ?? fallbackPercent;
    const progressLabel = progressState?.isLoading
      ? 'carregando'
      : progressState?.isError
        ? 'indisponível'
      : waitingForTechnicalStart ? 'aguardando início' : locked ? 'bloqueado' : `${percent}%`;

    if (isMobileLayout) {
      return (
        <React.Fragment key={matricula.id}>
          <AlunoMobileCourseCard
            isPinned={isPinned}
            matricula={matricula}
            percent={percent}
            progressState={progressState}
            onOpen={onOpen}
            onOpenEad={onOpenEad}
            onTogglePinned={onTogglePinned}
          />
        </React.Fragment>
      );
    }

    return (
      <article key={matricula.id} className={`relative min-w-0 overflow-hidden rounded-[1.5rem] border bg-white shadow-sm transition-all duration-300 hover:border-blue-400 hover:shadow-md ${isPinned ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-100'}`}>
        <button
          type="button"
          onClick={() => onTogglePinned(matricula)}
          className={`absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm backdrop-blur transition sm:right-4 sm:top-4 ${isPinned ? 'border-blue-200 bg-blue-600 text-white hover:bg-blue-700' : 'border-white/70 bg-white/90 text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}
          title={isPinned ? 'Remover dos fixados' : 'Fixar no topo'}
          aria-label={isPinned ? 'Remover curso dos fixados' : 'Fixar curso no topo'}
        >
          <Pin size={15} fill={isPinned ? 'currentColor' : 'none'} />
        </button>

        <div className="aspect-[16/9] bg-slate-100">
          {curso?.imagem_url ? (
            <img src={curso.imagem_url} alt={curso.nome || turma?.nome || 'Curso'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={34} /></div>
          )}
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CourseStatusBadge status={matricula.status} />
              {isPinned ? <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700"><Pin size={10} fill="currentColor" /> Fixado</span> : null}
            </div>
            <span className="rounded bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">{curso?.modalidade || 'Turma'}</span>
          </div>

          <div className="min-h-[68px] sm:min-h-[76px]">
            <h3 className="line-clamp-2 text-base font-black leading-tight text-[#001a33]">{curso?.nome || turma?.nome || 'Curso'}</h3>
            <p className="mt-1 line-clamp-2 text-[11px] font-bold uppercase tracking-wider text-slate-450">{turma?.nome || 'Matrícula vinculada'}</p>
          </div>

          <div className="space-y-2 text-[11px] font-bold text-slate-500">
            <div className="flex items-center gap-2"><Calendar size={14} className="text-blue-500" /><span>Inscrição: {formatDate(matricula.data_matricula || matricula.created_at)}</span></div>
            <div className="flex items-center gap-2"><Clock size={14} className="text-slate-400" /><span>{ead ? `${curso?.carga_horaria || 0}h` : `Turno: ${turma?.turno || 'Geral'}`}</span></div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400"><span>Conclusão</span><span className={progressState?.isError ? 'text-rose-600' : 'text-blue-600'}>{progressLabel}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${progressState?.isLoading ? 'w-1/3 animate-pulse bg-blue-300' : progressState?.isError || locked || waitingForTechnicalStart ? 'bg-slate-300' : 'bg-blue-600'}`} style={progressState?.isLoading ? undefined : { width: progressState?.isError || locked || waitingForTechnicalStart ? '0%' : `${percent}%` }} /></div>
          </div>

          <button
            type="button"
            onClick={() => ead && !locked && curso?.id ? onOpenEad(matricula) : onOpen(matricula)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-blue-600 hover:text-white"
          >
            <span>{waitingForTechnicalStart ? 'Ver matrícula' : locked ? 'Ver status' : ead ? 'Acessar curso' : 'Abrir curso'}</span>
            {ead && !locked ? <MonitorPlay size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </article>
    );
  };

  if (matriculas.length === 0) {
    return (
      <div className="rounded-[2rem] border border-slate-100 bg-white p-7 text-center shadow-sm sm:p-12">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><GraduationCap size={28} /></div>
        <h3 className="text-base font-bold text-[#001a33]">Nenhum curso liberado</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-550">Quando a compra for confirmada, o curso aparecerá aqui com acesso direto à sala de aprendizagem.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative ml-auto w-full lg:w-80">
        <input type="search" placeholder="Buscar em meus cursos..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm [scrollbar-width:none]">
        <div className="flex min-w-max gap-2">
          {MODALITY_FILTERS.map((filter) => <button key={filter.id} type="button" onClick={() => setModalityFilter(filter.id)} className={`min-h-10 shrink-0 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${modalityFilter === filter.id ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`}>{filter.label}</button>)}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-7 text-center shadow-sm sm:p-10"><p className="text-sm font-black text-[#001a33]">Nenhum curso encontrado</p><p className="mt-1 text-xs font-bold text-slate-400">Ajuste a busca ou selecione outro tipo de curso.</p></div>
      ) : (
        <>
          {pinned.length > 0 ? <section className="space-y-3"><div className="flex items-center gap-3"><h3 className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-700"><Pin size={14} fill="currentColor" /> Cursos fixados</h3><span className="h-px flex-1 bg-blue-100" /><span className="text-[10px] font-black uppercase tracking-widest text-blue-500">{pinned.length}</span></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{pinned.map(renderCard)}</div></section> : null}
          {grouped.map(([modality, items]) => <section key={modality} className="space-y-3"><div className="flex items-center gap-3"><h3 className="text-xs font-black uppercase tracking-widest text-[#001a33]">{MODALITY_LABELS[modality] || MODALITY_LABELS.OUTROS}</h3><span className="h-px flex-1 bg-slate-100" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{items.length}</span></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(renderCard)}</div></section>)}
        </>
      )}
    </div>
  );
};

export default AlunoTurmasList;
