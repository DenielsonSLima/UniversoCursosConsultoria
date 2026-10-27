import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { build } = await import(process.env.ESBUILD_MODULE_PATH
  ? pathToFileURL(resolve(process.env.ESBUILD_MODULE_PATH)).href : 'esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'technical-cycle-regressions-'));
const entries = [
  'supabase/functions/technical-manual-cycle-issuance/authorization-error.test.ts',
  'supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts',
  'supabase/functions/technical-manual-cycle-issuance/contract.test.ts',
  'supabase/functions/secretaria-banese-document-groups/document-diagnostics.test.ts',
  'supabase/functions/secretaria-banese-document-groups/document-groups.test.ts',
  'modules/gestor/secretaria/carnes-alunos/carnes-alunos.diagnostics.test.ts',
];

try {
  const bundled = [];
  for (const [index, entry] of entries.entries()) {
    const outfile = join(temporary, `regression-${index}.test.mjs`);
    await build({
      entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile,
      banner: { js: "import nodeTest from 'node:test'; const Deno = { test: nodeTest };" },
    });
    bundled.push(outfile);
  }
  const result = spawnSync(process.execPath, ['--test',
    'supabase/tests/manual_cycle_authorization_replay.isolated.test.mjs',
    'modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-authorization-recovery.test.mjs',
    ...bundled,
  ], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
