
// File: modules/asaas/asaas.page.tsx

import React from 'react';
import { CreditCard, CheckCircle, AlertTriangle } from 'lucide-react';

const AsaasPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 p-8 animate-fadeIn">
      <div className="max-w-5xl mx-auto">
        
        <header className="mb-8 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <CreditCard size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
                Módulo Financeiro Asaas
              </h1>
              <p className="text-slate-500 font-medium">
                Status da integração e logs de transações.
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card de Status */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-[#001a33] mb-4">Status da Conexão</h3>
            <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-100 mb-4">
              <CheckCircle size={24} />
              <div>
                <p className="font-bold uppercase text-xs tracking-wider">Serviço Mockado Ativo</p>
                <p className="text-sm">O sistema está simulando respostas do Asaas.</p>
              </div>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">
              Este painel é administrativo para verificar a saúde da integração. As cobranças e assinaturas são gerenciadas através dos módulos de <strong>Matrícula</strong> e <strong>Financeiro</strong>.
            </p>
          </div>

          {/* Card de Ambiente */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-[#001a33] mb-4">Ambiente Configurado</h3>
            <div className="flex items-center gap-3 bg-yellow-50 text-yellow-700 p-4 rounded-xl border border-yellow-100 mb-4">
              <AlertTriangle size={24} />
              <div>
                <p className="font-bold uppercase text-xs tracking-wider">Modo Sandbox (Simulação)</p>
                <p className="text-sm">Nenhuma cobrança real está sendo gerada.</p>
              </div>
            </div>
            <div className="text-xs font-mono bg-slate-900 text-slate-400 p-4 rounded-xl">
              API_KEY: ******************** <br/>
              WALLET_ID: ********************
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AsaasPage;
