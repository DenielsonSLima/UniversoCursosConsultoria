import { NfseContractError } from '../../services/nfse.errors';

type Check = (value: unknown) => unknown;
const fail = (): never => { throw new NfseContractError(); };
export const choice = (values: readonly unknown[]): Check => value => values.includes(value) ? value : fail();
export const optional = (check: Check): Check => value => value === null ? null : check(value);
export const text = (max: number, pattern?: RegExp): Check => value => {
  if (typeof value !== 'string') return fail();
  const normalized = value.trim();
  return normalized && normalized.length <= max && (!pattern || pattern.test(normalized)) ? normalized : fail();
};
export const object = (fields: Record<string, Check>, extra: Record<string, Check> = {}): Check => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => !(key in row)) || Object.keys(row).some(key => !(key in fields) && !(key in extra))) return fail();
  return Object.fromEntries([...Object.entries(fields).map(([key, check]) => [key, check(row[key])]),
    ...Object.entries(extra).filter(([key]) => key in row).map(([key, check]) => [key, check(row[key])])]);
};
export const array = (check: Check, max: number): Check => value => {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) return fail();
  return value.map(check);
};
export const rule = (check: Check): Check => value => {
  const parsed = object({ source: choice(['FIXED', 'AT_ISSUANCE']), value: item => item })(value) as { source: string; value: unknown };
  if (parsed.source === 'AT_ISSUANCE') return parsed.value === null ? parsed : fail();
  return { source: 'FIXED', value: check(parsed.value) };
};
export const uuid = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const accessKey = text(50, /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/);
export const date: Check = value => {
  const parsed = text(10, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)(value) as string;
  const timestamp = new Date(`${parsed}T00:00:00Z`);
  return !parsed.startsWith('0000') && Number.isFinite(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === parsed ? parsed : fail();
};
export const address = object({ postalCode: text(11), street: text(255), number: text(60),
  complement: optional(text(156)), district: optional(text(60)), city: optional(text(60)), stateProvince: optional(text(60)) });
const identification = (construction: boolean): Check => value => {
  const parsed = object({ kind: choice(construction ? ['WORK_CODE', 'CIB', 'ADDRESS'] : ['CIB', 'ADDRESS']),
    ...(construction ? { workCode: optional(text(30)) } : {}), cib: optional(text(8, /^.{8}$/)), address: optional(address) })(value) as Record<string, unknown>;
  if ((parsed.kind === 'CIB') !== (parsed.cib !== null) || (parsed.kind === 'ADDRESS') !== (parsed.address !== null)
    || (construction && (parsed.kind === 'WORK_CODE') !== (parsed.workCode !== null))) return fail();
  return parsed;
};
export const construction = object({ propertyTaxRegistration: optional(text(30)), identification: identification(true) });
export const propertyUnits: Check = value => {
  const units = array(object({ unitKey: uuid, propertyTaxRegistration: optional(text(30)), identification: identification(false) }), 99)(value) as { unitKey: string }[];
  return new Set(units.map(unit => unit.unitKey)).size === units.length ? units : fail();
};
export const event: Check = value => {
  const parsed = object({ description: text(255), startDate: date, endDate: date,
    identification: object({ kind: choice(['MUNICIPAL_ID', 'ADDRESS']), municipalId: optional(text(30)), address: optional(address) }) })(value) as {
      startDate: string; endDate: string; identification: { kind: string; municipalId: unknown; address: unknown } };
  const id = parsed.identification;
  return parsed.startDate <= parsed.endDate && (id.kind === 'MUNICIPAL_ID') === (id.municipalId !== null)
    && (id.kind === 'ADDRESS') === (id.address !== null) ? parsed : fail();
};
export const nif: Check = value => {
  const parsed = object({ policy: choice(['FROM_PARTNER', 'REQUIRE_NIF', 'WITHOUT_NIF']), absenceReason: optional(choice(['1', '2'])) })(value) as { policy: string; absenceReason: unknown };
  return (parsed.policy === 'WITHOUT_NIF') === (parsed.absenceReason !== null) ? parsed : fail();
};
export const references: Check = value => {
  const rows = array(accessKey, 99)(value) as string[];
  return new Set(rows).size === rows.length ? rows : fail();
};
export const foreignTrade = object({ provisionMode: choice(['1', '2', '3', '4']), relationship: choice(['0', '1', '2', '3', '4', '5', '6', '9']),
  currencyCode: text(3, /^[0-9]{3}$/), serviceAmount: rule(text(18, /^(0|[1-9][0-9]{0,14})\.[0-9]{2}$/)),
  providerSupport: choice(['01', '02', '03', '04', '05', '06', '07', '08']), recipientSupport: text(2, /^(0[1-9]|1[0-9]|2[0-6])$/),
  temporaryGoods: choice(['1', '2', '3']), importDeclaration: optional(rule(text(12))), exportRegistration: optional(rule(text(12))),
  shareWithMdic: choice([true, false]) });
