import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import ChavesTokensPanel from './ChavesTokensPanel';
import EmissorFinanceiroPanel from './EmissorFinanceiroPanel';
import IntegracaoBancariaHeader from './IntegracaoBancariaHeader';
import RotasBancariasPanel from './RotasBancariasPanel';
import ResumoBancarioPanel from './ResumoBancarioPanel';
import {
  BANCO_INTER_V3_DEFAULT_SCOPES,
  BANESE_FIXED_BANKING_DATA,
  CONFIGURABLE_PROVIDER_CODES,
  PROVIDER_ORDER,
  environmentLabel,
  methodLabel,
  metadataValue,
  modalidadeLabel,
  credentialReadyForRoute,
  supportsMethod,
} from './integracao-bancaria.constants';
import {
  isValidBaneseEdi7Code,
  normalizeBaneseEdi7Code,
} from './integracao-bancaria.validation';
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

const IntegracaoBancariaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<MainTab>('resumo');
  const [modalidade, setModalidade] = useState<GatewayModalidade>('EAD');
  const [routeEnvironment, setRouteEnvironment] = useState<GatewayEnvironment>('sandbox');
  const [keysEnvironment, setKeysEnvironment] = useState<GatewayEnvironment>('sandbox');
  const [paymentMethod, setPaymentMethod] = useState<GatewayPaymentMethod>('BOLETO');
  const [routeProviderCode, setRouteProviderCode] = useState<GatewayProviderCode>('banese_card');
  const [credentialProviderCode, setCredentialProviderCode] = useState<GatewayProviderCode>('banese_card');
  const [credentialForm, setCredentialForm] = useState<CredentialFormState>(emptyCredentialForm);
  const [selectedIssuerId, setSelectedIssuerId] = useState('');

  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['integracao_bancaria'],
    queryFn: integracaoBancariaService.getOverview,
  });

  const providers = useMemo(() => {
    const items = (overview?.providers || [])
      .filter((item) => CONFIGURABLE_PROVIDER_CODES.has(item.code));
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
  const selectedRouteBlockedReason = routeProviderCode === 'banese_card'
      && routeEnvironment === 'sandbox'
      && paymentMethod === 'PIX'
    ? 'O Pix Banese está indisponível em homologação e só poderá ser ativado após a liberação formal do banco em produção.'
    : routeProviderCode === 'banese_card' && routeEnvironment === 'production'
      ? 'As rotas Banese de produção permanecem bloqueadas até a conclusão formal da homologação do boleto e a liberação do Pix pelo banco.'
      : routeProvider?.metadata?.checkout_blocked === true
        ? String(routeProvider.metadata.checkout_block_reason || 'Rota bloqueada até concluir a homologação segura deste provedor.')
        : null;
  const selectedProviderCheckoutBlocked = Boolean(selectedRouteBlockedReason);
  const selectedRouteCredentialReady = !selectedProviderCheckoutBlocked
    && credentialReadyForRoute(routeProviderCode, routeCredential, paymentMethod);
  const routedBrandCode = selectedRoute?.providerCode
      && CONFIGURABLE_PROVIDER_CODES.has(selectedRoute.providerCode)
    ? selectedRoute.providerCode
    : routeProviderCode;
  const headerProviderCode = activeTab === 'parametrizacao' ? credentialProviderCode : routedBrandCode;
  const summaryEnvironment = overview?.activeEnvironment || routeEnvironment;
  const activeEnvironment = activeTab === 'parametrizacao'
    ? keysEnvironment
    : activeTab === 'resumo'
      ? summaryEnvironment
      : routeEnvironment;
  const headerProviderName = activeTab === 'parametrizacao'
    ? credentialProvider?.name || credentialProviderCode
    : routedProvider?.name || routeProvider?.name || routeProviderCode;

  useEffect(() => {
    if (selectedRoute?.providerCode && CONFIGURABLE_PROVIDER_CODES.has(selectedRoute.providerCode)) {
      setRouteProviderCode(selectedRoute.providerCode);
      return;
    }
    setRouteProviderCode(paymentMethod === 'CREDIT_CARD' ? 'mercado_pago' : 'banese_card');
  }, [paymentMethod, selectedRoute?.id, selectedRoute?.providerCode]);

  useEffect(() => {
    if (activeTab === 'resumo' && overview?.activeEnvironment) {
      setRouteEnvironment(overview.activeEnvironment);
    }
  }, [activeTab, overview?.activeEnvironment]);

  useEffect(() => {
    const issuerId = overview?.issuerConfig?.issuerPoloId
      || overview?.issuerCandidates?.[0]?.id
      || '';
    setSelectedIssuerId(issuerId);
  }, [overview?.issuerConfig?.issuerPoloId, overview?.issuerCandidates]);

  useEffect(() => {
    const isBanese = credentialProviderCode === 'banese_card';
    setCredentialForm({
      ...emptyCredentialForm,
      walletId: metadataValue(editCredential?.metadata, 'walletId'),
      merchantId: metadataValue(editCredential?.metadata, 'merchantId'),
      baneseConvenio: isBanese ? BANESE_FIXED_BANKING_DATA.agreement : metadataValue(editCredential?.metadata, 'baneseConvenio'),
      baneseBoletoConvenio: isBanese ? BANESE_FIXED_BANKING_DATA.agreement : metadataValue(editCredential?.metadata, 'baneseBoletoConvenio') || metadataValue(editCredential?.metadata, 'baneseConvenio'),
      baneseBeneficiarioNome: isBanese ? BANESE_FIXED_BANKING_DATA.beneficiaryName : metadataValue(editCredential?.metadata, 'baneseBeneficiarioNome'),
      baneseBeneficiarioInscricao: isBanese ? BANESE_FIXED_BANKING_DATA.beneficiaryDocument : metadataValue(editCredential?.metadata, 'baneseBeneficiarioInscricao'),
      baneseCodigoBeneficiario: isBanese ? BANESE_FIXED_BANKING_DATA.beneficiaryCode : metadataValue(editCredential?.metadata, 'baneseCodigoBeneficiario'),
      banesePixConvenio: metadataValue(editCredential?.metadata, 'banesePixConvenio'),
      banesePixChave: metadataValue(editCredential?.metadata, 'banesePixChave'),
      baneseCarteira: metadataValue(editCredential?.metadata, 'baneseCarteira'),
      baneseEdi7Code: metadataValue(editCredential?.metadata, 'baneseEdi7Code'),
      baneseAgencia: isBanese ? BANESE_FIXED_BANKING_DATA.agency : metadataValue(editCredential?.metadata, 'baneseAgencia'),
      baneseConta: isBanese ? BANESE_FIXED_BANKING_DATA.account : metadataValue(editCredential?.metadata, 'baneseConta') || metadataValue(editCredential?.metadata, 'baneseContaDisplay'),
      interPixKey: metadataValue(editCredential?.metadata, 'interPixKey'),
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
      certificatePem: '',
      certificateFileName: '',
      privateKeyPem: '',
      privateKeyFileName: '',
    }));
  };

  const saveCredentialMutation = useMutation({
    mutationFn: integracaoBancariaService.saveCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
      clearSensitiveCredentialFields();
      toast.success(
        'Credenciais salvas com segurança',
        `${credentialProvider?.name || credentialProviderCode} · ${environmentLabel(keysEnvironment)}. Os dados sensíveis foram protegidos no cofre.`,
      );
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

  const issuerMutation = useMutation({
    mutationFn: integracaoBancariaService.saveIssuer,
    onSuccess: (issuerConfig) => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
      toast.success(
        'Emissor financeiro definido',
        `${issuerConfig.issuer?.name || 'Matriz'} emitirá as cobranças de todos os polos.`,
      );
    },
    onError: (err: any) => toast.error('Erro ao salvar emissor', err.message),
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
    if (credentialProviderCode === 'banco_inter') return;
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

    if (credentialProviderCode === 'banco_inter') {
      const missing = [
        !credentialForm.clientId && !editCredential?.clientIdConfigured ? 'Client ID' : '',
        !credentialForm.clientSecret && !editCredential?.clientSecretConfigured ? 'Client Secret' : '',
        !credentialForm.certificatePem && editCredential?.metadata?.interCertificateConfigured !== true ? 'certificado mTLS' : '',
        !credentialForm.privateKeyPem && editCredential?.metadata?.interPrivateKeyConfigured !== true ? 'chave privada' : '',
      ].filter(Boolean);

      if (missing.length > 0) {
        toast.error('Dados obrigatórios pendentes', `Informe: ${missing.join(', ')}.`);
        return;
      }

      payload.clientId = credentialForm.clientId;
      payload.clientSecret = credentialForm.clientSecret;
      payload.certificatePem = credentialForm.certificatePem;
      payload.privateKeyPem = credentialForm.privateKeyPem;
      payload.metadata = {
        interPixKey: credentialForm.interPixKey,
        interScopes: BANCO_INTER_V3_DEFAULT_SCOPES,
        notes: credentialForm.notes,
      };
    }

    if (credentialProviderCode === 'banese_card') {
      const baneseEdi7Code = normalizeBaneseEdi7Code(credentialForm.baneseEdi7Code);
      if (baneseEdi7Code && !isValidBaneseEdi7Code(baneseEdi7Code)) {
        toast.error(
          'Código EDI 7 inválido',
          'Informe exatamente 6 dígitos ou deixe o campo vazio. Ele é opcional para o OAuth de boletos.',
        );
        return;
      }

      payload.clientId = credentialForm.clientId;
      payload.clientSecret = credentialForm.clientSecret;
      payload.metadata = {
        baneseConvenio: BANESE_FIXED_BANKING_DATA.agreement,
        baneseBoletoConvenio: BANESE_FIXED_BANKING_DATA.agreement,
        baneseBeneficiarioNome: BANESE_FIXED_BANKING_DATA.beneficiaryName,
        baneseBeneficiarioInscricao: BANESE_FIXED_BANKING_DATA.beneficiaryDocument,
        baneseCodigoBeneficiario: BANESE_FIXED_BANKING_DATA.beneficiaryCode,
        baneseCarteira: credentialForm.baneseCarteira,
        baneseEdi7Code,
        baneseAgencia: BANESE_FIXED_BANKING_DATA.agency,
        baneseConta: BANESE_FIXED_BANKING_DATA.account,
        baneseContaDisplay: BANESE_FIXED_BANKING_DATA.account,
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
    if (selectedRouteBlockedReason) {
      toast.error('Rota ainda não homologada', selectedRouteBlockedReason);
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
    if (nextProviderCode && CONFIGURABLE_PROVIDER_CODES.has(nextProviderCode)) {
      setRouteProviderCode(nextProviderCode);
    } else {
      setRouteProviderCode(nextMethod === 'CREDIT_CARD' ? 'mercado_pago' : 'banese_card');
    }
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

      <IntegracaoBancariaHeader
        activeTab={activeTab}
        modalidade={modalidade}
        environment={activeEnvironment}
        providerCode={headerProviderCode}
        providerName={headerProviderName}
        onChangeTab={setActiveTab}
        onChangeModalidade={setModalidade}
      />

      {activeTab === 'resumo' && (
        <div className="space-y-5">
          <EmissorFinanceiroPanel
            config={overview?.issuerConfig}
            candidates={overview?.issuerCandidates || []}
            activePolosCount={overview?.activePolosCount || 0}
            selectedIssuerId={selectedIssuerId}
            saving={issuerMutation.isPending}
            onSelect={setSelectedIssuerId}
            onSave={() => issuerMutation.mutate({ issuerPoloId: selectedIssuerId })}
          />
          <ResumoBancarioPanel
            overview={overview}
            providers={providers}
            routeEnvironment={summaryEnvironment}
            getCredential={getCredential}
            onSelectRoute={openRouteFromSummary}
          />
        </div>
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
          selectedProviderCheckoutBlocked={selectedProviderCheckoutBlocked}
          selectedRouteBlockedReason={selectedRouteBlockedReason}
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
