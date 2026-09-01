import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../../../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../../../banese/internal/testing/pix-fixture.ts";
import { makeBaneseTitleResponse } from "../../../banese/core/adapter-test-fixtures.ts";
import {
  isEadBaneseBoletoCheckout,
  persistEadBaneseCheckoutResult,
} from "./ead-banese-checkout-persistence.ts";

const context = (modality = "EAD") => ({
  environment: "production",
  course: { modalidade: modality },
  route: { providerCode: "banese_card" },
  charge: { method: "BOLETO", installmentCount: 1 },
}) as any;

const receivable = () => ({
  id: BANESE_DOCUMENT_FIXTURE.receivableId,
  updated_at: "2026-09-01T01:50:15.000Z",
  status: "PENDENTE",
  gateway_status: "CREATING",
  gateway_boleto_convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  gateway_financial_terms: {
    nominalAmount: BANESE_DOCUMENT_FIXTURE.amount,
    dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  },
});

const gatewayResult = (withPix: boolean) => {
  const response = makeBaneseTitleResponse();
  return {
    providerCode: "banese_card",
    remotePaymentId: BANESE_DOCUMENT_FIXTURE.ourNumber,
    remotePaymentLinkId: null,
    remoteCustomerId: null,
    remoteStatus: "PENDING",
    invoiceUrl: "https://universocc.com.br/boleto",
    bankSlipUrl: "https://universocc.com.br/boleto",
    pixPayload: withPix
      ? buildBanesePixPayloadFixture(
        "EAD-ATOMICO",
        BANESE_DOCUMENT_FIXTURE.amount,
      )
      : null,
    pixEncodedImage: withPix
      ? `data:image/png;base64,${buildBanesePixImageFixture(1)}`
      : null,
    bankSlipDigitableLine: response.NumeroLinhaDigitavel,
    bankSlipBarcode: response.NumeroCodigoBarras,
    bankSlipOurNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
    issuerPoloId: "11111111-1111-4111-8111-111111111111",
    financialTerms: receivable().gateway_financial_terms,
    rawPayload: { pixDiagnostic: { complete: withPix } },
  } as any;
};

const projectionAdmin = (persisted: Record<string, unknown>) => {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "contas_receber");
      return {
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          const query: any = {
            eq: () => query,
            select: () => query,
            maybeSingle: async () => ({
              data: { ...persisted, ...payload },
              error: null,
            }),
          };
          return query;
        },
      };
    },
  };
  return { admin, updates };
};

Deno.test("persistencia critica do POST EAD Banese usa um unico RPC atomico", async () => {
  for (const withPix of [true, false]) {
    const row = receivable();
    const persisted = { ...row, updated_at: "2026-09-01T01:50:16.000Z" };
    const { admin, updates } = projectionAdmin(persisted);
    const calls: any[] = [];
    const currentContext = { ...context(), admin } as any;

    const result = await persistEadBaneseCheckoutResult(
      currentContext,
      row,
      gatewayResult(withPix),
      {
        loadExpectedTransactions: async () => [],
        persistSnapshot: async (_admin: any, input: any) => {
          calls.push(input);
          return persisted;
        },
      } as any,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].confirmApiSubmission, true);
    assert.equal(calls[0].remotePaid, false);
    assert.equal(calls[0].nossoNumero, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(calls[0].bankNumbers.digitableLine.length, 47);
    assert.equal(calls[0].bankNumbers.barcode.length, 44);
    assert.equal(Boolean(calls[0].pixPayload), withPix);
    assert.equal(Boolean(calls[0].pixEncodedImage), withPix);
    assert.equal(updates.length, 1);
    assert.equal(result.gateway_bank_slip_url, gatewayResult(withPix).bankSlipUrl);
  }
});

Deno.test("falha do RPC atomico nao inicia persistencia acessoria", async () => {
  let projectionStarted = false;
  const currentContext = {
    ...context(),
    admin: { from: () => (projectionStarted = true) },
  } as any;
  await assert.rejects(
    () =>
      persistEadBaneseCheckoutResult(
        currentContext,
        receivable(),
        gatewayResult(true),
        {
          loadExpectedTransactions: async () => [],
          persistSnapshot: async () => {
            throw new Error("rollback");
          },
        } as any,
      ),
    /rollback/,
  );
  assert.equal(projectionStarted, false);
});

Deno.test("persistencia atomica BolePix nunca e habilitada para Tecnico", () => {
  assert.equal(isEadBaneseBoletoCheckout(context("TECNICO")), false);
  assert.equal(isEadBaneseBoletoCheckout(context("EAD")), true);
});
