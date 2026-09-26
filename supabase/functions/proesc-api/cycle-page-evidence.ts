import { object, ProescError } from './contract.ts';
import { PROESC_V1_MAX_ROWS, type ProescV1AccountingPage } from './v1-accounting.ts';

// Preserve every row and its multiplicity. Filtering cancelled/ambiguous rows
// before the whole window is assembled would discard cross-month conflicts.
export type CycleEvidenceRow = [
  key: string, principal: boolean, amountCents: number, classId: string | null,
  personHash: string | null, dueDate: string, createdDate: string | null,
  cancelled: boolean | null, renegotiation: boolean | null, unsafeIssue: boolean,
];
export type CycleEvidencePage = {
  unitId: string; year: number; month: number; observedAt: string;
  rows: CycleEvidenceRow[]; hash: string;
};
export const CYCLE_PAGE_TTL_MS = 300_000;
export const CYCLE_PAGE_MAX_BYTES = 2_000_000;
const invalid = (): never => { throw new ProescError('A evidência da janela de consulta está incompleta. Confira novamente.', 409); };
const identifier = (value: unknown) => typeof value === 'string' && /^[0-9]{1,80}$/.test(value) && /[1-9]/.test(value);
export const cyclePageHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const date = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const flag = (value: unknown) => value === null || typeof value === 'boolean';
export const cyclePageFresh = (page: Pick<CycleEvidencePage, 'observedAt'>, now: number) => (
  Date.parse(page.observedAt) > now - CYCLE_PAGE_TTL_MS && Date.parse(page.observedAt) <= now + 5_000
);

function rows(value: unknown): CycleEvidenceRow[] {
  if (!Array.isArray(value) || value.length >= PROESC_V1_MAX_ROWS
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > CYCLE_PAGE_MAX_BYTES) invalid();
  for (const row of value as unknown[]) {
    if (!Array.isArray(row) || row.length !== 10 || !identifier(row[0])
      || typeof row[1] !== 'boolean' || !Number.isSafeInteger(row[2])
      || (row[3] !== null && !identifier(row[3])) || (row[4] !== null && !cyclePageHash(row[4]))
      || !date(row[5]) || (row[6] !== null && !date(row[6]))
      || !flag(row[7]) || !flag(row[8]) || typeof row[9] !== 'boolean') invalid();
  }
  return value as CycleEvidenceRow[];
}

export async function projectCyclePage(page: ProescV1AccountingPage): Promise<CycleEvidenceRow[]> {
  if (page.rows.length >= PROESC_V1_MAX_ROWS) invalid();
  const hashes = new Map<string, string>();
  const projected: CycleEvidenceRow[] = [];
  for (const row of page.rows) {
    if (row.identity.unitId !== page.source.unitId) invalid();
    const document = row.identity.studentDocument;
    let personHash: string | null = null;
    if (document) {
      personHash = hashes.get(document) ?? null;
      if (!personHash) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document));
        personHash = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        hashes.set(document, personHash);
      }
    }
    projected.push([row.externalKey, row.blockId === '1', row.amountCents, row.identity.classId,
      personHash, row.dueDate, row.createdDate, row.cancelled, row.renegotiationPayment,
      row.issues.some((issue) => issue !== 'MISSING_STUDENT_DOCUMENT')]);
  }
  return rows(projected);
}

export function parseCycleSavedPages(
  value: unknown, context: { unitId: string; tokenRevision: string; firstYear: number; lastYear: number }, now: number,
): CycleEvidencePage[] {
  const result = object(value);
  if (result.version !== 1 || result.unitId !== context.unitId || result.tokenRevision !== context.tokenRevision
    || !Array.isArray(result.pages) || result.pages.length > 72
    || new TextEncoder().encode(JSON.stringify(result.pages)).byteLength > 8_100_000) invalid();
  const seen = new Set<string>();
  return (result.pages as unknown[]).map((raw) => {
    const page = object(raw);
    const year = page.year, month = page.month;
    if (!Number.isInteger(year) || Number(year) < context.firstYear || Number(year) > context.lastYear
      || !Number.isInteger(month) || Number(month) < 1 || Number(month) > 12
      || typeof page.observedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(page.observedAt)
      || !Number.isFinite(Date.parse(page.observedAt))
      || Date.parse(page.observedAt) > now + 5_000 || !cyclePageHash(page.hash)) invalid();
    const key = `${year}:${month}`;
    if (seen.has(key)) invalid();
    seen.add(key);
    return { unitId: context.unitId, year: Number(year), month: Number(month),
      observedAt: page.observedAt as string, rows: rows(page.rows), hash: page.hash as string };
  }).filter((page) => cyclePageFresh(page, now));
}
