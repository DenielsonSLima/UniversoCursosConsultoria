import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../banese/internal/testing/pix-fixture.ts";
import {
  buildBaneseStudentPaymentDto,
  deriveOpaqueGroupMarker,
  isActiveStudentStatus,
  maskStudentDocument,
  sanitizeBaneseStudentCharge,
  selectSafeInstallmentRows,
  UUID_RE,
} from "./payment-dto.ts";
import type { BaneseStudentPaymentRow } from "./types.ts";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const ISSUER_ID = "44444444-4444-4444-8444-444444444444";
const GROUP_MARKER = "grp_abcdefghijklmnopqrstuvwxyz123456";

const rowAt = (
  index: number,
  overrides: Partial<BaneseStudentPaymentRow> = {},
): BaneseStudentPaymentRow => {
  const bank = baneseDocumentFixtureAt(index);
  return {
    id: bank.receivableId,
    cliente_id: CLIENT_ID,
    matricula_id: ENROLLMENT_ID,
    descricao: `Mensalidade ${index + 1}`,
    categoria: "MENSALIDADE",
    tipo_lancamento: "PARCELA",
    parcela_numero: index + 1,
    valor: bank.amount,
    valor_pago: null,
    data_vencimento: bank.dueDate,
    data_pagamento: null,
    status: "PENDENTE",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "2",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_issuer_polo_id: ISSUER_ID,
    gateway_financial_terms: bank.financialTerms || null,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:00:00Z",
    turmas: {
      nome: "Técnico em Administração",
      cursos: { nome: "Curso Técnico", modalidade: "TECNICO" },
    },
    ...overrides,
  };
};

Deno.test("aceita somente UUID de cobranca com formato estrito", () => {
  assert.equal(UUID_RE.test(rowAt(0).id), true);
  assert.equal(UUID_RE.test("1 OR 1=1"), false);
  assert.equal(UUID_RE.test("11111111-1111-1111-1111-111111111111"), false);
});

Deno.test("mascara CPF e CNPJ sem devolver o documento completo", () => {
  assert.equal(maskStudentDocument("059.118.115-02"), "***.***.***-02");
  assert.equal(maskStudentDocument("13.278.137/0001-54"), "**.***.***/0001-**");
  assert.equal(maskStudentDocument("invalido"), "Documento protegido");
});

Deno.test("considera bloqueios explicitos e preserva status legado nulo como ativo", () => {
  assert.equal(isActiveStudentStatus("ATIVO"), true);
  assert.equal(isActiveStudentStatus(null), true);
  assert.equal(isActiveStudentStatus("BLOQUEADO"), false);
  assert.equal(isActiveStudentStatus("cancelado"), false);
});

Deno.test("remove Pix incondicionalmente no ambiente de homologacao", () => {
  const dto = sanitizeBaneseStudentCharge(
    rowAt(0, {
      gateway_pix_payload: "payload-invalido-que-nao-deve-ser-validado",
      gateway_pix_encoded_image: "imagem-invalida-que-nao-deve-ser-validada",
    }),
    GROUP_MARKER,
  );

  assert.deepEqual(dto.pix, {
    state: "sandbox-unavailable",
    copyAndPaste: null,
    qrCodeImage: null,
  });
});

Deno.test("devolve curso, turma e modalidade sem expor identificadores internos", () => {
  const dto = sanitizeBaneseStudentCharge(rowAt(0), GROUP_MARKER);

  assert.equal(dto.courseName, "Curso Técnico");
  assert.equal(dto.courseModality, "TECNICO");
  assert.equal(dto.className, "Técnico em Administração");
});

Deno.test("devolve somente termos financeiros bancarios confirmados", () => {
  const confirmed = sanitizeBaneseStudentCharge(rowAt(0), GROUP_MARKER);
  assert.equal(confirmed.financialTerms.confirmed, true);
  assert.equal(confirmed.financialTerms.discount?.value, 19.9);
  assert.equal(confirmed.financialTerms.penalty?.value, 5);
  assert.equal(confirmed.financialTerms.interest?.value, 5);

  const unconfirmed = sanitizeBaneseStudentCharge(
    rowAt(0, { gateway_financial_terms_confirmed_at: null }),
    GROUP_MARKER,
  );
  assert.deepEqual(unconfirmed.financialTerms, {
    confirmed: false,
    discount: null,
    penalty: null,
    interest: null,
  });
});

Deno.test("falha fechada quando valor ou vencimento local divergem do boleto", () => {
  const base = rowAt(0);
  assert.throws(
    () =>
      sanitizeBaneseStudentCharge(
        rowAt(0, { valor: Number(base.valor) + 1 }),
        GROUP_MARKER,
      ),
    /Valor do recebivel diverge/,
  );
  assert.throws(
    () =>
      sanitizeBaneseStudentCharge(
        rowAt(0, { data_vencimento: "2026-08-11" }),
        GROUP_MARKER,
      ),
    /vencimento/i,
  );
});

Deno.test("devolve BolePix de producao somente apos validar EMV, valor e imagem", () => {
  const dto = sanitizeBaneseStudentCharge(
    rowAt(0, {
      gateway_environment: "production",
      gateway_pix_payload: buildBanesePixPayloadFixture("TXID-ALUNO"),
      gateway_pix_encoded_image: buildBanesePixImageFixture(3),
    }),
    GROUP_MARKER,
  );

  assert.equal(dto.pix.state, "available");
  assert.match(dto.pix.copyAndPaste ?? "", /^000201/);
  assert.match(dto.pix.qrCodeImage ?? "", /^data:image\/png;base64,/);
});

Deno.test("falha fechada quando somente uma parte do BolePix de producao e valida", () => {
  const dto = sanitizeBaneseStudentCharge(
    rowAt(0, {
      gateway_environment: "production",
      gateway_pix_payload: buildBanesePixPayloadFixture("TXID-ALUNO"),
      gateway_pix_encoded_image: "imagem-qr-invalida",
    }),
    GROUP_MARKER,
  );

  assert.deepEqual(dto.pix, {
    state: "pending",
    copyAndPaste: null,
    qrCodeImage: null,
  });
});

Deno.test("forma carne apenas com tres ou mais parcelas bancarias unicas do mesmo emissor", () => {
  const selected = rowAt(0);
  const group = selectSafeInstallmentRows(selected, [
    rowAt(2),
    selected,
    rowAt(1),
  ]);

  assert.equal(group.length, 3);
  assert.deepEqual(group.map((row) => row.parcela_numero), [1, 2, 3]);
});

Deno.test("reduz para titulo individual quando grupo e pequeno, misto ou duplicado", () => {
  const selected = rowAt(0);
  assert.deepEqual(
    selectSafeInstallmentRows(selected, [selected, rowAt(1)]).map((row) =>
      row.id
    ),
    [selected.id],
  );
  assert.deepEqual(
    selectSafeInstallmentRows(selected, [
      selected,
      rowAt(1),
      rowAt(2, {
        gateway_issuer_polo_id: "55555555-5555-4555-8555-555555555555",
      }),
    ]).map((row) => row.id),
    [selected.id],
  );
  assert.deepEqual(
    selectSafeInstallmentRows(selected, [
      selected,
      rowAt(1),
      rowAt(2, {
        gateway_boleto_linha_digitavel: selected.gateway_boleto_linha_digitavel,
        gateway_boleto_codigo_barras: selected.gateway_boleto_codigo_barras,
      }),
    ]).map((row) => row.id),
    [selected.id],
  );
});

Deno.test("matricula e rematricula nunca viram carne", () => {
  const selected = rowAt(0, { tipo_lancamento: "MATRICULA" });
  const group = selectSafeInstallmentRows(selected, [
    selected,
    rowAt(1),
    rowAt(2),
  ]);
  assert.deepEqual(group.map((row) => row.id), [selected.id]);
});

Deno.test("titulo devolvido ou cancelado pelo banco permanece individual", () => {
  const returned = rowAt(0, { status: "DEVOLVIDO" });
  const bankCanceled = rowAt(0, { gateway_status: "CANCELED_BY_BANK" });
  const candidates = [rowAt(0), rowAt(1), rowAt(2)];
  assert.deepEqual(
    selectSafeInstallmentRows(returned, [returned, ...candidates.slice(1)]).map(
      (row) => row.id,
    ),
    [returned.id],
  );
  assert.deepEqual(
    selectSafeInstallmentRows(bankCanceled, [
      bankCanceled,
      ...candidates.slice(1),
    ]).map((row) => row.id),
    [bankCanceled.id],
  );
});

Deno.test("titulo pago nao e reapresentado dentro de carne pagavel", () => {
  const paid = rowAt(0, { status: "PAGO", gateway_status: "PAID" });
  assert.deepEqual(
    selectSafeInstallmentRows(paid, [paid, rowAt(1), rowAt(2)]).map((row) =>
      row.id
    ),
    [paid.id],
  );
  const pending = rowAt(0);
  assert.deepEqual(
    selectSafeInstallmentRows(pending, [
      pending,
      rowAt(1),
      rowAt(2),
      rowAt(3, { status: "PAGO", gateway_status: "PAID" }),
    ]).map((row) => row.id),
    [pending.id, rowAt(1).id, rowAt(2).id],
  );
});

Deno.test("marcador de grupo e deterministico, opaco e isolado por escopo", async () => {
  const secret = "segredo-unitario-com-mais-de-16-caracteres";
  const first = await deriveOpaqueGroupMarker(
    `carnet:${ENROLLMENT_ID}`,
    secret,
  );
  const repeated = await deriveOpaqueGroupMarker(
    `carnet:${ENROLLMENT_ID}`,
    secret,
  );
  const another = await deriveOpaqueGroupMarker(
    `single:${rowAt(0).id}`,
    secret,
  );

  assert.equal(first, repeated);
  assert.notEqual(first, another);
  assert.match(first, /^grp_[A-Za-z0-9_-]{32}$/);
  assert.equal(first.includes(ENROLLMENT_ID), false);
});

Deno.test("DTO final nao expoe identificadores internos, segredo bancario, URL ou CPF", () => {
  const selected = rowAt(0, {
    descricao:
      "Mensalidade do CPF 123.456.789-01 em https://interno.exemplo/segredo",
    gateway_pix_payload: "PIX-NAO-DEVE-SAIR-NA-HOMOLOGACAO",
  });
  const dto = buildBaneseStudentPaymentDto(
    selected,
    [selected],
    GROUP_MARKER,
    { name: "Aluno de Teste", document: "12345678901" },
  );
  const serialized = JSON.stringify(dto);

  assert.equal(serialized.includes(CLIENT_ID), false);
  assert.equal(serialized.includes(ENROLLMENT_ID), false);
  assert.equal(serialized.includes(ISSUER_ID), false);
  assert.equal(serialized.includes("15528"), false);
  assert.equal(serialized.includes("12345678901"), false);
  assert.equal(serialized.includes("123.456.789-01"), false);
  assert.equal(serialized.includes("interno.exemplo"), false);
  assert.equal(serialized.includes("PIX-NAO-DEVE-SAIR"), false);
  assert.equal(serialized.includes("http://"), false);
  assert.equal(serialized.includes("https://"), false);
  assert.equal(dto.payer.documentMasked, "***.***.***-01");
  assert.equal(dto.payment.amountPaid, null);
  assert.equal(
    dto.payment.boleto.digitableLine,
    BANESE_DOCUMENT_FIXTURE.digitableLine,
  );
});
