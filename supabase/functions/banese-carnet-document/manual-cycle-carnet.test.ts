import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import { buildBaneseCarnetPdf } from "../banese/internal/carne/carne-pdf.ts";
import { buildBaneseDocumentGroups } from "../secretaria-banese-document-groups/document-groups.ts";
import {
  type BaneseCarnetReceivableRow,
  isRegisteredBaneseDocumentRow,
  selectBaneseCarnetDocumentRows,
} from "./document-policy.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fingerprint = "a".repeat(64);
const snapshot = {
  versao: 2,
  tipoLancamento: "MATRICULA",
  cicloManual: {
    cicloNumero: 1,
    requestId: id(6),
    regraFingerprint: fingerprint,
    politicaFingerprint: fingerprint,
    cronogramaFingerprint: fingerprint,
  },
};

const rowAt = (index: number): BaneseCarnetReceivableRow => {
  const bank = baneseDocumentFixtureAt(index);
  return {
    id: bank.receivableId,
    cliente_id: id(1),
    matricula_id: id(2),
    turma_id: id(3),
    polo_id: id(4),
    descricao: index === 0 ? "Matrícula - Ciclo 1" : `Mensalidade ${index}/12`,
    tipo_lancamento: index === 0 ? "MATRICULA" : "PARCELA",
    parcela_numero: index,
    valor: bank.amount,
    data_vencimento: bank.dueDate,
    status: "PENDENTE",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_status: "PENDING",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: "2026-07-16T12:00:00Z",
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_issuer_polo_id: id(5),
    gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:05:00Z",
    regra_financeira_tecnica_snapshot: {
      ...snapshot,
      tipoLancamento: index === 0 ? "MATRICULA" : "MENSALIDADE",
    },
  };
};

Deno.test("carnê C1 conserva matrícula técnica manual e doze mensalidades", async () => {
  const candidates = Array.from({ length: 13 }, (_, index) => rowAt(index));
  const rows = selectBaneseCarnetDocumentRows(candidates[1], candidates.reverse());
  assert.equal(rows.length, 13);
  assert.equal(rows[0].tipo_lancamento, "MATRICULA");
  assert.deepEqual(rows.map((row) => row.parcela_numero), Array.from({ length: 13 }, (_, i) => i));
  const bytes = await buildBaneseCarnetPdf(rows.map((row) => ({
    ...baneseDocumentFixtureAt(Number(row.parcela_numero)),
    instructions: [row.descricao!],
  })));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 5);
});

Deno.test("catálogo diferencia matrícula de mensalidade e aceita C1 sem taxa emitida", () => {
  const input = {
    receivables: Array.from({ length: 13 }, (_, index) => rowAt(index)),
    students: [{ id: id(1), nome: "Aluno de teste", cpf_cnpj: null }],
    enrollments: [{ id: id(2), aluno_id: id(1), turma_id: id(3), data_matricula: "2026-07-16" }],
    classes: [{ id: id(3), nome: "Técnico de teste", codigo: "TESTE", curso_id: id(7), polo_id: id(4) }],
    courses: [{ id: id(7), nome: "Curso técnico" }],
  };
  const [group] = buildBaneseDocumentGroups(input);
  assert.equal(group.installmentCount, 13);
  assert.equal(group.enrollmentCount, 1);
  assert.equal(group.monthlyCount, 12);
  assert.equal(group.reenrollmentCount, 0);
  assert.equal(group.representativeReceivableId, input.receivables[0].id);
  const [withoutFee] = buildBaneseDocumentGroups({ ...input, receivables: input.receivables.slice(1) });
  assert.equal(withoutFee.installmentCount, 12);
  assert.equal(withoutFee.enrollmentCount, 0);
  assert.equal(withoutFee.monthlyCount, 12);
});

Deno.test("matrícula EAD ou legada sem ciclo técnico completo permanece fora do carnê", () => {
  const fee = rowAt(0);
  for (const invalid of [
    undefined,
    { ...snapshot, cicloManual: undefined },
    { ...snapshot, versao: 1 },
    { ...snapshot, tipoLancamento: "MENSALIDADE" },
    { ...snapshot, cicloManual: { ...snapshot.cicloManual, cicloNumero: 2 } },
    { ...snapshot, cicloManual: { ...snapshot.cicloManual, requestId: "invalid" } },
    { ...snapshot, cicloManual: { ...snapshot.cicloManual, cronogramaFingerprint: "" } },
  ]) {
    assert.equal(isRegisteredBaneseDocumentRow({ ...fee, regra_financeira_tecnica_snapshot: invalid }), false);
  }
  assert.equal(isRegisteredBaneseDocumentRow({ ...fee, turma_id: null }), false);
  assert.equal(isRegisteredBaneseDocumentRow({ ...fee, status: "PAGO" }), false);
  const legacyRows = [1, 2, 3].map((index) => ({ ...rowAt(index), regra_financeira_tecnica_snapshot: null }));
  const rows = selectBaneseCarnetDocumentRows(legacyRows[0], [
    ...legacyRows, { ...fee, regra_financeira_tecnica_snapshot: null },
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.tipo_lancamento === "PARCELA"));
});

Deno.test("matrícula registrada localmente nunca entra no carnê dos doze boletos", () => {
  const fee = {
    ...rowAt(0), gateway_provider: null, gateway_payment_method: null,
    gateway_boleto_nosso_numero: null, gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null, gateway_status: null,
  };
  for (const status of ["PENDENTE", "VENCIDO", "PAGO"]) {
    const local = { ...fee, status };
    assert.equal(isRegisteredBaneseDocumentRow(local), false);
    const monthly = Array.from({ length: 12 }, (_, index) => rowAt(index + 1));
    const rows = selectBaneseCarnetDocumentRows(monthly[0], [local, ...monthly]);
    assert.equal(rows.length, 12);
    assert.ok(rows.every((row) => row.tipo_lancamento === "PARCELA"));
  }
});
