
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Database, ShieldCheck, Globe, CreditCard, Landmark } from 'lucide-react';
import {
  GatewayEnvironment,
  GatewayProviderCode,
  integracaoBancariaService,
} from '../integracao-bancaria/integracao-bancaria.service';

const formatDateTime = (value?: string) => {
  if (!value) return 'Sem teste recente';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const statusBadge = (status: 'online' | 'warning' | 'offline', label: string) => {
  const styles = {
    online: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-orange-100 text-orange-700',
    offline: 'bg-slate-100 text-slate-500',
  };

  return (
    <span className={`${styles[status]} px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide`}>
      {label}
    </span>
  );
};

const ApiStatusConfig: React.FC = () => {
  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['integracao_bancaria'],
    queryFn: integracaoBancariaService.getOverview,
  });

  const getProviderStatus = (
    providerCode: Extract<GatewayProviderCode, 'banese_card' | 'mercado_pago'>,
    environment: GatewayEnvironment,
  ) => {
    if (isLoading) {
      return {
        badge: statusBadge('warning', 'Verificando'),
        detail: 'Consultando configuração...',
        iconClass: 'bg-orange-100 text-orange-600',
      };
    }

    if (isError) {
      return {
        badge: statusBadge('warning', 'Atenção'),
        detail: 'Não foi possível consultar a integração bancária',
        iconClass: 'bg-orange-100 text-orange-600',
      };
    }

    const credential = overview?.credentials.find(
      (item) => item.providerCode === providerCode && item.environment === environment,
    );
    if (credential?.configured && credential.lastTestStatus === 'OK') {
      return {
        badge: statusBadge('online', 'Validada'),
        detail: `Último teste válido em ${formatDateTime(credential.lastTestAt || undefined)}`,
        iconClass: 'bg-emerald-100 text-emerald-600',
      };
    }

    if (credential?.configured) {
      return {
        badge: statusBadge('warning', 'Revisar'),
        detail: credential.lastTestMessage || 'Chaves salvas, aguardando teste de conexão',
        iconClass: 'bg-orange-100 text-orange-600',
      };
    }

    return {
      badge: statusBadge('offline', 'Inativo'),
      detail: 'Credenciais ainda não validadas neste ambiente',
      iconClass: 'bg-slate-100 text-slate-500',
    };
  };

  const providerCards = [
    { providerCode: 'banese_card' as const, environment: 'sandbox' as const, label: 'Banese Homologação', icon: Landmark },
    { providerCode: 'banese_card' as const, environment: 'production' as const, label: 'Banese Produção', icon: Landmark },
    { providerCode: 'mercado_pago' as const, environment: 'sandbox' as const, label: 'Mercado Pago Teste', icon: CreditCard },
    { providerCode: 'mercado_pago' as const, environment: 'production' as const, label: 'Mercado Pago Produção', icon: CreditCard },
  ];

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

        {providerCards.map((card) => {
          const providerStatus = getProviderStatus(card.providerCode, card.environment);
          const Icon = card.icon;
          return (
            <div key={`${card.providerCode}-${card.environment}`} className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`p-3 rounded-xl ${providerStatus.iconClass}`}><Icon size={24} /></div>
                <div className="min-w-0">
                  <p className="font-bold text-[#001a33]">{card.label}</p>
                  <p className="text-xs text-slate-500 truncate">{providerStatus.detail}</p>
                </div>
              </div>
              {providerStatus.badge}
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default ApiStatusConfig;
