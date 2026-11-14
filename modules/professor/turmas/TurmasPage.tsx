import './professor-turmas.css';
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Activity, BookOpen, CheckCircle2, GraduationCap, Loader2, LockKeyhole } from 'lucide-react';
import DiarioClasse from '../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse';
import { useProfessorDisciplinas, useProfessorDisciplinasRealtime } from '../hooks/useProfessorDisciplinas';
import TurmaEstagio from '../../gestor/gestao/tecnicos/detalhes/components/TurmaEstagio';
import AtividadesExtraClasse from '../../gestor/gestao/tecnicos/detalhes/components/AtividadesExtraClasse';
import ProfessorAssignmentCard from './ProfessorAssignmentCard';

interface TurmasPageProps { professorId: string; poloId: string }
type AssignmentStatusTab = 'EM_ANDAMENTO' | 'FINALIZADAS';

const TurmasPage: React.FC<TurmasPageProps> = ({ professorId, poloId }) => {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'diario' | 'estagio' | 'atividades'>('diario');
  const [assignmentStatusTab, setAssignmentStatusTab] = useState<AssignmentStatusTab>('EM_ANDAMENTO');
  const assignmentsQuery = useProfessorDisciplinas(professorId, poloId);
  const { data: assignments = [], isLoading: loadingAssignments, isError } = assignmentsQuery;
  const ongoingAssignments = assignments.filter(assignment => !assignment.isFinalizada);
  const finalizedAssignments = assignments.filter(assignment => assignment.isFinalizada);
  const visibleAssignments = assignmentStatusTab === 'EM_ANDAMENTO' ? ongoingAssignments : finalizedAssignments;
  const selectedAssignment = assignments.find(assignment => assignment.id === selectedAssignmentId) || null;
  useProfessorDisciplinasRealtime(professorId, poloId, assignments.map(assignment => assignment.turmaId));
  useEffect(() => { setSelectedAssignmentId(null); setActiveDetailTab('diario'); setAssignmentStatusTab('EM_ANDAMENTO'); }, [poloId, professorId]);
  useEffect(() => {
    if (activeDetailTab === 'atividades' && selectedAssignment && Number(selectedAssignment.totalAtividades || 0) === 0) setActiveDetailTab('diario');
  }, [activeDetailTab, selectedAssignment]);

  if (loadingAssignments) return <p role="status" className="flex items-center justify-center gap-2 py-12 text-[13px] text-slate-500"><Loader2 size={20} className="animate-spin" />Carregando disciplinas…</p>;

  return <div className="professor-academic-workspace space-y-4">
    <header><h2 className="flex items-center gap-2"><GraduationCap size={21} className="shrink-0 text-blue-700" />Minhas disciplinas</h2>
      <p className="mt-1 text-xs text-slate-500">Diário, frequência, notas e conteúdo das aulas em um só lugar.</p></header>
    {isError ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-800">
      <p>Não foi possível carregar as disciplinas.</p><p className="mt-1 text-xs">O acesso ao diário foi bloqueado para proteger os registros. A conexão será retomada automaticamente.</p>
    </div> : !selectedAssignment ? <>
      <nav aria-label="Situação das disciplinas" className="professor-assignment-tabs">
        <button type="button" aria-current={assignmentStatusTab === 'EM_ANDAMENTO' ? 'page' : undefined} onClick={() => setAssignmentStatusTab('EM_ANDAMENTO')}><Activity size={15} />Em andamento <span className="text-xs">({ongoingAssignments.length})</span></button>
        <button type="button" aria-current={assignmentStatusTab === 'FINALIZADAS' ? 'page' : undefined} onClick={() => setAssignmentStatusTab('FINALIZADAS')}><CheckCircle2 size={15} />Finalizadas <span className="text-xs">({finalizedAssignments.length})</span></button>
      </nav>
      {!visibleAssignments.length ? <div className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
        <BookOpen size={27} className="mx-auto text-slate-400" /><h3 className="mt-3 font-medium text-[#122b42]">{assignments.length === 0 ? 'Nenhuma turma vinculada' : assignmentStatusTab === 'EM_ANDAMENTO' ? 'Nenhuma disciplina em andamento' : 'Nenhuma disciplina finalizada'}</h3>
        <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">{assignments.length === 0 ? 'Solicite o vínculo de turma e disciplina à coordenação pedagógica.' : assignmentStatusTab === 'EM_ANDAMENTO' ? 'Disciplinas abertas ou em revisão aparecerão aqui quando liberadas pela coordenação.' : 'As disciplinas aparecem aqui após o encerramento do período ou do diário pela Gestão.'}</p>
      </div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleAssignments.map(assignment => <ProfessorAssignmentCard key={assignment.id} assignment={assignment}
        onOpen={() => { setSelectedAssignmentId(assignment.id); setActiveDetailTab('diario'); }} />)}</div>}
    </> : <div className="space-y-4">
      <button type="button" onClick={() => setSelectedAssignmentId(null)} className="professor-academic-action"><ArrowLeft size={16} />Voltar às disciplinas</button>
      <section className="professor-assignment-summary">
        <h3>{selectedAssignment.disciplinaNome}</h3><p className="mt-1 break-words text-xs text-slate-600">{selectedAssignment.cursoNome} · {selectedAssignment.turmaNome} · {selectedAssignment.turno}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div><dt className="text-slate-500">Carga da disciplina</dt><dd className="mt-1">{selectedAssignment.cargaHoraria}h</dd></div>
          <div><dt className="text-slate-500">Ministrada</dt><dd className="mt-1">{selectedAssignment.cargaHorariaDada}h</dd></div>
          <div><dt className="text-slate-500">Primeira aula</dt><dd className="mt-1">{selectedAssignment.primeiraAulaLabel || 'Sem registro'}</dd></div>
          <div><dt className="text-slate-500">Última aula</dt><dd className="mt-1">{selectedAssignment.ultimaAulaLabel || 'Sem registro'}</dd></div>
        </dl>
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">Prepare o conteúdo das próximas aulas no diário. Datas, horários e carga horária são definidos pela Gestão.</p>
        {!selectedAssignment.canEdit && <p className="mt-2 text-xs text-amber-800">{selectedAssignment.accessMessage || selectedAssignment.accessLabel}</p>}
      </section>
      <nav aria-label="Atividades da disciplina" className="professor-assignment-tabs">
        <button type="button" aria-current={activeDetailTab === 'diario' ? 'page' : undefined} onClick={() => setActiveDetailTab('diario')}>Diário, presença e notas</button>
        <button type="button" aria-current={activeDetailTab === 'atividades' ? 'page' : undefined} onClick={() => setActiveDetailTab('atividades')} disabled={Number(selectedAssignment.totalAtividades || 0) === 0}
          title={Number(selectedAssignment.totalAtividades || 0) === 0 ? 'A Gestão ainda não marcou uma atividade para esta disciplina.' : undefined}>
          {Number(selectedAssignment.totalAtividades || 0) === 0 && <LockKeyhole size={13} />}Extra-classe
        </button>
        {selectedAssignment.isEstagio && <button type="button" aria-current={activeDetailTab === 'estagio' ? 'page' : undefined} onClick={() => setActiveDetailTab('estagio')}>Estágio</button>}
      </nav>
      {activeDetailTab === 'atividades' ? <AtividadesExtraClasse turmaId={selectedAssignment.turmaId} cursoId={selectedAssignment.cursoId}
        disciplinaIdRestrita={selectedAssignment.disciplinaId} professorId={professorId} modo="PROFESSOR" readOnly={!selectedAssignment.canEdit} readOnlyMessage={selectedAssignment.accessMessage} />
        : selectedAssignment.isEstagio && activeDetailTab === 'estagio' ? <TurmaEstagio turma={selectedAssignment.turmaForDiario} modo="PROFESSOR"
          disciplinaIdRestrita={selectedAssignment.disciplinaId} disciplinaRestrita={selectedAssignment.disciplinaForDiario} readOnly={!selectedAssignment.canEdit} readOnlyMessage={selectedAssignment.accessMessage} />
          : <DiarioClasse disciplina={selectedAssignment.disciplinaForDiario} moduloNome={selectedAssignment.raw?.modulo_nome || selectedAssignment.raw?.modulo || 'Módulo da disciplina'}
            turma={selectedAssignment.turmaForDiario} onBack={() => setSelectedAssignmentId(null)} accessMode="PROFESSOR" />}
    </div>}
  </div>;
};

export default TurmasPage;
