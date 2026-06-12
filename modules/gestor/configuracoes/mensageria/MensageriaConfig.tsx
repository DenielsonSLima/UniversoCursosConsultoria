import React, { useState, useEffect } from 'react';
import { Save, Mail, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mensageriaService } from './mensageria.service';
import { supabase } from '../../../../lib/supabase';

const MensageriaConfig: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const queryClient = useQueryClient();
  
  // WhatsApp Local Draft State
  const [waProvider, setWaProvider] = useState('evolution');
  const [waInstanceUrl, setWaInstanceUrl] = useState('');
  const [waInstanceName, setWaInstanceName] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waStatus, setWaStatus] = useState('conectado');

  // Email Local Draft State
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSenderName, setSmtpSenderName] = useState('');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('');

  // 1. Carregar as configurações usando useQuery
  const { data: waConfig, isLoading: loadingWa } = useQuery({
    queryKey: ['mensageria_config', 'whatsapp'],
    queryFn: () => mensageriaService.getConfig('whatsapp'),
  });

  const { data: emailConfig, isLoading: loadingEmail } = useQuery({
    queryKey: ['mensageria_config', 'email'],
    queryFn: () => mensageriaService.getConfig('email'),
  });

  // 2. Preencher estados com base no banco de dados
  useEffect(() => {
    if (waConfig) {
      setWaProvider(waConfig.waProvider || 'evolution');
      setWaInstanceUrl(waConfig.waInstanceUrl || '');
      setWaInstanceName(waConfig.waInstanceName || '');
      setWaToken(waConfig.waToken || '');
      setWaStatus(waConfig.waStatus || 'conectado');
    }
  }, [waConfig]);

  useEffect(() => {
    if (emailConfig) {
      setSmtpServer(emailConfig.smtpServer || '');
      setSmtpPort(emailConfig.smtpPort || '');
      setSmtpUser(emailConfig.smtpUser || '');
      setSmtpPass(emailConfig.smtpPass || '');
      setSmtpSenderName(emailConfig.smtpSenderName || '');
      setSmtpSenderEmail(emailConfig.smtpSenderEmail || '');
    }
  }, [emailConfig]);

  // 3. Realtime para a tabela 'mensageria_config'
  useEffect(() => {
    const channel = supabase
      .channel('mensageria_config_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensageria_config' },
        (payload: any) => {
          const updatedType = payload.new?.tipo || payload.old?.tipo;
          if (updatedType) {
            queryClient.invalidateQueries({ queryKey: ['mensageria_config', updatedType] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 4. Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: ({ tipo, data }: { tipo: 'whatsapp' | 'email'; data: any }) => 
      mensageriaService.saveConfig(tipo, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', variables.tipo] });
      alert(`Configurações de ${variables.tipo === 'whatsapp' ? 'WhatsApp' : 'E-mail'} salvas com sucesso!`);
    },
    onError: (err: any) => alert(`Erro ao salvar configurações: ${err.message}`),
  });

  const handleSave = () => {
    if (activeTab === 'whatsapp') {
      saveMutation.mutate({
        tipo: 'whatsapp',
        data: {
          waProvider,
          waInstanceUrl,
          waInstanceName,
          waToken,
          waStatus,
        }
      });
    } else {
      saveMutation.mutate({
        tipo: 'email',
        data: {
          smtpServer,
          smtpPort,
          smtpUser,
          smtpPass,
          smtpSenderName,
          smtpSenderEmail,
        }
      });
    }
  };

  const isLoading = loadingWa || loadingEmail;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando configurações de mensageria...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl animate-fadeIn">
      <div className="mb-6">
        <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Comunicação e Mensageria</h3>
        <p className="text-sm font-medium text-slate-500 mt-1">Configuração de APIs para envio automático de WhatsApp e E-mail.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
            activeTab === 'whatsapp' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-slate-500 hover:text-emerald-600'
          }`}
        >
          <MessageCircle size={16} />
          WhatsApp API
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
            activeTab === 'email' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-slate-500 hover:text-blue-600'
          }`}
        >
          <Mail size={16} />
          E-mail SMTP
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        {activeTab === 'whatsapp' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${waStatus === 'conectado' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></div>
                <div>
                  <p className="font-bold text-emerald-900 text-sm">Status da Conexão</p>
                  <p className="text-xs text-emerald-700 font-medium">{waStatus === 'conectado' ? 'Instância conectada e pronta para envio' : 'Aguardando leitura do QR Code'}</p>
                </div>
              </div>
              <button 
                onClick={() => setWaStatus(waStatus === 'conectado' ? 'desconectado' : 'conectado')}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors"
              >
                <RefreshCw size={14} /> {waStatus === 'conectado' ? 'Desconectar' : 'Reconectar'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Provedor / API
                </label>
                <select 
                  value={waProvider}
                  onChange={(e) => setWaProvider(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700"
                >
                  <option value="evolution">Evolution API</option>
                  <option value="zapi">Z-API</option>
                  <option value="wppconnect">WPPConnect</option>
                  <option value="baileys">Baileys (Custom)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Nome da Instância
                </label>
                <input
                  type="text"
                  value={waInstanceName}
                  onChange={(e) => setWaInstanceName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700"
                  placeholder="Ex: atendimento"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  URL da API (Webhook)
                </label>
                <input
                  type="url"
                  value={waInstanceUrl}
                  onChange={(e) => setWaInstanceUrl(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-medium text-slate-600"
                  placeholder="https://api..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Token de Autenticação / Global API Key
                </label>
                <input
                  type="password"
                  value={waToken}
                  onChange={(e) => setWaToken(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-medium opacity-70 focus:opacity-100"
                  placeholder="Cole o token aqui"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="space-y-6 animate-fadeIn">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Servidor SMTP
                </label>
                <input
                  type="text"
                  value={smtpServer}
                  onChange={(e) => setSmtpServer(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="smtp.exemplo.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Porta SMTP
                </label>
                <input
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="587 ou 465"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Usuário SMTP
                </label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-medium text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Senha SMTP
                </label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-medium opacity-70 focus:opacity-100"
                />
              </div>

              <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-[#001a33] mb-4">Remetente Padrão (From)</h4>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Nome do Remetente
                </label>
                <input
                  type="text"
                  value={smtpSenderName}
                  onChange={(e) => setSmtpSenderName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="Sua Empresa"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  E-mail do Remetente
                </label>
                <input
                  type="email"
                  value={smtpSenderEmail}
                  onChange={(e) => setSmtpSenderEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="contato@empresa.com"
                />
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-xl flex gap-3 text-sm text-blue-800 border border-blue-100">
               <AlertCircle size={20} className="shrink-0" />
               <p>Recomendamos usar serviços especializados como Amazon SES, Mailgun ou SendGrid para garantir alta taxa de entrega.</p>
            </div>
          </div>
        )}

      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className={`flex items-center gap-2 px-8 py-4 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg disabled:opacity-50 ${
            activeTab === 'whatsapp' 
              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20' 
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/20'
          }`}
        >
          <Save size={16} />
          {saveMutation.isPending ? 'Salvando...' : `Salvar ${activeTab === 'whatsapp' ? 'WhatsApp' : 'E-mail'}`}
        </button>
      </div>

    </div>
  );
};

export default MensageriaConfig;
