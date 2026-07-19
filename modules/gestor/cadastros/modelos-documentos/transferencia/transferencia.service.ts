
import { createDocumentTemplateService } from '../shared/document-template.service';

const transferenciaTemplatePageBreak = /<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi;

const normalizeTransferenciaTextContent = (textContent = '') => {
  const currentBreaks = (textContent.match(transferenciaTemplatePageBreak) || []).length;
  if (currentBreaks >= 2) return textContent;

  if (currentBreaks === 0) {
    return `${textContent}<div data-page-break="true"></div><div data-page-break="true"></div>`;
  }

  return `${textContent}<div data-page-break="true"></div>`;
};

const transferenciaDefaultTemplate = {
  textContent: `<p><strong>I - IDENTIFICAÇÃO</strong></p><p>Declaramos, para fins de transferência escolar, que <b>{{ALUNO_NOME}}</b>, CPF nº {{ALUNO_CPF}}, matrícula nº {{ALUNO_MATRICULA}}, encontra-se matriculado(a) no curso <b>{{CURSO_NOME}}</b>, turma {{TURMA_NOME}}, nesta instituição.</p><br><p>Situação acadêmica na data da emissão: <b>{{SITUACAO_ACADEMICA}}</b>.</p><div data-page-break="true"></div><p><strong>II - GRADE CURRICULAR CURSADA</strong></p><p>{{TABELA_COMPONENTES_CURRICULARES}}</p><br><div data-page-break="true"></div><p><strong>III - DADOS COMPLEMENTARES</strong></p><p><b>Carga horária total do curso:</b> {{CARGA_HORARIA_TOTAL}} horas.</p><br><p>Observação: os componentes devem ser conferidos conforme ementa/parecer pedagógico vigente e situação acadêmica apresentada.</p><br><p>O presente documento acompanha a documentação acadêmica necessária à continuidade dos estudos na instituição de destino.</p><br><p><b>Instituição de destino:</b> {{INSTITUICAO_DESTINO}}</p>`,
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
  pageCount: 3,
  v: 2
};

const transferenciaTemplateService = createDocumentTemplateService('transferencia', transferenciaDefaultTemplate, { sharedTemplate: true });

export const transferenciaService = {
  ...transferenciaTemplateService,
  async getTemplate(poloId: string) {
    const template = await transferenciaTemplateService.getTemplate(poloId);
    const normalizedTemplate = {
      ...template,
      textContent: normalizeTransferenciaTextContent(template?.textContent || ''),
      pageCount: Math.max(3, Number(template.pageCount || 1)),
      v: Math.max(2, Number(template.v || 0)),
    };

    if (
      normalizedTemplate.textContent !== template?.textContent
      || normalizedTemplate.pageCount !== Number(template?.pageCount || 1)
      || normalizedTemplate.v !== Number(template?.v || 0)
    ) {
      await transferenciaTemplateService.saveTemplate(poloId, normalizedTemplate);
    }

    return normalizedTemplate;
  }
};
