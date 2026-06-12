import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldAlert, Key, Link as LinkIcon, RefreshCw, Server, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { asaasService, AsaasConfigData } from './asaas.service';
import { supabase } from '../../../../lib/supabase';

const AsaasConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [apiKey, setApiKey] = useState('');
  const [walletId, setWalletId] = useState('');

  // 1. Carregar configuração do Asaas
  const { data: config, isLoading, isError, error } = useQuery<AsaasConfigData>({
    queryKey: ['asaas_config'],
    queryFn: asaasService.getConfig,
  });

  // 2. Preencher estados locais com dados do banco
  useEffect(() => {
    if (config) {
      setEnvironment(config.environment);
      setApiKey(config.apiKey);
      setWalletId(config.walletId);
    }
  }, [config]);

  // 3. Realtime para a tabela 'asaas_config'
  useEffect(() => {
    const channel = supabase
      .channel('asaas_config_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asaas_config' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['asaas_config'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 4. Mutation para salvar a configuração
  const saveMutation = useMutation({
    mutationFn: (data: AsaasConfigData) => asaasService.saveConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas_config'] });
      alert('Configurações de integração Asaas salvas com sucesso!');
    },
    onError: (err: any) => alert(`Erro ao salvar configurações do Asaas: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      id: config?.id,
      environment,
      apiKey,
      walletId
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando configuração do Asaas...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <p className="text-red-600 font-bold">Erro ao carregar configurações:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Integração Asaas</h3>
          <p className="text-slate-500 text-sm font-medium mt-1">Configure sua chave de API para emissão automática de boletos e Pix.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
           <button 
             onClick={() => setEnvironment('sandbox')}
             className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
               environment === 'sandbox' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-500 hover:text-orange-500'
             }`}
           >
             Sandbox (Teste)
           </button>
           <button 
             onClick={() => setEnvironment('production')}
             className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
               environment === 'production' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-emerald-600'
             }`}
           >
             Produção
           </button>
        </div>
      </div>

      {environment === 'production' ? (
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 mb-8 flex items-start gap-4 animate-fadeIn">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <CheckCircle2 className="text-emerald-600" size={24} />
          </div>
          <div>
            <h4 className="font-bold text-emerald-800 text-sm mb-1 uppercase tracking-widest">Ambiente de Produção Ativo</h4>
            <p className="text-xs text-emerald-600 font-medium leading-relaxed">As cobranças geradas aqui são reais e serão enviadas para os alunos. Tenha cuidado ao realizar testes neste ambiente.</p>
          </div>
        </div>
      ) : (
        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 mb-8 flex items-start gap-4 animate-fadeIn">
          <div className="bg-orange-100 p-2 rounded-lg">
            <ShieldAlert className="text-orange-600" size={24} />
          </div>
          <div>
            <h4 className="font-bold text-orange-800 text-sm mb-1 uppercase tracking-widest">Ambiente de Testes (Sandbox)</h4>
            <p className="text-xs text-orange-600 font-medium leading-relaxed">As cobranças não são reais. Ideal para validar o fluxo do sistema sem gerar impacto financeiro.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <Key size={14} /> Chave de API ({environment === 'production' ? 'Produção' : 'Sandbox'})
            </label>
            <input 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-700 font-mono text-sm transition-all" 
              placeholder="$aact_..." 
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <Server size={14} /> Wallet ID (Opcional - Para Subcontas)
            </label>
            <input 
              type="text" 
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-700 font-mono text-sm transition-all" 
            />
          </div>

          <div className="pt-4 border-t border-slate-100 max-w-sm">
            <button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="w-full bg-[#001a33] text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saveMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} 
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
        
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 h-fit space-y-6">
           <div>
             <h4 className="font-bold text-[#001a33] mb-1 flex items-center gap-2 pb-2 border-b border-slate-200"><LinkIcon size={16} className="text-blue-600" /> Webhooks Asaas</h4>
             <p className="text-xs text-slate-500 font-medium mb-4 mt-2">Configure esta URL no painel do Asaas para que o sistema receba atualizações automáticas de pagamento.</p>
             
             <div className="bg-slate-200 p-3 rounded-xl flex items-center justify-between">
                <code className="text-xs font-mono text-slate-700 truncate mr-4">https://api.seusistema.com/webhooks/asaas</code>
                <button 
                  type="button" 
                  onClick={() => {
                    navigator.clipboard.writeText('https://api.seusistema.com/webhooks/asaas');
                    alert('URL copiada!');
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                >
                  Copiar URL
                </button>
             </div>
           </div>

           <div>
              <h4 className="font-bold text-[#001a33] mb-2 text-sm uppercase tracking-widest">Eventos Necessários:</h4>
              <ul className="space-y-2 text-xs font-medium text-slate-600">
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> PAYMENT_CREATED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> PAYMENT_RECEIVED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> PAYMENT_OVERDUE</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> PAYMENT_DELETED</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AsaasConfig;
