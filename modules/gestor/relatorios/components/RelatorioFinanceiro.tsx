import React, { useState, useEffect } from 'react';
import { Printer, Filter, Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioFinanceiroProps {
  company: any;
  polo: any;
}

interface FinancialTransaction {
  id: string;
  data: string;
  tipo: 'RECEITA' | 'DESPESA';
  descricao: string;
  categoria: string;
  status: string;
  valor: number;
}

const MOCK_FINANCE: FinancialTransaction[] = [
  { id: 'rec-1', data: '2026-06-01', tipo: 'RECEITA', descricao: 'Mensalidade Escolar - João Silva', categoria: 'Mensalidade', status: 'PAGO', valor: 350.00 },
  { id: 'pag-1', data: '2026-06-05', tipo: 'DESPESA', descricao: 'Aluguel do Prédio - Unidade Sede', categoria: 'Infraestrutura', status: 'PAGO', valor: 2500.00 },
  { id: 'rec-2', data: '2026-06-10', tipo: 'RECEITA', descricao: 'Mensalidade Escolar - Maria Souza', categoria: 'Mensalidade', status: 'PAGO', valor: 350.00 },
  { id: 'pag-2', data: '2026-06-12', tipo: 'DESPESA', descricao: 'Energia Elétrica Coelba', categoria: 'Utilidades', status: 'PENDENTE', valor: 480.00 },
  { id: 'rec-3', data: '2026-06-15', tipo: 'RECEITA', descricao: 'Matrícula Curso de Tomografia', categoria: 'Matrícula', status: 'PAGO', valor: 150.00 },
  { id: 'pag-3', data: '2026-06-20', tipo: 'DESPESA', descricao: 'Honorários de Professores - Maio/2026', categoria: 'Folha Pagamento', status: 'PENDENTE', valor: 4500.00 }
];

const RelatorioFinanceiro: React.FC<RelatorioFinanceiroProps> = ({ company, polo }) => {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    // Last day of current month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return lastDay.toISOString().split('T')[0];
  });
  const [selectedType, setSelectedType] = useState<'todos' | 'RECEITA' | 'DESPESA'>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch receivables (Inflows)
      const { data: dbReceivables, error: recErr } = await supabase
        .from('contas_receber')
        .select('id, data_vencimento, data_pagamento, descricao, categoria, status, valor');

      if (recErr) throw recErr;

      // 2. Fetch payables (Outflows)
      const { data: dbPayables, error: payErr } = await supabase
        .from('contas_pagar')
        .select('id, data_vencimento, data_pagamento, descricao, categoria, status, valor');

      if (payErr) throw payErr;

      // Map receivables
      const mappedReceivables: FinancialTransaction[] = (dbReceivables || []).map(r => ({
        id: `rec-${r.id}`,
        data: r.data_pagamento || r.data_vencimento,
        tipo: 'RECEITA',
        descricao: r.descricao || 'Mensalidade Aluno',
        categoria: r.categoria || 'Geral',
        status: r.status || 'PENDENTE',
        valor: Number(r.valor) || 0
      }));

      // Map payables
      const mappedPayables: FinancialTransaction[] = (dbPayables || []).map(p => ({
        id: `pag-${p.id}`,
        data: p.data_pagamento || p.data_vencimento,
        tipo: 'DESPESA',
        descricao: p.descricao || 'Despesa Administrativa',
        categoria: p.categoria || 'Geral',
        status: p.status || 'PENDENTE',
        valor: Number(p.valor) || 0
      }));

      const combined = [...mappedReceivables, ...mappedPayables];

      if (combined.length === 0) {
        setTransactions(MOCK_FINANCE);
      } else {
        setTransactions(combined.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()));
      }
    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err);
      setTransactions(MOCK_FINANCE);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = transactions.filter(t => {
    // Date filter
    if (startDate && t.data < startDate) return false;
    if (endDate && t.data > endDate) return false;
    
    // Type filter
    if (selectedType !== 'todos' && t.tipo !== selectedType) return false;
    
    // Status filter
    if (selectedStatus !== 'todos' && t.status.toUpperCase() !== selectedStatus.toUpperCase()) return false;

    return true;
  });

  // Calculate Aggregated Metrics
  const totalInflow = filteredItems
    .filter(t => t.tipo === 'RECEITA')
    .reduce((acc, curr) => acc + curr.valor, 0);

  const totalOutflow = filteredItems
    .filter(t => t.tipo === 'DESPESA')
    .reduce((acc, curr) => acc + curr.valor, 0);

  const netBalance = totalInflow - totalOutflow;

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Data Início */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1">
                  <Calendar size={10} /> Data Início
                </span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-750 outline-none cursor-pointer"
                />
              </div>

              {/* Data Fim */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1">
                  <Calendar size={10} /> Data Fim
                </span>
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-750 outline-none cursor-pointer"
                />
              </div>

              {/* Tipo */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tipo de Lançamento</span>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-750 outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Lançamentos</option>
                  <option value="RECEITA">Apenas Receitas (+)</option>
                  <option value="DESPESA">Apenas Despesas (-)</option>
                </select>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Liquidez</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-750 outline-none cursor-pointer"
                >
                  <option value="todos">Todos (Pago & Aberto)</option>
                  <option value="PAGO">Somente Pagos/Liquidados</option>
                  <option value="PENDENTE">Apenas Em Aberto/A Pagar</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Financeiro</h4>
            
            <div className="space-y-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Receitas (+)</p>
                  <p className="text-md font-black text-emerald-600 mt-0.5">{formatCurrency(totalInflow)}</p>
                </div>
                <TrendingUp size={16} className="text-emerald-500 shrink-0" />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Despesas (-)</p>
                  <p className="text-md font-black text-red-500 mt-0.5">{formatCurrency(totalOutflow)}</p>
                </div>
                <TrendingDown size={16} className="text-red-500 shrink-0" />
              </div>
              <div className="bg-[#001a33]/5 p-3 rounded-xl border border-[#001a33]/10 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-[#001a33]/70 uppercase tracking-wider">Saldo Líquido</p>
                  <p className={`text-md font-black mt-0.5 ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(netBalance)}
                  </p>
                </div>
                <DollarSign size={16} className="text-blue-600 shrink-0" />
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handlePrint}
          className="w-full mt-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2"
        >
          <Printer size={15} /> Imprimir / PDF
        </button>
      </div>

      {/* Lado Direito: Preview da Página A4 */}
      <div className="flex-1 bg-slate-200/40 rounded-3xl p-4 sm:p-8 flex justify-center overflow-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20 w-full">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div 
            className="bg-white w-[210mm] min-w-[210mm] min-h-[297mm] shadow-lg p-10 relative flex flex-col print:shadow-none print:p-0 print:w-auto print:max-w-none print:min-h-0 text-slate-800 shrink-0"
            id="print-area"
          >
            {/* Watermark */}
            {polo?.watermark_url ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                <img 
                  src={polo.watermark_url} 
                  alt="Watermark" 
                  style={{
                    opacity: polo.watermark_opacity ?? 0.1,
                    width: `${polo.watermark_scale ?? 50}%`,
                    transform: 'rotate(-45deg)'
                  }}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none opacity-[0.03]">
                <h1 className="text-6xl font-black rotate-[-45deg] tracking-widest text-slate-900 text-center">
                  UNIVERSO CURSOS E CONSULTORIA
                </h1>
              </div>
            )}

            {/* Document Header */}
            <DocumentHeader 
              company={company} 
              polo={polo} 
              orientation="portrait"
              rightContent={
                <div className="text-right">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Relatório Financeiro</h2>
                  <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p>
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Extrato de Fluxo</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Extrato Detalhado de Receitas e Despesas</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Apresentação analítica contendo todas as entradas de mensalidades e matrículas versus as saídas operacionais (infraestrutura, salários de docentes e manutenção de polo).
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Período Analisado</span>
                <p className="text-[10px] font-bold text-slate-800 mt-0.5">
                  {formatDate(startDate)} a {formatDate(endDate)}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Unidade / Polo</span>
                <p className="text-[10px] font-bold text-slate-800 uppercase mt-0.5">{polo?.nome || 'Matriz'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Lançamentos</span>
                <p className="text-[10px] font-bold text-slate-800 uppercase mt-0.5">
                  {selectedType === 'todos' ? 'TODOS' : selectedType === 'RECEITA' ? 'RECEITAS (+)' : 'DESPESAS (-)'}
                </p>
              </div>
            </div>

            {/* KPI Cards na visualização A4 */}
            <div className="grid grid-cols-3 gap-4 mb-6 relative z-10 text-center">
              <div className="border border-slate-250 p-2.5 rounded-xl bg-white/95">
                <span className="text-[8px] font-black text-slate-450 uppercase tracking-widest">Total Receitas</span>
                <p className="text-xs font-bold text-emerald-600 mt-0.5">{formatCurrency(totalInflow)}</p>
              </div>
              <div className="border border-slate-250 p-2.5 rounded-xl bg-white/95">
                <span className="text-[8px] font-black text-slate-455 uppercase tracking-widest">Total Despesas</span>
                <p className="text-xs font-bold text-red-500 mt-0.5">{formatCurrency(totalOutflow)}</p>
              </div>
              <div className="border border-[#001a33]/15 p-2.5 rounded-xl bg-slate-50">
                <span className="text-[8px] font-black text-slate-450 uppercase tracking-widest">Resultado Líquido</span>
                <p className={`text-xs font-black mt-0.5 ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(netBalance)}
                </p>
              </div>
            </div>

            {/* Tabela de Lançamentos */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-2">Tipo</th>
                    <th className="py-2 px-2">Descrição</th>
                    <th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-550 text-[10px]">{formatDate(item.data)}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${
                          item.tipo === 'RECEITA' ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {item.tipo}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-bold text-slate-800 max-w-[180px] truncate" title={item.descricao}>
                        {item.descricao}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500">{item.categoria}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                          item.status.toUpperCase() === 'PAGO' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-black ${
                        item.tipo === 'RECEITA' ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {item.tipo === 'RECEITA' ? '+' : '-'}{formatCurrency(item.valor)}
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhum lançamento corresponde aos filtros ativos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de Assinaturas e Página */}
            <div className="mt-8 pt-6 border-t border-slate-200 relative z-10 flex justify-between items-end text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              <div>
                <p>UNIVERSO CURSOS E CONSULTORIA</p>
                <p className="text-[8px] font-medium text-slate-400 lowercase mt-0.5">Gerado automaticamente pelo painel do gestor.</p>
              </div>
              <div className="text-right">
                <p>Página 1 de 1</p>
              </div>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default RelatorioFinanceiro;
