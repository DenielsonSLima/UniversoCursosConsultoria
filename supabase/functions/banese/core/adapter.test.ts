import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../internal/testing/document-fixture.ts";
import {
  buildBaneseBoletoPayload,
  calculateBaneseNossoNumero,
  cancelBaneseBoleto,
  createBaneseBoletoCharge,
  validateBaneseBoletoResponse,
  validateBanesePixChargeInput,
} from "./adapter.ts";

const validInput = {
  admin: { rpc: async () => ({ data: null, error: null }) },
  supabaseUrl: "https://example.supabase.co",
  environment: "sandbox" as const,
  paymentMethod: "BOLETO" as const,
  receivable: {
    id: "11111111-1111-4111-8111-111111111111",
    baneseAgencia: "033",
    baneseNossoNumero: "000000015",
    baneseCodigoEspecie: 21,
  },
  payer: {
    name: "Aluno Teste",
    document: "12345678901",
    address: "Rua de Teste, 100",
    postalCode: "49000000",
    district: "Centro",
    city: "Aracaju",
    state: "SE",
  },
  description: "Homologacao",
  amount: 15.9,
  dueDate: "2026-08-15",
  financialTerms: {
    nominalAmount: 15.9,
    dueDate: "2026-08-15",
    discount: { type: "fixed" as const, value: 1.9 },
    interest: { type: "monthly-percentage" as const, value: 5 },
    penalty: { type: "fixed" as const, value: 1 },
  },
};

Deno.test("calcula DV do Nosso Numero Banese com agencia", () => {
  assert.equal(calculateBaneseNossoNumero("033", "00000001"), "000000015");
});

Deno.test("payload boleto preserva campos financeiros validados", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    receivable: {
      ...validInput.receivable,
      baneseBoletoPayload: {
        NossoNumero: "999999999",
        ValorNominal: 0.01,
        Pagador: { NomeOuRazaoSocial: "INJETADO" },
      },
    },
  });

  assert.equal(payload.NossoNumero, "000000015");
  assert.equal(payload.ValorNominal, 15.9);
  assert.equal(payload.Pagador.NomeOuRazaoSocial, "Aluno Teste");
  assert.equal(payload.IndicadorPagamentoParcial, false);
  assert.equal("QuantidadePagamentoParcial" in payload, false);
  assert.equal(payload.FlAceite, true);
  assert.deepEqual(payload.Desconto, [{
    Data: "2026-08-15",
    Valor: 1.9,
    TipoDesconto: 1,
  }]);
  assert.deepEqual(payload.Juros, {
    Data: "2026-08-16",
    Valor: 5,
    TipoJuroMora: 2,
  });
  assert.deepEqual(payload.Multa, {
    Data: "2026-08-16",
    Valor: 1,
    TipoMulta: 1,
  });
});

Deno.test("payload boleto inclui numero e complemento no endereco", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    payer: {
      ...validInput.payer,
      address: "Rua de Teste",
      number: "100",
      complement: "Sala 2",
    },
  });
  const address = payload.Pagador.Endereco as { DescricaoEndereco: string };
  assert.equal(
    address.DescricaoEndereco,
    "Rua de Teste, 100 - Sala 2",
  );
});

Deno.test("bloqueia Pix Banese no sandbox indisponivel", async () => {
  await assert.rejects(
    () =>
      validateBanesePixChargeInput({
        ...validInput,
        paymentMethod: "PIX",
      }),
    /nao esta em funcionamento no sandbox/i,
  );
});

Deno.test("bloqueia criacao Banese fora do sandbox", async () => {
  await assert.rejects(
    () =>
      createBaneseBoletoCharge({ ...validInput, environment: "production" }),
    /bloqueadas em producao/i,
  );
});

const adminForBaneseReservation = (alreadyReserved: boolean) => ({
  rpc: async (fn: string) => {
    if (fn === "reserve_banese_nosso_numero_for_receivable") {
      return {
        data: {
          nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
          convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
          agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
          alreadyReserved,
        },
        error: null,
      };
    }
    if (fn === "payment_gateway_get_secret") {
      return { data: "credencial-homologacao", error: null };
    }
    throw new Error(`RPC inesperada no teste Banese: ${fn}`);
  },
});

const reservedBoletoInput = (alreadyReserved: boolean) => ({
  ...validInput,
  admin: adminForBaneseReservation(alreadyReserved),
  receivable: {
    ...validInput.receivable,
    id: BANESE_DOCUMENT_FIXTURE.receivableId,
    baneseBoletoConvenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
    baneseAgencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
    baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  },
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  financialTerms: null,
});

Deno.test("reserva existente recupera boleto por GET sem novo POST", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ||
      (input instanceof Request ? input.method : "GET");
    calls.push({ url, method });

    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
        NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
        CodigoSituacaoBoleto: 2,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
      }),
      { status: 200 },
    );
  };

  try {
    const result = await createBaneseBoletoCharge(reservedBoletoInput(true));
    const raw = result.raw as { recovered?: boolean };
    assert.equal(raw.recovered, true);
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

Deno.test("falha ambigua preserva marcador de titulo remoto possivel", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
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

const cancellationFetch = (initialSituation: number) => {
  let situation = initialSituation;
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    calls.push({ url, method });
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    if (url.endsWith("/baixa")) {
      situation = 5;
      return new Response(JSON.stringify({ Mensagem: "ok" }), { status: 200 });
    }
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(JSON.stringify({
        PagamentosEfetivados: [{
          ValorPago: BANESE_DOCUMENT_FIXTURE.amount,
          DataPagamento: BANESE_DOCUMENT_FIXTURE.dueDate,
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
      CodigoSituacaoBoleto: situation,
      ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
      DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    }), { status: 200 });
  };
  return { calls, fetcher };
};

const cancellationInput = {
  convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
};

Deno.test("baixa boleto aberto e confirma cancelamento no Banese", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    const result = await cancelBaneseBoleto(
      adminForBaneseReservation(true),
      "sandbox",
      cancellationInput,
    );
    assert.equal(result.remoteStatus, "CANCELED");
    assert.equal(result.alreadyCanceled, false);
    assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
    assert.equal(calls.filter((call) => call.method === "GET").length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("baixa Banese e idempotente para boleto ja cancelado", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(5);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    const result = await cancelBaneseBoleto(
      adminForBaneseReservation(true),
      "sandbox",
      cancellationInput,
    );
    assert.equal(result.alreadyCanceled, true);
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("baixa Banese bloqueia boleto que o banco ja confirmou pago", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(3);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await assert.rejects(
      () =>
        cancelBaneseBoleto(
          adminForBaneseReservation(true),
          "sandbox",
          cancellationInput,
        ),
      /ja confirmou o pagamento/i,
    );
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const validResponseExpectation = {
  ourNumber: BANESE_DOCUMENT_FIXTURE.ourNumber,
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  agency: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
  account: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
};

const validResponse = {
  NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
  NossoNumero: Number(BANESE_DOCUMENT_FIXTURE.ourNumber),
};

const assertRemoteValidationFailure = (
  run: () => unknown,
  message: RegExp,
) => {
  assert.throws(run, (error: any) => {
    assert.equal(error?.remotePaymentCreated, true);
    assert.match(String(error?.message || ""), message);
    return true;
  });
};

Deno.test("aceita retorno Banese correspondente ao titulo solicitado", () => {
  const result = validateBaneseBoletoResponse(
    validResponse,
    validResponseExpectation,
  );

  assert.equal(result.codigoBarras, BANESE_DOCUMENT_FIXTURE.barcode);
  assert.equal(result.linhaDigitavel, BANESE_DOCUMENT_FIXTURE.digitableLine);
});

Deno.test("rejeita Nosso Numero remoto divergente antes de persistir", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse({
        ...validResponse,
        NossoNumero: anotherTitle.ourNumber,
      }, validResponseExpectation),
    /Nosso Numero retornado diverge/i,
  );
});

Deno.test("rejeita Nosso Numero ASBACE de outro titulo", () => {
  const anotherTitle = baneseDocumentFixtureAt(1);

  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse({
        NumeroLinhaDigitavel: anotherTitle.digitableLine,
        NumeroCodigoBarras: anotherTitle.barcode,
      }, validResponseExpectation),
    /Nosso Numero da chave ASBACE diverge/i,
  );
});

Deno.test("rejeita valor codificado divergente do titulo solicitado", () => {
  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse(validResponse, {
        ...validResponseExpectation,
        amount: BANESE_DOCUMENT_FIXTURE.amount + 1,
      }),
    /Valor codificado.*diverge/i,
  );
});

Deno.test("rejeita fator de vencimento divergente do titulo solicitado", () => {
  assertRemoteValidationFailure(
    () =>
      validateBaneseBoletoResponse(validResponse, {
        ...validResponseExpectation,
        dueDate: "2026-08-16",
      }),
    /Fator de vencimento.*diverge/i,
  );
});
