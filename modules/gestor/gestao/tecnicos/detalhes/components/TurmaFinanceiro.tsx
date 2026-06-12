
// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React from 'react';
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';

const TurmaFinanceiro: React.FC = () => {
  return (
    <div className="animate-fadeIn space-y-8">
      
      {/* Resumo Rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-emerald-600">
            <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Receita Prevista (Mês)</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ 12.450,00</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-blue-600">
            <div className="p-2 bg-blue-50 rounded-lg"><DollarSign size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Recebido</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ 8.900,00</p>
          <div className="w-full h-1 bg-slate-100 rounded-full mt-2">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: '71%' }}></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-rose-600">
            <div className="p-2 bg-rose-50 rounded-lg"><TrendingDown size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Inadimplência</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ 3.550,00</p>
          <p className="text-xs text-rose-500 font-bold mt-1">28.5% Pendente</p>
        </div>
      </div>

      {/* Configurações Financeiras da Turma */}
      <FinanceiroConfig />

      {/* Lista de Alunos com Status Financeiro */}
      <FinanceiroAlunosList />

    </div>
  );
};

export default TurmaFinanceiro;
