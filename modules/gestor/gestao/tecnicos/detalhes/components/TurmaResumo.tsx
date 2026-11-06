import React from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  Calendar,
  Gauge,
  Loader2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';
import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../../../../lib/academicClassMeetings';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { academicLifecycleService } from '../academic-lifecycle.service';
import TechnicalDataError from './TechnicalDataError';

interface TurmaResumoProps {
  turma: Turma;
  canViewFinanceiro?: boolean;
  canViewAulas?: boolean;
}

const TurmaResumo: React.FC<TurmaResumoProps> = ({
  turma,
  canViewFinanceiro = true,
  canViewAulas = true,
}) => {
  const resumoQuery = useQuery({
    queryKey: academicLifecycleKeys.resumo(turma.id),
    queryFn: () => academicLifecycleService.getResumo(turma.id),
  });
  const resumo = resumoQuery.data;

  const recentClassesQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turma.id), 'aulas-recentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aulas_turma')
        .select('id, titulo, carga_horaria, sessao, data_aula, turma_id, disciplina_id, created_at, disciplinas(nome)')
        .eq('turma_id', turma.id)
        .order('data_aula', { ascending: false, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      return groupAcademicClassMeetings((data || []) as any[]).slice(0, 3);
    },
    enabled: canViewAulas,
  });
  const recentClasses = recentClassesQuery.data || [];

  if (resumoQuery.isLoading || (canViewAulas && recentClassesQuery.isLoading)) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando resumo acadêmico...</span>
      </div>
    );
  }

  if (resumoQuery.isError || (canViewAulas && recentClassesQuery.isError)) {
    return (
      <TechnicalDataError
        title="Resumo acadêmico não carregado"
        message="Os indicadores permitidos foram ocultados para não exibir dados incorretos por causa de uma falha de consulta."
        retrying={resumoQuery.isFetching || recentClassesQuery.isFetching}
        onRetry={() => {
          void Promise.all([
            resumoQuery.refetch(),
            ...(canViewAulas ? [recentClassesQuery.refetch()] : []),
          ]);
        }}
      />
    );
  }

  const financialStatus = {
    SEM_DADOS: {
      label: 'Sem dados financeiros',
      iconClass: 'bg-slate-100 text-slate-500',
      accentClass: 'border-slate-200',
      sidebarClass: 'border-slate-400',
    },
    SAUDAVEL: {
      label: 'Saudável',
      iconClass: 'bg-emerald-50 text-emerald-600',
      accentClass: 'border-emerald-100',
      sidebarClass: 'border-emerald-500',
    },
    ATENCAO: {
      label: 'Atenção',
      iconClass: 'bg-amber-50 text-amber-600',
      accentClass: 'border-amber-100',
      sidebarClass: 'border-amber-500',
    },
    CRITICA: {
      label: 'Crítica',
      iconClass: 'bg-rose-50 text-rose-600',
      accentClass: 'border-rose-100',
      sidebarClass: 'border-rose-500',
    },
  }[resumo?.saudeFinanceiraStatus || 'SEM_DADOS'];

  const cards = [
    {
      label: 'Total de Alunos',
      value: resumo?.totalAlunos ?? 0,
      icon: Users,
      iconClass: 'bg-blue-50 text-blue-600',
      accentClass: 'border-blue-100',
      detail: 'Matriculados na turma',
      empty: false,
    },
    {
      label: 'Alunos Ativos',
      value: resumo?.alunosAtivos ?? 0,
      icon: UserCheck,
      iconClass: 'bg-emerald-50 text-emerald-600',
      accentClass: 'border-emerald-100',
      detail: 'Matrículas em andamento',
      empty: false,
    },
    {
      label: 'Progresso Geral',
      value: resumo?.progressoCurso === null || resumo?.progressoCurso === undefined
        ? 'Sem grade'
        : `${resumo.progressoCurso.toLocaleString('pt-BR')}%`,
      icon: Gauge,
      iconClass: 'bg-amber-50 text-amber-600',
      accentClass: 'border-amber-100',
      detail: 'Carga horária já realizada',
      empty: resumo?.progressoCurso === null || resumo?.progressoCurso === undefined,
    },
    ...(canViewFinanceiro ? [{
        label: 'Saúde Financeira',
        value: resumo?.saudeFinanceiraPercentual === null
          || resumo?.saudeFinanceiraPercentual === undefined
          ? 'Sem dados'
          : `${resumo.saudeFinanceiraPercentual.toLocaleString('pt-BR')}%`,
        icon: BadgeDollarSign,
        iconClass: financialStatus.iconClass,
        accentClass: financialStatus.accentClass,
        detail: financialStatus.label,
        empty: resumo?.saudeFinanceiraPercentual === null
          || resumo?.saudeFinanceiraPercentual === undefined,
      }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className={`turma-summary-metrics grid grid-cols-1 ${canViewFinanceiro ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="turma-summary-metric"
            >
              <p className="turma-summary-metric-label"><Icon size={15} strokeWidth={1.65} aria-hidden="true" />{card.label}</p>
              <p className={`turma-summary-metric-value ${card.empty ? 'is-empty' : ''}`}>{card.value}</p>
              <p className="turma-summary-metric-detail">{card.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {canViewAulas && (
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="text-[15px] font-medium text-[#122b42] mb-4">Aulas recentes</h3>
          {recentClasses.length === 0 ? (
            <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/50 flex flex-col items-center">
              <Calendar size={26} className="mb-2 opacity-50 text-slate-300" />
              <p className="font-normal text-xs">Nenhuma aula registrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentClasses.map((lesson: any) => (
                <div key={lesson.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-3 border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center justify-center bg-slate-50 w-8 h-8 rounded-lg text-slate-500 shrink-0">
                    <BookOpen size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[#122b42] text-xs break-words">{lesson.titulo}</h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {lesson.disciplinas?.nome || 'Disciplina'} · {lesson.carga_horaria}h
                      {formatAcademicSessions(lesson.sessoes) ? ` · ${formatAcademicSessions(lesson.sessoes)}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] font-normal text-slate-400">
                    {lesson.data_aula
                      ? new Date(`${lesson.data_aula}T12:00:00`).toLocaleDateString('pt-BR')
                      : 'Data não informada'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className={`bg-white p-5 rounded-xl border border-slate-200 ${canViewAulas ? '' : 'lg:col-span-3'}`}>
          <h3 className="text-[15px] font-medium text-[#122b42] mb-4">Visão da turma</h3>
          <div className="space-y-3">
            <div className="bg-slate-50/70 p-3 rounded-lg border-l-2 border-blue-400">
              <p className="text-[11px] font-normal text-slate-500 mb-1">Matrículas</p>
              <p className="text-xs text-slate-700 font-normal leading-relaxed">
                {resumo?.totalAlunos ?? 0} alunos vinculados; {resumo?.alunosAtivos ?? 0} ativos.
              </p>
            </div>
            {canViewFinanceiro && (
              <div className={`bg-slate-50/70 p-3 rounded-lg border-l-2 ${financialStatus.sidebarClass}`}>
                <p className="text-[11px] font-normal text-slate-500 mb-1">Financeiro</p>
                <p className="text-xs text-slate-700 font-normal leading-relaxed">
                  {financialStatus.label}
                  {resumo?.saudeFinanceiraPercentual === null
                    || resumo?.saudeFinanceiraPercentual === undefined
                    ? '.'
                    : ` · ${resumo.saudeFinanceiraPercentual.toLocaleString('pt-BR')}% de adimplência.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurmaResumo;
