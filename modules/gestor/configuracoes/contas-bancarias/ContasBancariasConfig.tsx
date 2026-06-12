
import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight, RefreshCw } from 'lucide-react';
import CompanyAccountsManager from './components/CompanyAccountsManager';
import { contasBancariasService } from './contas-bancarias.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

const ContasBancariasConfig: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const queryClient = useQueryClient();

  // 1. Carregar as empresas com a contagem de contas vinculadas
  const { data: companies = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['companies_accounts'],
    queryFn: contasBancariasService.getCompanies,
  });

  // 2. Escutar em tempo real alterações na tabela 'polos' ou 'contas_bancarias' para atualizar os contadores
  useEffect(() => {
    const channel = supabase
      .channel('contas_bancarias_companies_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_bancarias' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (selectedCompany) {
    return (
      <CompanyAccountsManager 
        company={selectedCompany} 
        onBack={() => setSelectedCompany(null)} 
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando unidades...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar as unidades:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      <div className="border-b border-slate-100 pb-4 mb-8">
        <h3 className="text-2xl font-bold text-[#001a33]">Contas Bancárias</h3>
        <p className="text-slate-500 text-sm">Selecione a unidade para gerenciar suas contas financeiras.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <div 
            key={company.id}
            onClick={() => setSelectedCompany(company)}
            className={`group bg-white rounded-[2rem] border p-6 cursor-pointer transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between ${
              company.ativo 
                ? 'border-slate-100 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/10' 
                : 'border-slate-100 opacity-70 grayscale hover:grayscale-0'
            }`}
          >
             {/* Header Card */}
            <div>
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
                  company.ativo 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white' 
                    : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}>
                  <Building2 size={24} />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {company.contasCount || 0} Contas
                    </span>
                  </div>
                  {!company.ativo && (
                     <span className="text-[10px] font-black text-red-500 uppercase tracking-wider bg-red-50 px-2 py-1 rounded-md border border-red-100">
                       Inativo
                     </span>
                  )}
                </div>
              </div>

              <h3 className={`text-lg font-black mb-1 transition-colors relative z-10 ${
                company.ativo ? 'text-[#001a33] group-hover:text-emerald-700' : 'text-slate-500'
              }`}>
                {company.nomeFantasia}
              </h3>
              <p className="text-xs text-slate-500 font-medium relative z-10 mb-6">
                CNPJ: {company.cnpj}
              </p>
            </div>

            {/* Footer Card */}
            <div className="pt-4 border-t border-slate-100 relative z-10 flex items-center gap-2">
              <button 
                className={`flex-1 flex items-center justify-between text-xs font-bold uppercase tracking-widest transition-colors ${
                  company.ativo ? 'text-slate-400 group-hover:text-emerald-600' : 'text-slate-400'
                }`}
              >
                <span>Gerenciar Contas</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Decorative BG */}
            {company.ativo && (
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-emerald-50 rounded-full opacity-0 group-hover:opacity-10 transition-opacity blur-2xl"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContasBancariasConfig;
