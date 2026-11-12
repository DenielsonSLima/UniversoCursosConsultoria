import assert from "node:assert/strict";
import { academicPaymentReference } from "./academic-competence.ts";
import { reviewedDeclaredIbsFixture } from "./adapter.fixture.ts";
import { assessIndividualDps, buildIndividualDps, individualPublicPayload } from "./adapter.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";

type Data = Record<string, unknown>;
function academic() {
  const row = reviewedDeclaredIbsFixture(), source = row.snapshot.source as Data, command = row.snapshot.command as Data;
  row.issuedAt = "2026-11-11T23:00:00-03:00";
  source.kind = "ACADEMIC_QUEUE";
  source.preparation = { payment_month: "2026-11" };
  source.reviewBasis = { basis: { financial: { currentReceipts: [
    { paymentDate: "2026-11-01" }, { paymentDate: "2026-11-02" },
  ] } } };
  command.source = { ...(command.source as Data), kind: "ACADEMIC_QUEUE" };
  command.competenceDate = "2026-11-02"; command.serviceDate = "2026-11-02";
  return row;
}
const people = (row: ReturnType<typeof academic>) => ((row.snapshot.model as Data).definition as Data).peopleOptions as Data;

Deno.test("academic ISSUE_DATE uses the last frozen reviewed payment day rather than the issue clock", async () => {
  const row = academic(), before = JSON.stringify(row);
  const input = buildIndividualDps(row), dps = buildNationalDps(input);
  assert.equal(input.competence, "2026-11-02"); assert(dps.xml.includes("<dCompet>2026-11-02</dCompet>"));
  assert.equal(input.issuedAt, "2026-11-11T23:00:00-03:00");
  assert.equal(JSON.stringify(row), before);
  await createProductionNumericSeriesCompatibilityValidator().validate(dps.xml, "DPS_v1.01.xsd", "PRODUCAO");
});

Deno.test("academic reference is month-scoped, canonical and never replaced by defaults or current data", () => {
  const row = academic(), source = row.snapshot.source as Data, before = JSON.stringify(source);
  assert.equal(academicPaymentReference(source), "2026-11-02"); assert.equal(JSON.stringify(source), before);
  for (const dates of [[], [{ paymentDate: "2026-10-31" }], [{ paymentDate: "2026-11-31" }],
    [{ paymentDate: null }], [{ paymentDate: 20261102 }]]) {
    assert.throws(() => academicPaymentReference({ ...source, reviewBasis: { basis: { financial: { currentReceipts: dates } } } }),
      (error: unknown) => (error as { code?: string }).code === "FISCAL_COMPETENCE_MODEL_MISMATCH");
  }
  for (const patch of [{ reviewBasis: null }, { preparation: { payment_month: "2026-10" } }, { kind: "PARTNER_SERVICE" }]) {
    assert.throws(() => academicPaymentReference({ ...source, ...patch }));
  }
});

Deno.test("academic command dates must still match each other and the frozen payment reference", () => {
  const row = academic(), command = row.snapshot.command as Data;
  command.competenceDate = "2026-11-03"; command.serviceDate = "2026-11-03";
  assert.equal(assessIndividualDps(row).reason, "FISCAL_COMPETENCE_MODEL_MISMATCH");
  command.competenceDate = "2026-11-02";
  assert.equal(assessIndividualDps(row).reason, "FISCAL_SERVICE_DATE_COMPETENCE_MISMATCH");
});

Deno.test("fixed dates and partner-service issue dates retain their existing rules", () => {
  const fixed = academic(); people(fixed).competenceMode = "FIXED_DATE"; people(fixed).competenceDate = "2026-11-02";
  assert.equal(assessIndividualDps(fixed).available, true);
  people(fixed).competenceDate = "2026-11-03";
  assert.equal(assessIndividualDps(fixed).reason, "FISCAL_COMPETENCE_MODEL_MISMATCH");
  const service = academic(), source = service.snapshot.source as Data, command = service.snapshot.command as Data;
  source.kind = "PARTNER_SERVICE"; command.source = { ...(command.source as Data), kind: "PARTNER_SERVICE" };
  assert.equal(assessIndividualDps(service).reason, "FISCAL_COMPETENCE_MODEL_MISMATCH");
  command.competenceDate = "2026-11-11"; command.serviceDate = "2026-11-11";
  assert.equal(assessIndividualDps(service).available, true);
});

Deno.test("historical public payload preserves command and prepared fiscal dates without rebuilding", () => {
  const row = academic(); row.state = "AUTHORIZED"; row.fiscalInput = buildIndividualDps(row);
  const before = JSON.stringify(row), payload = individualPublicPayload(row);
  assert.equal(payload.competenceDate, "2026-11-02"); assert.equal(payload.serviceDate, "2026-11-02");
  assert.equal((row.fiscalInput as { competence: string }).competence, "2026-11-02");
  assert.equal(JSON.stringify(row), before);
});
