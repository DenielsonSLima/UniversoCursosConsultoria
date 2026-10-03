import assert from "node:assert/strict";
import { buildBaneseReceivableBillingInstructions } from "./renegotiation-billing-instructions.ts";
import { RENEGOTIATION_RECEIPT_INSTRUCTION } from "./renegotiation-billing.ts";
import { buildBaneseTechnicalBillingInstructions } from "./technical-billing-instructions.ts";
import { buildBaneseBoletoPdf } from "./boletos/boleto-pdf.ts";
import { baneseDocumentFixtureAt } from "./testing/document-fixture.ts";
import { getDocument } from "npm:pdfjs-dist@5.6.205/legacy/build/pdf.mjs";

const agreementId = "00000000-0000-4000-8000-000000000001";
const receivable = {
  tipo_lancamento: "RENEGOCIACAO", valor: 100, data_vencimento: "2026-11-01",
  renegotiation_agreement_id: agreementId,
  regra_financeira_renegociacao_snapshot: {
    version: 1, origin: "RENEGOTIATION", agreementId,
    receiptPolicy: { daysAfterDue: 60, instruction: RENEGOTIATION_RECEIPT_INSTRUCTION },
    financialTerms: { nominalAmount: 100, dueDate: "2026-11-01" },
  },
};
const input = {
  environment: "production" as const, documentKind: "boleto" as const,
  description: "Acordo de teste — parcela 1", receivable,
  academicContext: { modality: "TECNICO", classCode: "TESTE", className: "Turma de teste",
    instruction: "Texto modificado depois da negociação" },
};
Deno.test("boleto renegociado usa prazo congelado, não instrução atual da turma", () => {
  const lines = buildBaneseReceivableBillingInstructions(input);
  assert.equal(lines.at(-1), RENEGOTIATION_RECEIPT_INSTRUCTION);
  assert.equal(lines.filter((line) => line === RENEGOTIATION_RECEIPT_INSTRUCTION).length, 1);
  assert.ok(!lines.includes(input.academicContext.instruction));
});
Deno.test("livre/especialização também recebe a instrução do acordo", () => {
  for (const modality of ["LIVRE", "ESPECIALIZACAO"]) {
    assert.deepEqual(buildBaneseReceivableBillingInstructions({ ...input,
      academicContext: { ...input.academicContext, modality } }),
    [input.description, RENEGOTIATION_RECEIPT_INSTRUCTION]);
  }
});
Deno.test("legado conserva instruções; sandbox conserva alerta; snapshot inválido bloqueia", () => {
  assert.deepEqual(buildBaneseReceivableBillingInstructions({ ...input, receivable: {} }),
    buildBaneseTechnicalBillingInstructions(input));
  assert.match(buildBaneseReceivableBillingInstructions({ ...input, environment: "sandbox" })[0], /HOMOLOGAÇÃO/);
  assert.throws(() => buildBaneseReceivableBillingInstructions({ ...input,
    receivable: { ...receivable, valor: 101 } }), /divergem/);
});
Deno.test("reader do boleto carrega a política e passa o recebível ao helper", async () => {
  const source = await Deno.readTextFile(new URL("../../banese-boleto-document/index.ts", import.meta.url));
  assert.match(source, /regra_financeira_renegociacao_snapshot, renegotiation_agreement_id/);
  assert.match(source, /buildBaneseReceivableBillingInstructions\(\{\s*receivable: row,/);
});

Deno.test("snapshot da renegociação atravessa instruções e compositor nativo do boleto", async () => {
  const fixture = baneseDocumentFixtureAt(0, receivable.data_vencimento, receivable.valor);
  const bytes = await buildBaneseBoletoPdf({ ...fixture,
    financialTerms: receivable.regra_financeira_renegociacao_snapshot.financialTerms,
    instructions: buildBaneseReceivableBillingInstructions({ ...input, environment: "sandbox" }),
  });
  const document = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    assert.equal(document.numPages, 1);
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
    assert.equal(text.split(RENEGOTIATION_RECEIPT_INSTRUCTION).length - 1, 2);
    assert.match(text, /Acordo de teste/);
    assert.match(text, /HOMOLOGAÇÃO/);
    assert.doesNotMatch(text, /Texto modificado depois/);
  } finally { await document.destroy(); }
});
