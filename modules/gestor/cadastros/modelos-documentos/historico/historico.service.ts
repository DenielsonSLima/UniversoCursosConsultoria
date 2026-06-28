
import { createDocumentTemplateService } from '../shared/document-template.service';

export const historicoService = createDocumentTemplateService('historico', {
  textContent: `<p><b>IDENTIFICAÇÃO DO ESTUDANTE</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; CPF: {{ALUNO_CPF}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}} &nbsp; Período: {{PERIODO_CURSO}}</p><br><p><b>REGISTRO ACADÊMICO</b></p><p>{{TABELA_HISTORICO_ESCOLAR}}</p><br><p>Carga horária cumprida: {{CARGA_HORARIA_CUMPRIDA}} de {{CARGA_HORARIA_TOTAL}} horas.</p><p>Situação acadêmica: <b>{{SITUACAO_ACADEMICA}}</b>.</p><p>Observações: {{OBSERVACOES_HISTORICO}}</p>`,
  absoluteFields: [
    {
      id: 'historico_data',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 420,
      y: 850,
      width: 300,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }
    },
    {
      id: 'historico_assinatura',
      type: 'text',
      value: '___________________________________________\nSecretaria Acadêmica\n{{POLO_NOME}}',
      x: 230,
      y: 920,
      width: 335,
      style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' }
    }
  ],
  validityDays: 365,
  v: 2
}, { sharedTemplate: true });
