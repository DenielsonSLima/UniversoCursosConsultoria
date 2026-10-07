// Isolated regression runner. No production credentials or live bank requests.
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync('tmp', { recursive: true });
const stage = process.argv[2] ?? 'all';
const run = (...args) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const stages = {
  worker() {
    run('--test',
      'supabase/tests/financial-correction-processor.test.ts',
      'supabase/tests/financial-correction-store.test.ts',
      'supabase/tests/financial-correction-worker-auth.test.ts');
  },
  sql() {
    run('--test', 'supabase/tests/bounded-bank-store.test.mjs',
      'supabase/tests/bounded-integration.test.mjs');
  },
  eligibility() {
    run('--test', 'supabase/tests/bounded-eligibility.test.mjs');
  },
  ui() {
    for (const file of [
      'bounded-correction.contract.test.mjs',
      'bounded-correction.dependencies.test.mjs',
      'bounded-correction.orchestrator.test.mjs',
      'bounded-local-waiver.contract.test.mjs',
      'bounded-correction.interaction.test.mjs',
    ]) run(`tests/${file}`);
  },
  bridge() {
    run('supabase/tests/bounded-export-preview.mjs');
    const syntheticId = number =>
      `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
    run('tests/check-bounded-correction-sql-preview.mjs',
      'tmp/actual-committed-sql-preview.json',
      ...[9, 6, 5, 2].map(syntheticId));
  },
};
if (stage === 'all') {
  for (const execute of Object.values(stages)) execute();
} else if (Object.hasOwn(stages, stage)) {
  stages[stage]();
} else {
  throw new Error(`Unknown test stage: ${stage}`);
}
