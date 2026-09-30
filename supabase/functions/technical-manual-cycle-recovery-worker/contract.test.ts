import { strict as assert } from "node:assert";
import {
  InternalCycleRecoveryRequestError,
  KNOWN_DUE_DATE_CORRECTION,
  parseInternalCycleRecoveryRequest,
  parseInternalCycleWorkerRequest,
  parseKnownDueDateCorrectionRequest,
} from "./contract.ts";

const valid = {
  action: "resume_existing_technical_cycle",
  matriculaId: "c541964c-be39-42ba-bf77-add05841dbe6",
  cicloNumero: 2,
  expectedCycleRequestId: "e3a45ec2-fc66-4111-8aa3-2f8f5e0cfb3a",
  expectedItemCount: 13,
};

Deno.test("aceita somente retomada interna com CAS completo do run", () => {
  assert.deepEqual(parseInternalCycleRecoveryRequest(valid), {
    matriculaId: valid.matriculaId,
    cicloNumero: 2,
    expectedCycleRequestId: valid.expectedCycleRequestId,
    expectedItemCount: 13,
  });
});

Deno.test("rejeita geração, UUID inválido e cardinalidade fora do limite", () => {
  for (
    const body of [
      { ...valid, action: "generate" },
      { ...valid, matriculaId: "C541964C" },
      { ...valid, expectedItemCount: 0 },
      { ...valid, expectedItemCount: 62 },
    ]
  ) {
    assert.throws(
      () => parseInternalCycleRecoveryRequest(body),
      InternalCycleRecoveryRequestError,
    );
  }
});

Deno.test("retomada aceita 60 parcelas mais taxa, preservando CAS da quantidade total", () => {
  for (const cicloNumero of [1, 2]) {
    assert.equal(
      parseInternalCycleRecoveryRequest({
        ...valid,
        cicloNumero,
        expectedItemCount: 61,
      }).expectedItemCount,
      61,
    );
  }
});

Deno.test("correção one-off aceita somente a identidade exata do título e run antigos", () => {
  const request = { ...KNOWN_DUE_DATE_CORRECTION };
  assert.deepEqual(parseKnownDueDateCorrectionRequest(request), request);
  assert.deepEqual(parseInternalCycleWorkerRequest(request), request);
});

Deno.test("correção one-off rejeita qualquer troca de UUID, run, item ou data", () => {
  const request = { ...KNOWN_DUE_DATE_CORRECTION };
  for (
    const patch of [
      { receivableId: valid.matriculaId },
      { matriculaId: valid.matriculaId },
      { turmaId: valid.matriculaId },
      { cicloNumero: 2 },
      { expectedCycleRequestId: valid.expectedCycleRequestId },
      { expectedItemCount: 13 },
      { correctionRequestId: valid.expectedCycleRequestId },
      { expectedAuthorizationRequestId: valid.expectedCycleRequestId },
      { expectedItemKey: "ciclo-2-parc-12" },
      { expectedDueDate: "2026-10-15" },
      { correctedDueDate: "2027-10-15" },
    ]
  ) {
    assert.throws(
      () => parseKnownDueDateCorrectionRequest({ ...request, ...patch }),
      InternalCycleRecoveryRequestError,
    );
  }
});
