import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdvReceiptPreview } from './pdv-receipt-preview';
import { printPreparedPdvReceipt } from './pdv-receipt.service';
import type { PdvReceipt, PreparedPdvReceipt } from './pdv-receipt.types';

const sample = (): PdvReceipt => ({
  ...createPdvReceiptPreview({ version: 1, widthMm: 80, marginMm: 3,
    fontSize: 9, showLogo: false, footer: 'Obrigado.', source: 'DEFAULT' }),
  payer: { name: 'Aluno sintético', documentMasked: '12*.***.**3-45',
    documentLabel: 'CPF', enrollmentNumber: 'UNIV-A-00000001' },
});

function scenario(change: (receipt: PdvReceipt) => PdvReceipt | void) {
  const receipt = sample();
  const prepared: PreparedPdvReceipt = {
    receipt, workstationId: null, blob: new Blob(['%PDF-prepared-identity']), fileName: 'fixture.pdf',
  };
  const before = JSON.stringify(prepared.receipt);
  const copy = globalThis.structuredClone(receipt);
  const current = change(copy) ?? copy;
  const calls: string[] = [];
  const printed: Blob[] = [];
  const io = {
    requestId: () => 'synthetic-request',
    rpc: async <T>(name: string): Promise<T> => {
      calls.push(name);
      if (name === 'prepare_pdv_print_job') return {
        id: 'job', canDispatch: true, receipt: current, transport: 'BROWSER',
      } as T;
      if (name === 'claim_pdv_print_job') return {
        id: 'job', status: 'CLAIMED', canDispatch: true, token: 'synthetic-token',
      } as T;
      return { status: 'DIALOG_CLOSED' } as T;
    },
    print: async (blob: Blob) => { printed.push(blob); },
  };
  return { prepared, before, io, calls, printed };
}

test('matrícula ou documento enriquecido depois do Blob bloqueiam antes de claim e impressão', async () => {
  const changes: Array<(r: PdvReceipt) => void> = [
    r => { r.payer.enrollmentNumber = 'UNIV-A-00000002'; },
    r => { r.payer.enrollmentNumber = null; },
    r => { r.payer.documentMasked = '12******345'; },
    r => { r.payer.documentLabel = 'CNPJ'; },
    r => { r.payer.name = 'Outro pagador'; },
  ];
  for (const change of changes) {
    const s = scenario(change);
    const blob = s.prepared.blob;
    await assert.rejects(printPreparedPdvReceipt(s.prepared, {}, s.io), /comprovante mudaram/);
    assert.deepEqual(s.calls, ['prepare_pdv_print_job']);
    assert.deepEqual(s.printed, []);
    assert.equal(s.prepared.blob, blob);
    assert.equal(await blob.text(), '%PDF-prepared-identity');
    assert.equal(JSON.stringify(s.prepared.receipt), s.before);
  }
});

test('campos financeiros canônicos, emissor e modelo divergentes também bloqueiam antes de claim', async () => {
  const changes: Array<(r: PdvReceipt) => void> = [
    r => { r.totalDisplay = 'R$ 1,00'; }, r => { r.totalCents += 1; },
    r => { r.paidAtDisplay = '02/01/2026'; }, r => { r.paidAt = '2026-01-02'; },
    r => { r.paymentMethod = 'OUTRA'; }, r => { r.description = 'Outra descrição'; },
    r => { r.number = 'PDV-99999999'; }, r => { r.issuer.name = 'Outro emissor'; },
    r => { r.issuer.cnpj = '00.000.000/0001-00'; }, r => { r.template.footer = 'Rodapé alterado'; },
  ];
  for (const change of changes) {
    const s = scenario(change);
    await assert.rejects(printPreparedPdvReceipt(s.prepared, {}, s.io), /comprovante mudaram/);
    assert.deepEqual(s.calls, ['prepare_pdv_print_job']);
    assert.equal(s.printed.length, 0);
  }
});

const reordered = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).reverse()) as T;

test('ordem JSON e flags transitórias não invalidam conteúdo equivalente nem recriam o Blob', async () => {
  const s = scenario(receipt => reordered({
    ...receipt, payer: reordered(receipt.payer), issuer: reordered(receipt.issuer),
    template: reordered(receipt.template), hasPriorPrint: true, automaticReady: true,
  }));
  assert.equal(await printPreparedPdvReceipt(s.prepared, {}, s.io), 'DIALOG_OPENED');
  assert.deepEqual(s.calls, ['prepare_pdv_print_job', 'claim_pdv_print_job', 'complete_pdv_print_job']);
  assert.equal(s.printed.length, 1);
  assert.equal(s.printed[0], s.prepared.blob);
  assert.equal(JSON.stringify(s.prepared.receipt), s.before);
});

test('identidade opcional ausente e null possuem o mesmo conteúdo', async () => {
  const s = scenario(receipt => { receipt.payer.enrollmentNumber = null; });
  delete s.prepared.receipt.payer.enrollmentNumber;
  assert.equal(await printPreparedPdvReceipt(s.prepared, {}, s.io), 'DIALOG_OPENED');
  assert.equal(s.printed[0], s.prepared.blob);
});
