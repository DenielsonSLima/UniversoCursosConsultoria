import assert from "node:assert/strict";
import { recoverBanesePixOnly } from "./banese-pix-only-recovery.ts";

const RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";

const buildContext = () => ({
  receivable: {
    id: RECEIVABLE_ID,
    cliente_id: "33333333-3333-4333-8333-333333333333",
    status: "PENDENTE",
    valor: 99.9,
    data_vencimento: "2026-09-07",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "000097302",
    gateway_boleto_nosso_numero: "000097302",
    gateway_boleto_convenio: "15261",
    gateway_boleto_agencia: "033",
    gateway_boleto_linha_digitavel: "0".repeat(47),
    gateway_boleto_codigo_barras: "0".repeat(44),
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_financial_terms: {
      nominalAmount: 99.9,
      dueDate: "2026-09-07",
    },
    gateway_financial_terms_confirmed_at: "2026-08-31T20:00:00Z",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_REGISTERED",
    gateway_cnab_file_id: null,
    gateway_creation_token: null,
    gateway_status: "PENDING",
  },
  metadata: {
    baneseConta: "100649",
    baneseAgencia: "033",
  },
  payerDocument: "05911811502",
  transactions: [{
    amount: 99.9,
    bank_slip_our_number: "000097302",
    remote_payment_id: "000097302",
  }],
});

const snapshot = (pix = true) => ({
  nossoNumero: "97302",
  financialTerms: {
    nominalAmount: 99.9,
    dueDate: "2026-09-07",
    discount: null,
    penalty: null,
    interest: null,
  },
  financialTermsError: null,
  situationCode: 2,
  remoteStatus: "PENDING",
  paid: false,
  payments: [],
  paymentsError: null,
  pixPayload: pix ? "000201-pix-oficial" : null,
  pixEncodedImage: pix ? "data:image/png;base64,oficial" : null,
  raw: {},
});

Deno.test("recuperacao Pix-only faz GET e nao liquida nem recria titulo", async () => {
  const context = buildContext();
  let queryCalls = 0;
  const signal = new AbortController().signal;
  const result = await recoverBanesePixOnly({}, RECEIVABLE_ID, {
    readContext: () => Promise.resolve(context),
    signal,
    queryBoleto: (_admin, environment, input) => {
      queryCalls += 1;
      assert.equal(environment, "production");
      assert.equal(input.nossoNumero, "000097302");
      assert.equal(input.recoverPix, true);
      assert.notEqual(input.skipEffectivePaymentsWhenOfficiallyUnpaid, true);
      assert.equal(input.signal, signal);
      return Promise.resolve(snapshot() as any);
    },
    recoverPix: (_admin, input) => {
      input.receivable.gateway_pix_payload = input.snapshot.pixPayload;
      input.receivable.gateway_pix_encoded_image =
        input.snapshot.pixEncodedImage;
      return Promise.resolve({
        bankNumbers: null,
        pixPayload: input.snapshot.pixPayload,
        pixEncodedImage: input.snapshot.pixEncodedImage,
        persisted: true,
      });
    },
  });

  assert.equal(queryCalls, 1);
  assert.equal(result.queried, true);
  assert.equal(result.recovered, true);
  assert.equal(context.receivable.status, "PENDENTE");
  assert.equal(context.receivable.gateway_pix_payload, "000201-pix-oficial");
});

Deno.test("GET sem QrCode preserva titulo para retentativa futura", async () => {
  const context = buildContext();
  const result = await recoverBanesePixOnly({}, RECEIVABLE_ID, {
    readContext: () => Promise.resolve(context),
    queryBoleto: () => Promise.resolve(snapshot(false) as any),
    recoverPix: () =>
      Promise.resolve({
        bankNumbers: null,
        pixPayload: "",
        pixEncodedImage: "",
        persisted: false,
      }),
  });

  assert.equal(result.queried, true);
  assert.equal(result.recovered, false);
  assert.equal(context.receivable.gateway_pix_payload, null);
  assert.equal(context.receivable.status, "PENDENTE");
});

Deno.test("identidade remota divergente bloqueia persistencia Pix", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({ ...snapshot(), nossoNumero: "000097303" } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    /Nosso Numero.*diverge/i,
  );
  assert.equal(persistenceCalls, 0);
});

Deno.test("pagamento efetivado com situacao defasada bloqueia o Pix", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({
            ...snapshot(),
            situationCode: 2,
            remoteStatus: "PAID",
            paid: true,
            payments: [{ value: 99.9 }],
          } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    /nao esta pendente e sem pagamento confirmado/i,
  );
  assert.equal(persistenceCalls, 0);
});

Deno.test("boleto cancelado bloqueia o Pix", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({
            ...snapshot(),
            situationCode: 5,
            remoteStatus: "CANCELED",
          } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    /nao esta pendente e sem pagamento confirmado/i,
  );
  assert.equal(persistenceCalls, 0);
});

Deno.test("falha ao confirmar pagamentos bloqueia o Pix", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  const paymentsError = new Error(
    "Banese recusou consulta de pagamentos efetivados (503).",
  );
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({
            ...snapshot(),
            paymentsError,
          } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    (error) => error === paymentsError,
  );
  assert.equal(persistenceCalls, 0);
});

Deno.test("termos remotos invalidos bloqueiam Pix antes da persistencia", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({
            ...snapshot(),
            financialTermsError: new Error("termos remotos invalidos"),
          } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    /termos remotos invalidos/i,
  );
  assert.equal(persistenceCalls, 0);
});

Deno.test("termos remotos divergentes bloqueiam Pix antes da persistencia", async () => {
  const context = buildContext();
  let persistenceCalls = 0;
  await assert.rejects(
    () =>
      recoverBanesePixOnly({}, RECEIVABLE_ID, {
        readContext: () => Promise.resolve(context),
        queryBoleto: () =>
          Promise.resolve({
            ...snapshot(),
            financialTerms: {
              ...snapshot().financialTerms,
              penalty: {
                type: "fixed",
                value: 5,
                startsOn: "2026-09-08",
              },
            },
          } as any),
        recoverPix: () => {
          persistenceCalls += 1;
          return Promise.reject(new Error("nao deveria persistir"));
        },
      }),
    /divergem/i,
  );
  assert.equal(persistenceCalls, 0);
});
