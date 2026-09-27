import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { createPdvReceiptPdf } from './pdv-receipt.pdf';
import { createPdvReceiptPreview } from './pdv-receipt-preview';
import { printPreparedPdvReceipt } from './pdv-receipt.service';
import type { PdvReceipt, PreparedPdvReceipt } from './pdv-receipt.types';

const sample = (): PdvReceipt => {
  const receipt = createPdvReceiptPreview({ version: 1, widthMm: 80, marginMm: 3,
    fontSize: 9, showLogo: false, footer: 'Obrigado pela confiança.', source: 'DEFAULT' });
  return { ...receipt, issuer: { ...receipt.issuer, logoUrl: null } };
};
const prepared = (): PreparedPdvReceipt => ({ receipt: sample(), workstationId: null,
  blob: new Blob(['%PDF-fixture'], { type: 'application/pdf' }), fileName: 'recibo.pdf' });

test('recibo vetorial respeita ambas as larguras e não altera dados canônicos', async () => {
  for (const widthMm of [58, 80] as const) {
    const receipt = sample(); receipt.template.widthMm = widthMm;
    const snapshot = JSON.stringify(receipt);
    const result = await createPdvReceiptPdf(receipt, { logo: null });
    const doc = await PDFDocument.load(await result.blob.arrayBuffer());
    assert.equal(doc.getPageCount(), 1);
    assert.ok(Math.abs(doc.getPage(0).getWidth() - widthMm * 72 / 25.4) < 0.01);
    assert.equal(JSON.stringify(receipt), snapshot);
    assert.equal(result.blob.type, 'application/pdf');
  }
});

test('cupom imprime documento identificado e matrícula canônica somente quando fornecida', async () => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const widthMm of [58, 80] as const) {
    for (const payer of [
      { name: 'ALUNO DE EXEMPLO', documentLabel: 'CPF' as const,
        documentMasked: '12*.***.**9-01', enrollmentNumber: 'UNIV-A-00000001' },
      { name: 'EMPRESA DE EXEMPLO', documentLabel: 'CNPJ' as const,
        documentMasked: '12.***.***/***9-01', enrollmentNumber: null },
      { name: 'PARCEIRO SEM DOCUMENTO', documentLabel: 'Documento' as const,
        documentMasked: null, enrollmentNumber: null },
    ]) {
      const receipt = sample(); receipt.template.widthMm = widthMm; receipt.payer = payer;
      const snapshot = JSON.stringify(receipt);
      const { blob } = await createPdvReceiptPdf(receipt, { logo: null });
      const loading = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
      const pdf = await loading.promise;
      try {
        assert.equal(pdf.numPages, 1);
        const content = await (await pdf.getPage(1)).getTextContent();
        const text = content.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ').replace(/\s+/g, ' ');
        assert.ok(text.includes(payer.name));
        if (payer.documentMasked) assert.ok(text.includes(`${payer.documentLabel}: ${payer.documentMasked}`), text);
        else assert.doesNotMatch(text, /(?:CPF|CNPJ|Documento):/);
        if (payer.enrollmentNumber) assert.ok(text.includes(`Matrícula: ${payer.enrollmentNumber}`));
        else assert.doesNotMatch(text, /Matrícula:/);
        assert.ok(text.includes(receipt.totalDisplay));
        assert.equal(JSON.stringify(receipt), snapshot);
      } finally { await pdf.destroy(); }
    }
  }
});

test('modelo personalizado altera apresentação e asset obrigatório ausente falha explicitamente', async () => {
  const original = sample();
  const custom = globalThis.structuredClone(original);
  custom.template.fontSize = 12;
  custom.template.marginMm = 6;
  custom.template.footer = 'Texto personalizado '.repeat(15);
  const a = await createPdvReceiptPdf(original, { logo: null });
  const b = await createPdvReceiptPdf(custom, { logo: null });
  const height = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPage(0).getHeight();
  assert.ok(await height(b.blob) > await height(a.blob));
  custom.template.showLogo = true;
  custom.issuer.logoUrl = 'https://invalid.example/logo.png';
  await assert.rejects(createPdvReceiptPdf(custom, { logo: null }), /Logo configurada/);
  await assert.rejects(createPdvReceiptPdf({ ...original, totalCents: 0 }), /comprovante de pagamento válido/);
});


test('recibo térmico ignora a marca d’água institucional sem alterar o snapshot', async () => {
  for (const widthMm of [58, 80] as const) {
    const receipt = sample(); receipt.template.widthMm = widthMm;
    receipt.issuer.watermarkUrl = 'https://invalid.example/fundo-institucional.png';
    const snapshot = JSON.stringify(receipt);
    // Sem assets fornecidos: uma tentativa de buscar a marca faria a geração falhar.
    const result = await createPdvReceiptPdf(receipt);
    const doc = await PDFDocument.load(await result.blob.arrayBuffer());
    const resources = doc.getPage(0).node.Resources();
    assert.equal(resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0, 0);
    assert.equal(JSON.stringify(receipt), snapshot);
  }
});

function scenario(options: { claimReplay?: boolean; printFails?: boolean; ackFails?: boolean; jobFails?: boolean } = {}) {
  const receipt = prepared(); const calls: string[] = []; let prints = 0;
  const io = {
    requestId: () => 'unique-request',
    rpc: async <T>(name: string): Promise<T> => {
      calls.push(name);
      if (name === 'prepare_pdv_print_job') {
        if (options.jobFails) throw new Error('Acesso negado');
        return { id: 'job', canDispatch: true, receipt: receipt.receipt, transport: 'BROWSER' } as T;
      }
      if (name === 'claim_pdv_print_job') return { id: 'job', status: 'CLAIMED',
        canDispatch: !options.claimReplay, token: options.claimReplay ? undefined : 'opaque-token' } as T;
      if (options.ackFails) throw new Error('Resultado indisponível');
      return { status: 'DIALOG_CLOSED' } as T;
    },
    print: async (blob: Blob) => {
      assert.equal(blob, receipt.blob, 'impressão deve usar o Blob já apresentado');
      prints += 1;
      if (options.printFails) throw new Error('Resposta da impressora perdida');
    },
  };
  return { receipt, io, calls, prints: () => prints };
}

test('impressão requer autorização e primeiro claim antes de entregar o mesmo Blob', async () => {
  const s = scenario();
  assert.equal(await printPreparedPdvReceipt(s.receipt, {}, s.io), 'DIALOG_OPENED');
  assert.equal(s.prints(), 1);
  assert.deepEqual(s.calls, ['prepare_pdv_print_job', 'claim_pdv_print_job', 'complete_pdv_print_job']);
  const denied = scenario({ jobFails: true });
  await assert.rejects(printPreparedPdvReceipt(denied.receipt, {}, denied.io), /Acesso negado/);
  assert.equal(denied.prints(), 0);
});

test('replay, resultado perdido e transporte não pronto não repetem a impressão', async () => {
  for (const config of [{ claimReplay: true }, { printFails: true }, { ackFails: true }]) {
    const s = scenario(config);
    assert.equal(await printPreparedPdvReceipt(s.receipt, {}, s.io), 'UNKNOWN');
    assert.equal(s.prints(), config.claimReplay ? 0 : 1);
  }
  const s = scenario();
  await assert.rejects(printPreparedPdvReceipt(s.receipt, { automatic: true }, s.io), /configurar e testar/);
  assert.equal(s.calls.length, 0);
});
