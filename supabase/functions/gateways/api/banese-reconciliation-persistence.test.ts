import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { persistBaneseReconciliationSnapshot } from "./banese-reconciliation-persistence.ts";

const receivable = () => ({
  id: BANESE_DOCUMENT_FIXTURE.receivableId,
  status: "PENDENTE",
  origem_pagamento: "GATEWAY_ONLINE",
  forma_pagamento: "BOLETO",
  valor: BANESE_DOCUMENT_FIXTURE.amount,
  data_vencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  gateway_status: "OPEN",
  gateway_payment_id: String(Number(BANESE_DOCUMENT_FIXTURE.ourNumber)),
  gateway_boleto_nosso_numero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_boleto_convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  gateway_financial_terms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  updated_at: "2026-08-27T20:00:00.000Z",
});

const inputFor = (title: ReturnType<typeof receivable>) => ({
  receivable: title,
  environment: "production",
  convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  remoteStatus: "OPEN",
  financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  confirmApiSubmission: true,
  remotePaid: false,
  postSettlementRequired: false,
  shouldSettle: false,
  paymentTotal: 0,
  paymentDate: null,
  settlementMethod: "NAO_IDENTIFICADO",
  pixPayload: "pix-oficial",
  pixEncodedImage: "imagem-oficial",
  bankNumbers: {
    digitableLine: BANESE_DOCUMENT_FIXTURE.digitableLine,
    barcode: BANESE_DOCUMENT_FIXTURE.barcode,
  },
  snapshot: {
    raw: { CodigoSituacaoBoleto: 2 },
    payments: [],
    pixPayload: "pix-oficial",
  },
  expectedTransactions: [],
});

Deno.test("envia snapshot CAS completo para a RPC atomica Banese", async () => {
  const title = receivable();
  const calls: Array<Record<string, any>> = [];
  const admin = {
    rpc: (_name: string, args: Record<string, any>) => {
      calls.push(args);
      return Promise.resolve({
        data: {
          persistedAt: "2026-08-27T20:01:00.000Z",
          receivable: {
            ...title,
            gateway_payment_id: BANESE_DOCUMENT_FIXTURE.ourNumber,
            updated_at: "2026-08-27T20:01:00.000Z",
          },
        },
        error: null,
      });
    },
  };

  const updated = await persistBaneseReconciliationSnapshot(
    admin,
    inputFor(title),
  );
  const captured = calls[0];

  assert.equal(
    captured?.p_expected_state.gateway_submission_status,
    "API_REGISTERED",
  );
  assert.equal(
    captured?.p_expected_state.updated_at,
    "2026-08-27T20:00:00.000Z",
  );
  assert.deepEqual(captured?.p_expected_transactions, []);
  assert.equal(captured?.p_remote_digitable_line.length, 47);
  assert.equal(captured?.p_remote_barcode.length, 44);
  assert.equal(updated.gateway_payment_id, BANESE_DOCUMENT_FIXTURE.ourNumber);
  assert.equal(title.updated_at, "2026-08-27T20:01:00.000Z");
});

Deno.test("rejeita resposta da RPC atomica sem o recebivel esperado", async () => {
  const title = receivable();
  const admin = {
    rpc: () => Promise.resolve({ data: { persistedAt: "agora" }, error: null }),
  };

  await assert.rejects(
    () => persistBaneseReconciliationSnapshot(admin, inputFor(title)),
    /contrato invalido/i,
  );
});

Deno.test("remove marcador derivado do import legado antes do CAS", async () => {
  const title = receivable();
  const calls: Array<Record<string, any>> = [];
  const admin = {
    rpc: (_name: string, args: Record<string, any>) => {
      calls.push(args);
      return Promise.resolve({
        data: { receivable: title },
        error: null,
      });
    },
  };

  await persistBaneseReconciliationSnapshot(admin, {
    ...inputFor(title),
    expectedTransactions: [{
      id: "transacao-legada",
      updated_at: "2026-08-27T20:00:00.000Z",
      synced_at: null,
      is_legacy_import: true,
    }],
  });

  const snapshot = calls[0]?.p_expected_transactions?.[0];
  assert.equal(snapshot.id, "transacao-legada");
  assert.equal(Object.hasOwn(snapshot, "is_legacy_import"), false);
  assert.equal(Object.keys(snapshot).length, 13);
});

Deno.test("abandona persistencia pendurada quando o prazo da consulta expira", async () => {
  const title = receivable();
  const controller = new AbortController();
  const admin = { rpc: () => new Promise(() => {}) };
  const pending = persistBaneseReconciliationSnapshot(admin, {
    ...inputFor(title),
    signal: controller.signal,
  });

  controller.abort(new DOMException("Timeout", "TimeoutError"));
  await assert.rejects(pending, /Timeout/);
  assert.equal(title.updated_at, "2026-08-27T20:00:00.000Z");
});
