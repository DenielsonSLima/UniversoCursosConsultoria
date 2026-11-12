import type { IndividualRow } from "./handler.ts";
import { reviewedDeclaredIbsFixture } from "./adapter.fixture.ts";

/** Synthetic municipal lecture snapshot. No real invoice, identity or signed bytes. */
export function reviewedMunicipalLectureFixture(): IndividualRow {
  const row = reviewedDeclaredIbsFixture();
  const definition = (row.snapshot.model as { definition: Record<string, unknown> }).definition;
  definition.name = "PALESTRA MUNICIPAL SINTÉTICA";
  definition.nbsCode = "122051900";
  definition.operationIndicatorCode = "030102";
  Object.assign(definition.serviceOptions as Record<string, unknown>, {
    governmentPurchase: true, governmentEntityType: "4", operationType: "1",
  });
  (definition.peopleOptions as Record<string, unknown>).recipientAddressSource = "FROM_PARTNER";
  (definition.additionalOptions as { people: Record<string, unknown> }).people.personalUse = false;
  const values = definition.valuesOptions as Record<string, unknown>;
  values.serviceAmount = { source: "RECEIPTS", fixedAmount: null };
  values.transparency = { mode: "SIMPLE_NATIONAL_PERCENTAGE", simpleNationalPercent: "12.00" };
  const source = row.snapshot.source as Record<string, unknown>;
  source.sourceAmount = "1000.00";
  source.serviceDescription = "CONTRATAÇÃO DE PALESTRA MUNICIPAL SINTÉTICA";
  (row.snapshot.command as Record<string, unknown>).amount = "1000.00";
  (row.snapshot.recipient as Record<string, unknown>).document = "00000000000272";
  return row;
}
