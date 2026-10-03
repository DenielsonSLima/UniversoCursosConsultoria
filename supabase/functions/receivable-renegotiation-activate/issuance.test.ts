import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createReplacementIssuer } from "./issuance.ts";
import { syntheticContext, syntheticReplacement, syntheticReplacementRow } from "./test-fixtures.ts";
import { adminForBaneseReservation, makeBaneseTitleResponse, validInput } from "../banese/core/adapter-test-fixtures.ts";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../banese/internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../banese/internal/testing/pix-fixture.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import { renderOfficialBanesePixQr } from "../banese/internal/official-pix-qr.ts";
import { ActivationError } from "./contract.ts";
import type { BaneseCreationResponseCapture } from "../banese/core/adapter/types.ts";

const fixturePix = buildBanesePixPayloadFixture("RENEGOTIATION-ISSUE", fixture.amount);
const fixturePixImage = await renderOfficialBanesePixQr(fixturePix);

const runtime = () => ({
  credentialId: syntheticContext().runtime.credentialId,
  issuerPoloId: syntheticContext().runtime.issuerPoloId,
  account: syntheticContext().runtime.account,
  payer: { ...validInput.payer, cpfCnpj: validInput.payer.document },
});
const result = (): GatewayChargeResult => {
  const raw = makeBaneseTitleResponse();
  return { providerCode: "banese_card", remotePaymentId: fixture.ourNumber,
    remotePaymentLinkId: null, remoteCustomerId: null, remoteStatus: "PENDING",
    invoiceUrl: null, bankSlipUrl: null, pixPayload: fixturePix, pixEncodedImage: fixturePixImage,
    bankSlipDigitableLine: raw.NumeroLinhaDigitavel, bankSlipBarcode: raw.NumeroCodigoBarras,
    bankSlipOurNumber: fixture.ourNumber, issuerPoloId: runtime().issuerPoloId,
    financialTerms: { nominalAmount: fixture.amount, dueDate: fixture.dueDate }, rawPayload: {} };
};
const admin = adminForBaneseReservation(true) as unknown as SupabaseClient;

Deno.test("fresh replacement uses official create with durable capture callback, timeout and pinned runtime", async () => {
  const calls: string[] = [];
  const context = syntheticContext();
  const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
    markIntent: async () => { calls.push("INTENT"); return { mode: "POST_ALLOWED", receivable: syntheticReplacementRow() }; },
    recordCreation: async () => { calls.push("CAPTURE"); },
    bank: {
      create: async (input) => {
        calls.push("CREATE");
        assert.ok(input.signal);
        assert.equal(input.allowPendingBolePix, true);
        input.onProviderMetadataResolved!(context.runtime.metadata, { id: context.runtime.issuerPoloId } as never);
        await input.onCreationResponse!({ response: makeBaneseTitleResponse(), request: {
          nossoNumero: fixture.ourNumber, convenio: context.runtime.convenio,
          agency: context.runtime.agency, amount: fixture.amount, dueDate: fixture.dueDate,
        } });
        return result();
      },
      query: async () => { throw new Error("Must not query fresh unissued replacement"); },
    },
  });
  const issued = await issue(context, syntheticReplacement());
  assert.equal(issued.bankSlipOurNumber, fixture.ourNumber);
  assert.deepEqual(calls, ["INTENT", "CREATE", "CAPTURE"]);
});

Deno.test("ambiguous replay is GET-only, restores original captured Pix when GET omits it", async () => {
  const originalFetch = globalThis.fetch;
  const context = syntheticContext();
  const officialPix = buildBanesePixPayloadFixture("ORIGINAL-CAPTURE", fixture.amount);
  const methods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    methods.push(init?.method || "GET");
    if (url.endsWith("/pagamentos/efetivados")) return Response.json({ PagamentosEfetivados: [] });
    return Response.json(makeBaneseTitleResponse());
  };
  try {
    const item = syntheticReplacement(); item.state = "ISSUANCE_INTENT";
    const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
      markIntent: async () => ({ mode: "GET_ONLY", receivable: {
        ...syntheticReplacementRow(), gateway_submission_status: "API_AMBIGUOUS",
        gateway_boleto_nosso_numero: fixture.ourNumber,
      }, creationResponse: {
        response: makeBaneseTitleResponse(undefined, undefined, { QrCode: officialPix }),
        request: { nossoNumero: fixture.ourNumber, convenio: context.runtime.convenio,
          agency: context.runtime.agency, amount: fixture.amount, dueDate: fixture.dueDate },
      } }),
      recordCreation: async () => { throw new Error("Replay cannot create evidence from another POST"); },
      bank: { create: async () => { throw new Error("Second POST forbidden"); }, query: queryBaneseBoleto },
    });
    const recovered = await issue(context, item);
    assert.equal(recovered.pixPayload, officialPix);
    assert.match(recovered.pixEncodedImage || "", /^data:image\/png;base64,/);
    assert.deepEqual(methods, ["GET", "GET"]);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("GET-only without reserved identity never falls back to POST", async () => {
  let bankTouched = false;
  const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
    markIntent: async () => ({ mode: "GET_ONLY", receivable: syntheticReplacementRow() }),
    recordCreation: async () => {},
    bank: {
      create: async () => { bankTouched = true; throw new Error(); },
      query: async () => { bankTouched = true; throw new Error(); },
    },
  });
  await assert.rejects(() => issue(syntheticContext(), syntheticReplacement()), /identidade bancária/);
  assert.equal(bankTouched, false);
});

Deno.test("runtime drift at final provider hydration blocks the adapter", async () => {
  const context = syntheticContext();
  let adapterReached = false;
  const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
    markIntent: async () => ({ mode: "POST_ALLOWED", receivable: syntheticReplacementRow() }),
    recordCreation: async () => {},
    bank: {
      create: async (input) => {
        input.onProviderMetadataResolved!({ ...context.runtime.metadata, baneseConta: "another account" }, { id: context.runtime.issuerPoloId } as never);
        adapterReached = true;
        return result();
      },
      query: async () => { throw new Error(); },
    },
  });
  await assert.rejects(() => issue(context, syntheticReplacement()), /configuração bancária mudou/);
  assert.equal(adapterReached, false);
});

Deno.test("partial Pix result fails closed instead of mixing payload/image", async () => {
  const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
    markIntent: async () => ({ mode: "POST_ALLOWED", receivable: syntheticReplacementRow() }),
    recordCreation: async () => {},
    bank: { create: async () => ({ ...result(), pixPayload: "only-payload", pixEncodedImage: null }), query: queryBaneseBoleto },
  });
  await assert.rejects(() => issue(syntheticContext(), syntheticReplacement()), /inconsistentes/);
});

Deno.test("partial captured POST with a different title identity cannot supply recovered Pix", async () => {
  const originalFetch = globalThis.fetch;
  const context = syntheticContext();
  globalThis.fetch = async (input) => {
    if (String(input).includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    if (String(input).endsWith("/pagamentos/efetivados")) return Response.json({ PagamentosEfetivados: [] });
    return Response.json(makeBaneseTitleResponse());
  };
  try {
    const item = syntheticReplacement(); item.state = "ISSUANCE_INTENT";
    const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
      markIntent: async () => ({ mode: "GET_ONLY", receivable: {
        ...syntheticReplacementRow(), gateway_submission_status: "API_AMBIGUOUS",
        gateway_boleto_nosso_numero: fixture.ourNumber,
      }, creationResponse: {
        response: { nossoNumero: "999999999", QrCode: buildBanesePixPayloadFixture("WRONG-TITLE", fixture.amount) },
        request: { nossoNumero: fixture.ourNumber, convenio: context.runtime.convenio,
          agency: context.runtime.agency, amount: fixture.amount, dueDate: fixture.dueDate },
      } }),
      recordCreation: async () => { throw new Error("Replay cannot make new POST evidence"); },
      bank: { create: async () => { throw new Error("Second POST forbidden"); }, query: queryBaneseBoleto },
    });
    await assert.rejects(() => issue(context, item), /Nosso Numero retornado diverge/);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("POST without QR remains retryable; empty GET cannot finish; later official GET succeeds without another POST", async () => {
  const originalFetch = globalThis.fetch;
  const context = syntheticContext();
  const item = syntheticReplacement();
  let postCount = 0;
  let getCount = 0;
  let qrAvailable = false;
  let capture: BaneseCreationResponseCapture | null = null;
  const pending = (error: unknown) => error instanceof ActivationError &&
    error.code === "BANESE_PIX_PENDING" && error.retryable;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    if (String(input).endsWith("/pagamentos/efetivados")) return Response.json({ PagamentosEfetivados: [] });
    getCount += 1;
    return Response.json(makeBaneseTitleResponse(undefined, undefined, qrAvailable ? { QrCode: fixturePix } : {}));
  };
  try {
    const issue = createReplacementIssuer({ admin, supabaseUrl: "http://localhost", runtime,
      markIntent: async () => postCount ? { mode: "GET_ONLY", receivable: {
        ...syntheticReplacementRow(), gateway_submission_status: "API_AMBIGUOUS",
        gateway_boleto_nosso_numero: fixture.ourNumber,
      }, creationResponse: capture } : { mode: "POST_ALLOWED", receivable: syntheticReplacementRow() },
      recordCreation: async (_context, _item, value) => { capture = value; },
      bank: {
        create: async (input) => {
          postCount += 1;
          await input.onCreationResponse!({ response: makeBaneseTitleResponse(), request: {
            nossoNumero: fixture.ourNumber, convenio: context.runtime.convenio,
            agency: context.runtime.agency, amount: fixture.amount, dueDate: fixture.dueDate,
          } });
          return { ...result(), pixPayload: null, pixEncodedImage: null };
        },
        query: queryBaneseBoleto,
      },
    });
    await assert.rejects(() => issue(context, item), pending);
    assert.ok(capture, "Original POST remains durable while Pix is pending");
    item.state = "ISSUANCE_INTENT";
    await assert.rejects(() => issue(context, item), pending);
    qrAvailable = true;
    const recovered = await issue(context, item);
    assert.equal(recovered.pixPayload, fixturePix);
    assert.ok(recovered.pixEncodedImage);
    assert.equal(postCount, 1); assert.equal(getCount, 2);
  } finally { globalThis.fetch = originalFetch; }
});
