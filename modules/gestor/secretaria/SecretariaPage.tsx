
// File: modules/gestor/secretaria/SecretariaPage.tsx

import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, ArrowLeft, Loader2 } from 'lucide-react';
import { canAccessTab } from '../access-control';
import SecretariaDashboard from './components/SecretariaDashboard';
import { secretariaDocumentoDefinitions } from './shared/secretaria-documentos.definitions';
import { secretariaCarteirinhasWorkspaceQueryOptions } from './carteirinhas/secretaria-carteirinhas.service';

const moduleLoaders = {
  alunos: () => import('./alunos/SecretariaAlunosPage'),
  boletim: () => import('./boletins/SecretariaBoletinsPage'),
  carteirinha: () => import('./carteirinhas/SecretariaCarteirinhasPage'),
  solicitacoes: () => import('./solicitacoes/SecretariaSolicitacoesPage'),
  'declaracao-matricula': () => import('./declaracao-matricula/SecretariaDeclaracaoMatriculaPage'),
  'declaracao-frequencia': () => import('./declaracao-frequencia/SecretariaDeclaracaoFrequenciaPage'),
  'declaracao-irpf': () => import('./declaracao-irpf/SecretariaDeclaracaoIrpfPage'),
  'historico-escolar': () => import('./historico-escolar/SecretariaHistoricoEscolarPage'),
  'cracha-estagio': () => import('./cracha-estagio/SecretariaCrachaEstagioPage'),
  rematricula: () => import('./rematricula/SecretariaRematriculaPage'),
  'termo-estagio': () => import('./termo-estagio/SecretariaTermoEstagioPage'),
  'consulta-financeira': () => import('./consulta-financeira/SecretariaConsultaFinanceiraPage'),
  'historico-emissoes': () => import('./historico-emissoes/SecretariaHistoricoEmissoesPage'),
  certificados: () => import('./certificados/SecretariaCertificadosPage'),
  'atestado-conclusao': () => import('./atestado-conclusao/SecretariaAtestadoConclusaoPage'),
  documento: () => import('./shared/SecretariaDocumentoEmissionPage'),
} as const;

const SecretariaAlunosPage = lazy(moduleLoaders.alunos);
const SecretariaBoletinsPage = lazy(moduleLoaders.boletim);
const SecretariaCarteirinhasPage = lazy(moduleLoaders.carteirinha);
const SecretariaSolicitacoesPage = lazy(moduleLoaders.solicitacoes);
const SecretariaDeclaracaoMatriculaPage = lazy(moduleLoaders['declaracao-matricula']);
const SecretariaDeclaracaoFrequenciaPage = lazy(moduleLoaders['declaracao-frequencia']);
const SecretariaDeclaracaoIrpfPage = lazy(moduleLoaders['declaracao-irpf']);
const SecretariaHistoricoEscolarPage = lazy(moduleLoaders['historico-escolar']);
const SecretariaCrachaEstagioPage = lazy(moduleLoaders['cracha-estagio']);
const SecretariaRematriculaPage = lazy(moduleLoaders.rematricula);
const SecretariaTermoEstagioPage = lazy(moduleLoaders['termo-estagio']);
const SecretariaConsultaFinanceiraPage = lazy(moduleLoaders['consulta-financeira']);
const SecretariaHistoricoEmissoesPage = lazy(moduleLoaders['historico-emissoes']);
const SecretariaCertificadosPage = lazy(moduleLoaders.certificados);
const SecretariaAtestadoConclusaoPage = lazy(moduleLoaders['atestado-conclusao']);
const SecretariaDocumentoEmissionPage = lazy(moduleLoaders.documento);

const secretariaModuleHeaders: Record<string, { title: string; description: string }> = {
  alunos: {
    title: 'Busca de Aluno 360',
    description: 'Dados acadêmicos, cadastrais e financeiros em uma única consulta.',
  },
  'declaracao-matricula': {
    title: 'Declaração de Matrícula',
    description: 'Comprovação individual, em lote ou personalizada por aluno.',
  },
  'declaracao-frequencia': {
    title: 'Declaração de Frequência',
    description: 'Frequência consolidada pelo serviço acadêmico.',
  },
  boletim: {
    title: 'Boletim Escolar',
    description: 'Notas e resultados dos cursos técnicos.',
  },
  'atestado-conclusao': {
    title: 'Atestado de Conclusão',
    description: 'Comprovação provisória para cursos técnicos concluídos.',
  },
  'declaracao-irpf': {
    title: 'Declaração de IRPF',
    description: 'Comprovante financeiro do ano-calendário.',
  },
  'historico-escolar': {
    title: 'Histórico Escolar',
    description: 'Percurso curricular e resultados acadêmicos.',
  },
  carteirinha: {
    title: 'Carteirinha Estudantil',
    description: 'Identificação estudantil com QR Code.',
  },
  'cracha-estagio': {
    title: 'Crachá de Estágio',
    description: 'Identificação para atividades supervisionadas.',
  },
  'cracha-periodo-eleitoral': {
    title: 'SES',
    description: 'Crachá por hospital, liberado após a entrada do aluno no estágio.',
  },
  'termo-estagio': {
    title: 'Termo de Estágio',
    description: 'Termo de compromisso e dados acadêmicos do estágio supervisionado.',
  },
  rematricula: {
    title: 'Rematrícula',
    description: 'Preparação individual ou coletiva do processo de rematrícula.',
  },
  transferencia: {
    title: 'Transferência',
    description: 'Transferência externa e emissão de guia.',
  },
  solicitacoes: {
    title: 'Solicitações Acadêmicas',
    description: 'Análise e homologação de requerimentos.',
  },
  certificados: {
    title: 'Certificados',
    description: 'Fila de concluintes, registros, SISTEC e emissão por modalidade.',
  },
  'historico-emissoes': {
    title: 'Histórico de Emissões',
    description: 'Auditoria dos documentos emitidos pela secretaria.',
  },
  'consulta-financeira': {
    title: 'Recebimentos',
    description: 'Pesquise qualquer pessoa, consulte dívidas em aberto e registre baixas manuais.',
  },
};

interface SecretariaPageProps {
  poloId?: string | null;
  gestorPermissions?: any;
}

const SecretariaPage: React.FC<SecretariaPageProps> = ({ poloId, gestorPermissions }) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    let scrollParent = pageRef.current?.parentElement || null;

    while (scrollParent) {
      const { overflowY } = window.getComputedStyle(scrollParent);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        scrollParent.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        return;
      }
      scrollParent = scrollParent.parentElement;
    }

    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeModule]);

  const preloadModule = (moduleId: string) => {
    if (moduleId === 'cracha-periodo-eleitoral' || moduleId === 'transferencia') {
      void moduleLoaders.documento();
      return;
    }

    const loader = moduleLoaders[moduleId as keyof typeof moduleLoaders];
    if (loader) void loader();

    if (moduleId === 'carteirinha' && poloId) {
      void queryClient.prefetchQuery(secretariaCarteirinhasWorkspaceQueryOptions(poloId));
    }
  };

  const allowedTabsList = useMemo(() => {
    if (!gestorPermissions) return null;
    const permissionMap: Record<string, string> = {
      'solicitacoes': 'solicitacoes',
      'carteirinha': 'carteirinhas',
      'declaracao-matricula': 'declaracoes',
      'declaracao-frequencia': 'declaracoes',
      'declaracao-irpf': 'declaracoes',
      'atestado-conclusao': 'declaracoes',
      'historico-escolar': 'historico',
      'historico-emissoes': 'historico',
      'consulta-financeira': 'recebimentos',
    };

    return Object.keys(secretariaModuleHeaders).filter(id => {
      const permKey = permissionMap[id];
      if (!permKey) return true;
      return canAccessTab(gestorPermissions, 'secretaria', permKey);
    });
  }, [gestorPermissions]);

  useEffect(() => {
    if (activeModule !== 'dashboard' && allowedTabsList && !allowedTabsList.includes(activeModule)) {
      setActiveModule('dashboard');
    }
  }, [activeModule, allowedTabsList]);

  const isDashboard = activeModule === 'dashboard';
  const currentHeader = isDashboard
    ? {
        title: 'Secretaria Digital',
        description: 'Selecione uma operação abaixo.',
      }
    : secretariaModuleHeaders[activeModule] || {
        title: activeModule.replaceAll('-', ' '),
        description: 'Operação administrativa da secretaria.',
      };

  const renderContent = () => {
    switch (activeModule) {
      case 'alunos':
        return <SecretariaAlunosPage poloId={poloId} />;
      case 'declaracao-matricula':
        return <SecretariaDeclaracaoMatriculaPage />;
      case 'declaracao-frequencia':
        return <SecretariaDeclaracaoFrequenciaPage />;
      case 'declaracao-irpf':
        return <SecretariaDeclaracaoIrpfPage />;
      case 'historico-escolar':
        return <SecretariaHistoricoEscolarPage />;
      case 'cracha-estagio':
        return <SecretariaCrachaEstagioPage />;
      case 'cracha-periodo-eleitoral':
        return <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.crachaPeriodoEleitoral} />;
      case 'rematricula':
        return <SecretariaRematriculaPage />;
      case 'termo-estagio':
        return <SecretariaTermoEstagioPage />;
      case 'consulta-financeira':
        return <SecretariaConsultaFinanceiraPage />;
      case 'transferencia':
        return <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.transferencia} />;
      case 'boletim':
        return <SecretariaBoletinsPage />;
      case 'atestado-conclusao':
        return <SecretariaAtestadoConclusaoPage />;
      case 'carteirinha':
        return <SecretariaCarteirinhasPage poloId={poloId} />;
      case 'solicitacoes':
        return <SecretariaSolicitacoesPage />;
      case 'historico-emissoes':
        return <SecretariaHistoricoEmissoesPage />;
      case 'certificados':
        return <SecretariaCertificadosPage />;
      default:
        return (
          <SecretariaDashboard
            onNavigate={setActiveModule}
            onPreload={preloadModule}
            allowedTabs={allowedTabsList || undefined}
          />
        );
    }
  };


  return (
    <div ref={pageRef} className="animate-fadeIn min-h-screen pb-10">
      {/* Header Geral da Secretaria */}
      <div className="mb-8 flex items-center gap-4">
        {!isDashboard && (
          <button 
            onClick={() => setActiveModule('dashboard')}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors bg-white shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <FileText size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">
              {isDashboard ? 'Módulo Administrativo' : 'Secretaria Digital'}
            </span>
          </div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            {currentHeader.title}
          </h2>
          <p className="text-slate-500 font-medium">{currentHeader.description}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <Suspense fallback={(
          <div className="flex min-h-[320px] items-center justify-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
            <Loader2 className="animate-spin text-blue-600" size={26} /> Preparando módulo da secretaria...
          </div>
        )}>
          {renderContent()}
        </Suspense>
      </div>
    </div>
  );
};

export default SecretariaPage;
