import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  Loader2,
  Users,
  Zap,
  Award,
} from 'lucide-react';
import { gestaoService } from '../gestao.service';
import { gestaoQueryKeys } from '../gestao.query-keys';

interface GestaoResumoProps {
  poloId?: string;
}

const fmtNumber = (value: number) => value.toLocaleString('pt-BR');

const GestaoResumo: React.FC<GestaoResumoProps> = ({ poloId }) => {
  // Query 1: KPIs Globais
  const summaryQuery = useQuery({
    queryKey: gestaoQueryKeys.summary(poloId),
    queryFn: () => gestaoService.getGestaoResumoKpis(poloId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
  });

  // Query 2: Turmas Ativas Enriquecidas
  const activeClassesQuery = useQuery({
    queryKey: gestaoQueryKeys.activeClasses(poloId),
    queryFn: () => gestaoService.getActivePresentialClasses(poloId),
    staleTime: 5 * 60_000,
  });

  const isLoading = summaryQuery.isLoading || activeClassesQuery.isLoading;
  const isError = summaryQuery.isError || activeClassesQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm font-bold text-slate-500">
        <Loader2 className="mr-3 animate-spin text-[#001a33]" size={22} />
        Carregando painel operacional da gestão...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">
        Não foi possível carregar os indicadores de gestão.
      </div>
    );
  }

  const allActiveClasses = activeClassesQuery.data || [];

  // Cálculos dinâmicos com base nas turmas em aberto
  const totalAlunosActive = allActiveClasses.reduce((acc, t) => acc + (t.alunosMatriculados || 0), 0);
  const totalTurmasActive = allActiveClasses.length;

  // Agrupamentos por modalidade
  const tecnicos = allActiveClasses.filter((t) => t.modalidade === 'TECNICO');
  const livres = allActiveClasses.filter((t) => t.modalidade === 'LIVRE');
  const especializacoes = allActiveClasses.filter((t) => t.modalidade === 'ESPECIALIZACAO');

  const renderActiveSection = (title: string, list: any[], Icon: any, colorTheme: { iconBg: string, iconText: string, textAccent: string, borderAccent: string }) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className={`p-1.5 rounded-lg ${colorTheme.iconBg} ${colorTheme.iconText}`}>
            <Icon size={16} />
          </div>
          <h3 className="font-extrabold text-[#001a33] text-sm uppercase tracking-wider flex items-center gap-2">
            {title}
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full normal-case">
              {list.length} {list.length === 1 ? 'turma' : 'turmas'} em andamento
            </span>
          </h3>
        </div>

        {list.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs font-semibold">
            Nenhuma turma desta modalidade em andamento no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {list.map((turma) => (
              <div
                key={turma.id}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-[#001a33] text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      {turma.codigo}
                    </span>
                    <span className="text-slate-400 text-xs font-medium">
                      {turma.poloNome || 'Polo não informado'}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-[#001a33] text-base mt-1.5 truncate">
                    {turma.nome}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-50">
                    {/* Disciplina Atual */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        Disciplina Atual
                      </span>
                      <span
                        className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mt-0.5 truncate"
                        title={turma.disciplinaAtual}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        {turma.disciplinaAtual || 'Não iniciada / Sem grade'}
                        {turma.disciplinaAtualOrdem && turma.totalDisciplinas ? (
                          <span className="text-[10px] text-slate-400 font-medium">
                            ({turma.disciplinaAtualOrdem}/{turma.totalDisciplinas})
                          </span>
                        ) : null}
                      </span>
                    </div>

                    {/* Professor */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        Professor
                      </span>
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mt-0.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                        {turma.professorAtual || 'Não atribuído'}
                      </span>
                    </div>

                    {/* Próxima Aula */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        Próxima Aula
                      </span>
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mt-0.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {turma.proximaAulaData
                          ? `${new Date(`${turma.proximaAulaData}T12:00:00`).toLocaleDateString('pt-BR')} ${
                              turma.proximaAulaTitulo ? `· ${turma.proximaAulaTitulo}` : ''
                            }`
                          : 'Nenhuma agendada'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-end justify-between md:justify-center border-t md:border-t-0 pt-3 md:pt-0 border-slate-50 md:pl-4 md:border-l shrink-0 gap-1.5 min-w-[120px]">
                  <div className="text-left md:text-right">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                      Término Previsto
                    </span>
                    <span className="text-xs font-extrabold text-[#001a33] mt-0.5 block uppercase">
                      {turma.dataPrevisaoTermino
                        ? new Date(`${turma.dataPrevisaoTermino}T12:00:00`).toLocaleDateString('pt-BR', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Não informada'}
                    </span>
                  </div>
                  <div className="text-right mt-1">
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100/50">
                      {turma.alunosMatriculados} Alunos
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPIs Consolidados baseados nas turmas em aberto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50 shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total de Alunos</p>
            <h3 className="text-2xl font-extrabold text-[#001a33] mt-0.5">{fmtNumber(totalAlunosActive)}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100/50 shrink-0">
            <Briefcase size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Turmas Ativas em Curso</p>
            <h3 className="text-2xl font-extrabold text-[#001a33] mt-0.5">{fmtNumber(totalTurmasActive)}</h3>
          </div>
        </div>
      </div>

      {/* Listagem Ordenada por Modalidade */}
      <div className="space-y-8">
        {/* Técnico */}
        {renderActiveSection('Cursos Técnicos', tecnicos, Briefcase, {
          iconBg: 'bg-blue-50',
          iconText: 'text-blue-600',
          textAccent: 'text-blue-700',
          borderAccent: 'border-blue-100'
        })}

        {/* Livre */}
        {renderActiveSection('Cursos Livres', livres, Zap, {
          iconBg: 'bg-purple-50',
          iconText: 'text-purple-600',
          textAccent: 'text-purple-700',
          borderAccent: 'border-purple-100'
        })}

        {/* Especialização */}
        {renderActiveSection('Especializações', especializacoes, Award, {
          iconBg: 'bg-emerald-50',
          iconText: 'text-emerald-600',
          textAccent: 'text-emerald-700',
          borderAccent: 'border-emerald-100'
        })}
      </div>
    </div>
  );
};

export default GestaoResumo;
