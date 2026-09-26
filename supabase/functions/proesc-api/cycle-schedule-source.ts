import type { ProescV1AccountingPage } from './v1-accounting.ts';
import { projectCyclePage, type CycleEvidencePage } from './cycle-page-evidence.ts';
import { ProescError } from './contract.ts';

export interface CycleSourceObligation {
  key: string;
  classId: string;
  personHash: string | null;
  amountCents: number;
  dueDate: string;
  createdDate: string | null;
  unsafe: boolean;
  ambiguity?: 'MISSING_CLASS_ID' | 'CONFLICTING_IDENTITY';
  unidentifiedGroupLatestDate?: string;
}

export async function cycleSourceObligations(
  pages: ProescV1AccountingPage[], classIds: string[],
): Promise<CycleSourceObligation[]> {
  const projected = await Promise.all(pages.map(async (page) => ({
    unitId: page.source.unitId, rows: await projectCyclePage(page),
  })));
  return cycleEvidenceObligations(projected, classIds);
}

export function cycleEvidenceObligations(
  pages: Array<Pick<CycleEvidencePage, 'unitId' | 'rows'>>, classIds: string[],
): CycleSourceObligation[] {
  const classes = new Set(classIds);
  type Row = { externalKey: string; principal: boolean; amountCents: number; classId: string | null;
    personHash: string | null; dueDate: string; createdDate: string | null;
    cancelled: boolean | null; renegotiation: boolean | null; unsafeIssue: boolean };
  const groups = new Map<string, Row[]>();
  for (const page of pages) for (const tuple of page.rows) {
    const [externalKey, principal, amountCents, classId, personHash, dueDate, createdDate,
      cancelled, renegotiation, unsafeIssue] = tuple;
    const key = `${page.unitId}:${externalKey}`;
    const group = groups.get(key) ?? [];
    group.push({ externalKey, principal, amountCents, classId, personHash, dueDate, createdDate,
      cancelled, renegotiation, unsafeIssue });
    groups.set(key, group);
  }
  const result: CycleSourceObligation[] = [];
  for (const group of groups.values()) {
    const principals = group.filter((row) => row.principal);
    // Explicitly canceled principal is no longer an issued liability. Keep
    // mixed/unknown cancellation states for review instead of guessing.
    if (principals.length > 0 && principals.every((row) => row.cancelled === true)) continue;
    const groupClasses = new Set(group.map((row) => row.classId));
    const documents = new Set(group.map((row) => row.personHash));
    if (groupClasses.has(null) || groupClasses.size > 1 || documents.size > 1) {
      // Preserve the ambiguity by possible owner, rather than dropping an
      // obligation or failing every unrelated enrollment in the whole unit.
      // A null person remains a class-wide blocker in the SQL evaluator.
      const possibleClasses = groupClasses.has(null) ? [...classes]
        : [...groupClasses].filter((id): id is string => id !== null && classes.has(id));
      const primary = principals[0] ?? group[0];
      // Only a wholly anonymous, otherwise coherent group can be considered
      // outside a class that did not exist at any of its observed dates.
      const anonymous = groupClasses.size === 1 && groupClasses.has(null)
        && documents.size === 1 && documents.has(null) && principals.length === 1
        && group.every((row) => row.createdDate !== null && row.cancelled === false
          && row.renegotiation === false);
      const latestDate = anonymous
        ? group.flatMap((row) => [row.dueDate, row.createdDate!]).sort().at(-1) : undefined;
      for (const classId of possibleClasses) for (const document of documents) {
        result.push({
          key: primary.externalKey, classId, personHash: document,
          amountCents: Math.max(0, primary.amountCents), dueDate: primary.dueDate,
          createdDate: primary.createdDate, unsafe: true,
          ambiguity: groupClasses.has(null) ? 'MISSING_CLASS_ID' : 'CONFLICTING_IDENTITY',
          ...(latestDate ? { unidentifiedGroupLatestDate: latestDate } : {}),
        });
      }
      continue;
    }
    const classId = principals[0]?.classId ?? group[0]?.classId;
    if (!classId || !classes.has(classId)) continue;
    const primary = principals[0] ?? group[0];
    const unsafe = principals.length !== 1 || primary.amountCents <= 0 || group.some((row) => (
      row.cancelled !== false || row.renegotiation !== false
      || row.classId !== classId
      || row.personHash !== primary.personHash
      || row.dueDate !== primary.dueDate
      || row.unsafeIssue
    ));
    result.push({
      key: primary.externalKey, classId,
      personHash: primary.personHash,
      amountCents: Math.max(0, primary.amountCents), dueDate: primary.dueDate,
      createdDate: primary.createdDate, unsafe,
    });
  }
  if (result.length > 50_000) throw new ProescError('Janela de conferência excedeu o limite automático.', 409);
  return result.sort((a, b) => a.classId.localeCompare(b.classId) || a.key.localeCompare(b.key));
}
