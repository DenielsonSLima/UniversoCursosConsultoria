import {
  createDocumentTemplateService,
  type DocumentTemplate,
} from '../shared/document-template.service';

const BOLETIM_TEMPLATE_VERSION = 3;

const defaultTemplate: DocumentTemplate = {
  textContent: `<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class="text-sm">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>`,
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
 * Migração restrita ao campo legado padrão. Modelos já personalizados não têm
 * suas coordenadas reescritas pelo exportador.
 */
export const migrateBoletimTemplate = (template: DocumentTemplate): DocumentTemplate => {
  if (Number(template.v || 0) >= BOLETIM_TEMPLATE_VERSION) return template;

  return {
    ...template,
    v: BOLETIM_TEMPLATE_VERSION,
    absoluteFields: (template.absoluteFields || []).map((field) => (
      field?.id === 'boletim_data'
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
  { sharedTemplate: true },
);

export const boletimService = {
  ...baseService,
  async getTemplate(scope: string) {
    return migrateBoletimTemplate(await baseService.getTemplate(scope));
  },
};
