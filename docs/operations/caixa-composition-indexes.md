# Caixa composition lookup indexes

Status: both proposed indexes applied with CONCURRENTLY on 2026-10-07.
Exact definitions and valid/ready/live flags were verified. Authenticated
end-to-end Caixa smoke remains pending; lookup plans alone do not establish
full-RPC recovery or a user-facing latency improvement.

## Scope

The existing net-discount guard looks up the latest observation by source
identity, ordered by observed_at, recorded_at and id. Existing run-leading
and link-leading indexes do not directly match this access path.

Add only the exact source-identity index and latest completed-FULL-run
index. Preserve financial functions, immutable evidence, ACL/RLS, timeout
settings, retry policy and PDF calculations. Include every observation
status: a newer REVIEW or UNLINKED observation must still supersede older
compatible evidence. Do not include wide normalized JSON in the index.

## Explicit manifest

- docs/operations/sql/caixa-composition-invoice-index.concurrent.sql
- docs/operations/sql/caixa-composition-full-run-index.concurrent.sql
- supabase/tests/proesc_composition_lookup_indexes.isolated.test.mjs
- supabase/tests/proesc_paid_net_discount_rule.isolated.test.mjs
- docs/operations/caixa-composition-indexes.md
- internal/versioning/system-version.json
- internal/versioning/CHANGELOG.md

## Nontransactional application

The two SQL files intentionally live outside supabase/migrations. Each
contains exactly one CREATE INDEX CONCURRENTLY statement. Execute each
separately in a verified top-level autocommit route, never in BEGIN/COMMIT,
a function/DO block or a multi-command transactional batch. Never replace
CONCURRENTLY with write-blocking CREATE INDEX as a fallback.

Ordinary migration replay does not automatically reconstruct these two
indexes. A new environment requires this explicit nontransactional step.
Do not fabricate migration-history entries or move these statements into
a transactional migration queue without a verified execution design.

Before execution, review actual lookup definitions, exact index drift,
equivalent indexes, invalid builds, competing DDL, old transactions,
relation size and operational resource budget. If an exact valid equivalent
already exists, reuse it. A same-name object with a different definition
is a blocker; do not hide it with IF NOT EXISTS.

CONCURRENTLY allows ordinary writes during construction but still consumes
CPU, I/O, WAL and storage and may wait on transactions. Database size and
healthy status do not measure free disk. Keep bounded statement/lock waits
appropriate to the verified execution route; do not silently raise limits.

Build the invoice-source index first, verify its exact definition and
indisvalid/indisready/indislive flags, then build and verify the partial
FULL/COMPLETE-run index. If the outcome is uncertain, inspect catalog and
progress before any retry. Cancellation may leave an INVALID index.

Only with explicit recovery authority and no active build, remove a
task-created invalid index using DROP INDEX CONCURRENTLY in a separate
autocommit call. Never drop an unrelated or reused existing index.

## Verification

- Both isolated suites pass. The financial suite preserves 44 negative
  guards, resolver metadata/ACL, documentary priority, NULL components and
  immutable evidence. The lookup suite uses 30,000 synthetic observations
  and checks output parity, empty/repeated reads, source identity, newer
  unlinked/review observations and timestamp/UUID tie-breaks.
- The synthetic lookup changes from a historical scan plus Sort to an
  ordered index lookup returning one row. Completed FULL selection keeps
  its predicate and descending timestamp/UUID order.
- PGlite cannot validate concurrent construction. Tests replace only
  CREATE INDEX CONCURRENTLY with CREATE INDEX locally; keys and predicates
  remain identical. This is semantic validation, not a production build
  concurrency or storage-pressure test.
- The production statements completed in separate concurrent calls.
  Both exact indexes were verified valid, ready and live with no active
  build. Unforced lookup plans used the new indexes without Sort, including
  the full observation-row access used by the financial function.
- No financial record, function body, source evidence, grant or RLS policy
  was changed by this operation. No migration-history entry was fabricated.

Remaining acceptance: authenticated Caixa load/retry, populated and empty
months, global/polo scope and repeat reads. Do not bypass RPC authorization
guards. No full-RPC parity, Safari smoke or application-wide performance
claim follows from focused lookup measurements.

## Rollback

Only if authorized, remove only the indexes created by this change, each
with a separate DROP INDEX CONCURRENTLY statement after verifying no build
is active. The names are internal_proesc.proesc_v2_invoice_source_latest
and internal_proesc.proesc_v2_runs_full_complete_latest. This changes access
paths without changing financial records or calculation semantics.
