import type { IndividualRow } from "./handler.ts";

type Data = Record<string, unknown>;
const object = (value: unknown): Data => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const string = (value: unknown): string => typeof value === "string" ? value : "";
const municipality = (value: unknown): string | null => /^\d{7}$/.test(string(value)) ? value as string : null;
const indicator = (value: unknown): string | null => /^\d{6}$/.test(string(value)) ? value as string : null;
export interface IndividualServiceLocation {
  source: "ISSUER_ESTABLISHMENT" | "MODEL_FIXED" | "ISSUED_SNAPSHOT";
  countryCode: string;
  municipalityCode: string | null;
  modelMunicipalityCode: string | null;
  operationIndicatorCode: string | null;
}

/** Explicit Universo course rule; other indicators never inherit the issuing municipality. */
export function resolveIndividualServiceLocation(definition: unknown, configuration: unknown): IndividualServiceLocation | null {
  const model = object(definition), service = object(model.serviceOptions), people = object(model.peopleOptions);
  const countryCode = string(service.countryCode), fixed = municipality(service.municipalityCode);
  if (service.version !== 1 || !/^[A-Z]{3}$/.test(countryCode) || (countryCode === "BRA" && !fixed)) return null;
  const fromIssuer = countryCode === "BRA" && people.issuerRole === "PROVIDER" &&
    service.includeIbsCbs === true && service.governmentPurchase === false && model.operationIndicatorCode === "030101";
  const code = fromIssuer ? municipality(object(configuration).municipalityCode) : fixed;
  if ((countryCode === "BRA" && !code) || (countryCode !== "BRA" && fixed)) return null;
  return { source: fromIssuer ? "ISSUER_ESTABLISHMENT" : "MODEL_FIXED", countryCode,
    municipalityCode: code, modelMunicipalityCode: fixed, operationIndicatorCode: indicator(model.operationIndicatorCode) };
}

/** Prepared/issued facts always win; an original signed location is never recalculated. */
export function publicIndividualServiceLocation(row: IndividualRow): IndividualServiceLocation | null {
  const snapshot = object(row.snapshot), model = object(object(snapshot.model).definition);
  const fixed = municipality(object(model.serviceOptions).municipalityCode);
  if (row.fiscalInput !== null && row.fiscalInput !== undefined) {
    const code = municipality(object(object(row.fiscalInput).service).municipalityCode);
    return code ? { source: "ISSUED_SNAPSHOT", countryCode: "BRA", municipalityCode: code,
      modelMunicipalityCode: fixed, operationIndicatorCode: indicator(model.operationIndicatorCode) } : null;
  }
  return row.state === "PREVIEWED" ? resolveIndividualServiceLocation(model, snapshot.configuration) : null;
}
