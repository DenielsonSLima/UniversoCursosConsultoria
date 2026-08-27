import assert from "node:assert/strict";
import {
  buildBaneseDependencyBillingInstructions,
  buildBaneseTechnicalBillingInstructions,
  DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
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

Deno.test("boleto da disciplina refeita não revela turma nem motivo acadêmico", () => {
  const instructions = buildBaneseDependencyBillingInstructions({
    environment: "production",
    documentKind: "boleto",
    description: "Disciplina: Anatomia e Fisiologia Humana",
  });

  assert.deepEqual(instructions, [
    "Disciplina: Anatomia e Fisiologia Humana",
    DEFAULT_TECHNICAL_BILLING_INSTRUCTION,
  ]);
  assert.doesNotMatch(instructions.join(" "), /turma|dependência|reprov/i);
});

Deno.test("preserva integralmente descrição e identificação longa da turma", () => {
  const description = `Mensalidade ${"detalhada ".repeat(16).trim()} final`;
  const className = `Técnico em Radiologia ${
    "Integral ".repeat(14).trim()
  } final`;
  const instructions = buildBaneseTechnicalBillingInstructions({
    environment: "production",
    documentKind: "boleto",
    description,
    academicContext: { ...academicContext, className },
  });

  assert.equal(instructions[0], description);
  assert.match(instructions[1], /final$/);
});

Deno.test("mantém no carnê os limites anteriores ao ajuste do boleto", () => {
  const description = `Mensalidade ${"detalhada ".repeat(20)}final`;
  const classCode = `TURMA-${"A".repeat(60)}`;
  const className = `Técnico em Radiologia ${"Integral ".repeat(20)}final`;
  const instructions = buildBaneseTechnicalBillingInstructions({
    environment: "production",
    documentKind: "carne",
    description,
    academicContext: { ...academicContext, classCode, className },
  });

  assert.equal(instructions[0].length, 120);
  assert.equal(
    instructions[1],
    `TURMA: ${classCode.slice(0, 40)} — ${className.slice(0, 90)}`,
  );
});
