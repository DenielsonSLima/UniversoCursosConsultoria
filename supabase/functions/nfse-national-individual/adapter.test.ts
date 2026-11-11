import assert from "node:assert/strict";
import {
  assessIndividualDps,
  buildIndividualDps,
  individualPublicPayload,
} from "./adapter.ts";
import type { IndividualRow } from "./handler.ts";
import { reviewedIndividualFixture } from "./adapter.fixture.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
const fixed = (value: string) => ({ source: "FIXED", value, base: null });
const definition = (row: IndividualRow) =>
  (row.snapshot.model as { definition: Record<string, unknown> }).definition;
const values = (row: IndividualRow) =>
  definition(row).valuesOptions as Record<string, unknown>;
const command = (row: IndividualRow) =>
  row.snapshot.command as Record<string, unknown>;
Deno.test("public SN transparency reads only immutable prepared fiscal input, preserving historical totals modes", () => {
  const row = reviewedIndividualFixture();
  values(row).transparency = { mode: "SIMPLE_NATIONAL_PERCENTAGE", simpleNationalPercent: "99.00" };
  assert.equal(individualPublicPayload(row).simpleNationalTransparencyPercent, null);
  for (const percentage of ["12.00", "0.00", "100.00"]) {
    row.fiscalInput = { values: { totalTaxes: { mode: "SIMPLE_NATIONAL_PERCENTAGE", percentage } } };
    assert.equal(individualPublicPayload(row).simpleNationalTransparencyPercent, percentage);
  }
  for (const percentage of ["100.01", "-1.00", "12", "01.00", 12]) {
    row.fiscalInput = { values: { totalTaxes: { mode: "SIMPLE_NATIONAL_PERCENTAGE", percentage } } };
    assert.equal(individualPublicPayload(row).simpleNationalTransparencyPercent, null);
  }
  row.fiscalInput = { values: { totalTaxes: { mode: "AMOUNTS", municipal: "0.12" } } };
  assert.equal(individualPublicPayload(row).simpleNationalTransparencyPercent, null);
});
function queueAmount(row: IndividualRow, amount: string) {
  command(row).amount = amount;
  (row.snapshot.source as Record<string, unknown>).sourceAmount = amount;
}
Deno.test("basic legacy model stays reviewable and blocked with an explicit fiscal reason", () => {
  const row = reviewedIndividualFixture();
  delete definition(row).serviceOptions;
  delete definition(row).valuesOptions;
  assert.deepEqual(assessIndividualDps(row), {
    available: false,
    reason: "FISCAL_SERVICE_LOCATION_REVIEW_REQUIRED",
  });
  const payload = individualPublicPayload(row);
  assert.equal(payload.nationalServiceCode, "080201");
  assert.equal(payload.serviceDescription, "SERVIÇO novembro de 2026");
});
Deno.test("reviewed current model preserves explicit fiscal values and complementary info without inventing an ISS rate", () => {
  const row = reviewedIndividualFixture();
  const input = buildIndividualDps(row);
  assert.equal(input.values.issRate, undefined);
  assert.equal(input.issuer.simpleNationalAssessment, "1");
  assert.deepEqual(input.values.totalTaxes, {
    mode: "AMOUNTS",
    federal: "0.00",
    state: "0.00",
    municipal: "0.04",
  });
  assert.equal(
    input.service.complementaryInfo,
    "INFORMAÇÃO COMPLEMENTAR SINTÉTICA",
  );
  assert.equal(input.review.ibscbs, "NOT_APPLICABLE_CONFIRMED");
  assert.equal(input.ibscbs, undefined);
});
Deno.test("explicit SN3 with missing assessment does not inherit the establishment accidentally", () => {
  const row = reviewedIndividualFixture();
  (definition(row).peopleOptions as Record<string, unknown>)
    .simpleNationalOption = "3";
  (definition(row).peopleOptions as Record<string, unknown>)
    .simpleNationalAssessment = null;
  assert.equal(
    assessIndividualDps(row).reason,
    "INDIVIDUAL_SIMPLE_NATIONAL_PROFILE_UNSUPPORTED",
  );
});
Deno.test("persisted FROM_ESTABLISHMENT option with null assessment inherits only the confirmed configuration", () => {
  const row = reviewedIndividualFixture();
  const people = definition(row).peopleOptions as Record<string, unknown>;
  people.simpleNationalOption = "FROM_ESTABLISHMENT";
  people.simpleNationalAssessment = null;
  assert.equal(buildIndividualDps(row).issuer.simpleNationalAssessment, "1");
  (row.snapshot.configuration as Record<string, unknown>).regApTribSN = null;
  assert.equal(
    assessIndividualDps(row).reason,
    "INDIVIDUAL_SIMPLE_NATIONAL_PROFILE_UNSUPPORTED",
  );
});
Deno.test("address strategy resolves only through a supplied canonical municipality and keeps the captured address", () => {
  const row = reviewedIndividualFixture();
  (definition(row).peopleOptions as Record<string, unknown>)
    .recipientAddressSource = "FROM_PARTNER";
  assert.equal(
    assessIndividualDps(row).reason,
    "FISCAL_RECIPIENT_ADDRESS_RESOLUTION_REQUIRED",
  );
  const input = buildIndividualDps(row, "2803401");
  assert.equal(input.recipient.address?.municipalityCode, "2803401");
  assert.equal(input.recipient.address?.street, "RUA SINTÉTICA");
});
Deno.test("IBS, municipal fields, retentions and discount branches are never silently dropped", () => {
  for (
    const mutate of [
      (d: Record<string, unknown>) => {
        (d.serviceOptions as Record<string, unknown>).includeIbsCbs = true;
      },
      (d: Record<string, unknown>) => {
        d.additionalOptions = {
          service: { municipalServiceCode: { source: "FIXED", value: "001" } },
        };
      },
      (d: Record<string, unknown>) => {
        ((d.valuesOptions as Record<string, unknown>).iss as Record<
          string,
          unknown
        >).retention = "RECIPIENT";
      },
      (d: Record<string, unknown>) => {
        (d.valuesOptions as Record<string, unknown>).conditionalDiscount =
          fixed("0.01");
      },
    ]
  ) {
    const row = reviewedIndividualFixture();
    mutate(definition(row));
    assert.equal(assessIndividualDps(row).available, false);
  }
});
Deno.test("missing transparency blocks instead of copying historic ISS or zeroing taxes", () => {
  const row = reviewedIndividualFixture();
  delete (definition(row).valuesOptions as Record<string, unknown>)
    .transparency;
  assert.equal(
    assessIndividualDps(row).reason,
    "FISCAL_TRANSPARENCY_REVIEW_REQUIRED",
  );
});

Deno.test("fiscal competence uses Sao Paulo date across UTC midnight", () => {
  const row = reviewedIndividualFixture();
  row.issuedAt = "2026-11-11T01:30:00Z";
  assert.equal(buildIndividualDps(row).competence, "2026-11-10");
});

Deno.test("normal queue uses canonical RECEIPTS amount and scales only the explicit transparency rule", () => {
  for (
    const [amount, estimated] of [
      ["1.00", "0.04"],
      ["260.00", "10.09"],
      ["279.90", "10.86"],
      ["1000.00", "38.80"],
      ["0.01", "0.00"],
    ]
  ) {
    const row = reviewedIndividualFixture();
    row.series = "42";
    queueAmount(row, amount);
    values(row).serviceAmount = { source: "RECEIPTS", fixedAmount: null };
    values(row).transparency = {
      mode: "AMOUNTS",
      federal: fixed("0"),
      state: fixed("0"),
      municipal: { source: "PERCENTAGE", base: "SERVICE", value: "3.88" },
    };
    const input = buildIndividualDps(row);
    assert.equal(input.values.serviceAmount, amount);
    assert.equal(input.series, "42");
    assert.equal(input.values.issRate, undefined);
    assert.deepEqual(input.values.totalTaxes, {
      mode: "AMOUNTS",
      federal: "0.00",
      state: "0.00",
      municipal: estimated,
    });
    assert.equal(
      buildNationalDps(input).xml.includes(`<vServ>${amount}</vServ>`),
      true,
    );
  }
});
Deno.test("queue descriptions come from the immutable prepared source rather than re-rendering the model", () => {
  const row = reviewedIndividualFixture();
  (row.snapshot.source as Record<string, unknown>).serviceDescription =
    "DESCRIÇÃO LITERAL DO SERVIÇO PREPARADO";
  definition(row).serviceDescription = "MODELO {{mes_referencia}}";
  assert.equal(
    buildIndividualDps(row).service.description,
    "DESCRIÇÃO LITERAL DO SERVIÇO PREPARADO",
  );
  assert.equal(
    individualPublicPayload(row).serviceDescription,
    "DESCRIÇÃO LITERAL DO SERVIÇO PREPARADO",
  );
  (row.snapshot.source as Record<string, unknown>).serviceDescription =
    "{{mes_referencia}}";
  assert.equal(
    assessIndividualDps(row).reason,
    "FISCAL_DESCRIPTION_REVIEW_REQUIRED",
  );
});

Deno.test("fixed principal amounts remain supported and never override a different canonical preparation", () => {
  const row = reviewedIndividualFixture();
  queueAmount(row, "260.00");
  values(row).serviceAmount = { source: "FIXED", fixedAmount: "260" };
  assert.equal(buildIndividualDps(row).values.serviceAmount, "260.00");
  values(row).serviceAmount = { source: "FIXED", fixedAmount: "1.00" };
  assert.equal(assessIndividualDps(row).reason, "FISCAL_AMOUNT_MODEL_MISMATCH");
});

Deno.test("canonical queue identity and amount are required; unsupported sources never become silent amounts", () => {
  for (
    const mutate of [
      (row: IndividualRow) => {
        delete row.snapshot.source;
      },
      (row: IndividualRow) => {
        (row.snapshot.source as Record<string, unknown>).sourceAmount = "2.00";
      },
      (row: IndividualRow) => {
        command(row).source = {
          kind: "ACADEMIC_QUEUE",
          id: "00000000-0000-0000-0000-000000000030",
        };
      },
      (row: IndividualRow) => {
        command(row).source = {
          kind: "PARTNER_SERVICE",
          id: "00000000-0000-0000-0000-000000000031",
        };
      },
      (row: IndividualRow) => {
        values(row).serviceAmount = { source: "RECEIPTS", fixedAmount: "1.00" };
      },
      (row: IndividualRow) => {
        values(row).serviceAmount = {
          source: "AT_ISSUANCE",
          fixedAmount: null,
        };
      },
    ]
  ) {
    const row = reviewedIndividualFixture();
    mutate(row);
    assert.equal(assessIndividualDps(row).available, false);
  }
  const academic = reviewedIndividualFixture();
  (academic.snapshot.source as Record<string, unknown>).kind = "ACADEMIC_QUEUE";
  (command(academic).source as Record<string, unknown>).kind = "ACADEMIC_QUEUE";
  values(academic).serviceAmount = { source: "RECEIPTS", fixedAmount: null };
  assert.equal(buildIndividualDps(academic).values.serviceAmount, "1.00");
});

Deno.test("principal amount must be positive canonical money and API series stays within 1 to 49999", () => {
  for (const amount of ["0.00", "-1.00", "1e3", "NaN", "1.001", "01.00"]) {
    const row = reviewedIndividualFixture();
    queueAmount(row, amount);
    assert.equal(assessIndividualDps(row).available, false);
  }
  for (const series of ["0", "50000", "70000", "^1$"]) {
    const row = reviewedIndividualFixture();
    row.series = series;
    assert.equal(
      assessIndividualDps(row).reason,
      "PRODUCTION_API_SERIES_REQUIRED",
    );
  }
  const custom = reviewedIndividualFixture();
  const people = definition(custom).peopleOptions as Record<string, unknown>;
  people.dpsSeriesMode = "CUSTOM";
  people.dpsSeries = "42";
  assert.equal(
    assessIndividualDps(custom).reason,
    "FISCAL_MODEL_DPS_SERIES_MISMATCH",
  );
  people.dpsSeries = custom.series;
  assert.equal(assessIndividualDps(custom).available, true);
});

Deno.test("transparency normalizes reviewed decimals and rejects invalid percentages or different bases", () => {
  const row = reviewedIndividualFixture();
  values(row).transparency = {
    mode: "PERCENTAGES",
    federalPercent: "0",
    statePercent: "0.0",
    municipalPercent: "3.88",
  };
  assert.deepEqual(buildIndividualDps(row).values.totalTaxes, {
    mode: "PERCENTAGES",
    federal: "0.00",
    state: "0.00",
    municipal: "3.88",
  });
  for (const value of ["100.01", "-1", "1e2", "3.888"]) {
    values(row).transparency = {
      mode: "AMOUNTS",
      federal: fixed("0"),
      state: fixed("0"),
      municipal: { source: "PERCENTAGE", base: "SERVICE", value },
    };
    assert.equal(assessIndividualDps(row).available, false);
  }
  values(row).transparency = {
    mode: "AMOUNTS",
    federal: fixed("0"),
    state: fixed("0"),
    municipal: { source: "PERCENTAGE", base: "TOTAL_OPERATION", value: "3.88" },
  };
  assert.equal(
    assessIndividualDps(row).reason,
    "FISCAL_TRANSPARENCY_RULE_UNSUPPORTED",
  );
});

Deno.test("competence represents the service start date; different dates remain a visible unsupported review", () => {
  const row = reviewedIndividualFixture();
  const input = buildIndividualDps(row);
  const xml = buildNationalDps(input).xml;
  assert.equal(xml.includes("<dCompet>2026-11-10</dCompet>"), true);
  assert.equal(xml.includes("dPrestacao"), false);
  command(row).serviceDate = "2026-11-09";
  assert.equal(
    assessIndividualDps(row).reason,
    "FISCAL_SERVICE_DATE_COMPETENCE_MISMATCH",
  );
});

Deno.test("omitted issuer municipal registration is public null and stays absent from the same prepared fiscal input", () => {
  const row = reviewedIndividualFixture();
  (row.snapshot.configuration as Record<string, unknown>)
    .municipalRegistration = "";
  const fiscalBefore = buildIndividualDps(row);
  assert.equal(individualPublicPayload(row).municipalRegistration, null);
  assert.equal("municipalRegistration" in fiscalBefore.issuer, false);
  assert.deepEqual(buildIndividualDps(row), fiscalBefore);
});
