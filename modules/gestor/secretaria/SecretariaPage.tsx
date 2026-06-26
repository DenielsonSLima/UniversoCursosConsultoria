
// File: modules/gestor/secretaria/SecretariaPage.tsx

import React, { useState } from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import SecretariaDashboard from './components/SecretariaDashboard';
import SecretariaAlunosPage from './alunos/SecretariaAlunosPage';
import SecretariaDocumentosPage from './documentos/SecretariaDocumentosPage';
import SecretariaBoletinsPage from './boletins/SecretariaBoletinsPage';
import SecretariaCarteirinhasPage from './carteirinhas/SecretariaCarteirinhasPage';
import SecretariaSolicitacoesPage from './solicitacoes/SecretariaSolicitacoesPage';
import SecretariaDeclaracaoMatriculaPage from './declaracao-matricula/SecretariaDeclaracaoMatriculaPage';
import SecretariaDeclaracaoFrequenciaPage from './declaracao-frequencia/SecretariaDeclaracaoFrequenciaPage';
import SecretariaDeclaracaoIrpfPage from './declaracao-irpf/SecretariaDeclaracaoIrpfPage';
import SecretariaHistoricoEscolarPage from './historico-escolar/SecretariaHistoricoEscolarPage';
import SecretariaCrachaEstagioPage from './cracha-estagio/SecretariaCrachaEstagioPage';
import SecretariaRematriculaPage from './rematricula/SecretariaRematriculaPage';
import SecretariaTermoEstagioPage from './termo-estagio/SecretariaTermoEstagioPage';
import SecretariaConsultaFinanceiraPage from './consulta-financeira/SecretariaConsultaFinanceiraPage';
import SecretariaHistoricoEmissoesPage from './historico-emissoes/SecretariaHistoricoEmissoesPage';
import SecretariaCertificadosPage from './certificados/SecretariaCertificadosPage';
import SecretariaAtestadoConclusaoPage from './atestado-conclusao/SecretariaAtestadoConclusaoPage';

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
    title: 'Financeiro do Aluno',
    description: 'Consulte parcelas, monte lotes e gere carnês administrativos com referência ao Asaas.',
  },
};

const SecretariaPage: React.FC = () => {
  const [activeModule, setActiveModule] = useState<string>('dashboard');
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
        return <SecretariaAlunosPage />;
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
      case 'rematricula':
        return <SecretariaRematriculaPage />;
      case 'termo-estagio':
        return <SecretariaTermoEstagioPage />;
      case 'consulta-financeira':
        return <SecretariaConsultaFinanceiraPage />;
      case 'transferencia':
        return <SecretariaDocumentosPage initialType={activeModule} />;
      case 'boletim':
        return <SecretariaBoletinsPage />;
      case 'atestado-conclusao':
        return <SecretariaAtestadoConclusaoPage />;
      case 'carteirinha':
        return <SecretariaCarteirinhasPage />;
      case 'solicitacoes':
        return <SecretariaSolicitacoesPage />;
      case 'historico-emissoes':
        return <SecretariaHistoricoEmissoesPage />;
      case 'certificados':
        return <SecretariaCertificadosPage />;
      default:
        return <SecretariaDashboard onNavigate={setActiveModule} />;
    }
  };


  return (
    <div className="animate-fadeIn min-h-screen pb-10">
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
        {renderContent()}
      </div>
    </div>
  );
};

export default SecretariaPage;
