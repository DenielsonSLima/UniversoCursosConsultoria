import { createDocumentTemplateService } from '../shared/document-template.service';

export const atestadoConclusaoService = createDocumentTemplateService('atestado_conclusao_tecnico', {
  textContent: `<p>Atestamos, para os devidos fins, que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, CPF nº <b>{{ALUNO_CPF}}</b>, matrícula nº <b>{{ALUNO_MATRICULA}}</b>, concluiu integralmente o curso técnico de <b>{{CURSO_NOME}}</b>, turma <b>{{TURMA_NOME}}</b>, com carga horária total de <b>{{CARGA_HORARIA_TOTAL}}</b> horas.</p><br><p>A conclusão ocorreu em <b>{{DATA_CONCLUSAO}}</b>, tendo o(a) estudante cumprido os componentes curriculares e requisitos acadêmicos previstos para a formação técnica.</p><br><p>O presente atestado é emitido a pedido do(a) interessado(a) para comprovação provisória de conclusão, até a expedição do diploma ou certificado definitivo.</p>`,
  absoluteFields: [
    {
      id: 'atestado_data',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 420,
      y: 790,
      width: 300,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '13px' },
    },
    {
      id: 'atestado_assinatura',
      type: 'text',
      value: '___________________________________________\nSecretaria Acadêmica',
      x: 235,
      y: 900,
      width: 325,
      style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' },
    },
  ],
  validityDays: 90,
  v: 1,
});
