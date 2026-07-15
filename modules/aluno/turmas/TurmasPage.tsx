import React, { lazy, Suspense, useEffect, useState } from 'react';
import { GraduationCap, ShieldAlert } from 'lucide-react';
import {
  getStudentCourseAccessKey,
  getStudentPinnedCourseKeys,
  recordStudentCourseAccess,
  toggleStudentPinnedCourse,
  type StudentCourseAccessItem,
} from '../cursos/courseAccessHistory';
import AlunoTurmasList from './components/AlunoTurmasList';
import TurmaDetail from './components/TurmaDetail';
import { useAlunoTurmasData } from './hooks/useAlunoTurmasData';
import type { MatriculaAluno, TurmaDetailTab, TurmasPageProps } from './turmas.types';
import { sanitizeCourseId } from './turmas.utils';

const CursosPage = lazy(() => import('../cursos/CursosPage'));

const getCourseAccessItem = (matricula: MatriculaAluno): StudentCourseAccessItem | null => {
  const turma = matricula.turmas;
  const curso = turma?.cursos;
  if (!curso?.id) return null;
  return {
    cursoId: curso.id,
    turmaId: turma?.id || matricula.turma_id || null,
    cursoNome: curso.nome || turma?.nome || 'Curso',
    turmaNome: turma?.nome || null,
    modalidade: curso.modalidade || 'OUTROS',
    imagemUrl: curso.imagem_url || null,
  };
};

const TurmasPage: React.FC<TurmasPageProps> = ({
  alunoId,
  initialCourseId,
  initialTurmaId,
  onInitialSelectionConsumed,
}) => {
  const [selectedMatricula, setSelectedMatricula] = useState<MatriculaAluno | null>(null);
  const [detailTab, setDetailTab] = useState<TurmaDetailTab>('resumo');
  const [studyCourseId, setStudyCourseId] = useState<string | null>(null);
  const [initialSelectionConsumed, setInitialSelectionConsumed] = useState(false);
  const [pinnedCourseKeys, setPinnedCourseKeys] = useState<string[]>([]);
  const data = useAlunoTurmasData(alunoId, selectedMatricula);

  useEffect(() => {
    setPinnedCourseKeys(getStudentPinnedCourseKeys(alunoId));
  }, [alunoId]);

  const recordAccess = (matricula: MatriculaAluno) => {
    const item = getCourseAccessItem(matricula);
    if (item) recordStudentCourseAccess(alunoId, item);
  };

  const openMatricula = (matricula: MatriculaAluno) => {
    recordAccess(matricula);
    setSelectedMatricula(matricula);
    setDetailTab('resumo');
  };

  const openEadCourse = (matricula: MatriculaAluno) => {
    const courseId = matricula.turmas?.cursos?.id;
    if (!courseId) return;
    recordAccess(matricula);
    setStudyCourseId(courseId);
  };

  const togglePinned = (matricula: MatriculaAluno) => {
    const item = getCourseAccessItem(matricula);
    if (!item) return;
    recordStudentCourseAccess(alunoId, item);
    setPinnedCourseKeys(toggleStudentPinnedCourse(alunoId, getStudentCourseAccessKey(item)));
  };

  useEffect(() => {
    if (initialSelectionConsumed || data.matriculasState.isLoading) return;
    if (!initialCourseId && !initialTurmaId) return;

    const targetCourseId = sanitizeCourseId(initialCourseId);
    const targetTurmaId = sanitizeCourseId(initialTurmaId);
    let target: MatriculaAluno | null = null;

    if (targetTurmaId) {
      target = data.matriculasLiberadas.find((item) =>
        sanitizeCourseId(item.turmas?.id || item.turma_id) === targetTurmaId,
      ) || null;
    }
    if (!target && targetCourseId) {
      const candidates = data.matriculasLiberadas.filter((item) =>
        sanitizeCourseId(item.turmas?.cursos?.id) === targetCourseId,
      );
      target = candidates.find((item) => String(item.status || '').toUpperCase() === 'ATIVO')
        || candidates[0]
        || null;
    }
    if (target) openMatricula(target);
    setInitialSelectionConsumed(true);
    onInitialSelectionConsumed?.();
  }, [
    data.matriculasLiberadas,
    data.matriculasState.isLoading,
    initialCourseId,
    initialSelectionConsumed,
    initialTurmaId,
    onInitialSelectionConsumed,
  ]);

  if (data.matriculasState.isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  if (data.matriculasState.isError) {
    return (
      <div role="alert" className="flex flex-col gap-4 rounded-3xl border border-red-150 bg-red-50 p-5 text-red-700 sm:flex-row sm:items-center sm:p-8">
        <ShieldAlert size={24} />
        <div className="flex-1"><p className="font-bold">Não consegui carregar seus cursos</p><p className="text-xs">Ocorreu uma falha de consulta. Tente novamente em instantes.</p></div>
        <button type="button" onClick={() => void data.matriculasState.refetch()} className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest sm:w-auto">Recarregar</button>
      </div>
    );
  }

  if (studyCourseId) {
    return (
      <Suspense fallback={<div className="flex min-h-[240px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>}>
        <CursosPage alunoId={alunoId} initialCourseId={studyCourseId} onExitCourse={() => setStudyCourseId(null)} />
      </Suspense>
    );
  }

  return (
    <div className="min-w-0 space-y-5 animate-fadeIn sm:space-y-6">
      <div className="mb-5 sm:mb-6">
        <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33] sm:text-2xl"><GraduationCap className="shrink-0 text-blue-600" size={22} /> Meus Cursos</h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">Acesse suas turmas, acompanhe o progresso e consulte certificados.</p>
      </div>

      {selectedMatricula ? (
        <TurmaDetail
          alunoId={alunoId}
          matricula={selectedMatricula}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
          onBack={() => setSelectedMatricula(null)}
          onOpenEad={() => openEadCourse(selectedMatricula)}
          data={data}
        />
      ) : (
        <AlunoTurmasList
          matriculas={data.matriculasLiberadas}
          progressByMatricula={data.progressByMatricula}
          progressStateByMatricula={data.progressStateByMatricula}
          pinnedCourseKeys={pinnedCourseKeys}
          onOpen={openMatricula}
          onOpenEad={openEadCourse}
          onTogglePinned={togglePinned}
        />
      )}
    </div>
  );
};

export default TurmasPage;
