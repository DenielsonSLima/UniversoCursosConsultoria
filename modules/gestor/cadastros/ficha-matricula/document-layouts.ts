import { createDocumentTemplateService } from '../modelos-documentos/shared/document-template.service';
import { FICHA_CADASTRAL_VARIABLES } from '../modelos-documentos/ficha-cadastral/ficha-cadastral.service';
import {
  injectMissingVoterFields,
  repairFichaVoterGrid,
} from './voter-template-repair';
import {
  stripRedundantPastaFooter,
} from './pasta-template-geometry';

export const FICHA_ALUNO_VARIABLES = [
  ...FICHA_CADASTRAL_VARIABLES,
  { code: '{{ALUNO_RACA_COR}}', label: 'Raça / Cor' },
  { code: '{{ALUNO_PCD}}', label: 'Necessidades Especiais' },
  { code: '{{ALUNO_PCD_TIPO}}', label: 'Tipo de Necessidade Especial' },
  { code: '{{ALUNO_LOGRADOURO}}', label: 'Logradouro' },
  { code: '{{ALUNO_NUMERO}}', label: 'Número' },
  { code: '{{ALUNO_COMPLEMENTO}}', label: 'Complemento' },
  { code: '{{ALUNO_BAIRRO}}', label: 'Bairro' },
  { code: '{{ALUNO_CIDADE}}', label: 'Cidade' },
  { code: '{{ALUNO_UF}}', label: 'UF' },
  { code: '{{ALUNO_TIPO_DOCUMENTO}}', label: 'Tipo de Documento' },
  { code: '{{ALUNO_RG_ORGAO}}', label: 'Órgão Emissor' },
  { code: '{{ALUNO_RG_UF}}', label: 'UF de Emissão' },
  { code: '{{ALUNO_RG_EMISSAO}}', label: 'Data de Emissão' },
  { code: '{{ALUNO_RESERVISTA}}', label: 'Reservista' },
  { code: '{{ALUNO_RESPONSAVEL_PARENTESCO}}', label: 'Parentesco do Responsável' },
  { code: '{{CURSO_MODALIDADE}}', label: 'Modalidade' },
  { code: '{{CURSO_TURNO}}', label: 'Turno' },
  { code: '{{MATRICULA_STATUS}}', label: 'Status da Matrícula' },
  { code: '{{ALUNO_OBSERVACOES}}', label: 'Observações' },
  { code: '{{POLO_CNPJ}}', label: 'CNPJ do Polo' },
  { code: '{{POLO_ENDERECO_COMPLETO}}', label: 'Endereço Completo do Polo' },
  { code: '{{POLO_TELEFONE}}', label: 'Telefone do Polo' },
  { code: '{{POLO_EMAIL}}', label: 'E-mail do Polo' },
  { code: '{{FICHA_TERMO}}', label: 'Termo Configurado da Matrícula' },
  { code: '{{FICHA_CAMPOS_EXTRAS}}', label: 'Bloco de Campos Extras' },
  { code: '{{FICHA_ASSINATURAS}}', label: 'Bloco de Assinaturas da Ficha' },
];

const cell = (title: string, token: string, span = '') => `
  <div style="${span}min-width:0;min-height:0;overflow:hidden;">
    <strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${title}</strong>
    <span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">${token}</span>
  </div>
`;

const LEGACY_FIELD_LABEL_STYLE = 'display:block;margin-bottom:2px;font-size:7px;line-height:1.1;color:#475569;text-transform:uppercase;letter-spacing:.06em;';
const FIELD_LABEL_STYLE = 'display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;';
const LEGACY_FIELD_VALUE_STYLE = 'display:block;font-size:inherit;line-height:1.2;color:#0f172a;font-weight:700;';
const FIELD_VALUE_STYLE = 'display:block;font-size:inherit;line-height:1.3;color:#334155;font-weight:400;overflow-wrap:anywhere;word-break:normal;';

const normalizeRegistrationHtmlTypography = (html: unknown) => String(html || '')
  .replaceAll(LEGACY_FIELD_LABEL_STYLE, FIELD_LABEL_STYLE)
  .replaceAll(LEGACY_FIELD_VALUE_STYLE, FIELD_VALUE_STYLE);

export const normalizeRegistrationTemplateTypography = (template: any, version = 6) => ({
  ...template,
  textContent: normalizeRegistrationHtmlTypography(template?.textContent),
  absoluteFields: Array.isArray(template?.absoluteFields)
    ? template.absoluteFields.map((field: any) => ({
        ...field,
        value: field?.type === 'text'
          ? normalizeRegistrationHtmlTypography(field.value)
          : field.value,
      }))
    : template?.absoluteFields,
  v: version,
});

const sectionBlock = (title: string, content: string, columns: string, rows = 1) => `
  <section style="height:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    <h4 style="margin:0;padding:4px 7px;border-bottom:1px solid #dbeafe;background-color:#eff6ff;color:#001a33;font-size:8px;line-height:1.1;text-transform:uppercase;letter-spacing:.08em;">${title}</h4>
    <div style="height:calc(100% - 18px);box-sizing:border-box;display:grid;grid-template-columns:${columns};grid-template-rows:repeat(${rows},minmax(0,1fr));gap:5px 12px;padding:6px 8px;">
      ${content}
    </div>
  </section>
`;

const movableTextBlock = (
  id: string,
  value: string,
  x: number,
  y: number,
  width = 642,
  height?: number,
) => ({
  id,
  type: 'text',
  value,
  x,
  y,
  width,
  ...(height ? { height } : {}),
  style: {
    color: '#0f172a',
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: '10px',
    textAlign: 'left',
    boxSizing: 'border-box',
    padding: 0,
    zIndex: 30,
  },
});

const movableStudentPhoto = (
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id: 'student_photo',
  type: 'image',
  value: '{{ALUNO_FOTO_URL}}',
  x,
  y,
  width,
  height,
  style: {
    backgroundColor: '#ffffff',
    border: '1px solid #94a3b8',
    borderRadius: '6px',
    display: 'block',
    overflow: 'hidden',
    objectFit: 'contain',
    objectPosition: 'center',
    zIndex: 35,
  },
});

const REGISTRATION_START_Y = 350;
const REGISTRATION_SECTION_GAP = 10;
const nextSectionY = (y: number, height: number) => (
  y + height + REGISTRATION_SECTION_GAP
);

const IDENTITY_HEIGHT = 134;
const NEEDS_HEIGHT = 58;
const ADDRESS_HEIGHT = 118;
const DOCUMENTS_HEIGHT = 92;
const SCHOOL_HEIGHT = 78;
const TERM_HEIGHT = 52;
const CUSTOM_FIELDS_HEIGHT = 62;
const SIGNATURES_HEIGHT = 42;
const OBSERVATIONS_HEIGHT = 46;
const LOCAL_DATE_HEIGHT = 16;
const REGISTRATION_CONTENT_X = 76;
const REGISTRATION_CONTENT_RIGHT = 718;
const IDENTITY_MEDIA_GAP = 10;
const STUDENT_PHOTO_WIDTH = IDENTITY_HEIGHT * (3 / 4);
const IDENTITY_CARD_X = REGISTRATION_CONTENT_X
  + STUDENT_PHOTO_WIDTH
  + IDENTITY_MEDIA_GAP;
const IDENTITY_CARD_WIDTH = REGISTRATION_CONTENT_RIGHT - IDENTITY_CARD_X;

const pastaIdentityY = REGISTRATION_START_Y;
const pastaNeedsY = nextSectionY(pastaIdentityY, IDENTITY_HEIGHT);
const pastaAddressY = nextSectionY(pastaNeedsY, NEEDS_HEIGHT);
const pastaDocumentsY = nextSectionY(pastaAddressY, ADDRESS_HEIGHT);
const pastaSchoolY = nextSectionY(pastaDocumentsY, DOCUMENTS_HEIGHT);

const fichaIdentityY = REGISTRATION_START_Y;
const fichaAddressY = nextSectionY(fichaIdentityY, IDENTITY_HEIGHT);
const fichaDocumentsY = nextSectionY(fichaAddressY, ADDRESS_HEIGHT);
const fichaSchoolY = nextSectionY(fichaDocumentsY, DOCUMENTS_HEIGHT);
const fichaTermY = nextSectionY(fichaSchoolY, SCHOOL_HEIGHT);
const fichaCustomFieldsY = nextSectionY(fichaTermY, TERM_HEIGHT);
const fichaSignaturesY = nextSectionY(fichaCustomFieldsY, CUSTOM_FIELDS_HEIGHT);
const fichaObservationsY = nextSectionY(fichaSignaturesY, SIGNATURES_HEIGHT);
const fichaLocalDateY = nextSectionY(fichaObservationsY, OBSERVATIONS_HEIGHT);

const pastaIdentityBlock = `
  <section style="height:100%;box-sizing:border-box;display:grid;grid-template-columns:2fr .65fr .8fr;grid-template-rows:repeat(4,minmax(0,1fr));gap:5px 12px;border:1px solid #94a3b8;border-radius:8px;padding:7px 8px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    ${cell('Nome completo do aluno', '{{ALUNO_NOME}}', 'grid-column:span 2;')}
    ${cell('Matrícula', '{{ALUNO_MATRICULA}}')}
    ${cell('Filiação — Mãe', '{{ALUNO_MAE}}', 'grid-column:span 2;')}
    ${cell('Nascimento', '{{ALUNO_NASCIMENTO}}')}
    ${cell('Filiação — Pai', '{{ALUNO_PAI}}', 'grid-column:span 2;')}
    ${cell('Sexo', '{{ALUNO_SEXO}}')}
    ${cell('Naturalidade', '{{ALUNO_NATURALIDADE}}')}
    ${cell('UF', '{{ALUNO_UF}}')}
    ${cell('Raça / Cor', '{{ALUNO_RACA_COR}}')}
  </section>
`;

const addressBlock = sectionBlock(
  'Endereço e contato',
  `
    ${cell('Logradouro', '{{ALUNO_LOGRADOURO}}')}
    ${cell('Nº', '{{ALUNO_NUMERO}}')}
    ${cell('Cidade', '{{ALUNO_CIDADE}}')}
    ${cell('CEP', '{{ALUNO_CEP}}')}
    ${cell('Bairro', '{{ALUNO_BAIRRO}}')}
    ${cell('UF', '{{ALUNO_UF}}')}
    ${cell('Telefone / Celular', '{{ALUNO_TELEFONE}}', 'grid-column:span 2;')}
    ${cell('E-mail', '{{ALUNO_EMAIL}}', 'grid-column:span 4;')}
  `,
  '2fr .45fr 1.15fr .8fr',
  3,
);

export const REGISTRATION_VOTER_TOKENS = [
  '{{ALUNO_TITULO_ELEITOR}}',
  '{{ALUNO_TITULO_ZONA}}',
  '{{ALUNO_TITULO_SECAO}}',
  '{{ALUNO_TITULO_EMISSAO}}',
  '{{ALUNO_TITULO_UF}}',
] as const;

const REGISTRATION_VOTER_FIELDS = [
  ['{{ALUNO_TITULO_ELEITOR}}', 'Título eleitoral', 'grid-column:span 2;'],
  ['{{ALUNO_TITULO_ZONA}}', 'Zona', ''],
  ['{{ALUNO_TITULO_SECAO}}', 'Seção', ''],
  ['{{ALUNO_TITULO_EMISSAO}}', 'Emissão', ''],
  ['{{ALUNO_TITULO_UF}}', 'UF', ''],
].map(([token, label, span]) => ({
  token,
  markup: cell(label, token, span),
}));

const normalizeTemplateVersion = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const documentsBlock = sectionBlock(
  'Documentos',
  `
    ${cell('RG / Documento', '{{ALUNO_RG}}', 'grid-column:span 2;')}
    ${cell('Órgão expedidor / UF', '{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}', 'grid-column:span 2;')}
    ${cell('Data de expedição', '{{ALUNO_RG_EMISSAO}}')}
    ${cell('CPF', '{{ALUNO_CPF}}')}
    ${cell('Título eleitoral', '{{ALUNO_TITULO_ELEITOR}}', 'grid-column:span 2;')}
    ${cell('Zona', '{{ALUNO_TITULO_ZONA}}')}
    ${cell('Seção', '{{ALUNO_TITULO_SECAO}}')}
    ${cell('Emissão / UF', '{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}')}
    ${cell('Reservista', '{{ALUNO_RESERVISTA}}')}
  `,
  '1.15fr 1.15fr .6fr .6fr 1fr 1fr',
  2,
);

export const registrationTemplateNeedsVoterUpgrade = (
  template: any,
  fieldId: string,
  targetVersion: number,
) => {
  const fields = Array.isArray(template?.absoluteFields) ? template.absoluteFields : [];
  const documentField = fields.find((field: any) => field?.id === fieldId);
  const fieldContent = String(documentField?.value || '');
  return normalizeTemplateVersion(template?.v) < targetVersion
    || !REGISTRATION_VOTER_TOKENS.every((token) => fieldContent.includes(token));
};

export const upgradeRegistrationVoterField = (
  template: any,
  defaultTemplate: any,
  fieldId: string,
) => {
  const storedFields = Array.isArray(template?.absoluteFields) ? template.absoluteFields : [];
  const defaultFields = Array.isArray(defaultTemplate?.absoluteFields)
    ? defaultTemplate.absoluteFields
    : [];
  const canonicalDocumentField = defaultFields.find((field: any) => field?.id === fieldId);
  const repairedFields = storedFields.map((field: any) => (
    field?.id === fieldId
      && !REGISTRATION_VOTER_TOKENS.every((token) => (
        String(field?.value || '').includes(token)
      ))
      ? {
          ...field,
          value: fieldId === 'ficha_documentos' || fieldId === 'pasta_documentos'
            ? repairFichaVoterGrid(field.value)
            : injectMissingVoterFields(
                field.value,
                REGISTRATION_VOTER_FIELDS,
                'INNER_GRID',
              ),
        }
      : field
  ));

  if (
    canonicalDocumentField
    && !storedFields.some((field: any) => field?.id === fieldId)
  ) {
    repairedFields.push(JSON.parse(JSON.stringify(canonicalDocumentField)));
  }

  return {
    ...template,
    absoluteFields: repairedFields,
    v: Math.max(
      normalizeTemplateVersion(template?.v),
      normalizeTemplateVersion(defaultTemplate?.v),
    ),
  };
};

const pastaSchoolBlock = sectionBlock(
  'Dados escolares',
  `
    ${cell('Curso', '{{CURSO_NOME}}')}
    ${cell('Turma', '{{TURMA_NOME}}')}
    ${cell('Turno', '{{CURSO_TURNO}}')}
  `,
  '1.65fr 1.1fr .45fr',
  1,
);

const fichaIdentityBlock = `
  <section style="height:100%;box-sizing:border-box;display:grid;grid-template-columns:2fr .65fr .9fr;grid-template-rows:repeat(4,minmax(0,1fr));gap:5px 12px;border:1px solid #94a3b8;border-radius:8px;padding:7px 8px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    ${cell('Nome completo do aluno', '{{ALUNO_NOME}}', 'grid-column:span 2;')}
    ${cell('Sexo', '{{ALUNO_SEXO}}')}
    ${cell('Filiação — Mãe', '{{ALUNO_MAE}}', 'grid-column:span 2;')}
    ${cell('Nascimento', '{{ALUNO_NASCIMENTO}}')}
    ${cell('Filiação — Pai', '{{ALUNO_PAI}}', 'grid-column:span 2;')}
    ${cell('Naturalidade / UF', '{{ALUNO_NATURALIDADE}} / {{ALUNO_UF}}')}
    ${cell('Necessidades especiais', '{{ALUNO_PCD}} • {{ALUNO_PCD_TIPO}}', 'grid-column:span 3;')}
  </section>
`;

const fichaSchoolBlock = sectionBlock(
  'Dados escolares',
  `
    ${cell('Curso', '{{CURSO_NOME}}')}
    ${cell('Matrícula', '{{ALUNO_MATRICULA}}')}
    ${cell('Turma', '{{TURMA_NOME}}')}
    ${cell('Turno', '{{CURSO_TURNO}}')}
  `,
  '1.6fr .65fr 1.1fr .45fr',
  1,
);

export const pastaIdentificacaoDefaultTemplate = {
  textContent: '<div style="min-height:1px;"></div>',
  absoluteFields: [
    movableStudentPhoto(
      REGISTRATION_CONTENT_X,
      pastaIdentityY,
      STUDENT_PHOTO_WIDTH,
      IDENTITY_HEIGHT,
    ),
    movableTextBlock(
      'pasta_identificacao',
      pastaIdentityBlock,
      IDENTITY_CARD_X,
      pastaIdentityY,
      IDENTITY_CARD_WIDTH,
      IDENTITY_HEIGHT,
    ),
    movableTextBlock(
      'pasta_necessidades',
      sectionBlock(
        'Necessidades especiais',
        `${cell('Possui', '{{ALUNO_PCD}}')}${cell('Qual', '{{ALUNO_PCD_TIPO}}')}`,
        '.5fr 2.5fr',
      ),
      76,
      pastaNeedsY,
      642,
      NEEDS_HEIGHT,
    ),
    movableTextBlock('pasta_endereco', addressBlock, 76, pastaAddressY, 642, ADDRESS_HEIGHT),
    movableTextBlock(
      'pasta_documentos',
      documentsBlock,
      76,
      pastaDocumentsY,
      642,
      DOCUMENTS_HEIGHT,
    ),
    movableTextBlock('pasta_escolar', pastaSchoolBlock, 76, pastaSchoolY, 642, SCHOOL_HEIGHT),
  ],
  validityDays: 0,
  pageCount: 1,
  v: 14,
};

export const fichaMatriculaDefaultTemplate = {
  textContent: '<div style="min-height:1px;"></div>',
  absoluteFields: [
    movableStudentPhoto(
      REGISTRATION_CONTENT_X,
      fichaIdentityY,
      STUDENT_PHOTO_WIDTH,
      IDENTITY_HEIGHT,
    ),
    movableTextBlock(
      'ficha_identificacao',
      fichaIdentityBlock,
      IDENTITY_CARD_X,
      fichaIdentityY,
      IDENTITY_CARD_WIDTH,
      IDENTITY_HEIGHT,
    ),
    movableTextBlock('ficha_endereco', addressBlock, 76, fichaAddressY, 642, ADDRESS_HEIGHT),
    movableTextBlock(
      'ficha_documentos',
      documentsBlock,
      76,
      fichaDocumentsY,
      642,
      DOCUMENTS_HEIGHT,
    ),
    movableTextBlock('ficha_escolar', fichaSchoolBlock, 76, fichaSchoolY, 642, SCHOOL_HEIGHT),
    movableTextBlock(
      'ficha_termo',
      `
        <section style="border:1px solid #93c5fd;border-radius:7px;padding:7px 8px;background-color:rgba(239,246,255,.92);font-size:inherit;line-height:1.35;color:#0f172a;text-align:justify;">
          <strong style="display:block;margin-bottom:3px;font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;">Solicitação de matrícula</strong>
          {{FICHA_TERMO}}
        </section>
      `,
      76,
      fichaTermY,
      642,
      TERM_HEIGHT,
    ),
    movableTextBlock(
      'ficha_campos_extras',
      '{{FICHA_CAMPOS_EXTRAS}}',
      76,
      fichaCustomFieldsY,
      642,
      CUSTOM_FIELDS_HEIGHT,
    ),
    movableTextBlock(
      'ficha_assinaturas',
      '{{FICHA_ASSINATURAS}}',
      76,
      fichaSignaturesY,
      642,
      SIGNATURES_HEIGHT,
    ),
    movableTextBlock(
      'ficha_observacoes',
      `
        <section style="border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;min-height:30px;background-color:rgba(255,255,255,.9);">
          ${cell('Observações', '{{ALUNO_OBSERVACOES}}')}
        </section>
      `,
      76,
      fichaObservationsY,
      500,
      OBSERVATIONS_HEIGHT,
    ),
    movableTextBlock(
      'ficha_local_data',
      '<p style="margin:0;text-align:right;color:#475569;font-size:8px;line-height:1.2;font-weight:700;">{{LOCAL_DOCUMENTO}}, {{DATA_ATUAL}}</p>',
      76,
      fichaLocalDateY,
      500,
      LOCAL_DATE_HEIGHT,
    ),
  ],
  validityDays: 0,
  pageCount: 1,
  enrollmentFormTerm: 'Solicito minha matrícula no curso acima identificado e declaro que os dados informados são verdadeiros. Estou ciente das normas acadêmicas e administrativas da unidade escolar.',
  enrollmentFormCustomFields: [],
  enrollmentFormRequiresSignature: true,
  v: 12,
};

const pastaIdentificacaoBaseService = createDocumentTemplateService(
  'pasta_identificacao_aluno',
  pastaIdentificacaoDefaultTemplate,
  { sharedTemplate: true },
);

export const pastaIdentificacaoService = {
  ...pastaIdentificacaoBaseService,
  async getTemplate(poloId: string) {
    const currentTemplate = stripRedundantPastaFooter(
      await pastaIdentificacaoBaseService.getTemplate(poloId),
    );
    if (!registrationTemplateNeedsVoterUpgrade(
      currentTemplate,
      'pasta_documentos',
      pastaIdentificacaoDefaultTemplate.v,
    )) {
      return currentTemplate;
    }

    return upgradeRegistrationVoterField(
      currentTemplate,
      pastaIdentificacaoDefaultTemplate,
      'pasta_documentos',
    );
  },
};
