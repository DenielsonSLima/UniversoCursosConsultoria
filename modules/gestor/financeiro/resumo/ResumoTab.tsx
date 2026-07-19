// File: modules/gestor/financeiro/resumo/ResumoTab.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, AlertTriangle, DollarSign, Link2, CheckCircle2 } from 'lucide-react';
import { financeiroService } from '../financeiro.service';

interface ResumoTabProps {
  poloId?: string | null;
}

const ResumoTab: React.FC<ResumoTabProps> = ({ poloId }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch KPIs
  const { data: kpis, isLoading: isKpisLoading } = useQuery({
    queryKey: ['financeiro-resumo-kpis', poloId || 'todos'],
    queryFn: () => financeiroService.getResumoKpis(poloId || undefined)
  });

  // Fetch / Search student receivables
  const { data: receivables = [], isLoading: isSearchLoading } = useQuery({
    queryKey: ['financeiro-aluno-receivables', searchTerm, poloId || 'todos'],
    queryFn: () => financeiroService.searchAlunoReceivables(searchTerm, poloId || undefined),
    enabled: true
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAGO':
        return <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">Pago</span>;
      case 'PENDENTE':
        return <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-100">Pendente</span>;
      case 'VENCIDO':
        return <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-rose-100">Vencido</span>;
      case 'ESTORNADO':
        return <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-200">Estornado</span>;
      default:
        return <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-150">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* KPIs Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Alunos Ativos Card */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 group flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest block">Alunos Ativos</span>
            {isKpisLoading ? (
              <div className="h-9 w-24 bg-slate-100 animate-pulse rounded-lg"></div>
            ) : (
              <p className="text-4xl font-extrabold text-[#001a33]">{kpis?.alunosAtivos || 0}</p>
            )}
            <p className="text-[10px] text-slate-455 font-medium uppercase">Matrículas com status ativo</p>
          </div>
          <div className="p-5 bg-blue-50 text-blue-600 rounded-3xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
            <Users size={32} />
          </div>
        </div>

        {/* Quantidade em Atrasos Card */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-rose-900/5 transition-all duration-300 group flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest block">Parcelas em Atraso</span>
            {isKpisLoading ? (
              <div className="h-9 w-24 bg-slate-100 animate-pulse rounded-lg"></div>
            ) : (
              <p className="text-4xl font-extrabold text-rose-600">{kpis?.parcelasAtraso || 0}</p>
            )}
            <p className="text-[10px] text-slate-455 font-medium uppercase">Boletos pendentes após vencimento</p>
          </div>
          <div className="p-5 bg-rose-50 text-rose-600 rounded-3xl group-hover:bg-rose-600 group-hover:text-white transition-all duration-300">
            <AlertTriangle size={32} />
          </div>
        </div>
      </div>

      {/* Aluno Receivables Search Engine */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#001a33] uppercase tracking-tight">Buscar Mensalidades de Alunos</h3>
            <p className="text-slate-500 text-xs font-medium uppercase mt-1">Consulte parcelas a receber digitando o nome do aluno, CPF ou descrição.</p>
          </div>
          
          <div className="w-full md:w-96 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Digite o nome, CPF ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-xs font-medium text-slate-700 placeholder-slate-400 focus:bg-white focus:border-[#001a33] transition-all"
            />
          </div>
        </div>

        {/* Table Results */}
        <div className="overflow-x-auto">
          {isSearchLoading ? (
            <div className="py-12 text-center text-slate-500 text-xs font-bold uppercase animate-pulse">Buscando mensalidades...</div>
          ) : (
            <table className="w-full text-left border border-slate-100 rounded-2xl overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aluno</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descrição</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unidade</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vencimento</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Forma</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {receivables.length > 0 ? (
                  receivables.map((cr: any) => (
                    <tr key={cr.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <p className="text-xs font-bold text-slate-800">{cr.clienteNome}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">CPF: {cr.clienteCpf || 'Não informado'}</p>
                      </td>
                      <td className="p-4 text-xs text-slate-600 font-medium">
                        {cr.descricao}
                      </td>
                      <td className="p-4 text-xs text-slate-500 font-bold uppercase">
                        {cr.poloNome}
                      </td>
                      <td className="p-4 text-xs font-bold text-slate-600">
                        {formatDate(cr.dataVencimento)}
                      </td>
                      <td className="p-4 text-xs font-bold text-[#001a33]">
                        {formatCurrency(cr.valor)}
                      </td>
                      <td className="p-4 text-[10px] text-slate-500 font-bold uppercase">
                        {cr.formaPagamento || 'PIX'}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(cr.status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400 text-xs font-bold uppercase">
                      {searchTerm ? 'Nenhuma mensalidade encontrada para a busca.' : 'Digite termos de busca para filtrar registros.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumoTab;
