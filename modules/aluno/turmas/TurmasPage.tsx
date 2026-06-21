import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { GraduationCap, Calendar, Clock, BookOpen, ChevronRight, ArrowLeft, CheckCircle, AlertCircle, FileSpreadsheet, User, ShieldAlert } from 'lucide-react';

interface TurmasPageProps {
  alunoId: string;
}

const TurmasPage: React.FC<TurmasPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [selectedTurma, setSelectedTurma] = useState<any | null>(null);

  // 1. Fetch Student Enrollments
  const { data: matriculas = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['aluno-matriculas', alunoId],
    queryFn: async () => {
      const { data, error: fetchErr } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId);

      if (fetchErr) throw fetchErr;
      return data || [];
    }
  });

  // 2. Realtime subscription for updates
  useEffect(() => {
    const channel = supabase
      .channel(`aluno_matriculas_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}` },
        () => {
          console.log('Realtime change detected in Aluno Matriculas, invalidating query...');
          queryClient.invalidateQueries({ queryKey: ['aluno-matriculas', alunoId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  // 3. Fetch Disciplines for Selected Class
  const { data: disciplines = [], isLoading: loadingDisciplines } = useQuery<any[]>({
    queryKey: ['turma-disciplinas', selectedTurma?.turmas?.id],
    enabled: !!selectedTurma?.turmas?.id,
    queryFn: async () => {
      const { data, error: descErr } = await supabase
        .from('turmas_disciplinas')
        .select('*, disciplinas(*)')
        .eq('turma_id', selectedTurma?.turmas?.id);
      
      if (descErr) throw descErr;
      return data || [];
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ATIVO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Ativa
          </span>
        );
      case 'TRANCADO':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <AlertCircle size={10} /> Trancada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
            Inativa
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 bg-red-50 text-red-700 rounded-3xl border border-red-150 flex items-center gap-3">
        <ShieldAlert size={24} />
        <div>
          <p className="font-bold">Erro ao carregar turmas</p>
          <p className="text-xs">{error instanceof Error ? error.message : 'Falha na conexão com o banco.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Panel */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <GraduationCap className="text-blue-600" />
            Minhas Turmas
          </h2>
          <p className="text-xs text-slate-400 font-medium">Acompanhe suas aulas, disciplinas e rendimento acadêmico</p>
        </div>
      </div>

      {!selectedTurma ? (
        // Grid: Enrolled Classes List
        matriculas.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-base font-bold text-[#001a33]">Nenhuma matrícula ativa</h3>
            <p className="text-slate-550 text-xs mt-1 max-w-sm mx-auto">
              Você ainda não foi vinculado a nenhuma turma no momento. Entre em contato com a secretaria pelo suporte do portal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {matriculas.map((mat) => {
              const turma = mat.turmas;
              const curso = turma?.cursos;

              return (
                <div 
                  key={mat.id}
                  className="bg-white rounded-[2.5rem] border border-slate-100 hover:border-blue-500 shadow-sm p-6 hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-2">
                      {getStatusBadge(mat.status)}
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded">
                        {curso?.modalidade}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[#001a33] leading-tight group-hover:text-blue-600 transition-colors">
                        {turma?.nome}
                      </h3>
                      <p className="text-xs text-slate-450 font-bold uppercase tracking-wider mt-1">{curso?.nome}</p>
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
                    onClick={() => setSelectedTurma(mat)}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-slate-50 group-hover:bg-blue-600 text-slate-600 group-hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
                  >
                    <span>Ver Diário e Notas</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // Detailed Class View (Diário de Classe & Academic records)
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
          <button 
            onClick={() => setSelectedTurma(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 uppercase tracking-widest group mb-4"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para turmas</span>
          </button>

          {/* Details header */}
          <div className="border-b border-slate-100 pb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-[#001a33]">{selectedTurma.turmas?.nome}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                Matriz: {selectedTurma.turmas?.cursos?.nome}
              </p>
            </div>
            <div className="flex gap-2">
              {getStatusBadge(selectedTurma.status)}
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Carga: {selectedTurma.turmas?.cursos?.carga_horaria || 800}h
              </span>
            </div>
          </div>

          {/* Simulated academic metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
            <div className="p-5 bg-blue-50/30 border border-blue-50 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Frequência Geral</p>
              <p className="text-2xl font-black text-blue-700">92%</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </div>

            <div className="p-5 bg-emerald-50/30 border border-emerald-50 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Média Acadêmica</p>
              <p className="text-2xl font-black text-emerald-700">8.7 <span className="text-xs font-normal text-slate-400">/ 10</span></p>
              <p className="text-[9px] text-slate-500 font-medium mt-2">Abaixo de 7.0 é recuperação</p>
            </div>

            <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Aulas Ministradas</p>
              <p className="text-2xl font-black text-slate-700">144 / 360h</p>
              <p className="text-[9px] text-slate-500 font-medium mt-2">Progresso do curso: 40%</p>
            </div>
          </div>

          {/* Disciplines list */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-blue-500" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Grades e Disciplinas do Período</h4>
            </div>

            {loadingDisciplines ? (
              <div className="flex justify-center items-center py-6">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : disciplines.length === 0 ? (
              /* Fallback list if table has no linked rows for this turma */
              <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                <div className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#001a33]">Fundamentos e Ética Profissional</p>
                    <p className="text-[10px] text-slate-400">Carga: 60h | Docente: Prof. Carlos Silva</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Nota Final</p>
                      <p className="font-bold text-emerald-600">9.0 (Aprovado)</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Presença</p>
                      <p className="font-bold text-slate-700">95%</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#001a33]">Anatomia e Fisiologia Humana</p>
                    <p className="text-[10px] text-slate-400">Carga: 80h | Docente: Profa. Márcia Rocha</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Nota Final</p>
                      <p className="font-bold text-emerald-600">8.5 (Aprovado)</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Presença</p>
                      <p className="font-bold text-slate-700">92%</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#001a33]">Técnicas Básicas de Enfermagem / Radiologia</p>
                    <p className="text-[10px] text-slate-400">Carga: 120h | Docente: Prof. Douglas Santos</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Nota Parcial</p>
                      <p className="font-bold text-blue-600">7.8 (Em Andamento)</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Presença</p>
                      <p className="font-bold text-slate-700">90%</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {disciplines.map((d: any) => (
                  <div key={d.id} className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                    <div className="space-y-0.5">
                      <p className="font-bold text-[#001a33]">{d.disciplinas?.nome || 'Disciplina'}</p>
                      <p className="text-[10px] text-slate-400">
                        Carga: {d.disciplinas?.carga_horaria || 60}h | Docente: {d.professor_nome || 'A definir'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Status</p>
                        <p className={`font-bold ${d.concluida ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {d.concluida ? 'Concluída' : 'Em Andamento'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
