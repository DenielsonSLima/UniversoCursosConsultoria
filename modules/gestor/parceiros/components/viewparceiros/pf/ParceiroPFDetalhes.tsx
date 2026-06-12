// File: modules/gestor/parceiros/components/viewparceiros/pf/ParceiroPFDetalhes.tsx

import React, { useState } from 'react';
import { ArrowLeft, User, Briefcase, FileText, DollarSign } from 'lucide-react';

interface ParceiroPFDetalhesProps {
  pfInicial: any;
  onBack: () => void;
}

const ParceiroPFDetalhes: React.FC<ParceiroPFDetalhesProps> = ({ pfInicial, onBack }) => {
  const [activeTab, setActiveTab] = useState<'dados' | 'servicos' | 'docs' | 'financeiro'>('dados');
  const [pfData, setPfData] = useState(pfInicial);

  const tabs = [
    { id: 'dados', label: 'Dados Pessoais', icon: <User size={18} /> },
    { id: 'servicos', label: 'Serviços Prestados', icon: <Briefcase size={18} /> },
    { id: 'docs', label: 'Documentos', icon: <FileText size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
  ];

  return (
    <div className="min-h-screen pb-20">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button 
                    onClick={onBack}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-400 transition-colors bg-slate-50"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                        {pfData.nome}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">
                        Pessoa Física • CPF: {pfData.cpf || 'Não informado'} • Status: <span className="text-emerald-600">Ativo</span>
                    </p>
                </div>
            </div>

            {/* Navegação de Abas */}
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-[#001a33] text-white shadow-lg shadow-amber-900/20' 
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[600px] animate-fadeIn">
        {activeTab === 'dados' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Dados da Pessoa Física</div>
        )}
        {activeTab === 'servicos' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Serviços Prestados</div>
        )}
        {activeTab === 'docs' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Documentos (RG, CPF, Comprovantes)</div>
        )}
        {activeTab === 'financeiro' && (
            <div className="text-slate-500 text-center py-20">Em desenvolvimento: Financeiro (A pagar/Receber)</div>
        )}
      </div>

    </div>
  );
};

export default ParceiroPFDetalhes;
