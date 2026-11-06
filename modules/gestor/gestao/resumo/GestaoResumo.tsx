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
    refetchInterval: 5 * 60_000,
  });

  const isLoading = summaryQuery.isLoading || activeClassesQuery.isLoading;
  const isError = summaryQuery.isError || activeClassesQuery.isError;

  if (isLoading) {
    return (
      <div role="status" className="gestao-entry-loading flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-xs font-normal text-slate-500">
        <Loader2 className="mr-3 animate-spin text-[#001a33]" size={22} />
        Carregando painel operacional da gestão...
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
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

  const renderActiveSection = (title: string, list: any[], Icon: React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>, tone: string) => (
    <section className="gestao-entry-section" aria-label={title}>
      <header className="gestao-entry-section-heading">
        <span className={`gestao-entry-section-icon ${tone}`}><Icon size={16} strokeWidth={1.65} aria-hidden /></span>
        <h2>{title}</h2>
        <span className="gestao-entry-section-count">{list.length} {list.length === 1 ? 'turma' : 'turmas'} em andamento</span>
      </header>
      {list.length === 0 ? (
        <div className="gestao-entry-empty">Nenhuma turma desta modalidade em andamento no momento.</div>
      ) : (
        <div className="gestao-entry-class-list">
          {list.map(turma => (
            <article key={turma.id} className="gestao-entry-class">
              <div className="gestao-entry-class-main">
                <div className="gestao-entry-class-meta">
                  <span className="gestao-entry-class-code">{turma.codigo}</span>
                  <span>{turma.poloNome || 'Polo não informado'}</span>
                </div>
                <h3>{turma.nome}</h3>
                <dl className="gestao-entry-class-fields">
                  <div>
                    <dt>Disciplina Atual</dt>
                    <dd>
                      {turma.disciplinaAtual || 'Não iniciada / Sem grade'}
                      {turma.disciplinaAtualOrdem && turma.totalDisciplinas ? (
                        <span className="gestao-entry-class-order"> ({turma.disciplinaAtualOrdem}/{turma.totalDisciplinas})</span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Professor</dt>
                    <dd>{turma.professorAtual || 'Não atribuído'}</dd>
                  </div>
                  <div>
                    <dt>Próxima Aula</dt>
                    <dd>{turma.proximaAulaData
                      ? `${new Date(`${turma.proximaAulaData}T12:00:00`).toLocaleDateString('pt-BR')} ${
                          turma.proximaAulaTitulo ? `· ${turma.proximaAulaTitulo}` : ''
                        }`
                      : 'Nenhuma agendada'}</dd>
                  </div>
                </dl>
              </div>
              <aside className="gestao-entry-class-end">
                <div>
                  <p>Término Previsto</p>
                  <span>{turma.dataPrevisaoTermino
                    ? new Date(`${turma.dataPrevisaoTermino}T12:00:00`).toLocaleDateString('pt-BR', {
                        month: 'short', year: 'numeric',
                      })
                    : 'Não informada'}</span>
                </div>
                <span className="gestao-entry-students"><Users size={12} strokeWidth={1.65} aria-hidden />{turma.alunosMatriculados} Alunos</span>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="gestao-entry-summary">
      <section aria-label="Indicadores das turmas em andamento" className="gestao-entry-metrics">
        <div className="gestao-entry-metric">
          <Users size={18} strokeWidth={1.65} aria-hidden />
          <div><p>Total de Alunos</p><strong>{fmtNumber(totalAlunosActive)}</strong></div>
        </div>
        <div className="gestao-entry-metric">
          <Briefcase size={18} strokeWidth={1.65} aria-hidden />
          <div><p>Turmas Ativas em Curso</p><strong>{fmtNumber(totalTurmasActive)}</strong></div>
        </div>
      </section>
      <div className="gestao-entry-sections">
        {renderActiveSection('Cursos Técnicos', tecnicos, Briefcase, 'text-blue-600 bg-blue-50')}
        {renderActiveSection('Cursos Livres', livres, Zap, 'text-slate-600 bg-slate-100')}
        {renderActiveSection('Especializações', especializacoes, Award, 'text-emerald-700 bg-emerald-50')}
      </div>
    </div>
  );
};

export default GestaoResumo;
