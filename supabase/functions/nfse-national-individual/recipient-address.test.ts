import assert from "node:assert/strict";
import { assertRecipientAddress } from "./recipient-address.ts";
import { reviewedMunicipalLectureFixture } from "./adapter-government.fixture.ts";
import { assessIndividualDps, buildIndividualDps } from "./adapter.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";

Deno.test("address validation identifies missing fields without inventing a number", () => {
  const address = { postalCode: "49000-000", street: "Rua de teste", number: "12", district: "Centro" };
  assert.doesNotThrow(() => assertRecipientAddress(address));
  for (const [field, code] of Object.entries({ postalCode: "POSTAL_CODE", street: "STREET", number: "ADDRESS_NUMBER", district: "DISTRICT" })) {
    for (const value of [null, "", "   "]) {
      assert.throws(() => assertRecipientAddress({ ...address, [field]: value }), { message: `FISCAL_RECIPIENT_${code}_REQUIRED` });
    }
  }
  assert.equal(address.number, "12");
});

Deno.test("explicit S/N survives DPS construction but absent number remains blocked", () => {
  const row = reviewedMunicipalLectureFixture();
  const address = (row.snapshot.recipient as { address: Record<string, unknown> }).address;
  address.number = "S/N";
  assert.deepEqual(assessIndividualDps(row, "2803401"), { available: true, reason: null });
  const xml = buildNationalDps(buildIndividualDps(row, "2803401")).xml;
  assert(xml.includes("<nro>S/N</nro>"));
  address.number = "00";
  assert(buildNationalDps(buildIndividualDps(row, "2803401")).xml.includes("<nro>00</nro>"));
  address.number = null;
  assert.deepEqual(assessIndividualDps(row, "2803401"), { available: false, reason: "FISCAL_RECIPIENT_ADDRESS_NUMBER_REQUIRED" });
});
