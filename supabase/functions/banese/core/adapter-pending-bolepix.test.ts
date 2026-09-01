import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../internal/testing/document-fixture.ts";
import { createBaneseBoletoCharge } from "./adapter.ts";
import {
  creationFetch,
  makeBaneseTitleResponse,
  reservedBoletoInput,
} from "./adapter-test-fixtures.ts";

Deno.test("EAD preserva POST Banese validado quando o QrCode ainda nao veio", async () => {
  const originalFetch = globalThis.fetch;
  const response = makeBaneseTitleResponse();
  const { calls, fetcher } = creationFetch(response, response);
  globalThis.fetch = fetcher as typeof fetch;

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      allowPendingBolePix: true,
    });

    assert.equal(result.bankSlipOurNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(result.bankSlipDigitableLine?.length, 47);
    assert.equal(result.bankSlipBarcode?.length, 44);
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
    assert.equal(
      (result.raw as any)?.pixDiagnostic?.pendingOfficialQrCode,
      true,
    );
    assert.deepEqual(
      calls.filter((call) => call.url.includes("/boletos")).map((call) =>
        call.method
      ),
      ["GET", "POST", "GET", "GET"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("EAD preserva titulo existente compativel sem QrCode e nao repete POST", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    bankMethods.push(method);
    return new Response(JSON.stringify(makeBaneseTitleResponse()), {
      status: 200,
    });
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(true),
      environment: "production",
      allowPendingBolePix: true,
    });

    assert.equal(result.bankSlipOurNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
    assert.deepEqual(bankMethods, ["GET", "GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("fluxo padrao sem opt-in continua fail-closed sem consultar pagamentos", async () => {
  const originalFetch = globalThis.fetch;
  const bankCalls: Array<{ method: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    bankCalls.push({ method, url });
    return new Response(JSON.stringify(makeBaneseTitleResponse()), {
      status: 200,
    });
  };

  try {
    await assert.rejects(
      () =>
        createBaneseBoletoCharge({
          ...reservedBoletoInput(true),
          environment: "production",
        }),
      /QrCode Pix valido/i,
    );

    assert.deepEqual(bankCalls.map((call) => call.method), ["GET"]);
    assert.equal(
      bankCalls.some((call) => call.url.endsWith("/pagamentos/efetivados")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
