import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../internal/testing/document-fixture.ts";
import { createBaneseBoletoCharge } from "./adapter.ts";
import {
  makeBaneseTitleResponse,
  reservedBoletoInput,
} from "./adapter-test-fixtures.ts";

const authenticatedResponse = () =>
  new Response(
    JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
    { status: 200 },
  );

const notFoundResponse = () =>
  new Response(
    JSON.stringify({ Codigo: "ERRO_BOLETO_NAO_ENCONTRADO" }),
    { status: 404 },
  );

const assertRemoteMayExist = (error: any) => {
  assert.equal(error?.remotePaymentCreated, true);
  return true;
};

Deno.test("resposta perdida do claim preserva a tentativa sem enviar POST", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const bankMethods: string[] = [];
  const admin = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "claim_banese_api_submission_attempt") {
        assert.equal(
          args?.p_receivable_id,
          BANESE_DOCUMENT_FIXTURE.receivableId,
        );
        assert.equal(args?.p_nosso_numero, BANESE_DOCUMENT_FIXTURE.ourNumber);
        assert.equal(args?.p_expected_amount, BANESE_DOCUMENT_FIXTURE.amount);
        assert.equal(
          args?.p_expected_due_date,
          BANESE_DOCUMENT_FIXTURE.dueDate,
        );
        return { data: null, error: new Error("claim recusado") };
      }
      return base.admin.rpc(fn);
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    bankMethods.push(String(init?.method || "GET").toUpperCase());
    return notFoundResponse();
  };

  try {
    await assert.rejects(
      () => createBaneseBoletoCharge({ ...base, admin }),
      (error: any) => {
        assert.equal(error?.remotePaymentCreated, true);
        assert.match(String(error?.message || error), /claim recusado/i);
        return true;
      },
    );
    assert.deepEqual(bankMethods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("qualquer erro apos o claim permanece ambiguo e nao e reenviado", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const bankMethods: string[] = [];
  let submissionClaimed = false;
  const admin = {
    rpc: async (fn: string) => {
      if (fn === "reserve_banese_nosso_numero_for_receivable") {
        if (submissionClaimed) {
          return {
            data: null,
            error: new Error("submissao ambigua exige conciliacao"),
          };
        }
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: false,
            bankRangeConfirmed: true,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      if (fn === "claim_banese_api_submission_attempt") {
        assert.equal(submissionClaimed, false);
        submissionClaimed = true;
        return { data: true, error: null };
      }
      if (fn === "payment_gateway_get_secret") {
        return { data: "credencial-homologacao", error: null };
      }
      throw new Error(`RPC inesperada no teste: ${fn}`);
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    const method = String(init?.method || "GET").toUpperCase();
    bankMethods.push(method);
    if (method === "GET") return notFoundResponse();
    return new Response(JSON.stringify({ erro: "temporario" }), {
      status: 500,
    });
  };

  try {
    const input = { ...base, admin };
    await assert.rejects(
      () => createBaneseBoletoCharge(input),
      assertRemoteMayExist,
    );
    await assert.rejects(
      () => createBaneseBoletoCharge(input),
      /submissao ambigua exige conciliacao/i,
    );
    assert.deepEqual(bankMethods, ["GET", "POST"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST 400 depois do claim tambem fica protegido para conciliacao", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    const method = String(init?.method || "GET").toUpperCase();
    bankMethods.push(method);
    if (method === "GET") return notFoundResponse();
    return new Response(JSON.stringify({ erro: "pedido recusado" }), {
      status: 400,
    });
  };

  try {
    await assert.rejects(
      () => createBaneseBoletoCharge(reservedBoletoInput(false)),
      assertRemoteMayExist,
    );
    assert.deepEqual(bankMethods, ["GET", "POST"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST 409 recupera somente MATCH e nao envia um segundo POST", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  let postSeen = false;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    const method = String(init?.method || "GET").toUpperCase();
    bankMethods.push(method);
    if (method === "POST") {
      postSeen = true;
      return new Response(JSON.stringify({ erro: "JA_EXISTE" }), {
        status: 409,
      });
    }
    return postSeen
      ? new Response(JSON.stringify(makeBaneseTitleResponse()), { status: 200 })
      : notFoundResponse();
  };

  try {
    const result = await createBaneseBoletoCharge(reservedBoletoInput(false));
    assert.equal(result.bankSlipOurNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.deepEqual(bankMethods, ["GET", "POST", "GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST 409 com titulo FOREIGN para sem advance e sem segundo POST", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const bankMethods: string[] = [];
  const rpcCalls: string[] = [];
  let postSeen = false;
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      return base.admin.rpc(fn);
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    const method = String(init?.method || "GET").toUpperCase();
    bankMethods.push(method);
    if (method === "POST") {
      postSeen = true;
      return new Response(JSON.stringify({ erro: "JA_EXISTE" }), {
        status: 409,
      });
    }
    return postSeen
      ? new Response(
        JSON.stringify(makeBaneseTitleResponse(
          BANESE_DOCUMENT_FIXTURE.amount,
          BANESE_DOCUMENT_FIXTURE.dueDate,
          {
            NumeroDocumento: "documento-estrangeiro",
            IdTituloEmpresa: "titulo-estrangeiro",
          },
        )),
        { status: 200 },
      )
      : notFoundResponse();
  };

  try {
    await assert.rejects(
      () => createBaneseBoletoCharge({ ...base, admin }),
      assertRemoteMayExist,
    );
    assert.deepEqual(bankMethods, ["GET", "POST", "GET"]);
    assert.equal(
      rpcCalls.includes("advance_banese_nosso_numero_after_collision"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
