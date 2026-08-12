import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildPatrimonioExportPages,
  buildPatrimonioExportPdf,
  createPatrimonioExportPdfDocument,
  inspectPatrimonioExportPdfOperatorsForTest,
  PATRIMONIO_EXPORT_PDF_PIPELINE,
} from './patrimonio-export.pdf';
import type { PatrimonioItem } from './patrimonio.types';

const item = (index: number): PatrimonioItem => ({
  id: `patrimonio-${index}`,
  poloId: 'polo-1',
  dataAquisicao: '2026-08-10',
  tipoProduto: 'Eletrônico',
  descricao: `Notebook ${index + 1}`,
  status: index === 2 ? 'baixado' : 'ativo',
  quantidadeOriginal: 1,
  quantidadeBaixada: index === 2 ? 1 : 0,
  quantidadeDisponivel: index === 2 ? 0 : 1,
  valorUnitario: '500.00',
  valorTotalOriginal: '500.00',
  valorDisponivel: index === 2 ? '0.00' : '500.00',
  numeroSerie: `SN-${index + 1}`,
  canEdit: true,
  canEditEconomicFields: true,
  canWriteOff: true,
  canDelete: true,
  updatedAt: '2026-08-10T20:00:00.000Z',
});

const getLogoDataUrl = async () => {
  const file = await readFile(resolve('public/LogoUniverso.png'));
  return `data:image/png;base64,${file.toString('base64')}`;
};

test('pagina todos os patrimônios sem perda ou duplicação', () => {
  const items = Array.from({ length: 27 }, (_, index) => item(index));
  const pages = buildPatrimonioExportPages(items);
  assert.deepEqual(pages.map((page) => page.length), [10, 15, 2]);
  assert.deepEqual(
    pages.flatMap((page) => page.map((entry) => entry.id)),
    items.map((entry) => entry.id),
  );
});

test('gera PDF de patrimônio com texto vetorial, cabeçalho canônico e marca em paisagem', async () => {
  const logoDataUrl = await getLogoDataUrl();
  const items = Array.from({ length: 11 }, (_, index) => item(index));
  const pdf = await createPatrimonioExportPdfDocument({
    items,
    issuedAt: new Date('2026-08-10T20:00:00.000Z'),
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
      logoUrl: logoDataUrl,
      tipo: 'Matriz',
    },
    polo: {
      nomeFantasia: 'Universo Cursos e Consultoria',
      logoUrl: logoDataUrl,
      landscapeWatermarkUrl: logoDataUrl,
      landscapeWatermarkOpacity: 0.1,
      landscapeWatermarkScale: 55,
      landscapeWatermarkRotate: true,
      is_matriz: true,
    },
  });
  const pages = inspectPatrimonioExportPdfOperatorsForTest(pdf);
  const source = pdf.output();

  assert.equal(PATRIMONIO_EXPORT_PDF_PIPELINE, 'native-vector');
  assert.equal(pages.length, 2);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 2));
  assert.match(source, /Notebook 1/);
  assert.match(source, /Notebook 11/);
  assert.match(source, /universo\.cursoseconsultoria@gmail\.com/);
  assert.doesNotMatch(source, /\b3\s+Tr\b/);

  if (process.env.PATRIMONIO_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.PATRIMONIO_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('entrega um Blob PDF para a mesma prévia, download e impressão', async () => {
  const blob = await buildPatrimonioExportPdf({
    items: [item(0)],
    issuedAt: new Date('2026-08-10T20:00:00.000Z'),
  });

  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 0);
});
