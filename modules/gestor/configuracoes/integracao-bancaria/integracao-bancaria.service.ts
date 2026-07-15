import { supabase } from '../../../../lib/supabase';

export type GatewayEnvironment = 'sandbox' | 'production';
export type GatewayPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
export type GatewayModalidade = 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'OUTROS_CREDITOS';
export type GatewayProviderCode = 'asaas' | 'mercado_pago' | 'banco_inter' | 'banese_card';

export interface GatewayProvider {
  code: GatewayProviderCode;
  name: string;
  description?: string | null;
  supportsPix: boolean;
  supportsBoleto: boolean;
  supportsCreditCard: boolean;
  requiresPolling: boolean;
  hasPublicApi: boolean;
  active: boolean;
  metadata: Record<string, unknown>;
}

export interface GatewayCredential {
  id: string;
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  label?: string | null;
  configured: boolean;
  apiKeyConfigured: boolean;
  accessTokenConfigured: boolean;
  publicKeyConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl?: string | null;
  metadata: Record<string, unknown>;
  lastTestAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
}

export interface GatewayRoute {
  id: string;
  modalidade: GatewayModalidade;
  paymentMethod: GatewayPaymentMethod;
  environment: GatewayEnvironment;
  providerCode: GatewayProviderCode;
  credentialId?: string | null;
  enabled: boolean;
  notes?: string | null;
}

export interface GatewayIssuerCandidate {
  id: string;
  companyId: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  status: string;
  isMatrix: boolean;
  company?: {
    id: string;
    name?: string | null;
    legalName?: string | null;
    cnpj?: string | null;
  } | null;
}

export interface GatewayIssuerConfig {
  id: number;
  issuerPoloId: string;
  appliesToAllPolos: boolean;
  active: boolean;
  updatedAt?: string | null;
  issuer?: GatewayIssuerCandidate | null;
}

export interface GatewayOverview {
  providers: GatewayProvider[];
  credentials: GatewayCredential[];
  routes: GatewayRoute[];
  activeEnvironment: GatewayEnvironment;
  issuerConfig?: GatewayIssuerConfig | null;
  issuerCandidates: GatewayIssuerCandidate[];
  activePolosCount: number;
  webhookUrls: Record<GatewayProviderCode, string>;
}

export interface SaveCredentialInput {
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  label?: string;
  apiKey?: string;
  accessToken?: string;
  publicKey?: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  webhookToken?: string;
  crtAccessToken?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SaveRouteInput {
  modalidade: GatewayModalidade;
  paymentMethod: GatewayPaymentMethod;
  environment: GatewayEnvironment;
  providerCode: GatewayProviderCode;
  credentialId?: string | null;
  enabled?: boolean;
  notes?: string | null;
}

export interface SaveIssuerInput {
  issuerPoloId: string;
}

const extractFunctionErrorMessage = async (error: any) => {
  const context = error?.context;
  const canReadJson = context && typeof context.json === 'function';
  const body = canReadJson ? await context.json().catch(() => null) : null;
  return body?.error || body?.message || error?.message || 'Erro ao comunicar com a integração bancária.';
};

const invoke = async <T>(action: string, payload: object = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('payment-gateway-api', {
    body: { action, ...payload },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
};

const mapProvider = (row: any): GatewayProvider => ({
  code: row.code,
  name: row.name,
  description: row.description,
  supportsPix: row.supports_pix === true,
  supportsBoleto: row.supports_boleto === true,
  supportsCreditCard: row.supports_credit_card === true,
  requiresPolling: row.requires_polling === true,
  hasPublicApi: row.has_public_api === true,
  active: row.active !== false,
  metadata: row.metadata || {},
});

const mapCredential = (row: any): GatewayCredential => ({
  id: row.id,
  providerCode: row.provider_code,
  environment: row.environment,
  label: row.label,
  configured: row.configured === true,
  apiKeyConfigured: row.api_key_configured === true,
  accessTokenConfigured: row.access_token_configured === true,
  publicKeyConfigured: row.public_key_configured === true,
  clientIdConfigured: row.client_id_configured === true,
  clientSecretConfigured: row.client_secret_configured === true,
  webhookSecretConfigured: row.webhook_secret_configured === true,
  webhookUrl: row.webhook_url,
  metadata: row.metadata || {},
  lastTestAt: row.last_test_at,
  lastTestStatus: row.last_test_status,
  lastTestMessage: row.last_test_message,
});

const mapRoute = (row: any): GatewayRoute => ({
  id: row.id,
  modalidade: row.modalidade,
  paymentMethod: row.payment_method,
  environment: row.environment,
  providerCode: row.provider_code,
  credentialId: row.credential_id,
  enabled: row.enabled !== false,
  notes: row.notes,
});

const mapIssuerCandidate = (row: any): GatewayIssuerCandidate => ({
  id: row.id,
  companyId: row.company_id,
  name: row.nome,
  cnpj: row.cnpj,
  city: row.cidade,
  state: row.estado,
  status: row.status,
  isMatrix: row.is_matriz === true,
  company: row.company
    ? {
      id: row.company.id,
      name: row.company.name,
      legalName: row.company.legal_name,
      cnpj: row.company.cnpj,
    }
    : null,
});

const mapIssuerConfig = (row: any): GatewayIssuerConfig | null => {
  if (!row) return null;
  return {
    id: Number(row.id || 1),
    issuerPoloId: row.issuer_polo_id,
    appliesToAllPolos: row.applies_to_all_polos === true,
    active: row.active === true,
    updatedAt: row.updated_at,
    issuer: row.issuer ? mapIssuerCandidate(row.issuer) : null,
  };
};

export const integracaoBancariaService = {
  async getOverview(): Promise<GatewayOverview> {
    const data = await invoke<any>('get-overview');
    return {
      providers: (data.providers || []).map(mapProvider),
      credentials: (data.credentials || []).map(mapCredential),
      routes: (data.routes || []).map(mapRoute),
      activeEnvironment: data.activeEnvironment === 'production' ? 'production' : 'sandbox',
      issuerConfig: mapIssuerConfig(data.issuerConfig),
      issuerCandidates: (data.issuerCandidates || []).map(mapIssuerCandidate),
      activePolosCount: Number(data.activePolosCount || 0),
      webhookUrls: data.webhookUrls || {},
    };
  },

  async saveCredential(input: SaveCredentialInput): Promise<GatewayCredential> {
    const data = await invoke<any>('save-credential', input);
    return mapCredential(data.credential);
  },

  async saveRoute(input: SaveRouteInput): Promise<GatewayRoute> {
    const data = await invoke<any>('save-route', input);
    return mapRoute(data.route);
  },

  async saveIssuer(input: SaveIssuerInput): Promise<GatewayIssuerConfig> {
    const data = await invoke<any>('save-issuer', input);
    const issuerConfig = mapIssuerConfig(data.issuerConfig);
    if (!issuerConfig) throw new Error('O emissor financeiro não foi retornado pela API.');
    return issuerConfig;
  },

  async testConnection(input: Pick<SaveCredentialInput, 'providerCode' | 'environment'>): Promise<{
    status: string;
    message: string;
  }> {
    const data = await invoke<any>('test-connection', input);
    return {
      status: data.status,
      message: data.message,
    };
  },
};
