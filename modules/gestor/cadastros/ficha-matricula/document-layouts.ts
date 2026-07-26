import { createDocumentTemplateService } from '../modelos-documentos/shared/document-template.service';
import { FICHA_CADASTRAL_VARIABLES } from '../modelos-documentos/ficha-cadastral/ficha-cadastral.service';

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
  { code: '{{ALUNO_TITULO_ELEITOR}}', label: 'Título Eleitoral' },
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
  <div style="${span}min-width:0;">
    <strong style="display:block;margin-bottom:2px;font-size:7px;line-height:1.1;color:#475569;text-transform:uppercase;letter-spacing:.06em;">${title}</strong>
    <span style="display:block;font-size:inherit;line-height:1.2;color:#0f172a;font-weight:700;">${token}</span>
  </div>
`;

const sectionBlock = (title: string, content: string, columns: string) => `
  <section style="border:1px solid #cbd5e1;border-radius:7px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    <h4 style="margin:0;padding:4px 7px;border-bottom:1px solid #dbeafe;background-color:#eff6ff;color:#001a33;font-size:8px;line-height:1.1;text-transform:uppercase;letter-spacing:.08em;">${title}</h4>
    <div style="display:grid;grid-template-columns:${columns};gap:7px 12px;padding:7px 8px;">
      ${content}
    </div>
  </section>
`;

const institutionalFooter = `
  <section style="padding:5px 8px;text-align:center;color:#475569;font-size:7px;line-height:1.35;">
    <strong style="color:#001a33;text-transform:uppercase;">{{POLO_NOME}}</strong>
    <span> • CNPJ {{POLO_CNPJ}}</span><br>
    <span>{{POLO_ENDERECO_COMPLETO}}</span><br>
    <span>Telefone: {{POLO_TELEFONE}} • E-mail: {{POLO_EMAIL}}</span>
  </section>
`;

const movableTextBlock = (
  id: string,
  value: string,
  x: number,
  y: number,
  width = 642,
) => ({
  id,
  type: 'text',
  value,
  x,
  y,
  width,
  style: {
    color: '#0f172a',
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: '10px',
    textAlign: 'left',
    zIndex: 30,
  },
});

const movableStudentPhoto = (x: number, y: number) => ({
  id: 'student_photo',
  type: 'image',
  value: '{{ALUNO_FOTO_URL}}',
  x,
  y,
  width: 72,
  height: 96,
  style: {
    backgroundColor: '#f8fafc',
    border: '1px solid #94a3b8',
    borderRadius: '6px',
    overflow: 'hidden',
    zIndex: 35,
  },
});

const pastaIdentityBlock = `
  <section style="display:grid;grid-template-columns:2fr .65fr .8fr;gap:7px 12px;border:1px solid #94a3b8;border-radius:8px;padding:8px;background-color:rgba(255,255,255,.9);">
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
);

const documentsBlock = sectionBlock(
  'Documentos',
  `
    ${cell('RG / Documento', '{{ALUNO_RG}}')}
    ${cell('Órgão expedidor / UF', '{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}')}
    ${cell('Data de expedição', '{{ALUNO_RG_EMISSAO}}')}
    ${cell('CPF', '{{ALUNO_CPF}}')}
    ${cell('Título eleitoral', '{{ALUNO_TITULO_ELEITOR}}', 'grid-column:span 2;')}
    ${cell('Reservista', '{{ALUNO_RESERVISTA}}', 'grid-column:span 2;')}
  `,
  '1fr 1fr .8fr 1fr',
);

const pastaSchoolBlock = sectionBlock(
  'Dados escolares',
  `
    ${cell('Curso', '{{CURSO_NOME}}')}
    ${cell('Turma', '{{TURMA_NOME}}')}
    ${cell('Turno', '{{CURSO_TURNO}}')}
  `,
  '1.8fr .8fr .8fr',
);

const fichaIdentityBlock = `
  <section style="display:grid;grid-template-columns:2fr .65fr .9fr;gap:7px 12px;border:1px solid #94a3b8;border-radius:8px;padding:8px;background-color:rgba(255,255,255,.9);">
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
  '1.7fr .75fr .75fr .7fr',
);

export const pastaIdentificacaoDefaultTemplate = {
  textContent: '<div style="min-height:1px;"></div>',
  absoluteFields: [
    movableTextBlock('pasta_identificacao', pastaIdentityBlock, 76, 350, 552),
    movableStudentPhoto(646, 350),
    movableTextBlock(
      'pasta_necessidades',
      sectionBlock(
        'Necessidades especiais',
        `${cell('Possui', '{{ALUNO_PCD}}')}${cell('Qual', '{{ALUNO_PCD_TIPO}}')}`,
        '.5fr 2.5fr',
      ),
      76,
      458,
    ),
    movableTextBlock('pasta_endereco', addressBlock, 76, 510),
    movableTextBlock('pasta_documentos', documentsBlock, 76, 620),
    movableTextBlock('pasta_escolar', pastaSchoolBlock, 76, 700),
    movableTextBlock('pasta_rodape', institutionalFooter, 76, 758),
  ],
  validityDays: 0,
  pageCount: 1,
  v: 5,
};

export const fichaMatriculaDefaultTemplate = {
  textContent: '<div style="min-height:1px;"></div>',
  absoluteFields: [
    movableStudentPhoto(76, 350),
    movableTextBlock('ficha_identificacao', fichaIdentityBlock, 158, 350, 560),
    movableTextBlock('ficha_endereco', addressBlock, 76, 458),
    movableTextBlock('ficha_documentos', documentsBlock, 76, 568),
    movableTextBlock('ficha_escolar', fichaSchoolBlock, 76, 648),
    movableTextBlock(
      'ficha_termo',
      `
        <section style="border:1px solid #93c5fd;border-radius:7px;padding:7px 8px;background-color:rgba(239,246,255,.92);font-size:inherit;line-height:1.35;color:#0f172a;text-align:justify;">
          <strong style="display:block;margin-bottom:3px;font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;">Solicitação de matrícula</strong>
          {{FICHA_TERMO}}
        </section>
      `,
      76,
      706,
    ),
    movableTextBlock('ficha_campos_extras', '{{FICHA_CAMPOS_EXTRAS}}', 76, 770),
    movableTextBlock('ficha_assinaturas', '{{FICHA_ASSINATURAS}}', 76, 820),
    movableTextBlock(
      'ficha_observacoes',
      `
        <section style="border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;min-height:30px;background-color:rgba(255,255,255,.9);">
          ${cell('Observações', '{{ALUNO_OBSERVACOES}}')}
        </section>
      `,
      76,
      875,
    ),
    movableTextBlock(
      'ficha_local_data',
      '<p style="margin:0;text-align:right;color:#475569;font-size:8px;line-height:1.2;font-weight:700;">{{LOCAL_DOCUMENTO}}, {{DATA_ATUAL}}</p>',
      76,
      930,
    ),
  ],
  validityDays: 0,
  pageCount: 1,
  enrollmentFormTerm: 'Solicito minha matrícula no curso acima identificado e declaro que os dados informados são verdadeiros. Estou ciente das normas acadêmicas e administrativas da unidade escolar.',
  enrollmentFormCustomFields: [],
  enrollmentFormRequiresSignature: true,
  v: 5,
};

const pastaIdentificacaoBaseService = createDocumentTemplateService(
  'pasta_identificacao_aluno',
  pastaIdentificacaoDefaultTemplate,
  { sharedTemplate: true },
);

export const pastaIdentificacaoService = {
  ...pastaIdentificacaoBaseService,
  async getTemplate(poloId: string) {
    const currentTemplate = await pastaIdentificacaoBaseService.getTemplate(poloId);
    if (Number(currentTemplate?.v || 0) >= pastaIdentificacaoDefaultTemplate.v) {
      return currentTemplate;
    }

    const upgradedTemplate = {
      ...JSON.parse(JSON.stringify(pastaIdentificacaoDefaultTemplate)),
      absoluteFields: [
        ...pastaIdentificacaoDefaultTemplate.absoluteFields,
        ...(Array.isArray(currentTemplate?.absoluteFields)
          ? currentTemplate.absoluteFields.filter((field: any) => (
              !pastaIdentificacaoDefaultTemplate.absoluteFields.some(
                (defaultField) => defaultField.id === field.id,
              )
            ))
          : []),
      ],
    };
    await pastaIdentificacaoBaseService.saveTemplate(poloId, upgradedTemplate).catch(() => false);
    return upgradedTemplate;
  },
};
