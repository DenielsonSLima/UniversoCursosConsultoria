// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaResumo.tsx

import React, { useEffect, useState } from 'react';
import { Users, TrendingUp, AlertCircle, Calendar, Clock, Loader2, BookOpen } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';

interface TurmaResumoProps {
  turma: Turma;
}

const TurmaResumo: React.FC<TurmaResumoProps> = ({ turma }) => {
  const [loading, setLoading] = useState(true);
  const [totalAlunos, setTotalAlunos] = useState(0);
  const [progressoCurso, setProgressoCurso] = useState(0);
  const [aulasSemana, setAulasSemana] = useState<any[]>([]);

  useEffect(() => {
    const fetchResumoData = async () => {
      setLoading(true);
      try {
        // 1. Contagem de alunos matriculados reais
        const { count, error: countError } = await supabase
          .from('matriculas')
          .select('*', { count: 'exact', head: true })
          .eq('turma_id', turma.id);

        if (countError) throw countError;
        setTotalAlunos(count || 0);

        // 2. Calcular progresso do curso baseando-se nas disciplinas concluídas
        // Buscar total de disciplinas do curso
        const { data: modulosData } = await supabase
          .from('modulos')
          .select('id')
          .eq('curso_id', turma.cursoId);

        const moduloIds = (modulosData || []).map(m => m.id);
        
        let totalDisciplinas = 0;
        let concluidasCount = 0;

        if (moduloIds.length > 0) {
          const { count: discCount } = await supabase
            .from('disciplinas')
            .select('*', { count: 'exact', head: true })
            .in('modulo_id', moduloIds);
          
          totalDisciplinas = discCount || 0;

          // Buscar quantas disciplinas estão concluídas para esta turma
          const { count: completedCount } = await supabase
            .from('turmas_disciplinas')
            .select('*', { count: 'exact', head: true })
            .eq('turma_id', turma.id)
            .eq('concluida', true);
            
          concluidasCount = completedCount || 0;
        }

        const progresso = totalDisciplinas > 0 ? Math.round((concluidasCount / totalDisciplinas) * 100) : 0;
        setProgressoCurso(progresso);

        // 3. Buscar as aulas reais lançadas para esta turma
        const { data: aulasData } = await supabase
          .from('aulas_turma')
          .select('*, disciplinas(nome)')
          .eq('turma_id', turma.id);

        // Ordenar por data_aula DESC (mais recente primeiro), fallback para created_at DESC
        const sortedAulas = (aulasData || [])
          .sort((a: any, b: any) => {
            if (a.data_aula && b.data_aula) return b.data_aula.localeCompare(a.data_aula);
            if (a.data_aula) return -1;
            if (b.data_aula) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })
          .slice(0, 3);

        const mappedAulas = sortedAulas.map((a: any) => {
          const dateToUse = a.data_aula ? new Date(a.data_aula + 'T00:00:00') : (a.created_at ? new Date(a.created_at) : null);
          return {
            id: a.id,
            titulo: a.titulo,
            disciplinaNome: a.disciplinas?.nome || 'Disciplina Geral',
            cargaHoraria: parseFloat(a.carga_horaria),
            dataLabel: dateToUse 
              ? dateToUse.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase()
              : 'AULA'
          };
        });
        setAulasSemana(mappedAulas);

      } catch (err) {
        console.error('Erro ao carregar resumo da turma:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResumoData();
  }, [turma.id, turma.cursoId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando resumo operacional...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={20} /></div>
            <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded-full">Atualizado</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">{totalAlunos}</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Alunos Ativos</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded-full">100%</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">Presença</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Média Geral</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><AlertCircle size={20} /></div>
            <span className="text-slate-400 text-[10px] font-bold">Crítico</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">0</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Alunos em Risco</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
            <span className="text-slate-400 text-[10px] font-bold">Progresso</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">{progressoCurso}%</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Progresso do Curso</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Próximas Aulas / Histórico Recente */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Cronograma de Aulas Recentes</h3>
          {aulasSemana.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center">
              <Calendar size={36} className="mb-2 opacity-50 text-slate-300" />
              <p className="font-bold text-sm">Nenhuma aula registrada nesta turma ainda.</p>
              <p className="text-xs text-slate-500 mt-0.5">Cadastre e planeje aulas na aba "Grade & Profs".</p>
            </div>
          ) : (
            <div className="space-y-3">
              {aulasSemana.map((aula) => (
                <div key={aula.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex flex-col items-center justify-center bg-white w-12 h-12 rounded-lg shadow-sm text-[#001a33] font-bold text-[10px] border border-slate-100 shrink-0">
                    <span className="text-blue-500">{aula.dataLabel.split(' ')[0]}</span>
                    <span className="text-sm">{aula.dataLabel.split(' ')[1]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[#001a33] text-sm truncate">{aula.titulo}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-1 truncate">
                      <BookOpen size={12} /> {aula.disciplinaNome} • Carga: {aula.cargaHoraria}H
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase shrink-0">Registrada</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avisos / Pendências */}
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Avisos da Turma</h3>
          <div className="space-y-4 flex-1">
            <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Operacional</p>
              <p className="text-sm text-slate-700 font-medium">
                {totalAlunos === 0 
                  ? 'Matricule alunos para liberar a emissão automática de crachás e carteirinhas.' 
                  : `Matrículas ativas: ${totalAlunos} alunos no total.`}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Coordenação</p>
              <p className="text-sm text-slate-700 font-medium">Assegure a atribuição de docentes para todas as disciplinas da grade.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurmaResumo;
