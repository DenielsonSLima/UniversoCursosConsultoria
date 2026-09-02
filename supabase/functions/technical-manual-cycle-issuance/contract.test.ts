import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../banese/internal/testing/pix-fixture.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import {
  deterministicReceivableRequestId,
  errorMessage,
  parseCycleContext,
  parseIssuanceRequest,
  validateBaneseGatewayResult,
} from "./contract.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const LEGACY_DATABASE_UUID = "33333333-3333-4333-4333-333333333333";

Deno.test("normaliza erros estruturados sem object Object", () => {
  assert.equal(
    errorMessage({ code: "42703", message: "Coluna inválida." }),
    "Coluna inválida. (42703)",
  );
  assert.equal(errorMessage({}), "Erro estruturado sem mensagem.");
  assert.doesNotMatch(
    errorMessage({ details: "Detalhe conhecido." }),
    /object Object/,
  );
});

Deno.test("requisição generate exige os três fingerprints e vencimento do ciclo 2", () => {
  const parsed = parseIssuanceRequest({
    action: "generate",
    matriculaId: RECEIVABLE_ID,
    cicloNumero: 2,
    primeiroVencimento: "2026-09-15",
    requestId: REQUEST_ID,
    expectedRegraFingerprint: "a".repeat(64),
    expectedPoliticaFingerprint: "b".repeat(64),
    expectedCronogramaFingerprint: "c".repeat(64),
  });
  assert.equal(parsed.action, "generate");
  assert.equal(parsed.primeiroVencimento, "2026-09-15");
  assert.throws(
    () => parseIssuanceRequest({ ...parsed, primeiroVencimento: null }),
    /exige um primeiro vencimento/i,
  );
});

Deno.test("id determinístico por recebível é estável e não colide no ciclo", async () => {
  const first = await deterministicReceivableRequestId(
    REQUEST_ID,
    RECEIVABLE_ID,
  );
  assert.equal(
    first,
    await deterministicReceivableRequestId(REQUEST_ID, RECEIVABLE_ID),
  );
  assert.notEqual(
    first,
    await deterministicReceivableRequestId(
      REQUEST_ID,
      "33333333-3333-4333-8333-333333333333",
    ),
  );
  assert.match(first, /^[0-9a-f-]{36}$/);
});

Deno.test("aceita UUID legado do banco sem relaxar o requestId", () => {
  const parsedRequest = parseIssuanceRequest({
    action: "generate",
    matriculaId: LEGACY_DATABASE_UUID,
    cicloNumero: 2,
    primeiroVencimento: "2026-10-15",
    requestId: REQUEST_ID,
    expectedRegraFingerprint: "a".repeat(64),
    expectedPoliticaFingerprint: "b".repeat(64),
    expectedCronogramaFingerprint: "c".repeat(64),
  });
  assert.equal(parsedRequest.matriculaId, LEGACY_DATABASE_UUID);

  const context = parseCycleContext({
    requestId: REQUEST_ID,
    replayed: false,
    matriculaId: LEGACY_DATABASE_UUID,
    turmaId: LEGACY_DATABASE_UUID,
    poloId: LEGACY_DATABASE_UUID,
    ciclo: {
      numero: 2,
      cicloNumero: 2,
      status: "EM_EMISSAO",
      total: "100.00",
      quantidadeItens: 1,
      emitidosBanese: 0,
      pendentesEmissao: 1,
      emRevisao: 0,
      recebiveis: [{
        id: LEGACY_DATABASE_UUID,
        chave: "REMATRICULA-2",
        tipo: "REMATRICULA",
        numero: 0,
        descricao: "Rematrícula - Ciclo 2",
        valor: "100.00",
        vencimento: "2026-10-15",
        status: "PENDENTE",
        emissaoBanese: "PENDENTE",
      }],
    },
    cicloManual: null,
  });
  assert.equal(context.poloId, LEGACY_DATABASE_UUID);

  assert.throws(
    () =>
      parseIssuanceRequest({
        ...parsedRequest,
        requestId: LEGACY_DATABASE_UUID,
      }),
    /Identificador da requisição inválido/i,
  );
  assert.throws(
    () => parseCycleContext({ ...context, poloId: "uuid-inválido" }),
    /Contexto de emissão do ciclo manual inválido/i,
  );
});

Deno.test("resultado aceita somente boleto 0479, Nosso Número ASBACE e Pix oficial", () => {
  const dueDate = "2026-10-15";
  const amount = 279.9;
  const fixture = baneseDocumentFixtureAt(4, dueDate, amount);
  const result: GatewayChargeResult = {
    providerCode: "banese_card",
    remotePaymentId: fixture.ourNumber,
    remotePaymentLinkId: null,
    remoteCustomerId: null,
    remoteStatus: "PENDING",
    invoiceUrl: null,
    bankSlipUrl: null,
    pixPayload: buildBanesePixPayloadFixture("CICLO0005", amount),
    pixEncodedImage: buildBanesePixImageFixture(5),
    bankSlipDigitableLine: fixture.digitableLine,
    bankSlipBarcode: fixture.barcode,
    bankSlipOurNumber: fixture.ourNumber,
    issuerPoloId: LEGACY_DATABASE_UUID,
    financialTerms: {
      nominalAmount: amount,
      dueDate,
      discount: {
        type: "fixed",
        value: 19.9,
        validUntil: dueDate,
      },
      interest: {
        type: "monthly-percentage",
        value: 2,
        startsOn: "2026-10-16",
      },
      penalty: {
        type: "percentage",
        value: 2,
        startsOn: "2026-10-16",
      },
    },
    rawPayload: { request: {}, response: {} },
  };
  const receivable = {
    valor: amount,
    data_vencimento: dueDate,
    gateway_issuer_polo_id: result.issuerPoloId,
  };
  const normalized = validateBaneseGatewayResult(result, receivable);
  assert.equal(normalized.remotePaymentId, fixture.ourNumber);
  assert.equal(normalized.bankSlipBarcode?.slice(30, 39), fixture.ourNumber);
  assert.match(String(normalized.pixEncodedImage), /^data:image\/png;base64,/);

  assert.throws(
    () =>
      validateBaneseGatewayResult({ ...result, pixPayload: "000201" }, {
        ...receivable,
      }),
    /Pix copia e cola/i,
  );
  assert.throws(
    () =>
      validateBaneseGatewayResult(
        { ...result, remoteStatus: "REGISTERING" },
        receivable,
      ),
    /situação ou emissor/i,
  );
  assert.throws(
    () =>
      validateBaneseGatewayResult(result, {
        ...receivable,
        gateway_issuer_polo_id: "55555555-5555-4555-8555-555555555555",
      }),
    /situação ou emissor/i,
  );
});
