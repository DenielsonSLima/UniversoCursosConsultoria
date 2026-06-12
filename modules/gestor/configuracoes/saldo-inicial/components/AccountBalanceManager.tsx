
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Calendar, DollarSign, Building, AlertCircle, RefreshCw } from 'lucide-react';
import { saldoInicialService } from '../saldo-inicial.service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

interface AccountBalanceManagerProps {
  company: any;
  onBack: () => void;
}

const AccountBalanceManager: React.FC<AccountBalanceManagerProps> = ({ company, onBack }) => {
  const queryClient = useQueryClient();

  // 1. Carregar as contas da empresa com useQuery
  const { data: accounts = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['saldo_inicial_accounts', company.id],
    queryFn: () => saldoInicialService.getAccountsByCompany(company.id),
  });

  // 2. Realtime para a tabela contas_bancarias (sincronizar se outro usuário alterar os saldos)
  useEffect(() => {
    const channel = supabase
      .channel(`saldo_inicial_realtime_${company.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_bancarias', filter: `company_id=eq.${company.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['saldo_inicial_accounts', company.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company.id, queryClient]);

  // 3. Mutation para atualizar o saldo inicial
  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, value, date }: { id: string; value: number; date: string }) => 
      saldoInicialService.updateInitialBalance(id, value, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saldo_inicial_accounts', company.id] });
      alert('Saldo inicial atualizado com sucesso!');
    },
    onError: (err: any) => alert(`Erro ao atualizar saldo: ${err.message}`),
  });

  const handleUpdate = async (id: string, value: string, date: string) => {
    updateBalanceMutation.mutate({ id, value: parseFloat(value) || 0, date });
  };

  const getBankColor = (bankName: string) => {
    const name = bankName.toLowerCase();
    if (name.includes('nubank')) return 'bg-purple-600';
    if (name.includes('brasil') || name.includes('bb')) return 'bg-yellow-400';
    if (name.includes('caixa')) return 'bg-blue-600';
    if (name.includes('inter')) return 'bg-orange-500';
    if (name.includes('santander')) return 'bg-red-600';
    if (name.includes('bradesco')) return 'bg-red-500';
    if (name.includes('itau')) return 'bg-orange-600';
    return 'bg-slate-700';
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando contas...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <p className="text-red-600 font-bold">Erro ao carregar as contas:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">{company.nomeFantasia}</h3>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              Configurando saldos iniciais das contas
            </p>
          </div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
          <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Esta unidade não possui contas bancárias cadastradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {accounts.map((account) => (
            <AccountCard 
              key={account.id} 
              account={account} 
              onSave={handleUpdate}
              bankColor={getBankColor(account.banco)}
              isSaving={updateBalanceMutation.isPending && updateBalanceMutation.variables?.id === account.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Sub-componente interno para o Card de Conta
const AccountCard = ({ account, onSave, bankColor, isSaving }: any) => {
  const [saldo, setSaldo] = useState(account.saldoInicial || 0);
  const [data, setData] = useState(account.dataSaldo || '');

  // Sincronizar o estado interno se a prop account mudar por conta de um evento realtime
  useEffect(() => {
    setSaldo(account.saldoInicial || 0);
    setData(account.dataSaldo || '');
  }, [account]);

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row hover:shadow-xl transition-shadow">
      {/* Lado Esquerdo: Identificação Visual */}
      <div className={`md:w-32 p-6 flex flex-col items-center justify-center text-white ${bankColor} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10 text-center">
          <Building size={32} className="mx-auto mb-2 opacity-90" />
          <p className="text-[10px] font-black uppercase tracking-widest leading-tight">{account.banco}</p>
        </div>
      </div>

      {/* Lado Direito: Formulário */}
      <div className="flex-1 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conta {account.tipo}</p>
            <p className="text-sm font-bold text-[#001a33]">Ag: {account.agencia} • Cc: {account.conta}</p>
          </div>
          {account.saldoInicial > 0 && (
             <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase px-2 py-1 rounded-md border border-emerald-100">
               Saldo Definido
             </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <DollarSign size={10} /> Saldo Inicial (R$)
            </label>
            <input 
              type="number" 
              step="0.01"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-black focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Calendar size={10} /> Data de Início
            </label>
            <input 
              type="date" 
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-50 flex justify-end">
          <button 
            onClick={() => onSave(account.id, saldo, data)}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-teal-600 transition-colors shadow-lg shadow-teal-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            {isSaving ? 'Salvando...' : 'Atualizar Saldo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountBalanceManager;
