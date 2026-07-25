// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React from 'react';
import { DollarSign, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import { Turma } from '../../../gestao.types';
import TechnicalDataError from './TechnicalDataError';
import { useTurmaFinanceiroDashboard } from './financeiro/hooks/useFinanceiroAlunos';

interface TurmaFinanceiroProps {
  turma: Turma;
}

const TurmaFinanceiro: React.FC<TurmaFinanceiroProps> = ({ turma }) => {
  const dashboardQuery = useTurmaFinanceiroDashboard(turma.id);
  const summary = dashboardQuery.data?.summary;

  const receitaPrevista = summary?.total || 0;
  const recebido = summary?.received || 0;
  const inadimplencia = summary?.overdue || 0;
  const pendentePercent = summary?.overduePercent || 0;

  return (
    <div className=" space-y-8">
      {dashboardQuery.isLoading ? (
        <div className="flex justify-center items-center rounded-2xl border border-slate-100 bg-white py-12">
          <Loader2 className="animate-spin text-[#001a33]" size={28} />
          <span className="text-slate-500 font-bold ml-3">Carregando resumo financeiro...</span>
        </div>
      ) : dashboardQuery.isError ? (
        <TechnicalDataError
          title="Resumo financeiro não carregado"
          message="Os totais foram ocultados para não apresentar receita, recebimentos ou inadimplência como zero por engano."
          retrying={dashboardQuery.isFetching}
          onRetry={() => { void dashboardQuery.refetch(); }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-emerald-600">
            <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Plano lançado</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ {receitaPrevista.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-blue-600">
            <div className="p-2 bg-blue-50 rounded-lg"><DollarSign size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Recebido</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ {recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="w-full h-1 bg-slate-100 rounded-full mt-2">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${receitaPrevista > 0 ? Math.min(100, (recebido / receitaPrevista) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-rose-600">
            <div className="p-2 bg-rose-50 rounded-lg"><TrendingDown size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Inadimplência</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ {inadimplencia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-rose-500 font-bold mt-1">{pendentePercent.toFixed(1)}% do plano lançado</p>
        </div>
        </div>
      )}

      {/* Configurações Financeiras da Turma */}
      <FinanceiroConfig turma={turma} />

      {/* Lista de Alunos com Status Financeiro */}
      <FinanceiroAlunosList
        turma={turma}
        alunos={dashboardQuery.data?.alunos || []}
        isLoading={dashboardQuery.isLoading}
        isError={dashboardQuery.isError}
        isFetching={dashboardQuery.isFetching}
        onRetry={() => { void dashboardQuery.refetch(); }}
      />

    </div>
  );
};

export default TurmaFinanceiro;
