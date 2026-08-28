import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../internal/testing/document-fixture.ts";
import { createBaneseBoletoCharge } from "./adapter.ts";
import {
  makeBaneseTitleResponse,
  reservedBoletoInput,
  validInput,
} from "./adapter-test-fixtures.ts";

const authenticatedResponse = () =>
  new Response(
    JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
    { status: 200 },
  );

Deno.test("erros locais falham antes de reservar Nosso Numero", async () => {
  const originalFetch = globalThis.fetch;
  const rpcCalls: string[] = [];
  let fetchCalls = 0;
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      throw new Error(`RPC nao deveria ser chamada: ${fn}`);
    },
  };
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("fetch nao deveria ser chamado"));
  };

  const baseInput = { ...reservedBoletoInput(true), admin };
  const invalidInputs = [
    { ...baseInput, payer: { ...validInput.payer, document: "123" } },
    { ...baseInput, payer: { ...validInput.payer, postalCode: "49000" } },
    {
      ...baseInput,
      receivable: { ...baseInput.receivable, baneseCodigoEspecie: 3 },
    },
    {
      ...baseInput,
      financialTerms: {
        nominalAmount: BANESE_DOCUMENT_FIXTURE.amount,
        dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
        discount: {
          type: "fixed" as const,
          value: BANESE_DOCUMENT_FIXTURE.amount,
        },
      },
    },
  ];

  try {
    for (const input of invalidInputs) {
      await assert.rejects(
        () => createBaneseBoletoCharge(input),
        (error: any) => {
          assert.notEqual(error?.remotePaymentCreated, true);
          return true;
        },
      );
    }
    await assert.rejects(
      () => createBaneseBoletoCharge(invalidInputs[1]),
      (error: any) => {
        assert.notEqual(error?.remotePaymentCreated, true);
        return true;
      },
    );
    assert.deepEqual(rpcCalls, []);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("reserva existente recupera boleto por GET sem novo POST", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  const response = makeBaneseTitleResponse(
    BANESE_DOCUMENT_FIXTURE.amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    {
      UrlBoleto: "https://servidor-externo.example/boleto.pdf",
    },
  );
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    calls.push({ url, method });
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    return new Response(JSON.stringify(response), { status: 200 });
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(true),
      successUrl: "https://universocc.com.br/aluno?origem=checkout",
    });
    const raw = result.raw as {
      recovered?: boolean;
      response?: Record<string, unknown>;
    };
    assert.equal(raw.recovered, true);
    const localDocumentUrl = new URL(String(result.bankSlipUrl));
    assert.equal(localDocumentUrl.origin, "https://universocc.com.br");
    assert.equal(localDocumentUrl.pathname, "/aluno");
    assert.equal(localDocumentUrl.searchParams.get("module"), "financeiro");
    assert.equal(
      localDocumentUrl.searchParams.get("banesePayment"),
      BANESE_DOCUMENT_FIXTURE.receivableId,
    );
    assert.equal(result.link, result.bankSlipUrl);
    assert.equal("UrlBoleto" in (raw.response || {}), false);
    assert.equal(
      calls.filter((call) =>
        call.method === "POST" && call.url.includes("/cobranca/v1/")
      ).length,
      0,
    );
    assert.equal(calls.filter((call) => call.method === "GET").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("recuperacao por GET exige documento, titulo da empresa e pagador", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    {
      override: { NumeroDocumento: "outro-documento" },
      expected: /NumeroDocumento.*diverge/i,
    },
    {
      override: { IdTituloEmpresa: "outro-titulo" },
      expected: /IdTituloEmpresa.*diverge/i,
    },
    {
      override: { Pagador: { NumeroCPFCNPJ: 99999999999 } },
      expected: /CPF\/CNPJ.*diverge/i,
    },
  ];

  try {
    for (const testCase of cases) {
      const methods: string[] = [];
      const response = makeBaneseTitleResponse(
        BANESE_DOCUMENT_FIXTURE.amount,
        BANESE_DOCUMENT_FIXTURE.dueDate,
        testCase.override,
      );
      globalThis.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = String(
          init?.method || (input instanceof Request ? input.method : "GET"),
        ).toUpperCase();
        if (url.includes("/autenticacao/")) return authenticatedResponse();
        methods.push(method);
        return new Response(JSON.stringify(response), { status: 200 });
      };
      await assert.rejects(
        () => createBaneseBoletoCharge(reservedBoletoInput(true)),
        testCase.expected,
      );
      assert.deepEqual(methods, ["GET"]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry valida identidade antes de qualquer correcao financeira", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  const response = makeBaneseTitleResponse(
    BANESE_DOCUMENT_FIXTURE.amount,
    BANESE_DOCUMENT_FIXTURE.dueDate,
    { NumeroDocumento: "titulo-de-outro-recebivel" },
  );
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    bankMethods.push(method);
    return new Response(JSON.stringify(response), { status: 200 });
  };

  try {
    await assert.rejects(
      () =>
        createBaneseBoletoCharge({
          ...reservedBoletoInput(true),
          financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
        }),
      /NumeroDocumento.*diverge/i,
    );
    assert.deepEqual(bankMethods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Nosso Numero novo colidido bloqueia emissao sem enviar POST", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    bankMethods.push(method);
    return new Response(JSON.stringify(makeBaneseTitleResponse()), {
      status: 200,
    });
  };

  try {
    await assert.rejects(
      () => createBaneseBoletoCharge(reservedBoletoInput(false)),
      (error: any) => {
        assert.equal(error?.remotePaymentCreated, true);
        assert.match(
          String(error?.message || error),
          /recem-reservado ja existe/i,
        );
        return true;
      },
    );
    assert.deepEqual(bankMethods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry nao envia POST sem faixa exclusiva confirmada", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    bankMethods.push(method);
    return new Response(
      JSON.stringify({ Codigo: "ERRO_BOLETO_NAO_ENCONTRADO" }),
      { status: 404 },
    );
  };

  try {
    await assert.rejects(
      () =>
        createBaneseBoletoCharge({
          ...reservedBoletoInput(true, false),
          environment: "production",
        }),
      (error: any) => {
        assert.notEqual(error?.remotePaymentCreated, true);
        assert.match(String(error?.message || error), /faixa exclusiva/i);
        return true;
      },
    );
    assert.deepEqual(bankMethods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RPC antiga sem flag de faixa falha fechada em producao", async () => {
  const originalFetch = globalThis.fetch;
  const bankMethods: string[] = [];
  const base = reservedBoletoInput(true);
  const admin = {
    rpc: async (fn: string) => {
      if (fn === "reserve_banese_nosso_numero_for_receivable") {
        return {
          data: {
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
            alreadyReserved: true,
          },
          error: null,
        };
      }
      if (fn === "payment_gateway_get_secret") {
        return { data: "credencial-homologacao", error: null };
      }
      throw new Error(`RPC inesperada no teste Banese: ${fn}`);
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    bankMethods.push(method);
    return new Response(
      JSON.stringify({ Codigo: "ERRO_BOLETO_NAO_ENCONTRADO" }),
      { status: 404 },
    );
  };

  try {
    await assert.rejects(
      () =>
        createBaneseBoletoCharge({
          ...base,
          admin,
          environment: "production",
        }),
      /faixa exclusiva/i,
    );
    assert.deepEqual(bankMethods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("falha ambigua preserva marcador de titulo remoto possivel", async () => {
  const originalFetch = globalThis.fetch;
  let preflightDone = false;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    if (url.includes("/autenticacao/")) return authenticatedResponse();
    if (method === "GET" && !preflightDone) {
      preflightDone = true;
      return new Response(
        JSON.stringify({ Codigo: "ERRO_BOLETO_NAO_ENCONTRADO" }),
        { status: 404 },
      );
    }
    return new Response(JSON.stringify({ erro: "falha temporaria" }), {
      status: 500,
    });
  };

  try {
    await assert.rejects(
      () => createBaneseBoletoCharge(reservedBoletoInput(false)),
      (error: any) => {
        assert.equal(error?.remotePaymentCreated, true);
        assert.match(String(error?.message || ""), /recusou criacao.*500/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
