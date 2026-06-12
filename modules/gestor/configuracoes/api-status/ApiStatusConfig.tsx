
import React from 'react';
import { Server, Database, ShieldCheck, Globe } from 'lucide-react';

const ApiStatusConfig: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="border-b border-slate-100 pb-4 mb-8">
        <h3 className="text-2xl font-bold text-[#001a33]">Status do Sistema</h3>
        <p className="text-slate-500 text-sm">Monitoramento em tempo real dos serviços conectados.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><Database size={24} /></div>
            <div>
              <p className="font-bold text-[#001a33]">Banco de Dados</p>
              <p className="text-xs text-slate-500">Supabase PostgreSQL</p>
            </div>
          </div>
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Online</span>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Globe size={24} /></div>
            <div>
              <p className="font-bold text-[#001a33]">API Gateway</p>
              <p className="text-xs text-slate-500">REST Endpoints</p>
            </div>
          </div>
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Online</span>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><ShieldCheck size={24} /></div>
            <div>
              <p className="font-bold text-[#001a33]">Autenticação</p>
              <p className="text-xs text-slate-500">Supabase Auth</p>
            </div>
          </div>
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Online</span>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><Server size={24} /></div>
            <div>
              <p className="font-bold text-[#001a33]">Versão do Sistema</p>
              <p className="text-xs text-slate-500">v1.2.4 (Estável)</p>
            </div>
          </div>
          <span className="text-slate-400 text-xs font-mono">Build 20240228</span>
        </div>

      </div>
    </div>
  );
};

export default ApiStatusConfig;
