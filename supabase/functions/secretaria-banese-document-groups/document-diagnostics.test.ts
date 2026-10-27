import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import type { BaneseCarnetReceivableRow } from "../banese-carnet-document/document-policy.ts";
import { buildBaneseDocumentGroups } from "./document-groups.ts";
import { buildEnrollmentDocumentDiagnostics, isCatalogBankCandidate } from "./document-diagnostics.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, changes: Partial<BaneseCarnetReceivableRow> = {}): BaneseCarnetReceivableRow => {
  const bank = baneseDocumentFixtureAt(n);
  return {
    id: bank.receivableId, cliente_id: id(1), matricula_id: id(2), turma_id: id(3), polo_id: id(4),
    descricao: "Teste", tipo_lancamento: "PARCELA", parcela_numero: n + 1,
    valor: bank.amount, data_vencimento: bank.dueDate, status: "PENDENTE",
    gateway_provider: "banese_card", gateway_payment_method: "BOLETO", gateway_environment: "sandbox",
    gateway_status: "2", gateway_pix_payload: null, gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: "2026-07-16T12:00:00Z", gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode, gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528", gateway_boleto_agencia: "033", gateway_issuer_polo_id: id(5),
    gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:05:00Z", ...changes,
  };
};
const groupsFor = (rows: BaneseCarnetReceivableRow[]) => buildBaneseDocumentGroups({
  receivables: rows.filter(isCatalogBankCandidate),
  students: [{ id: id(1), nome: "Aluno de teste", cpf_cnpj: null }],
  enrollments: [{ id: id(2), aluno_id: id(1), turma_id: id(3), data_matricula: "2026-01-01" }],
  classes: [{ id: id(3), nome: "Turma de teste", codigo: "TESTE", curso_id: id(6), polo_id: id(4) }],
  courses: [{ id: id(6), nome: "Curso de teste" }],
});

Deno.test("diagnóstico explica exclusões sem tornar histórico ou título inválido imprimível", () => {
  const rows = [row(0), row(1, { gateway_provider: "proesc" }), row(2, { status: "PAGO" }),
    row(3, { gateway_financial_terms_confirmed_at: null }), row(4, { gateway_boleto_codigo_barras: "INVÁLIDO" })];
  const groups = groupsFor(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].documentType, "boletos");
  assert.deepEqual(groups[0].receivableIds, [rows[0].id]);
  const result = buildEnrollmentDocumentDiagnostics(rows, groups);
  assert.deepEqual(result, { inspectedCount: 5, availableCount: 1, complete: true, exclusions: [
    { reason: "OTHER_OR_MISSING_BANK_PROVIDER", count: 1 }, { reason: "NOT_PAYABLE", count: 1 },
    { reason: "BANK_EVIDENCE_MISSING", count: 1 }, { reason: "BANK_EVIDENCE_INVALID", count: 1 },
  ] });
  for (const original of rows) {
    assert.ok(!JSON.stringify(result).includes(original.id));
    assert.ok(!JSON.stringify(result).includes(String(original.gateway_boleto_linha_digitavel)));
  }
});

Deno.test("consulta individual preserva os mesmos predicados exatos do catálogo antigo", () => {
  assert.equal(isCatalogBankCandidate(row(0)), true);
  for (const changes of [{ gateway_provider: "BANESE_CARD" }, { gateway_payment_method: "boleto" },
    { tipo_lancamento: "parcela" }, { status: "pendente" }, { gateway_boleto_issued_at: null },
    { gateway_financial_terms_confirmed_at: null }]) {
    assert.equal(isCatalogBankCandidate(row(0, changes)), false);
  }
});

Deno.test("vínculo de turma inconsistente é distinguido de falta de evidência bancária", () => {
  const rows = [row(0, { turma_id: id(99) })];
  assert.deepEqual(buildEnrollmentDocumentDiagnostics(rows, groupsFor(rows)).exclusions,
    [{ reason: "DOCUMENT_GROUP_INCONSISTENT", count: 1 }]);
});

Deno.test("duplicidade bancária não passa a ser imprimível por haver diagnóstico", () => {
  const rows = [row(0), row(0, { id: id(100) })];
  const groups = groupsFor(rows);
  assert.deepEqual(groups, []);
  assert.equal(buildEnrollmentDocumentDiagnostics(rows, groups).availableCount, 0);
});

Deno.test("ausência de títulos e limite da inspeção não fabricam causa ou cobertura", () => {
  assert.deepEqual(buildEnrollmentDocumentDiagnostics([], [], false),
    { inspectedCount: 0, availableCount: 0, complete: false, exclusions: [] });
});
