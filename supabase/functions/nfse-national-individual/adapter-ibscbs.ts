import type { NationalDpsInput } from "../_shared/nfse-national/dps.types.ts";
import { NATIONAL_IBSCBS_CLASSIFICATIONS } from "../_shared/nfse-national/ibscbs-classifications.generated.ts";
import { date, requireContract } from "../_shared/nfse-national/xml.ts";
type Data = Record<string, unknown>;
const object = (value: unknown): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
const nullableText = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Restricted municipal lecture profile; payment after supply or advance for future supply. */
export function supportedMunicipalGovernmentPurchase(definition: Data): boolean {
  const service = object(definition.serviceOptions), people = object(definition.peopleOptions);
  const ibs = object(object(definition.valuesOptions).ibscbs);
  const extra = object(object(definition.additionalOptions).people);
  return definition.nationalServiceCode === "080201" && definition.nbsCode === "122051900" &&
    definition.operationIndicatorCode === "030102" && service.includeIbsCbs === true &&
    service.governmentPurchase === true && service.governmentEntityType === "4" &&
    (service.operationType === "1" || service.operationType === "4") &&
    people.version === 2 && people.issuerRole === "PROVIDER" && people.recipientSource === "AT_ISSUANCE" &&
    people.recipientAddressSource === "FROM_PARTNER" && people.intermediarySource === "NONE" &&
    people.recipientIsDestination === true && people.destinationSource === null && extra.personalUse === false &&
    ibs.cst === "000" && ibs.classificationCode === "000001";
}

/** Read-only review uses exactly the choices in the immutable server model snapshot. */
export function queueIbsCbsSummary(definition: Data) {
  const service = object(definition.serviceOptions),
    people = object(definition.peopleOptions);
  const ibs = object(object(definition.valuesOptions).ibscbs),
    extra = object(object(definition.additionalOptions).people);
  return typeof service.includeIbsCbs !== "boolean" ? null : {
    included: service.includeIbsCbs,
    cst: nullableText(ibs.cst),
    classificationCode: nullableText(ibs.classificationCode),
    operationIndicatorCode: nullableText(definition.operationIndicatorCode),
    recipientSameAsAcquirer: typeof people.recipientIsDestination === "boolean"
      ? people.recipientIsDestination
      : null,
    personalUse: typeof extra.personalUse === "boolean"
      ? extra.personalUse
      : null,
    governmentPurchase: typeof service.governmentPurchase === "boolean"
      ? service.governmentPurchase
      : null,
  };
}

/** Domestic same-recipient subset; chosen classifications are checked against the full pinned catalog. */
export function queueDeclaredIbsCbs(
  definition: Data,
  competence: string,
): NationalDpsInput["ibscbs"] {
  const service = object(definition.serviceOptions),
    people = object(definition.peopleOptions);
  const values = object(definition.valuesOptions),
    extra = object(object(definition.additionalOptions).people);
  requireContract(
    typeof service.includeIbsCbs === "boolean",
    "FISCAL_IBSCBS_REVIEW_REQUIRED",
  );
  if (!service.includeIbsCbs) {
    requireContract(values.ibscbs === null, "FISCAL_IBSCBS_REVIEW_REQUIRED");
    return undefined;
  }
  const governmentPurchase = service.governmentPurchase === true;
  requireContract(
    supportedMunicipalGovernmentPurchase(definition) || (service.governmentPurchase === false &&
      service.governmentEntityType == null &&
      service.operationType == null),
    "FISCAL_GOVERNMENT_OPERATION_UNSUPPORTED",
  );
  requireContract(
    people.recipientIsDestination === true && people.destinationSource == null,
    "FISCAL_IBSCBS_DESTINATION_REVIEW_REQUIRED",
  );
  requireContract(
    typeof extra.personalUse === "boolean",
    "FISCAL_IBSCBS_PERSONAL_USE_REVIEW_REQUIRED",
  );
  const ibs = object(values.ibscbs);
  const competenceDate = date(competence);
  const classification = NATIONAL_IBSCBS_CLASSIFICATIONS.find((row) =>
    row.cst === ibs.cst &&
    row.classificationCode === ibs.classificationCode && row.nfse &&
    [row.cstValidFrom, row.validFrom].every((start: string | null) =>
      start === null || start.slice(0, 10) <= competenceDate
    ) &&
    [row.cstValidUntil, row.validUntil].every((end: string | null) =>
      end === null || end.slice(0, 10) >= competenceDate
    )
  );
  requireContract(
    classification,
    "FISCAL_IBSCBS_CLASSIFICATION_REVIEW_REQUIRED",
  );
  requireContract(
    !classification.regularTaxationRequired &&
      !classification.deferralRequired &&
      ibs.regularTaxation === null && ibs.deferral === null &&
      ibs.presumedCreditCode === null &&
      Array.isArray(ibs.reimbursementDocuments) &&
      ibs.reimbursementDocuments.length === 0,
    "FISCAL_IBSCBS_DEPENDENT_GROUP_UNSUPPORTED",
  );
  requireContract(
    typeof definition.operationIndicatorCode === "string" &&
      /^\d{6}$/.test(definition.operationIndicatorCode),
    "FISCAL_IBSCBS_OPERATION_INDICATOR_REQUIRED",
  );
  return {
    personalUse: extra.personalUse ? "1" : "0",
    operationCode: definition.operationIndicatorCode,
    recipientIsAcquirer: true,
    cst: String(ibs.cst),
    classificationCode: String(ibs.classificationCode),
    ...(governmentPurchase ? { governmentPurchase: {
      operationType: service.operationType as "1" | "4", entityType: "4",
    } } : {}),
  };
}
