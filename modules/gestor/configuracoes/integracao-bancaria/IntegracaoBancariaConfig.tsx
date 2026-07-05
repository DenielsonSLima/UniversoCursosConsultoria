import React, { useEffect, useMemo, useState } from 'react';
import {
  Key,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import ChavesTokensPanel from './ChavesTokensPanel';
import RotasBancariasPanel from './RotasBancariasPanel';
import ResumoBancarioPanel from './ResumoBancarioPanel';
import {
  ENVIRONMENTS,
  MODALIDADES,
  PROVIDER_BRANDS,
  PROVIDER_ORDER,
  environmentLabel,
  methodLabel,
  metadataValue,
  modalidadeLabel,
  credentialReadyForRoute,
  supportsMethod,
} from './integracao-bancaria.constants';
import {
  GatewayEnvironment,
  GatewayModalidade,
  GatewayPaymentMethod,
  GatewayProviderCode,
  SaveCredentialInput,
  integracaoBancariaService,
} from './integracao-bancaria.service';
import {
  CredentialFormState,
  MainTab,
  emptyCredentialForm,
} from './integracao-bancaria.types';
import { ProviderLogo } from './integracao-bancaria.ui';

const IntegracaoBancariaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<MainTab>('resumo');
  const [modalidade, setModalidade] = useState<GatewayModalidade>('EAD');
  const [routeEnvironment, setRouteEnvironment] = useState<GatewayEnvironment>('sandbox');
  const [keysEnvironment, setKeysEnvironment] = useState<GatewayEnvironment>('sandbox');
  const [paymentMethod, setPaymentMethod] = useState<GatewayPaymentMethod>('PIX');
  const [routeProviderCode, setRouteProviderCode] = useState<GatewayProviderCode>('asaas');
  const [credentialProviderCode, setCredentialProviderCode] = useState<GatewayProviderCode>('asaas');
  const [credentialForm, setCredentialForm] = useState<CredentialFormState>(emptyCredentialForm);

  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['integracao_bancaria'],
    queryFn: integracaoBancariaService.getOverview,
  });

  const providers = useMemo(() => {
    const items = overview?.providers || [];
    return [...items].sort((a, b) => PROVIDER_ORDER.indexOf(a.code) - PROVIDER_ORDER.indexOf(b.code));
  }, [overview]);

  const getCredential = (providerCode: GatewayProviderCode, environment: GatewayEnvironment) =>
    overview?.credentials.find(
      (item) => item.providerCode === providerCode && item.environment === environment,
    );

  const routeProvider = providers.find((item) => item.code === routeProviderCode);
  const credentialProvider = providers.find((item) => item.code === credentialProviderCode);
  const selectedRoute = overview?.routes.find(
    (item) => item.modalidade === modalidade
      && item.paymentMethod === paymentMethod
      && item.environment === routeEnvironment,
  );
  const routeCredential = getCredential(routeProviderCode, routeEnvironment);
  const editCredential = getCredential(credentialProviderCode, keysEnvironment);
  const routedProvider = providers.find((item) => item.code === selectedRoute?.providerCode);
  const selectedProviderSupportsMethod = supportsMethod(routeProvider, paymentMethod);
  const selectedRouteCredentialReady = credentialReadyForRoute(routeProviderCode, routeCredential, paymentMethod);
  const routedBrandCode = (selectedRoute?.providerCode as GatewayProviderCode | undefined) || routeProviderCode;
  const headerProviderCode = activeTab === 'parametrizacao' ? credentialProviderCode : routedBrandCode;
  const summaryEnvironment = overview?.activeEnvironment || routeEnvironment;
  const activeEnvironment = activeTab === 'parametrizacao'
    ? keysEnvironment
    : activeTab === 'resumo'
      ? summaryEnvironment
      : routeEnvironment;
  const headerContextLabel = activeTab === 'resumo'
    ? 'Resumo geral'
    : activeTab === 'parametrizacao'
      ? 'Parametrização'
      : modalidadeLabel(modalidade);

  useEffect(() => {
    if (selectedRoute?.providerCode) setRouteProviderCode(selectedRoute.providerCode);
  }, [selectedRoute?.id, selectedRoute?.providerCode]);

  useEffect(() => {
    if (activeTab === 'resumo' && overview?.activeEnvironment) {
      setRouteEnvironment(overview.activeEnvironment);
    }
  }, [activeTab, overview?.activeEnvironment]);

  useEffect(() => {
    setCredentialForm({
      ...emptyCredentialForm,
      walletId: metadataValue(editCredential?.metadata, 'walletId'),
      merchantId: metadataValue(editCredential?.metadata, 'merchantId'),
      baneseConvenio: metadataValue(editCredential?.metadata, 'baneseConvenio'),
      baneseBoletoConvenio: metadataValue(editCredential?.metadata, 'baneseBoletoConvenio') || metadataValue(editCredential?.metadata, 'baneseConvenio'),
      baneseBeneficiarioInscricao: metadataValue(editCredential?.metadata, 'baneseBeneficiarioInscricao'),
      banesePixConvenio: metadataValue(editCredential?.metadata, 'banesePixConvenio'),
      banesePixChave: metadataValue(editCredential?.metadata, 'banesePixChave'),
      baneseCarteira: metadataValue(editCredential?.metadata, 'baneseCarteira'),
      baneseAgencia: metadataValue(editCredential?.metadata, 'baneseAgencia'),
      baneseConta: metadataValue(editCredential?.metadata, 'baneseConta'),
      notes: metadataValue(editCredential?.metadata, 'notes'),
    });
  }, [editCredential?.id, credentialProviderCode, keysEnvironment]);

  const clearSensitiveCredentialFields = () => {
    setCredentialForm((current) => ({
      ...current,
      apiKey: '',
      accessToken: '',
      publicKey: '',
      clientId: '',
      clientSecret: '',
      webhookSecret: '',
      webhookToken: '',
      crtAccessToken: '',
    }));
  };

  const saveCredentialMutation = useMutation({
    mutationFn: integracaoBancariaService.saveCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
      clearSensitiveCredentialFields();
      toast.success('Credenciais salvas', `${credentialProvider?.name || credentialProviderCode} ${environmentLabel(keysEnvironment)} atualizado.`);
    },
    onError: (err: any) => toast.error('Erro ao salvar credenciais', err.message),
  });

  const routeMutation = useMutation({
    mutationFn: integracaoBancariaService.saveRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
      toast.success('Rota atualizada', `${methodLabel(paymentMethod)} ${modalidadeLabel(modalidade)} agora usa ${routeProvider?.name || routeProviderCode}.`);
    },
    onError: (err: any) => toast.error('Erro ao atualizar rota', err.message),
  });

  const testMutation = useMutation({
    mutationFn: integracaoBancariaService.testConnection,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
      toast.success('Teste concluído', result.message);
    },
    onError: (err: any) => toast.error('Falha no teste', err.message),
  });

  const updateCredentialForm = (key: keyof CredentialFormState, value: string) => {
    setCredentialForm((current) => ({ ...current, [key]: value }));
  };

  const copyWebhookUrl = () => {
    const url = editCredential?.webhookUrl || overview?.webhookUrls?.[credentialProviderCode] || '';
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.info('Webhook copiado', url);
  };

  const saveCredentials = (event: React.FormEvent) => {
    event.preventDefault();
    if (!credentialProvider) return;

    const payload: SaveCredentialInput = {
      providerCode: credentialProviderCode,
      environment: keysEnvironment,
      label: `${credentialProvider.name} ${keysEnvironment === 'production' ? 'Produção' : 'Sandbox'}`,
      metadata: { notes: credentialForm.notes },
    };

    if (credentialProviderCode === 'asaas') {
      payload.apiKey = credentialForm.apiKey;
      payload.webhookToken = credentialForm.webhookToken || credentialForm.webhookSecret;
      payload.metadata = {
        walletId: credentialForm.walletId,
        notes: credentialForm.notes,
      };
    }

    if (credentialProviderCode === 'mercado_pago') {
      payload.accessToken = credentialForm.accessToken;
      payload.publicKey = credentialForm.publicKey;
      payload.webhookSecret = credentialForm.webhookSecret;
      payload.metadata = {
        merchantId: credentialForm.merchantId,
        notes: credentialForm.notes,
      };
    }

    if (credentialProviderCode === 'banese_card') {
      payload.clientId = credentialForm.clientId;
      payload.clientSecret = credentialForm.clientSecret;
      payload.webhookSecret = credentialForm.webhookSecret;
      payload.crtAccessToken = credentialForm.crtAccessToken;
      payload.metadata = {
        baneseConvenio: credentialForm.baneseBoletoConvenio || credentialForm.baneseConvenio,
        baneseBoletoConvenio: credentialForm.baneseBoletoConvenio || credentialForm.baneseConvenio,
        baneseBeneficiarioInscricao: credentialForm.baneseBeneficiarioInscricao,
        banesePixConvenio: credentialForm.banesePixConvenio,
        banesePixChave: credentialForm.banesePixChave,
        baneseCarteira: credentialForm.baneseCarteira,
        baneseAgencia: credentialForm.baneseAgencia,
        baneseConta: credentialForm.baneseConta,
        notes: credentialForm.notes,
      };
    }

    saveCredentialMutation.mutate(payload);
  };

  const activateRoute = () => {
    if (!routeProvider) return;
    if (!selectedProviderSupportsMethod) {
      toast.error('Rota incompatível', `${routeProvider.name} não atende ${methodLabel(paymentMethod)}.`);
      return;
    }
    if (!selectedRouteCredentialReady) {
      toast.error('Chaves pendentes', `Cadastre ${routeProvider.name} em ${environmentLabel(routeEnvironment)} antes de ativar esta rota.`);
      return;
    }

    routeMutation.mutate({
      modalidade,
      paymentMethod,
      environment: routeEnvironment,
      providerCode: routeProviderCode,
      credentialId: routeCredential.id,
      enabled: true,
    });
  };

  const openRouteFromSummary = (
    nextModalidade: GatewayModalidade,
    nextMethod: GatewayPaymentMethod,
    nextProviderCode?: GatewayProviderCode,
  ) => {
    setActiveTab(nextModalidade);
    setModalidade(nextModalidade);
    setRouteEnvironment(summaryEnvironment);
    setPaymentMethod(nextMethod);
    if (nextProviderCode) setRouteProviderCode(nextProviderCode);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <RefreshCw className="mb-4 animate-spin text-blue-500" size={32} />
        <p className="text-sm font-bold text-slate-500">Carregando integração bancária...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-center">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <p className="font-bold text-red-700">Erro ao carregar integração bancária</p>
        <p className="mt-1 text-sm text-red-500">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          {activeTab === 'resumo' ? (
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
              <LayoutDashboard size={22} />
            </span>
          ) : (
            <ProviderLogo code={headerProviderCode} compact />
          )}
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Integração Bancária</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${ENVIRONMENTS.find((item) => item.value === activeEnvironment)?.chip}`}>
                {environmentLabel(activeEnvironment)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {headerContextLabel}
              </span>
              {activeTab === 'resumo' ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                  Pix · Boleto · Cartão
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${PROVIDER_BRANDS[headerProviderCode].chip}`}>
                  {activeTab === 'parametrizacao'
                    ? credentialProvider?.name || credentialProviderCode
                    : routedProvider?.name || routeProvider?.name || routeProviderCode}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
        <div className="grid min-w-[1080px] grid-cols-7 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('resumo')}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-4 text-xs font-black uppercase tracking-wider ${
              activeTab === 'resumo' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <LayoutDashboard size={15} />
            Resumo
          </button>
          {MODALIDADES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setActiveTab(item.value);
                setModalidade(item.value);
              }}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-md px-4 text-xs font-black uppercase tracking-wider ${
                activeTab === item.value ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveTab('parametrizacao')}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-4 text-xs font-black uppercase tracking-wider ${
              activeTab === 'parametrizacao' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <Key size={15} />
            Parametrização
          </button>
        </div>
      </div>

      {activeTab === 'resumo' && (
        <ResumoBancarioPanel
          overview={overview}
          providers={providers}
          routeEnvironment={summaryEnvironment}
          getCredential={getCredential}
          onSelectRoute={openRouteFromSummary}
        />
      )}

      {activeTab !== 'parametrizacao' && activeTab !== 'resumo' && (
        <RotasBancariasPanel
          overview={overview}
          providers={providers}
          modalidade={modalidade}
          routeEnvironment={routeEnvironment}
          paymentMethod={paymentMethod}
          routeProviderCode={routeProviderCode}
          routeProvider={routeProvider}
          routedProvider={routedProvider}
          routeCredential={routeCredential}
          selectedRoute={selectedRoute}
          selectedProviderSupportsMethod={selectedProviderSupportsMethod}
          selectedRouteCredentialReady={selectedRouteCredentialReady}
          routeMutationPending={routeMutation.isPending}
          getCredential={getCredential}
          setRouteEnvironment={setRouteEnvironment}
          setPaymentMethod={setPaymentMethod}
          setRouteProviderCode={setRouteProviderCode}
          activateRoute={activateRoute}
        />
      )}

      {activeTab === 'parametrizacao' && (
        <ChavesTokensPanel
          overview={overview}
          providers={providers}
          keysEnvironment={keysEnvironment}
          credentialProviderCode={credentialProviderCode}
          credentialProvider={credentialProvider}
          editCredential={editCredential}
          credentialForm={credentialForm}
          saveCredentialPending={saveCredentialMutation.isPending}
          testPending={testMutation.isPending}
          setKeysEnvironment={setKeysEnvironment}
          setCredentialProviderCode={setCredentialProviderCode}
          getCredential={getCredential}
          updateCredentialForm={updateCredentialForm}
          saveCredentials={saveCredentials}
          copyWebhookUrl={copyWebhookUrl}
          testConnection={() => testMutation.mutate({ providerCode: credentialProviderCode, environment: keysEnvironment })}
        />
      )}
    </div>
  );
};

export default IntegracaoBancariaConfig;
