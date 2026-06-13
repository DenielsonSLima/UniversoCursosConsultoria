// File: modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoCursos.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, GraduationCap, Clock, AlertCircle, Plus, Check, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { parceirosService } from '../../../parceiros.service';

interface ParceiroAlunoCursosProps {
  alunoId: string;
}

const ParceiroAlunoCursos: React.FC<ParceiroAlunoCursosProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [showNewEnrollment, setShowNewEnrollment] = useState(false);
  const [selectedTurmaId, setSelectedTurmaId] = useState('');

  // 1. Carregar matrículas do aluno
  const { data: matriculas = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['matriculas', alunoId],
    queryFn: () => parceirosService.getMatriculas(alunoId),
    enabled: !!alunoId,
  });

  // 2. Carregar todas as turmas disponíveis
  const { data: allTurmas = [] } = useQuery<any[]>({
    queryKey: ['turmas_disponiveis'],
    queryFn: parceirosService.getTurmasDisponiveis,
  });

  // 3. Filtrar turmas que o aluno ainda não está matriculado
  const turmasDisponiveis = useMemo(() => {
    const matriculadoTurmaIds = matriculas.map((m: any) => m.turma_id);
    return allTurmas.filter((t: any) => !matriculadoTurmaIds.includes(t.id));
  }, [allTurmas, matriculas]);

  // 4. Realtime para a tabela de matrículas deste aluno específico
  useEffect(() => {
    if (!alunoId) return;

    const channel = supabase
      .channel(`matriculas_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matriculas',
          filter: `aluno_id=eq.${alunoId}`,
        },
        (payload) => {
          console.log('[Realtime] Mudança detectada em matrícula do aluno:', payload);
          queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] });
          queryClient.invalidateQueries({ queryKey: ['parceiros'] });
          queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  // 5. Mutações
  const statusMutation = useMutation({
    mutationFn: ({ matriculaId, newStatus }: { matriculaId: string, newStatus: string }) =>
      parceirosService.updateMatriculaStatus(matriculaId, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      alert('Status da matrícula atualizado com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao atualizar status.');
      console.error(err);
    }
  });

  const enrollMutation = useMutation({
    mutationFn: () => parceirosService.matricularAluno(alunoId, selectedTurmaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      alert('Aluno matriculado com sucesso!');
      setSelectedTurmaId('');
      setShowNewEnrollment(false);
    },
    onError: (err: any) => {
      alert('Erro ao realizar matrícula.');
      console.error(err);
    }
  });

  const handleStatusChange = async (matriculaId: string, newStatus: string) => {
    statusMutation.mutate({ matriculaId, newStatus });
  };

  const handleEnroll = async () => {
    if (!selectedTurmaId) return;
    enrollMutation.mutate();
  };

  const getStatusColor = (status: string) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'ATIVO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'CONCLUIDO':
      case 'CONCLUÍDO': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'TRANCADO': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'DESISTENTE':
      case 'CANCELADO': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
        <div className="flex items-center gap-2 text-[#001a33]">
          <BookOpen size={24} />
          <h3 className="font-black uppercase tracking-wide">Histórico Acadêmico / Cursos</h3>
        </div>
        <button
          onClick={() => setShowNewEnrollment(!showNewEnrollment)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-md shadow-blue-500/20"
        >
          <Plus size={16} /> Nova Matrícula
        </button>
      </div>

      {showNewEnrollment && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 animate-fadeIn">
          <h4 className="text-xs font-black uppercase text-[#001a33] tracking-wider mb-3">Matricular Aluno em Nova Turma</h4>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedTurmaId}
              onChange={(e) => setSelectedTurmaId(e.target.value)}
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500"
            >
              <option value="">Selecione uma turma disponível...</option>
              {turmasDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.codigo}) - {t.turno} - {t.cursoNome}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleEnroll}
                disabled={!selectedTurmaId || enrollMutation.isPending}
                className="px-5 py-3 bg-[#001a33] text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-blue-900 transition-colors disabled:opacity-50"
              >
                {enrollMutation.isPending ? 'Matriculando...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setShowNewEnrollment(false)}
                className="px-5 py-3 bg-white border border-slate-200 text-slate-505 font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
          {turmasDisponiveis.length === 0 && (
            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Nenhuma outra turma disponível para matrícula.</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-medium">Carregando dados...</div>
      ) : matriculas.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <AlertCircle className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-slate-500 font-medium text-sm">Este aluno não está matriculado em nenhum curso.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matriculas.map((mat) => {
            const turma = mat.turmas || {};
            const curso = turma.cursos || {};
            return (
              <div key={mat.id} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-300 relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {curso.modalidade || 'TÉCNICO'}
                      </span>
                      <h4 className="font-black text-[#001a33] text-lg mt-2 mb-1">{curso.nome || 'Curso'}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-550 font-medium">
                        <GraduationCap size={14} className="text-slate-400" />
                        <span>Turma: <strong>{turma.nome || 'Não informada'}</strong> ({turma.codigo})</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-slate-400" />
                        <span>Matriculado em: <strong>{new Date(mat.data_matricula).toLocaleDateString('pt-BR')}</strong></span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status do Curso:</span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(mat.status)}`}>
                        {mat.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <label className="block text-[9px] font-black text-slate-450 uppercase tracking-wider mb-1.5">Alterar Situação do Aluno neste Curso</label>
                  <select
                    value={mat.status}
                    disabled={statusMutation.isPending && statusMutation.variables?.matriculaId === mat.id}
                    onChange={(e) => handleStatusChange(mat.id, e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="ATIVO">ATIVO (CURSANDO)</option>
                    <option value="TRANCADO">TRANCADO</option>
                    <option value="CANCELADO">CANCELADO</option>
                    <option value="CONCLUIDO">CONCLUÍDO</option>
                    <option value="DESISTENTE">DESISTENTE</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoCursos;
