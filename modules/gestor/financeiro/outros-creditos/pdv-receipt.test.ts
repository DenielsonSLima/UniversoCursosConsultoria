import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
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
    const result = await createPdvReceiptPdf(receipt, { logo: null, watermark: null });
    const doc = await PDFDocument.load(await result.blob.arrayBuffer());
    assert.equal(doc.getPageCount(), 1);
    assert.ok(Math.abs(doc.getPage(0).getWidth() - widthMm * 72 / 25.4) < 0.01);
    assert.equal(JSON.stringify(receipt), snapshot);
    assert.equal(result.blob.type, 'application/pdf');
  }
});

test('modelo personalizado altera apresentação e asset obrigatório ausente falha explicitamente', async () => {
  const original = sample();
  const custom = globalThis.structuredClone(original);
  custom.template.fontSize = 12;
  custom.template.marginMm = 6;
  custom.template.footer = 'Texto personalizado '.repeat(15);
  const a = await createPdvReceiptPdf(original, { logo: null, watermark: null });
  const b = await createPdvReceiptPdf(custom, { logo: null, watermark: null });
  const height = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPage(0).getHeight();
  assert.ok(await height(b.blob) > await height(a.blob));
  custom.issuer.watermarkUrl = 'https://invalid.example/watermark.png';
  await assert.rejects(createPdvReceiptPdf(custom, { logo: null, watermark: null }), /Marca d’água/);
  await assert.rejects(createPdvReceiptPdf({ ...original, totalCents: 0 }), /comprovante de pagamento válido/);
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
