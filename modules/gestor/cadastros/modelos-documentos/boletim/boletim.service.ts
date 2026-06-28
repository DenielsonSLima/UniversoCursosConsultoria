import { createDocumentTemplateService } from '../shared/document-template.service';

export const boletimService = createDocumentTemplateService('boletim_tecnico', {
  textContent: `<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class="text-sm">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>`,
  absoluteFields: [
    {
      id: 'boletim_data',
      type: 'text',
      value: 'Emitido em {{DATA_ATUAL}}',
      x: 455,
      y: 875,
      width: 260,
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
  v: 2
}, { sharedTemplate: true });
