import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Cloud,
  CreditCard,
  Hash,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Webhook,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { WhatsAppLineConfigForm } from './components/WhatsAppLineConfigForm';
import { whatsappService } from '../../comunicacao/components/whatsapp/whatsapp.service';
import {
  isWhatsAppConnectionReady,
  type WhatsAppConexao,
} from '../../comunicacao/components/whatsapp/whatsapp.types';

const EMPTY_CONEXAO: WhatsAppConexao = {
  id: '',
  nome: 'Nova Linha',
  instituicao: 'universo',
  telefone: '',
  phone_number_id: null,
  waba_id: null,
  is_default: false,
  is_matriz_financeira: false,
  status: 'inativo',
  connection_mode: 'cloud_api',
  graph_version: 'v25.0',
  app_id: null,
  app_secret: null,
  verify_token: null,
  token_configured: false,
  app_secret_configured: false,
  verify_token_configured: false,
  created_at: '',
  updated_at: '',
};

const INST_COLORS: Record<string, string> = {
  universo: 'bg-emerald-600',
  anhanguera: 'bg-blue-600',
  unopar: 'bg-violet-600',
};

const MensageriaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>('resumo');
  const [showingNewForm, setShowingNewForm] = useState(false);
  const [newLineName, setNewLineName] = useState('Nova Linha');

  const webhookUrl = useMemo(() => {
    const url =
      import.meta.env.VITE_SUPABASE_URL ||
      import.meta.env.REACT_APP_SUPABASE_URL ||
      '';
    return url
      ? `${url}/functions/v1/whatsapp-webhook`
      : 'https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook';
  }, []);

  const {
    data: conexoes = [],
    isLoading,
    isError,
    error,
  } = useQuery<WhatsAppConexao[]>({
    queryKey: ['whatsapp_conexoes'],
    queryFn: () => whatsappService.getConexoes(),
  });

  useEffect(() => {
    const ch = supabase
      .channel('wa_conexoes_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conexoes' },
        () => queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<WhatsAppConexao> & {
      tokenInput?: string;
      appSecretInput?: string;
      verifyTokenInput?: string;
    }) =>
      whatsappService.saveConexao(data),
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] });
      toast.success('Conexão salva', 'Linha atualizada com sucesso.');
      if (showingNewForm) {
        setShowingNewForm(false);
        setActiveTab(saved?.id ?? 'resumo');
      }
    },
    onError: (err: any) => {
      toast.error('Erro ao salvar', err?.message || 'Não foi possível salvar.');
    },
  });

  const handleAddNumber = () => {
    setShowingNewForm(true);
    setNewLineName('Nova Linha');
    setActiveTab('nova');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="mb-4 animate-spin text-emerald-500" size={32} />
        <p className="text-sm font-medium text-slate-500">Carregando linhas do WhatsApp...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-600">Erro ao carregar conexões:</p>
        <p className="mt-1 text-sm text-red-500">
          {(error as Error)?.message || 'Erro desconhecido'}
        </p>
      </div>
    );
  }

  const activeConexao = conexoes.find((c) => c.id === activeTab);

  return (
    <div className="max-w-6xl animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* ── Tab Bar ── */}
      <div className="mb-6 flex items-center gap-0 overflow-x-auto border-b border-slate-200">
        {/* Resumo */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('resumo');
            setShowingNewForm(false);
          }}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors -mb-px ${
            activeTab === 'resumo'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Smartphone size={15} />
          Resumo
        </button>

        {/* One tab per number */}
        {conexoes.map((c) => {
          const isAtivo = isWhatsAppConnectionReady(c);

          const borderActive =
            c.instituicao === 'universo'
              ? 'border-emerald-600 text-emerald-700'
              : c.instituicao === 'anhanguera'
              ? 'border-blue-600 text-blue-700'
              : 'border-violet-600 text-violet-700';

          const dotColor =
            c.instituicao === 'universo'
              ? 'bg-emerald-500'
              : c.instituicao === 'anhanguera'
              ? 'bg-blue-500'
              : 'bg-violet-500';

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveTab(c.id);
                setShowingNewForm(false);
              }}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors -mb-px ${
                activeTab === c.id
                  ? borderActive
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isAtivo ? dotColor : 'bg-slate-300'
                }`}
              />
              {c.nome}
            </button>
          );
        })}

        {/* Add number */}
        {/* Botão para adicionar nova linha */}
        <button
          type="button"
          onClick={handleAddNumber}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors -mb-px ${
            activeTab === 'nova'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-emerald-600'
          }`}
        >
          <Plus size={15} />
          {activeTab === 'nova' ? newLineName || 'Nova Linha' : '+ Adicionar Número'}
        </button>
      </div>

      {/* ── RESUMO PANEL ── */}
      {activeTab === 'resumo' && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h3 className="text-xl font-bold text-[#001a33]">
              WhatsApp Business API
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Visão geral das conexões Meta Cloud API e modo de integração ativo.
            </p>
          </div>

          {conexoes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Smartphone size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-bold text-slate-500">Nenhuma linha cadastrada ainda.</p>
              <p className="mt-1 text-sm text-slate-400">
                Clique em <strong>Adicionar Número</strong> acima para registrar a primeira linha.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {conexoes.map((c) => {
                // Pronto = credenciais, assinatura da WABA e webhook válidos.
                const temCredenciais = isWhatsAppConnectionReady(c);
                const isAtivo = temCredenciais;
                const isDesativado = c.status === 'inativo';

                const modeLabel =
                  c.connection_mode === 'coexistence'
                    ? 'Coexistência (App + API)'
                    : 'Cloud API Exclusiva';
                const bgColor = INST_COLORS[c.instituicao] || 'bg-slate-500';

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveTab(c.id)}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white ${bgColor}`}
                      >
                        {c.nome.substring(0, 2).toUpperCase()}
                      </div>
                      {isAtivo ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={11} />
                          Ativo
                        </span>
                      ) : isDesativado ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                          <XCircle size={11} />
                          Desativado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Aguardando validação
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-bold text-slate-800">{c.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-400 capitalize">{c.instituicao}</p>
                    </div>

                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-mono text-slate-700">
                        <Phone size={12} className="shrink-0 text-slate-400" />
                        {c.telefone || 'Sem número formatado'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {c.connection_mode === 'coexistence' ? (
                          <QrCode size={12} className="shrink-0 text-emerald-500" />
                        ) : (
                          <Cloud size={12} className="shrink-0 text-blue-500" />
                        )}
                        <span className="font-medium">{modeLabel}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      {c.is_matriz_financeira ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <CreditCard size={12} />
                          Matriz Financeira
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-xs font-semibold text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100">
                        Configurar
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Webhook URL */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-[#001a33]">
              <Webhook size={16} className="text-blue-600" />
              URL de Webhook — Meta
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Configure esta URL no seu app da Meta para receber mensagens e status de entrega.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                <Hash size={12} />
                Callback URL
              </div>
              <p className="mt-2 break-all font-mono text-xs text-slate-700">
                {webhookUrl}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PER-NUMBER CONFIG PANEL ── */}
      {(activeConexao || showingNewForm) && (
        <div className="animate-fadeIn">
          <WhatsAppLineConfigForm
            conexao={activeConexao ?? EMPTY_CONEXAO}
            onSave={async (data) => saveMutation.mutateAsync(data)}
            isSaving={saveMutation.isPending}
            onNameChange={showingNewForm ? setNewLineName : undefined}
          />
        </div>
      )}
    </div>
  );
};

export default MensageriaConfig;
