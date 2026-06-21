import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Building, BookOpen, DollarSign, BarChart3, FileText, Sparkles, ArrowLeft, ChevronRight, AlertTriangle, Award } from 'lucide-react';
import { empresasService } from '../configuracoes/empresas/empresas.service';
import { polosService } from '../configuracoes/polos/polos.service';

// Subcomponents
import RelatorioTurmas from './components/RelatorioTurmas';
import RelatorioPolos from './components/RelatorioPolos';
import RelatorioCursos from './components/RelatorioCursos';
import RelatorioFinanceiro from './components/RelatorioFinanceiro';
import RelatorioDRE from './components/RelatorioDRE';
import RelatorioInadimplencia from './components/RelatorioInadimplencia';
import RelatorioEstagios from './components/RelatorioEstagios';

type ReportType = 'turmas' | 'polos' | 'cursos' | 'financeiro' | 'dre' | 'inadimplencia' | 'estagios';

interface ReportMenuItem {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'operacional' | 'financeiro';
}

const RelatoriosPage: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  // 1. Fetch Company Principal Details
  const { data: company, isLoading: loadingCompany } = useQuery<any>({
    queryKey: ['empresa_principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
  });

  // 2. Fetch Active Polo Details
  // current_polo_id é estado de sessão UI — sessionStorage é adequado
  const poloId = sessionStorage.getItem('current_polo_id');
  const { data: polo, isLoading: loadingPolo } = useQuery<any>({
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
      id: 'financeiro',
      label: 'Relatório Financeiro',
      description: 'Extrato analítico detalhado do fluxo de caixa de receitas (entradas) e despesas (saídas).',
      icon: <DollarSign size={22} />,
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
      description: 'Listagem reativa de parcelas em aberto e atrasadas por aluno, contato e dias de atraso.',
      icon: <AlertTriangle size={22} />,
      category: 'financeiro'
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
      case 'financeiro':
        return <RelatorioFinanceiro company={company} polo={polo} />;
      case 'dre':
        return <RelatorioDRE company={company} polo={polo} />;
      case 'inadimplencia':
        return <RelatorioInadimplencia company={company} polo={polo} />;
      case 'estagios':
        return <RelatorioEstagios company={company} polo={polo} />;
      default:
        return null;
    }
  };

  const activeInfo = menuItems.find(item => item.id === activeReport);

  const operacionais = menuItems.filter(item => item.category === 'operacional');
  const financeiros = menuItems.filter(item => item.category === 'financeiro');

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-fadeIn">
      
      {/* Top Header */}
      <div className="bg-white px-6 py-4 border-b border-slate-150 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          {activeReport ? (
            <button
              onClick={() => setActiveReport(null)}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-[#001a33] rounded-xl transition-all border border-slate-200 shadow-sm flex items-center justify-center gap-1 shrink-0"
              title="Voltar para a seleção de relatórios"
            >
              <ArrowLeft size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block pr-1">Voltar</span>
            </button>
          ) : (
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          )}
          <div>
            <h1 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              {activeReport ? activeInfo?.label : 'Central de Relatórios'}
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              {activeReport ? activeInfo?.description : 'Geração e pré-visualização de documentos gerenciais oficiais'}
            </p>
          </div>
        </div>

        {polo && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#001a33]/5 border border-[#001a33]/15 text-[#001a33] rounded-xl text-[10px] font-black uppercase tracking-wider">
            <Sparkles size={11} /> Unidade Ativa: {polo.nome}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden min-h-0 bg-slate-50/50">
        
        {/* If no report is selected: Show grouped cards catalog */}
        {!activeReport ? (
          <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8 select-none">
            
            {/* Category: Administrativo & Operacional */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Users size={16} className="text-blue-600" />
                <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
                  Relatórios Administrativos e Operacionais
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {operacionais.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveReport(item.id)}
                    className="group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
                  >
                    <div>
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-blue-600 group-hover:text-white shadow-sm">
                        {item.icon}
                      </div>
                      <h4 className="text-sm font-black text-[#001a33] group-hover:text-blue-900 transition-colors uppercase tracking-tight">
                        {item.label}
                      </h4>
                      <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest mt-4">
                      Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category: Financeiro */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <DollarSign size={16} className="text-emerald-600" />
                <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
                  Relatórios Financeiros e Fiscais
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {financeiros.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveReport(item.id)}
                    className="group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-emerald-250 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
                  >
                    <div>
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-600 group-hover:text-white shadow-sm">
                        {item.icon}
                      </div>
                      <h4 className="text-sm font-black text-[#001a33] group-hover:text-emerald-700 transition-colors uppercase tracking-tight">
                        {item.label}
                      </h4>
                      <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-4">
                      Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        ) : (
          /* If a report is selected: Show it full-width */
          <div className="h-full overflow-hidden p-6">
            {(loadingCompany || loadingPolo) ? (
              <div className="h-full w-full flex justify-center items-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
