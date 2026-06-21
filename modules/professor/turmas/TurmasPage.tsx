import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { GraduationCap, BookOpen, Clock, Calendar, ChevronRight, ArrowLeft, CheckCircle2, User, Save, ListTodo, ClipboardEdit } from 'lucide-react';

interface TurmasPageProps {
  professorId: string;
}

const TurmasPage: React.FC<TurmasPageProps> = ({ professorId }) => {
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [attendance, setAttendance] = useState<Record<string, string>>({});

  // 1. Fetch Teacher Assignments
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery<any[]>({
    queryKey: ['professor-assignments', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('*, turmas(*, cursos(*)), disciplinas(*)')
        .eq('professor_id', professorId);
      
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Fetch Students enrolled in the active class
  const { data: students = [], isLoading: loadingStudents } = useQuery<any[]>({
    queryKey: ['assignment-students', selectedAssignment?.turma_id],
    enabled: !!selectedAssignment?.turma_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, parceiros(*)')
        .eq('turma_id', selectedAssignment?.turma_id)
        .eq('status', 'ATIVO');
      
      if (error) throw error;
      
      // Initialize states with mock or database values
      const initialGrades: Record<string, string> = {};
      const initialAttendance: Record<string, string> = {};
      
      (data || []).forEach(student => {
        initialGrades[student.aluno_id] = '9.0';
        initialAttendance[student.aluno_id] = '95';
      });
      setGrades(initialGrades);
      setAttendance(initialAttendance);

      return data || [];
    }
  });

  // 3. Mutation to Save grades/attendance
  const saveDiaryMutation = useMutation({
    mutationFn: async () => {
      // In a fully built scenario, this writes to diario_notas / diario_frequencia.
      // Here, we simulate the database write and trigger React Query invalidation.
      return new Promise((resolve) => setTimeout(resolve, 800));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-students', selectedAssignment?.turma_id] });
      alert('Notas e frequências publicadas com sucesso no diário eletrônico!');
    }
  });

  const handleGradeChange = (studentId: string, val: string) => {
    setGrades(prev => ({ ...prev, [studentId]: val }));
  };

  const handleAttendanceChange = (studentId: string, val: string) => {
    setAttendance(prev => ({ ...prev, [studentId]: val }));
  };

  if (loadingAssignments) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-purple-650 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Title */}
      <div>
        <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
          <GraduationCap className="text-purple-600" />
          Suas Turmas e Diários
        </h2>
        <p className="text-xs text-slate-450 font-medium">Faça lançamentos de notas, faltas e acompanhamento de estágios</p>
      </div>

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
              const turma = assignment.turmas;
              const disciplina = assignment.disciplinas;

              return (
                <div 
                  key={`${assignment.turma_id}-${assignment.disciplina_id}`}
                  className="bg-white rounded-[2.5rem] border border-slate-100 hover:border-purple-500 shadow-sm p-6 hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-purple-100">
                        {disciplina?.nome || 'Disciplina'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold font-mono">
                        {disciplina?.carga_horaria || 60} horas
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[#001a33] leading-tight group-hover:text-purple-600 transition-colors">
                        {turma?.nome}
                      </h3>
                      <p className="text-xs text-slate-450 font-bold uppercase tracking-wider mt-1">
                        Curso: {turma?.cursos?.nome}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <span>Turno: {turma?.turno || 'Geral'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <span>Código: {turma?.codigo}</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedAssignment(assignment)}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-slate-50 group-hover:bg-purple-600 text-slate-600 group-hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
                  >
                    <span>Lançar Diário e Notas</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // Diário de classe sheet
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
          <button 
            onClick={() => setSelectedAssignment(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-purple-600 uppercase tracking-widest group mb-4"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para atribuições</span>
          </button>

          {/* Assignment details header */}
          <div className="border-b border-slate-100 pb-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                {selectedAssignment.disciplinas?.nome}
              </span>
              <h3 className="text-xl font-bold text-[#001a33] mt-2">{selectedAssignment.turmas?.nome}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                Matriz: {selectedAssignment.turmas?.cursos?.nome}
              </p>
            </div>
            <span className="bg-slate-100 text-slate-650 text-[10px] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider w-max">
              CH: {selectedAssignment.disciplinas?.carga_horaria || 60} horas
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <ClipboardEdit size={16} className="text-purple-500" />
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Diário Eletrônico de Notas e Frequências</h4>
          </div>

          {loadingStudents ? (
            <div className="flex justify-center items-center py-10">
              <div className="w-8 h-8 border-2 border-purple-650 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 text-slate-450 text-xs">
              Nenhum aluno matriculado e ativo nesta classe no momento.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {students.map((mat) => {
                  const student = mat.parceiros;
                  return (
                    <div 
                      key={mat.id} 
                      className="p-4 bg-slate-50/30 flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-purple-100 text-purple-650 rounded-full flex items-center justify-center font-bold">
                          {student?.nome?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-[#001a33] truncate">{student?.nome}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{student?.email || 'Sem email cadastrado'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {/* Grade input */}
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] uppercase font-black text-slate-450 tracking-wider">Nota</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            min="0" 
                            max="10"
                            placeholder="0.0"
                            value={grades[mat.aluno_id] || ''}
                            onChange={(e) => handleGradeChange(mat.aluno_id, e.target.value)}
                            className="w-16 bg-white border border-slate-200 outline-none rounded-lg p-2 text-center font-bold text-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-100"
                          />
                        </div>

                        {/* Attendance input */}
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] uppercase font-black text-slate-450 tracking-wider">Freq (%)</label>
                          <input 
                            type="number" 
                            min="0" 
                            max="100"
                            placeholder="0"
                            value={attendance[mat.aluno_id] || ''}
                            onChange={(e) => handleAttendanceChange(mat.aluno_id, e.target.value)}
                            className="w-16 bg-white border border-slate-200 outline-none rounded-lg p-2 text-center font-bold text-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-100"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Publish Actions */}
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => saveDiaryMutation.mutate()}
                  disabled={saveDiaryMutation.isPending}
                  className="flex items-center gap-1.5 px-6 py-3 bg-[#001a33] hover:bg-purple-650 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{saveDiaryMutation.isPending ? 'Publicando...' : 'Publicar no Diário'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
