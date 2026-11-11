import type { IndividualRow } from "./handler.ts";
const none = () => ({ source: "NONE", value: null, base: null });
const fixed = (value: string) => ({ source: "FIXED", value, base: null });
export function reviewedIndividualFixture(): IndividualRow {
  return {
    previewId: "00000000-0000-0000-0000-000000000090",
    expiresAt: "2027-01-01T00:00:00Z",
    state: "PREVIEWED",
    dispatch: false,
    series: "49998",
    number: "1",
    issuedAt: "2026-11-10T12:00:00-03:00",
    dpsId: null,
    fiscalInput: null,
    signedDpsXml: null,
    result: null,
    configurationVersion: 3,
    certificateFingerprint: "a".repeat(64),
    authorizedXml: null,
    snapshot: {
      source: {
        kind: "PARTNER_SERVICE",
        id: "00000000-0000-0000-0000-000000000030",
        sourceAmount: "1.00",
        serviceDescription: "SERVIÇO novembro de 2026",
      },
      issuer: { cnpj: "00000000000100", name: "EMITENTE SINTÉTICO" },
      configuration: {
        municipalityCode: "2803401",
        municipalRegistration: "TESTE",
        opSimpNac: "3",
        regApTribSN: "1",
        regEspTrib: "0",
      },
      recipient: {
        name: "TOMADOR SINTÉTICO",
        document: "00000000191",
        address: {
          city: "JAPOATÃ",
          state: "SE",
          postalCode: "49950000",
          street: "RUA SINTÉTICA",
          number: "1",
          district: "CENTRO",
        },
      },
      command: {
        source: {
          kind: "PARTNER_SERVICE",
          id: "00000000-0000-0000-0000-000000000030",
        },
        amount: "1.00",
        competenceDate: "2026-11-10",
        serviceDate: "2026-11-10",
      },
      model: {
        id: "00000000-0000-0000-0000-000000000020",
        version: 1,
        definition: {
          name: "MODELO SINTÉTICO",
          active: true,
          nationalServiceCode: "080201",
          nbsCode: "122020000",
          serviceDescription: "SERVIÇO {{mes_referencia}}",
          issTreatment: "TRIBUTAVEL",
          complementaryInfo: "INFORMAÇÃO COMPLEMENTAR SINTÉTICA",
          serviceOptions: {
            version: 1,
            countryCode: "BRA",
            municipalityCode: "2803401",
            includeIbsCbs: false,
            governmentPurchase: null,
            governmentEntityType: null,
            operationType: null,
          },
          peopleOptions: {
            version: 2,
            issuerRole: "PROVIDER",
            recipientSource: "AT_ISSUANCE",
            recipientAddressSource: "OMIT",
            intermediarySource: "NONE",
            competenceMode: "ISSUE_DATE",
            dpsSeriesMode: "AUTOMATIC",
            dpsSeries: null,
            simpleNationalOption: "FROM_ESTABLISHMENT",
            simpleNationalAssessment: "FROM_ESTABLISHMENT",
          },
          valuesOptions: {
            version: 1,
            serviceAmount: { source: "FIXED", fixedAmount: "1.00" },
            intermediaryAmount: none(),
            unconditionalDiscount: none(),
            conditionalDiscount: none(),
            iss: {
              specialTaxRegime: "FROM_ESTABLISHMENT",
              retention: "NONE",
              rateSource: "FROM_RULES",
              ratePercent: null,
              suspensionType: "NONE",
              suspensionProcessNumber: null,
              benefitId: null,
              benefitReduction: none(),
            },
            deduction: { mode: "NONE", value: null, documents: [] },
            federal: {
              mode: "FROM_ESTABLISHMENT",
              withheldCp: none(),
              withheldIrrf: none(),
              withheldSocialContributions: none(),
            },
            ibscbs: null,
            rental: null,
            transparency: {
              mode: "AMOUNTS",
              federal: fixed("0.00"),
              state: fixed("0.00"),
              municipal: fixed("0.04"),
            },
          },
        },
      },
    },
  };
}

/** Synthetic snapshot matching the explicit choices in the reviewed production model. */
export function reviewedDeclaredIbsFixture(): IndividualRow {
  const row = reviewedIndividualFixture();
  const definition =
    (row.snapshot.model as { definition: Record<string, unknown> }).definition;
  const service = definition.serviceOptions as Record<string, unknown>;
  service.includeIbsCbs = true;
  service.governmentPurchase = false;
  const people = definition.peopleOptions as Record<string, unknown>;
  people.recipientIsDestination = true;
  people.destinationSource = null;
  people.simpleNationalAssessment = null;
  definition.operationIndicatorCode = "030101";
  definition.additionalOptions = { people: { personalUse: true }, service: {} };
  (definition.valuesOptions as Record<string, unknown>).ibscbs = {
    cst: "000",
    classificationCode: "000001",
    regularTaxation: null,
    deferral: null,
    presumedCreditCode: null,
    reimbursementDocuments: [],
  };
  return row;
}
