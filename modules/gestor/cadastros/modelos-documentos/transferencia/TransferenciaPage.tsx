
import React from 'react';
import { ArrowRightLeft, Save } from 'lucide-react';

const TransferenciaPage: React.FC = () => {
  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
      <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
          <ArrowRightLeft size={32} />
        </div>
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Modelo de Transferência</h3>
          <p className="text-slate-500 text-sm">Documentação oficial para transferência externa.</p>
        </div>
      </div>

      <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
        <p className="text-slate-500 font-bold mb-4">Configuração de campos de transferência...</p>
        <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 mx-auto">
          <Save size={16} /> Salvar Modelo
        </button>
      </div>
    </div>
  );
};

export default TransferenciaPage;
