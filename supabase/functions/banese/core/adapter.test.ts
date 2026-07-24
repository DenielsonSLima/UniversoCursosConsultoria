import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../internal/testing/pix-fixture.ts";
import { normalizeBanesePixPayload } from "../internal/pix-validation.ts";
import {
  baneseDueDateFactor,
  calculateBaneseAsbaceDoubleDigit,
} from "../internal/bank-fields.ts";
import {
  buildBaneseBoletoPayload,
  calculateBaneseNossoNumero,
  cancelBaneseBoleto,
  createBaneseBoletoCharge,
  validateBaneseBoletoResponse,
  validateBanesePixChargeInput,
} from "./adapter.ts";

const modulo10Digit = (value: string) => {
  let weight = 2;
  let total = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const product = Number(value[index]) * weight;
    total += product > 9 ? product - 9 : product;
    weight = weight === 2 ? 1 : 2;
  }
  return String((10 - (total % 10)) % 10);
};

const barcodeGeneralDigit = (barcode: string) => {
  let weight = 2;
  let total = 0;
  for (let index = barcode.length - 1; index >= 0; index -= 1) {
    if (index === 4) continue;
    total += Number(barcode[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = total % 11;
  return String(remainder < 2 ? 1 : 11 - remainder);
};

const makeBaneseBarcodePack = (amount: number, dueDate: string) => {
  const amountValue = String(Math.round(amount * 100)).padStart(10, "0");
  const agreement = BANESE_DOCUMENT_FIXTURE.beneficiary.agreement;
  const agency = BANESE_DOCUMENT_FIXTURE.beneficiary.agency;
  const account = BANESE_DOCUMENT_FIXTURE.beneficiary.account.replace(
    /\D/g,
    "",
  );
  const asbaceBase = `${
    agency.slice(-2)
  }${account}${BANESE_DOCUMENT_FIXTURE.ourNumber}047`;
  const freeField = `${asbaceBase}${
    calculateBaneseAsbaceDoubleDigit(asbaceBase)
  }`;
  const withPlaceholder = `04790${
    baneseDueDateFactor(dueDate)
  }${amountValue}${freeField}`;
  const barcode = `${withPlaceholder.slice(0, 4)}${
    barcodeGeneralDigit(withPlaceholder)
  }${withPlaceholder.slice(5)}`;
  const fieldOne = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`;
  const fieldTwo = barcode.slice(24, 34);
  const fieldThree = barcode.slice(34, 44);
  const digitableLine = `${fieldOne}${modulo10Digit(fieldOne)}${fieldTwo}${
    modulo10Digit(fieldTwo)
  }${fieldThree}${modulo10Digit(fieldThree)}${barcode[4]}${
    barcode.slice(5, 19)
  }`;
  return { agreement, barcode, digitableLine };
};

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

Deno.test("nao bloqueia criacao Banese por regra de ambiente em producao", async () => {
  await assert.rejects(
    () =>
      createBaneseBoletoCharge({ ...validInput, environment: "production" }),
    (error: any) => {
      const message = String(error?.message || error);
      return /convenio/i.test(message) &&
        !/bloqueadas em producao/i.test(message);
    },
  );
});

Deno.test("producao aceita valor comercial acima de 10 e retorno sem pix", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  const amount = 149.9;
  const values = makeBaneseBarcodePack(amount, BANESE_DOCUMENT_FIXTURE.dueDate);
  const payloadWithoutPix = JSON.stringify({
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    ValorNominalNumerico: amount,
    NossoNumeroSemDv: BANESE_DOCUMENT_FIXTURE.ourNumber.slice(0, 8),
    convenio: values.agreement,
  });

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
    return new Response(payloadWithoutPix, { status: 200 });
  };

  try {
    const productionInput = {
      ...reservedBoletoInput(false),
      environment: "production" as const,
      amount,
      financialTerms: null,
    };
    const result = await createBaneseBoletoCharge(productionInput);
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
    const postCalls = calls.filter((call) =>
      call.method === "POST" && call.url.includes("/cobranca/v1/")
    ).length;
    assert.equal(postCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita retornos de pix no retorno da criacao", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const values = makeBaneseBarcodePack(amount, BANESE_DOCUMENT_FIXTURE.dueDate);
  const payloadWithPix = JSON.stringify({
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    brCodeEMV: buildBanesePixPayloadFixture("TXID-TESTE", amount),
    qrcode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    convenio: values.agreement,
  });
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    return new Response(payloadWithPix, { status: 200 });
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(typeof result.pixPayload, "string");
    assert.equal(typeof result.pixEncodedImage, "string");
    assert.equal(
      result.pixPayload?.length,
      buildBanesePixPayloadFixture("TXID-TESTE", amount).length,
    );
    assert.match(
      result.pixEncodedImage ?? "",
      /^data:image\/png;base64,/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao preserva BolePix do POST quando confirmacao financeira nao repete o QR", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const values = makeBaneseBarcodePack(amount, BANESE_DOCUMENT_FIXTURE.dueDate);
  const common = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    convenio: values.agreement,
  };
  const creationResponse = {
    ...common,
    BolePix: {
      brCodeEMV: buildBanesePixPayloadFixture("TXID-POST", amount),
      qrCode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    },
  };
  const confirmationResponse = { ...common };

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ||
      (input instanceof Request ? input.method : "GET");
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify(method === "POST" ? creationResponse : confirmationResponse),
      { status: 200 },
    );
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: {
        nominalAmount: amount,
        dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
      },
    });
    assert.equal(typeof result.pixPayload, "string");
    assert.equal(typeof result.pixEncodedImage, "string");
    const diagnostic = (result.raw as any)?.pixDiagnostic;
    assert.equal(diagnostic?.source, "creation");
    assert.equal(diagnostic?.complete, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("producao aceita GUI Banese minusculo e renderiza QR a partir do EMV oficial", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 129.9;
  const values = makeBaneseBarcodePack(amount, BANESE_DOCUMENT_FIXTURE.dueDate);
  const officialPayload = buildBanesePixPayloadFixture(
    "TXID-BANESE",
    amount,
    "br.gov.bcb.pix",
  );
  const creationResponse = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    convenio: values.agreement,
    BolePix: {
      qrCode: officialPayload,
    },
  };

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(creationResponse), { status: 200 });
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.pixPayload, officialPayload);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    const diagnostic = (result.raw as any)?.pixDiagnostic;
    assert.equal(diagnostic?.source, "creation");
    assert.equal(
      diagnostic?.attempts?.[0]?.imageSource,
      "generated_from_official_emv",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("aceita espaços permitidos pelo EMV no nome do recebedor Banese", () => {
  const payload =
    "00020101021226840014br.gov.bcb.pix2562qrcode-h.banese.b.br/jws/cobv/78923f2a35174d5a965f3c9442ddbe9f5204000053039865802BR5924ARACAJU PREF GABINETE DO6007ARACAJU62070503***6304A8E7";
  const normalized = normalizeBanesePixPayload(payload, 149.9);
  assert.equal(normalized.payload, payload);
});

Deno.test("descarta retorno de pix no formato de linha/barras", async () => {
  const originalFetch = globalThis.fetch;
  const amount = 8.5;
  const values = makeBaneseBarcodePack(amount, BANESE_DOCUMENT_FIXTURE.dueDate);
  const payloadWithPix = JSON.stringify({
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    brCodeEMV: "04793153400000279903303100649000000002304772",
    qrcode: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    convenio: values.agreement,
  });

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    return new Response(payloadWithPix, { status: 200 });
  };

  try {
    const result = await createBaneseBoletoCharge({
      ...reservedBoletoInput(false),
      environment: "production",
      amount,
      financialTerms: null,
    });
    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  const baseInput = {
    ...reservedBoletoInput(true),
    admin,
  };
  const invalidInputs = [
    {
      ...baseInput,
      payer: { ...validInput.payer, document: "123" },
    },
    {
      ...baseInput,
      payer: { ...validInput.payer, postalCode: "49000" },
    },
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
    // Uma repeticao do mesmo pedido invalido tambem nao cria reserva/ownership.
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
        UrlBoleto: "https://servidor-externo.example/boleto.pdf",
        CodigoSituacaoBoleto: 2,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
      }),
      { status: 200 },
    );
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

const cancellationFetch = (
  initialSituation: number,
  paymentConfirmed = initialSituation === 3,
  paymentStatus = 200,
) => {
  let situation = initialSituation;
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (url.endsWith("/baixa")) {
      situation = 5;
      return new Response(JSON.stringify({ Mensagem: "ok" }), { status: 200 });
    }
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(
        JSON.stringify({
          PagamentosEfetivados: paymentConfirmed
            ? [{
              ValorPago: BANESE_DOCUMENT_FIXTURE.amount,
              DataPagamento: BANESE_DOCUMENT_FIXTURE.dueDate,
            }]
            : [],
        }),
        { status: paymentStatus },
      );
    }
    return new Response(
      JSON.stringify({
        NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        CodigoSituacaoBoleto: situation,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
      }),
      { status: 200 },
    );
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
    assert.equal(
      calls.filter((call) =>
        call.method === "GET" &&
        !call.url.endsWith("/pagamentos/efetivados")
      ).length,
      2,
    );
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

Deno.test("PagamentosEfetivados prevalece mesmo sem CodigoSituacaoBoleto 3", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2, true);
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

Deno.test("baixa Banese falha fechada se PagamentosEfetivados estiver indisponivel", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2, false, 503);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await assert.rejects(
      () =>
        cancelBaneseBoleto(
          adminForBaneseReservation(true),
          "sandbox",
          cancellationInput,
        ),
      /PagamentosEfetivados.*falhou.*503/i,
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
