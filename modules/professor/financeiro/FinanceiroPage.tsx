import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { CreditCard, TrendingUp, Calendar, CheckCircle2, Clock, Coins } from 'lucide-react';

interface FinanceiroPageProps {
  professorId: string;
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ professorId }) => {
  // Query contas_pagar where fornecedor_id = professorId
  const { data: dbPayments = [], isLoading } = useQuery<any[]>({
    queryKey: ['professor-financeiro', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_pagar')
        .select('*')
        .eq('fornecedor_id', professorId)
        .order('data_vencimento', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  const getPayments = () => {
    if (dbPayments.length > 0) return dbPayments;
    // Mock honorarium payments for docents
    return [
      { id: 'p-1', descricao: 'Honorários de Aula Prática - Enfermagem Geral - Maio/2026', valor: 1800.00, data_vencimento: '2026-06-05', data_pagamento: '2026-06-05', valor_pago: 1800.00, status: 'PAGO', forma_pagamento: 'Transferência' },
      { id: 'p-2', descricao: 'Supervisão de Campo de Estágio - Japoatã', valor: 950.00, data_vencimento: '2026-06-10', data_pagamento: '2026-06-10', valor_pago: 950.00, status: 'PAGO', forma_pagamento: 'Pix' },
      { id: 'p-3', descricao: 'Honorários de Aulas Teóricas - Anatomia - Junho/2026', valor: 2200.00, data_vencimento: '2026-07-05', data_pagamento: null, valor_pago: null, status: 'PENDENTE', forma_pagamento: null },
      { id: 'p-4', descricao: 'Ajuda de Custo - Deslocamento e Estágio Estância', valor: 450.00, data_vencimento: '2026-07-05', data_pagamento: null, valor_pago: null, status: 'PENDENTE', forma_pagamento: null },
    ];
  };

  const payments = getPayments();

  const totalReceived = payments
    .filter(p => p.status === 'PAGO')
    .reduce((acc, p) => acc + Number(p.valor), 0);

  const totalIncoming = payments
    .filter(p => p.status === 'PENDENTE')
    .reduce((acc, p) => acc + Number(p.valor), 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PAGO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle2 size={10} /> Pago
          </span>
        );
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Em Aberto
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
            Inativo
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-purple-650 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Panel */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="text-purple-600" />
            Extrato de Honorários
          </h2>
          <p className="text-xs text-slate-450 font-medium">Acompanhe seus vencimentos de aulas, diárias e ajuda de custo</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Recebido</p>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalReceived)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Honorários compensados no semestre</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Previsão Futura</p>
            <p className="text-2xl font-black text-[#001a33]">{formatCurrency(totalIncoming)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Lançamentos em aberto e provisões</p>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
            <Coins size={22} />
          </div>
        </div>
      </div>

      {/* Payments list table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Calendar size={16} className="text-purple-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Lançamentos Financeiros</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium text-slate-500">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                <th className="py-4 px-4">Lançamento / Descrição</th>
                <th className="py-4 px-4">Vencimento</th>
                <th className="py-4 px-4">Valor Bruto</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Pago em</th>
                <th className="py-4 px-4 text-right">Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4.5 px-4 font-bold text-slate-800">{p.descricao}</td>
                  <td className="py-4.5 px-4">{formatDate(p.data_vencimento)}</td>
                  <td className="py-4.5 px-4 font-bold text-[#001a33]">{formatCurrency(p.valor)}</td>
                  <td className="py-4.5 px-4">{getStatusBadge(p.status)}</td>
                  <td className="py-4.5 px-4">
                    {p.status === 'PAGO' ? (
                      <span className="text-[10px] font-bold text-slate-650 bg-slate-100 px-2 py-0.5 rounded">
                        {formatDate(p.data_pagamento)} via {p.forma_pagamento || 'Pix'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold">—</span>
                    )}
                  </td>
                  <td className="py-4.5 px-4 text-right">
                    {p.status === 'PAGO' ? (
                      <button 
                        onClick={() => alert('Download do recibo de pagamento iniciado! (Simulação)')}
                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                      >
                        Recibo PDF
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">Aguardando</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinanceiroPage;
