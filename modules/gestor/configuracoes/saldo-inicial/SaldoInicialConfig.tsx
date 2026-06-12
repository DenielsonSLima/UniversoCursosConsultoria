
import React, { useState } from 'react';
import CompanySelection from './components/CompanySelection';
import AccountBalanceManager from './components/AccountBalanceManager';
import { saldoInicialService } from './saldo-inicial.service';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

const SaldoInicialConfig: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);

  // Carrega as empresas do banco
  const { data: companies = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['saldo_inicial_companies'],
    queryFn: saldoInicialService.getCompanies,
  });

  if (selectedCompany) {
    return (
      <AccountBalanceManager 
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
        <h3 className="text-2xl font-bold text-[#001a33]">Saldo Inicial</h3>
        <p className="text-slate-500 text-sm">
          Defina o valor de abertura e a data de corte para o fluxo de caixa de cada conta.
        </p>
      </div>

      <CompanySelection 
        companies={companies} 
        onSelect={setSelectedCompany} 
      />
    </div>
  );
};

export default SaldoInicialConfig;
