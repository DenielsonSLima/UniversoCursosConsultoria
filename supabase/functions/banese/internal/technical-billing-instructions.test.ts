import assert from "node:assert/strict";
import {
  DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
  buildBaneseTechnicalBillingInstructions,
} from "./technical-billing-instructions.ts";

const academicContext = {
  modality: "TECNICO",
  classCode: "TEC-ENF-2026.1",
  className: "Técnico em Enfermagem — Noite",
  instruction: DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
};

Deno.test("inclui turma e instrução formal no boleto técnico", () => {
  assert.deepEqual(
    buildBaneseTechnicalBillingInstructions({
      environment: "production",
      documentKind: "boleto",
      description: "Mensalidade 1/24",
      academicContext,
    }),
    [
      "Mensalidade 1/24",
      "TURMA: TEC-ENF-2026.1 — Técnico em Enfermagem — Noite",
      DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
    ],
  );
});

Deno.test("mantém alerta de homologação sem ocultar turma e instrução", () => {
  const instructions = buildBaneseTechnicalBillingInstructions({
    environment: "sandbox",
    documentKind: "carne",
    description: "Mensalidade 2/24",
    academicContext,
  });

  assert.equal(instructions.length, 4);
  assert.match(instructions[0], /HOMOLOGAÇÃO/);
  assert.match(instructions[2], /^TURMA:/);
  assert.equal(instructions[3], DEFAULT_TECHNICAL_BILLING_INSTRUCTION);
});

Deno.test("não aplica instruções técnicas a cobrança de outra modalidade", () => {
  assert.deepEqual(
    buildBaneseTechnicalBillingInstructions({
      environment: "production",
      documentKind: "boleto",
      description: "Curso livre",
      academicContext: { ...academicContext, modality: "LIVRE" },
    }),
    ["Curso livre"],
  );
});
