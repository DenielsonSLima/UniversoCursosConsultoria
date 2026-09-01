import assert from "node:assert/strict";
import { createBaneseBoletoCharge } from "./adapter.ts";
import {
  makeBaneseTitleResponse,
  reservedBoletoInput,
} from "./adapter-test-fixtures.ts";
import { BANESE_DOCUMENT_FIXTURE } from "../internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../internal/testing/pix-fixture.ts";
import { recoverBaneseIncidentReservation } from "./adapter/boleto-incident-recovery.ts";

Deno.test("incidente recupera titulo exato por GET antes de qualquer POST", async () => {
  const originalFetch = globalThis.fetch;
  const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const bankMethods: string[] = [];
  const officialQrCode = buildBanesePixPayloadFixture(
    BANESE_DOCUMENT_FIXTURE.ourNumber,
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  const admin = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "reserve_banese_nosso_numero_for_receivable") {
        return {
          data: {
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: false,
            recoveryPending: true,
            recoveryCandidateStart: 468,
            recoveryCandidateEnd: 468,
          },
          error: null,
        };
      }
      if (fn === "claim_banese_incident_recovered_title") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: true,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      if (fn === "payment_gateway_get_secret") {
        return { data: "credencial-producao", error: null };
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
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
    const full = makeBaneseTitleResponse(
      BANESE_DOCUMENT_FIXTURE.amount,
      BANESE_DOCUMENT_FIXTURE.dueDate,
    );
    return new Response(
      JSON.stringify({
        ...full,
        QrCode: officialQrCode,
      }),
      { status: 200 },
    );
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      admin,
      environment: "production",
    });
    assert.equal(result.bankSlipOurNumber, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.equal(result.pixPayload, officialQrCode);
    assert.equal(
      result.pixEncodedImage?.startsWith("data:image/png;base64,"),
      true,
    );
    assert.deepEqual(bankMethods, ["GET"]);
    assert.equal(
      rpcCalls.some((call) =>
        call.fn === "claim_banese_incident_recovered_title" &&
        call.args?.p_expected_creation_token ===
          reservedBoletoInput(false).receivable.gateway_creation_token
      ),
      true,
    );
    assert.equal(
      rpcCalls.some((call) =>
        call.fn === "finish_banese_incident_recovery_scan"
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("incidente remove somente desconto indevido e confirma antes de recuperar", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const methods: string[] = [];
  let updateBody: unknown = null;
  const officialQrCode = buildBanesePixPayloadFixture(
    BANESE_DOCUMENT_FIXTURE.ourNumber,
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  const expectedTerms = {
    nominalAmount: BANESE_DOCUMENT_FIXTURE.amount,
    dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
    discount: null,
    penalty: { type: "percentage" as const, value: 2 },
    interest: { type: "monthly-percentage" as const, value: 1 },
  };
  const commonResponse = makeBaneseTitleResponse(
    BANESE_DOCUMENT_FIXTURE.amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      QrCode: officialQrCode,
      Multa: { TipoMulta: 2, Valor: 2, Data: "2026-08-16" },
      Juros: { TipoJuroMora: 2, Valor: 1, Data: "2026-08-16" },
    },
  );
  const before = {
    ...commonResponse,
    Desconto: [{ TipoDesconto: 1, Valor: 19.9, Data: "2026-08-15" }],
  };
  const after = {
    ...commonResponse,
    Desconto: [{ TipoDesconto: 0, Valor: 0, Data: "2026-08-15" }],
  };
  const admin = {
    rpc: async (fn: string) => {
      if (fn === "claim_banese_incident_recovered_title") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: true,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
  globalThis.fetch = async (_input, init) => {
    const method = String(init?.method || "GET").toUpperCase();
    methods.push(method);
    if (method === "PUT") {
      updateBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ atualizado: true }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify(
        methods.filter((item) => item === "GET").length === 1 ? before : after,
      ),
      { status: 200 },
    );
  };

  try {
    const result = await recoverBaneseIncidentReservation({
      charge: {
        ...base,
        admin,
        environment: "production",
        financialTerms: expectedTerms,
      },
      receivableId: base.receivable.id,
      convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
      agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
      token: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: null,
        scope: null,
        raw: null,
      },
      candidateStart: 468,
      candidateEnd: 468,
      expectedCreationToken: base.receivable.gateway_creation_token,
    });
    assert.deepEqual(methods, ["GET", "PUT", "GET"]);
    assert.deepEqual(updateBody, {
      Desconto: [{
        TipoDesconto: 0,
        Valor: 0,
        Data: BANESE_DOCUMENT_FIXTURE.dueDate,
      }],
    });
    assert.equal(result.recoveredResult?.financialTerms?.discount, null);
    assert.equal(result.recoveredResult?.pixPayload, officialQrCode);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("incidente nao avanca ao encontrar MATCH sem Pix oficial", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const rpcCalls: string[] = [];
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
  const bankMethods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    bankMethods.push(String(init?.method || "GET").toUpperCase());
    return new Response(JSON.stringify(makeBaneseTitleResponse()), {
      status: 200,
    });
  };

  try {
    await assert.rejects(
      () =>
        recoverBaneseIncidentReservation({
          charge: { ...base, admin, environment: "production" },
          receivableId: base.receivable.id,
          convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
          agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
          token: {
            accessToken: "token",
            tokenType: "Bearer",
            expiresIn: null,
            scope: null,
            raw: null,
          },
          candidateStart: 468,
          candidateEnd: 468,
          expectedCreationToken: base.receivable.gateway_creation_token,
        }),
      /QrCode Pix valido/i,
    );
    assert.deepEqual(bankMethods, ["GET"]);
    assert.deepEqual(rpcCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("incidente EAD preserva MATCH pendente sem Pix e nao envia POST", async () => {
  const originalFetch = globalThis.fetch;
  const base = reservedBoletoInput(false);
  const rpcCalls: string[] = [];
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      if (fn === "claim_banese_incident_recovered_title") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: true,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
  const bankMethods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    bankMethods.push(String(init?.method || "GET").toUpperCase());
    return new Response(JSON.stringify(makeBaneseTitleResponse()), {
      status: 200,
    });
  };

  try {
    const result = await recoverBaneseIncidentReservation({
      charge: {
        ...base,
        admin,
        environment: "production",
        allowPendingBolePix: true,
      },
      receivableId: base.receivable.id,
      convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
      agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
      token: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: null,
        scope: null,
        raw: null,
      },
      candidateStart: 468,
      candidateEnd: 468,
      expectedCreationToken: base.receivable.gateway_creation_token,
    });
    assert.equal(result.recoveredResult?.pixPayload, null);
    assert.equal(result.recoveredResult?.pixEncodedImage, null);
    assert.equal(
      (result.recoveredResult?.raw as any)?.recoveryEvidence,
      "FULL_TITLE_IDENTITY_WITH_PIX_PENDING",
    );
    assert.deepEqual(bankMethods, ["GET", "GET"]);
    assert.deepEqual(rpcCalls, ["claim_banese_incident_recovered_title"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("incidente ignora somente FOREIGN integral e conclui a varredura com CAS", async () => {
  const originalFetch = globalThis.fetch;
  const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const base = reservedBoletoInput(false);
  const admin = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "finish_banese_incident_recovery_scan") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: false,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
  const bankMethods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    bankMethods.push(String(init?.method || "GET").toUpperCase());
    return new Response(
      JSON.stringify(makeBaneseTitleResponse(
        BANESE_DOCUMENT_FIXTURE.amount,
        BANESE_DOCUMENT_FIXTURE.dueDate,
        {
          NumeroDocumento: "documento-remoto-alheio",
          IdTituloEmpresa: "titulo-remoto-alheio",
          Pagador: { NumeroCPFCNPJ: 98765432100 },
        },
      )),
      { status: 200 },
    );
  };

  try {
    const result = await recoverBaneseIncidentReservation({
      charge: { ...base, admin, environment: "production" },
      receivableId: base.receivable.id,
      convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
      agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
      token: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: null,
        scope: null,
        raw: null,
      },
      candidateStart: 468,
      candidateEnd: 468,
      expectedCreationToken: base.receivable.gateway_creation_token,
    });
    assert.equal(result.recoveredResult, null);
    assert.deepEqual(bankMethods, ["GET"]);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fn, "finish_banese_incident_recovery_scan");
    assert.equal(
      rpcCalls[0].args?.p_expected_creation_token,
      base.receivable.gateway_creation_token,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("incidente nao altera resposta com identidade incompleta", async () => {
  const originalFetch = globalThis.fetch;
  const rpcCalls: string[] = [];
  const base = reservedBoletoInput(false);
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      if (fn === "finish_banese_incident_recovery_scan") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: false,
            collisionPreflightEnabled: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };
  const bankMethods: string[] = [];
  const officialQrCode = buildBanesePixPayloadFixture(
    BANESE_DOCUMENT_FIXTURE.ourNumber,
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  globalThis.fetch = async (_input, init) => {
    bankMethods.push(String(init?.method || "GET").toUpperCase());
    return new Response(
      JSON.stringify(makeBaneseTitleResponse(
        BANESE_DOCUMENT_FIXTURE.amount,
        BANESE_DOCUMENT_FIXTURE.dueDate,
        {
          NumeroDocumento: undefined,
          IdTituloEmpresa: undefined,
          Pagador: undefined,
          QrCode: officialQrCode,
          Desconto: [{
            TipoDesconto: 1,
            Valor: 19.9,
            Data: BANESE_DOCUMENT_FIXTURE.dueDate,
          }],
        },
      )),
      { status: 200 },
    );
  };

  try {
    await assert.rejects(
      () =>
        recoverBaneseIncidentReservation({
          charge: { ...base, admin, environment: "production" },
          receivableId: base.receivable.id,
          convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
          agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
          token: {
            accessToken: "token",
            tokenType: "Bearer",
            expiresIn: null,
            scope: null,
            raw: null,
          },
          candidateStart: 468,
          candidateEnd: 468,
          expectedCreationToken: base.receivable.gateway_creation_token,
        }),
      /identidade indeterminada/i,
    );
    assert.deepEqual(bankMethods, ["GET"]);
    assert.deepEqual(rpcCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
