import { buildNationalCancellation } from "../_shared/nfse-national/events.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";
import assert from "node:assert/strict";
import {
  assertOwnedIndividualCancellation,
  buildIndividualCancellationInput,
} from "./cancellation-review.ts";
import { reviewedIndividualFixture } from "./adapter.fixture.ts";
import type { CancellationRow } from "./handler.ts";
const key = "0".repeat(50), issuer = "00000000000100";
function fixture() {
  const operation = reviewedIndividualFixture();
  operation.state = "AUTHORIZED";
  operation.authorizedXml = "<NFSe>SYNTHETIC</NFSe>";
  operation.result = { accessKey: key, number: "1" };
  const row: CancellationRow = {
    previewId: operation.previewId,
    cancelPreviewId: "00000000-0000-0000-0000-000000000091",
    expiresAt: "2027-01-01T00:00:00Z",
    state: "PREVIEWED",
    dispatch: false,
    accessKey: key,
    number: "1",
    reasonCode: "1",
    justification: "Erro no valor informado.",
    eventReferenceId: `PRE${key}101101`,
    occurredAt: "2026-11-10T12:00:00-03:00",
    issuerCnpj: issuer,
    eventInput: null,
    signedEventXml: null,
    result: null,
  };
  return { operation, row };
}
Deno.test("own authorized document and confirmed reason 1 permit a technical cancellation request", () => {
  const { operation, row } = fixture();
  assert.doesNotThrow(() =>
    assertOwnedIndividualCancellation(operation, row, issuer)
  );
});
Deno.test("canonical official reasons 1/2/9 are accepted; unresolved final variables are denied", () => {
  const { operation, row } = fixture();
  for (const reason of ["1", "2", "9"] as const) {
    row.reasonCode = reason; assert.doesNotThrow(() => assertOwnedIndividualCancellation(operation, row, issuer));
    assert.equal(buildIndividualCancellationInput(row).reasonCode, reason);
  }
  row.justification = "Justificativa com {{detalhe}} pendente.";
  assert.throws(() => assertOwnedIndividualCancellation(operation, row, issuer), /PRODUCTION_CANCELLATION_REVIEW_REQUIRED/);
});
Deno.test("cancellation denies another document, unconfirmed authorization and missing own XML", () => {
  for (
    const mutate of [(f: ReturnType<typeof fixture>) => {
      f.row.previewId = "other";
    }, (f: ReturnType<typeof fixture>) => {
      f.operation.state = "PROCESSING";
    }, (f: ReturnType<typeof fixture>) => {
      f.operation.authorizedXml = null;
    }, (f: ReturnType<typeof fixture>) => {
      f.row.accessKey = "1".repeat(50);
    }]
  ) {
    const f = fixture();
    mutate(f);
    assert.throws(
      () => assertOwnedIndividualCancellation(f.operation, f.row, issuer),
      /PRODUCTION_OWN_AUTHORIZED_DOCUMENT_REQUIRED/,
    );
  }
});
Deno.test("cancellation never crosses issuer or changes reviewed reason/event identity", () => {
  const f = fixture();
  assert.throws(
    () =>
      assertOwnedIndividualCancellation(f.operation, f.row, "99999999000100"),
    /PRODUCTION_ISSUER_CHANGED/,
  );
  f.row.eventReferenceId = `PRE${key}101103`;
  assert.throws(
    () => assertOwnedIndividualCancellation(f.operation, f.row, issuer),
    /PRODUCTION_CANCELLATION_REVIEW_REQUIRED/,
  );
});

Deno.test("actual cancellation input uses an application version within official XSD bounds", async () => {
  const { row } = fixture();
  const input = buildIndividualCancellationInput(row);
  assert.equal(input.applicationVersion.length <= 20, true);
  const xml = buildNationalCancellation(input).xml;
  await createProductionNumericSeriesCompatibilityValidator().validate(
    xml,
    "pedRegEvento_v1.01.xsd",
    "PRODUCAO",
  );
});
