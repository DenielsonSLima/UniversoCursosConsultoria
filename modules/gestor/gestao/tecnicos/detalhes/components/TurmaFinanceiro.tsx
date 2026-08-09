// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React from 'react';
import { DollarSign, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import { Turma } from '../../../gestao.types';
import TechnicalDataError from './TechnicalDataError';
import { useMatriculaTecnicaFinanceiroWorkspace } from './financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { useMatriculaTecnicaFinanceiroRealtime } from './financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime';

interface TurmaFinanceiroProps {
  turma: Turma;
}

const formatCurrency = (value?: string) => {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(parsed) ? parsed : 0);
};

const TurmaFinanceiro: React.FC<TurmaFinanceiroProps> = ({ turma }) => {
  const workspaceQuery = useMatriculaTecnicaFinanceiroWorkspace(turma.id);
  useMatriculaTecnicaFinanceiroRealtime(turma.id);
  const workspace = workspaceQuery.data;
  const summary = workspace?.resumo;

  return (
    <div className=" space-y-8">
      {workspaceQuery.isLoading ? (
        <div className="flex justify-center items-center rounded-2xl border border-slate-100 bg-white py-12">
          <Loader2 className="animate-spin text-[#001a33]" size={28} />
          <span className="text-slate-500 font-bold ml-3">Carregando resumo financeiro...</span>
        </div>
      ) : workspaceQuery.isError || !workspace ? (
        <TechnicalDataError
          title="Resumo financeiro não carregado"
          message="Os totais foram ocultados para não apresentar receita, recebimentos ou inadimplência como zero por engano."
          retrying={workspaceQuery.isFetching}
          onRetry={() => { void workspaceQuery.refetch(); }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-emerald-600">
              <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp size={20} /></div>
              <span className="text-xs font-bold uppercase tracking-wider">Plano lançado</span>
            </div>
            <p className="text-3xl font-black text-[#001a33]">{formatCurrency(summary.total)}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-blue-600">
              <div className="p-2 bg-blue-50 rounded-lg"><DollarSign size={20} /></div>
              <span className="text-xs font-bold uppercase tracking-wider">Recebido</span>
            </div>
            <p className="text-3xl font-black text-[#001a33]">{formatCurrency(summary.recebido)}</p>
            <div className="w-full h-1 bg-slate-100 rounded-full mt-2">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${summary.recebidoPercentual}%` }}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-lg"><TrendingDown size={20} /></div>
              <span className="text-xs font-bold uppercase tracking-wider">Inadimplência</span>
            </div>
            <p className="text-3xl font-black text-[#001a33]">{formatCurrency(summary.inadimplencia)}</p>
            <p className="text-xs text-rose-500 font-bold mt-1">{summary.inadimplenciaPercentual}% do plano lançado</p>
          </div>
        </div>
      )}

      {workspace ? <FinanceiroConfig turma={turma} regra={workspace.regra} /> : null}

      {workspace ? (
        <FinanceiroAlunosList
          turma={turma}
          regra={workspace.regra}
          alunos={workspace.matriculas}
          resumo={workspace.resumo}
          isLoading={false}
          isError={false}
          isFetching={workspaceQuery.isFetching}
          onRetry={() => { void workspaceQuery.refetch(); }}
        />
      ) : null}
    </div>
  );
};

export default TurmaFinanceiro;
