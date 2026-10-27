import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Turma } from '../../../gestao.types';
import TechnicalDataError from './TechnicalDataError';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import FinanceiroTecnicoRegraSummary from './financeiro/FinanceiroTecnicoRegraSummary';
import { useMatriculaTecnicaFinanceiroWorkspace } from './financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { useMatriculaTecnicaFinanceiroRealtime } from './financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime';
import FinanceiroCycleObservationRecovery from './financeiro/FinanceiroCycleObservationRecovery';

interface TurmaFinanceiroTecnicoProps {
  turma: Turma;
}

const TurmaFinanceiroTecnico: React.FC<TurmaFinanceiroTecnicoProps> = ({ turma }) => {
  const workspaceQuery = useMatriculaTecnicaFinanceiroWorkspace(turma.id);
  useMatriculaTecnicaFinanceiroRealtime(turma.id);

  if (workspaceQuery.isLoading) {
    return (
      <><FinanceiroCycleObservationRecovery turmaId={turma.id} />
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-12">
        <Loader2 className="animate-spin text-[#001a33]" size={28} />
        <span className="ml-3 font-bold text-slate-500">Carregando financeiro canônico da turma...</span>
      </div></>
    );
  }

  if (!workspaceQuery.data) {
    return (
      <><FinanceiroCycleObservationRecovery turmaId={turma.id} />
      <TechnicalDataError
        title="Financeiro técnico não carregado"
        message="A regra e as matrículas foram ocultadas para não exibir valores ou situações desatualizadas."
        retrying={workspaceQuery.isFetching}
        onRetry={() => { void workspaceQuery.refetch(); }}
      /></>
    );
  }

  return (
    <div className="space-y-8">
      <FinanceiroCycleObservationRecovery turmaId={turma.id} />
      {!workspaceQuery.isError && <FinanceiroTecnicoRegraSummary regra={workspaceQuery.data.regra} />}
      <FinanceiroAlunosList
        turma={turma}
        regra={workspaceQuery.data.regra}
        resumo={workspaceQuery.data.resumo}
        alunos={workspaceQuery.data.matriculas}
          diagnosticosMatriculas={workspaceQuery.data.diagnosticosMatriculas}
        isLoading={false}
        isError={workspaceQuery.isError}
        isFetching={workspaceQuery.isFetching}
        onRetry={() => { void workspaceQuery.refetch(); }}
      />
    </div>
  );
};

export default TurmaFinanceiroTecnico;
