import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildFinancialReportPdf,
  createFinancialReportPdfDocument,
  financialReportValueToText,
  inspectFinancialReportPdfOperatorsForTest,
  FINANCIAL_REPORT_PDF_PIPELINE,
  type FinancialReportPdfInput,
} from './financial-report.vector-pdf';

const makeInput = (count = 26): FinancialReportPdfInput => ({
  title: 'Relatório de Receitas',
  subtitle: 'Receitas operacionais filtradas pelo contrato financeiro canônico.',
  rightTitle: 'Relatórios Financeiros',
  rightType: 'Receitas Operacionais',
  fileName: 'relatorio-receitas-2026-08-12',
  columns: [
    { label: 'Vencimento' },
    { label: 'Descrição / contraparte' },
    { label: 'Categoria' },
    { label: 'Previsto', align: 'right' },
    { label: 'Realizado', align: 'right' },
  ],
  rows: Array.from({ length: count }, (_, index) => ({
    id: `receipt-${index + 1}`,
    cells: [
      `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
      `Receita ${index + 1} da matrícula do aluno ${index + 1}`,
      'Mensalidade',
      'R$ 99,90',
      index % 2 === 0 ? 'R$ 99,90' : '—',
    ],
  })),
  filters: [
    { label: 'Período', value: '01/08/2026 a 31/08/2026' },
    { label: 'Escopo', value: 'Matriz' },
    { label: 'Situação', value: 'Ativos' },
  ],
  summaryCards: [
    { label: 'Total previsto', value: 'R$ 2.597,40', tone: 'slate' },
    { label: 'Total realizado', value: 'R$ 1.298,70', tone: 'emerald' },
  ],
  footerNote: 'Valores e saldos são calculados pelo contrato financeiro canônico.',
  recordLabel: 'lançamentos',
  tone: 'emerald',
  issuedAt: new Date('2026-08-12T15:00:00.000Z'),
  company: {
    nomeFantasia: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    endereco: 'Rua C',
    numero: 'S/N',
    bairro: 'Centro',
    cidade: 'Japoatã',
    uf: 'SE',
    cep: '49950-000',
    telefone: '(79) 99861-7614',
    tipo: 'Matriz',
  },
});

test('normaliza células React em texto selecionável antes da composição', () => {
  assert.equal(financialReportValueToText(['Receita ', 42, '  confirmada']), 'Receita 42 confirmada');
  assert.equal(financialReportValueToText(null), '');
});

test('gera relatório financeiro vetorial paginado, com texto e sem imagem de página', async () => {
  const pdf = await createFinancialReportPdfDocument(makeInput());
  const pages = inspectFinancialReportPdfOperatorsForTest(pdf);
  const source = pdf.output();

  assert.equal(FINANCIAL_REPORT_PDF_PIPELINE, 'native-vector');
  assert.ok(pages.length >= 2);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 0));
  assert.match(source, /Receita 1/);
  assert.match(source, /Receita 26/);
  assert.match(source, /CONTINUA/);
  assert.doesNotMatch(source, /html2canvas|financeiro-report-page/i);

  if (process.env.FINANCIAL_REPORT_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.FINANCIAL_REPORT_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('falha explicitamente antes de desenhar uma linha que não cabe na A4', async () => {
  const input = makeInput(1);
  input.rows[0].cells[1] = 'Detalhamento operacional muito longo '.repeat(600);

  await assert.rejects(
    () => createFinancialReportPdfDocument(input),
    /registro receipt-1 é longo demais para caber integralmente em uma página A4/i,
  );
});

test('entrega Blob PDF para a mesma prévia, download e impressão', async () => {
  const blob = await buildFinancialReportPdf(makeInput(1));
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 0);
});
