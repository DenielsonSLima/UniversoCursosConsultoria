// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React, { useEffect, useState } from 'react';
import { DollarSign, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';

interface TurmaFinanceiroProps {
  turma: Turma;
}

const TurmaFinanceiro: React.FC<TurmaFinanceiroProps> = ({ turma }) => {
  const [loading, setLoading] = useState(true);
  const [totalAlunos, setTotalAlunos] = useState(0);

  useEffect(() => {
    const fetchStudentsCount = async () => {
      setLoading(true);
      try {
        const { count, error } = await supabase
          .from('matriculas')
          .select('*', { count: 'exact', head: true })
          .eq('turma_id', turma.id);

        if (error) throw error;
        setTotalAlunos(count || 0);
      } catch (err) {
        console.error('Erro ao buscar quantidade de alunos matriculados:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStudentsCount();
  }, [turma.id]);

  const valorMensalidadePadrao = 350.00;
  const receitaPrevista = totalAlunos * valorMensalidadePadrao;
  const recebido = 0.00;
  const inadimplencia = 0.00;
  const pendentePercent = 0.0;

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
            <span className="text-xs font-bold uppercase tracking-wider">Receita Prevista (Mês)</span>
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
            <div className="h-full bg-blue-500 rounded-full" style={{ width: '0%' }}></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-rose-600">
            <div className="p-2 bg-rose-50 rounded-lg"><TrendingDown size={20} /></div>
            <span className="text-xs font-bold uppercase tracking-wider">Inadimplência</span>
          </div>
          <p className="text-3xl font-black text-[#001a33]">R$ {inadimplencia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-rose-500 font-bold mt-1">{pendentePercent}% Pendente</p>
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
