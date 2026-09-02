import { strict as assert } from "node:assert";
import {
  InternalCycleRecoveryRequestError,
  parseInternalCycleRecoveryRequest,
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
    ]
  ) {
    assert.throws(
      () => parseInternalCycleRecoveryRequest(body),
      InternalCycleRecoveryRequestError,
    );
  }
});
