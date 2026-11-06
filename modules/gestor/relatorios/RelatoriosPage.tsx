import React, { useState } from 'react';
import RelatoriosCatalog, { type ReportMenuItem, type ReportType } from './components/RelatoriosCatalog';
import './relatorios-workspace.css';
import { useQuery } from '@tanstack/react-query';
import { Users, Building, BookOpen, DollarSign, BarChart3, FileText, ArrowLeft, AlertTriangle, Award, GraduationCap, ClipboardList, CheckCircle2, Landmark, ShieldCheck } from 'lucide-react';
import { empresasService } from '../configuracoes/empresas/empresas.service';
import { polosService } from '../configuracoes/polos/polos.service';

// Subcomponents
import RelatorioTurmas from './components/RelatorioTurmas';
import RelatorioPolos from './components/RelatorioPolos';
import RelatorioCursos from './components/RelatorioCursos';
import RelatorioMovimentacaoFinanceira from './components/RelatorioMovimentacaoFinanceira';
import RelatorioResumoFinanceiro from './components/RelatorioResumoFinanceiro';
import RelatorioFluxoCaixa from './components/RelatorioFluxoCaixa';
import RelatorioDRE from './components/RelatorioDRE';
import RelatorioInadimplencia from './components/RelatorioInadimplencia';
import RelatorioEstagios from './components/RelatorioEstagios';
import RelatorioFinanceiroTurmaMensal from './components/RelatorioFinanceiroTurmaMensal';
import RelatorioFinanceiroPreEstagio from './components/RelatorioFinanceiroPreEstagio';
import RelatorioAlunosCursando from './components/RelatorioAlunosCursando';
import RelatorioAlunosFinalizados from './components/RelatorioAlunosFinalizados';
import RelatorioSituacaoAluno from './components/RelatorioSituacaoAluno';
import RelatorioLucroTurma from './components/RelatorioLucroTurma';
import RelatorioMatriculas from './matriculas/RelatorioMatriculas';
import DiagnosticoMatriculaInicial from './censo-escolar/matricula-inicial/DiagnosticoMatriculaInicial';
import { useRelatoriosRealtime } from './hooks/useRelatoriosRealtime';

interface RelatoriosPageProps {
  poloId?: string | null;
}

const RelatoriosPage: React.FC<RelatoriosPageProps> = ({ poloId }) => {
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  useRelatoriosRealtime({
    enabled: activeReport === 'matriculas' || activeReport === 'matricula-inicial',
    financeiroEnabled: activeReport === 'extrato-financeiro-conta'
      || activeReport === 'financeiro-entradas'
      || activeReport === 'financeiro-saidas'
      || activeReport === 'financeiro-receitas'
      || activeReport === 'financeiro-despesas'
      || activeReport === 'financeiro-resumo-categorias'
      || activeReport === 'financeiro-resumo-entradas'
      || activeReport === 'financeiro-fluxo-caixa'
      || activeReport === 'inadimplencia',
    poloId,
  });

  // 1. Fetch Company Principal Details
  const {
    data: company,
    isLoading: loadingCompany,
    isError: companyError,
    refetch: refetchCompany,
  } = useQuery<any>({
    queryKey: ['empresa_principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
  });

  // 2. Fetch Active Polo Details
  const {
    data: polo,
    isLoading: loadingPolo,
    isError: poloError,
    refetch: refetchPolo,
  } = useQuery<any>({
    queryKey: ['polo_detalhes', poloId],
    queryFn: () => poloId ? polosService.getById(poloId) : Promise.resolve(null),
    enabled: !!poloId,
  });

  const menuItems: ReportMenuItem[] = [
    {
      id: 'turmas',
      label: 'Relatório por Turmas',
      description: 'Listagem e status de turmas, modalidades e quantitativo de alunos matriculados ativos.',
      icon: <Users size={22} />,
      category: 'operacional'
    },
    {
      id: 'cursos',
      label: 'Relatório por Curso',
      description: 'Análise quantitativa de matriculados e turmas por curso e modalidade do portfólio.',
      icon: <BookOpen size={22} />,
      category: 'operacional'
    },
    {
      id: 'polos',
      label: 'Relatório por Polo',
      description: 'Comparativo de alunos ativos e análise de faturamento recebido versus pendente por unidade.',
      icon: <Building size={22} />,
      category: 'operacional'
    },
    {
      id: 'estagios',
      label: 'Supervisão de Estágios',
      description: 'Notas de avaliação (comportamento, técnica, registros), frequência e instrutor por turma de estágio.',
      icon: <Award size={22} />,
      category: 'operacional'
    },
    {
      id: 'extrato-financeiro-conta',
      label: 'Extrato Financeiro por Conta',
      description: 'Extrato de uma conta bancária ou caixa, com saldo de abertura, entradas, saídas e fechamento.',
      icon: <Landmark size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-entradas',
      label: 'Relatório de Entradas',
      description: 'Somente movimentações efetivas que entraram no caixa: recebimentos, financiamentos e transferências físicas.',
      icon: <DollarSign size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-saidas',
      label: 'Relatório de Saídas',
      description: 'Somente movimentações efetivas que saíram do caixa: pagamentos, amortizações e transferências físicas.',
      icon: <BarChart3 size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-receitas',
      label: 'Relatório de Receitas',
      description: 'Receitas operacionais de mensalidades por vencimento, separadas de créditos, adiantamentos e empréstimos.',
      icon: <FileText size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-despesas',
      label: 'Relatório de Despesas',
      description: 'Despesas operacionais e rateios por vencimento, separadas do principal de empréstimos e das transferências.',
      icon: <AlertTriangle size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-resumo-categorias',
      label: 'Resumo por Categoria',
      description: 'Consolidação de receitas e despesas operacionais por categoria, com previsto, realizado e saldo em aberto.',
      icon: <BarChart3 size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-resumo-entradas',
      label: 'Resumo de Entradas',
      description: 'Composição das entradas efetivas de caixa por classificação financeira.',
      icon: <DollarSign size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-fluxo-caixa',
      label: 'Fluxo de Caixa',
      description: 'Fluxo realizado e projeção operacional, confrontando caixa efetivo com receitas e despesas em aberto.',
      icon: <BarChart3 size={22} />,
      category: 'financeiro'
    },
    {
      id: 'dre',
      label: 'Relatório DRE',
      description: 'Demonstrativo do Resultado do Exercício com receitas brutas, impostos, custos diretos e margens.',
      icon: <BarChart3 size={22} />,
      category: 'financeiro'
    },
    {
      id: 'inadimplencia',
      label: 'Relatório de Inadimplência',
      description: 'Aging de títulos vencidos por data de corte, com saldo residual, faixas de atraso e lista operacional de cobrança.',
      icon: <AlertTriangle size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-turma-mensal',
      label: 'Financeiro por Turma e Mês',
      description: 'Competência mensal por turma: matrícula, mensalidades, parcelas pagas, abertas e vencidas.',
      icon: <ClipboardList size={22} />,
      category: 'financeiro'
    },
    {
      id: 'financeiro-pre-estagio',
      label: 'Financeiro da Turma para Estágio',
      description: 'Conferência dos alunos ativos e das parcelas do curso pagas, abertas e vencidas antes do estágio.',
      icon: <ShieldCheck size={22} />,
      category: 'financeiro'
    },
    {
      id: 'lucro-turma',
      label: 'DRE / Resultado de Turma',
      description: 'Análise consolidada de lucro confrontando receitas de mensalidades e despesas da turma.',
      icon: <BarChart3 size={22} />,
      category: 'financeiro'
    },
    {
      id: 'matriculas',
      label: 'Relatório de Matrículas',
      description: 'Relação operacional paginada por período, situação, modalidade, turma e polo.',
      icon: <ClipboardList size={22} />,
      category: 'academico'
    },
    {
      id: 'alunos-cursando',
      label: 'Alunos Cursando',
      description: 'Alunos ativos/em curso separados por modalidade, turma, curso e polo.',
      icon: <GraduationCap size={22} />,
      category: 'academico'
    },
    {
      id: 'alunos-finalizados',
      label: 'Alunos Finalizados',
      description: 'Concluintes por modalidade com carga horária, turma e situação de certificado.',
      icon: <CheckCircle2 size={22} />,
      category: 'academico'
    },
    {
      id: 'matricula-inicial',
      label: 'Diagnóstico do Censo Escolar',
      description: 'Prontidão cadastral atual para a Matrícula Inicial, sem representar declaração oficial.',
      icon: <Landmark size={22} />,
      category: 'oficial'
    },
    {
      id: 'situacao-aluno',
      label: 'Situação do Aluno',
      description: 'Movimento e rendimento: cursando, concluído, transferido, desistente, trancado ou cancelado.',
      icon: <AlertTriangle size={22} />,
      category: 'oficial'
    }
  ];

  const renderActiveReport = () => {
    switch (activeReport) {
      case 'turmas':
        return <RelatorioTurmas company={company} polo={polo} />;
      case 'polos':
        return <RelatorioPolos company={company} polo={polo} />;
      case 'cursos':
        return <RelatorioCursos company={company} polo={polo} />;
      case 'extrato-financeiro-conta':
        return <RelatorioMovimentacaoFinanceira company={company} polo={polo} tipo="EXTRATO_CONTA" />;
      case 'financeiro-entradas':
        return <RelatorioMovimentacaoFinanceira company={company} polo={polo} tipo="ENTRADAS" />;
      case 'financeiro-saidas':
        return <RelatorioMovimentacaoFinanceira company={company} polo={polo} tipo="SAIDAS" />;
      case 'financeiro-receitas':
        return <RelatorioMovimentacaoFinanceira company={company} polo={polo} tipo="RECEITAS" />;
      case 'financeiro-despesas':
        return <RelatorioMovimentacaoFinanceira company={company} polo={polo} tipo="DESPESAS" />;
      case 'financeiro-resumo-categorias':
        return <RelatorioResumoFinanceiro company={company} polo={polo} visao="CATEGORIAS" />;
      case 'financeiro-resumo-entradas':
        return <RelatorioResumoFinanceiro company={company} polo={polo} visao="ENTRADAS" />;
      case 'financeiro-fluxo-caixa':
        return <RelatorioFluxoCaixa company={company} polo={polo} />;
      case 'dre':
        return <RelatorioDRE company={company} polo={polo} />;
      case 'inadimplencia':
        return <RelatorioInadimplencia company={company} polo={polo} />;
      case 'estagios':
        return <RelatorioEstagios company={company} polo={polo} />;
      case 'financeiro-turma-mensal':
        return <RelatorioFinanceiroTurmaMensal company={company} polo={polo} />;
      case 'financeiro-pre-estagio':
        return <RelatorioFinanceiroPreEstagio company={company} polo={polo} />;
      case 'lucro-turma':
        return <RelatorioLucroTurma company={company} polo={polo} />;
      case 'alunos-cursando':
        return <RelatorioAlunosCursando company={company} polo={polo} />;
      case 'alunos-finalizados':
        return <RelatorioAlunosFinalizados company={company} polo={polo} />;
      case 'matriculas':
        return <RelatorioMatriculas company={company} polo={polo} poloId={poloId} />;
      case 'matricula-inicial':
        return <DiagnosticoMatriculaInicial company={company} polo={polo} poloId={poloId} />;
      case 'situacao-aluno':
        return <RelatorioSituacaoAluno company={company} polo={polo} />;
      default:
        return null;
    }
  };

  const activeInfo = menuItems.find(item => item.id === activeReport);

  const operacionais = menuItems.filter(item => item.category === 'operacional');
  const financeiros = menuItems.filter(item => item.category === 'financeiro');
  const academicos = menuItems.filter(item => item.category === 'academico');
  const oficiais = menuItems.filter(item => item.category === 'oficial');

  return (
    <div className="relatorios-workspace flex flex-col h-[calc(100vh-120px)] bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-fadeIn">
      
      {/* Top Header */}
      <div className="relatorios-workspace-heading bg-white px-6 py-4 border-b border-slate-150 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          {activeReport ? (
            <button
              onClick={() => setActiveReport(null)}
              className="relatorios-workspace-back p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-[#001a33] rounded-xl transition-all border border-slate-200 shadow-sm flex items-center justify-center gap-1 shrink-0"
              title="Voltar para a seleção de relatórios"
            >
              <ArrowLeft size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block pr-1">Voltar</span>
            </button>
          ) : (
            <div className="relatorios-workspace-icon w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          )}
          <div>
            <h1 className="relatorios-workspace-title text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              {activeReport ? activeInfo?.label : 'Central de Relatórios'}
            </h1>
            <p className="relatorios-workspace-description text-xs text-slate-400 font-medium">
              {activeReport ? activeInfo?.description : 'Geração e pré-visualização de documentos gerenciais oficiais'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relatorios-workspace-content flex-1 overflow-hidden min-h-0 bg-slate-50/50">
        
        {/* If no report is selected: Show grouped cards catalog */}
        {!activeReport ? (
          <RelatoriosCatalog
            operacionais={operacionais}
            academicos={academicos}
            oficiais={oficiais}
            financeiros={financeiros}
            onSelectReport={setActiveReport}
          />
        ) : (
          /* If a report is selected: Show it full-width */
          <div className="relatorios-report-frame h-full overflow-hidden p-6">
            {(loadingCompany || loadingPolo) ? (
              <div className="flex h-full w-full items-center justify-center" role="status" aria-label="Carregando identificação institucional">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : (companyError || poloError || !company || (poloId && !polo)) ? (
              <div className="flex h-full w-full items-center justify-center">
                <div className="relatorios-identity-error max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
                  <AlertTriangle className="mx-auto text-red-600" size={28} />
                  <h3 className="mt-3 text-sm font-black uppercase tracking-tight text-[#001a33]">
                    Identificação institucional indisponível
                  </h3>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
                    A prévia e a impressão foram bloqueadas para evitar um relatório com cabeçalho, CNPJ ou marca d&apos;água incorretos.
                  </p>
                  <button
                    type="button"
                    onClick={() => void Promise.all([refetchCompany(), poloId ? refetchPolo() : Promise.resolve()])}
                    className="mt-5 rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-900"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full w-full overflow-hidden">
                {renderActiveReport()}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

export default RelatoriosPage;
