import React from 'react';
import { AlertCircle, BookOpen, Calendar, Clock, Loader2, TrendingUp, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { academicLifecycleService } from '../academic-lifecycle.service';

interface TurmaResumoProps {
  turma: Turma;
}

const TurmaResumo: React.FC<TurmaResumoProps> = ({ turma }) => {
  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: academicLifecycleKeys.resumo(turma.id),
    queryFn: () => academicLifecycleService.getResumo(turma.id),
  });

  const { data: recentClasses = [], isLoading: loadingClasses } = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turma.id), 'aulas-recentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aulas_turma')
        .select('id, titulo, carga_horaria, data_aula, created_at, disciplinas(nome)')
        .eq('turma_id', turma.id)
        .order('data_aula', { ascending: false, nullsFirst: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
  });

  if (loadingResumo || loadingClasses) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando resumo acadêmico...</span>
      </div>
    );
  }

  const cards = [
    {
      label: 'Alunos Ativos',
      value: resumo?.alunosAtivos ?? 0,
      icon: Users,
      iconClass: 'bg-blue-50 text-blue-600',
      empty: false,
    },
    {
      label: 'Frequência Média',
      value: resumo?.frequenciaMedia === null || resumo?.frequenciaMedia === undefined
        ? 'Sem dados'
        : `${resumo.frequenciaMedia}%`,
      icon: TrendingUp,
      iconClass: 'bg-emerald-50 text-emerald-600',
      empty: resumo?.frequenciaMedia === null || resumo?.frequenciaMedia === undefined,
    },
    {
      label: 'Alunos em Risco',
      value: resumo?.alunosEmRisco ?? 0,
      icon: AlertCircle,
      iconClass: 'bg-rose-50 text-rose-600',
      empty: false,
    },
    {
      label: 'Progresso do Curso',
      value: resumo?.progressoCurso === null || resumo?.progressoCurso === undefined
        ? 'Sem grade'
        : `${resumo.progressoCurso}%`,
      icon: Clock,
      iconClass: 'bg-amber-50 text-amber-600',
      empty: resumo?.progressoCurso === null || resumo?.progressoCurso === undefined,
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className={`inline-flex p-2 rounded-lg mb-3 ${card.iconClass}`}>
                <Icon size={20} />
              </div>
              <p className={`font-black text-[#001a33] ${card.empty ? 'text-lg' : 'text-2xl'}`}>{card.value}</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Aulas recentes</h3>
          {recentClasses.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center">
              <Calendar size={36} className="mb-2 opacity-50 text-slate-300" />
              <p className="font-bold text-sm">Nenhuma aula registrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentClasses.map((lesson: any) => (
                <div key={lesson.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-center bg-white w-12 h-12 rounded-lg shadow-sm text-blue-600 border border-slate-100 shrink-0">
                    <BookOpen size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[#001a33] text-sm truncate">{lesson.titulo}</h4>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {lesson.disciplinas?.nome || 'Disciplina'} · {lesson.carga_horaria}h
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {lesson.data_aula
                      ? new Date(`${lesson.data_aula}T12:00:00`).toLocaleDateString('pt-BR')
                      : 'Data não informada'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Situação acadêmica</h3>
          <div className="space-y-3">
            <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Matrículas</p>
              <p className="text-sm text-slate-700 font-medium">
                {resumo?.totalMatriculas ?? 0} registros históricos; {resumo?.alunosAtivos ?? 0} ativos.
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Fonte dos indicadores</p>
              <p className="text-sm text-slate-700 font-medium">
                Notas, frequência e progresso são consolidados pelo Supabase.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurmaResumo;
