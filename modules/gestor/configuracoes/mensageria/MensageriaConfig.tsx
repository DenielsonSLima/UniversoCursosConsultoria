import React, { useEffect, useMemo, useState } from 'react';
import { PlugZap, RefreshCw, Save, Settings2, WalletCards } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import WhatsAppApiConfigTab from './components/WhatsAppApiConfigTab';
import WhatsAppCoexistenceTab from './components/WhatsAppCoexistenceTab';
import WhatsAppSummaryTab from './components/WhatsAppSummaryTab';
import { mensageriaService } from './mensageria.service';
import type { MensageriaConfigData } from './mensageria.types';

type MensageriaTab = 'resumo' | 'api' | 'coexistencia';

const DEFAULT_WHATSAPP_DRAFT: MensageriaConfigData = {
  tipo: 'whatsapp',
  waProvider: 'meta_cloud',
  waInstanceUrl: 'https://graph.facebook.com',
  waGraphVersion: 'v25.0',
  waStatus: 'nao_configurado',
  waAccountCurrency: 'BRL',
  waEnabled: false,
  waDueNoticeDays: 3,
  waSendDueNotice: true,
  waDueNoticeTemplate: 'Olá, {{nome_aluno}}!\n\nEste é um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.\n\nIdentificação do aluno: CPF final *{{cpf_final}}*.\n\nVocê pode realizar o pagamento pelo link abaixo:\n{{link_pagamento}}\n\nCaso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.',
  waSendPaymentReceipt: true,
  waPaymentReceiptTemplate: 'Olá, {{nome_aluno}}!\n\nSeu pagamento no valor de *{{valor_fatura}}*, referente à mensalidade nº *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.\n\nIdentificação do aluno: CPF final *{{cpf_final}}*.\n\nAgradecemos pela confiança e por fazer parte da Universo Cursos e Consultoria.\n\nSe precisar de suporte, nossa equipe está à disposição.\n\nEquipe Universo Cursos e Consultoria.',
  waSendOverdueNotice: true,
  waOverdueNoticeDays: 1,
  waDefaultOverdueTemplate: 'Olá, {{nome_aluno}}!\n\nIdentificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.\n\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n*Vencimento:* {{data_vencimento}}\n\nPara realizar o pagamento, acesse:\n{{link_pagamento}}\n\nCaso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.',
  waSendMultipleOverdueNotice: true,
  waMultipleOverdueMinInstallments: 2,
  waMultipleOverdueTemplate: 'Olá, {{nome_aluno}}!\n\nIdentificamos parcelas pendentes em seu cadastro.\n\n*Quantidade:* {{quantidade_parcelas}}\n*Valor total:* {{valor_total_atrasado}}\n*Curso:* {{nome_curso}}\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n\nPara regularizar sua situação, responda a esta mensagem. Nossa equipe verificará as opções disponíveis.\n\nCaso o pagamento já tenha sido realizado, desconsidere este aviso.\n\nEquipe Universo Cursos e Consultoria.',
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
      waGraphVersion: waConfig.waGraphVersion || 'v25.0',
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
        <button
          onClick={() => setActiveTab('coexistencia')}
          className={`flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'coexistencia' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
          }`}
        >
          <PlugZap size={15} />
          Coexistência
        </button>
      </div>

      {activeTab === 'resumo' ? (
        <WhatsAppSummaryTab config={draft} webhookUrl={webhookUrl} />
      ) : activeTab === 'api' ? (
        <WhatsAppApiConfigTab draft={draft} onChange={updateDraft} />
      ) : (
        <WhatsAppCoexistenceTab draft={draft} webhookUrl={webhookUrl} onChange={updateDraft} />
      )}
    </div>
  );
};

export default MensageriaConfig;
