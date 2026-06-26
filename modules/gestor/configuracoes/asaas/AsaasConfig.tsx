import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Copy,
  Key,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  Smartphone,
  XCircle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { asaasService, AsaasConfigData } from './asaas.service';
import ToastNotification, { useToast } from '../../components/ToastNotification';

const AsaasConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [activeTab, setActiveTab] = useState<'connection' | 'notifications'>('connection');
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [walletId, setWalletId] = useState('');
  const [notificationChannels, setNotificationChannels] = useState({
    whatsapp: false,
    email: false,
    sms: false,
  });
  const notificationsEnabled = notificationChannels.whatsapp || notificationChannels.email || notificationChannels.sms;

  // 1. Carregar configuração do Asaas
  const { data: config, isLoading, isError, error } = useQuery<AsaasConfigData>({
    queryKey: ['asaas_config', environment],
    queryFn: () => asaasService.getConfig(environment),
  });

  useEffect(() => {
    if (config) {
      setWalletId(config.walletId);
      setNotificationChannels({
        whatsapp: config.notificationWhatsappEnabled,
        email: config.notificationEmailEnabled,
        sms: config.notificationSmsEnabled,
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (data: {
      environment: 'sandbox' | 'production';
      apiKey: string;
      webhookToken: string;
      walletId: string;
      notificationsEnabled: boolean;
      notificationWhatsappEnabled: boolean;
      notificationEmailEnabled: boolean;
      notificationSmsEnabled: boolean;
    }) =>
      asaasService.saveConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas_config'] });
      setApiKey('');
      setWebhookToken('');
      toast.success('Integração Asaas salva', 'Os tokens foram validados e armazenados com segurança no cofre.');
    },
    onError: (err: any) => toast.error('Erro ao salvar Asaas', err.message),
  });

  const notificationMutation = useMutation({
    mutationFn: asaasService.saveNotificationPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas_config'] });
      toast.success('Preferência salva', notificationsEnabled
        ? 'Os canais permitidos foram salvos para as próximas cobranças.'
        : 'Todos os avisos pagos do Asaas ficarão desativados por padrão.');
    },
    onError: (err: any) => toast.error('Erro ao salvar notificações', err.message),
  });

  const testMutation = useMutation({
    mutationFn: asaasService.testConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas_config'] });
      toast.success('Conexão validada', 'O ambiente selecionado respondeu corretamente.');
    },
    onError: (err: any) => toast.error('Falha na conexão', err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      environment,
      apiKey,
      webhookToken,
      walletId,
      notificationsEnabled,
      notificationWhatsappEnabled: notificationChannels.whatsapp,
      notificationEmailEnabled: notificationChannels.email,
      notificationSmsEnabled: notificationChannels.sms,
    });
  };

  const toggleNotificationChannel = (channel: keyof typeof notificationChannels) => {
    setNotificationChannels((current) => ({
      ...current,
      [channel]: !current[channel],
    }));
  };

  const handleEnvironmentChange = (nextEnvironment: 'sandbox' | 'production') => {
    setEnvironment(nextEnvironment);
    setApiKey('');
    setWebhookToken('');
  };

  const StatusBadge = ({ configured }: { configured?: boolean }) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
        configured
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
          : 'bg-red-50 text-red-700 ring-1 ring-red-100'
      }`}
    >
      {configured ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {configured ? 'Cadastrado' : 'Não cadastrado'}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando configuração do Asaas...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <p className="text-red-600 font-bold">Erro ao carregar configurações:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Integração Asaas</h3>
          <p className="text-slate-500 text-sm font-medium mt-1">Configure sua chave de API para emissão automática de boletos e Pix.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 ring-1 ring-slate-100">
              API {environment === 'production' ? 'produção' : 'sandbox'} <StatusBadge configured={config?.apiConfigured} />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 ring-1 ring-slate-100">
              Webhook {environment === 'production' ? 'produção' : 'sandbox'} <StatusBadge configured={config?.webhookConfigured} />
            </div>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
           <button 
             onClick={() => handleEnvironmentChange('sandbox')}
             className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
               environment === 'sandbox' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-500 hover:text-orange-500'
             }`}
           >
             Sandbox (Teste)
           </button>
           <button 
             onClick={() => handleEnvironmentChange('production')}
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

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('connection')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'connection'
              ? 'bg-[#001a33] text-white shadow-sm'
              : 'text-slate-500 hover:bg-white hover:text-[#001a33]'
          }`}
        >
          <PlugZap size={15} /> Conexão e tokens
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'notifications'
              ? 'bg-[#001a33] text-white shadow-sm'
              : 'text-slate-500 hover:bg-white hover:text-[#001a33]'
          }`}
        >
          <BellRing size={15} /> Notificações pagas
          <span className={`rounded-full px-2 py-0.5 text-[9px] ${
            notificationsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
          }`}>
            {notificationsEnabled ? 'Parcial' : 'Desativado'}
          </span>
        </button>
      </div>

      {activeTab === 'connection' ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <Key size={14} /> Chave de API ({environment === 'production' ? 'Produção' : 'Sandbox'})
               <StatusBadge configured={config?.apiConfigured} />
            </label>
            <div className="relative">
              <input 
                type="password" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-700 font-mono text-sm transition-all ${
                  config?.apiConfigured ? 'border-emerald-200 ring-2 ring-emerald-50' : 'border-red-200 ring-2 ring-red-50'
                }`}
                placeholder="" 
                required={!config?.apiConfigured}
              />
              {config?.apiConfigured && !apiKey && (
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-sm tracking-widest text-slate-600">
                  ***************
                </div>
              )}
            </div>
            <p className="text-[10px] font-semibold text-slate-400">
              A chave é enviada diretamente ao backend, validada e armazenada criptografada. Ela nunca volta para esta tela.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <LinkIcon size={14} /> Token do webhook ({environment === 'production' ? 'Produção' : 'Sandbox'})
               <StatusBadge configured={config?.webhookConfigured} />
            </label>
            <div className="relative">
              <input
                type="password"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-700 font-mono text-sm transition-all ${
                  config?.webhookConfigured ? 'border-emerald-200 ring-2 ring-emerald-50' : 'border-red-200 ring-2 ring-red-50'
                }`}
                placeholder=""
                required={!config?.webhookConfigured}
              />
              {config?.webhookConfigured && !webhookToken && (
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-sm tracking-widest text-slate-600">
                  ***************
                </div>
              )}
            </div>
            <p className="text-[10px] font-semibold text-slate-400">
              Use este mesmo token no campo Token de autenticação ao cadastrar o webhook no painel do Asaas.
            </p>
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

          <div className="flex max-w-xl flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row">
            <button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="w-full bg-[#001a33] text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saveMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} 
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
            {config?.apiConfigured && (
              <button
                type="button"
                onClick={() => testMutation.mutate(environment)}
                disabled={testMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-4 text-xs font-bold uppercase tracking-widest text-[#001a33] hover:border-blue-300 disabled:opacity-50"
              >
                {testMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <PlugZap size={16} />}
                Testar conexão
              </button>
            )}
          </div>
        </form>
        
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 h-fit space-y-6">
           <div>
             <h4 className="font-bold text-[#001a33] mb-1 flex items-center gap-2 pb-2 border-b border-slate-200"><LinkIcon size={16} className="text-blue-600" /> Webhooks Asaas</h4>
             <p className="text-xs text-slate-500 font-medium mb-4 mt-2">Configure esta URL no painel do Asaas para que o sistema receba atualizações automáticas de pagamento.</p>
             
             <div className="bg-slate-200 p-3 rounded-xl flex items-center justify-between">
                <code className="text-xs font-mono text-slate-700 truncate mr-4">{config?.webhookUrl}</code>
                <button 
                  type="button" 
                  onClick={() => {
                    navigator.clipboard.writeText(config?.webhookUrl || '');
                    toast.info('URL copiada', 'Cole esta URL no painel de webhooks do Asaas.');
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                >
                  Copiar URL
                </button>
             </div>
             <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
               <div className="mb-2 flex items-center justify-between gap-3">
                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Token de autenticação do webhook</p>
                 <StatusBadge configured={config?.webhookConfigured} />
               </div>
               <div className="flex items-center gap-3">
                 <code className="min-w-0 flex-1 truncate text-xs font-mono text-slate-700">
                   {config?.webhookConfigured ? (config.webhookToken || '***************') : 'Não configurado'}
                 </code>
                 <button
                   type="button"
                   onClick={() => {
                     if (!config?.webhookToken) {
                       toast.info('Token indisponível', 'Salve um token para este ambiente antes de copiar.');
                       return;
                     }
                     navigator.clipboard.writeText(config.webhookToken);
                     toast.info('Token copiado', 'Cole no campo Token de autenticação do webhook do Asaas.');
                   }}
                   className="text-blue-600 hover:text-blue-800"
                   title="Copiar token"
                 >
                   <Copy size={16} />
                 </button>
               </div>
             </div>
           </div>

           <div>
              <h4 className="font-bold text-[#001a33] mb-2 text-sm uppercase tracking-widest">Eventos Necessários:</h4>
              <ul className="space-y-2 text-xs font-medium text-slate-600">
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> PAYMENT_CREATED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div> PAYMENT_UPDATED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> PAYMENT_CONFIRMED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> PAYMENT_RECEIVED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> PAYMENT_OVERDUE</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> PAYMENT_DELETED</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> PAYMENT_REFUNDED</li>
              </ul>
              <p className="mt-4 text-[10px] font-semibold text-slate-400">
                No Asaas, use API v3 e tipo de envio sequencial para manter a ordem das atualizações.
              </p>
           </div>
        </div>
      </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-600">
                  <BellRing size={16} /> Notificações do Asaas
                </p>
                <h4 className="text-xl font-black uppercase tracking-tight text-[#001a33]">
                  Canais pagos permitidos para alunos
                </h4>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  Defina canal por canal. Quando todos estiverem desativados, o sistema envia as cobranças ao Asaas com notificações bloqueadas no cadastro do cliente.
                  Ative somente os canais que a matriz aceita pagar.
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                notificationsEnabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
              }`}>
                {notificationsEnabled ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {notificationsEnabled ? 'Canais ativos' : 'Bloqueado'}
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={20} />
                <div>
                  <p className="text-sm font-black uppercase tracking-wider text-orange-800">Atenção aos custos</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-orange-700">
                    Valores exibidos no painel Asaas em sandbox: WhatsApp R$ 0,55 por notificação enviada; E-mail e SMS possuem taxa única de R$ 0,99 por cobrança recebida. Confirme sempre no contrato/painel do Asaas antes de ativar em produção.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { key: 'whatsapp' as const, label: 'WhatsApp', price: 'R$ 0,55 por notificação enviada', icon: MessageCircle },
                { key: 'email' as const, label: 'E-mail', price: 'R$ 0,99 por cobrança recebida', icon: Mail },
                { key: 'sms' as const, label: 'SMS', price: 'R$ 0,99 por cobrança recebida', icon: Smartphone },
              ].map((item) => {
                const Icon = item.icon;
                const active = notificationChannels[item.key];
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleNotificationChannel(item.key)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? 'border-emerald-200 bg-emerald-50 ring-2 ring-emerald-100'
                        : 'border-slate-100 bg-slate-50 hover:bg-white'
                    }`}
                    aria-pressed={active}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Icon className={active ? 'text-emerald-700' : 'text-blue-600'} size={20} />
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {active ? 'Ativo' : 'Off'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-black text-[#001a33]">{item.label}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{item.price}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div>
                <p className="text-sm font-black text-[#001a33]">
                  {notificationsEnabled ? 'Canais permitidos selecionados' : 'Nenhum canal pago permitido'}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Padrão recomendado: manter todos desativados e compartilhar o link de cobrança pelo atendimento interno.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ['WhatsApp', notificationChannels.whatsapp],
                  ['E-mail', notificationChannels.email],
                  ['SMS', notificationChannels.sms],
                ].map(([label, active]) => (
                  <span key={String(label)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {label}: {active ? 'ativo' : 'off'}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => notificationMutation.mutate({
                notificationWhatsappEnabled: notificationChannels.whatsapp,
                notificationEmailEnabled: notificationChannels.email,
                notificationSmsEnabled: notificationChannels.sms,
              })}
              disabled={notificationMutation.isPending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 disabled:opacity-50"
            >
              {notificationMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
              Salvar preferência de notificações
            </button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
            <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Como isso afeta as cobranças</h4>
            <div className="mt-4 space-y-3 text-xs font-medium leading-relaxed text-slate-600">
              <p>
                Com todos os canais desligados, novos clientes Asaas e clientes já vinculados recebem atualização com notificações bloqueadas.
              </p>
              <p>
                Com um ou mais canais ligados, o sistema autoriza notificações pagas para esse ambiente e mantém registrado quais canais a matriz permitiu.
              </p>
              <p>
                A mudança vale para próximas sincronizações/criações de cobrança. Cobranças já criadas podem precisar ser atualizadas ou recriadas conforme a regra do Asaas.
              </p>
              <p>
                Se a conta Asaas exigir uma regra fina por canal no próprio painel, use estes mesmos canais como referência de governança interna.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AsaasConfig;
