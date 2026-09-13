import { PROESC_V1_MAX_ROWS, type ProescV1AccountingPage, type ProescV1AccountingRow } from './v1-accounting.ts';
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
  const classes = new Set(classIds);
  const groups = new Map<string, ProescV1AccountingRow[]>();
  if (pages.some((page) => page.rows.length >= PROESC_V1_MAX_ROWS)) {
    throw new ProescError('A API alcançou o limite de uma página. A conferência completa não foi confirmada.', 409);
  }
  for (const page of pages) for (const row of page.rows) {
    const key = `${row.identity.unitId}:${row.externalKey}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const hashes = new Map<string, string>();
  const hashDocument = async (document: string | null) => {
    if (!document) return null;
    let hash = hashes.get(document);
    if (!hash) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document));
      hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
      hashes.set(document, hash);
    }
    return hash;
  };
  const result: CycleSourceObligation[] = [];
  for (const group of groups.values()) {
    const principals = group.filter((row) => row.blockId === '1');
    // Explicitly canceled principal is no longer an issued liability. Keep
    // mixed/unknown cancellation states for review instead of guessing.
    if (principals.length > 0 && principals.every((row) => row.cancelled === true)) continue;
    const groupClasses = new Set(group.map((row) => row.identity.classId));
    const documents = new Set(group.map((row) => row.identity.studentDocument));
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
          && row.renegotiationPayment === false);
      const latestDate = anonymous
        ? group.flatMap((row) => [row.dueDate, row.createdDate!]).sort().at(-1) : undefined;
      for (const classId of possibleClasses) for (const document of documents) {
        result.push({
          key: primary.externalKey, classId, personHash: await hashDocument(document),
          amountCents: Math.max(0, primary.amountCents), dueDate: primary.dueDate,
          createdDate: primary.createdDate, unsafe: true,
          ambiguity: groupClasses.has(null) ? 'MISSING_CLASS_ID' : 'CONFLICTING_IDENTITY',
          ...(latestDate ? { unidentifiedGroupLatestDate: latestDate } : {}),
        });
      }
      continue;
    }
    const classId = principals[0]?.identity.classId ?? group[0]?.identity.classId;
    if (!classId || !classes.has(classId)) continue;
    const primary = principals[0] ?? group[0];
    const unsafe = principals.length !== 1 || primary.amountCents <= 0 || group.some((row) => (
      row.cancelled !== false || row.renegotiationPayment !== false
      || row.identity.classId !== classId
      || row.identity.studentDocument !== primary.identity.studentDocument
      || row.dueDate !== primary.dueDate
      || row.issues.some((issue) => issue !== 'MISSING_STUDENT_DOCUMENT')
    ));
    result.push({
      key: primary.externalKey, classId,
      personHash: await hashDocument(primary.identity.studentDocument),
      amountCents: Math.max(0, primary.amountCents), dueDate: primary.dueDate,
      createdDate: primary.createdDate, unsafe,
    });
  }
  if (result.length > 50_000) throw new ProescError('Janela de conferência excedeu o limite automático.', 409);
  return result.sort((a, b) => a.classId.localeCompare(b.classId) || a.key.localeCompare(b.key));
}
