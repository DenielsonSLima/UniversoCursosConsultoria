// Review-only SQL: deliberately outside Supabase automatic migrations.
// Tests execute these files only inside their isolated in-memory PGlite instance.
import { readdirSync } from 'node:fs';

export const boundedDraftDirectory = new URL(
  '../review-drafts/bounded-financial-correction/', import.meta.url,
);
const drafts = readdirSync(boundedDraftDirectory)
  .filter(name => /^\d\d_.*\.draft\.sql$/.test(name)).sort();
const expected = Array.from({ length: 14 }, (_, index) =>
  String(index + 1).padStart(2, '0'));
if (drafts.length !== 14 || drafts.some((name, index) =>
  !name.startsWith(`${expected[index]}_`))) {
  throw new Error('Expected exactly the 14 ordered bounded review drafts.');
}

// Base SQL fixtures cover phases 01–13. Phase 14 requires the genuine native
// eligibility prerequisites and is exercised only by its dedicated suite.
export function boundedDraftFiles({ through = 13 } = {}) {
  if (![5, 13, 14].includes(through)) throw new Error('Unknown review draft phase.');
  return drafts.filter(name => Number(name.slice(0, 2)) <= through);
}
