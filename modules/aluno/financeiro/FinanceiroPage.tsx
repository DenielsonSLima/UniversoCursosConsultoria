import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { CreditCard, TrendingUp, Calendar, AlertTriangle, CheckCircle, Clock, Copy, ArrowRight, X, FileText, BadgeAlert } from 'lucide-react';

interface FinanceiroPageProps {
  alunoId: string;
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ alunoId }) => {
  const [showPixModal, setShowPixModal] = useState<any | null>(null);
  const [showBoletoModal, setShowBoletoModal] = useState<any | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  // Fetch actual contas_receber from Supabase
  const { data: dbRecords = [], isLoading } = useQuery<any[]>({
    queryKey: ['aluno-financeiro', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('*')
        .eq('cliente_id', alunoId)
        .order('data_vencimento', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Generate realistic mock data if the database table is empty for this student
  const getInstallments = () => {
    if (dbRecords.length > 0) {
      return dbRecords;
    }
    // Fallback/Mock Installments for demonstration
    return [
      { id: '1', descricao: 'Mensalidade 01/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-02-10', data_pagamento: '2026-02-09', valor_pago: 250.00, status: 'PAGO', forma_pagamento: 'Pix' },
      { id: '2', descricao: 'Mensalidade 02/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-03-10', data_pagamento: '2026-03-10', valor_pago: 250.00, status: 'PAGO', forma_pagamento: 'Pix' },
      { id: '3', descricao: 'Mensalidade 03/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-04-10', data_pagamento: '2026-04-08', valor_pago: 250.00, status: 'PAGO', forma_pagamento: 'Boleto' },
      { id: '4', descricao: 'Mensalidade 04/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-05-10', data_pagamento: '2026-05-10', valor_pago: 250.00, status: 'PAGO', forma_pagamento: 'Pix' },
      { id: '5', descricao: 'Mensalidade 05/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-06-10', data_pagamento: null, valor_pago: null, status: 'PENDENTE', forma_pagamento: null },
      { id: '6', descricao: 'Mensalidade 06/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-07-10', data_pagamento: null, valor_pago: null, status: 'PENDENTE', forma_pagamento: null },
      { id: '7', descricao: 'Mensalidade 07/10 - Curso Técnico', valor: 250.00, data_vencimento: '2026-08-10', data_pagamento: null, valor_pago: null, status: 'PENDENTE', forma_pagamento: null },
    ];
  };

  const installments = getInstallments();

  // Calculations
  const totalPaid = installments
    .filter(i => i.status === 'PAGO')
    .reduce((acc, i) => acc + Number(i.valor), 0);

  const totalPending = installments
    .filter(i => i.status === 'PENDENTE' || i.status === 'VENCIDO')
    .reduce((acc, i) => acc + Number(i.valor), 0);

  const handleCopyPix = (key: string) => {
    navigator.clipboard.writeText(key);
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const getInstallmentStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PAGO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Pago
          </span>
        );
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pendente
          </span>
        );
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-100">
            <BadgeAlert size={10} /> Vencido
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Panel */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="text-blue-600" />
            Financeiro Acadêmico
          </h2>
          <p className="text-xs text-slate-450 font-medium">Gerencie suas mensalidades, boletos e pagamentos via PIX</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Pago</p>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Lançamentos compensados</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">A pagar / Aberto</p>
            <p className="text-2xl font-black text-[#001a33]">{formatCurrency(totalPending)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Mensalidades futuras e pendentes</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* Invoice Table / List */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <FileText size={16} className="text-blue-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Histórico de Cobranças</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium text-slate-500">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                <th className="py-4 px-4">Descrição</th>
                <th className="py-4 px-4">Vencimento</th>
                <th className="py-4 px-4">Valor</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Pagamento</th>
                <th className="py-4 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {installments.map((inst) => (
                <tr key={inst.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4.5 px-4 font-bold text-slate-800">{inst.descricao}</td>
                  <td className="py-4.5 px-4">{formatDate(inst.data_vencimento)}</td>
                  <td className="py-4.5 px-4 font-bold text-[#001a33]">{formatCurrency(inst.valor)}</td>
                  <td className="py-4.5 px-4">{getInstallmentStatusBadge(inst.status)}</td>
                  <td className="py-4.5 px-4">
                    {inst.status === 'PAGO' ? (
                      <span className="text-[10px] font-bold text-slate-650 bg-slate-100 px-2 py-0.5 rounded">
                        {formatDate(inst.data_pagamento)} via {inst.forma_pagamento || 'Pix'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold">—</span>
                    )}
                  </td>
                  <td className="py-4.5 px-4 text-right">
                    {inst.status !== 'PAGO' ? (
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setShowPixModal(inst)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                        >
                          Pagar Pix
                        </button>
                        <button 
                          onClick={() => setShowBoletoModal(inst)}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                        >
                          Boleto
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => alert('Recibo gerado com sucesso! (Simulação)')}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                      >
                        Recibo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PIX Modal Overlay */}
      {showPixModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn flex flex-col items-center text-center">
            <button 
              onClick={() => setShowPixModal(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <CreditCard size={24} />
            </div>

            <h4 className="text-base font-bold text-[#001a33] uppercase tracking-tight">Pagar via PIX</h4>
            <p className="text-slate-500 text-xs mt-1">Escaneie o QR Code abaixo ou copie a chave Pix Copia e Cola para realizar o pagamento.</p>

            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-150 my-6 flex justify-center items-center">
              {/* Fake QR code representation */}
              <div className="w-40 h-40 bg-white border border-slate-200 p-2 flex flex-col justify-center items-center">
                <div className="grid grid-cols-4 gap-1 w-full h-full opacity-70">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`rounded-sm ${i % 3 === 0 || i % 7 === 0 ? 'bg-[#001a33]' : 'bg-transparent'}`} />
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full space-y-4">
              <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-150 flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] uppercase text-slate-400 font-bold">Chave Pix Copia e Cola</p>
                  <p className="text-[10px] text-slate-750 font-bold truncate">00020126580014br.gov.bcb.pix0136kfekgwyqozhicpfuunpo.universo</p>
                </div>
                <button 
                  onClick={() => handleCopyPix('00020126580014br.gov.bcb.pix0136kfekgwyqozhicpfuunpo.universo')}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg shrink-0 transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>

              {pixCopied && (
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider">Chave Pix Copiada!</p>
              )}

              <button 
                onClick={() => {
                  alert('Comprovante enviado! Aguardando compensação bancária (compensação simulada em 5 segundos)');
                  setShowPixModal(null);
                }}
                className="w-full py-3 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOLETO Modal Overlay */}
      {showBoletoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-xl w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
            <button 
              onClick={() => setShowBoletoModal(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-50 text-slate-650 rounded-xl flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#001a33] uppercase tracking-tight">Boleto Bancário</h4>
                <p className="text-[10px] text-slate-450 uppercase font-black tracking-widest">{showBoletoModal.descricao}</p>
              </div>
            </div>

            {/* Fake Bank Slip styling */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-[10px] text-slate-600 bg-white font-mono shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-xs border-r border-slate-300 pr-2">341-7</span>
                  <span className="font-black text-[11px]">BANCO UNIVERSO S.A.</span>
                </div>
                <span className="font-bold text-[9px] text-slate-500">34191.79001 01043.513184 91020.150008 7 98120000025000</span>
              </div>

              <div className="grid grid-cols-4 border-b border-slate-200">
                <div className="col-span-3 border-r border-slate-250 p-3">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Local de Pagamento</p>
                  <p className="font-bold text-slate-850 font-sans mt-0.5">QUALQUER BANCO OU CORRESPONDENTE BANCÁRIO ATÉ O VENCIMENTO</p>
                </div>
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Vencimento</p>
                  <p className="font-bold text-slate-850 text-xs mt-0.5">{formatDate(showBoletoModal.data_vencimento)}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 border-b border-slate-200">
                <div className="col-span-3 border-r border-slate-250 p-3">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Cedente / Beneficiário</p>
                  <p className="font-bold text-slate-850 font-sans mt-0.5">UNIVERSO CURSOS E CONSULTORIA LTDA - CNPJ: 26.111.450/0001-33</p>
                </div>
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Valor da Cobrança</p>
                  <p className="font-bold text-slate-850 text-xs mt-0.5">{formatCurrency(showBoletoModal.valor)}</p>
                </div>
              </div>

              <div className="p-3 border-b border-slate-200">
                <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Instruções de Responsabilidade do Beneficiário</p>
                <p className="font-medium font-sans leading-relaxed text-[9px] mt-1">
                  * APÓS O VENCIMENTO COBRAR MULTA DE 2.0% E JUROS DE 1% AO MÊS.<br />
                  * NÃO RECEBER APÓS 30 DIAS DO VENCIMENTO.<br />
                  * QUALQUER DÚVIDA ENTRAR EM CONTATO COM O POLO DE MATRÍCULA.
                </p>
              </div>

              <div className="p-4 flex flex-col items-center gap-2 bg-slate-50">
                {/* Fake Barcode representation */}
                <div className="h-10 bg-slate-900 w-full flex items-center justify-between opacity-80 rounded-sm">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} className="h-full bg-black" style={{ width: `${i % 3 === 0 ? '1px' : i % 5 === 0 ? '3px' : '2px'}` }} />
                  ))}
                </div>
                <p className="text-[8px] tracking-[0.2em] font-sans font-bold text-slate-400 uppercase">Código de barras para leitura</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setShowBoletoModal(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button 
                onClick={() => {
                  alert('Download do PDF do boleto iniciado! (Simulação)');
                  setShowBoletoModal(null);
                }}
                className="px-5 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-md"
              >
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FinanceiroPage;
