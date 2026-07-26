import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarRange,
  ChevronRight,
  ClipboardEdit,
  Clock3,
  GraduationCap,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import DiarioClasse from '../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse';
import {
  useProfessorDisciplinas,
  useProfessorDisciplinasRealtime,
} from '../hooks/useProfessorDisciplinas';
import TurmaEstagio from '../../gestor/gestao/tecnicos/detalhes/components/TurmaEstagio';
import AtividadesExtraClasse from '../../gestor/gestao/tecnicos/detalhes/components/AtividadesExtraClasse';

interface TurmasPageProps {
  professorId: string;
  poloId: string;
}

const TurmasPage: React.FC<TurmasPageProps> = ({ professorId, poloId }) => {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'diario' | 'estagio' | 'atividades'>('diario');
  const assignmentsQuery = useProfessorDisciplinas(professorId, poloId);
  const { data: assignments = [], isLoading: loadingAssignments, isError } = assignmentsQuery;
  const selectedAssignment = assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  ) || null;
  useProfessorDisciplinasRealtime(
    professorId,
    poloId,
    assignments.map((assignment) => assignment.turmaId),
  );

  useEffect(() => {
    setSelectedAssignmentId(null);
    setActiveDetailTab('diario');
  }, [poloId, professorId]);

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

      {isError ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-xs font-bold text-red-700" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <div>
              <p>Não foi possível carregar as disciplinas e os períodos vinculados ao professor.</p>
              <p className="mt-1 font-medium">O acesso ao diário foi bloqueado para evitar lançamentos em uma etapa fechada.</p>
              <button type="button" onClick={() => { void assignmentsQuery.refetch(); }} disabled={assignmentsQuery.isFetching}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50">
                <RefreshCw size={13} className={assignmentsQuery.isFetching ? 'animate-spin' : ''} /> Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : !selectedAssignment ? (
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
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {assignments.length} {assignments.length === 1 ? 'disciplina vinculada' : 'disciplinas vinculadas'}
              </p>
              <p className="hidden text-[10px] font-bold text-slate-400 sm:block">
                Selecione uma disciplina para acessar o diário
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {assignments.map((assignment) => (
                <article
                  key={assignment.id}
                  className="group relative flex min-h-[360px] flex-col overflow-hidden rounded-[1.75rem] border border-purple-100 bg-white p-5 shadow-[0_12px_34px_-26px_rgba(76,29,149,0.5)] transition duration-300 hover:-translate-y-1 hover:border-purple-300 hover:shadow-[0_24px_52px_-30px_rgba(124,58,237,0.55)]"
                >
                  <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-500/10 blur-3xl transition-transform duration-700 group-hover:scale-150" />

                  <div className="relative z-10 flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-purple-700">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 ring-1 ring-purple-100">
                          <BookOpen size={15} />
                        </span>
                        <p className="truncate text-[10px] font-black uppercase tracking-[0.12em]" title={assignment.turmaNome}>
                          {assignment.turmaNome}
                        </p>
                      </div>
                      {!assignment.canEdit && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-100">
                          {assignment.accessLabel}
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <h3 className="min-h-[46px] text-[16px] font-black leading-[1.35] text-[#001a33] transition-colors group-hover:text-purple-700">
                        {assignment.disciplinaNome}
                      </h3>
                      <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] font-bold text-slate-500" title={assignment.cursoNome}>
                        <GraduationCap size={13} className="shrink-0 text-purple-600" />
                        <span className="truncate">{assignment.cursoNome}</span>
                      </p>
                      <p className="mt-1 truncate text-[10px] font-semibold text-slate-400" title={assignment.turmaNome}>
                        {assignment.turmaNome} · {assignment.turno}
                      </p>
                    </div>

                    {assignment.primeiraAulaLabel && assignment.ultimaAulaLabel && (
                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/90 p-3">
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                          <CalendarRange size={13} className="text-purple-600" />
                          Período da disciplina
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Primeira aula</p>
                            <p className="mt-0.5 text-xs font-black text-[#001a33]">{assignment.primeiraAulaLabel}</p>
                          </div>
                          <div className="mb-1 h-px w-5 bg-slate-200" />
                          <div className="text-right">
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Última aula</p>
                            <p className="mt-0.5 text-xs font-black text-[#001a33]">{assignment.ultimaAulaLabel}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-purple-700">
                            <Clock3 size={12} />
                            Carga até hoje
                          </p>
                          <p className="mt-1 text-lg font-black text-[#001a33]">
                            {assignment.cargaHorariaDada}h
                          </p>
                        </div>
                        <p className="text-right text-[9px] font-black uppercase tracking-wider text-slate-400">
                          Encontros realizados
                          <span className="mt-0.5 block text-xs text-[#001a33]">
                            {assignment.totalAulasDadas}
                          </span>
                        </p>
                      </div>
                    </div>

                    {assignment.isEstagio && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-[9px] font-bold text-teal-800">
                        <Activity size={13} className="shrink-0" />
                        {assignment.cargaHorariaEstagio}h de estágio supervisionado
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssignmentId(assignment.id);
                        setActiveDetailTab('diario');
                      }}
                      className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-100"
                    >
                      <BookOpen size={13} />
                      {assignment.canEdit ? 'Abrir diário' : 'Consultar diário'}
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedAssignmentId(null)}
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
                  {selectedAssignment.cursoNome} • {selectedAssignment.turno}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Carga</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.cargaHoraria || 0}h</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ministrada</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.cargaHorariaDada}h</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Primeira aula</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.primeiraAulaLabel || 'Sem registro'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Última aula</p>
                  <p className="font-black text-[#001a33]">{selectedAssignment.ultimaAulaLabel || 'Sem registro'}</p>
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
                <p className="font-black uppercase tracking-wider">Extra-classe</p>
                <p className="mt-1 text-[11px] font-medium">Publique atividades para complementar a carga horária da disciplina.</p>
              </div>
            </div>
          </div>

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
              onClick={() => setActiveDetailTab('atividades')}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeDetailTab === 'atividades'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              Atividades extra-classe
            </button>
            {selectedAssignment.isEstagio && (
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
            )}
          </div>

          {activeDetailTab === 'atividades' ? (
            <AtividadesExtraClasse
              turmaId={selectedAssignment.turmaId}
              cursoId={selectedAssignment.cursoId}
              disciplinaIdRestrita={selectedAssignment.disciplinaId}
              professorId={professorId}
              modo="PROFESSOR"
              readOnly={!selectedAssignment.canEdit}
              readOnlyMessage={selectedAssignment.accessMessage}
            />
          ) : selectedAssignment.isEstagio && activeDetailTab === 'estagio' ? (
            <TurmaEstagio
              turma={selectedAssignment.turmaForDiario}
              modo="PROFESSOR"
              disciplinaIdRestrita={selectedAssignment.disciplinaId}
              disciplinaRestrita={selectedAssignment.disciplinaForDiario}
              readOnly={!selectedAssignment.canEdit}
              readOnlyMessage={selectedAssignment.accessMessage}
            />
          ) : (
            <DiarioClasse
              disciplina={selectedAssignment.disciplinaForDiario}
              moduloNome={selectedAssignment.raw?.modulo_nome || selectedAssignment.raw?.modulo || 'Modulo da disciplina'}
              turma={selectedAssignment.turmaForDiario}
              onBack={() => setSelectedAssignmentId(null)}
              accessMode="PROFESSOR"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
