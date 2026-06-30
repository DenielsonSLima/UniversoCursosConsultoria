import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronRight,
  ClipboardEdit,
  GraduationCap,
  Loader2,
  NotebookTabs,
  ShieldCheck,
  Users,
} from 'lucide-react';
import DiarioClasse from '../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse';
import {
  ProfessorDisciplinaAssignment,
  useProfessorDisciplinas,
  useProfessorDisciplinasRealtime,
} from '../hooks/useProfessorDisciplinas';
import TurmaEstagio from '../../gestor/gestao/tecnicos/detalhes/components/TurmaEstagio';

interface TurmasPageProps {
  professorId: string;
}

const TurmasPage: React.FC<TurmasPageProps> = ({ professorId }) => {
  const [selectedAssignment, setSelectedAssignment] = useState<ProfessorDisciplinaAssignment | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'diario' | 'estagio'>('diario');
  const { data: assignments = [], isLoading: loadingAssignments, isError } = useProfessorDisciplinas(professorId);
  useProfessorDisciplinasRealtime(professorId);

  if (loadingAssignments) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-purple-650" size={34} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Title */}
      <div>
        <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
          <GraduationCap className="text-purple-600" />
          Disciplinas do Professor
        </h2>
        <p className="text-xs text-slate-450 font-medium">
          A secretaria define turma, disciplina e próximas aulas; o professor lança diário, presença e notas.
        </p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-5 rounded-3xl text-xs font-bold">
          Não foi possível carregar as disciplinas vinculadas ao professor.
        </div>
      )}

      {!selectedAssignment ? (
        // Grid: Teacher Classes List
        assignments.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-base font-bold text-[#001a33]">Nenhuma turma vinculada</h3>
            <p className="text-slate-550 text-xs mt-1 max-w-sm mx-auto">
              Você não está registrado como docente de nenhuma turma ou disciplina ativa no momento. Solicite o vínculo na coordenação pedagógica.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignments.map((assignment) => {
              return (
                <div 
                  key={assignment.id}
                  className="bg-white rounded-[2.5rem] border border-slate-100 hover:border-purple-500 shadow-sm p-6 hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-purple-100">
                        {assignment.disciplinaNome}
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-slate-400 font-bold font-mono">
                          {assignment.cargaHoraria || 0}h total
                        </span>
                        {assignment.disciplinaForDiario?.periodoStatus === 'FECHADO' && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700">
                            Período fechado
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[#001a33] leading-tight group-hover:text-purple-600 transition-colors">
                        {assignment.turmaNome}
                      </h3>
                      <p className="text-xs text-slate-450 font-bold uppercase tracking-wider mt-1">
                        Curso: {assignment.cursoNome}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
                      <div className="flex items-center gap-2">
                        <NotebookTabs size={14} className="text-slate-400" />
                        <span>{assignment.totalAulas} aulas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <span>{assignment.proximaAulaLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-slate-400" />
                        <span>{assignment.turmaCodigo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-slate-400" />
                        <span>{assignment.status}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Horas lançadas</span>
                        <span className="text-purple-600">{assignment.horasLancadas}h / {assignment.cargaHoraria || 0}h</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white overflow-hidden">
                        <div className="h-full rounded-full bg-purple-600" style={{ width: `${assignment.progressoPercent}%` }} />
                      </div>
                      <p className="mt-3 text-[11px] font-bold text-slate-500">
                        Próxima aula: <span className="text-[#001a33]">{assignment.proximaAulaTitulo}</span>
                      </p>
                    </div>

                    {assignment.isEstagio && (
                      <div className="flex gap-2 rounded-2xl bg-teal-50 border border-teal-100 p-3 text-[11px] text-teal-800">
                        <Activity size={15} className="shrink-0 mt-0.5" />
                        <span>
                          Disciplina de estágio detectada. O diário registra presença e notas; a ficha de estágio completa continua como frente própria no gestor.
                        </span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedAssignment(assignment);
                      setActiveDetailTab('diario');
                    }}
                    className={`mt-6 w-full flex items-center justify-center gap-2 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all ${
                      assignment.disciplinaForDiario?.periodoStatus === 'FECHADO'
                        ? 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                        : 'bg-slate-50 group-hover:bg-purple-600 text-slate-600 group-hover:text-white'
                    }`}
                  >
                    <span>{assignment.disciplinaForDiario?.periodoStatus === 'FECHADO' ? 'Consultar diário fechado' : 'Abrir diário da disciplina'}</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedAssignment(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-purple-600 uppercase tracking-widest group mb-4"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para disciplinas</span>
          </button>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                  {selectedAssignment.disciplinaNome}
                </span>
                <h3 className="text-xl font-bold text-[#001a33] mt-2">{selectedAssignment.turmaNome}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {selectedAssignment.cursoNome} • {selectedAssignment.turmaCodigo}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Carga</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.cargaHoraria || 0}h</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aulas</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.totalAulas}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Próxima</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.proximaAulaLabel}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turno</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.turno}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800">
                <ClipboardEdit size={16} className="mb-2" />
                <p className="font-black uppercase tracking-wider">Diário e presença</p>
                <p className="mt-1 text-[11px] font-medium">Controle frequência por aula e práticas pedagógicas lançadas.</p>
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4 text-xs text-purple-800">
                <BookOpen size={16} className="mb-2" />
                <p className="font-black uppercase tracking-wider">Notas e recuperação</p>
                <p className="mt-1 text-[11px] font-medium">A aba de resultado usa a nota REC real do diário para recuperação.</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
                <AlertTriangle size={16} className="mb-2" />
                <p className="font-black uppercase tracking-wider">Estágio</p>
                <p className="mt-1 text-[11px] font-medium">Fichas/checklists seguem como fluxo específico, porque envolvem avaliação prática.</p>
              </div>
            </div>
          </div>

          {selectedAssignment.isEstagio && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveDetailTab('diario')}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  activeDetailTab === 'diario'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-purple-50 hover:text-purple-700'
                }`}
              >
                Diario, presenca e notas
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('estagio')}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  activeDetailTab === 'estagio'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-teal-50 hover:text-teal-700'
                }`}
              >
                Ficha de estagio
              </button>
            </div>
          )}

          {selectedAssignment.isEstagio && activeDetailTab === 'estagio' ? (
            <TurmaEstagio
              turma={selectedAssignment.turmaForDiario}
              disciplinaIdRestrita={selectedAssignment.disciplinaId}
            />
          ) : (
            <DiarioClasse
              disciplina={selectedAssignment.disciplinaForDiario}
              moduloNome={selectedAssignment.raw?.modulo_nome || selectedAssignment.raw?.modulo || 'Modulo da disciplina'}
              turma={selectedAssignment.turmaForDiario}
              onBack={() => setSelectedAssignment(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
