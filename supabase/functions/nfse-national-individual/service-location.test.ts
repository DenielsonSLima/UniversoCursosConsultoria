import assert from "node:assert/strict";
import { reviewedDeclaredIbsFixture } from "./adapter.fixture.ts";
import { assessIndividualDps, buildIndividualDps, individualPublicPayload } from "./adapter.ts";
import { publicIndividualServiceLocation, resolveIndividualServiceLocation } from "./service-location.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";

type Data = Record<string, unknown>;
const definition = (row: ReturnType<typeof reviewedDeclaredIbsFixture>) => (row.snapshot.model as Data).definition as Data;
const service = (model: Data) => model.serviceOptions as Data;
Deno.test("030101 provider resolves the issuing establishment without changing model identity/version/definition", () => {
  const row = reviewedDeclaredIbsFixture(), before = JSON.stringify(row.snapshot.model);
  (row.snapshot.configuration as Data).municipalityCode = "2800207";
  const location = resolveIndividualServiceLocation(definition(row), row.snapshot.configuration);
  assert.deepEqual(location, { source: "ISSUER_ESTABLISHMENT", countryCode: "BRA", municipalityCode: "2800207",
    modelMunicipalityCode: "2803401", operationIndicatorCode: "030101" });
  assert.equal(buildIndividualDps(row).service.municipalityCode, "2800207");
  assert.equal(individualPublicPayload(row).modelId, (row.snapshot.model as Data).id);
  assert.equal(JSON.stringify(row.snapshot.model), before);
});
Deno.test("other indicators, supplier roles and unspecified flags retain the model fixed location", () => {
  for (const mutate of [
    (m: Data) => { m.operationIndicatorCode = "030102"; },
    (m: Data) => { m.operationIndicatorCode = "030103"; },
    (m: Data) => { m.operationIndicatorCode = "100301"; },
    (m: Data) => { (m.peopleOptions as Data).issuerRole = "RECIPIENT"; },
    (m: Data) => { service(m).includeIbsCbs = false; },
    (m: Data) => { service(m).governmentPurchase = null; },
    (m: Data) => { service(m).governmentPurchase = true; },
  ]) {
    const row = reviewedDeclaredIbsFixture(), model = definition(row); mutate(model);
    const location = resolveIndividualServiceLocation(model, { municipalityCode: "2800207" });
    assert.equal(location?.source, "MODEL_FIXED");assert.equal(location?.municipalityCode, "2803401");
  }
  const model = definition(reviewedDeclaredIbsFixture());
  assert.equal(resolveIndividualServiceLocation(model, { municipalityCode: null }), null);
  service(model).municipalityCode = null;
  assert.equal(resolveIndividualServiceLocation(model, { municipalityCode: "2800207" }), null);
});
Deno.test("historical prepared location is displayed only from persisted fiscal input", () => {
  const row = reviewedDeclaredIbsFixture();row.state = "AUTHORIZED";
  row.fiscalInput = { service: { municipalityCode: "2803401" } };
  (row.snapshot.configuration as Data).municipalityCode = "2800207";
  service(definition(row)).municipalityCode = "2805604";
  assert.deepEqual(publicIndividualServiceLocation(row), { source: "ISSUED_SNAPSHOT", countryCode: "BRA",
    municipalityCode: "2803401", modelMunicipalityCode: "2805604", operationIndicatorCode: "030101" });
  row.fiscalInput = null;assert.equal(publicIndividualServiceLocation(row), null);
  row.fiscalInput = { values: {} };assert.equal(publicIndividualServiceLocation(row), null);
});
Deno.test("an older prepared location is never rewritten or silently dispatched after the new rule", () => {
  const row = reviewedDeclaredIbsFixture();row.fiscalInput = buildIndividualDps(row);
  row.signedDpsXml = "SIGNED BYTES ARE IMMUTABLE";
  (row.snapshot.configuration as Data).municipalityCode = "2800207";
  const before = JSON.stringify(row);
  assert.equal(assessIndividualDps(row).reason, "FISCAL_SERVICE_LOCATION_REVIEW_REQUIRED");
  assert.equal(publicIndividualServiceLocation(row)?.municipalityCode, "2803401");
  assert.equal(JSON.stringify(row), before);
});
Deno.test("three synthetic branches produce the same shared model with their own emission/service municipality and valid production XSD", async () => {
  const validator = createProductionNumericSeriesCompatibilityValidator();
  for (const code of ["2800207", "2805604", "2805703"]) {
    const row = reviewedDeclaredIbsFixture(), model = definition(row);
    (row.snapshot.model as Data).version = 7;
    (row.snapshot.configuration as Data).municipalityCode = code;
    const taxes = model.valuesOptions as Data;
    (taxes.ibscbs as Data).cst = "200";(taxes.ibscbs as Data).classificationCode = "200028";
    const before = JSON.stringify(row.snapshot.model), input = buildIndividualDps(row), dps = buildNationalDps(input);
    assert.equal(input.issuerMunicipalityCode, code);assert.equal(input.service.municipalityCode, code);
    assert(dps.xml.includes(`<cLocPrestacao>${code}</cLocPrestacao>`));
    assert.equal((row.snapshot.model as Data).version, 7);assert.equal(JSON.stringify(row.snapshot.model), before);
    await validator.validate(dps.xml, "DPS_v1.01.xsd", "PRODUCAO");
  }
});
