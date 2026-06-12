
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoFinanceiro.tsx

import React from 'react';
import { DollarSign, FileText, Calendar, CreditCard } from 'lucide-react';

const ParceiroAlunoFinanceiro: React.FC = () => {
  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="flex-1 bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2rem] p-6 text-white shadow-lg">
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Status Financeiro</p>
            <h3 className="text-3xl font-black mb-4">Adimplente</h3>
            <div className="flex gap-2">
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-medium">Mensalidade em dia</span>
            </div>
        </div>
        <div className="flex-1 bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Próximo Vencimento</p>
            <h3 className="text-3xl font-black text-[#001a33] mb-4">10/03</h3>
            <button className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                <CreditCard size={14} /> Gerar Boleto/Pix
            </button>
        </div>
      </div>

      <h3 className="text-lg font-bold text-[#001a33] mb-4">Histórico de Pagamentos</h3>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <DollarSign size={18} />
                    </div>
                    <div>
                        <p className="font-bold text-[#001a33] text-sm">Mensalidade {i}/12</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar size={10} /> Pago em 10/0{i}/2024
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="font-bold text-slate-700">R$ 350,00</p>
                    <button className="text-[10px] text-blue-600 font-bold uppercase flex items-center justify-end gap-1 mt-1">
                        <FileText size={10} /> Recibo
                    </button>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default ParceiroAlunoFinanceiro;
