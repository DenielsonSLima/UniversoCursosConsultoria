import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { TextDecoder } from 'node:util';

import {
  createEmissionDocumentsPdf,
  emissionHtmlToVectorText,
  getRegistrationWatermarkGeometry,
  resolveRegistrationSnapshotTemplate,
  type EmissionPdfSource,
} from './emission-document.pdf';
import type { EmissionLog, PreviewResources } from './historico-emissoes.types';
import { repairFichaVoterGrid } from '../../cadastros/ficha-matricula/voter-template-repair';
import { stripRedundantPastaFooter } from '../../cadastros/ficha-matricula/pasta-template-geometry';

const PAGE_BREAK = '<div data-page-break="true"></div>';
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const extractPdfText = async (blob: Blob) => {
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
const REAL_DOCUMENTS_GRID = `
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

const REAL_LEGACY_FICHA_DOCUMENTS_GRID = `
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

const makeEmission = (index: number): EmissionLog => ({
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

const makePreview = (overrides: Record<string, unknown> = {}): PreviewResources => ({
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

const makeSource = (index: number, preview = makePreview()): EmissionPdfSource => ({
  emission: makeEmission(index),
  preview,
});

const makeBoletimSource = (): EmissionPdfSource => {
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

test('texto HTML vira objetos textuais sem carregar marcação ou script', () => {
  assert.equal(
    emissionHtmlToVectorText('<section><strong>Nome</strong><span>Pessoa Exemplo</span><script>falha()</script></section>'),
    'Nome: Pessoa Exemplo',
  );
});

test('documentos oficiais reutilizam o cabeçalho institucional compartilhado', async () => {
  const [exporter, canonicalHeader] = await Promise.all([
    readFile(new URL('./emission-document.pdf.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/canonical-institutional-header-pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(exporter, /drawCanonicalInstitutionalHeader/);
  assert.doesNotMatch(exporter, /const\s+draw(?:Institution|Institutional)Header\s*=/);
  assert.match(canonicalHeader, /PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT/);
  assert.match(canonicalHeader, /LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT/);
  assert.match(canonicalHeader, /institution\.unitLabel\.toUpperCase\(\)/);
  assert.match(canonicalHeader, /CANONICAL_INSTITUTIONAL_HEADER_LEGACY_LABELS/);
  assert.match(canonicalHeader, /["']CNPJ["']/);
  assert.match(canonicalHeader, /["']Contato["']/);
  assert.match(canonicalHeader, /["']Endereço["']/);
  assert.match(canonicalHeader, /["']Email["']/);
});

test('fixture reproduz os 10 blocos visuais oficiais de Documentos em 92px', () => {
  assert.match(REAL_DOCUMENTS_GRID, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.match(REAL_DOCUMENTS_GRID, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  const dataCells = (REAL_DOCUMENTS_GRID.match(/<strong>/g) || []).length;
  assert.equal(dataCells, 9);
  assert.equal(dataCells + 1, 10, 'cabeçalho Documentos + nove células canônicas');
  const field = (makePreview().template as { absoluteFields: Array<{ id: string; height: number }> })
    .absoluteFields.find((item) => item.id === 'ficha_documentos');
  assert.equal(field?.height, 92);
});

test('fixture real legada 4x2 é reparada e gera PDF sem overflow', async () => {
  const repaired = repairFichaVoterGrid(REAL_LEGACY_FICHA_DOCUMENTS_GRID);
  assert.match(repaired, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.match(repaired, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((repaired.match(/<strong\b/g) || []).length, 9);

  const preview = makePreview();
  const template = preview.template as { absoluteFields: Array<{ id: string; value: string }> };
  const documentField = template.absoluteFields.find((field) => field.id === 'ficha_documentos');
  assert.ok(documentField);
  documentField.value = repaired;

  const pdf = await createEmissionDocumentsPdf([makeSource(1, preview)]);
  assert.ok(pdf.blob.size > 1_000);
});

test('compositor repara snapshot legado e quebra o código completo abaixo do QR', async () => {
  const validationCode = 'FICHA-MAT-D278-1719-6ABC-9XYZ';
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_documentos',
      type: 'text',
      value: REAL_LEGACY_FICHA_DOCUMENTS_GRID,
      x: 76,
      y: 622,
      width: 642,
      height: 92,
      style: { fontSize: '10px' },
    }, {
      id: 'ficha_qr_regressao',
      type: 'qrcode',
      value: '',
      x: 611,
      y: 929,
      width: 100,
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  source.emission.codigo = validationCode;
  source.emission.validacao_publica = true;
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    studentVoterId: '123456789012',
    studentVoterZone: '987',
    studentVoterSection: '6543',
    studentVoterIssueDate: '2024-03-04',
    studentVoterState: 'AL',
  };

  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);
  const compactText = text.replace(/\s/g, '');

  assert.match(text, /ZONA/i);
  assert.match(text, /SEÇÃO/i);
  assert.match(text, /EMISSÃO \/ UF/i);
  assert.match(text, /987/);
  assert.match(text, /6543/);
  assert.match(text, /04\/03\/2024 \/ AL/);
  assert.ok(compactText.includes(validationCode), 'o código completo deve sobreviver às quebras de linha');
  assert.doesNotMatch(text, /…|\.\.\./);

  const outputPath = process.env.SECRETARIA_FICHA_QR_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('Pasta legada usa a mesma grade eleitoral completa da Ficha', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'pasta_documentos',
      type: 'text',
      value: REAL_LEGACY_FICHA_DOCUMENTS_GRID,
      x: 76,
      y: 690,
      width: 642,
      height: 92,
      style: { fontSize: '10px' },
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(2, preview);
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    studentVoterId: '123456789012',
    studentVoterZone: '987',
    studentVoterSection: '6543',
    studentVoterIssueDate: '2024-03-04',
    studentVoterState: 'AL',
  };

  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);

  assert.match(text, /ZONA/i);
  assert.match(text, /SEÇÃO/i);
  assert.match(text, /EMISSÃO \/ UF/i);
  assert.match(text, /987/);
  assert.match(text, /6543/);
  assert.match(text, /04\/03\/2024 \/ AL/);

  const outputPath = process.env.SECRETARIA_PASTA_VOTER_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('assinaturas da Ficha preservam linhas vetoriais e rótulos centralizados', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_assinaturas',
      type: 'text',
      value: '{{FICHA_ASSINATURAS}}',
      x: 76,
      y: 946,
      width: 642,
      height: 42,
      style: { fontSize: '10px' },
    }],
    enrollmentFormRequiresSignature: true,
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  const resolved = resolveRegistrationSnapshotTemplate(
    '{{FICHA_ASSINATURAS}}',
    source.emission,
    source.preview,
  );

  assert.match(resolved, /display:grid/i);
  assert.match(resolved, /border-top:1px solid #0f172a/i);
  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);
  assert.match(text, /ASSINATURA DO ALUNO OU RESPONSÁVEL/i);
  assert.match(text, /DEFERIMENTO DA DIRETORIA/i);

  const outputPath = process.env.SECRETARIA_FICHA_SIGNATURE_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('código de QR maior que a área reservada falha em vez de truncar', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_qr_sem_altura',
      type: 'qrcode',
      value: '',
      x: 611,
      y: 929,
      width: 60,
      height: 80,
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  source.emission.codigo = `FICHA-MAT-${'CODIGO-MUITO-LONGO-'.repeat(8)}`;
  source.emission.validacao_publica = true;

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /código de validação.+ultrapassa a área canônica/i,
  );
});

test('snapshot legado da Pasta remove somente o rodapé institucional duplicado', async () => {
  const legacyFooter = {
    id: 'pasta_rodape',
    type: 'text',
    value: `
      <section style="padding:5px 8px;text-align:center;">
        <strong>{{POLO_NOME}}</strong><span> • CNPJ {{POLO_CNPJ}}</span><br>
        <span>{{POLO_ENDERECO_COMPLETO}}</span><br>
        <span>Telefone: {{POLO_TELEFONE}} • E-mail: {{POLO_EMAIL}}</span>
      </section>
    `,
    x: 76,
    y: 1013,
    width: 642,
    style: { fontSize: '10px' },
  };
  const legacyTemplate = {
    v: 9,
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [legacyFooter],
  };
  const source = makeSource(2, makePreview(legacyTemplate));
  source.emission.documento = 'pasta_identificacao';

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /pasta_rodape.*ultrapassa a área canônica da página/,
  );

  const stripped = stripRedundantPastaFooter(legacyTemplate);
  assert.notEqual(stripped, legacyTemplate);
  assert.equal(legacyFooter.y, 1013, 'o snapshot persistido não pode ser mutado');
  assert.equal(legacyTemplate.absoluteFields.length, 1);
  assert.equal(stripped.absoluteFields.length, 0);

  source.preview.template = stripped;
  const pdf = await createEmissionDocumentsPdf([source]);
  assert.ok(pdf.blob.size > 1_000);
  const text = await extractPdfText(pdf.blob);
  assert.equal(
    text.match(/INSTITUIÇÃO CONGELADA DE EXEMPLO/g)?.length,
    1,
    'a identidade institucional deve aparecer somente no cabeçalho canônico',
  );

  if (process.env.SECRETARIA_PASTA_FOOTER_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.SECRETARIA_PASTA_FOOTER_PDF_FIXTURE_OUTPUT,
      new Uint8Array(await pdf.blob.arrayBuffer()),
    );
  }
});

test('modelo v13 da Pasta remove o rodapé canônico que repete o cabeçalho', async () => {
  const template = {
    v: 13,
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'pasta_rodape',
      type: 'text',
      value: `
        <section style="padding:5px 8px;text-align:center;">
          <strong>{{POLO_NOME}}</strong><span> • CNPJ {{POLO_CNPJ}}</span><br>
          <span>{{POLO_ENDERECO_COMPLETO}}</span><br>
          <span>Telefone: {{POLO_TELEFONE}} • E-mail: {{POLO_EMAIL}}</span>
        </section>
      `,
      x: 76,
      y: 930,
      width: 642,
      height: 100,
      style: { fontSize: '10px' },
    }],
  };
  const source = makeSource(2, makePreview(template));
  source.emission.documento = 'pasta_identificacao';
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    institutionSnapshot: {
      nome: 'INSTITUIÇÃO EDUCACIONAL DE EXEMPLO COM RAZÃO SOCIAL EXTENSA',
      nomeFantasia: 'INSTITUIÇÃO EDUCACIONAL DE EXEMPLO',
      cnpj: '00.000.000/0000-00',
      endereco: 'AVENIDA INSTITUCIONAL DE EXEMPLO COM DENOMINAÇÃO PROPOSITALMENTE EXTENSA',
      numero: '1000',
      complemento: 'BLOCO ADMINISTRATIVO',
      bairro: 'BAIRRO DE EXEMPLO',
      cidade: 'CIDADE DE EXEMPLO',
      uf: 'EX',
      cep: '00000-000',
      telefone: '(00) 00000-0000 / (00) 0000-0000',
      email: 'secretaria.documentos.institucionais@example.invalid',
      logoUrl: null,
    },
  };

  const stripped = stripRedundantPastaFooter(template);
  assert.notEqual(stripped, template);
  assert.equal(template.absoluteFields.length, 1, 'o snapshot original deve permanecer intacto');
  assert.equal(stripped.absoluteFields.length, 0);
  source.preview.template = stripped;
  const pdf = await createEmissionDocumentsPdf([source]);
  assert.ok(pdf.blob.size > 1_000);
  const text = await extractPdfText(pdf.blob);
  assert.equal(
    text.match(/INSTITUIÇÃO EDUCACIONAL DE EXEMPLO/g)?.length,
    1,
    'o rodapé não deve repetir o nome institucional do cabeçalho',
  );
});

test('rodapé personalizado da Pasta não é removido pela compatibilidade', () => {
  const template = {
    v: 13,
    absoluteFields: [{
      id: 'pasta_rodape',
      type: 'text',
      value: '<p>Texto personalizado que não repete o cabeçalho.</p>',
      x: 76,
      y: 930,
      width: 642,
      height: 100,
    }],
  };

  assert.equal(stripRedundantPastaFooter(template), template);
});

test('marca congelada respeita escala não padrão em geometria A4 canônica', () => {
  const geometry = getRegistrationWatermarkGeometry(37);
  assert.equal(geometry.scale, 37);
  assert.equal(geometry.width, 77.7);
  assert.equal(geometry.height, 109.89);
  assert.equal(geometry.x, 66.15);
  assert.equal(geometry.y, 93.555);
  assert.notEqual(geometry.width, getRegistrationWatermarkGeometry(50).width);
});

test('segunda via preserva campos eleitorais vazios do snapshot sem ler cadastro vivo', () => {
  const emission = makeEmission(1);
  emission.dados_emissao = {
    ...emission.dados_emissao,
    studentVoterId: '',
    studentVoterZone: '',
    studentVoterSection: '',
    studentVoterIssueDate: '',
    studentVoterState: '',
  };
  emission.aluno = {
    id: emission.aluno_id,
    nome: 'PESSOA EXEMPLO',
    cpf_cnpj: '00000000000',
    titulo_eleitor: 'DADO-VIVO-INDEVIDO',
    titulo_eleitor_zona: '999',
    titulo_eleitor_secao: '8888',
    titulo_eleitor_data_emissao: '2026-01-01',
    titulo_eleitor_uf: 'AL',
  };

  const rendered = resolveRegistrationSnapshotTemplate(
    '{{ALUNO_TITULO_ELEITOR}}|{{ALUNO_TITULO_ZONA}}|{{ALUNO_TITULO_SECAO}}|{{ALUNO_TITULO_EMISSAO}}|{{ALUNO_TITULO_UF}}',
    emission,
    makePreview(),
  );
  assert.equal(rendered, '|||—|');
  assert.doesNotMatch(rendered, /DADO-VIVO-INDEVIDO|999|8888|2026|AL/);
});

test('snapshot por presença impede vazamento de qualquer dado oficial vivo', () => {
  const emission = makeEmission(1);
  emission.dados_emissao = {
    ...emission.dados_emissao,
    studentName: '',
    studentCpf: '',
    studentRg: '',
    studentBirthDate: '',
    studentMotherName: '',
    enrollmentStatus: '',
  };
  emission.aluno = {
    id: emission.aluno_id,
    nome: 'NOME VIVO INDEVIDO',
    cpf_cnpj: '11111111111',
    rg: 'RG-VIVO-INDEVIDO',
    data_nascimento: '1999-01-01',
    nome_mae: 'MÃE VIVA INDEVIDA',
  };
  emission.matricula = {
    id: emission.matricula_id,
    status: 'STATUS-VIVO-INDEVIDO',
  };

  const rendered = resolveRegistrationSnapshotTemplate(
    '{{ALUNO_NOME}}|{{ALUNO_CPF}}|{{ALUNO_RG}}|{{ALUNO_NASCIMENTO}}|{{ALUNO_MAE}}|{{MATRICULA_STATUS}}|{{POLO_NOME}}',
    emission,
    makePreview(),
  );
  assert.equal(rendered, '|||—|||INSTITUIÇÃO CONGELADA DE EXEMPLO');
  assert.doesNotMatch(rendered, /VIVO|111\.111|1999/);
});

test('lote representativo gera um único PDF vetorial multipágina e selecionável', async () => {
  const progress: number[] = [];
  const sources = Array.from({ length: 12 }, (_, index) => makeSource(index + 1));
  const result = await createEmissionDocumentsPdf(sources, {
    onProgress: ({ current }) => progress.push(current),
  });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const latin1 = new TextDecoder('latin1').decode(bytes);

  assert.match(latin1.slice(0, 8), /^%PDF-/);
  assert.ok(result.blob.size > 10_000);
  assert.equal(progress.at(-1), 12);
  assert.ok((latin1.match(/\/Type\s*\/Page\b/g) || []).length >= 24);
  assert.match(latin1, /\/Subtype\s*\/Image/);
  assert.doesNotMatch(latin1, /\/Width\s+(?:595|794)\b[\s\S]*?\/Height\s+(?:842|1123)\b/);

  if (process.env.SECRETARIA_REGISTRATION_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.SECRETARIA_REGISTRATION_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('boletim com sete componentes reserva o rodapé e gera tabela totalmente vetorial', async () => {
  const result = await createEmissionDocumentsPdf([makeBoletimSource()]);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const latin1 = new TextDecoder('latin1').decode(bytes);

  assert.match(latin1.slice(0, 8), /^%PDF-/);
  assert.ok(result.blob.size > 5_000);
  assert.doesNotMatch(latin1, /\/Width\s+(?:595|794)\b[\s\S]*?\/Height\s+(?:842|1123)\b/);

  if (process.env.SECRETARIA_BOLETIM_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.SECRETARIA_BOLETIM_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('boletim bloqueia explicitamente uma tabela maior do que a área segura', async () => {
  const source = makeBoletimSource();
  const academicData = source.preview.academicData;
  assert.ok(academicData);
  const example = academicData.componentes[0];
  academicData.componentes = Array.from({ length: 30 }, (_, index) => ({
    ...example,
    disciplineOrder: index + 1,
    discipline: `Componente curricular de exemplo ${index + 1}`,
  }));

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /tabela do boletim invade a faixa reservada/i,
  );
});

test('overflow e token residual falham sem inventar nova página', async () => {
  await assert.rejects(
    createEmissionDocumentsPdf([makeSource(1, makePreview({
      pageCount: 1,
      textContent: `<p>${'CONTEÚDO CANÔNICO '.repeat(2_000)}</p>`,
    }))]),
    /ultrapassa a área canônica da página/,
  );

  await assert.rejects(
    createEmissionDocumentsPdf([makeSource(2, makePreview({
      pageCount: 1,
      textContent: '<p>{{VARIAVEL_NAO_RESOLVIDA}}</p>',
    }))]),
    /variável não resolvida/,
  );
});

test('pipeline vetorial oficial não captura DOM nem rasteriza folha A4', async () => {
  const { readFile } = await import('node:fs/promises');
  const [compositor, issuedModal, historyPage, historyService, emissionService] = await Promise.all([
    readFile(new URL('./emission-document.pdf.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/SecretariaIssuedDocumentModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaHistoricoEmissoesPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./historico-emissoes.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/secretaria-documentos.service.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(compositor, /html2canvas|createElement\(['"]canvas|toDataURL\(/);
  assert.match(issuedModal, /isOfficialVectorDocument/);
  assert.match(issuedModal, /VectorIssuedDocumentModal/);
  assert.match(issuedModal, /CanonicalDocumentPreviewModal/);
  assert.match(historyPage, /isContractDocument\(selectedEmission\.documento\)[\s\S]*isOfficialVectorDocument\(selectedEmission\.documento\)/);
  assert.match(historyPage, /createContractHistoryPdf/);
  assert.match(historyPage, /frozen\.templateSnapshot/);
  assert.match(historyPage, /frozen\.contractSnapshot/);
  assert.match(historyPage, /frozen\.renderedDocument/);
  assert.match(historyPage, /await printPdfBlob\(pdfBlob/);
  assert.match(historyService, /hasSnapshotKey\(emission, 'institutionSnapshot'\)/);
  assert.match(historyService, /hasSnapshotKey\(emission, 'watermarkSnapshot'\)/);
  assert.match(emissionService, /O snapshot oficial de Pasta\/Ficha não pôde ser relido/);
});
