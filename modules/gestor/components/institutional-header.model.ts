export const INSTITUTIONAL_HEADER_EMAIL = 'universo.cursoseconsultoria@gmail.com';

const EMPTY_DETAIL_VALUE = 'Não informado';

export interface InstitutionalHeaderFields {
  logoUrl?: unknown;
  logo_url?: unknown;
  nomeFantasia?: unknown;
  nome_fantasia?: unknown;
  nome?: unknown;
  name?: unknown;
  razaoSocial?: unknown;
  razao_social?: unknown;
  legalName?: unknown;
  legal_name?: unknown;
  cnpj?: unknown;
  taxId?: unknown;
  tax_id?: unknown;
  endereco?: unknown;
  address?: unknown;
  numero?: unknown;
  number?: unknown;
  complemento?: unknown;
  complement?: unknown;
  bairro?: unknown;
  neighborhood?: unknown;
  cidade?: unknown;
  city?: unknown;
  uf?: unknown;
  estado?: unknown;
  state?: unknown;
  cep?: unknown;
  postalCode?: unknown;
  postal_code?: unknown;
  telefone?: unknown;
  contato?: unknown;
  phone?: unknown;
  email?: unknown;
  isMatriz?: unknown;
  is_matriz?: unknown;
  isHeadquarters?: unknown;
  is_headquarters?: unknown;
  tipo?: unknown;
  type?: unknown;
}

export interface InstitutionalHeaderSource {
  overrides?: InstitutionalHeaderFields | null;
  polo?: InstitutionalHeaderFields | null;
  company?: InstitutionalHeaderFields | null;
}

export interface InstitutionalDocumentMeta {
  eyebrow?: string;
  title: string;
  label?: string;
  value?: string;
}

export interface InstitutionalHeaderDetail {
  label: string;
  value: string;
}

export type InstitutionalHeaderDetails = readonly [
  InstitutionalHeaderDetail,
  InstitutionalHeaderDetail,
  InstitutionalHeaderDetail,
];

export interface ResolvedInstitutionalHeader {
  logoUrl: string | null;
  name: string;
  cnpj: string;
  phone: string;
  email: typeof INSTITUTIONAL_HEADER_EMAIL;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  isHeadquarters: boolean;
  leftLines: InstitutionalHeaderDetails;
  rightLines: InstitutionalHeaderDetails;
}

const asText = (value: unknown) => String(value ?? '').trim();

const resolveText = (
  sources: readonly (InstitutionalHeaderFields | null | undefined)[],
  keys: readonly (keyof InstitutionalHeaderFields)[],
) => {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = asText(source[key]);
      if (value) return value;
    }
  }
  return '';
};

const cleanInstitutionName = (value: string) => {
  const name = value || 'UNIVERSO CURSOS E CONSULTORIA';
  return name.replace(/^MATRIZ\s*-\s*/i, '').trim();
};

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  const normalized = asText(value).toLocaleUpperCase('pt-BR');
  if (['TRUE', '1', 'SIM'].includes(normalized)) return true;
  if (['FALSE', '0', 'NÃO', 'NAO'].includes(normalized)) return false;
  return undefined;
};

const resolveIsHeadquarters = (
  sources: readonly (InstitutionalHeaderFields | null | undefined)[],
) => {
  const booleanKeys = [
    'isMatriz',
    'is_matriz',
    'isHeadquarters',
    'is_headquarters',
  ] as const;

  for (const source of sources) {
    if (!source) continue;
    for (const key of booleanKeys) {
      const resolved = parseBoolean(source[key]);
      if (resolved !== undefined) return resolved;
    }

    const type = asText(source.tipo || source.type).toLocaleUpperCase('pt-BR');
    if (type) return type === 'MATRIZ';
  }
  return false;
};

const withPlaceholder = (value: string) => value || EMPTY_DETAIL_VALUE;

export const resolveInstitutionalHeader = (
  source: InstitutionalHeaderSource,
): ResolvedInstitutionalHeader => {
  const sources = [source.overrides, source.polo, source.company] as const;
  const logoUrl = resolveText(sources, ['logoUrl', 'logo_url']) || null;
  const name = cleanInstitutionName(resolveText(sources, [
    'nomeFantasia',
    'nome_fantasia',
    'nome',
    'name',
    'razaoSocial',
    'razao_social',
    'legalName',
    'legal_name',
  ]));
  const cnpj = resolveText(sources, ['cnpj', 'taxId', 'tax_id']);
  const phone = resolveText(sources, ['telefone', 'contato', 'phone']);
  const address = resolveText(sources, ['endereco', 'address']);
  const number = resolveText(sources, ['numero', 'number']);
  const complement = resolveText(sources, ['complemento', 'complement']);
  const neighborhood = resolveText(sources, ['bairro', 'neighborhood']);
  const city = resolveText(sources, ['cidade', 'city']);
  const state = resolveText(sources, ['uf', 'estado', 'state']);
  const postalCode = resolveText(sources, ['cep', 'postalCode', 'postal_code']);
  const cityAndState = city && state
    ? `${city} (${state})`
    : city || (state ? `(${state})` : '');
  const fullAddress = [address, number, complement].filter(Boolean).join(', ');
  const neighborhoodAndPostalCode = [
    withPlaceholder(neighborhood),
    `CEP: ${withPlaceholder(postalCode)}`,
  ].join(' · ');

  return {
    logoUrl,
    name,
    cnpj,
    phone,
    email: INSTITUTIONAL_HEADER_EMAIL,
    address,
    number,
    complement,
    neighborhood,
    city,
    state,
    postalCode,
    isHeadquarters: resolveIsHeadquarters(sources),
    leftLines: [
      { label: 'CNPJ', value: withPlaceholder(cnpj) },
      { label: 'Contato', value: withPlaceholder(phone) },
      { label: 'E-mail', value: INSTITUTIONAL_HEADER_EMAIL },
    ],
    rightLines: [
      { label: 'Cidade/UF', value: withPlaceholder(cityAndState) },
      { label: 'Endereço', value: withPlaceholder(fullAddress) },
      { label: 'Bairro', value: neighborhoodAndPostalCode },
    ],
  };
};
