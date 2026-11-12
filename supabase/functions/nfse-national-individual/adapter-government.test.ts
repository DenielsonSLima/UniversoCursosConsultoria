import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assessIndividualDps, buildIndividualDps } from "./adapter.ts";
import { reviewedMunicipalLectureFixture } from "./adapter-government.fixture.ts";
import { reviewedDeclaredIbsFixture } from "./adapter.fixture.ts";
import { queueDeclaredIbsCbs } from "./adapter-ibscbs.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";
import { createNationalProductionIssuer } from "../_shared/nfse-national/production.ts";
import { withProductionTestCertificate } from "../_shared/nfse-national/production.test-fixtures.ts";
import type { IndividualRow } from "./handler.ts";
type Data = Record<string, unknown>;
const definition = (row: IndividualRow) => (row.snapshot.model as { definition: Data }).definition;

Deno.test("municipal lecture profile preserves reviewed tax choices and validates the production DPS without transmission", async () => {
  const row = reviewedMunicipalLectureFixture();
  const input = buildIndividualDps(row, "2803401");
  assert.deepEqual(assessIndividualDps(row, "2803401"), { available: true, reason: null });
  assert.deepEqual(input.ibscbs, { personalUse: "0", operationCode: "030102", recipientIsAcquirer: true,
    cst: "000", classificationCode: "000001", governmentPurchase: { operationType: "1", entityType: "4" } });
  assert.equal(input.recipient.taxId.type, "CNPJ");
  assert.equal(input.recipient.address?.municipalityCode, "2803401");
  assert.equal(input.service.nbs, "122051900");
  assert.equal(input.values.serviceAmount, "1000.00");
  assert.equal(input.values.issRate, undefined);
  assert.deepEqual(input.values.totalTaxes, { mode: "SIMPLE_NATIONAL_PERCENTAGE", percentage: "12.00" });
  const document = buildNationalDps(input);
  assert(document.xml.includes("<indFinal>0</indFinal><cIndOp>030102</cIndOp><tpOper>1</tpOper><tpEnteGov>4</tpEnteGov><indDest>0</indDest>"));
  assert.equal((document.xml.match(/<tpEnteGov>/g) || []).length, 1);
  assert.equal(createHash("sha256").update(document.xml).digest("hex"),
    "9c97bff873c1e0ec871810e114a928c2b6e7592bf42526698871902e634c02dd");
  await createProductionNumericSeriesCompatibilityValidator().validate(document.xml, "DPS_v1.01.xsd", "PRODUCAO");
});

Deno.test("municipal advance retains the explicit type4 without changing frozen fiscal choices or creating references", async () => {
  const row = reviewedMunicipalLectureFixture();
  (definition(row).serviceOptions as Data).operationType = "4";
  const before = JSON.stringify(row), input = buildIndividualDps(row, "2803401");
  assert.deepEqual(assessIndividualDps(row, "2803401"), { available: true, reason: null });
  assert.deepEqual(input.ibscbs, { personalUse: "0", operationCode: "030102", recipientIsAcquirer: true,
    cst: "000", classificationCode: "000001", governmentPurchase: { operationType: "4", entityType: "4" } });
  assert.equal(input.service.nbs, "122051900");
  assert.equal(input.values.issRate, undefined);
  assert.deepEqual(input.values.totalTaxes, { mode: "SIMPLE_NATIONAL_PERCENTAGE", percentage: "12.00" });
  const xml = buildNationalDps(input).xml;
  assert(xml.includes("<tpOper>4</tpOper><tpEnteGov>4</tpEnteGov>"));
  assert(!xml.includes("<gRefNFSe>"));
  assert.equal(JSON.stringify(row), before);
  await createProductionNumericSeriesCompatibilityValidator().validate(xml, "DPS_v1.01.xsd", "PRODUCAO");
});

Deno.test("government gate retains every unproven scenario and dependent tax review block", () => {
  for (const mutate of [
    (d: Data) => { d.nationalServiceCode = "080101"; },
    (d: Data) => { d.nbsCode = "122020000"; },
    (d: Data) => { d.operationIndicatorCode = "030101"; },
    (d: Data) => { (d.serviceOptions as Data).includeIbsCbs = false; },
    (d: Data) => { (d.serviceOptions as Data).operationType = "2"; },
    (d: Data) => { (d.serviceOptions as Data).operationType = "3"; },
    (d: Data) => { (d.serviceOptions as Data).operationType = "5"; },
    (d: Data) => { (d.serviceOptions as Data).operationType = 4; },
    (d: Data) => { (d.serviceOptions as Data).governmentEntityType = "2"; },
    (d: Data) => { (d.serviceOptions as Data).governmentPurchase = false; },
    (d: Data) => { (d.peopleOptions as Data).recipientIsDestination = false; },
    (d: Data) => { (d.peopleOptions as Data).recipientAddressSource = "OMIT"; },
    (d: Data) => { (d.peopleOptions as Data).intermediarySource = "AT_ISSUANCE"; },
    (d: Data) => { (d.additionalOptions as { people: Data }).people.personalUse = true; },
    (d: Data) => { (d.valuesOptions as { ibscbs: Data }).ibscbs.cst = "200"; },
    (d: Data) => { (d.valuesOptions as { ibscbs: Data }).ibscbs.classificationCode = "200028"; },
    (d: Data) => { (d.valuesOptions as { ibscbs: Data }).ibscbs.regularTaxation = { cst: "000", classificationCode: "000001" }; },
    (d: Data) => { (d.valuesOptions as { iss: Data }).iss.retention = "RECIPIENT"; },
  ]) {
    const row = reviewedMunicipalLectureFixture(); mutate(definition(row));
    assert.equal(assessIndividualDps(row, "2803401").available, false);
  }
  assert.throws(() => queueDeclaredIbsCbs(definition(reviewedMunicipalLectureFixture()), "2024-01-01"),
    /FISCAL_IBSCBS_CLASSIFICATION_REVIEW_REQUIRED/);
  assert.throws(() => queueDeclaredIbsCbs(definition(reviewedMunicipalLectureFixture()), "2025-05-04"),
    /FISCAL_IBSCBS_CLASSIFICATION_REVIEW_REQUIRED/);
  assert.equal(queueDeclaredIbsCbs(definition(reviewedMunicipalLectureFixture()), "2025-05-05")?.classificationCode, "000001");
});

Deno.test("municipal lecture requires partner service, corporate acquirer and matching resolved acquirer address", () => {
  const cpf = reviewedMunicipalLectureFixture();
  (cpf.snapshot.recipient as Data).document = "00000000191";
  assert.equal(assessIndividualDps(cpf, "2803401").reason, "FISCAL_GOVERNMENT_PARTICIPANTS_REVIEW_REQUIRED");
  const academic = reviewedMunicipalLectureFixture();
  (academic.snapshot.source as Data).kind = "ACADEMIC_QUEUE";
  ((academic.snapshot.command as Data).source as Data).kind = "ACADEMIC_QUEUE";
  assert.equal(assessIndividualDps(academic, "2803401").reason, "FISCAL_GOVERNMENT_PARTICIPANTS_REVIEW_REQUIRED");
  assert.equal(assessIndividualDps(reviewedMunicipalLectureFixture(), "3550308").available, false);
  assert.equal(assessIndividualDps(reviewedMunicipalLectureFixture()).available, false);
  const invalidAddress = reviewedMunicipalLectureFixture();
  ((invalidAddress.snapshot.recipient as Data).address as Data).street = "";
  assert.equal(assessIndividualDps(invalidAddress, "2803401").reason, "FISCAL_RECIPIENT_STREET_REQUIRED");
  const otherCity = reviewedMunicipalLectureFixture();
  (definition(otherCity).serviceOptions as Data).municipalityCode = "3550308";
  (otherCity.snapshot.configuration as Data).municipalityCode = "3550308";
  assert.equal(assessIndividualDps(otherCity, "3550308").available, true);
});

Deno.test("nongovernment student profile keeps government fields absent", () => {
  const input = buildIndividualDps(reviewedDeclaredIbsFixture());
  assert.equal(input.ibscbs?.governmentPurchase, undefined);
  assert.equal(buildNationalDps(input).xml.includes("<tpOper>"), false);
  assert.equal(buildNationalDps(input).xml.includes("<tpEnteGov>"), false);
});

Deno.test("production signs municipal lecture DPS with verified schema and zero network calls", async () => {
  await withProductionTestCertificate(async credential => {
    const issuer = createNationalProductionIssuer({ credential, signatureProfile: "RSA_SHA1_LEGACY",
      schema: createProductionNumericSeriesCompatibilityValidator(), assertLiveContract() {},
      transport: { async request() { throw new Error("No network during prepare"); } } });
    for (const operationType of ["1", "4"]) {
      const row = reviewedMunicipalLectureFixture();
      (definition(row).serviceOptions as Data).operationType = operationType;
      const input = buildIndividualDps(row, "2803401");
      const prepared = await issuer.prepare(input, buildNationalDps(input).referenceId);
      assert(prepared.signedDpsXml.includes(`<tpOper>${operationType}</tpOper><tpEnteGov>4</tpEnteGov>`));
      assert(prepared.signedDpsXml.includes("<CST>000</CST><cClassTrib>000001</cClassTrib>"));
    }
  });
});
