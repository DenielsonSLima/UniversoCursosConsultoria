import type { AbsoluteField, EditorVariable } from './declaracao-editor.types';

export const DECLARACAO_VARIABLES: EditorVariable[] = [
  { code: '{{ALUNO_NOME}}', label: 'Nome do Aluno' },
  { code: '{{ALUNO_CPF}}', label: 'CPF do Aluno' },
  { code: '{{ALUNO_RG}}', label: 'RG/Documento do Aluno' },
  { code: '{{ALUNO_DOCUMENTO_TIPO}}', label: 'Tipo de Documento (RG/CNH/CNI)' },
  { code: '{{ALUNO_NASCIMENTO}}', label: 'Data de Nascimento' },
  { code: '{{ALUNO_MATRICULA}}', label: 'Matrícula' },
  { code: '{{CURSO_NOME}}', label: 'Nome do Curso' },
  { code: '{{TURMA_NOME}}', label: 'Nome da Turma' },
  { code: '{{POLO_NOME}}', label: 'Nome do Polo' },
  { code: '{{POLO_CNPJ}}', label: 'CNPJ do Polo' },
  { code: '{{CIDADE_POLO}}', label: 'Cidade do Polo' },
  { code: '{{DATA_ATUAL}}', label: 'Data Atual (Extenso)' },
  { code: '{{HORA_ATUAL}}', label: 'Hora Atual' },
  { code: '{{DATA_GERACAO}}', label: 'Data/Hora de Geração' },
  { code: '{{VALIDADE_DIAS}}', label: 'Dias de Validade' },
  { code: '{{VALIDADE_DATA}}', label: 'Data de Validade (Limite)' },
];

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_BREAK_HTML = '<div data-page-break="true"></div>';

const pageBreakRegex = /<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/i;

export const splitDocumentPages = (html: string, count: number) => {
  const pages = String(html || '').split(pageBreakRegex);
  while (pages.length < count) pages.push('');
  return pages.slice(0, count);
};

const DECLARACAO_DEFAULT_FIELDS: AbsoluteField[] = [
  {
    id: 'sig_line',
    type: 'text',
    value: '___________________________________________',
    x: 200,
    y: 880,
    width: 394,
    style: { textAlign: 'center', fontSize: '14px' },
  },
  {
    id: 'sig_title',
    type: 'text',
    value: 'Secretaria Acadêmica',
    x: 200,
    y: 910,
    width: 394,
    style: { textAlign: 'center', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase' },
  },
  {
    id: 'sig_sub',
    type: 'text',
    value: '{{POLO_NOME}}',
    x: 200,
    y: 935,
    width: 394,
    style: { textAlign: 'center', fontSize: '12px', color: '#475569' },
  },
  {
    id: 'footer_valid_until',
    type: 'text',
    value: 'ESTE DOCUMENTO É VÁLIDO ATÉ <span style="color: #ef4444">{{VALIDADE_DATA}}</span>.',
    x: 50,
    y: 975,
    width: 694,
    style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' },
  },
  {
    id: 'footer_url',
    type: 'text',
    value: 'Para verificar a autenticidade deste documento acesse: <span style="color: #ef4444">www.universocc.com.br/validador</span>',
    x: 50,
    y: 995,
    width: 694,
    style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' },
  },
  {
    id: 'footer_validity',
    type: 'text',
    value: 'Validade deste documento: <span style="color: #ef4444">{{VALIDADE_DIAS}} dias a partir da data de emissão</span>.',
    x: 50,
    y: 1015,
    width: 694,
    style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' },
  },
  {
    id: 'footer_generation',
    type: 'text',
    value: 'DOCUMENTO GERADO EM: {{DATA_GERACAO}}',
    x: 50,
    y: 1035,
    width: 694,
    style: { textAlign: 'center', fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase' },
  },
];

export const appendDeclarationDefaultFields = (fields: AbsoluteField[]) => {
  const fieldsToAdd = DECLARACAO_DEFAULT_FIELDS.filter(
    defaultField => !fields.some(field => field.id === defaultField.id),
  );
  return [...fields, ...fieldsToAdd];
};
