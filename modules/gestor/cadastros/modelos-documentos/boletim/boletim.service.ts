import {
  createDocumentTemplateService,
  type DocumentTemplate,
} from '../shared/document-template.service';

const BOLETIM_TEMPLATE_VERSION = 4;
const STUDENT_HEADER = '<p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p>';
const STUDENT_IDENTITY = '<p>CPF nº {{ALUNO_CPF}}, {{ALUNO_DOCUMENTO_TIPO}} nº {{ALUNO_RG}}</p>';

const defaultTemplate: DocumentTemplate = {
  textContent: `<p><b>DADOS ACADÊMICOS</b></p>${STUDENT_HEADER}${STUDENT_IDENTITY}<p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class="text-sm">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>`,
  absoluteFields: [
    {
      id: 'boletim_data',
      type: 'text',
      value: 'Emitido em {{DATA_ATUAL}}',
      x: 455,
      y: 875,
      width: 190,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }
    },
    {
      id: 'boletim_assinatura',
      type: 'text',
      value: '___________________________________________\nSecretaria Acadêmica',
      x: 235,
      y: 930,
      width: 325,
      style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' }
    }
  ],
  validityDays: 30,
  v: BOLETIM_TEMPLATE_VERSION,
};

/**
 * Somente leitura do modelo vivo: acrescenta identidade no corpo padrão
 * reconhecido. Snapshots históricos não passam por esta migração.
 */
export const migrateBoletimTemplate = (template: DocumentTemplate): DocumentTemplate => {
  if (Number(template.v || 0) >= BOLETIM_TEMPLATE_VERSION) return template;
  const textContent = String(template.textContent || '');
  const legacyDefault = defaultTemplate.textContent.replace(STUDENT_IDENTITY, '');
  // O modelo legado salvo escapava as aspas de class. Só essa diferença é admitida.
  const addIdentity = textContent.replace(/\\+"/g, '"') === legacyDefault;
  if (!addIdentity && Number(template.v || 0) >= 3) return template;

  return {
    ...template,
    v: addIdentity ? BOLETIM_TEMPLATE_VERSION : 3,
    textContent: addIdentity
      ? textContent.replace(STUDENT_HEADER, () => STUDENT_HEADER + STUDENT_IDENTITY)
      : template.textContent,
    absoluteFields: (template.absoluteFields || []).map((field) => (
      Number(template.v || 0) < 3
      && field?.id === 'boletim_data'
      && Number(field.x) === 455
      && Number(field.y) === 875
      && Number(field.width) === 260
        ? { ...field, width: 190 }
        : field
    )),
  };
};

const baseService = createDocumentTemplateService(
  'boletim_tecnico',
  defaultTemplate,
  { sharedTemplate: true, failOnReadError: true },
);

export const boletimService = {
  ...baseService,
  async getTemplate(scope: string) {
    return migrateBoletimTemplate(await baseService.getTemplate(scope));
  },
};
