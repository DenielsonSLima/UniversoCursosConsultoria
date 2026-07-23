import React from 'react';
import {
  Banknote,
  CreditCard,
  FileText,
  Landmark,
  QrCode,
  WalletCards,
} from 'lucide-react';
import {
  GatewayCredential,
  GatewayEnvironment,
  GatewayModalidade,
  GatewayPaymentMethod,
  GatewayProvider,
  GatewayProviderCode,
} from './integracao-bancaria.service';

export const MODALIDADES: Array<{
  value: GatewayModalidade;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'EAD',
    label: 'Cursos EAD',
    shortLabel: 'EAD',
    description: 'Cursos online, checkout EAD e emissão digital.',
  },
  {
    value: 'TECNICO',
    label: 'Técnico',
    shortLabel: 'Técnico',
    description: 'Matrículas e parcelas dos cursos técnicos.',
  },
  {
    value: 'LIVRE',
    label: 'Livres',
    shortLabel: 'Livres',
    description: 'Cursos rápidos, oficinas e turmas avulsas.',
  },
  {
    value: 'ESPECIALIZACAO',
    label: 'Especialização',
    shortLabel: 'Especial.',
    description: 'Pós, especializações e jornadas avançadas.',
  },
  {
    value: 'OUTROS_CREDITOS',
    label: 'Outros Créditos',
    shortLabel: 'Créditos',
    description: 'Links avulsos do financeiro para juros, receitas e cobranças pontuais.',
  },
];

export const ENVIRONMENTS: Array<{
  value: GatewayEnvironment;
  label: string;
  shortLabel: string;
  description: string;
  chip: string;
  panel: string;
  banner: string;
  headline: string;
}> = [
  {
    value: 'sandbox',
    label: 'Sandbox teste',
    shortLabel: 'Sandbox',
    description: 'Ambiente seguro para simular cobranças sem afetar produção.',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    panel: 'border-amber-200 bg-amber-50 text-amber-800',
    banner: 'border-amber-300 bg-amber-50 text-amber-800',
    headline: 'SANDBOX TESTE',
  },
  {
    value: 'production',
    label: 'Produção',
    shortLabel: 'Produção',
    description: 'Ambiente real usado para cobranças dos alunos.',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panel: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    banner: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    headline: 'PRODUÇÃO',
  },
];

export const METHODS: Array<{
  value: GatewayPaymentMethod;
  label: string;
  description: string;
  icon: React.ElementType;
  imageUrl: string;
  chip: string;
  selected: string;
}> = [
  {
    value: 'PIX',
    label: 'Pix',
    description: 'Pagamento instantâneo por QR Code ou copia e cola.',
    icon: QrCode,
    imageUrl: '/logos/payment-methods/pix.png',
    chip: 'border-teal-200 bg-teal-50 text-teal-700',
    selected: 'border-teal-500 bg-teal-50 text-teal-900',
  },
  {
    value: 'BOLETO',
    label: 'Boleto',
    description: 'Cobrança bancária com vencimento e linha digitável.',
    icon: FileText,
    imageUrl: '/logos/payment-methods/boleto.png',
    chip: 'border-sky-200 bg-sky-50 text-sky-700',
    selected: 'border-sky-500 bg-sky-50 text-sky-900',
  },
  {
    value: 'CREDIT_CARD',
    label: 'Cartão',
    description: 'Cartão de crédito via gateway com suporte a aprovação online.',
    icon: CreditCard,
    imageUrl: '/logos/payment-methods/cartao.png',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    selected: 'border-rose-500 bg-rose-50 text-rose-900',
  },
];

export const PROVIDER_ORDER: GatewayProviderCode[] = ['banese_card', 'mercado_pago'];

export const CONFIGURABLE_PROVIDER_CODES = new Set<GatewayProviderCode>(PROVIDER_ORDER);

export const BANCO_INTER_V3_DEFAULT_SCOPES =
  'boleto-cobranca.read boleto-cobranca.write';

export const baneseFixedBankingData = (environment?: 'sandbox' | 'production') => ({
  beneficiaryName: environment === 'sandbox'
    ? 'API Boletos - Universo Cursos e Consultoria LTDA'
    : 'UNIVERSO CURSOS E CONSULTORIA LTDA',
  beneficiaryDocument: '13.278.137/0001-54',
  agency: '033',
  account: '03/100649-0',
  beneficiaryCode: '03/100649-0',
  agreement: environment === 'sandbox' ? '15857255' : '15261',
  pixKey: environment === 'production' ? '79998617614' : '',
});

export const BANESE_FIXED_BANKING_DATA = baneseFixedBankingData('production');

export const PROVIDER_BRANDS: Record<GatewayProviderCode, {
  label: string;
  shortLabel: string;
  accent: string;
  softAccent: string;
  text: string;
  logoBackground: string;
  logoUrl?: string;
  sourceUrl?: string;
  chip: string;
  selected: string;
  action: string;
  shadow: string;
  description: string;
  bestFor: string;
  icon: React.ElementType;
}> = {
  asaas: {
    label: 'Asaas',
    shortLabel: 'Asaas',
    accent: '#0052ff',
    softAccent: '#eaf2ff',
    text: '#0030b9',
    logoBackground: '#ffffff',
    logoUrl: '/logos/payment-gateways/asaas.png',
    sourceUrl: 'https://www.asaas.com/',
    chip: 'border-blue-200 bg-blue-50 text-blue-700',
    selected: 'border-blue-500 bg-blue-50',
    action: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
    shadow: 'rgba(0, 82, 255, 0.18)',
    description: 'Gateway flexível para Pix, boleto e cartão.',
    bestFor: 'bom coringa',
    icon: CreditCard,
  },
  mercado_pago: {
    label: 'Mercado Pago',
    shortLabel: 'Mercado Pago',
    accent: '#00a8e8',
    softAccent: '#e8f8ff',
    text: '#0066a6',
    logoBackground: '#e8f8ff',
    logoUrl: '/logos/payment-gateways/mercado-pago.png',
    sourceUrl: 'https://www.mercadopago.com.br/developers/pt/docs',
    chip: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    selected: 'border-cyan-500 bg-cyan-50',
    action: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-600/20',
    shadow: 'rgba(0, 168, 232, 0.18)',
    description: 'Checkout Pro para cartão; ativação aguardando recuperação segura de preferências ambíguas.',
    bestFor: 'homologação de cartão',
    icon: WalletCards,
  },
  banco_inter: {
    label: 'Banco Inter',
    shortLabel: 'Inter',
    accent: '#ff7a00',
    softAccent: '#fff3e8',
    text: '#9a3f00',
    logoBackground: '#ffffff',
    sourceUrl: 'https://developers.inter.co/',
    chip: 'border-orange-200 bg-orange-50 text-orange-700',
    selected: 'border-orange-500 bg-orange-50',
    action: 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/20',
    shadow: 'rgba(255, 122, 0, 0.2)',
    description: 'API oficial do Inter para Pix Cobrança e Boleto com Pix.',
    bestFor: 'Pix e boleto',
    icon: Landmark,
  },
  banese_card: {
    label: 'Banese',
    shortLabel: 'Banese',
    accent: '#00843d',
    softAccent: '#ecfdf3',
    text: '#006b35',
    logoBackground: '#00843d',
    logoUrl: '/logos/payment-gateways/banese.png',
    sourceUrl: 'https://www.banese.com.br/',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    selected: 'border-emerald-500 bg-emerald-50',
    action: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20',
    shadow: 'rgba(0, 132, 61, 0.18)',
    description: 'Boleto e Pix via API do Banese em produção, com retorno no layout próprio (boleto + Pix).',
    bestFor: 'boleto e Pix',
    icon: Landmark,
  },
};

export const methodLabel = (method: GatewayPaymentMethod) =>
  METHODS.find((item) => item.value === method)?.label || method;

export const modalidadeLabel = (modalidade: GatewayModalidade) =>
  MODALIDADES.find((item) => item.value === modalidade)?.label || modalidade;

export const environmentLabel = (environment: GatewayEnvironment) =>
  ENVIRONMENTS.find((item) => item.value === environment)?.label || environment;

export const environmentShortLabel = (environment: GatewayEnvironment) =>
  ENVIRONMENTS.find((item) => item.value === environment)?.shortLabel || environment;

export const supportsMethod = (provider: GatewayProvider | undefined, method: GatewayPaymentMethod) => {
  if (!provider) return false;
  if (method === 'PIX') return provider.supportsPix;
  if (method === 'BOLETO') return provider.supportsBoleto;
  return provider.supportsCreditCard;
};

export const metadataValue = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
};

export const requiredFieldsFor = (
  providerCode: GatewayProviderCode,
  credential: GatewayCredential | undefined,
) => {
  if (providerCode === 'asaas') {
    return [
      { label: 'Chave API', configured: credential?.apiKeyConfigured === true },
      { label: 'Token webhook', configured: credential?.webhookSecretConfigured === true },
    ];
  }

  if (providerCode === 'mercado_pago') {
    return [
      { label: 'Access token', configured: credential?.accessTokenConfigured === true },
      { label: 'Public key', configured: credential?.publicKeyConfigured === true },
      { label: 'Webhook secret', configured: credential?.webhookSecretConfigured === true },
      { label: 'Merchant ID validado', configured: String(credential?.metadata?.merchantId || '').trim().length > 0 },
    ];
  }

  if (providerCode === 'banco_inter') {
    const metadata = credential?.metadata || {};
    return [
      { label: 'Client ID', configured: credential?.clientIdConfigured === true },
      { label: 'Client Secret', configured: credential?.clientSecretConfigured === true },
      { label: 'Certificado mTLS', configured: metadata.interCertificateConfigured === true },
      { label: 'Chave privada', configured: metadata.interPrivateKeyConfigured === true },
    ];
  }

  const metadata = credential?.metadata || {};
  const hasMetadata = (key: string) => String(metadata[key] || '').trim().length > 0;
  const hasAnyMetadata = (keys: string[]) => keys.some((key) => hasMetadata(key));

  return [
    { label: 'Client ID', configured: credential?.clientIdConfigured === true },
    { label: 'Client secret', configured: credential?.clientSecretConfigured === true },
    { label: 'Convênio boleto', configured: hasMetadata('baneseBoletoConvenio') || hasMetadata('baneseConvenio') },
    { label: 'Agência boleto', configured: hasMetadata('baneseAgencia') },
    { label: 'Conta beneficiária', configured: hasMetadata('baneseConta') || hasMetadata('baneseContaDisplay') },
    { label: 'Código beneficiário', configured: hasMetadata('baneseCodigoBeneficiario') },
    { label: 'OAuth homologado', configured: credential?.lastTestStatus === 'OK' },
  ];
};

export const requiredFieldsForRoute = (
  providerCode: GatewayProviderCode,
  credential: GatewayCredential | undefined,
  method: GatewayPaymentMethod,
) => {
  if (providerCode === 'banco_inter') {
    const fields = requiredFieldsFor(providerCode, credential);
    if (method === 'PIX') {
      const pixKey = String(credential?.metadata?.interPixKey || '').trim();
      return [...fields, { label: 'Chave Pix', configured: pixKey.length > 0 }];
    }
    return fields;
  }

  if (providerCode !== 'banese_card') return requiredFieldsFor(providerCode, credential);

  const metadata = credential?.metadata || {};
  const hasMetadata = (key: string) => String(metadata[key] || '').trim().length > 0;
  const fixedData = baneseFixedBankingData(credential?.environment);
  const hasAnyMetadata = (keys: string[]) => keys.some((key) => hasMetadata(key));
  const hasFixedOrMetadata = (key: string) => {
    if (key === 'baneseBoletoConvenio' || key === 'banesePixConvenio' || key === 'baneseConvenio') {
      return hasMetadata(key) || String(fixedData.agreement || '').trim().length > 0;
    }
    if (key === 'banesePixChave' || key === 'pixChave' || key === 'chave') {
      return hasMetadata(key) || String(fixedData.pixKey || '').trim().length > 0;
    }
    if (key === 'baneseAgencia') return hasMetadata(key) || String(fixedData.agency || '').trim().length > 0;
    if (key === 'baneseConta' || key === 'baneseContaDisplay') {
      return hasMetadata(key) || String(fixedData.account || '').trim().length > 0;
    }
    if (key === 'baneseCodigoBeneficiario') {
      return hasMetadata(key) || String(fixedData.beneficiaryCode || '').trim().length > 0;
    }
    return hasMetadata(key);
  };
  const baseFields = [
    { label: 'Client ID', configured: credential?.clientIdConfigured === true },
    { label: 'Client secret', configured: credential?.clientSecretConfigured === true },
  ];

  if (method === 'BOLETO') {
    return [
      ...baseFields,
      { label: 'Convênio boleto', configured: hasFixedOrMetadata('baneseBoletoConvenio') || hasFixedOrMetadata('baneseConvenio') },
      { label: 'Agência boleto', configured: hasMetadata('baneseAgencia') || hasFixedOrMetadata('baneseAgencia') },
      {
        label: 'Conta beneficiária',
        configured: hasMetadata('baneseConta') || hasMetadata('baneseContaDisplay') || hasFixedOrMetadata('baneseConta'),
      },
      {
        label: 'Código beneficiário',
        configured: hasMetadata('baneseCodigoBeneficiario') || hasFixedOrMetadata('baneseCodigoBeneficiario'),
      },
    ];
  }

  if (method === 'PIX') {
    return [
      ...baseFields,
      {
        label: 'Convênio Pix',
        configured: hasFixedOrMetadata('banesePixConvenio') || hasFixedOrMetadata('baneseConvenio'),
      },
      {
        label: 'Chave Pix',
        configured: hasAnyMetadata(['banesePixChave', 'pixChave', 'chave']) ||
          hasFixedOrMetadata('banesePixChave'),
      },
    ];
  }

  return [
    ...baseFields,
    { label: 'Cartão de crédito', configured: false },
  ];
};

export const credentialReadyForProvider = (
  providerCode: GatewayProviderCode,
  credential: GatewayCredential | undefined,
) => requiredFieldsFor(providerCode, credential).every((field) => field.configured);

export const credentialReadyForRoute = (
  providerCode: GatewayProviderCode | undefined,
  credential: GatewayCredential | undefined,
  method: GatewayPaymentMethod,
) => {
  if (!providerCode || !credential) return false;
  return requiredFieldsForRoute(providerCode, credential, method).every((field) => field.configured);
};

export const statusLabel = (credential: GatewayCredential | undefined) => {
  if (credential && credentialReadyForProvider(credential.providerCode, credential)) return 'Credencial pronta';
  if (
    credential?.apiKeyConfigured
    || credential?.accessTokenConfigured
    || credential?.clientIdConfigured
    || credential?.clientSecretConfigured
    || credential?.webhookSecretConfigured
  ) {
    return 'Credencial parcial';
  }
  return 'Sem chave';
};

export const methodSupportLabel = (provider: GatewayProvider, method: GatewayPaymentMethod) => {
  if (supportsMethod(provider, method)) return `${methodLabel(method)} liberado`;
  return `${methodLabel(method)} não atende`;
};

export const paymentMethodIcon = (method: GatewayPaymentMethod) =>
  METHODS.find((item) => item.value === method)?.icon || Banknote;
