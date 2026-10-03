import assert from "node:assert/strict";
import { assertActivationPayer, assertActivationPlan, assertPlanPayloads, canonicalAccount, canonicalCourseType, canonicalJson } from "./runtime.ts";
import { ActivationError } from "./contract.ts";
import { syntheticContext } from "./test-fixtures.ts";
import { validInput } from "../banese/core/adapter-test-fixtures.ts";

Deno.test("preflight accepts DOWN_PAYMENT and checks its full canonical bank payload", () => {
  const context = syntheticContext();
  context.replacementPlan[0].kind = "DOWN_PAYMENT";
  assert.doesNotThrow(() => assertActivationPlan(context, "2029-12-01"));
  assert.doesNotThrow(() => assertPlanPayloads(context, validInput.payer));
});
Deno.test("preflight refuses stale due dates, invalid future terms and dates outside bank factor range", () => {
  const context = syntheticContext();
  assert.throws(() => assertActivationPlan(context, "2030-01-16"), /vencimento passado/);
  context.replacementPlan[0].financialTerms.penalty = { type: "percentage", value: 100 };
  assert.throws(() => assertActivationPlan(context, "2029-12-01"), /100%/);
  context.replacementPlan[0].financialTerms.penalty = null;
  context.replacementPlan[0].dueDate = "2050-01-15";
  context.replacementPlan[0].financialTerms.dueDate = "2050-01-15";
  assert.throws(() => assertActivationPlan(context, "2029-12-01"), /fator FEBRABAN/);
});
Deno.test("canonical runtime comparison is valid stable JSON and accounts normalize masks", () => {
  assert.equal(canonicalJson({ b: { z: 2, a: 1 }, a: [3] }), '{"a":[3],"b":{"a":1,"z":2}}');
  assert.deepEqual(JSON.parse(canonicalJson({ a: 1 })), { a: 1 });
  assert.equal(canonicalAccount({ baneseContaDisplay: "12345678-9" }), "123456789");
  assert.equal(canonicalCourseType(" Especialização "), "ESPECIALIZACAO");
  assert.equal(canonicalCourseType("Técnico"), "TECNICO");
});

Deno.test("payer address can be repaired and resumed but tax identity drift requires review", () => {
  const context = syntheticContext();
  const payer = { ...validInput.payer, cpfCnpj: validInput.payer.document };
  assert.throws(() => assertActivationPayer(context, { ...payer, postalCode: "" }),
    (error) => error instanceof ActivationError && error.code === "PAYER_REGISTRATION_INCOMPLETE" && error.retryable);
  assert.doesNotThrow(() => assertActivationPayer(context, payer));
  assert.throws(() => assertActivationPayer(context, { ...payer, cpfCnpj: "99999999999" }),
    (error) => error instanceof ActivationError && error.code === "PAYER_IDENTITY_CHANGED" && !error.retryable);
  context.sources = context.sources.map((source) => ({ ...source, kind: "LOCAL", bankSnapshot: null }));
  assert.throws(() => assertActivationPayer(context, { ...payer, cpfCnpj: "99999999999" }),
    (error) => error instanceof ActivationError && error.code === "PAYER_IDENTITY_CHANGED" && !error.retryable);
});
Deno.test("invalid later source and incomplete payer fail before any cancellation", () => {
  const context = syntheticContext();
  context.sources[0].bankSnapshot!.account = "";
  assert.throws(() => assertActivationPlan(context, "2029-12-01"), /Identidade bancária/);
  const invalidSecond = syntheticContext();
  invalidSecond.sources.push(globalThis.structuredClone(invalidSecond.sources[0]));
  invalidSecond.sources[1].bankSnapshot!.barcode = "0".repeat(44);
  assert.throws(() => assertActivationPlan(invalidSecond, "2029-12-01"));
  assert.throws(() => assertPlanPayloads(syntheticContext(), { ...validInput.payer, postalCode: "" }), /CEP/);
});
