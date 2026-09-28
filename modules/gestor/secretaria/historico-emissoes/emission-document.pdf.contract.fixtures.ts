import type { EmissionPdfSource } from './emission-document.pdf';
import type { EmissionLog, PreviewResources } from './historico-emissoes.types';

export const PAGE_BREAK = '<div data-page-break="true"></div>';
export const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
export const extractPdfText = async (blob: Blob) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n'));
  }
  await document.destroy();
  return pages.join('\n\f\n');
};
export const REAL_DOCUMENTS_GRID = `
  <section style="height:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;background-color:rgba(255,255,255,.9);overflow:hidden;">
    <h4 style="margin:0;padding:4px 7px;border-bottom:1px solid #dbeafe;background-color:#eff6ff;color:#001a33;font-size:8px;line-height:1.1;text-transform:uppercase;letter-spacing:.08em;">Documentos</h4>
    <div style="height:calc(100% - 18px);box-sizing:border-box;display:grid;grid-template-columns:1.15fr 1.15fr .6fr .6fr 1fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));gap:5px 12px;padding:6px 8px;">
      <div style="grid-column:span 2;min-width:0;overflow:hidden;"><strong>RG / Documento</strong><span>{{ALUNO_RG}}</span></div>
      <div style="grid-column:span 2;min-width:0;overflow:hidden;"><strong>Órgão expedidor / UF</strong><span>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>Data de expedição</strong><span>{{ALUNO_RG_EMISSAO}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>CPF</strong><span>{{ALUNO_CPF}}</span></div>
      <div style="grid-column:span 2;min-width:0;overflow:hidden;"><strong>Título eleitoral</strong><span>{{ALUNO_TITULO_ELEITOR}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>Zona</strong><span>{{ALUNO_TITULO_ZONA}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>Seção</strong><span>{{ALUNO_TITULO_SECAO}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>Emissão / UF</strong><span>{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}</span></div>
      <div style="min-width:0;overflow:hidden;"><strong>Reservista</strong><span>{{ALUNO_RESERVISTA}}</span></div>
    </div>
  </section>
`;

export const REAL_LEGACY_FICHA_DOCUMENTS_GRID = `
  <section style="height: 100%; border: 1px solid #cbd5e1; border-radius: 7px; background-color: rgba(255,255,255,.9); overflow: hidden">
    <h4 style="margin: 0; padding: 4px 7px; border-bottom: 1px solid #dbeafe; background-color: #eff6ff; color: #001a33; font-size: 8px; line-height: 1.1; text-transform: uppercase; letter-spacing: .08em">Documentos</h4>
    <div style="height: calc(100% - 18px); display: grid; grid-template-columns: 1fr 1fr .8fr 1fr; grid-template-rows: repeat(2,minmax(0,1fr)); gap: 5px 12px; padding: 6px 8px">
      <div><strong>RG / Documento</strong><span>{{ALUNO_RG}}</span></div>
      <div><strong>Órgão expedidor / UF</strong><span>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span></div>
      <div><strong>Data de expedição</strong><span>{{ALUNO_RG_EMISSAO}}</span></div>
      <div><strong>CPF</strong><span>{{ALUNO_CPF}}</span></div>
      <div style="grid-column: span 2"><strong>Título eleitoral</strong><span>{{ALUNO_TITULO_ELEITOR}}</span></div>
      <div style="grid-column: span 2"><strong>Reservista</strong><span>{{ALUNO_RESERVISTA}}</span></div>
    </div>
  </section>
`;

export const makeEmission = (index: number): EmissionLog => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  identidade: `fixture-${index}`,
  codigo: `FIXTURE-${String(index).padStart(4, '0')}`,
  documento: index % 2 ? 'ficha_matricula' : 'pasta_identificacao',
  matricula_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  aluno_id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  polo_id: '30000000-0000-4000-8000-000000000001',
  periodo_referencia: null,
  referencia_externa: null,
  status: 'ATIVO',
  emitido_em: '2026-08-09T12:00:00.000Z',
  ultima_emissao_em: '2026-08-09T12:00:00.000Z',
  validade_ate: null,
  validacao_publica: false,
  revogado_em: null,
  emitido_por: null,
  quantidade_emissoes: 1,
  dados_emissao: {
    studentName: `PESSOA EXEMPLO ${String(index).padStart(2, '0')}`,
    studentCpf: '000.000.000-00',
    studentMatricula: `MAT-${String(index).padStart(4, '0')}`,
    courseName: 'CURSO DE EXEMPLO',
    className: 'TURMA DE EXEMPLO',
    studentRg: 'DOC-EXEMPLO',
    studentRgIssuer: 'ÓRGÃO',
    studentRgState: 'EX',
    studentRgIssueDate: '2020-01-02',
    studentVoterId: '000000000000',
    studentVoterZone: '000',
    studentVoterSection: '0000',
    studentVoterIssueDate: '2020-02-03',
    studentVoterState: 'EX',
    studentReservist: 'NÃO SE APLICA',
    institutionSnapshot: {
      nome: 'INSTITUIÇÃO CONGELADA DE EXEMPLO',
      nomeFantasia: 'INSTITUIÇÃO CONGELADA DE EXEMPLO',
      cnpj: '00.000.000/0000-00',
      cidade: 'CIDADE CONGELADA',
      uf: 'EX',
      logoUrl: null,
    },
    watermarkSnapshot: {
      watermarkUrl: ONE_PIXEL_PNG,
      watermarkOpacity: 0.17,
      watermarkScale: 37,
      watermarkRotate: false,
      label: 'MARCA CONGELADA',
    },
  },
});

export const makePreview = (overrides: Record<string, unknown> = {}): PreviewResources => ({
  template: {
    pageCount: 2,
    textContent: [
      '<p>Ficha oficial de {{ALUNO_NOME}}.</p><p>Matrícula: {{ALUNO_MATRICULA}}</p>',
      PAGE_BREAK,
      '<p>Curso: {{CURSO_NOME}}</p><p>Turma: {{TURMA_NOME}}</p>',
    ].join(''),
    absoluteFields: [{
      id: 'ficha_documentos',
      type: 'text',
      value: REAL_DOCUMENTS_GRID,
      x: 76,
      y: 690,
      width: 642,
      height: 92,
      style: { fontSize: '10px' },
    }, {
      id: 'campo_vetorial_segunda_pagina',
      type: 'text',
      value: '<div><strong>Campo vetorial</strong><span>{{ALUNO_NOME}}</span></div>',
      x: 76,
      y: 1_523,
      width: 500,
      height: 100,
      style: { fontSize: '10px', border: '1px solid #94a3b8' },
    }],
    ...overrides,
  },
  watermark: {
    watermarkUrl: ONE_PIXEL_PNG,
    watermarkOpacity: 1,
    watermarkRotate: false,
  },
  polo: {
    nome: 'INSTITUIÇÃO VIVA QUE NÃO PODE VAZAR',
    cnpj: '00.000.000/0000-00',
    cidade: 'CIDADE EXEMPLO',
    uf: 'EX',
    logoUrl: ONE_PIXEL_PNG,
  },
  academicData: null,
  certificate: null,
});

export const makeSource = (index: number, preview = makePreview()): EmissionPdfSource => ({
  emission: makeEmission(index),
  preview,
});

export const makeBoletimSource = (): EmissionPdfSource => {
  const emission = makeEmission(99);
  emission.documento = 'boletim';
  emission.periodo_referencia = 'modulo-exemplo';
  emission.validacao_publica = true;
  emission.dados_emissao = {
    ...emission.dados_emissao,
    enrollmentDate: '2026-01-10',
    enrollmentStatus: 'ATIVO',
    institutionSnapshot: {
      nome: 'INSTITUIÇÃO DE TESTE',
      nomeFantasia: 'INSTITUIÇÃO DE TESTE',
      cnpj: '00.000.000/0000-00',
      endereco: 'ENDEREÇO INSTITUCIONAL DE TESTE',
      numero: '0',
      bairro: 'BAIRRO DE TESTE',
      cidade: 'CIDADE DE TESTE',
      uf: 'EX',
      cep: '00000-000',
      telefone: '(00) 00000-0000',
      email: 'documento@example.invalid',
      is_matriz: true,
      logoUrl: null,
    },
    watermarkSnapshot: {
      watermarkUrl: null,
      watermarkOpacity: 0.07,
      watermarkScale: 50,
      watermarkRotate: true,
      label: 'INSTITUIÇÃO DE TESTE',
    },
  };

  const componentes = [
    ['Relações Humanas no Trabalho', 20, 9, 100, 'Aprovado'],
    ['Informática Básica', 30, 10, 100, 'Aprovado'],
    ['História da Enfermagem', 30, 9.1, 100, 'Aprovado'],
    ['Anatomia e Fisiologia Humana', 80, null, null, 'Sem lançamento'],
    ['Princípios de Nutrição e Dietética', 30, 8, 100, 'Aprovado'],
    ['Microbiologia, Parasitologia e Patologia', 40, 9, 100, 'Aprovado'],
    ['Noções de Primeiros Socorros', 40, 9, 100, 'Aprovado'],
  ].map(([discipline, cargaHoraria, nota, frequencia, situacao], index) => ({
    moduleId: 'modulo-exemplo',
    moduleName: 'MÓDULO I - AMBIENTAÇÃO PROFISSIONAL',
    moduleOrder: 1,
    disciplineOrder: index + 1,
    discipline: String(discipline),
    cargaHoraria: Number(cargaHoraria),
    nota: nota === null ? null : Number(nota),
    frequencia: frequencia === null ? null : Number(frequencia),
    situacao: String(situacao),
  }));

  return {
    emission,
    preview: {
      template: {
        pageCount: 1,
        textContent: '<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p>Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>',
        absoluteFields: [{
          id: 'boletim_qr',
          type: 'qrcode',
          value: '',
          x: 660,
          y: 780,
          width: 92,
          height: 122,
        }, {
          id: 'boletim_data',
          type: 'text',
          value: 'Emitido em {{DATA_ATUAL}}',
          x: 455,
          y: 875,
          width: 190,
          height: 32,
          style: { textAlign: 'right', fontWeight: 'bold', fontSize: '12px' },
        }, {
          id: 'boletim_assinatura',
          type: 'text',
          value: '___________________________________________\nSecretaria Acadêmica',
          x: 235,
          y: 930,
          width: 325,
          height: 80,
          style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' },
        }],
      },
      watermark: null,
      polo: null,
      academicData: {
        componentes,
        componentesTable: '',
        historicoTable: '',
        cargaHorariaCumprida: 190,
        cargaHorariaTotal: 270,
        periodoCurso: '10/01/2026 até 10/12/2026',
        observacoesHistorico: '',
        situacaoAcademica: 'ATIVO(A)',
        mediaGeral: 9,
        frequenciaGeral: 100,
        inicioCurso: '2026-01-10',
        fimCurso: '2026-12-10',
        courseArea: 'Saúde',
        courseTechnologicalAxis: 'Ambiente e Saúde',
        courseProfessionalProfile: '',
        moduleNames: ['MÓDULO I - AMBIENTAÇÃO PROFISSIONAL'],
      },
      certificate: null,
    },
  };
};

