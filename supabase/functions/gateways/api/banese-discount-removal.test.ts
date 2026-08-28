import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { normalizeBaneseFinancialTerms } from "../../banese/internal/financial-terms.ts";
import {
  BANESE_DISCOUNT_REMOVAL_PENDING,
  repairMarkedBaneseReenrollmentDiscount,
} from "./banese-discount-removal.ts";
import { assertDiscountRemovalRemoteProof } from "./banese-discount-removal-stages.ts";
import { reconcileBaneseReceivable } from "./banese.ts";
import { fakeAdmin } from "./banese-test-harness.ts";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const CLASS_ID = "44444444-4444-4444-8444-444444444444";
const ISSUER_ID = "44444444-4444-4444-4444-444444444444";
const termsWithDiscount = normalizeBaneseFinancialTerms(
  {
    ...BANESE_DOCUMENT_FIXTURE.financialTerms!,
    nominalAmount: 100,
  },
);
const termsWithoutDiscount = normalizeBaneseFinancialTerms({
  ...termsWithDiscount,
  discount: null,
});
const canonicalRuleTerms = normalizeBaneseFinancialTerms({
  nominalAmount: 100,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  discount: null,
  penalty: null,
  interest: { type: "monthly-percentage", value: 2 },
});

const modulo10Digit = (value: string) => {
  let weight = 2;
  let total = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const product = Number(value[index]) * weight;
    total += product > 9 ? product - 9 : product;
    weight = weight === 2 ? 1 : 2;
  }
  return String((10 - total % 10) % 10);
};

const generalDigit = (barcode: string) => {
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

const bankNumbersForOneHundred = () => {
  const source = BANESE_DOCUMENT_FIXTURE.barcode;
  const placeholder = `${source.slice(0, 4)}0${source.slice(5, 9)}0000010000${
    source.slice(19)
  }`;
  const barcode = `${placeholder.slice(0, 4)}${generalDigit(placeholder)}${
    placeholder.slice(5)
  }`;
  const fields = [
    `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`,
    barcode.slice(24, 34),
    barcode.slice(34, 44),
  ];
  return {
    barcode,
    digitableLine: `${fields[0]}${modulo10Digit(fields[0])}${fields[1]}${
      modulo10Digit(fields[1])
    }${fields[2]}${modulo10Digit(fields[2])}${barcode[4]}${
      barcode.slice(5, 19)
    }`,
  };
};

const BANK_NUMBERS = bankNumbersForOneHundred();

const receivableFixture = (overrides: Record<string, unknown> = {}) => ({
  id: BANESE_DOCUMENT_FIXTURE.receivableId,
  cliente_id: CLIENT_ID,
  matricula_id: ENROLLMENT_ID,
  turma_id: CLASS_ID,
  polo_id: ISSUER_ID,
  tipo_lancamento: "REMATRICULA",
  parcela_numero: 0,
  valor: 100,
  data_vencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  status: "PENDENTE",
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_status: "PENDING",
  gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  gateway_cnab_file_id: null,
  gateway_creation_token: null,
  gateway_boleto_issued_at: "2026-07-16T12:00:00.000Z",
  gateway_boleto_linha_digitavel: BANK_NUMBERS.digitableLine,
  gateway_boleto_codigo_barras: BANK_NUMBERS.barcode,
  gateway_boleto_nosso_numero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_boleto_convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  gateway_boleto_agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
  gateway_issuer_polo_id: ISSUER_ID,
  gateway_pix_payload: "pix-oficial-banese",
  gateway_pix_encoded_image: "data:image/png;base64,cGl4LW9maWNpYWw=",
  gateway_financial_terms: termsWithDiscount,
  gateway_financial_terms_confirmed_at: "2026-08-27T12:00:00.000Z",
  regra_financeira_tecnica_snapshot: {
    origem: "TURMA",
    tipoLancamento: "REMATRICULA",
    aplicarDesconto: true,
    aplicarMultaJuros: true,
  },
  gateway_last_error: BANESE_DISCOUNT_REMOVAL_PENDING,
  updated_at: "2026-08-28T08:00:00.000Z",
  ...overrides,
});

const canonicalTransaction = (receivable: Record<string, any>) => ({
  id: "66666666-6666-4666-8666-666666666666",
  receivable_id: receivable.id,
  provider_code: "banese_card",
  environment: "production",
  payment_method: "BOLETO",
  remote_payment_id: receivable.gateway_payment_id,
  bank_slip_our_number: receivable.gateway_boleto_nosso_numero,
  bank_slip_digitable_line: receivable.gateway_boleto_linha_digitavel,
  bank_slip_barcode: receivable.gateway_boleto_codigo_barras,
  pix_payload: receivable.gateway_pix_payload,
  pix_encoded_image: receivable.gateway_pix_encoded_image,
  remote_status: "PENDING",
  amount: receivable.valor,
});

const successfulDependencies = (
  receivable: Record<string, any>,
  calls: string[],
) => ({
  loadContext: async () => {
    calls.push("context");
    return {
      metadata: {
        baneseBoletoConvenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        baneseAgencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
        baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
      },
      payerDocument: BANESE_DOCUMENT_FIXTURE.payer.document,
      canonicalFinancialTerms: canonicalRuleTerms,
    };
  },
  loadTransactions: async () => {
    calls.push("transactions");
    return [canonicalTransaction(receivable)];
  },
  queryBoleto: async (
    _admin: unknown,
    environment: string,
    input: Record<string, unknown>,
  ) => {
    calls.push("get");
    assert.equal(environment, "production");
    assert.equal(input.validateTitleIdentity, true);
    assert.equal(
      input.expectedPayerDocument,
      BANESE_DOCUMENT_FIXTURE.payer.document,
    );
    assert.equal(input.expectedAmount, receivable.valor);
    assert.equal(input.expectedDueDate, receivable.data_vencimento);
    return {
      convenio: input.convenio,
      nossoNumero: receivable.gateway_boleto_nosso_numero,
      situationCode: 2,
      remoteStatus: "OPEN",
      paid: false,
      payments: [],
      financialTerms: termsWithDiscount,
      financialTermsError: null,
      paymentsError: null,
      pixPayload: null,
      pixEncodedImage: null,
      raw: { CodigoSituacaoBoleto: 2 },
    } as any;
  },
  ensureFinancialTerms: async (
    _admin: unknown,
    environment: string,
    input: Record<string, any>,
  ) => {
    calls.push("put-confirm");
    assert.equal(environment, "production");
    assert.equal(input.allowDiscountRemoval, true);
    assert.equal(input.nossoNumero, receivable.gateway_boleto_nosso_numero);
    assert.equal(input.financialTerms.discount, null);
    return {
      financialTerms: termsWithoutDiscount,
      raw: {
        NossoNumero: receivable.gateway_boleto_nosso_numero,
        NumeroLinhaDigitavel: receivable.gateway_boleto_linha_digitavel,
        NumeroCodigoBarras: receivable.gateway_boleto_codigo_barras,
        ValorNominal: receivable.valor,
        DataVencimento: receivable.data_vencimento,
        CodigoSituacaoBoleto: 2,
        Desconto: [],
      },
    };
  },
  persistCorrection: async (
    _admin: unknown,
    input: Record<string, any>,
  ) => {
    calls.push("rpc");
    assert.equal(input.actorId, null);
    assert.equal(input.expectedFinancialTerms.discount?.value, 19.9);
    assert.equal(input.correctedFinancialTerms.discount, null);
    assert.equal(input.expectedTechnicalSnapshot.aplicarDesconto, true);
    assert.equal(input.correctedTechnicalSnapshot.aplicarDesconto, false);
    return {
      ...receivable,
      gateway_financial_terms: termsWithoutDiscount,
      regra_financeira_tecnica_snapshot: input.correctedTechnicalSnapshot,
      gateway_last_error: null,
      updated_at: "2026-08-28T09:00:00.000Z",
    };
  },
});

Deno.test("reparo marcado remove somente desconto apos GET forte e confirmacao", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const result = await repairMarkedBaneseReenrollmentDiscount(
    {},
    { receivable },
    successfulDependencies(receivable, calls) as any,
  );

  assert.deepEqual(calls, [
    "context",
    "transactions",
    "get",
    "put-confirm",
    "rpc",
  ]);
  assert.equal(result.success, true);
  assert.equal(result.repairedDiscount, true);
  assert.equal(result.receivable.gateway_financial_terms.discount, null);
  assert.equal(result.receivable.gateway_pix_payload, "pix-oficial-banese");
  assert.equal(result.receivable.valor, receivable.valor);
});

Deno.test("retry persiste sem novo PUT quando o banco ja removeu o desconto", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const dependencies = successfulDependencies(receivable, calls);
  dependencies.queryBoleto = async () => {
    calls.push("get");
    return {
      nossoNumero: receivable.gateway_boleto_nosso_numero,
      situationCode: 2,
      remoteStatus: "OPEN",
      paid: false,
      payments: [],
      financialTerms: termsWithoutDiscount,
      financialTermsError: null,
      paymentsError: null,
      raw: {
        NossoNumero: receivable.gateway_boleto_nosso_numero,
        NumeroLinhaDigitavel: receivable.gateway_boleto_linha_digitavel,
        NumeroCodigoBarras: receivable.gateway_boleto_codigo_barras,
        ValorNominal: receivable.valor,
        DataVencimento: receivable.data_vencimento,
        CodigoSituacaoBoleto: 2,
        Desconto: [],
      },
    } as any;
  };
  dependencies.ensureFinancialTerms = async () => {
    calls.push("put-confirm");
    throw new Error("PUT nao deveria ser repetido");
  };

  const result = await repairMarkedBaneseReenrollmentDiscount(
    {},
    { receivable },
    dependencies as any,
  );

  assert.deepEqual(calls, ["context", "transactions", "get", "rpc"]);
  assert.equal(result.repairedDiscount, true);
});

Deno.test("regra canonica divergente bloqueia antes de consultar ou alterar o banco", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const dependencies = successfulDependencies(receivable, calls);
  dependencies.loadContext = async () => ({
    metadata: {
      baneseBoletoConvenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
      baneseAgencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
      baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
    },
    payerDocument: BANESE_DOCUMENT_FIXTURE.payer.document,
    canonicalFinancialTerms: termsWithDiscount,
  });

  await assert.rejects(
    () =>
      repairMarkedBaneseReenrollmentDiscount(
        {},
        { receivable },
        dependencies as any,
      ),
    /regra canonica.*sem desconto/i,
  );
  assert.equal(calls.includes("get"), false);
  assert.equal(calls.includes("put-confirm"), false);
  assert.equal(calls.includes("rpc"), false);
});

Deno.test("boleto pago ou sem situacao pendente nunca chega ao PUT", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const dependencies = successfulDependencies(receivable, calls);
  dependencies.queryBoleto = async () => {
    calls.push("get");
    return {
      nossoNumero: receivable.gateway_boleto_nosso_numero,
      situationCode: 3,
      remoteStatus: "PAID",
      paid: true,
      payments: [{ ValorPago: receivable.valor }],
      financialTerms: termsWithDiscount,
      financialTermsError: null,
      paymentsError: null,
    } as any;
  };

  await assert.rejects(
    () =>
      repairMarkedBaneseReenrollmentDiscount(
        {},
        { receivable },
        dependencies as any,
      ),
    /nao esta pendente/i,
  );
  assert.equal(calls.includes("put-confirm"), false);
  assert.equal(calls.includes("rpc"), false);
});

Deno.test("transacao bancaria divergente bloqueia antes do GET e do PUT", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const dependencies = successfulDependencies(receivable, calls);
  dependencies.loadTransactions = async () => {
    calls.push("transactions");
    return [{
      ...canonicalTransaction(receivable),
      bank_slip_barcode: BANK_NUMBERS.barcode.replace(/.$/, "0"),
    }];
  };

  await assert.rejects(
    () =>
      repairMarkedBaneseReenrollmentDiscount(
        {},
        { receivable },
        dependencies as any,
      ),
    /Transacao da rematricula diverge/i,
  );
  assert.equal(calls.includes("get"), false);
  assert.equal(calls.includes("put-confirm"), false);
  assert.equal(calls.includes("rpc"), false);
});

Deno.test("mudanca de identidade pela RPC falha fechada e preserva o snapshot esperado", async () => {
  const receivable = receivableFixture();
  const calls: string[] = [];
  const dependencies = successfulDependencies(receivable, calls);
  dependencies.persistCorrection = async () => ({
    ...receivable,
    valor: Number(receivable.valor) + 1,
    gateway_financial_terms: termsWithoutDiscount,
    regra_financeira_tecnica_snapshot: {
      ...receivable.regra_financeira_tecnica_snapshot,
      aplicarDesconto: false,
    },
    gateway_last_error: null,
  });

  await assert.rejects(
    () =>
      repairMarkedBaneseReenrollmentDiscount(
        {},
        { receivable },
        dependencies as any,
      ),
    /identidade imutavel/i,
  );
  assert.equal(receivable.valor, 100);
  assert.equal(receivable.gateway_financial_terms.discount?.value, 19.9);
});

Deno.test("conciliador delega somente o marcador exato e sem ator fabricado", async () => {
  const receivable = receivableFixture();
  const admin = fakeAdmin(receivable);
  let delegated = 0;
  const result = await reconcileBaneseReceivable(admin, receivable.id, {
    repairDiscountRemoval: async (_admin, input) => {
      delegated += 1;
      assert.equal(input.receivable.id, receivable.id);
      assert.equal(
        input.receivable.gateway_last_error,
        BANESE_DISCOUNT_REMOVAL_PENDING,
      );
      assert.equal(input.actorId, null);
      return {
        success: true,
        repairedDiscount: true,
        receivable,
        remoteStatus: "OPEN",
        paid: false,
        payments: 0,
        futureSyncWarning: null,
      };
    },
  });

  assert.equal("repairedDiscount" in result && result.repairedDiscount, true);
  assert.equal(delegated, 1);
});

Deno.test("marcador aproximado nao aciona o reparo especial", async () => {
  const receivable = receivableFixture({
    gateway_last_error: `${BANESE_DISCOUNT_REMOVAL_PENDING}:detalhe`,
  });
  const admin = fakeAdmin(receivable);
  let delegated = 0;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, receivable.id, {
        repairDiscountRemoval: async () => {
          delegated += 1;
          throw new Error("nao deveria executar");
        },
      }),
    /pedido financeiro|producao|consulta|credencial/i,
  );
  assert.equal(delegated, 0);
});

Deno.test("aceita tombstone vazio oficial sem aceitar desconto ativo", () => {
  const input = {
    snapshot: {
      NossoNumero: "000097256",
      CodigoSituacaoBoleto: 2,
      NumeroLinhaDigitavel: "123",
      NumeroCodigoBarras: "456",
      ValorNominal: 100,
      DataVencimento: "2026-10-15",
      Desconto: [{
        TipoDesconto: 0,
        Valor: null,
        Data: "0001-01-01T00:00:00",
      }],
    },
    receivable: {
      gateway_boleto_linha_digitavel: "123",
      gateway_boleto_codigo_barras: "456",
    },
    nossoNumero: "000097256",
    amount: 100,
    dueDate: "2026-10-15",
  };
  assert.doesNotThrow(() => assertDiscountRemovalRemoteProof(input));
  assert.throws(
    () =>
      assertDiscountRemovalRemoteProof({
        ...input,
        snapshot: {
          ...input.snapshot,
          Desconto: [{ TipoDesconto: 1, Valor: 19.9, Data: "2026-10-15" }],
        },
      }),
    /REMOTE_PROOF:DISCOUNT/,
  );
});
