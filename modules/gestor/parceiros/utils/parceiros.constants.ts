export const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';
export const ESTANCIA_LEGACY_POLO_ID = '55555555-5555-5555-5555-555555555555';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RACA_COR_OPTIONS = [
  'BRANCA',
  'PRETA',
  'PARDA',
  'AMARELA',
  'INDÍGENA',
  'PREFIRO NÃO INFORMAR',
] as const;

export const CERTIDAO_CIVIL_TYPE_OPTIONS = [
  { value: 'NASCIMENTO', label: 'Certidão de Nascimento' },
  { value: 'CASAMENTO', label: 'Certidão de Casamento' },
] as const;

export const CERTIDAO_CIVIL_MODEL_OPTIONS = [
  { value: 'NOVO', label: 'Modelo novo — matrícula com 32 dígitos' },
  { value: 'ANTIGO', label: 'Modelo antigo — livro, folha e termo' },
] as const;
