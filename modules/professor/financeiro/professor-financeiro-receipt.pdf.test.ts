import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProfessorFinancialReceiptPayload } from './financeiro.types.ts';
import {
  createProfessorFinancialReceiptPdf,
  type ProfessorFinancialReceiptPreviewItem,
} from './professor-financeiro-receipt.pdf.ts';

const makePayload = (valuePaid: number): ProfessorFinancialReceiptPayload => ({
  model: {
    key: 'recibo',
    source: 'MODELO_RECIBO_PADRAO',
    revision: 1,
    orientation: 'portrait',
    documentKind: 'RECIBO_HONORARIOS_PROFESSOR',
  },
  receipt: {
    id: '00000000-0000-4000-8000-000000000001',
    receiptNumber: '00000000',
    title: 'Recibo de honorários',
    statusCode: 'PAGO',
    statusLabel: 'Pago',
    description: 'Honorários docentes de agosto',
    category: 'Honorários',
    beneficiaryName: 'Professor de Teste',
    valueExpected: 100,
    valuePaid,
    valueOutstanding: 0,
    dueDate: '2026-08-20',
    dueDateLabel: '20/08/2026',
    paidAt: '2026-08-22',
    paidAtLabel: '22/08/2026',
    paymentMethod: 'PIX',
    poloName: 'Polo Teste',
    poloLocation: 'Japoatã - SE',
    declaration: 'Declaramos que o pagamento de honorários foi efetuado ao Professor de Teste.',
    footerNote: 'Documento emitido automaticamente a partir da baixa financeira autorizada.',
    emittedAt: '2026-08-25T10:00:00-03:00',
    emittedAtLabel: '25/08/2026 10:00',
  },
  institution: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    address: 'Rua de Teste',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'Japoatã',
    state: 'SE',
    postalCode: '49950-000',
    phone: '(79) 0000-0000',
    email: 'universo.cursoseconsultoria@gmail.com',
    isHeadquarters: false,
    unitName: 'Polo Teste',
    logoUrl: null,
  },
  watermark: {
    enabled: true,
    label: 'Universo',
    imageUrl: null,
    opacity: 0.1,
    scale: 50,
    rotate: true,
    source: 'FALLBACK_MODELO_RECIBO',
  },
});

const makeItem = (valuePaid: number): ProfessorFinancialReceiptPreviewItem => {
  const payload = makePayload(valuePaid);
  return {
    emissionId: payload.receipt.id,
    title: payload.receipt.title,
    targetName: payload.receipt.beneficiaryName,
    validationCode: null,
    validationUrl: null,
    validUntil: null,
    renderPayload: null,
    receiptPayload: payload,
  };
};

const extractText = async (blob: Blob) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const document = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  await document.destroy();
  return pages.join('\n').replace(/\s+/g, ' ').trim();
};

test('recibo pago com valor_pago zero preserva R$ 0,00 sem fallback para o previsto', async () => {
  const result = await createProfessorFinancialReceiptPdf([makeItem(0)]);
  const text = await extractText(result.blob);

  assert.ok(result.blob.size > 1_000);
  assert.equal(result.fileName, 'recibo-honorarios-00000000.pdf');
  assert.match(text, /RECIBO DE HONORÁRIOS/i);
  assert.match(text, /R\$\s*0,00/);
  assert.doesNotMatch(text, /R\$\s*100,00/);
  assert.match(text, /Professor de Teste/);
  assert.match(text, /Emitido em 25\/08\/2026 10:00/);
});

test('recibo parcial usa exatamente o valor_pago canônico', async () => {
  const result = await createProfessorFinancialReceiptPdf([makeItem(40)]);
  const text = await extractText(result.blob);

  assert.match(text, /R\$\s*40,00/);
  assert.doesNotMatch(text, /R\$\s*100,00/);
  assert.match(text, /PIX/);
  assert.match(text, /20\/08\/2026/);
});
