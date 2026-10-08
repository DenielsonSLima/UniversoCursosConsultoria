import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { jsPDF } from 'jspdf';
import { createContratosAlunoPdf } from '../contratos-aluno.pdf';
import { normalizeContractClosingPositions } from '../../../../shared/contrato-aluno/closing-positions';
import { drawContractClosing } from './closing';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';

const footer = [
  'Cidade de Teste, 08/10/2026.',
  'CONTRATANTE: Pessoa de Teste',
  'CONTRATADA: Instituição de Teste',
  'TESTEMUNHAS:',
  '1: ____________________',
  '2: ____________________',
].join('\n');

const customPositions = normalizeContractClosingPositions({
  version: 1,
  elements: {
    qr: { x: 165, y: 245, width: 25 },
    contratante: { x: 18, y: 240, width: 62 },
    contratada: { x: 90, y: 245, width: 62 },
    testemunha1: { x: 18, y: 262, width: 62 },
    testemunha2: { x: 100, y: 266, width: 62 },
  },
}, footer, true);

const fixture = (custom = false): ContratoAlunoPreparedDocument => ({
  emissionId: 'CON-ENCERRAMENTO-TESTE', documentId: null, title: 'Contrato de teste',
  targetName: 'Pessoa de Teste', validationCode: 'CON-TESTE', validationUrl: null,
  validUntil: null, fileUrl: null, statusLabel: null,
  renderPayload: {
    template: custom ? { layoutEncerramento: customPositions } : {},
    templateRevision: 1,
    snapshot: {
      instituicao: {
        nome: 'Instituição de Teste', presentationVersion: 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA',
      },
    },
    rendered: {
      kind: 'CONTRATO_ALUNO',
      pages: [
        { header: '', title: 'Contrato de prestação de serviços educacionais', body: 'CLÁUSULA 1ª - Conteúdo canônico inicial.', footer: '' },
        { header: '', title: 'Contrato de prestação de serviços educacionais', body: 'CLÁUSULA 2ª - Conteúdo canônico interno.', footer: '' },
        { header: '', title: 'Contrato de prestação de serviços educacionais', body: 'CLÁUSULA 3ª - Encerramento canônico.', footer },
      ],
      watermark: { enabled: true, label: 'TESTE', imageUrl: null, opacity: 0.08, scale: 60, rotate: true },
      qr: { enabled: true, label: 'Validar documento', validityLabel: 'Sem vencimento' },
      front: null, back: null,
    },
  },
});

test('as quatro assinaturas usam as coordenadas salvas e mantêm nomes acima das linhas', () => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const lines: number[][] = [];
  const texts: Array<{ text: unknown; x: number; y: number }> = [];
  const originalLine = pdf.line.bind(pdf);
  const originalText = pdf.text.bind(pdf);
  pdf.line = ((x1: number, y1: number, x2: number, y2: number) => {
    lines.push([x1, y1, x2, y2]);
    return originalLine(x1, y1, x2, y2);
  }) as typeof pdf.line;
  pdf.text = ((text: string | string[], x: number, y: number, options: unknown) => {
    texts.push({ text, x, y });
    return originalText(text, x, y, options as never);
  }) as typeof pdf.text;
  drawContractClosing(pdf, footer, true, customPositions);
  for (const id of ['contratante', 'contratada', 'testemunha1', 'testemunha2'] as const) {
    const position = customPositions.elements[id];
    assert.ok(lines.some((line) => JSON.stringify(line) === JSON.stringify([
      position.x, position.y + 5, position.x + position.width, position.y + 5,
    ])), id);
  }
  assert.ok(texts.some((entry) => String(entry.text) === 'Pessoa de Teste' && entry.y === 241));
  assert.ok(texts.some((entry) => String(entry.text) === 'Instituição de Teste' && entry.y === 246));
  assert.ok(!texts.some((entry) => /^(?:1|2)\s*[:).]?$/u.test(String(entry.text))));
  assert.ok(texts.some((entry) => String(entry.text) === 'TESTEMUNHA 1'));
  assert.ok(texts.some((entry) => String(entry.text) === 'TESTEMUNHA 2'));
});

test('o PDF oficial preserva snapshot e aceita posições padrão e personalizadas', async () => {
  for (const custom of [false, true]) {
    const document = fixture(custom);
    const before = structuredClone(document);
    const result = await createContratosAlunoPdf([document]);
    assert.ok(result.blob.size > 1000);
    assert.deepEqual(document, before);
    const output = process.env[custom ? 'CONTRACT_CUSTOM_CLOSING_PDF' : 'CONTRACT_DEFAULT_CLOSING_PDF'];
    if (output) await writeFile(output, new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test('posições inválidas no snapshot falham explicitamente antes de compor o contrato', async () => {
  const document = fixture(true);
  document.renderPayload!.template = {
    layoutEncerramento: { ...customPositions, elements: {
      ...customPositions.elements, qr: { x: 165, y: 280, width: 25 },
    } },
  };
  await assert.rejects(createContratosAlunoPdf([document]), /posicionamento.*inválido/u);
});
