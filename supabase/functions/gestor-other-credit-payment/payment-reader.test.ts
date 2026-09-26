import assert from "node:assert/strict";
import {
  buildOtherCreditPaymentDto,
  OTHER_CREDIT_PAYMENT_SELECT,
  type OtherCreditRow,
  parseOtherCreditRequest,
  PaymentReadError,
  readOtherCreditPayment,
} from "./payment-reader.ts";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../banese/internal/testing/pix-fixture.ts";

const POLO = "11111111-1111-1111-1111-111111111111";
const OTHER_POLO = "22222222-2222-2222-2222-222222222222";
const ID = bank.receivableId;
const rowAt = (overrides: Record<string, unknown> = {}): OtherCreditRow => ({
  id: ID,
  polo_id: POLO,
  categoria: "OUTROS_CREDITOS",
  descricao: "Crédito de teste",
  origem_pagamento: "BANESE",
  matricula_id: null,
  turma_id: null,
  valor: bank.amount,
  valor_pago: null,
  data_vencimento: bank.dueDate,
  data_pagamento: null,
  status: "PENDENTE",
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_status: "REGISTERED",
  gateway_submission_status: "API_REGISTERED",
  gateway_boleto_linha_digitavel: bank.digitableLine,
  gateway_boleto_codigo_barras: bank.barcode,
  gateway_boleto_nosso_numero: bank.ourNumber,
  gateway_pix_payload: buildBanesePixPayloadFixture("PDVTEST", bank.amount),
  gateway_pix_encoded_image: buildBanesePixImageFixture(1),
  parceiros: { nome: "Cliente de teste", cpf_cnpj: "00000000000" },
  ...overrides,
});

const request = (token = "session") =>
  new Request("https://example.test/payment", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const mockAdmin = (options: {
  row?: OtherCreditRow | null;
  user?: Record<string, unknown> | null;
  authError?: boolean;
  institutionAllowed?: boolean;
  loan?: boolean;
} = {}) => {
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const authTokens: string[] = [];
  const user = {
    id: "33333333-3333-4333-8333-333333333333",
    email: "gestor@example.test",
    perfil: "financeiro",
    status: "ATIVO",
    context: POLO,
    polo_ids: [POLO],
    permissoes: {
      modules: ["financeiro"],
      tabs: { financeiro: ["outros-creditos"] },
    },
    ...options.user,
  };
  const admin = {
    auth: {
      getUser: (token: string) => {
        authTokens.push(token);
        return Promise.resolve({
          data: {
            user: options.authError ? null : {
              id: "44444444-4444-4444-8444-444444444444",
              email: user.email,
            },
          },
          error: options.authError ? new Error("Invalid token") : null,
        });
      },
    },
    rpc: (name: string) => {
      assert.equal(name, "portal_identidade_institucional_acesso_liberado");
      return Promise.resolve({
        data: options.institutionAllowed !== false,
        error: null,
      });
    },
    from: (table: string) => {
      assert.ok(
        ["usuarios_sistema", "contas_receber", "emprestimos_financeiros"]
          .includes(table),
      );
      const read = { table, filters: [] as Array<[string, unknown]> };
      reads.push(read);
      const builder = {
        select: (columns: string) => {
          if (table === "contas_receber") {
            assert.equal(columns, OTHER_CREDIT_PAYMENT_SELECT);
          }
          return builder;
        },
        eq: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return builder;
        },
        ilike: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return builder;
        },
        limit: (limit: number) => {
          assert.equal(limit, 1);
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: table === "usuarios_sistema"
              ? options.user === null ? null : user
              : table === "contas_receber"
              ? options.row === undefined ? rowAt() : options.row
              : options.loan
              ? { id: "loan" }
              : null,
            error: null,
          }),
      };
      return builder;
    },
  };
  return { admin, reads, authTokens };
};

const rejectsStatus = (operation: Promise<unknown>, status: number) =>
  assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof PaymentReadError && error.status === status,
  );

Deno.test("get exige ID UUID e não aceita ação de emissão/refresh", () => {
  assert.equal(
    parseOtherCreditRequest({ action: "get", receivableId: ID }),
    ID,
  );
  for (
    const body of [null, [], { action: "refresh", receivableId: ID }, {
      action: "create",
      receivableId: ID,
    }, { action: "get", receivableId: "id OR 1=1" }]
  ) {
    assert.throws(() => parseOtherCreditRequest(body), PaymentReadError);
  }
});

Deno.test("JWT é validado antes de consultar recebível; sessão ausente/inválida é negada", async () => {
  for (const noToken of [true, false]) {
    const mock = mockAdmin({ authError: !noToken });
    await rejectsStatus(
      readOtherCreditPayment(request(noToken ? "" : "invalid"), mock.admin, ID),
      401,
    );
    assert.equal(mock.reads.length, 0);
    assert.deepEqual(mock.authTokens, noToken ? [] : ["invalid"]);
  }
});

Deno.test("gestor inativo, identidade institucional bloqueada e ausência da aba não leem cobrança", async () => {
  const cases = [
    { user: { status: "INATIVO" } },
    { institutionAllowed: false },
    {
      user: {
        permissoes: {
          modules: ["financeiro"],
          tabs: { financeiro: ["receber"] },
        },
      },
    },
    {
      user: {
        permissoes: { modules: [], tabs: { financeiro: ["outros-creditos"] } },
      },
    },
  ];
  for (const options of cases) {
    const mock = mockAdmin(options);
    await rejectsStatus(readOtherCreditPayment(request(), mock.admin, ID), 403);
    assert.equal(
      mock.reads.some((read) => read.table === "contas_receber"),
      false,
    );
  }
});

Deno.test("leitura usa a permissão da aba, sem exigir perfil com escrita", async () => {
  const mock = mockAdmin({ user: { perfil: "consulta" } });
  const result = await readOtherCreditPayment(request(), mock.admin, ID);
  assert.equal(result.payment.id, ID);
  assert.equal(result.canRefresh, false);
  assert.deepEqual(mock.authTokens, ["session"]);
  assert.deepEqual(
    mock.reads.find((read) => read.table === "contas_receber")?.filters,
    [["id", ID]],
  );
  assert.deepEqual(
    mock.reads.find((read) => read.table === "emprestimos_financeiros")
      ?.filters,
    [["conta_receber_id", ID]],
  );
});

Deno.test("polo diferente ou inexistente não revela QR nem consulta vínculos secundários", async () => {
  for (const polo of [OTHER_POLO, null]) {
    const mock = mockAdmin({ row: rowAt({ polo_id: polo }) });
    await rejectsStatus(readOtherCreditPayment(request(), mock.admin, ID), 403);
    assert.equal(
      mock.reads.some((read) => read.table === "emprestimos_financeiros"),
      false,
    );
  }
});

Deno.test("escopo global explícito permite outra unidade, sem contornar aba", async () => {
  const mock = mockAdmin({
    row: rowAt({ polo_id: OTHER_POLO }),
    user: {
      context: null,
      polo_ids: [],
      permissoes: {
        allPolos: true,
        modules: ["financeiro"],
        tabs: { financeiro: ["outros-creditos"] },
      },
    },
  });
  assert.equal(
    (await readOtherCreditPayment(request(), mock.admin, ID)).canPay,
    true,
  );
});

Deno.test("exclui Proesc/legado, matrícula, turma, categoria e gateway fora do PDV", () => {
  for (
    const change of [
      { origem_pagamento: "SISTEMA_ANTERIOR" },
      { origem_pagamento: "PROESC" },
      { matricula_id: ID },
      { turma_id: ID },
      { categoria: "MENSALIDADE" },
      { gateway_provider: "asaas" },
      { gateway_payment_method: "PIX" },
    ]
  ) {
    assert.throws(
      () => buildOtherCreditPaymentDto(rowAt(change)),
      PaymentReadError,
    );
  }
});

Deno.test("empréstimo e ID não encontrado não entram no leitor de Outros Créditos", async () => {
  for (
    const options of [{ loan: true }, { row: null }, {
      row: rowAt({ id: OTHER_POLO }),
    }]
  ) {
    const mock = mockAdmin(options);
    await rejectsStatus(readOtherCreditPayment(request(), mock.admin, ID), 404);
  }
});

Deno.test("boleto e par Pix persistidos válidos são devolvidos sem dados brutos", () => {
  const result = buildOtherCreditPaymentDto(rowAt({
    raw_payload: { secret: "segredo" },
    gateway_last_error: "erro com dado privado",
  }));
  assert.equal(result.canPay, true);
  assert.equal(result.boletoAvailable, true);
  assert.equal(result.pixState, "available");
  assert.equal(result.payment.gateway_pix_payload, rowAt().gateway_pix_payload);
  assert.match(
    result.payment.gateway_pix_encoded_image!,
    /^data:image\/png;base64,/,
  );
  assert.equal(result.customerName, "Cliente de teste");
  assert.equal(result.needsReview, false);
  for (
    const privateText of [
      "cpf_cnpj",
      "raw_payload",
      "gateway_last_error",
      "segredo",
      "00000000000",
    ]
  ) {
    assert.equal(JSON.stringify(result).includes(privateText), false);
  }
});

Deno.test("pago/cancelado local ou remoto não entrega meios de pagamento", () => {
  for (
    const change of [
      { status: "PAGO", valor_pago: 260, data_pagamento: "2026-09-19" },
      { status: "CANCELADO" },
      { status: "ESTORNADO" },
      { gateway_status: "PAID" },
      { gateway_status: "CONFIRMED" },
      { gateway_status: "CANCELED_BY_BANK" },
      { gateway_status: "DELETED" },
    ]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(change));
    assert.equal(result.canPay, false);
    assert.equal(result.boletoAvailable, false);
    assert.equal(result.payment.gateway_pix_payload, null);
    assert.equal(result.payment.gateway_pix_encoded_image, null);
    assert.equal(result.payment.gateway_boleto_linha_digitavel, null);
    if (change.status === "PAGO") assert.equal(result.payment.valor_pago, 260);
  }
});

Deno.test("registro novo sem identidade retorna pendente; ambíguo/quarentena bloqueia códigos", () => {
  const pending = buildOtherCreditPaymentDto(rowAt({
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_boleto_nosso_numero: null,
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_status: "REGISTERING",
  }));
  assert.equal(pending.canPay, false);
  assert.equal(pending.pixState, "pending");
  assert.equal(pending.needsReview, false);
  for (
    const change of [
      { gateway_submission_status: "API_AMBIGUOUS" },
      { gateway_submission_status: "API_REVIEW" },
      { gateway_status: "CREATING" },
      { gateway_last_error: "BANESE_IDENTITY_QUARANTINED: privado" },
      { asaas_last_error: "BANESE_IDENTITY_QUARANTINED: privado" },
      { gateway_environment: null },
    ]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(change));
    assert.equal(result.canPay, false);
    assert.equal(result.payment.gateway_pix_payload, null);
    assert.equal(result.needsReview, true);
  }
});

Deno.test("Pix parcial/CRC/valor/imagem inválidos preservam somente boleto válido", () => {
  for (
    const change of [
      { gateway_pix_payload: null },
      { gateway_pix_encoded_image: null },
      { gateway_pix_payload: "000201INVALID" },
      {
        gateway_pix_payload: buildBanesePixPayloadFixture(
          "OTHER",
          bank.amount + 1,
        ),
      },
      { gateway_pix_encoded_image: "https://example.test/private.png" },
    ]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(change));
    assert.equal(result.boletoAvailable, true);
    assert.equal(result.pixState, "pending");
    assert.equal(result.payment.gateway_pix_payload, null);
    assert.equal(result.payment.gateway_pix_encoded_image, null);
    assert.equal(result.needsReview, true);
  }
});

Deno.test("boleto divergente em valor/vencimento/DV bloqueia também o Pix", () => {
  for (
    const change of [
      { valor: bank.amount + 1 },
      { data_vencimento: "2026-09-15" },
      { gateway_boleto_linha_digitavel: "0".repeat(47) },
      { gateway_boleto_nosso_numero: null },
    ]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(change));
    assert.equal(result.canPay, false);
    assert.equal(result.payment.gateway_pix_payload, null);
    assert.equal(result.needsReview, true);
  }
});

Deno.test("sandbox oculta Pix mesmo com par persistido; campos textuais não vazam documentos", () => {
  const result = buildOtherCreditPaymentDto(rowAt({
    gateway_environment: "sandbox",
    parceiros: [{ nome: "Cliente 000.000.000-00" }],
    descricao: "Crédito https://example.test/?token=segredo",
  }));
  assert.equal(result.pixState, "sandbox-unavailable");
  assert.equal(result.payment.gateway_pix_payload, null);
  assert.equal(result.boletoAvailable, true);
  assert.equal(JSON.stringify(result).includes("segredo"), false);
  assert.equal(result.customerName.includes("000.000.000-00"), false);
});
