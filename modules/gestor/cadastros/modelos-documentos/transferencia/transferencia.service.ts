
import { createDocumentTemplateService } from '../shared/document-template.service';

export const transferenciaService = createDocumentTemplateService('transferencia', {
  textContent: `<p>Declaramos, para fins de transferência escolar, que <b>{{ALUNO_NOME}}</b>, CPF nº {{ALUNO_CPF}}, matrícula nº {{ALUNO_MATRICULA}}, encontra-se vinculado(a) ao curso <b>{{CURSO_NOME}}</b>, turma {{TURMA_NOME}}, nesta instituição.</p><br><p>Situação acadêmica na data da emissão: <b>{{SITUACAO_ACADEMICA}}</b>.</p><br><p><b>Componentes curriculares cursados e aproveitamento:</b></p><p>{{TABELA_COMPONENTES_CURRICULARES}}</p><br><p>O presente documento acompanha a documentação acadêmica necessária à continuidade dos estudos na instituição de destino.</p>`,
  absoluteFields: [
    {
      id: 'transferencia_data',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 420,
      y: 820,
      width: 300,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }
    },
    {
      id: 'transferencia_assinatura',
      type: 'text',
      value: '___________________________________________\nSecretaria Acadêmica\n{{POLO_NOME}}',
      x: 230,
      y: 900,
      width: 335,
      style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' }
    }
  ],
  validityDays: 90,
  v: 2
});
