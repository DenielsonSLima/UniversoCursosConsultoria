import type {
  DocumentValidationCatalogItem,
  NonValidatableDocumentCatalogItem,
} from './document-validation-policies.types';

export const DOCUMENT_VALIDATION_CATALOG: DocumentValidationCatalogItem[] = [
  {
    id: 'carteirinha',
    label: 'Carteirinha de Estudante',
    description: 'Identificação estudantil vinculada à matrícula e ao período da turma.',
    group: 'Identificação',
    validityMode: 'class_end',
  },
  {
    id: 'cracha_estagio',
    label: 'Crachá de Estágio',
    description: 'Identificação usada durante as atividades de estágio.',
    group: 'Identificação',
  },
  {
    id: 'declaracao_matricula',
    label: 'Declaração de Matrícula',
    description: 'Comprovante de vínculo acadêmico ativo.',
    group: 'Declarações',
  },
  {
    id: 'declaracao_frequencia',
    label: 'Declaração de Frequência',
    description: 'Comprovante de frequência acadêmica.',
    group: 'Declarações',
  },
  {
    id: 'declaracao_irpf',
    label: 'Declaração de IRPF',
    description: 'Documento financeiro anual do aluno.',
    group: 'Declarações',
  },
  {
    id: 'transferencia',
    label: 'Transferência',
    description: 'Documento acadêmico destinado a outra instituição.',
    group: 'Declarações',
  },
  {
    id: 'atestado_conclusao_tecnico',
    label: 'Atestado de Conclusão',
    description: 'Comprovação provisória de conclusão técnica.',
    group: 'Declarações',
  },
  {
    id: 'boletim',
    label: 'Boletim Escolar',
    description: 'Notas e frequência por módulo; configurado inicialmente sem validação pública.',
    group: 'Registros acadêmicos',
  },
  {
    id: 'historico_escolar',
    label: 'Histórico Escolar',
    description: 'Registro acadêmico consolidado da formação.',
    group: 'Registros acadêmicos',
  },
  {
    id: 'termo_estagio',
    label: 'Termo de Estágio',
    description: 'Instrumento do processo de estágio supervisionado.',
    group: 'Registros acadêmicos',
  },
  {
    id: 'diario_classe',
    label: 'Diário de Classe',
    description: 'Registro canônico por turma e disciplina, sem exposição de dados pessoais dos estudantes.',
    group: 'Registros acadêmicos',
  },
  {
    id: 'certificado_tecnico',
    label: 'Certificado Técnico',
    description: 'Certificação de conclusão de curso técnico.',
    group: 'Certificados',
  },
  {
    id: 'certificado_livre',
    label: 'Certificado de Curso Livre',
    description: 'Certificação de curso livre presencial.',
    group: 'Certificados',
  },
  {
    id: 'certificado_ead',
    label: 'Certificado EAD',
    description: 'Certificação de curso livre a distância.',
    group: 'Certificados',
  },
  {
    id: 'certificado_especializacao',
    label: 'Certificado de Especialização',
    description: 'Certificação de especialização ou pós-graduação.',
    group: 'Certificados',
  },
  {
    id: 'pasta_identificacao',
    label: 'Pasta de Identificação',
    description: 'Capa cadastral da pasta física ou digital do aluno.',
    group: 'Fichas cadastrais',
  },
  {
    id: 'ficha_matricula',
    label: 'Ficha de Matrícula',
    description: 'Todos os modelos de ficha de matrícula herdam esta regra.',
    group: 'Fichas cadastrais',
  },
];

export const NON_VALIDATABLE_DOCUMENTS: NonValidatableDocumentCatalogItem[] = [
  {
    id: 'ficha_cadastral',
    label: 'Ficha Cadastral do Aluno',
    reason: 'Documento interno de cadastro, sem emissão pública rastreada.',
  },
  {
    id: 'cracha_periodo_eleitoral',
    label: 'SES',
    reason: 'Usa validade operacional própria e permanece sem validador acadêmico.',
  },
  {
    id: 'recibo_despesa',
    label: 'Recibo de Despesa',
    reason: 'Documento financeiro sem vínculo com o validador acadêmico.',
  },
];

export const DOCUMENT_VALIDATION_GROUPS = [
  'Identificação',
  'Declarações',
  'Registros acadêmicos',
  'Certificados',
  'Fichas cadastrais',
] as const;

export const normalizeValidationPrefix = (value: string): string => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
);

export const validateValidationPrefix = (value: string): string | null => {
  const normalized = normalizeValidationPrefix(value);
  if (normalized.length < 2) return 'Informe ao menos 2 caracteres.';
  if (normalized.length > 20) return 'Use no máximo 20 caracteres.';
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalized)) {
    return 'Use somente letras, números e hífen entre os blocos.';
  }
  return null;
};
