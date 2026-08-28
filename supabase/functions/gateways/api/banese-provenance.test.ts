import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { assertBaneseReconciliationProvenance } from "./banese-reconciliation-contract.ts";

const ourNumber = BANESE_DOCUMENT_FIXTURE.ourNumber;
const receivable = {
  valor: BANESE_DOCUMENT_FIXTURE.amount,
  gateway_status: "OPEN",
  gateway_creation_token: null,
  gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  gateway_cnab_file_id: null,
};
const transaction = {
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  remote_payment_id: ourNumber,
  bank_slip_our_number: ourNumber,
};

Deno.test("API_REGISTERED exige uma transacao canonica do POST", () => {
  assert.throws(
    () => assertBaneseReconciliationProvenance(receivable, [], ourNumber),
    /exatamente uma transacao canonica do POST/i,
  );
  assert.doesNotThrow(() =>
    assertBaneseReconciliationProvenance(
      receivable,
      [transaction],
      ourNumber,
    )
  );
});

Deno.test("transacao canonica precisa provar Nosso Numero e valor", () => {
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        receivable,
        [{
          ...transaction,
          remote_payment_id: null,
          bank_slip_our_number: null,
        }],
        ourNumber,
      ),
    /nao comprova o Nosso Numero/i,
  );
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        receivable,
        [{ ...transaction, amount: BANESE_DOCUMENT_FIXTURE.amount + 1 }],
        ourNumber,
      ),
    /diverge do valor/i,
  );
});

Deno.test("API_AMBIGUOUS exige token e estado CREATING do POST", () => {
  const ambiguous = {
    ...receivable,
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-canonical",
  };
  assert.doesNotThrow(() =>
    assertBaneseReconciliationProvenance(ambiguous, [], ourNumber)
  );
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        { ...ambiguous, gateway_creation_token: null },
        [],
        ourNumber,
      ),
    /tentativa de POST canonica ativa/i,
  );
  assert.doesNotThrow(() =>
    assertBaneseReconciliationProvenance(
      ambiguous,
      [transaction],
      ourNumber,
    )
  );
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        ambiguous,
        [transaction, transaction],
        ourNumber,
      ),
    /mais de uma transacao/i,
  );
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        ambiguous,
        [{ ...transaction, amount: BANESE_DOCUMENT_FIXTURE.amount + 1 }],
        ourNumber,
      ),
    /diverge do valor/i,
  );
});

Deno.test("bloqueia canal CNAB e status sem proveniencia API", () => {
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        { ...receivable, gateway_cnab_file_id: "arquivo-cnab" },
        [transaction],
        ourNumber,
      ),
    /proveniencia exclusiva de POST API/i,
  );
  assert.throws(
    () =>
      assertBaneseReconciliationProvenance(
        { ...receivable, gateway_submission_status: "" },
        [transaction],
        ourNumber,
      ),
    /proveniencia exclusiva de POST API/i,
  );
});
