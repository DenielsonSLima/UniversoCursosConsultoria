import assert from "node:assert/strict";
import { TextDecoder } from "node:util";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "npm:pdf-lib@1.17.1";
import { buildBaneseCarnetPdf } from "../banese/internal/carne/carne-pdf.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { presentBaneseFinancialTerms } from "../banese/internal/pdf/financial-terms.ts";
import {
  buildOtherCreditCarnetDocumentInputs,
  parseOtherCreditPlanDocumentRequest,
  selectOtherCreditCarnetDocumentRows,
} from "./document-policy.ts";
import {
  OTHER_CREDIT_DOCUMENT_ISSUER,
  OTHER_CREDIT_DOCUMENT_METADATA,
  OTHER_CREDIT_DOCUMENT_PAYER,
  otherCreditDocumentFeeAt,
  otherCreditDocumentRowAt,
  PLAN_ID,
  planForOtherCreditRows,
} from "./document-fixture.ts";

// Inspect visible native text operators produced by the existing Helvetica compositor.
const nativePdfText = async (bytes: Uint8Array) => {
  const pdf = await PDFDocument.load(bytes);
  const lines: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const references = contents instanceof PDFArray ? contents.asArray() : [contents!];
    for (const reference of references) {
      const stream = pdf.context.lookup(reference);
      assert.ok(stream instanceof PDFRawStream);
      const commands = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      for (const match of commands.matchAll(/<([\da-f]+)>\s*Tj/gi)) {
        const textBytes = Uint8Array.from(match[1].match(/../g)!, byte => parseInt(byte, 16));
        lines.push(new TextDecoder('windows-1252').decode(textBytes));
      }
    }
  }
  return { pdf, text: lines.join('\n') };
};

Deno.test("documento avulso recebe apenas ID e nunca dados bancários do cliente", () => {
  assert.equal(
    parseOtherCreditPlanDocumentRequest({ planId: PLAN_ID }),
    PLAN_ID,
  );
  for (
    const input of [null, [], { planId: "inválido" }, {
      planId: PLAN_ID,
      receivableIds: [],
    }, { planId: PLAN_ID, amount: 20 }]
  ) {
    assert.throws(() => parseOtherCreditPlanDocumentRequest(input));
  }
});

Deno.test("carnê de Outros Créditos aceita 1 e 2 títulos preservando mínimo acadêmico", async () => {
  for (const count of [1, 2]) {
    const candidates = Array.from(
      { length: count },
      (_, index) => otherCreditDocumentRowAt(index),
    );
    const rows = selectOtherCreditCarnetDocumentRows(
      planForOtherCreditRows(candidates),
      candidates,
    );
    const inputs = buildOtherCreditCarnetDocumentInputs(
      rows,
      OTHER_CREDIT_DOCUMENT_PAYER,
      OTHER_CREDIT_DOCUMENT_ISSUER,
      OTHER_CREDIT_DOCUMENT_METADATA,
    );
    const pdf = await PDFDocument.load(
      await buildBaneseCarnetPdf(inputs, { minItems: 1, maxItems: 62 }),
    );
    assert.equal(pdf.getPageCount(), 1);
    await assert.rejects(
      () => buildBaneseCarnetPdf(inputs),
      /ao menos 3 parcelas/,
    );
  }
});

Deno.test("título registrado após o vencimento mantém carnê e identidade bancária", async () => {
  const candidates = [otherCreditDocumentRowAt(0, {
    status: "VENCIDO",
    gateway_boleto_issued_at: "2026-08-02T00:05:00Z",
    gateway_financial_terms_confirmed_at: "2026-08-02T00:06:00Z",
  })];
  const rows = selectOtherCreditCarnetDocumentRows(
    planForOtherCreditRows(candidates),
    candidates,
  );
  const inputs = buildOtherCreditCarnetDocumentInputs(
    rows,
    OTHER_CREDIT_DOCUMENT_PAYER,
    OTHER_CREDIT_DOCUMENT_ISSUER,
    OTHER_CREDIT_DOCUMENT_METADATA,
  );
  assert.equal(inputs[0].issueDate, "2026-08-02");
  assert.equal(inputs[0].dueDate, "2026-08-01");
  assert.equal(inputs[0].barcode, candidates[0].gateway_boleto_codigo_barras);
  const pdf = await PDFDocument.load(
    await buildBaneseCarnetPdf(inputs, { minItems: 1, maxItems: 62 }),
  );
  assert.equal(pdf.getPageCount(), 1);
});

Deno.test("data de emissão continua exigindo um dia de calendário válido", () => {
  for (
    const issueDate of [
      null,
      "",
      "2026-02-30T00:05:00Z",
      "2026-13-10T00:05:00Z",
    ]
  ) {
    const candidates = [otherCreditDocumentRowAt(0, {
      gateway_boleto_issued_at: issueDate,
    })];
    assert.throws(() =>
      selectOtherCreditCarnetDocumentRows(
        planForOtherCreditRows(candidates),
        candidates,
      )
    );
  }
});

Deno.test("download nunca mistura outro plano, pagador, polo ou vínculo acadêmico", () => {
  const candidates = [0, 1, 2].map((index) => otherCreditDocumentRowAt(index));
  const plan = planForOtherCreditRows(candidates);
  for (
    const overrides of [
      { outros_creditos_plano_id: "88888888-8888-4888-8888-888888888888" },
      { cliente_id: "88888888-8888-4888-8888-888888888888" },
      { polo_id: "88888888-8888-4888-8888-888888888888" },
      { matricula_id: "88888888-8888-4888-8888-888888888888" },
    ]
  ) {
    assert.throws(
      () =>
        selectOtherCreditCarnetDocumentRows(plan, [candidates[0], {
          ...candidates[1],
          ...overrides,
        }, candidates[2]]),
      /fora do plano autorizado/,
    );
  }
});

Deno.test("emissão parcial e mudança financeira nunca viram carnê incompleto", () => {
  const candidates = [0, 1, 2].map((index) => otherCreditDocumentRowAt(index));
  const plan = planForOtherCreditRows(candidates);
  assert.throws(
    () => selectOtherCreditCarnetDocumentRows(plan, candidates.slice(0, 2)),
    /todas as parcelas e taxas/,
  );
  for (
    const overrides of [
      { gateway_boleto_codigo_barras: null },
      { gateway_financial_terms_confirmed_at: null },
      { gateway_submission_status: "API_AMBIGUOUS" },
      { gateway_status: "PAID" },
      { gateway_payment_id: "000001111" },
      {
        gateway_environment: "production",
        gateway_pix_payload: "inválido",
        gateway_pix_encoded_image: "inválida",
      },
      {
        gateway_financial_terms: {
          ...candidates[1].gateway_financial_terms,
          discount: null,
        },
      },
    ]
  ) {
    assert.throws(() =>
      selectOtherCreditCarnetDocumentRows(plan, [candidates[0], {
        ...candidates[1],
        ...overrides,
      }, candidates[2]])
    );
  }
});

Deno.test("retira pagos e cancelados mantendo total original das parcelas", () => {
  const candidates = [0, 1, 2].map((index) => otherCreditDocumentRowAt(index));
  const plan = planForOtherCreditRows(candidates);
  const rows = selectOtherCreditCarnetDocumentRows(plan, [candidates[0], {
    ...candidates[1],
    status: "PAGO",
    gateway_status: "PAID",
  }, { ...candidates[2], status: "CANCELADO" }]);
  const inputs = buildOtherCreditCarnetDocumentInputs(
    rows,
    OTHER_CREDIT_DOCUMENT_PAYER,
    OTHER_CREDIT_DOCUMENT_ISSUER,
    OTHER_CREDIT_DOCUMENT_METADATA,
  );
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].installment, { current: 1, total: 3 });
  assert.ok(inputs[0].instructions!.every((line) => !/TURMA/.test(line)));
});

Deno.test("taxas comerciais opcionais mantêm descrição própria e não aumentam total mensal", async () => {
  const candidates = [0, 1, 2].map((index) => otherCreditDocumentRowAt(index));
  candidates.push(
    otherCreditDocumentFeeAt(3, "MATRICULA"),
    otherCreditDocumentFeeAt(4, "REMATRICULA"),
  );
  const rows = selectOtherCreditCarnetDocumentRows(
    planForOtherCreditRows(candidates),
    candidates,
  );
  const inputs = buildOtherCreditCarnetDocumentInputs(
    rows,
    OTHER_CREDIT_DOCUMENT_PAYER,
    OTHER_CREDIT_DOCUMENT_ISSUER,
    OTHER_CREDIT_DOCUMENT_METADATA,
  );
  assert.deepEqual(inputs.map((input) => input.documentNumber), [
    "MATRICULA",
    "REMATRICULA",
    "PARC-01",
    "PARC-02",
    "PARC-03",
  ]);
  assert.ok(
    inputs.slice(0, 2).every((input) =>
      input.installment === null && input.financialTerms?.discount === null
    ),
  );
  assert.ok(
    inputs.slice(2).every((input) =>
      input.installment?.total === 3 &&
      input.financialTerms?.discount?.value === 20
    ),
  );
  const pdf = await PDFDocument.load(
    await buildBaneseCarnetPdf(inputs, { minItems: 1, maxItems: 62 }),
  );
  assert.equal(pdf.getPageCount(), 2);
});

Deno.test("carnê nativo apresenta três condições próprias e rejeita drift das taxas", async () => {
  const installment = otherCreditDocumentRowAt(0);
  const enrollment = otherCreditDocumentFeeAt(1, 'MATRICULA');
  const reenrollment = otherCreditDocumentFeeAt(2, 'REMATRICULA');
  const candidates = [installment, enrollment, reenrollment];
  const conditions = [
    { discount: { type: 'fixed' as const, value: 20 }, interest: 2, penalty: 2 },
    { discount: { type: 'percentage' as const, value: 10, validUntil: '2026-07-23' }, interest: 0.5, penalty: 1.75 },
    { discount: { type: 'fixed' as const, value: 5.01, validUntil: '2026-07-30' }, interest: 2.75, penalty: 3.5 },
  ];
  candidates.forEach((row, index) => {
    const own = conditions[index];
    const terms = normalizeBaneseFinancialTerms({
      nominalAmount: Number(row.valor), dueDate: row.data_vencimento!, discount: own.discount,
      interest: { type: 'monthly-percentage', value: own.interest },
      penalty: { type: 'percentage', value: own.penalty },
    });
    row.gateway_financial_terms = terms;
    row.regra_financeira_outros_creditos_snapshot.financialTerms = terms;
  });
  const plan = planForOtherCreditRows(candidates);
  const rows = selectOtherCreditCarnetDocumentRows(plan, candidates);
  const inputs = buildOtherCreditCarnetDocumentInputs(
    rows, OTHER_CREDIT_DOCUMENT_PAYER, OTHER_CREDIT_DOCUMENT_ISSUER, OTHER_CREDIT_DOCUMENT_METADATA,
  );
  assert.deepEqual(inputs.map(input => input.documentNumber), ['MATRICULA', 'REMATRICULA', 'PARC-01']);
  for (const [index, input] of inputs.entries()) {
    assert.deepEqual(input.financialTerms, rows[index].regra_financeira_outros_creditos_snapshot.financialTerms);
  }
  const { pdf, text } = await nativePdfText(await buildBaneseCarnetPdf(inputs, { minItems: 1, maxItems: 62 }));
  assert.equal(pdf.getPageCount(), 1);
  for (const input of inputs) {
    const fields = presentBaneseFinancialTerms(input.financialTerms!);
    for (const field of [fields.discount, fields.penalty, fields.interest]) {
      assert.ok(text.includes(field.label), `Visible PDF label: ${field.label}`);
      assert.ok(text.includes(field.value), `Visible PDF value: ${field.value}`);
    }
  }
  for (const fee of [enrollment, reenrollment]) {
    const others = candidates.filter(row => row.id !== fee.id);
    assert.throws(() => selectOtherCreditCarnetDocumentRows(plan, [
      ...others, { ...fee, gateway_financial_terms: { ...fee.gateway_financial_terms!, discount: null } },
    ]), /não foram confirmadas|não possui|diverge|revisão|lançamentos/i);
    assert.throws(() => selectOtherCreditCarnetDocumentRows(plan, [
      ...others, { ...fee, regra_financeira_outros_creditos_snapshot: {
        ...fee.regra_financeira_outros_creditos_snapshot,
        financialTerms: { ...fee.gateway_financial_terms!, interest: { type: 'monthly-percentage', value: 9 } },
      } },
    ]), /lançamentos divergem/i);
  }
});

Deno.test("carnê exige títulos bancários e slots comerciais exclusivos", () => {
  const first = otherCreditDocumentRowAt(0);
  const second = otherCreditDocumentRowAt(1);
  const plan = planForOtherCreditRows([first, second]);
  assert.throws(() =>
    selectOtherCreditCarnetDocumentRows(plan, [first, {
      ...second,
      gateway_boleto_nosso_numero: first.gateway_boleto_nosso_numero,
      gateway_payment_id: first.gateway_payment_id,
    }])
  );
  assert.throws(() =>
    selectOtherCreditCarnetDocumentRows(plan, [first, {
      ...second,
      regra_financeira_outros_creditos_snapshot:
        first.regra_financeira_outros_creditos_snapshot,
    }])
  );
});
