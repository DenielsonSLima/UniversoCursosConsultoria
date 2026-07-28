import type {
  AcademicDocumentValidationType,
  DocumentValidationResult,
  ValidatableDocumentType,
} from './validator.types';

export type ValidatorRendererId =
  | 'carteirinha'
  | 'declaracao'
  | 'boletim'
  | 'irpf'
  | 'historico'
  | 'transferencia'
  | 'estagio'
  | 'certificado'
  | 'ficha_cadastral'
  | 'diario';

export const PUBLIC_ACADEMIC_DOCUMENT_TYPES = [
  'cracha_estagio',
  'declaracao_matricula',
  'declaracao_frequencia',
  'declaracao_irpf',
  'boletim',
  'atestado_conclusao_tecnico',
  'historico_escolar',
  'transferencia',
  'termo_estagio',
  'certificado_tecnico',
  'certificado_livre',
  'certificado_ead',
  'certificado_especializacao',
  'pasta_identificacao',
  'ficha_matricula',
  'diario_classe',
] as const satisfies readonly AcademicDocumentValidationType[];

const publicAcademicDocumentTypes = new Set<string>(
  PUBLIC_ACADEMIC_DOCUMENT_TYPES,
);

export const isPublicAcademicDocumentType = (
  type: unknown,
): type is AcademicDocumentValidationType => (
  typeof type === 'string' && publicAcademicDocumentTypes.has(type)
);

/**
 * Registro exaustivo do conteúdo exibido para cada resultado público.
 *
 * Manter este mapa fora do componente permite validar em teste que nenhum tipo
 * aceito pelo serviço consegue deixar a página no estado "válido" sem conteúdo.
 */
export const VALIDATOR_RENDERER_BY_TYPE = {
  carteirinha: 'carteirinha',
  cracha_estagio: 'estagio',
  declaracao_matricula: 'declaracao',
  declaracao_frequencia: 'declaracao',
  declaracao_irpf: 'irpf',
  boletim: 'boletim',
  atestado_conclusao_tecnico: 'declaracao',
  historico_escolar: 'historico',
  transferencia: 'transferencia',
  termo_estagio: 'estagio',
  certificado_tecnico: 'certificado',
  certificado_livre: 'certificado',
  certificado_ead: 'certificado',
  certificado_especializacao: 'certificado',
  pasta_identificacao: 'ficha_cadastral',
  ficha_matricula: 'ficha_cadastral',
  diario_classe: 'diario',
} as const satisfies Record<DocumentValidationResult['type'], ValidatorRendererId>;

export const resolveValidatorRenderer = (
  type: ValidatableDocumentType,
): ValidatorRendererId | null => (
  VALIDATOR_RENDERER_BY_TYPE[type] || null
);
