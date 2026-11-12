import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import type { NationalDpsInput } from "../_shared/nfse-national/dps.types.ts";
import {
  NfseContractError,
  requireContract,
} from "../_shared/nfse-national/xml.ts";
import type { IndividualRow } from "./handler.ts";
import { queueDeclaredIbsCbs, queueIbsCbsSummary } from "./adapter-ibscbs.ts";
import { publicIndividualServiceLocation, resolveIndividualServiceLocation } from "./service-location.ts";
type Data = Record<string, unknown>;
const object = (v: unknown): Data =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const text = (v: unknown) => typeof v === "string" ? v : "";
const none = (v: unknown) => object(v).source === "NONE";
const decimalUnits = (value: unknown, code: string): bigint => {
  requireContract(
    typeof value === "string" &&
      /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value),
    code,
  );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const fromUnits = (units: bigint): string =>
  `${units / 100n}.${String(units % 100n).padStart(2, "0")}`;
function operationAmount(snapshot: Data, command: Data, rule: unknown): string {
  const code = "FISCAL_OPERATION_AMOUNT_REVIEW_REQUIRED";
  const amount = decimalUnits(command.amount, code);
  requireContract(amount > 0n, code);
  const source = object(snapshot.source), selected = object(command.source);
  requireContract(
    ["PARTNER_SERVICE", "ACADEMIC_QUEUE"].includes(text(source.kind)) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        text(source.id),
      ) &&
      source.kind === selected.kind && source.id === selected.id &&
      decimalUnits(source.sourceAmount, code) === amount,
    "FISCAL_OPERATION_SOURCE_REVIEW_REQUIRED",
  );
  const model = object(rule);
  requireContract(
    (model.source === "FIXED" &&
      decimalUnits(model.fixedAmount, "FISCAL_AMOUNT_MODEL_REVIEW_REQUIRED") ===
        amount) ||
      (model.source === "RECEIPTS" && model.fixedAmount === null),
    "FISCAL_AMOUNT_MODEL_MISMATCH",
  );
  return fromUnits(amount);
}
function percentage(value: unknown): string {
  const units = decimalUnits(value, "FISCAL_TRANSPARENCY_REVIEW_REQUIRED");
  requireContract(units <= 10000n, "FISCAL_TRANSPARENCY_REVIEW_REQUIRED");
  return fromUnits(units);
}
const months = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
export function individualFiscalDate(issuedAt: string): string {
  const value = new Date(issuedAt);
  requireContract(
    Number.isFinite(value.getTime()),
    "FISCAL_ISSUANCE_TIMESTAMP_INVALID",
  );
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function renderIndividualDescription(
  source: unknown,
  competence: unknown,
): string {
  const date = text(competence);
  let value = text(source).trim();
  requireContract(
    /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(date),
    "FISCAL_COMPETENCE_REQUIRED",
  );
  value = value.replaceAll(
    "{{mes_referencia}}",
    `${months[Number(date.slice(5, 7)) - 1]} de ${date.slice(0, 4)}`,
  );
  requireContract(
    value.length > 0 && value.length <= 2000 && !value.includes("{{") &&
      !value.includes("}}"),
    "FISCAL_DESCRIPTION_REVIEW_REQUIRED",
  );
  return value;
}
function queueDescription(
  snapshot: Data,
  definition: Data,
  command: Data,
): string {
  const source = object(snapshot.source);
  if (["PARTNER_SERVICE", "ACADEMIC_QUEUE"].includes(text(source.kind))) {
    const value = text(source.serviceDescription);
    requireContract(
      value === value.trim() && value.length > 0 && value.length <= 2000 &&
        !value.includes("{{") && !value.includes("}}"),
      "FISCAL_DESCRIPTION_REVIEW_REQUIRED",
    );
    return value;
  }
  return renderIndividualDescription(
    definition.serviceDescription,
    command.competenceDate,
  );
}
export function individualPublicPayload(row: IndividualRow): Data {
  const snapshot = object(row.snapshot),
    issuer = object(snapshot.issuer),
    cfg = object(snapshot.configuration);
  const model = object(snapshot.model),
    definition = object(model.definition),
    recipient = object(snapshot.recipient),
    command = object(snapshot.command);
  const totals = object(object(object(row.fiscalInput).values).totalTaxes);
  const snPercent = totals.mode === "SIMPLE_NATIONAL_PERCENTAGE" &&
      typeof totals.percentage === "string" &&
      /^(?:0|[1-9][0-9]{0,2})\.[0-9]{2}$/.test(totals.percentage) &&
      Number(totals.percentage) <= 100
    ? totals.percentage
    : null;
  return {
    issuerName: text(issuer.legalName) || text(issuer.name),
    issuerCnpj: text(issuer.cnpj).replace(/\D/g, ""),
    recipientName: text(recipient.name),
    recipientDocument: text(recipient.document),
    modelId: text(model.id),
    modelVersion: model.version,
    modelName: text(definition.name),
    amount: text(command.amount),
    competenceDate: text(command.competenceDate),
    serviceDate: text(command.serviceDate),
    series: row.series,
    nationalServiceCode: text(definition.nationalServiceCode),
    nbsCode: text(definition.nbsCode),
    serviceDescription: queueDescription(snapshot, definition, command),
    opSimpNac: text(cfg.opSimpNac),
    regApTribSN: cfg.regApTribSN ?? null,
    municipalityCode: text(cfg.municipalityCode),
    serviceLocation: publicIndividualServiceLocation(row),
    municipalRegistration: text(cfg.municipalRegistration) || null,
    simpleNationalTransparencyPercent: snPercent,
    ibsCbs: queueIbsCbsSummary(definition),
  };
}
function monetaryRule(rule: unknown, amount: string): string {
  const r = object(rule);
  const units = decimalUnits(r.value, "FISCAL_TRANSPARENCY_REVIEW_REQUIRED");
  if (r.source === "FIXED") {
    requireContract(r.base === null, "FISCAL_TRANSPARENCY_RULE_UNSUPPORTED");
    return fromUnits(units);
  }
  requireContract(
    r.source === "PERCENTAGE" && r.base === "SERVICE" && units <= 10000n,
    "FISCAL_TRANSPARENCY_RULE_UNSUPPORTED",
  );
  const result = (BigInt(amount.replace(".", "")) * units + 5000n) /
    10000n;
  return `${result / 100n}.${String(result % 100n).padStart(2, "0")}`;
}
function totals(
  values: Data,
  amount: string,
  sn: string,
): NationalDpsInput["values"]["totalTaxes"] {
  const t = object(values.transparency);
  if (t.mode === "AMOUNTS") {
    return {
      mode: "AMOUNTS",
      federal: monetaryRule(t.federal, amount),
      state: monetaryRule(t.state, amount),
      municipal: monetaryRule(t.municipal, amount),
    };
  }
  if (t.mode === "PERCENTAGES") {
    return {
      mode: "PERCENTAGES",
      federal: percentage(t.federalPercent),
      state: percentage(t.statePercent),
      municipal: percentage(t.municipalPercent),
    };
  }
  requireContract(
    t.mode === "SIMPLE_NATIONAL_PERCENTAGE" && sn === "3",
    "FISCAL_TRANSPARENCY_REVIEW_REQUIRED",
  );
  return {
    mode: "SIMPLE_NATIONAL_PERCENTAGE",
    percentage: percentage(t.simpleNationalPercent),
  };
}
/** Supported domestic subset only. Every missing or unsupported branch remains a visible review gate. */
export function buildIndividualDps(
  row: IndividualRow,
  recipientMunicipalityCode?: string,
): NationalDpsInput {
  const snapshot = object(row.snapshot),
    issuer = object(snapshot.issuer),
    cfg = object(snapshot.configuration),
    recipient = object(snapshot.recipient);
  const definition = object(object(snapshot.model).definition),
    command = object(snapshot.command),
    service = object(definition.serviceOptions);
  const people = object(definition.peopleOptions),
    values = object(definition.valuesOptions),
    additional = object(definition.additionalOptions);
  requireContract(
    /^(?:[1-9]\d{0,3}|[1-4]\d{4})$/.test(row.series),
    "PRODUCTION_API_SERIES_REQUIRED",
  );
  requireContract(
    command.competenceDate === command.serviceDate,
    "FISCAL_SERVICE_DATE_COMPETENCE_MISMATCH",
  );
  requireContract(
    definition.active === true && definition.nationalServiceCode === "080201" &&
      /^\d{9}$/.test(text(definition.nbsCode)),
    "FISCAL_SERVICE_MODEL_REVIEW_REQUIRED",
  );
  requireContract(
    definition.issTreatment === "TRIBUTAVEL",
    "INDIVIDUAL_ISS_TREATMENT_UNSUPPORTED",
  );
  const serviceLocation = resolveIndividualServiceLocation(definition, cfg);
  requireContract(
    serviceLocation?.countryCode === "BRA" &&
      /^\d{7}$/.test(serviceLocation.municipalityCode || "") &&
      (row.fiscalInput == null || object(object(row.fiscalInput).service).municipalityCode === serviceLocation.municipalityCode),
    "FISCAL_SERVICE_LOCATION_REVIEW_REQUIRED",
  );
  requireContract(
    (service.governmentPurchase == null ||
      service.governmentPurchase === false) &&
      service.governmentEntityType == null && service.operationType == null,
    "INDIVIDUAL_GOVERNMENT_OPERATION_UNSUPPORTED",
  );
  requireContract(values.version === 1, "FISCAL_VALUES_REVIEW_REQUIRED");
  requireContract(
    people.version === 2 && people.issuerRole === "PROVIDER" &&
      people.recipientSource === "AT_ISSUANCE" &&
      people.intermediarySource === "NONE",
    "FISCAL_PARTICIPANTS_STRATEGY_REVIEW_REQUIRED",
  );
  requireContract(
    people.dpsSeriesMode !== "CUSTOM" || people.dpsSeries === row.series,
    "FISCAL_MODEL_DPS_SERIES_MISMATCH",
  );
  requireContract(
    people.recipientAddressSource === "OMIT" ||
      (people.recipientAddressSource === "FROM_PARTNER" &&
        /^\d{7}$/.test(recipientMunicipalityCode || "")),
    "FISCAL_RECIPIENT_ADDRESS_RESOLUTION_REQUIRED",
  );
  if (people.competenceMode === "FIXED_DATE") {
    requireContract(
      people.competenceDate === command.competenceDate,
      "FISCAL_COMPETENCE_MODEL_MISMATCH",
    );
  } else {requireContract(
      people.competenceMode === "ISSUE_DATE" &&
        text(command.competenceDate) === individualFiscalDate(row.issuedAt),
      "FISCAL_COMPETENCE_MODEL_MISMATCH",
    );}
  const sn = people.simpleNationalOption === "FROM_ESTABLISHMENT"
    ? text(cfg.opSimpNac)
    : text(people.simpleNationalOption);
  const assessment = people.simpleNationalAssessment === "FROM_ESTABLISHMENT" ||
      (people.simpleNationalOption === "FROM_ESTABLISHMENT" &&
        people.simpleNationalAssessment === null)
    ? text(cfg.regApTribSN)
    : text(people.simpleNationalAssessment);
  requireContract(
    sn === "3" && assessment === "1",
    "INDIVIDUAL_SIMPLE_NATIONAL_PROFILE_UNSUPPORTED",
  );
  const iss = object(values.iss),
    regime = iss.specialTaxRegime === "FROM_ESTABLISHMENT"
      ? text(cfg.regEspTrib)
      : text(iss.specialTaxRegime);
  requireContract(
    regime === "0" && iss.retention === "NONE" &&
      iss.rateSource === "FROM_RULES" && iss.ratePercent === null &&
      iss.suspensionType === "NONE" && iss.suspensionProcessNumber === null &&
      iss.benefitId === null && none(iss.benefitReduction),
    "FISCAL_ISS_PROFILE_REVIEW_REQUIRED",
  );
  const amount = operationAmount(snapshot, command, values.serviceAmount);
  requireContract(
    none(values.intermediaryAmount) && none(values.unconditionalDiscount) &&
      none(values.conditionalDiscount) &&
      object(values.deduction).mode === "NONE" && values.rental === null,
    "INDIVIDUAL_DISCOUNTS_DEDUCTIONS_UNSUPPORTED",
  );
  const federal = object(values.federal);
  requireContract(
    federal.mode === "FROM_ESTABLISHMENT" && none(federal.withheldCp) &&
      none(federal.withheldIrrf) &&
      none(federal.withheldSocialContributions),
    "FISCAL_FEDERAL_RETENTIONS_REVIEW_REQUIRED",
  );
  const extraService = object(additional.service),
    extraPeople = object(additional.people);
  requireContract(
    Object.values(extraService).every((value) => value === null),
    "INDIVIDUAL_ADDITIONAL_SERVICE_UNSUPPORTED",
  );
  requireContract(
    extraPeople.providerPartner == null &&
      extraPeople.rejectedInvoiceReference == null &&
      (extraPeople.emissionReason == null ||
        extraPeople.emissionReason === "1"),
    "INDIVIDUAL_ADDITIONAL_PARTICIPANTS_UNSUPPORTED",
  );
  requireContract(
    ["technicalResponsibilityDocument", "referenceDocument", "orderReference"]
      .every((key) => !definition[key]),
    "INDIVIDUAL_DOCUMENT_REFERENCES_UNSUPPORTED",
  );
  const description = queueDescription(snapshot, definition, command);
  const ibscbs = queueDeclaredIbsCbs(definition, text(command.competenceDate));
  const result: NationalDpsInput = {
    environment: "PRODUCAO",
    purpose: "REGULAR",
    issuedAt: row.issuedAt,
    applicationVersion: "Universo-NFSe-Fila-1",
    series: row.series,
    number: row.number,
    competence: text(command.competenceDate),
    issuerMunicipalityCode: text(cfg.municipalityCode),
    issuer: {
      taxId: { type: "CNPJ", value: text(issuer.cnpj).replace(/\D/g, "") },
      simpleNationalOption: "3",
      simpleNationalAssessment: "1",
      specialTaxRegime: "0",
      ...(cfg.municipalRegistration
        ? { municipalRegistration: text(cfg.municipalRegistration) }
        : {}),
    },
    recipient: {
      taxId: {
        type: text(recipient.document).length === 11 ? "CPF" : "CNPJ",
        value: text(recipient.document),
      },
      name: text(recipient.name),
    },
    service: {
      municipalityCode: serviceLocation.municipalityCode!,
      nationalTaxCode: text(definition.nationalServiceCode),
      nbs: text(definition.nbsCode),
      description,
      ...(definition.complementaryInfo
        ? { complementaryInfo: text(definition.complementaryInfo) }
        : {}),
    },
    values: {
      serviceAmount: amount,
      issTaxation: "1",
      issRetention: "1",
      totalTaxes: totals(values, amount, sn),
    },
    review: {
      recipientConfirmed: true,
      competenceConfirmed: true,
      classificationConfirmed: true,
      ibscbs: ibscbs ? "DECLARED_CONFIRMED" : "NOT_APPLICABLE_CONFIRMED",
      federalRetentions: "NONE_CONFIRMED",
      deductionsAndDiscounts: "NONE_CONFIRMED",
    },
    ...(ibscbs ? { ibscbs } : {}),
  };
  if (people.recipientAddressSource === "FROM_PARTNER") {
    const address = object(recipient.address),
      postalCode = text(address.postalCode).replace(/\D/g, "");
    requireContract(
      /^\d{8}$/.test(postalCode) &&
        ["street", "number", "district"].every((key) =>
          text(address[key]).trim().length > 0
        ),
      "FISCAL_RECIPIENT_ADDRESS_REVIEW_REQUIRED",
    );
    result.recipient.address = {
      municipalityCode: recipientMunicipalityCode!,
      postalCode,
      street: text(address.street).trim(),
      number: text(address.number).trim(),
      district: text(address.district).trim(),
      ...(text(address.complement).trim()
        ? { complement: text(address.complement).trim() }
        : {}),
    };
  }
  return result;
}
export function assessIndividualDps(
  row: IndividualRow,
  recipientMunicipalityCode?: string,
): { available: boolean; reason: string | null } {
  try {
    buildNationalDps(buildIndividualDps(row, recipientMunicipalityCode));
    return { available: true, reason: null };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof NfseContractError
        ? error.code
        : "FISCAL_MODEL_REVIEW_REQUIRED",
    };
  }
}
