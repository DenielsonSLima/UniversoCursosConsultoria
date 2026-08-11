import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildEmprestimosExportPages,
  buildEmprestimosExportPdf,
  createEmprestimosExportPdfDocument,
  EMPRESTIMOS_EXPORT_PDF_PIPELINE,
  inspectEmprestimosExportPdfOperatorsForTest,
  resolveEmprestimosLandscapeWatermark,
  resolveEmprestimosLandscapeWatermarkPlacement,
} from './emprestimos-export.pdf';
import type {
  EmprestimoFinanceiro,
  EmprestimosExportSnapshot,
} from './emprestimos.types';

const loan = (index: number): EmprestimoFinanceiro => ({
  id: `loan-${index}`,
  poloResponsavelId: 'polo-1',
  poloResponsavelNome: 'Matriz',
  poloResponsavelIsMatriz: true,
  rateioModo: 'TODOS',
  credorNome: 'Banco Exemplo',
  descricao: `Capital de giro ${index + 1}`,
  valorLiberado: 1_000,
  valorTotalDivida: 1_200,
  valorEncargos: 200,
  valorPago: index % 3 === 0 ? 1_200 : 0,
  valorPendente: index % 3 === 0 ? 0 : 1_200,
  dataLiberacao: '2026-08-11',
  contaCredito: {
    id: 'account-1',
    banco: 'Banco Exemplo',
    titular: 'Universo Cursos',
    agencia: '0001',
    conta: '12345-6',
    natureza: 'BANCARIA',
  },
  totalParcelas: 2,
  status: index % 3 === 0 ? 'QUITADO' : 'ATIVO',
  possuiBaixa: index % 3 === 0,
  rateioPoloIds: ['polo-1'],
  parcelas: [{
    id: `installment-${index}`,
    numero: 1,
    dataVencimento: '2026-09-11',
    valorPrincipal: 500,
    valorEncargos: 100,
    valorTotal: 600,
    status: index % 3 === 0 ? 'PAGO' : 'PENDENTE',
    rateios: [],
  }],
});

const getLogoDataUrl = async () => {
  const file = await readFile(resolve('public/LogoUniverso.png'));
  return `data:image/png;base64,${file.toString('base64')}`;
};

const snapshot = (items: EmprestimoFinanceiro[]): EmprestimosExportSnapshot => ({
  issuedAt: '2026-08-11T20:00:00.000Z',
  statusScope: 'ATIVOS',
  total: items.length,
  polo: {},
  company: {},
  items,
});

test('pagina contratos sem recalcular os valores retornados pelo backend', () => {
  const items = Array.from({ length: 14 }, (_, index) => loan(index));
  const pages = buildEmprestimosExportPages(items);

  assert.deepEqual(pages.map((page) => page.length), [7, 7]);
  assert.deepEqual(
    pages.flatMap((page) => page.map((item) => item.id)),
    items.map((item) => item.id),
  );
});

test('usa somente a marca d’água configurada para paisagem no relatório horizontal', () => {
  const landscape = resolveEmprestimosLandscapeWatermark({
    watermarkUrl: 'https://example.test/retrato.png',
    watermarkOpacity: 0.8,
    landscapeWatermarkUrl: 'https://example.test/paisagem.png',
    landscapeWatermarkOpacity: 0.12,
    landscapeWatermarkScale: 100,
    landscapeWatermarkRotate: false,
  });
  const withoutLandscape = resolveEmprestimosLandscapeWatermark({
    watermark_url: 'https://example.test/retrato.png',
  });

  assert.equal(landscape.imageUrl, 'https://example.test/paisagem.png');
  assert.equal(landscape.opacity, 0.12);
  assert.equal(landscape.scale, 100);
  assert.equal(landscape.rotate, false);
  assert.equal(withoutLandscape.imageUrl, null);
});

test('encaixa a arte A4 paisagem na folha inteira, sem a antiga caixa vertical', () => {
  const placement = resolveEmprestimosLandscapeWatermarkPlacement(3508, 2480, {
    scale: 100,
    rotate: false,
  });

  assert.ok(Math.abs(placement.x) < 0.05);
  assert.ok(Math.abs(placement.y) < 0.05);
  assert.ok(Math.abs(placement.width - 297) < 0.05);
  assert.ok(Math.abs(placement.height - 210) < 0.05);
  assert.equal(placement.rotation, 0);
});

test('gera PDF vetorial com cabeçalho, conta de crédito e parcelas canônicas', async () => {
  const logoDataUrl = await getLogoDataUrl();
  const report = snapshot(Array.from({ length: 10 }, (_, index) => loan(index)));
  report.company = {
    nomeFantasia: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    endereco: 'Rua C',
    numero: 'S/N',
    bairro: 'Centro',
    cidade: 'Japoatã',
    uf: 'SE',
    cep: '49950-000',
    telefone: '(79) 99861-7614',
    logoUrl: logoDataUrl,
  };
  report.polo = {
    nomeFantasia: 'Universo Cursos e Consultoria',
    logoUrl: logoDataUrl,
    watermarkUrl: logoDataUrl,
    watermarkOpacity: 0.08,
    is_matriz: true,
  };

  const pdf = await createEmprestimosExportPdfDocument({ snapshot: report });
  const operators = inspectEmprestimosExportPdfOperatorsForTest(pdf);
  const source = pdf.output();

  assert.equal(EMPRESTIMOS_EXPORT_PDF_PIPELINE, 'native-vector');
  assert.equal(operators.length, 2);
  assert.ok(operators.every((page) => page.hasTextOperator));
  assert.match(source, /Capital de giro 1/);
  assert.match(source, /Banco Exemplo/);
  assert.match(source, /12345-6/);
  assert.match(source, /universo\.cursoseconsultoria@gmail\.com/);
  assert.doesNotMatch(source, /html2canvas|dom-to-selectable-pdf/i);
});

test('entrega um Blob para a mesma prévia, download e impressão', async () => {
  const blob = await buildEmprestimosExportPdf({ snapshot: snapshot([loan(0)]) });
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 0);
});
