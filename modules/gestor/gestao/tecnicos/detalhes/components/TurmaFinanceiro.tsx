// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React from 'react';
import { DollarSign, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';
import { useQuery } from '@tanstack/react-query';

interface TurmaFinanceiroProps {
  turma: Turma;
}

const TurmaFinanceiro: React.FC<TurmaFinanceiroProps> = ({ turma }) => {
  const { data: summary, isLoading: loading } = useQuery({
    queryKey: ['turma-financeiro', turma.id, 'resumo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('valor, valor_pago, status, data_vencimento')
        .eq('turma_id', turma.id);
      if (error) throw error;

      const records = data || [];
      const total = records.reduce((sum, item) => sum + Number(item.valor || 0), 0);
      const received = records
        .filter((item) => item.status === 'PAGO')
        .reduce((sum, item) => sum + Number(item.valor_pago ?? item.valor ?? 0), 0);
      const overdue = records
        .filter((item) => item.status === 'VENCIDO' || (item.status === 'PENDENTE' && item.data_vencimento < new Date().toISOString().slice(0, 10)))
        .reduce((sum, item) => sum + Number(item.valor || 0), 0);

      return {
        total,
        received,
        overdue,
        overduePercent: total > 0 ? (overdue / total) * 100 : 0,
      };
    },
    staleTime: 10_000,
  });

  const receitaPrevista = summary?.total || 0;
  const recebido = summary?.received || 0;
  const inadimplencia = summary?.overdue || 0;
  const pendentePercent = summary?.overduePercent || 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando painel financeiro...</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-8">
      
      {/* Resumo Rápido */}
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

      {/* Configurações Financeiras da Turma */}
      <FinanceiroConfig turma={turma} />

      {/* Lista de Alunos com Status Financeiro */}
      <FinanceiroAlunosList turma={turma} />

    </div>
  );
};

export default TurmaFinanceiro;
