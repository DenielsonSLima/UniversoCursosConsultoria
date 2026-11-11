import assert from "node:assert/strict";
import {
  assessIndividualDps,
  buildIndividualDps,
  individualPublicPayload,
} from "./adapter.ts";
import { queueDeclaredIbsCbs } from "./adapter-ibscbs.ts";
import { reviewedDeclaredIbsFixture } from "./adapter.fixture.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";
import { createNationalProductionIssuer } from "../_shared/nfse-national/production.ts";
import { withProductionTestCertificate } from "../_shared/nfse-national/production.test-fixtures.ts";
import type { IndividualRow } from "./handler.ts";
const definition = (row: IndividualRow) =>
  (row.snapshot.model as { definition: Record<string, unknown> }).definition;

Deno.test("reviewed IBS declaration preserves all explicit model choices in the production layout", async () => {
  const row = reviewedDeclaredIbsFixture();
  const input = buildIndividualDps(row);
  assert.deepEqual(input.ibscbs, {
    personalUse: "1",
    operationCode: "030101",
    recipientIsAcquirer: true,
    cst: "000",
    classificationCode: "000001",
  });
  assert.equal(input.review.ibscbs, "DECLARED_CONFIRMED");
  assert.equal(input.values.issRate, undefined);
  const document = buildNationalDps(input);
  assert.equal(
    document.xml.includes(
      "<IBSCBS><finNFSe>0</finNFSe><indFinal>1</indFinal><cIndOp>030101</cIndOp><indDest>0</indDest>",
    ),
    true,
  );
  assert.equal(
    document.xml.includes(
      "<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>",
    ),
    true,
  );
  assert.equal(document.xml.includes("<tpOper>"), false);
  assert.equal(document.xml.includes("<tpEnteGov>"), false);
  assert.equal((document.xml.match(/<finNFSe>/g) || []).length, 1);
  const schema = createProductionNumericSeriesCompatibilityValidator();
  await schema.validate(document.xml, "DPS_v1.01.xsd", "PRODUCAO");
  assert.deepEqual(individualPublicPayload(row).ibsCbs, {
    included: true,
    cst: "000",
    classificationCode: "000001",
    operationIndicatorCode: "030101",
    recipientSameAsAcquirer: true,
    personalUse: true,
    governmentPurchase: false,
  });
});

Deno.test("production prepares and signs the declared IBS group without omission or a network request", async () => {
  await withProductionTestCertificate(async (credential) => {
    const input = buildIndividualDps(reviewedDeclaredIbsFixture());
    const issuer = createNationalProductionIssuer({
      credential,
      signatureProfile: "RSA_SHA1_LEGACY",
      schema: createProductionNumericSeriesCompatibilityValidator(),
      assertLiveContract() {},
      transport: {
        async request() {
          throw new Error("No network during prepare");
        },
      },
    });
    const prepared = await issuer.prepare(
      input,
      buildNationalDps(input).referenceId,
    );
    assert.equal(
      prepared.signedDpsXml.includes(
        "<gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS>",
      ),
      true,
    );
    assert.equal(prepared.input.review.ibscbs, "DECLARED_CONFIRMED");
  });
});

Deno.test("IBS declaration rejects missing mandatory choices, unknown classification and contradictory dependent groups", () => {
  for (
    const mutate of [
      (d: Record<string, unknown>) => {
        d.operationIndicatorCode = "";
      },
      (d: Record<string, unknown>) => {
        (d.peopleOptions as Record<string, unknown>).recipientIsDestination =
          null;
      },
      (d: Record<string, unknown>) => {
        (d.additionalOptions as { people: Record<string, unknown> }).people
          .personalUse = null;
      },
      (d: Record<string, unknown>) => {
        (d.valuesOptions as { ibscbs: Record<string, unknown> }).ibscbs
          .classificationCode = "999999";
      },
      (d: Record<string, unknown>) => {
        (d.valuesOptions as { ibscbs: Record<string, unknown> }).ibscbs
          .regularTaxation = { cst: "000", classificationCode: "000001" };
      },
    ]
  ) {
    const row = reviewedDeclaredIbsFixture();
    mutate(definition(row));
    assert.equal(assessIndividualDps(row).available, false);
  }
  const row = reviewedDeclaredIbsFixture();
  assert.throws(
    () => queueDeclaredIbsCbs(definition(row), "2024-01-01"),
    /FISCAL_IBSCBS_CLASSIFICATION_REVIEW_REQUIRED/,
  );
});
