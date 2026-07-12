import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Settings2, WalletCards } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import WhatsAppApiConfigTab from './components/WhatsAppApiConfigTab';
import WhatsAppSummaryTab from './components/WhatsAppSummaryTab';
import { MensageriaConfigData, mensageriaService } from './mensageria.service';

type MensageriaTab = 'resumo' | 'api';

const DEFAULT_WHATSAPP_DRAFT: MensageriaConfigData = {
  tipo: 'whatsapp',
  waProvider: 'meta_cloud',
  waInstanceUrl: 'https://graph.facebook.com',
  waGraphVersion: 'v23.0',
  waStatus: 'nao_configurado',
  waAccountCurrency: 'BRL',
  waEnabled: false,
  waDueNoticeDays: 3,
  waSendDueNotice: true,
  waDueNoticeTemplate: 'Olá {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}',
  waSendPaymentReceipt: true,
  waPaymentReceiptTemplate: 'Olá {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!',
  waSendOverdueNotice: true,
  waOverdueNoticeDays: 1,
  waDefaultOverdueTemplate: 'Olá {{nome_aluno}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}',
  waSendMultipleOverdueNotice: true,
  waMultipleOverdueMinInstallments: 2,
  waMultipleOverdueTemplate: 'Olá {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}',
  waDueNoticeModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waPaymentReceiptModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waOverdueNoticeModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waMultipleOverdueModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
};

const MensageriaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<MensageriaTab>('resumo');
  const [draft, setDraft] = useState<MensageriaConfigData>(DEFAULT_WHATSAPP_DRAFT);

  const { data: waConfig, isLoading, isError, error } = useQuery({
    queryKey: ['mensageria_config', 'whatsapp'],
    queryFn: () => mensageriaService.getConfig('whatsapp'),
  });

  useEffect(() => {
    if (!waConfig) {
      setDraft(DEFAULT_WHATSAPP_DRAFT);
      return;
    }

    setDraft({
      ...DEFAULT_WHATSAPP_DRAFT,
      ...waConfig,
      waProvider: waConfig.waProvider || 'meta_cloud',
      waInstanceUrl: waConfig.waInstanceUrl || 'https://graph.facebook.com',
      waGraphVersion: waConfig.waGraphVersion || 'v23.0',
      waStatus: waConfig.waStatus || 'nao_configurado',
      waAccountCurrency: waConfig.waAccountCurrency || 'BRL',
      waEnabled: Boolean(waConfig.waEnabled),
    });
  }, [waConfig]);

  useEffect(() => {
    const channel = supabase
      .channel('mensageria_whatsapp_meta_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensageria_config', filter: 'tipo=eq.whatsapp' },
        () => queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const webhookUrl = useMemo(() => {
    const projectUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL || '';
    return projectUrl ? `${projectUrl}/functions/v1/whatsapp-webhook` : 'https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook';
  }, []);

  const updateDraft = <K extends keyof MensageriaConfigData>(field: K, value: MensageriaConfigData[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const hasRequiredIds = Boolean(draft.waPhoneNumberId && draft.waBusinessAccountId);
      const hasToken = Boolean(draft.waToken || draft.waTokenConfigured);

      return mensageriaService.saveConfig('whatsapp', {
        ...draft,
        tipo: 'whatsapp',
        waProvider: 'meta_cloud',
        waStatus: draft.waEnabled && hasRequiredIds && hasToken ? 'configurado' : 'inativo',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
      toast.success('WhatsApp salvo', 'Configuração da Meta Cloud API atualizada.');
    },
    onError: (err: any) => {
      toast.error('Erro ao salvar', err?.message || 'Não foi possível salvar a configuração.');
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="mb-4 animate-spin text-emerald-500" size={32} />
        <p className="font-medium text-slate-500">Carregando configuração do WhatsApp...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center animate-fadeIn">
        <p className="font-bold text-red-600">Erro ao carregar mensageria:</p>
        <p className="mt-1 text-sm text-red-500">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">WhatsApp Business API</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Configuração da Meta Cloud API para atendimento externo e automações financeiras.
          </p>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
          {saveMutation.isPending ? 'Salvando...' : 'Salvar WhatsApp'}
        </button>
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab('resumo')}
          className={`flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'resumo' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
          }`}
        >
          <WalletCards size={15} />
          Resumo
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'api' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
          }`}
        >
          <Settings2 size={15} />
          Configurar API
        </button>
      </div>

      {activeTab === 'resumo' ? (
        <WhatsAppSummaryTab config={draft} webhookUrl={webhookUrl} />
      ) : (
        <WhatsAppApiConfigTab draft={draft} onChange={updateDraft} />
      )}
    </div>
  );
};

export default MensageriaConfig;
